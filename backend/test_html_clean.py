import re
def clean_mt5_html(html_bytes):
    html_str = html_bytes.decode('utf-8', errors='ignore')
    
    # We want to delete ANY <td> that has a colspan="8" or similar which is the inline comment.
    # We MUST NOT delete colspan="13" or "14" because those are the section headers (Deals/Orders).
    # Regex explicitly targets colspan="2" through "12"
    html_str = re.sub(r'(?i)<t[dh][^>]*colspan=["\']?(?:[2-9]|1[0-2])["\']?[^>]*>.*?</t[dh]>', '', html_str, flags=re.DOTALL)
    
    return html_str

if __name__ == "__main__":
    html_bytes = open('failed_html_debug.bin', 'rb').read()
    cleaned = clean_mt5_html(html_bytes)
    import pandas as pd
    import io
    df = pd.read_html(io.StringIO(cleaned), keep_default_na=False)[0]
    print("DataFrame shape:", df.shape)
    print("Header row:")
    print(df.iloc[7].tolist())
    print("\nData row 1:")
    print(df.iloc[8].tolist())
