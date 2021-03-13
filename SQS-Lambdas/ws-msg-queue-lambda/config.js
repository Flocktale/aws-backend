const AWS = require('aws-sdk');
AWS.config.update({
    region: "ap-south-1",
    // endpoint: "http://localhost:3000"        //this endpoint is used in case of local dynamodb on pc.
    // endpoint: "http://dynamodb.ap-south-1.amazonaws.com"  // by default it is set according to region
});


const dynamoClient = new AWS.DynamoDB.DocumentClient();

const apigwManagementApi = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: 'https://0pxxpxq71b.execute-api.ap-south-1.amazonaws.com' + '/' + 'Dev'
});

const myTable = "MyTable";
const audienceDynamicDataIndex = "AudienceDynamicDataIndex";


const WsTable = 'WsTable';
const wsInvertIndex = 'wsInvertIndex';
const wsUserIdIndex = 'wsUserIdIndex';

module.exports = {
    dynamoClient,
    apigwManagementApi,

    myTable,
    audienceDynamicDataIndex,

    WsTable,
    wsInvertIndex,
    wsUserIdIndex,
};