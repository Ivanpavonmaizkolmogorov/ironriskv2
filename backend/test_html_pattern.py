import re
with open('failed_html_debug.bin', 'rb') as f:
    text = f.read().decode('utf-8', errors='ignore')

# Find a data row example (a row with buy or sell inside)
matches = re.findall(r'<tr[^>]*>.*?buy.*?</tr>', text, flags=re.DOTALL | re.IGNORECASE)
if matches:
    print("Example HTML data row:")
    print(matches[0][:800])
