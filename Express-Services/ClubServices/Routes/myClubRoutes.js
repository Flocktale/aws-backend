const router = require('express').Router();

const { allClubsOfAudienceIndex, dynamoClient, tableName } = require('../config');


// required
// headers - "lastevaluatedkey"  (optional)

router.get('/:userId/organized', (req, res) => {

    const userId = req.params.userId;

    const query = {
        TableName: tableName,
        KeyConditions: {
            "P_K": {
                "ComparisonOperator": "EQ",
                "AttributeValueList": [`USER#${userId}`]
            },
            "S_K": {
                "ComparisonOperator": "BEGINS_WITH",
                "AttributeValueList": ['CLUB#']
            },
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
        else {
            console.log(data);
            res.status(200).json({
                "organizedClubs": data["Items"],
                'lastevaluatedkey': data["LastEvaluatedKey"]
            });
        }
    });
});


// required
// headers - "lastevaluatedkey"  (optional)

router.get('/:userId/history', (req, res) => {
    const userId = req.params.userId;
    const query = {
        TableName: tableName,
        IndexName: allClubsOfAudienceIndex,
        KeyConditions: {
            "audienceId": {
                "ComparisonOperator": "EQ",
                "AttributeValueList": [userId]
            },
        },
        AttributesToGet: ['clubId', 'creatorId'],
        Limit: 10,
        ScanIndexForward: false,
        ReturnConsumedCapacity: "INDEXES"
    };

    if (req.headers.lastevaluatedkey) {
        query['ExclusiveStartKey'] = JSON.parse(req.headers.lastevaluatedkey);
    }

    dynamoClient.query(query, (err, primaryData) => {
        if (err) res.status(404).json(`Error getting club history for user at #primary level: ${err}`);
        else {
            // Fetching required details of all these clubs

            console.log('fetched clubs with only clubName for history timeline', primaryData);

            const _transactItems = [];

            primaryData['Items'].forEach((element) => {
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
                else {
                    console.log(data);
                    res.status(200).json({
                        "historyClubs": data["Items"],
                        'lastevaluatedkey': primaryData["LastEvaluatedKey"]
                    });
                }
            });
        }
    });

});


module.exports = router;
