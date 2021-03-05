const AWS = require('aws-sdk');

AWS.config.update({
    region: "us-east-1",
});

const dynamoClient = new AWS.DynamoDB.DocumentClient();

const WsTable = 'WsTable';
const wsInvertIndex = 'wsInvertIndex';

const myTable = 'MyTable';
const audienceDynamicDataIndex = "AudienceDynamicDataIndex";

module.exports = {
    dynamoClient,

    WsTable,
    wsInvertIndex,

    myTable,
    audienceDynamicDataIndex,
};