const AWS = require('aws-sdk');

AWS.config.update({
    region: "us-east-1",
    // endpoint: "http://localhost:3000"        //this endpoint is used in case of local dynamodb on pc.
    // endpoint: "http://dynamodb.us-east-1.amazonaws.com"  // by default it is set according to region
});

const dynamoClient = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();
const sns = new AWS.SNS();

const apigwManagementApi = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: 'https://08oc4tw1hb.execute-api.us-east-1.amazonaws.com' + '/' + 'Dev'
});


const imageUploadConstParams = {
    ACL: 'public-read',
    Bucket: 'mootclub-public',
    // Body:            populate it 
    // Key:             populate it
};

const tableName = "MyTable";
const searchByUsernameIndex = "SearchByUsernameIndex";

const timestampSortIndex = "TimestampSortIndex";
const usernameSortIndex = "UsernameSortIndex";


const audienceDynamicDataIndex = "AudienceDynamicDataIndex";

const WsTable = 'WsTable';
const wsInvertIndex = 'wsInvertIndex';


module.exports = {
    dynamoClient,
    s3,
    sns,
    imageUploadConstParams,
    tableName,
    searchByUsernameIndex,
    usernameSortIndex,
    timestampSortIndex,

    audienceDynamicDataIndex,
    apigwManagementApi,

    WsTable,
    wsInvertIndex,
};