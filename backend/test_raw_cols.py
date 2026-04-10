import traceback, sys, os, io
sys.path.append(os.getcwd())
try:
    from services.csv_parser import _get_clean_dataframe
    df = _get_clean_dataframe(open('failed_html_debug.bin', 'rb').read(), 't.html')
    print("Keys:", df.columns.tolist())
    print(df[['Beneficio', 'Beneficio_1', 'Unnamed_14']])
except Exception as e:
    print(e)
