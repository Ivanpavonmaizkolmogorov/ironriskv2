import urllib.request
import json

# First login to get token
login_data = json.dumps({
    'email': 'ivanpavonmaiz@gmail.com',
    'password': 'Ivan.1990'
}).encode('utf-8')

login_req = urllib.request.Request(
    'https://62-238-19-114.nip.io/api/auth/login',
    data=login_data
)
login_req.add_header('Content-Type', 'application/json')

with urllib.request.urlopen(login_req) as resp:
    token = json.loads(resp.read().decode())['access_token']
    print("Login OK, got token")

# Now test uptime endpoint
test_req = urllib.request.Request(
    'https://62-238-19-114.nip.io/api/admin/test-uptime',
    method='POST'
)
test_req.add_header('Authorization', f'Bearer {token}')
test_req.add_header('Content-Type', 'application/json')

try:
    with urllib.request.urlopen(test_req) as resp:
        result = json.loads(resp.read().decode())
        print(json.dumps(result, indent=2))
except urllib.error.HTTPError as e:
    print(f"Error {e.code}: {e.read().decode()}")
