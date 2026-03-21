"""CSV Parser — validates and transforms uploaded CSV into trade dicts."""

import io
import csv
import logging
from typing import List, Tuple

import numpy as np

logger = logging.getLogger("ironrisk")

# Columns we expect (MT4/MT5 Strategy Tester format)
REQUIRED_COLUMNS = {"profit"}
OPTIONAL_COLUMNS = {"commission", "swap", "exit_time", "close_time", "date", "type", "magic"}


def parse_csv(file_content: bytes, column_mapping: dict | None = None) -> Tuple[List[dict], dict]:
    """Parse a CSV file into a list of trade dicts + summary stats.

    Args:
        file_content: Raw bytes of the CSV file
        column_mapping: Optional dict mapping our field names to CSV column names,
                        e.g. {"profit": "Beneficio", "commission": "Comisión"}

    Returns:
        trades: List of dicts with at least 'pnl' key
        summary: Dict with total_trades, net_profit, gauss_params, equity_curve
    """
    text = file_content.decode("utf-8-sig")  # Handle BOM
    logger.info(f"CSV raw length: {len(text)} chars, first 200: {repr(text[:200])}")

    # Try tab-delimited first, then semicolon, then comma
    for delim, delim_name in [("\t", "tab"), (";", "semicolon"), (",", "comma")]:
        reader = csv.DictReader(io.StringIO(text), delimiter=delim)
        if reader.fieldnames and len(reader.fieldnames) > 1:
            logger.info(f"Detected delimiter: {delim_name} ({len(reader.fieldnames)} columns)")
            break
    else:
        # Last attempt with comma
        reader = csv.DictReader(io.StringIO(text), delimiter=",")
        if reader.fieldnames:
            logger.info(f"Fallback to comma delimiter ({len(reader.fieldnames)} columns)")

    if reader.fieldnames is None:
        raise ValueError("Could not parse CSV: no headers found")

    logger.info(f"Raw headers: {reader.fieldnames}")

    # Normalize headers to lowercase and strip quotes
    reader.fieldnames = [h.strip(' "\'').replace(" ", "_").lower() for h in reader.fieldnames]
    logger.info(f"Normalized headers: {reader.fieldnames}")

    # Apply column mapping — build a reverse map: csv_column_name -> our_field_name
    rename_map: dict[str, str] = {}
    if column_mapping:
        logger.info(f"Column mapping provided: {column_mapping}")
        for our_field, csv_col in column_mapping.items():
            csv_col_normalized = csv_col.strip(' "\'').replace(" ", "_").lower()
            rename_map[csv_col_normalized] = our_field
        # Rename fieldnames using the mapping
        reader.fieldnames = [rename_map.get(h, h) for h in reader.fieldnames]
        logger.info(f"Mapped headers: {reader.fieldnames}")

    # Check for 'profit' column
    if "profit" not in reader.fieldnames:
        raise ValueError(
            f"CSV must contain a 'profit' column. Found: {reader.fieldnames}"
        )

    trades: List[dict] = []
    skipped = 0
    for row in reader:
        try:
            profit = float(row.get("profit", 0) or 0)
            commission = float(row.get("commission", 0) or 0)
            swap = float(row.get("swap", 0) or 0)
        except (ValueError, TypeError):
            skipped += 1
            continue  # Skip malformed rows

        trade = {
            "pnl": profit + commission + swap,
            "profit": profit,
            "commission": commission,
            "swap": swap,
            "exit_time": row.get("exit_time") or row.get("close_time") or row.get("date"),
            "type": row.get("type", ""),
            "magic": row.get("magic", ""),
        }
        trades.append(trade)

    logger.info(f"Parsed {len(trades)} trades, skipped {skipped} malformed rows")

    if not trades:
        raise ValueError("CSV contains no valid trade data")

    # Build summary
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

    summary = {
        "total_trades": len(trades),
        "net_profit": float(np.sum(pnls)),
        "worst_daily_loss": worst_daily_loss,
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
