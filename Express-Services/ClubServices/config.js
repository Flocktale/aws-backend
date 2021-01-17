const AWS = require('aws-sdk');

AWS.config.update({
    region: "us-east-1",
    // endpoint: "http://localhost:3000"        //this endpoint is used in case of local dynamodb on pc.
    // endpoint: "http://dynamodb.us-east-1.amazonaws.com"  // by default it is set according to region
});

const dynamoClient = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

const imageUploadConstParams = {
    ACL: 'public-read',
    Bucket: 'mootclub-public',
    // Body:            populate it 
    // Key:             populate it
};

const tableName = "MyTable";

const clubCategoryIndex = "ClubCategoryIndex";

const clubCreatorIdIndex = "ClubCreatorIdIndex";

const sortKeyWithTimestampIndex = "SortKeyWithTimestampIndex";

const timestampSortIndex = "TimestampSortIndex";
const audienceDynamicDataIndex = "AudienceDynamicDataIndex";
const searchByUsernameIndex = "SearchByUsernameIndex";

const agoraAppId = "7c3800483bbc473bbf341e1d68f04a40";
const agoraPrimaryCertificate = "8b55b57e5db34a41bf974321c8671339";



module.exports = {
    dynamoClient,
    s3,
    imageUploadConstParams,
    tableName,
    clubCategoryIndex,
    clubCreatorIdIndex,
    sortKeyWithTimestampIndex,
    timestampSortIndex,
    audienceDynamicDataIndex,
    searchByUsernameIndex,

    agoraAppId,
    agoraPrimaryCertificate,
};