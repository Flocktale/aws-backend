const AWS = require('aws-sdk');
AWS.config.update({
    region: "ap-south-1",
    // endpoint: "http://localhost:3000"        //this endpoint is used in case of local dynamodb on pc.
    // endpoint: "http://dynamodb.ap-south-1.amazonaws.com"  // by default it is set according to region
});


const dynamoClient = new AWS.DynamoDB.DocumentClient();
const sns = new AWS.SNS();


const myTable = "MyTable";

module.exports = {
    dynamoClient,
    sns,

    myTable,

};