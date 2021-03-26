const router = require('express').Router();

const {
    primaryKeyInvertIndex,
    dynamoClient,
    myTable,
} = require('../config');


//required
// query parameters 
//               type - "HOST" or "MEMBER"
//headers -  lastevaluatedkey (if type is MEMBER) (optional)
router.get('/:userId', async (req, res) => {
    const userId = req.params.userId;
    const type = req.query.type;

    if (type !== "HOST" && type !== "MEMBER") {
        return res.status(400).json('invalid status');
    }

    const _query = {
        TableName: myTable,
        IndexName: primaryKeyInvertIndex,
        KeyConditionExpression: 'S_K = :sk and begins_with(P_K,:pk)',
        ExpressionAttributeValues: {
            ':sk': `COMMUNITY#USER#${userId}`,
            ':pk': `COMMUNITY#${type}#`,
        },
        ProjectionExpression: 'community',
    };

    if (type == 'MEMBER') {
        _query['Limit'] = 20;
        _query['ExclusiveStartKey'] = req.headers.lastevaluatedkey;
    }

    const communities = data['Items'].map(({
        community
    }) => {
        return community;
    })

    const data = await dynamoClient.query(_query).promise();
    return res.status(200).json({
        communities: communities,
        lastevaluatedkey: data['LastEvaluatedKey'],
    });
});


module.exports = router;