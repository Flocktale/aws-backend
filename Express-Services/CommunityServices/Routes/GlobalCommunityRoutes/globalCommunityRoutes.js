const router = require('express').Router();
const {
    dynamoClient,
    myTable,
    weightIndex
} = require('../../config');



const createCommunityRouter = require('./createCommunityRoutes');

router.use('/create', createCommunityRouter);



// headers - "lastevaluatedkey"  (optional) 
router.get('/', async (req, res) => {

    const _query = {
        TableName: myTable,
        IndexName: weightIndex, // sorted in decreasing order of weight attribute
        KeyConditionExpression: 'PublicSearch = :pk',
        ExpressionAttributeValues: {
            ':pk': 3,
        },
        ProjectionExpression: 'communityId, #name, #avatar, coverImage, creator, liveClubCount,scheduledClubCount,memberCount',
        ExpressionAttributeNames: {
            '#name': 'name',
            '#avatar': 'avatar'
        },
        ScanIndexForward: false,
        ExclusiveStartKey: req.headers.lastevaluatedkey,
        Limit: 10,
    };

    const data = await dynamoClient.query(_query).promise();

    return res.status(200).json({
        communities: data['Items'],
        lastevaluatedkey: data['LastEvaluatedKey'],
    });

});

module.exports = router;