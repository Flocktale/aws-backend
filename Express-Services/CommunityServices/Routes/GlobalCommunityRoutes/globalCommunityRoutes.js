const router = require('express').Router();
const {
    dynamoClient,
    myTable
} = require('../../config');


// headers - "lastevaluatedkey"  (optional) 
router.get('/', async (req, res) => {

    const _query = {
        TableName: myTable,
        KeyConditionExpression: 'P_K = :pk and begins_with(S_K,:sk)',
        ExpressionAttributeValues: {
            ':pk': 'COMMUNITY#DATA',
            ':sk': 'COMMUNITYMETA#'
        },
        ProjectionExpression: 'communityId, #name, description, #avatar, converImage, liveClubHosts,scheduledClubCount,memberCount',
        ExpressionAttributeNames: {
            '#name': 'name',
            '#avatar': 'avatar'
        },

        ExclusiveStartKey: req.headers.lastevaluatedkey,
        Limit: 10,
    };

    const data = await dynamoClient.query(_query).promise();

    return res.status({
        communities: data['Items'],
        lastevaluatedkey: data['LastEvaluatedKey'],
    });

});

module.exports = router;