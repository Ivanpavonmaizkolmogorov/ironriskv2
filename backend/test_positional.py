"""Just HTML test."""
import sys, os, warnings
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.append(os.getcwd())
warnings.filterwarnings('ignore')
import logging; logging.basicConfig(level=logging.INFO)

from services.csv_parser import parse_csv

trades, summary = parse_csv(open('failed_html_debug.bin', 'rb').read(), 'Report.html', column_mapping=None)
pnls = [t['pnl'] for t in trades]
commissions = sum(t['commission'] for t in trades)
swaps = sum(t['swap'] for t in trades)
profits = sum(t['profit'] for t in trades)
total = commissions + swaps + profits

print(f"HTML Trades:     {len(trades)}")
print(f"HTML Commission: {commissions:.2f}")
print(f"HTML Swap:       {swaps:.2f}")
print(f"HTML Profit:     {profits:.2f}")
print(f"HTML TOTAL:      {total:.2f}")
print(f"HTML Net PnL:    {summary['net_profit']:.2f}")
print(f"HTML EV/trade:   {summary['gauss_params']['mean']:.2f}")
print(f"HTML Match:      {'OK' if abs(total - 22135.45) < 1 else 'MISMATCH!'}")
