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


    const agoraAppId = "f58d5e866a87498988cd3c138759bb2a";
    const agoraPrimaryCertificate = "a420f033ec69472c885af6775c861701";


    const myTable = "MyTable";


    const WsTable = 'WsTable';
    const wsInvertIndex = 'wsInvertIndex';
    const wsUserIdIndex = 'wsUserIdIndex';



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
        sns,
        apigwManagementApi,

        imageUploadConstParams,
        myTable,

        WsTable,
        wsInvertIndex,
        wsUserIdIndex,

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