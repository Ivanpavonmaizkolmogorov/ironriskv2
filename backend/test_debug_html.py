"""PROOF: drop the colspan=8 comment cell entirely, then align."""
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from lxml import etree

content = open('failed_html_debug.bin', 'rb').read().decode('utf-16')
parser = etree.HTMLParser()
tree = etree.fromstring(content.encode('utf-8'), parser=parser)

table = tree.xpath('//table')[0]
rows = table.xpath('.//tr')

# Header row (row 7): extract header names
header_cells = rows[7].xpath('.//td | .//th')
header = []
for c in header_cells:
    text = c.xpath('string(.)').strip()
    cs = c.get('colspan')
    header.append(text)
    if cs:
        for _ in range(int(cs) - 1):
            header.append('')

print("HEADER:", header)

# Data row 8: SKIP the cell with colspan >= 3 that contains non-numeric text (the comment)
# Then expand remaining colspans normally
def extract_data_row(row):
    cells = row.xpath('.//td | .//th')
    result = []
    for c in cells:
        text = c.xpath('string(.)').strip()
        cs_str = c.get('colspan')
        cs = int(cs_str) if cs_str else 1
        
        # Skip comment cells: colspan >= 3 but NOT the last cell (Balance/Profit which uses colspan=2)
        if cs >= 3:
            continue  # DROP the comment cell entirely
        
        result.append(text)
        for _ in range(cs - 1):
            result.append('')
    return result

print("\n=== ROW 8 (after dropping comment cell) ===")
data8 = extract_data_row(rows[8])
for i in range(max(len(header), len(data8))):
    h = header[i] if i < len(header) else '???'
    d = data8[i] if i < len(data8) else 'MISSING'
    match = "OK" if h and d else ""
    print(f"  Col {i:2d}: {h:20s} -> '{d}' {match}")

print("\n=== ROW 11 (after dropping comment cell) ===")
data11 = extract_data_row(rows[11])
for i in range(max(len(header), len(data11))):
    h = header[i] if i < len(header) else '???'
    d = data11[i] if i < len(data11) else 'MISSING'
    print(f"  Col {i:2d}: {h:20s} -> '{d}'")
