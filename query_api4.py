import urllib.request
import json
req = urllib.request.Request('http://localhost:8000/api/dashboard/workspaces/8705bcfd-c4a2-453c-bc8d-9a0875b68050')
try:
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        print(data)
except Exception as e:
    print(e)
