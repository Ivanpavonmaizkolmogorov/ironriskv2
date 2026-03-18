"""CSV Parser — validates and transforms uploaded CSV into trade dicts."""

import io
import csv
from typing import List, Tuple

import numpy as np


# Columns we expect (MT4/MT5 Strategy Tester format)
REQUIRED_COLUMNS = {"profit"}
OPTIONAL_COLUMNS = {"commission", "swap", "exit_time", "close_time", "date", "type", "magic"}


def parse_csv(file_content: bytes) -> Tuple[List[dict], dict]:
    """Parse a CSV file into a list of trade dicts + summary stats.

    Returns:
        trades: List of dicts with at least 'pnl' key
        summary: Dict with total_trades, net_profit, gauss_params, equity_curve
    """
    text = file_content.decode("utf-8-sig")  # Handle BOM
    reader = csv.DictReader(io.StringIO(text), delimiter="\t")

    # Try tab-delimited first, then comma
    if reader.fieldnames is None or len(reader.fieldnames) <= 1:
        reader = csv.DictReader(io.StringIO(text), delimiter=",")

    if reader.fieldnames is None:
        raise ValueError("Could not parse CSV: no headers found")

    # Normalize headers to lowercase
    reader.fieldnames = [h.strip().lower().replace(" ", "_") for h in reader.fieldnames]

    # Check for 'profit' column
    if "profit" not in reader.fieldnames:
        raise ValueError(
            f"CSV must contain a 'profit' column. Found: {reader.fieldnames}"
        )

    trades: List[dict] = []
    for row in reader:
        try:
            profit = float(row.get("profit", 0) or 0)
            commission = float(row.get("commission", 0) or 0)
            swap = float(row.get("swap", 0) or 0)
        except (ValueError, TypeError):
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

    summary = {
        "total_trades": len(trades),
        "net_profit": float(np.sum(pnls)),
        "gauss_params": gauss_params,
        "equity_curve": [
            {"trade": i + 1, "equity": eq} for i, eq in enumerate(equity_curve)
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
