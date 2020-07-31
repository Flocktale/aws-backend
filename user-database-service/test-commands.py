import requests
import json
from flask import request

base_url = "https://hx8byxhgdl.execute-api.us-east-1.amazonaws.com/Prod"

# r = requests.post(f"{base_url}/users/create", data={
#     'userId': 'any-2-id',
#     'name': 'mohit - 2',
#     'phone': '+91xxxxxxxxxx'
# })

r = requests.get(f"{base_url}/users/query/mohit_12")

print(r.content)

# ----------------------------------------------------------------------------
