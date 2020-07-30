import json
from flask_lambda import FlaskLambda
from flask import request,jsonify, Response
import boto3
import time
from boto3.dynamodb.conditions import Key
app=FlaskLambda(__name__)
dynamodb = boto3.resource('dynamodb')

followerTable = dynamodb.Table('Followers')
followingTable = dynamodb.Table('Following')
@app.route('/')
def home():
      return jsonify{
        "statusCode": 200,
        "body": json.dumps({
            "message": "hello adarsh",
        }),
    }

@app.route('/add',methods=["POST"])
def add_data():
    Item={
        'username':request.json['username'],
        'followerusername':request.json['followerusername'],
        'time': int(time.time()),
        'imageUrl' : request.json['imageUrl1'],
        'name': request.json['name1']
    }
    followerTable.put_item(Item=Item)
    Item={
        'username':request.json['followerusername'],
        'followedUsername':request.json['username'],
        'time': int(time.time()),
        'imageUrl' : request.json['imageUrl2'],
        'name': request.json['name2'],
    }
    followingTable.put_item(Item=Item)
    return jsonify({
        "statusCode": 200,
        "body": json.dumps({
            "message": "Followed",
        }),
    })
@app.route('/delete',methods=['DELETE']) 
def delete_data():
    Key={
        'username':request.json['username'],
        'followerusername':request.json['followerusername'],
    }
    followerTable.delete_item(Key=Key)
    Key={
        'username':request.json['followerusername'],
        'followerusername':request.json['username'],
    }
    followingTable.delete_item(Key=Key)
    return jsonify({
        "statusCode": 200,
        "body": json.dumps({
            "message": "Unfollowed",
        }),
    })

def find_detail(table,username):    
    print(username)
    filtering_exp = Key('username').eq(username)
    z=table.query(KeyConditionExpression=filtering_exp)['Items']
    for i in range(len(z)):
        try:
            z[i]['time']=int(z[i]['time'])
        except:
            z[i]['time']=0
    return jsonify({
        "statusCode": 200,
        "body": json.dumps({
            "followers":  (json.dumps(z)),
        }),
    })

@app.route('/followers',methods=["POST"])
def get_followers():
    return find_detail(followerTable,request.json['username'])

@app.route('/following',methods=["POST"])
def get_following():
    return find_detail(followingTable,request.json['username'])



# ENV=True

if __name__=="__main__":
    app.run(debug=True)
    
    

# add secondary index of timestamp