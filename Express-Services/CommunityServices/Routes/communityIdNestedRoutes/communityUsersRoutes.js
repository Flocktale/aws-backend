const {
    myTable,
    dynamoClient
} = require('../../config');

const router = require('express').Router();

//headers - lastevaluatedkey (optional)
// query parameters - type - "HOST" or "MEMBER" (required) 
router.get('/', async (req, res) => {

    const communityId = req.communityId;

    const type = req.query.type;

    if (type !== 'HOST' && type !== 'MEMBER') {
        return res.status(400).json('invalid value of type in query parameters');
    }

    const _query = {
        TableName: myTable,
        KeyConditionExpression: 'P_K = :pk and begins_with(S_K,:sk)',
        ExpressionAttributeValues: {
            ':pk': `COMMUNITY#${type}#${communityId}`,
            ':sk': 'COMMUNITY#USER#',
        },
        ProjectionExpression: '#user',
        ExpressionAttributeNames: {
            '#user': 'user'
        },

        ExclusiveStartKey: req.headers.lastevaluatedkey,
        Limit: 20,
    }

    const data = await dynamoClient.query(_query).promise();

    const users = data['Items'].map(({
        user
    }) => {
        return user;
    });


    return res.status(200).json({
        users: users,
        lastevaluatedkey: data['LastEvaluatedKey']
    });

});