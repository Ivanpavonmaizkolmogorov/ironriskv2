import pandas as pd, io
content = open('failed_html_debug.bin', 'rb').read().decode('utf-8', errors='ignore')
df = pd.read_html(io.StringIO(content), header=None, keep_default_na=False)[0]
h = 7
print("HEADER:", df.iloc[h].tolist())
print("ROW 1 :", df.iloc[h+1].tolist())
