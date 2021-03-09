const AWS = require('aws-sdk');

AWS.config.update({
    region: "ap-south-1",
});

const dynamoClient = new AWS.DynamoDB.DocumentClient();

const WsTable = 'WsTable';
const wsInvertIndex = 'wsInvertIndex';

const myTable = 'MyTable';
const timestampSortIndex = 'TimestampSortIndex';
const audienceDynamicDataIndex = "AudienceDynamicDataIndex";

module.exports = {
    dynamoClient,
    AWS,

    WsTable,
    wsInvertIndex,

    myTable,
    timestampSortIndex,
    audienceDynamicDataIndex,
};