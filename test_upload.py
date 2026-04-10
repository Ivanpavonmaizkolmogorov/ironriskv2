import requests
import os

url = "http://127.0.0.1:8000/api/strategies/upload"

with open("dummy.csv", "w") as f:
    f.write("ticket,open_time,close_time,type,size,item,open_price,close_price,sl,tp,commission,taxes,swap,profit\n")
    f.write("1,2023.01.01 10:00,2023.01.01 11:00,buy,0.1,EURUSD,1.000,1.001,0,0,0,0,0,10\n")

data = {
    "trading_account_id": "8705bcfd-c4a2-453c-bc8d-9a0875b68050",
    "name": "test_strategy",
    "description": "",
    "magic_number": "123456",
    "max_drawdown_limit": "0",
    "daily_loss_limit": "0",
    "skip_recalc": "true"
}

with open("dummy.csv", "rb") as f:
    files = {"file": ("dummy.csv", f, "text/csv")}
    # Note: For testing, we might need a JWT. Let's see if it's protected.
    headers = {"Authorization": f"Bearer SOME_TOKEN"} 
    # But wait, does /upload require JWT? Yes. I should query the DB for an authorized token or see if it returns 401 instead of 400.
    resp = requests.post(url, data=data, files=files)
    print(resp.status_code, resp.text)
