import traceback, sys, os, io
sys.path.append(os.getcwd())
try:
    from services.csv_parser import _get_clean_dataframe
    df = _get_clean_dataframe(open('failed_html_debug.bin', 'rb').read(), 'Report.xlsx')
    print("DataFrame len:", len(df) if df is not None else 0)
    print("DataFrame shape:", df.shape if df is not None else (0,0))
except Exception as e:
    print("CRASH:", traceback.format_exc())
