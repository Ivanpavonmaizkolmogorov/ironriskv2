import logging
import traceback
import os
import sys

logging.basicConfig(level=logging.INFO)
sys.path.append(os.getcwd())

from services.csv_parser import parse_csv

f = 'failed_html_debug.bin'
try:
    content = open(f, 'rb').read()
    parse_csv(content, 'test.html')
except Exception as e:
    traceback.print_exc()
