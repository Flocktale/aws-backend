const router = require('express').Router();

const { allClubsOfAudienceIndex, dynamoClient, tableName } = require('../config');

router.get('/:userId/organized', (req, res) => {

    const userId = req.params.userId;

    const query = {
        TableName: tableName,
        KeyConditionExpression: 'P_K = :hkey and begins_with ( S_K , :skey )',
        ExpressionAttributeValues: {
            ":hkey": `USER#${userId}`,
            ":skey": 'CLUB#'
        },
        AttributesToGet: [
            'clubId', 'clubName', 'creatorId', 'creatorUsername', 'category', 'scheduleTime',
            'creatorAvatar', 'clubAvatar', 'tags', 'duration'
        ],
        Limit: 10,
        ScanIndexForward: false,
        ReturnConsumedCapacity: "INDEXES"
    };

    if (req.headers.lastevaluatedkey) {
        query['ExclusiveStartKey'] = JSON.parse(req.headers.lastevaluatedkey);
    }

    dynamoClient.query(query, (err, data) => {
        if (err) res.status(404).json(err);
        else res.status(200).json(data);
    });
});


router.get('/:userId/history', (req, res) => {
    const userId = req.params.userId;
    const query = {
        TableName: tableName,
        IndexName: allClubsOfAudienceIndex,
        KeyConditionExpression: 'audienceId = :hkey',
        ExpressionAttributeValues: {
            ":hkey": userId,
        },
        AttributesToGet: ['clubId', 'creatorId'],
        Limit: 10,
        ScanIndexForward: false,
        ReturnConsumedCapacity: "INDEXES"
    };

    if (req.headers.lastevaluatedkey) {
        query['ExclusiveStartKey'] = JSON.parse(req.headers.lastevaluatedkey);
    }

    dynamoClient.query(query, (err, data) => {
        if (err) res.status(404).json(`Error getting club history for user at #primary level: ${err}`);
        else {
            // Fetching required details of all these clubs

            console.log('fetched clubs with only clubName for history timeline', data);

            const _transactItems = [];

            data['Items'].forEach((element) => {
                _transactItems.push({
                    Get: {
                        TableName: tableName,
                        Key: {
                            P_K: `USER#${element.creatorId}`,
                            S_K: `CLUB#${element.clubId}`
                        },
                        AttributesToGet: [
                            'clubId', 'clubName', 'creatorId', 'creatorUsername', 'category', 'scheduleTime',
                            'creatorAvatar', 'clubAvatar', 'tags', 'duration'
                        ]
                    }
                });
            });

            const _transactQuery = { TransactItems: _transactItems };

            dynamoClient.transactGet(_transactQuery, (err, data) => {
                if (err) res.status(404).json(`Error getting club history for user: ${err}`);
                else res.status(201).json(data);
            });
        }
    });

});


module.exports = router;
