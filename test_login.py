import urllib.request
import urllib.parse
import json
import sys

URL = "https://62-238-19-114.nip.io/api/auth/login"

data = json.dumps({
    'email': 'ivanpavonmaiz@gmail.com',  # The admin user email
    'password': 'Ivan.1990'  # Let's see if we get 401 Unauthorized or 404 User Not Found
}).encode('utf-8')

req = urllib.request.Request(URL, data=data)
req.add_header('Content-Type', 'application/json')

try:
    with urllib.request.urlopen(req) as response:
        print("Status:", response.status)
        print("Success:", response.read().decode())
except urllib.error.HTTPError as e:
    print("HTTP Error:", e.code)
    print("Response:", e.read().decode())
except Exception as e:
    print("Error:", e)
