const router = require('express').Router();

const {
    clubCreatorIdIndex,
    sortKeyWithTimestampIndex,
    dynamoClient,
    myTable
} = require('../config');


// required
// headers - "lastevaluatedkey"  (optional)
// query parameters - "upcoming" (true/false), to get only upcoming and live clubs of user.

router.get('/:userId/organized', async (req, res) => {

    const userId = req.params.userId;

    const upcoming = req.query.upcoming;


    const query = {
        TableName: myTable,
        IndexName: clubCreatorIdIndex,
        KeyConditions: {
            "ClubCreatorIdField": {
                "ComparisonOperator": "EQ",
                "AttributeValueList": [`USER#${userId}`]
            },
        },

        AttributesToGet: ['clubId', 'creator', 'clubName', 'category', 'scheduleTime',
            'clubAvatar', 'tags', 'isLive', 'subCategory',
            'estimatedAudience', 'participants'
        ],
        ScanIndexForward: false,
    };

    if (upcoming === true) {
        const currentDate = new Date();
        currentDate.setHours(currentDate.getHours() - 12); // setting it 12 hours slow (to get all the clubs within last 12 hours , may be in playing state)
        const thresholdTime = Date.parse(currentDate);

        query['KeyConditions']['scheduleTime'] = {
            ComparisonOperator: 'GT',
            AttributeValueList: [thresholdTime]
        };

        query['QueryFilter'] = {
            'isConcluded': {
                ComparisonOperator: 'NE',
                AttributeValueList: [true]
            }
        };

    } else {
        query['Limit'] = 10;
    }

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

router.get('/:userId/history', async (req, res) => {
    const userId = req.params.userId;
    const query = {
        TableName: myTable,
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
    };

    if (req.headers.lastevaluatedkey) {
        query['ExclusiveStartKey'] = JSON.parse(req.headers.lastevaluatedkey);
    }

    dynamoClient.query(query, (err, primaryData) => {
        if (err) res.status(404).json(`Error getting club history for user at #primary level: ${err}`);
        else {
            // Fetching required details of all these clubs

            console.log('fetched clubs with only clubId for history timeline', primaryData);


            const _batchQuery = {
                RequestItems: {
                    'MyTable': {
                        Keys: [],
                        AttributesToGet: ['clubId', 'creator', 'clubName', 'category', 'scheduleTime',
                            'clubAvatar', 'tags', 'isLive', 'subCategory',
                            'estimatedAudience', 'participants'
                        ],
                        ConsistentRead: false,
                    }
                }
            };


            primaryData['Items'].forEach((element) => {
                _batchQuery.RequestItems.MyTable.Keys.push({
                    P_K: `CLUB#${element.clubId}`,
                    S_K: `CLUBMETA#${element.clubId}`
                });
            });



            dynamoClient.batchGet(_batchQuery, (err, data) => {
                if (err) res.status(404).json(`Error getting club history for user: ${err}`);
                else {
                    console.log(data);
                    var historyClubs = data['Responses']['MyTable'];

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