import json
from flask_lambda import FlaskLambda
from flask import request
import boto3
import time

from boto3.dynamodb.conditions import Key

app = FlaskLambda(__name__)


dynamodb = boto3.resource('dynamodb')

followerTable = dynamodb.Table('Followers')
followingTable = dynamodb.Table('Following')
databaseTable = dynamodb.Table('user-database-table')


def json_response(data, response_code=200):
    return json.dumps(data), response_code, {'Content-Type': 'application/json'}


def find_detail(table, username):
    print(username)
    filtering_exp = Key('username').eq(username)
    z = table.query(KeyConditionExpression=filtering_exp)['Items']

# type casting again to int because json.dumps can't handle float values and somehow initially float values are assigned
    for i in range(len(z)):
        try:
            z[i]['time'] = int(z[i]['time'])
        except:
            z[i]['time'] = 0

    return json_response(z)


@app.route('/users/<string:userId>/following/<string:username>', methods=['GET'])
def get_all_following_users(userId, username):
    return find_detail(followingTable, username)

@app.route('/users/<string:userId>/follow/<string:username>/<string:followingUsername>', methods=['GET'])
def check_follow_status(userId,username,followingUsername):
    try:
        followerTable.get_item(Key={'username': followingUsername,'followerUsername': username})['Item']
        return json_response({'value':True})
    except:
        return json_response({'value':False})


@app.route('/users/<string:userId>/followers/<string:username>', methods=['GET'])
def get_all_followers(username):
    return find_detail(followerTable, username)


@app.route('/users/<string:userId>/following/add/<string:followingUserId>', methods=["POST"])
def add_to_following(userId, followingUserId):

    # this is the user who called this api
    user = databaseTable.get_item(Key={'userId': userId})['Item']

    # this is the user who is followed by
    followingUser = databaseTable.get_item(
        Key={'userId': followingUserId})['Item']
    
    #checking if the relation already exists
    try:
        followerTable.get_item(Key={'username': followingUser['username'],'followerUsername': user['username']})['Item']  
        return json_response({"message": f"You are already following {followingUser['username']}"})
    except:
        pass    


    time_int = int(time.time())

    Item = {
        'username': user['username'],
        'followingUsername': followingUser['username'],
        'followingUserId':  followingUserId,
        'time': time_int,
        'followingName': followingUser['name'],
        'followingImageUrl': followingUser['imageUrl'],
    }

    # now user have started following this person
    followingTable.put_item(Item=Item)

    # user follow count incremented
    attribute_updates = {'followingCount': {
        'Value': user['followingCount'] + 1, 'Action': 'PUT'}}
    databaseTable.update_item(
        Key={'userId': userId}, AttributeUpdates=attribute_updates)

    Item = {
        'username': followingUser['username'],
        'followerUsername': user['username'],
        'followerUserId': userId,
        'time': time_int,
        'followerImage': user['imageUrl'],
        'followerName': user['name'],
    }

    followerTable.put_item(Item=Item)

    attribute_updates = {'followerCount': {
        'Value': followingUser['followerCount'] + 1, 'Action': 'PUT'}}
    databaseTable.update_item(
        Key={'userId': followingUserId}, AttributeUpdates=attribute_updates)

    return json_response({"message": f"You have started following {followingUser['username']}"})


@app.route('/users/<string:userId>/following/delete/<string:followingUserId>', methods=['DELETE','GET'])
def delete_data(userId, followingUserId):
    # this is the user who called this api
    user = databaseTable.get_item(Key={'userId': userId})['Item']

    # this is the user who is followed by
    followingUser = databaseTable.get_item(
        Key={'userId': followingUserId})['Item']

    key = {
        'username': user['username'],
        'followingUsername': followingUser['username'],
    }
    print(key)
    followingTable.delete_item(Key=key)

    # user follow count decremented
    attribute_updates = {'followingCount': {
        'Value': user['followingCount'] - 1, 'Action': 'PUT'}}
    databaseTable.update_item(
        Key={'userId': userId}, AttributeUpdates=attribute_updates)

    key = {
        'username': followingUser['username'],
        'followerUsername': user['username'],
    }
    print(key)
    followerTable.delete_item(Key=key)

    attribute_updates = {'followerCount': {
        'Value': followingUser['followerCount'] - 1, 'Action': 'PUT'}}
    databaseTable.update_item(
        Key={'userId': followingUserId}, AttributeUpdates=attribute_updates)

    return json_response({"message": f"Unfollowed {followingUser['username']}"})


if __name__ == "__main__":
    app.run(debug=True)
