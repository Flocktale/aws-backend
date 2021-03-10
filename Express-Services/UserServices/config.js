const AWS = require('aws-sdk');
const Constants = require('./constants');

AWS.config.update({
    region: "ap-south-1",
    // endpoint: "http://localhost:3000"        //this endpoint is used in case of local dynamodb on pc.
    // endpoint: "http://dynamodb.ap-south-1.amazonaws.com"  // by default it is set according to region
});

const dynamoClient = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();
const sns = new AWS.SNS();

const apigwManagementApi = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: 'https://0pxxpxq71b.execute-api.ap-south-1.amazonaws.com' + '/' + 'Dev'
});


const imageUploadConstParams = {
    ACL: 'public-read',
    Bucket: Constants.avatarBucketName,
    // Body:            populate it 
    // Key:             populate it
};

// (using platform application - "flocktale-fcm" which is GCM (FCM) enabled ) (AWS region is Mumbai (ap-south-1))
const platformEndpointCreateParams = {
    PlatformApplicationArn: 'arn:aws:sns:ap-south-1:524663372903:app/GCM/flocktale-fcm',
    // Token:               (deviceToken) populate it

};


const myTable = "MyTable";
const searchByUsernameIndex = "SearchByUsernameIndex";

const clubCreatorIdIndex = "ClubCreatorIdIndex";

const timestampSortIndex = "TimestampSortIndex";
const usernameSortIndex = "UsernameSortIndex";


const audienceDynamicDataIndex = "AudienceDynamicDataIndex";

const WsTable = 'WsTable';
const wsInvertIndex = 'wsInvertIndex';
const wsUserIdIndex = 'wsUserIdIndex';


module.exports = {
    dynamoClient,
    s3,
    sns,
    imageUploadConstParams,
    platformEndpointCreateParams,

    myTable,
    searchByUsernameIndex,

    clubCreatorIdIndex,

    usernameSortIndex,
    timestampSortIndex,

    audienceDynamicDataIndex,
    apigwManagementApi,

    WsTable,
    wsInvertIndex,
    wsUserIdIndex,
};