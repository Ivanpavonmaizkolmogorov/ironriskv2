import pandas as pd
import io

content = open('failed_html_debug.bin', 'rb').read().decode('utf-8', errors='ignore')
df = pd.read_html(io.StringIO(content), header=None, keep_default_na=False)[0]

try:
    h = 7 # Header index for Deals
    header_vals = df.iloc[h].tolist()
    print("Header:", header_vals[:15])
    print("Row 1: ", df.iloc[h+1].tolist()[:15])

    print("\nExtracting Beneficio (index 12):", df.iloc[h+1, 12])
    print("Extracting Beneficio_1 (index 13):", df.iloc[h+1, 13])
except Exception as e:
    print(e)
