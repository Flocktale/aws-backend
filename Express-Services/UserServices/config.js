const AWS = require('aws-sdk');

AWS.config.update({
    region: "us-east-1",
    // endpoint: "http://localhost:3000"        //this endpoint is used in case of local dynamodb on pc.
    // endpoint: "http://dynamodb.us-east-1.amazonaws.com"  // by default it is set according to region
});

const dynamoClient = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();
const sns = new AWS.SNS();

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

module.exports = {
    dynamoClient,
    s3,
    sns,
    imageUploadConstParams,
    tableName,
    searchByUsernameIndex,
    usernameSortIndex,
    timestampSortIndex,
};