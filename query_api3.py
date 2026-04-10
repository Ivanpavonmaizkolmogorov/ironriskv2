import urllib.request
import json
req = urllib.request.Request('http://localhost:8000/api/portfolio/8705bcfd-c4a2-453c-bc8d-9a0875b68050')
try:
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        print("Keys:", data.keys())
        if 'strategies' in data:
            print(data['strategies'][0]['metrics_snapshot'].keys())
except Exception as e:
    print(e)
