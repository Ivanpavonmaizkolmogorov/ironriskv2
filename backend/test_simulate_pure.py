import logging
import traceback
import sys
import os

logging.basicConfig(level=logging.INFO)
sys.path.append(os.getcwd())

from services.csv_parser import parse_csv

try:
    with open('failed_html_debug.bin', 'rb') as f:
        content = f.read()

    # The mapping the user actually sent via React UI
    mapping = {
        'profit': 'Beneficio',
        'exit_time': 'Fecha/Hora_1',
        'commission': 'Comisi¾n',
        'swap': 'Swap'
    }
    
    print("Testing parse_csv with mapping:", mapping)
    trades, summary = parse_csv(content, 'test.html', column_mapping=mapping)
    print(f"Parsed {len(trades)} trades.")
    
    csv_pnl = [t['pnl'] for t in trades]
    if not csv_pnl:
        print("ERROR: No positive or negative profit found in parsed CSV")
    else:
        print("SUCCESS! PnL List:", csv_pnl[:10])

except Exception as e:
    print("CRASHED!")
    traceback.print_exc()
