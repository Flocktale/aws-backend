import json
from flask_lambda import FlaskLambda
from flask import request
import boto3
from decimal import Decimal
from boto3.dynamodb.conditions import Key

app = FlaskLambda(__name__)

ddb = boto3.resource('dynamodb')

table = ddb.Table('club-database-table')


def json_response(data, response_code=200):
    return json.dumps(data), response_code, {'Content-Type': 'application/json'}


def replace_decimals(obj):
    if isinstance(obj, list):
        for i in range(len(obj)):
            obj[i] = replace_decimals(obj[i])
        return obj
    elif isinstance(obj, dict):
        for key, value in obj.items():
            obj[key] = replace_decimals(value)
        return obj
    elif isinstance(obj, (float, int, Decimal)):
        return int(obj)
    else:
        return obj


@app.route('/clubs', methods=['GET'])
def list_clubs():

    # return only 10 items from table
    clubs = table.scan(Limit=10)['Items']
    return json_response(replace_decimals(clubs))


@app.route('/clubs/create', methods=['POST'])
def create_club():

    print('request.json')
    print(request.json)

    # todo: generate a random unique clubId for each club entry created
    # todo:   request.json['clubId'] = generated uniqueId (or self incremental)

    table.put_item(Item=request.json)

    return json_response({'message': 'club entry is created'})


@app.route('/clubs/<string:username>', methods=['GET'])
def get_all_user_clubs(username):

    filtering_exp = Key('username').eq(username)
    clubs = table.query(KeyConditionExpression=filtering_exp)['Items']

    return json_response(replace_decimals(clubs))


@app.route('/clubs/<string:username>/<string:clubId>', methods=['GET'])
def get_specific_user_club(username, clubId):

    keyId = {'username': username, 'clubId': clubId}
    club = table.get_item(Key=keyId)['Item']

    return json_response(replace_decimals(club))


if __name__ == '__main__':
    app.run(debug=True)
