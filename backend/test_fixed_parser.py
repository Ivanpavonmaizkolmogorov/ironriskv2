"""Test extract_file_headers - clean output."""
import sys, os, logging, warnings
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.append(os.getcwd())
logging.disable(logging.CRITICAL)
warnings.filterwarnings('ignore')

from services.csv_parser import extract_file_headers

print("EXCEL:")
h1 = extract_file_headers(open('failed_upload_debug.bin', 'rb').read(), 'ReportHistory.xlsx')
for i, h in enumerate(h1):
    print(f"  {i:2d}: {h}")

print("\nHTML:")
h2 = extract_file_headers(open('failed_html_debug.bin', 'rb').read(), 'ReportHistory.html')
for i, h in enumerate(h2):
    print(f"  {i:2d}: {h}")
