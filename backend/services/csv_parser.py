"""CSV Parser — validates and transforms uploaded CSV into trade dicts."""

import io
import logging
from typing import List, Tuple
import pandas as pd
import numpy as np

logger = logging.getLogger("ironrisk")

# These keywords hint that a row is actually the table header
HEADER_FINGERPRINTS = {"profit", "beneficio", "pnl", "net_profit", "swap", "comisión", "commission", "comision", "símbolo", "symbol"}

def _get_clean_dataframe(file_content: bytes, filename: str) -> pd.DataFrame:
    """Loads a file into a DataFrame, finding the actual header row."""
    df = None
    ext = (filename or "").lower().split('.')[-1]
    
    is_zip = file_content.startswith(b'PK')
    
    # Pre-decode for text-based formats (MT5 uses UTF-16 for XML/HTML usually)
    content_str = None
    if not is_zip:
        # If there are null bytes in ASCII range, it's highly likely UTF-16
        encodings = ['utf-16le', 'utf-16', 'utf-8-sig', 'latin1'] if b'\x00' in file_content[:100] else ['utf-8-sig', 'utf-16le', 'utf-16', 'latin1']
        for encoding in encodings:
            try:
                content_str = file_content.decode(encoding, errors='strict')
                break
            except Exception:
                continue
        if not content_str:
            content_str = file_content.decode('latin1', errors='replace') # absolute fallback

    content_lower = content_str[:2000].lower() if content_str else ""
    is_xml_ss = '<workbook' in content_lower and 'office:spreadsheet' in content_lower
    is_html = '<html' in content_lower or '<table' in content_lower

    # Attempt 1: Native Excel (Only if it's actually a ZIP/XLSX file)
    if is_zip or ext in ['xlsx', 'xls']:
        try:
            df = pd.read_excel(io.BytesIO(file_content), header=None)
        except ImportError as e:
            if "openpyxl" in str(e).lower():
                raise ValueError("openpyxl is missing. Please restart your uvicorn backend to load the newly installed dependency.")
            raise
        except Exception as e:
            logger.warning(f"pd.read_excel failed: {type(e).__name__}: {e}")

    # Attempt 2: HTML Table (MT4 / MT5 fake Excel)
    if (df is None or len(df) == 0) and (is_html or ext in ['htm', 'html']):
        try:
            html_to_parse = content_str if content_str else file_content.decode('utf-8', errors='ignore')
            
            # MT5 HTML inserts an inline "comment" cell (EA name) as <td colspan="8"> inside each data row.
            # This makes data rows have 22 effective columns vs 14 in the header, breaking alignment.
            # Fix: use lxml to DROP cells with colspan >= 3 (comment cells).
            # We KEEP colspan=2 (Balance/Profit in the last position) and colspan >= 13 (section headers).
            try:
                from lxml import html as lxml_html
                from lxml import etree as lxml_etree
                tree = lxml_html.fromstring(html_to_parse.encode('utf-8'))
                for td in tree.xpath('//td[@colspan] | //th[@colspan]'):
                    try:
                        cs = int(td.get('colspan', '1'))
                        # Drop comment cells (colspan 3-12). Keep colspan=2 (profit) and >=13 (section headers).
                        if 3 <= cs <= 12:
                            td.drop_tree()
                    except (ValueError, TypeError):
                        pass
                html_to_parse = lxml_etree.tostring(tree, encoding='unicode')
            except Exception as lxml_err:
                logger.warning(f"lxml cleanup failed ({lxml_err}), falling back to raw HTML")
            
            dfs = pd.read_html(io.StringIO(html_to_parse), header=None, keep_default_na=False)
            if dfs:
                df = max(dfs, key=len)
        except Exception:
            pass

    # Attempt 3: MetaTrader 5 XML Spreadsheet 2003 (Saved as .xlsx/.xls)
    if (df is None or len(df) == 0) and is_xml_ss and content_str:
        try:
            # Transform XML Spreadsheet to valid HTML table format for Pandas
            html_str = content_str.replace('<Row', '<tr').replace('</Row>', '</tr>')
            html_str = html_str.replace('<Cell', '<td').replace('</Cell>', '</td>')
            html_str = html_str.replace('<Data', '<div').replace('</Data>', '</div>')
            html_str = "<table>" + html_str + "</table>"
            dfs = pd.read_html(io.StringIO(html_str), keep_default_na=False)
            if dfs:
                df = max(dfs, key=len)
        except Exception:
            pass

    # Attempt 4: CSV (UTF-16 MT5 standard or UTF-8)
    if (df is None or len(df) == 0) and not is_zip and not is_xml_ss and not is_html and content_str:
        # Try tab first, MT5 uses it heavily
        for p_sep in ['\t', ';', ',']:
            try:
                dft = pd.read_csv(io.StringIO(content_str), header=None, sep=p_sep)
                if len(dft.columns) > 1: 
                    df = dft
                    break
            except Exception:
                continue

    if df is None or len(df) == 0:
        # DUMP THE RAW FILE TO DISK SO WE CAN INSPECT IT
        try:
            with open('failed_upload_debug.bin', 'wb') as f:
                f.write(file_content)
        except Exception as e:
            logger.error(f"Failed to dump debug file: {e}")
            
        snippet = (content_str or "")[:100].replace('\n', ' ').replace('\r', '')
        raise ValueError(f"Unrecognizable format. Snippet: '{snippet}'. Tried Excel, HTML, XML and CSV.")
                
    # 2. Find ALL header rows
    headers_found = []
    for i in range(len(df)):
        row_str = " ".join([str(x).lower().strip() for x in df.iloc[i].dropna() if str(x).strip()])
        matches = sum(1 for f in HEADER_FINGERPRINTS if f in row_str)
        if matches >= 2:
            headers_found.append(i)
            
    # 3. Identify the Trades section by looking for BOTH Profit and a duplicated Time column!
    # - Live Accounts have Orders (0 profit), Deals (1 time, has profit), Positions (2 times, has profit -> CORRECT)
    # - Strategy Testers have Deals (2 times, has profit -> CORRECT), Orders (0 profit)
    profit_keywords = ['profit', 'beneficio', 'lucro', 'gewinn', 'pnl', 'bénéfice', 'b/°', 'profitto', 'прибыль']
    valid_deals_headers = []
    
    for h in headers_found:
        raw_cols = [str(x).lower().strip() for x in df.iloc[h].tolist()]
        has_profit = any(any(k in col for k in profit_keywords) for col in raw_cols)
        # Check for duplicate column names (e.g. two 'Fecha/Hora' or two 'Time' columns = open+close time)
        non_empty = [c for c in raw_cols if c and c not in ('', 'nan')]
        has_exit_time = len(non_empty) != len(set(non_empty))
        
        if has_profit and has_exit_time:
            valid_deals_headers.append(h)
    
    if valid_deals_headers:
        # We prefer the one that has BOTH profit and exit time
        header_idx = valid_deals_headers[0] # Matches 'Positions' in Live, and 'Deals' in Backtest (where Open Pos is at bottom)
    else:
        # Fallback to just profit
        profit_only_headers = [h for h in headers_found if any(any(k in str(x).lower().strip() for k in profit_keywords) for x in df.iloc[h].tolist())]
        if profit_only_headers:
            header_idx = profit_only_headers[0]
        else:
            header_idx = headers_found[0]
    # 3. Apply raw headers and resolve duplicates
    raw_columns = [str(x).strip() if pd.notna(x) and str(x).strip() != "" else f"Unnamed_{j}" for j, x in enumerate(df.iloc[header_idx].tolist())]
    
    unique_cols = []
    seen = {}
    for col in raw_columns:
        if col in seen:
            unique_cols.append(f"{col}_{seen[col]}")
            seen[col] += 1
        else:
            seen[col] = 1
            unique_cols.append(col)
            
    df.columns = unique_cols
    df = df.iloc[header_idx + 1:].reset_index(drop=True)
    
    # 4. TRUNCATE BOTTOM TABLES (MT4/5 appends summaries at the bottom)
    # Rule: "a la primera fila k no sea una fecha en la primera columna zas, hay un cambio de tabla"
    # We find the first row where the first column contains NO digits (e.g. empty, or "Balance:")
    if len(df.columns) > 0 and len(df) > 0:
        first_col = df.columns[0]
        # True if it contains at least 1 digit (dates, tickets). False for NaN, empty string, or text like 'Summary'.
        mask_has_digits = df[first_col].astype(str).str.contains(r'\d', na=False) 
        
        invalid_indices = df[~mask_has_digits].index
        if len(invalid_indices) > 0:
            cutoff = invalid_indices[0]
            logger.info(f"Truncating bottom tables at row {cutoff}. Reason: '{df.iloc[cutoff][first_col]}' is not data.")
            df = df.iloc[:cutoff]

    return df

