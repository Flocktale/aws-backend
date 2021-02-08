const AWS = require('aws-sdk');

AWS.config.update({
    region: "us-east-1",
    // endpoint: "http://localhost:3000"        //this endpoint is used in case of local dynamodb on pc.
    // endpoint: "http://dynamodb.us-east-1.amazonaws.com"  // by default it is set according to region
});

const dynamoClient = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

const apigwManagementApi = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: 'https://jpkq996li6.execute-api.us-east-1.amazonaws.com' + '/' + 'Dev'
});

const imageUploadConstParams = {
    ACL: 'public-read',
    Bucket: 'mootclub-public',
    // Body:            populate it 
    // Key:             populate it
};


const agoraAppId = "7c3800483bbc473bbf341e1d68f04a40";
const agoraPrimaryCertificate = "8b55b57e5db34a41bf974321c8671339";


const tableName = "MyTable";


const WsTable = 'WsTable';
const wsInvertIndex = 'wsInvertIndex';




const clubCategoryIndex = "ClubCategoryIndex";

const clubCreatorIdIndex = "ClubCreatorIdIndex";

const sortKeyWithTimestampIndex = "SortKeyWithTimestampIndex";

const usernameSortIndex = "UsernameSortIndex";
const timestampSortIndex = "TimestampSortIndex";
const audienceDynamicDataIndex = "AudienceDynamicDataIndex";
const searchByUsernameIndex = "SearchByUsernameIndex";



module.exports = {
    dynamoClient,
    s3,
    apigwManagementApi,

    imageUploadConstParams,
    tableName,

    WsTable,
    wsInvertIndex,

    clubCategoryIndex,
    clubCreatorIdIndex,
    sortKeyWithTimestampIndex,

    usernameSortIndex,
    timestampSortIndex,
    audienceDynamicDataIndex,
    searchByUsernameIndex,

    agoraAppId,
    agoraPrimaryCertificate,
};