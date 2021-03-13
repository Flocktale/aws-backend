const AWS = require('aws-sdk');

AWS.config.update({
    region: "ap-south-1",
});

const dynamoClient = new AWS.DynamoDB.DocumentClient();
const sqs = new AWS.SQS();

const WsTable = 'WsTable';
const wsInvertIndex = 'wsInvertIndex';

const myTable = 'MyTable';
const audienceDynamicDataIndex = "AudienceDynamicDataIndex";

module.exports = {
    dynamoClient,
    AWS,
    sqs,

    WsTable,
    wsInvertIndex,

    myTable,
    audienceDynamicDataIndex,
};