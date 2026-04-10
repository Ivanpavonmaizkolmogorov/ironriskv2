import pandas as pd
import io

html_to_parse = open('failed_html_debug.bin', 'rb').read().decode('utf-8', errors='ignore')
df = pd.read_html(io.StringIO(html_to_parse), header=None, keep_default_na=False)[0]

try:
    h = 7
    print("Header cols:", [x for x in df.iloc[h].tolist()[:14] if str(x).strip()])
    print("Deal col:", df.iloc[h+1].tolist()[:14])
    print("Deal col 2:", df.iloc[h+14].tolist()[:14])
except Exception as e:
    print(e)