def extract_file_headers(file_content: bytes, filename: str) -> list[str]:
    """Returns the clean headers of a file for the frontend matching UI."""
    df = _get_clean_dataframe(file_content, filename)
    return df.columns.tolist()

def parse_csv(file_content: bytes, filename: str, column_mapping: dict | None = None) -> Tuple[List[dict], dict]:
    """Parse a File (CSV/Excel/HTML) into a list of trade dicts + summary stats.
    
    MT5 Positions table structure (FIXED, language-agnostic):
        Col 0: OpenTime | Col 1: Ticket | Col 2: Symbol | Col 3: Type | Col 4: Volume
        Col 5: OpenPrice | Col 6: SL | Col 7: TP | Col 8: CloseTime | Col 9: ClosePrice
        Col 10: Commission | Col 11: Swap | Col 12: Profit
    """
    
    df = _get_clean_dataframe(file_content, filename)
    logger.info(f"Loaded DataFrame with {len(df)} rows, {len(df.columns)} cols. Columns: {df.columns.tolist()}")

    # --- MT5 POSITIONAL DETECTION ---
    # MT5 Positions tables ALWAYS have 13+ columns and duplicate header names (open/close time, open/close price).
    # Instead of trusting column names (which change per language), we use FIXED column positions.
    is_mt5_positions = False
    col_names = df.columns.tolist()
    non_empty_cols = [c for c in col_names if not str(c).startswith('Unnamed')]
    
    if len(non_empty_cols) >= 12:
        # Check for duplicate column names (e.g., Fecha/Hora + Fecha/Hora_1, Time + Time_1)
        # Our deduplication suffixes duplicates with _1, _2 etc.
        base_names = [c.rsplit('_', 1)[0] for c in non_empty_cols]
        has_duplicates = len(base_names) != len(set(base_names))
        if has_duplicates:
            is_mt5_positions = True
            logger.info("Detected MT5 Positions table — using positional extraction (language-agnostic)")
    
    trades: List[dict] = []
    skipped = 0
    
    if is_mt5_positions:
        # POSITIONAL EXTRACTION: cols 8=exit_time, 10=commission, 11=swap, 12=profit
        # These indices are FIXED in MT5 regardless of language (EN/ES/DE/RU/etc.)
        for i in range(len(df)):
            try:
                raw_profit = str(df.iloc[i, 12]).replace('\xa0', '').replace(' ', '')
                profit = float(raw_profit)
                if pd.isna(profit):
                    continue
                raw_comm = str(df.iloc[i, 10]).replace('\xa0', '').replace(' ', '')
                raw_swap = str(df.iloc[i, 11]).replace('\xa0', '').replace(' ', '')
                commission = float(raw_comm) if raw_comm and raw_comm != 'nan' else 0.0
                swap = float(raw_swap) if raw_swap and raw_swap != 'nan' else 0.0
            except (ValueError, TypeError, IndexError):
                skipped += 1
                continue

            exit_time = str(df.iloc[i, 8]) if 8 < len(df.columns) else ""
            trade_type = str(df.iloc[i, 3]) if 3 < len(df.columns) else ""
            
            trade = {
                "pnl": profit + commission + swap,
                "profit": profit,
                "commission": commission,
                "swap": swap,
                "exit_time": exit_time if exit_time != 'nan' else "",
                "type": trade_type if trade_type != 'nan' else "",
                "magic": "",
            }
            trades.append(trade)
    else:
        # FALLBACK: column-name based mapping (for generic CSV files)
        if column_mapping:
            rename_map = {csv_col: our_field for our_field, csv_col in column_mapping.items()}
            df = df.rename(columns=rename_map)
            logger.info(f"Mapped headers (user): {df.columns.tolist()}")
        else:
            # Auto-detect common generic columns when uploading via drag & drop without wizard
            auto_map = {}
            for col in df.columns:
                col_lower = str(col).lower().strip()
                if col_lower in ["profit/loss", "profit", "beneficio", "pnl", "net profit", "net_profit"]:
                    auto_map[col] = "profit"
                elif col_lower in ["close time", "exit time", "fecha/hora_1", "time_1", "time.1", "cierre", "exit"]:
                    auto_map[col] = "exit_time"
            if auto_map:
                df = df.rename(columns=auto_map)
                logger.info(f"Mapped headers (auto): {df.columns.tolist()}")

        if "profit" not in df.columns:
            raise ValueError(f"File must contain a 'profit' column. Found: {df.columns.tolist()}")

        for i, row in df.iterrows():
            try:
                profit = float(row.get("profit", 0) or 0)
                if pd.isna(profit):
                    continue
                commission = float(row.get("commission", 0) if pd.notna(row.get("commission")) else 0)
                swap = float(row.get("swap", 0) if pd.notna(row.get("swap")) else 0)
            except (ValueError, TypeError):
                skipped += 1
                continue

            ts = row.get("exit_time") or row.get("close_time") or row.get("date")
            trade = {
                "pnl": profit + commission + swap,
                "profit": profit,
                "commission": commission,
                "swap": swap,
                "exit_time": str(ts) if pd.notna(ts) else "",
                "type": str(row.get("type", "")) if pd.notna(row.get("type")) else "",
                "magic": str(row.get("magic", "")) if pd.notna(row.get("magic")) else "",
            }
            trades.append(trade)

    logger.info(f"Parsed {len(trades)} trades, skipped {skipped} malformed rows")

    if not trades:
        raise ValueError("File contains no valid trade profit data")

    pnls = np.array([t["pnl"] for t in trades], dtype=np.float64)
    equity_curve = np.cumsum(pnls).tolist()

    # Gaussian parameters for the bell curve
    gauss_params = {
        "mean": float(np.mean(pnls)),
        "std": float(np.std(pnls)),
        "median": float(np.median(pnls)),
        "skewness": float(_skewness(pnls)),
        "kurtosis": float(_kurtosis(pnls)),
        "min": float(np.min(pnls)),
        "max": float(np.max(pnls)),
        "count": len(pnls),
    }

    # Worst daily loss: group trades by date and find the worst day
    worst_daily_loss = 0.0
    daily_pnl: dict[str, float] = {}
    for t in trades:
        date_str = t.get("exit_time") or t.get("date") or ""
        day_key = date_str[:10] if date_str else "unknown"  # YYYY-MM-DD or first 10 chars
        daily_pnl[day_key] = daily_pnl.get(day_key, 0.0) + t["pnl"]
    if daily_pnl:
        worst_daily_loss = abs(min(daily_pnl.values()))
    logger.info(f"Worst daily loss: {worst_daily_loss:.2f}")

    # Extract last trade date for start_date default
    last_trade_date = None
    for t in reversed(trades):
        d = t.get("exit_time") or t.get("date")
        if d:
            last_trade_date = d
            break

    summary = {
        "total_trades": len(trades),
        "net_profit": float(np.sum(pnls)),
        "worst_daily_loss": worst_daily_loss,
        "last_trade_date": last_trade_date,
        "gauss_params": gauss_params,
        "equity_curve": [
            {
                "trade": i + 1,
                "equity": eq,
                "date": trades[i].get("exit_time") or None,
            }
            for i, eq in enumerate(equity_curve)
        ],
    }

    return trades, summary


def _skewness(arr: np.ndarray) -> float:
    """Manual skewness (avoid scipy dependency)."""
    n = len(arr)
    if n < 3:
        return 0.0
    mean = np.mean(arr)
    std = np.std(arr, ddof=1)
    if std == 0:
        return 0.0
    return float((n / ((n - 1) * (n - 2))) * np.sum(((arr - mean) / std) ** 3))


def _kurtosis(arr: np.ndarray) -> float:
    """Manual excess kurtosis."""
    n = len(arr)
    if n < 4:
        return 0.0
    mean = np.mean(arr)
    std = np.std(arr, ddof=1)
    if std == 0:
        return 0.0
    m4 = np.mean((arr - mean) ** 4)
    return float(m4 / (std ** 4) - 3)
