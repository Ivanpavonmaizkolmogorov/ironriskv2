import time
from lxml import html, etree

def clean_html(file_content):
    content_str = ""
    for enc in ["utf-8", "utf-16", "utf-8-sig", "latin1"]:
        try:
            content_str = file_content.decode(enc)
            if '\x00' not in content_str:
                break
        except Exception:
            pass
            
    start = time.time()
    
    # MT5 often creates HTML that has multiple HTML structures appended, lxml can still handle it if wrapped.
    try:
        tree = html.fromstring(content_str)
        # Remove colspans that are not section headers (not 13 or 14)
        for td in tree.xpath('//td[@colspan] | //th[@colspan]'):
            try:
                cs = int(td.get('colspan'))
                if cs < 13:
                    td.drop_tree() # drop the entire comment node
            except Exception:
                pass
                
        cleaned = etree.tostring(tree, encoding='unicode')
        print("lxml processing time:", time.time() - start)
        return cleaned
    except Exception as e:
        print("Error parsing HTML with lxml:", e)
        return content_str

if __name__ == "__main__":
    b = open('failed_html_debug.bin', 'rb').read()
    cleaned = clean_html(b)
    import pandas as pd
    import io
    df = pd.read_html(io.StringIO(cleaned), keep_default_na=False)[0]
    print("DataFrame shape:", df.shape)
    
    # Find headers
    headers = []
    for i in range(len(df)):
        row_str = " ".join([str(x).lower().strip() for x in df.iloc[i].dropna() if str(x).strip()])
        if 'beneficio' in row_str and 'precio' in row_str:
            headers.append(i)
            
    print("Headers at:", headers)
    if headers:
        print("First Header row:", df.iloc[headers[0]].dropna().tolist())
        print("Trade row under First Header:", df.iloc[headers[0]+1].dropna().tolist())
