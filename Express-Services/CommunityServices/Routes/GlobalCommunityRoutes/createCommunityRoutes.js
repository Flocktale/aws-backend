const router = require('express').Router();
const {
    dynamoClient,
    myTable,
    sns,
} = require('../../config');

const fs = require("fs");

const {
    CommunityDocSchemaWithDatabaseKeys
} = require('../../Schemas/communityDoc');

const Constants = require('../../constants');
const {
    nanoid
} = require('nanoid');
const {
    CommunityHostSchemaWithDatabaseKeys
} = require('../../Schemas/communityUserSchema');

const {
    uploadFile,
    subscribeUserToCommunityTopic
} = require('../../Functions/communityFunctions');

// required
// query parameters - "creatorId",
// body: CommunityDocSchemaWithDatabaseKeys validated
router.post('/', async (req, res) => {
    const body = req.body;
    const creatorId = req.query.creatorId;

    if (!body) {
        return res.status(400).json('body is required');
    }
    if (!creatorId) {
        return res.status(400).json('creatorId in query parameters is required');
    }


    try {

        const _creatorSummaryQuery = {
            TableName: myTable,
            Key: {
                P_K: `USER#${creatorId}`,
                S_K: `USERMETA#${creatorId}`
            },
            AttributesToGet: ['userId', 'username', 'avatar'],
        };

        const _creatorSummaryDoc = (await dynamoClient.get(_creatorSummaryQuery).promise())['Item'];

        const communityId = nanoid();

        body['communityId'] = communityId;

        body['creator'] = _creatorSummaryDoc;
        body['avatar'] = Constants.CommunityAvatarUrl(communityId);
        body['coverImage'] = Constants.CommunityCoverImageUrl(communityId);

        body['hosts'] = dynamoClient.createSet([_creatorSummaryDoc.avatar]);

        const newCommunity = await CommunityDocSchemaWithDatabaseKeys.validateAsync(body);

        const _createCommunityQuery = {
            TableName: myTable,
            Item: newCommunity,
        };


        const newCommunityHostDoc = await CommunityHostSchemaWithDatabaseKeys.validateAsync({
            community: {
                communityId: communityId,
                name: newCommunity.name,
                avatar: newCommunity.avatar,
            },
            user: _creatorSummaryDoc,
        });

        const _createCommunityHostQuery = {
            TableName: myTable,
            Item: newCommunityHostDoc,
        };

        await dynamoClient.transactWrite({
            TransactItems: [{
                    Put: _createCommunityQuery
                },
                {
                    Put: _createCommunityHostQuery
                },
            ]
        }).promise();



        await Promise.all([
            // uploading community placeholder images 
            setCommunityImages(communityId),

            // creating topic
            setCommunityTopicAndSubscribeCreator(communityId, creatorId),
        ]);

        return res.status(201).json({
            communityId: communityId
        });


    } catch (error) {
        return res.status(400).json(error);
    }

});


async function setCommunityTopicAndSubscribeCreator(communityId, creatorId) {
    await sns.createTopic({
        Name: communityId,
    }).promise();

    await subscribeUserToCommunityTopic({
        communityId: communityId,
        userId: creatorId,
        type: 'HOST',
    });

}


async function setCommunityImages(communityId) {

    const _Avatarthumbnail = fs.createReadStream('./static/communityAvatar_thumb.jpg');
    const _Avatardefault = fs.createReadStream('./static/communityAvatar.jpg');
    const _Avatarlarge = fs.createReadStream('./static/communityAvatar_large.jpg');


    const _Coverthumbnail = fs.createReadStream('./static/communityCoverImage_thumb.jpg');
    const _Coverdefault = fs.createReadStream('./static/communityCoverImage.jpg');
    const _Coverlarge = fs.createReadStream('./static/communityCoverImage_large.jpg');

    const uploadPromises = [
        uploadFile(Constants.s3CommunityAvatarThumbKey(communityId), _Avatarthumbnail),
        uploadFile(Constants.s3CommunityAvatarDefaultKey(communityId), _Avatardefault),
        uploadFile(Constants.s3CommunityAvatarLargeKey(communityId), _Avatarlarge),

        uploadFile(Constants.s3CommunityCoverImageThumbKey(communityId), _Coverthumbnail),
        uploadFile(Constants.s3CommunityCoverImageDefaultKey(communityId), _Coverdefault),
        uploadFile(Constants.s3CommunityCoverImageLargeKey(communityId), _Coverlarge),
    ];

    try {
        await Promise.all(uploadPromises);
    } catch (error) {
        console.log(`Error occured while trying to upload:`, error);
    }
}

module.exports = router;