from lxml import etree
import pandas as pd
import io

def parse_mt5_xml_html(file_content_str):
    try:
        parser = etree.HTMLParser()
        root = etree.fromstring(f"<wrapper>{file_content_str}</wrapper>", parser=parser)
    except Exception as e:
        print("LXML Root Error:", e)
        return []

    dfs = []
    
    # In strictly formed SS 2003, it's <Row><Cell><Data>. In HTML it's <tr><td>.
    # HTML parser lowercases tags, so we look for <tr>, <th>, <td>, <row>, <cell>, <data>.
    for table in root.xpath('.//table | .//worksheet'):
        data2d = []
        rows = table.xpath('.//tr | .//row')
        for r in rows:
            cells = r.xpath('.//td | .//th | .//cell')
            if not cells: continue
            
            row_data = {}
            col_idx = 0
            
            for c in cells:
                # Handle XML SS 2003 ss:Index
                ss_index = c.xpath('@ss:index') or c.xpath('@index')
                if ss_index:
                    try:
                        col_idx = int(ss_index[0]) - 1 # 1-based index in XML
                    except: pass
                
                # Extract text
                texts = c.xpath('.//text()')
                text_val = " ".join([t.strip() for t in texts if t.strip()])
                
                row_data[col_idx] = text_val
                
                # Handle HTML colspan
                colspan = c.xpath('@colspan')
                if colspan:
                    try: 
                        col_idx += int(colspan[0])
                    except: 
                        col_idx += 1
                else:
                    col_idx += 1
            
            if row_data:
                # Convert dict to padded list
                max_col = max(row_data.keys())
                row_list = [row_data.get(i, "") for i in range(max_col + 1)]
                data2d.append(row_list)
        
        if data2d:
            dfs.append(pd.DataFrame(data2d))
            
    return dfs

with open('failed_html_debug.bin', 'rb') as f:
    text = f.read().decode('utf-8', errors='ignore')
dfs = parse_mt5_xml_html(text)
if dfs:
    df = max(dfs, key=len)
    h = 7
    try:
        print("Header:", df.iloc[h].tolist())
        print("Data 1:", df.iloc[h+1].tolist())
        print("Data 2:", df.iloc[h+2].tolist())
    except:
        pass
else:
    print("NO DFS EXTRACTED")
