import json
from flask_lambda import FlaskLambda
from flask import request
import boto3
from decimal import *
from boto3.dynamodb.conditions import Key

app = FlaskLambda(__name__)

ddb = boto3.resource('dynamodb')

table = ddb.Table('user-database-table')


def json_response(data, response_code=200):
    return json.dumps(data), response_code, {'Content-Type': 'application/json'}

def replace_decimals(obj):
    if isinstance(obj, list):
        for i in range(len(obj)):
            obj[i] = replace_decimals(obj[i])
        return obj
    elif isinstance(obj, dict):
        for key,value in obj.items():
            obj[key]=replace_decimals(value)
        return obj
    elif isinstance(obj, (float, int,Decimal)):
        return int(obj)
    else:
        return obj


@app.route('/')
def index():
    return json_response({"message": "This is the root url, please specify your action!"})


@app.route('/users', methods=['GET'])
def list_users():

    # return only 10 items from table
    users = table.scan(Limit=10)['Items']
    return json_response(replace_decimals(users))


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
    return json_response(replace_decimals(user))


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


@app.route('/users/<string:userId>/uploadImage', methods=['POST'])
def upload_image(userId):

    print('request.json')
    print(request.json)

    # we are getting image as a base64Encoded String

    s3 = boto3.resource('s3')
    s3.Bucket('mootclub-user-profile-bucket').put_object(Key=userId,
                                                         Body=request.json['image'])

    object_acl = s3.ObjectAcl('mootclub-user-profile-bucket', userId)
    response = object_acl.put(ACL='public-read')

    print(response)

    # updating user data in table
    keyId = {'userId': userId}
    attribute_updates = {
        'imageUrl': {'Value': f"https://mootclub-user-profile-bucket.s3.amazonaws.com/{userId}", 'Action': 'PUT'}
    }

    table.update_item(Key=keyId,
                      AttributeUpdates=attribute_updates)

    return json_response({'message:': 'image uploaded successfully', 'imageUrl': f"https://mootclub-user-profile-bucket.s3.amazonaws.com/{userId}"})


@app.route('/users/query/<string:username>', methods=['GET'])
def get_user_by_username(username):
    items = list(table.query(IndexName='UsernameIndex',
                             #  Limit=1,  # ensuring only one item is fetched anyways
                             KeyConditionExpression=Key(
                                 'username').eq(username)
                             )['Items'])

    print(items)

    if len(items) > 0:
        return json_response(replace_decimals(items[0]))
    else:
        return json_response({})


if __name__ == '__main__':
    app.run(debug=True)
