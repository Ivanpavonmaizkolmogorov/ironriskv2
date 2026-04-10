import re
content = open('failed_html_debug.bin', 'rb').read().decode('utf-8', errors='ignore')
matches = re.findall(r'<tr[^>]*>.*?buy.*?</tr>', content, flags=re.IGNORECASE)
if matches:
    print(matches[0][:800])
