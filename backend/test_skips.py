import traceback, sys, os, io
sys.path.append(os.getcwd())
import pandas as pd
from services.csv_parser import _get_clean_dataframe

def test_skips():
    f='failed_html_debug.bin'
    content=open(f, 'rb').read()
    
    # Manually run _get_clean_dataframe to get df and mapping
    df = _get_clean_dataframe(content, 'test.html')
    mapping = {'profit': 'Beneficio', 'exit_time': 'Fecha/Hora_1', 'commission': 'Comisión'}
    
    skipped = []
    parsed = []
    
    for i, row in df.iterrows():
        try:
            profit_raw = str(row.get(mapping.get('profit', 'profit'), ''))
            exit_time_raw = str(row.get(mapping.get('exit_time', 'exit_time'), ''))
            
            pnl_clean = profit_raw.replace(' ', '').replace(',', '.')
            if not pnl_clean or pnl_clean == 'nan' or pd.isna(profit_raw):
                skipped.append((i, "No Profit", profit_raw, exit_time_raw, row.to_dict()))
                continue
            
            float(pnl_clean)
            
            if not exit_time_raw or exit_time_raw == 'nan' or pd.isna(exit_time_raw):
                skipped.append((i, "No Exit Time", profit_raw, exit_time_raw, row.to_dict()))
                continue
                
            parsed.append(i)
        except Exception as e:
            skipped.append((i, f"Exception {e}", profit_raw, exit_time_raw, row.to_dict()))
            
    print(f"Skipped {len(skipped)}. Parsed {len(parsed)}")
    if skipped:
        print("Example skipped rows:")
        for s in skipped[:20]:
            print(f"Row {s[0]} -> {s[1]}. Profit: '{s[2]}', Exit: '{s[3]}'")
            print("Row data:", {k: v for k, v in s[4].items() if str(v).lower() != 'nan' and str(v).strip()})

test_skips()
