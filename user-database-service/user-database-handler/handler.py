import json
from flask_lambda import FlaskLambda
from flask import request
import boto3

app = FlaskLambda(__name__)

ddb = boto3.resource('dynamodb')

table = ddb.Table('user-database-table')


def json_response(data, response_code=200):
    return json.dumps(data), response_code, {'Content-Type': 'application/json'}


@app.route('/')
def index():
    return json_response({"message": "This is the root url, please specify your action!"})


@app.route('/users', methods=['GET'])
def list_users():

    # return only 10 items from table
    users = table.scan(Limit=10)['Items']
    return json_response(users)


@app.route('/users/create', methods=['POST'])
def create_user():

    print('request.json')
    print(request.json)

    table.put_item(Item=request.json)

    return json_response({'message': 'user entry is created'})


@app.route('/users/<string:userId>', methods=['GET'])
def get_user(userId):

    keyId = {'userId': userId}

    user = table.get_item(Key=keyId)['Item']
    return json_response(user)


@app.route('/users/<string:userId>/update', methods=['PATCH'])
def patch_user(userId):

    keyId = {'userId': userId}

    data = request.json  # this is of type of dict actually

    attribute_updates = {
        key: {'Value': data[key], 'Action': 'PUT'} for key in data if key != 'userId'
    }
    table.update_item(Key=keyId,
                      AttributeUpdates=attribute_updates)
    return json_response({'message': 'user entry is updated'})


@app.route('/users/<string:userId>/delete', methods=['DELETE'])
def delete_user(userId):

    keyId = {'userId': userId}

    table.delete_item(Key=keyId)
    return json_response({'message': 'user entry is deleted'})
