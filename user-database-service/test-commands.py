import requests
import json
from flask import request

# base_url = "https://hx8byxhgdl.execute-api.us-east-1.amazonaws.com/Prod"
base_url = "http://127.0.0.1:5000/"

# r = requests.post(f"{base_url}/users/create", data={
#     'userId': 'any-2-id',
#     'name': 'mohit - 2',
#     'phone': '+91xxxxxxxxxx'
# })

# r = requests.get(f"{base_url}/users")
abc = '{"name":"hello","a":"aa"}'
# print(abc)
# print(json.loads(abc))

# print(type(abc))
# print(type(json.loads(abc)))

print(type(request.form))
print(type(request.form.to_dict))

# print(type(request.data))
# print(type(request.json))

# ----------------------------------------------------------------------------
