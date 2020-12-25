const router = require('express').Router();

const { clubCreatorIdIndex, sortKeyWithTimestampIndex, dynamoClient, tableName } = require('../config');


// required
// headers - "lastevaluatedkey"  (optional)

router.get('/:userId/organized', (req, res) => {

    const userId = req.params.userId;

    const query = {
        TableName: tableName,
        IndexName: clubCreatorIdIndex,
        KeyConditions: {
            "ClubCreatorIdField": {
                "ComparisonOperator": "EQ",
                "AttributeValueList": [`USER#${userId}`]
            },
        },
        AttributesToGet: [
            'clubId', 'clubName', 'creator', 'category', 'scheduleTime', 'clubAvatar', 'tags', 'duration'
        ],
        Limit: 10,
        ScanIndexForward: false,
        ReturnConsumedCapacity: "INDEXES"
    };

    console.log(req.headers.lastevaluatedkey);
    console.log(req.headers.lastevaluatedkey);
    console.log(req.headers.lastevaluatedkey);
    console.log(req.headers.lastevaluatedkey);
    console.log(req.headers.lastevaluatedkey);
    console.log(req.headers.lastevaluatedkey);
    console.log(req.headers.lastevaluatedkey);
    console.log(req.headers.lastevaluatedkey);
    console.log(req.headers.lastevaluatedkey);
    console.log(req.headers.lastevaluatedkey);

    if (req.headers.lastevaluatedkey) {
        query['ExclusiveStartKey'] = JSON.parse(req.headers.lastevaluatedkey);
    }

    dynamoClient.query(query, (err, data) => {
        if (err) res.status(404).json(err);
        else {
            console.log(data);
            res.status(200).json({
                "clubs": data["Items"],
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
        IndexName: sortKeyWithTimestampIndex,
        KeyConditions: {
            "S_K": {
                "ComparisonOperator": "EQ",
                "AttributeValueList": [`AUDIENCE#${userId}`]
            },
        },
        AttributesToGet: ['clubId'],
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

            console.log('fetched clubs with only clubId for history timeline', primaryData);

            const _transactItems = [];

            primaryData['Items'].forEach((element) => {
                _transactItems.push({
                    Get: {
                        TableName: tableName,
                        Key: {
                            P_K: `CLUB#${element.clubId}`,
                            S_K: `CLUBMETA#${element.clubId}`
                        },
                        AttributesToGet: [
                            'clubId', 'clubName', 'creator', 'category', 'scheduleTime', 'clubAvatar', 'tags', 'duration'
                        ]
                    }
                });
            });

            const _transactQuery = { TransactItems: _transactItems };

            dynamoClient.transactGet(_transactQuery, (err, data) => {
                if (err) res.status(404).json(`Error getting club history for user: ${err}`);
                else {
                    console.log(data);
                    var historyClubs = [];
                    data['Responses'].map((response) => {
                        historyClubs.push(response['Item']);
                    })
                    res.status(200).json({
                        "clubs": historyClubs,
                        'lastevaluatedkey': primaryData["LastEvaluatedKey"]
                    });
                }
            });
        }
    });

});


module.exports = router;
