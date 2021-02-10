const router = require('express').Router();
const Joi = require('joi');

const {
    AudienceSchemaWithDatabaseKeys,
    AudienceSchema
} = require('../../Schemas/Audience');
const {
    CountParticipantSchema,
    CountJoinRequestSchema
} = require('../../Schemas/AtomicCountSchemas');

const {
    audienceDynamicDataIndex,
    dynamoClient,
    tableName,
    usernameSortIndex,
} = require('../../config');

const {
    postParticipantListToWebsocketUsers
} = require('./websocketFunctions');

const {
    publishNotification
} = require('./notificationFunctions');

// required
// headers - "lastevaluatedkey"  (optional)

router.get('/', async (req, res) => {

    const clubId = req.clubId;

    const query = {
        TableName: tableName,
        IndexName: audienceDynamicDataIndex,
        Limit: 30,
        KeyConditions: {
            "P_K": {
                "ComparisonOperator": "EQ",
                "AttributeValueList": [`CLUB#${clubId}`]
            },
            "AudienceDynamicField": {
                "ComparisonOperator": "BEGINS_WITH",
                "AttributeValueList": [`ActiveJoinRequest#`]
            },
        },
        AttributesToGet: ['audience', 'timestamp'],
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
                "activeJoinRequestUsers": data["Items"],
                'lastevaluatedkey': data["LastEvaluatedKey"]
            });
        }
    });

});


// required         // search join requesters by their username
// query parameters - "searchString"
// headers - "lastevaluatedkey"  (optional)

router.get('/query', async (req, res) => {

    const clubId = req.clubId;
    const searchString = req.query.searchString;

    if (!searchString) {
        return res.status(400).json('searchString is required');
    }

    const query = {
        TableName: tableName,
        IndexName: usernameSortIndex,
        Limit: 10,
        KeyConditions: {
            "P_K": {
                "ComparisonOperator": "EQ",
                "AttributeValueList": [`CLUB#${clubId}`]
            },
            "UsernameSortField": {
                "ComparisonOperator": "BEGINS_WITH",
                "AttributeValueList": [`JOIN-REQUESTER-USERNAME-SORT#${searchString}`]
            },
        },
        AttributesToGet: ['audience', 'timestamp'],
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
            return res.status(200).json({
                "activeJoinRequestUsers": data["Items"],
                'lastevaluatedkey': data["LastEvaluatedKey"]
            });
        }
    });

});

//required
// query parameters - "userId"
router.post('/', async (req, res) => {
    // There is no seperate schema for join requests, instead we use AudienceDynamicField

    const clubId = req.clubId;
    const audienceId = req.query.userId;


    if (!audienceId) {
        res.status(400).json('audienceId is required');
        return;
    }

    let audienceDoc;

    try {
        // fetching audience info for this club
        const _audienceDocQuery = {
            TableName: tableName,
            Key: {
                P_K: `CLUB#${clubId}`,
                S_K: `AUDIENCE#${audienceId}`,
            },
            AttributesToGet: ['clubId', 'isParticipant', 'joinRequested',
                'joinRequestAttempts', 'audience', 'timestamp'
            ],
        };

        audienceDoc = (await dynamoClient.get(_audienceDocQuery).promise())['Item'];

        if (!audienceDoc) {
            res.status(404).json("This user doesn't exist as audience");
            return;
        }
    } catch (error) {
        console.log("This user doesn't exist as audience, completed with error: ", error);
        res.status(404).json("This user doesn't exist as audience, function completed with error");
        return;
    }



    try {
        if (audienceDoc.isPartcipant === true) {
            //  conflict (409) since user is already a partcipant.
            res.status(409).json('User is already a participant');
            return;
        } else if (audienceDoc.joinRequested === true) {
            //  conflict (409) since user already have an active join request.
            res.status(409).json('Join request is already pending!');
            return;
        }

        // Now, this is the fresh request!!!
        const newTimestamp = Date.now();

        audienceDoc['joinRequested'] = true;
        audienceDoc['timestamp'] = newTimestamp;

        const result = await AudienceSchemaWithDatabaseKeys.validateAsync(audienceDoc);

        const _audienceUpdateQuery = {
            TableName: tableName,
            Key: {
                P_K: result.P_K,
                S_K: result.S_K
            },
            UpdateExpression: 'set joinRequested = :request, AudienceDynamicField = :dynamicField, joinRequestAttempts = joinRequestAttempts + :counter, UsernameSortField = :usf',
            ExpressionAttributeValues: {
                ':request': true,
                ':dynamicField': result.AudienceDynamicField,
                ':counter': 1,
                ':usf': result.UsernameSortField,
            }
        };

        const counterDoc = await CountJoinRequestSchema.validateAsync({
            clubId: clubId
        });

        const _counterUpdateQuery = {
            TableName: tableName,
            Key: {
                P_K: counterDoc.P_K,
                S_K: counterDoc.S_K
            },
            UpdateExpression: 'set #cnt = #cnt + :counter',
            ExpressionAttributeNames: {
                '#cnt': 'count'
            },
            ExpressionAttributeValues: {
                ':counter': 1,
            }
        }

        const _transactQuery = {
            TransactItems: [{
                    Update: _audienceUpdateQuery
                },
                {
                    Update: _counterUpdateQuery
                }
            ]
        };

        dynamoClient.transactWrite(_transactQuery, (err, data) => {
            if (err) res.status(404).json(`Error in join request to club: ${err}`);
            else {
                console.log(data);
                res.status(201).json('posted join request');

                // sending notification
                _getClubData({
                    clubId: clubId,
                    creatorAttr: true,
                }, ({
                    clubName,
                    creator,
                }) => {
                    // we don't need to save these notifications in database as they are temporary.
                    var notificationObj = {
                        title: 'New join request from ' + audienceDoc.audience.username + ' on' + clubName,
                    }

                    publishNotification({
                        userId: creator.userId,
                        notifData: notificationObj
                    });
                });
            }
        });


    } catch (error) {
        console.log(error);
        res.status(400).json(error);
        return;
    }
});


//required
// query parameters - "userId"

router.delete('/', async (req, res) => {
    // we don't decrement counter for join requests because it does not account for unique requests.

    const clubId = req.clubId;
    const audienceId = req.query.userId;


    if (!audienceId) {
        res.status(400).json('audienceId is required');
        return;
    }

    const _audienceUpdateQuery = {
        TableName: tableName,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `AUDIENCE#${audienceId}`,
        },
        ConditionExpression: ' joinRequested = :tr ',
        UpdateExpression: 'SET joinRequested = :fal REMOVE AudienceDynamicField, UsernameSortField',
        ExpressionAttributeValues: {
            ':tr': true,
            ':fal': false,
        }
    };

    dynamoClient.update(_audienceUpdateQuery, (err, data) => {
        if (err) res.status(404).json(`Error in deleting join request: ${err}`);
        else {
            console.log(data);
            res.status(202).json('Deleted join request');
        }
    });

});


// query parameters - "audienceId", "action"

router.post('/response', async (req, res) => {

    const clubId = req.clubId;

    const requestAction = req.query.action;

    const audienceId = req.query.audienceId;

    if (!audienceId) {
        res.status(400).json('audienceId is required');
        return;
    }


    try {
        const _schema = Joi.string().valid('accept', 'cancel').required();
        await _schema.validateAsync(requestAction);
    } catch (error) {
        res.status(400).json('invalid response , valid => accept or cancel');
        return;
    }


    let audienceDoc;

    try {
        // fetching audience info for this club
        const _audienceDocQuery = {
            TableName: tableName,
            Key: {
                P_K: `CLUB#${clubId}`,
                S_K: `AUDIENCE#${audienceId}`,
            },
            AttributesToGet: ['joinRequested', 'audience', 'timestamp'],
        };

        audienceDoc = (await dynamoClient.get(_audienceDocQuery).promise())['Item'];

        if (!audienceDoc) {
            res.status(404).json("This user doesn't exist as audience");
            return;
        }
    } catch (error) {
        console.log("This user doesn't exist as audience, completed with error: ", error);
        res.status(404).json("This user doesn't exist as audience, function completed with error");
        return;
    }



    if (audienceDoc.joinRequested !== true) {
        res.status(404).json("This user has no active join request.");
        return;
    }

    // we don't need to save these notifications in database as they are temporary.
    var notificationObj = {
        title: 'undefined',
        image: `https://mootclub-public.s3.amazonaws.com/clubAvatar/${clubId}`,
    }



    if (requestAction === 'accept') {


        const newTimestamp = Date.now();

        audienceDoc['joinRequested'] = false;
        audienceDoc['isPartcipant'] = true;
        audienceDoc['timestamp'] = newTimestamp;
        audienceDoc['clubId'] = clubId;

        var result;

        try {
            result = await AudienceSchemaWithDatabaseKeys.validateAsync(audienceDoc);
        } catch (error) {
            console.log(error);
            res.status(500).json(error);
            return;
        }

        const _audienceUpdateQuery = {
            TableName: tableName,
            Key: {
                P_K: result.P_K,
                S_K: result.S_K
            },
            UpdateExpression: 'SET joinRequested = :fal, AudienceDynamicField = :adf, isPartcipant = :tr REMOVE UsernameSortField',
            ExpressionAttributeValues: {
                ':fal': false,
                ':tr': true,
                ':adf': result.AudienceDynamicField,
            },
        };


        const counterDoc = await CountParticipantSchema.validateAsync({
            clubId: clubId
        });

        const _counterUpdateQuery = {
            TableName: tableName,
            Key: {
                P_K: counterDoc.P_K,
                S_K: counterDoc.S_K
            },
            UpdateExpression: 'set #cnt = #cnt + :counter', //incrementing
            ExpressionAttributeNames: {
                '#cnt': 'count'
            },
            ExpressionAttributeValues: {
                ':counter': 1,
            }
        }


        const _transactQuery = {
            TransactItems: [{
                    Update: _audienceUpdateQuery
                },
                {
                    Update: _counterUpdateQuery
                },
            ]
        };

        try {
            await dynamoClient.transactWrite(_transactQuery).promise();
            res.status(201).json('Accepted join request');

            // sending new participant list to all connected users.
            postParticipantListToWebsocketUsers(clubId);

            // sending notification
            _getClubData({
                clubId: clubId
            }, ({
                clubName
            }) => {
                notificationObj['title'] = 'Congratulations, you are now a panelist on ' + clubName;
                publishNotification({
                    userId: audienceId,
                    notifData: notificationObj
                });

            });

        } catch (error) {
            res.status(404).json(`Error accepting join request: ${error}`);
        }




    } else if (requestAction === 'cancel') {


        const _audienceUpdateQuery = {
            TableName: tableName,
            Key: {
                P_K: `CLUB#${clubId}`,
                S_K: `AUDIENCE#${audienceId}`
            },
            UpdateExpression: 'SET joinRequested = :fal REMOVE AudienceDynamicField, UsernameSortField',
            ExpressionAttributeValues: {
                ':fal': false,
            },

        };

        dynamoClient.update(_audienceUpdateQuery, (err, data) => {
            if (err) res.status(404).json(`Error in cancelling join request: ${err}`);
            else {
                console.log(data);
                res.status(202).json('Cancelled join request');

                // sending notification
                _getClubData({
                    clubId: clubId
                }, ({
                    clubName
                }) => {
                    notificationObj['title'] = 'Your request to speak could not be fulfilled on  ' + clubName;
                    publishNotification({
                        userId: audienceId,
                        notifData: notificationObj
                    });

                });
            }
        });

    } else {
        res.status(501).json('request has hit a dead end');
        return;
    }

});

async function _getClubData({
    clubId,
    nameAttr = true,
    creatorAttr = false,
}, callback) {
    if (!clubId) {
        return;
    }
    const _clubQuery = {
        TableName: tableName,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `CLUBMETA#${clubId}`
        },
        AttributesToGet: ['clubName'],
    }
    if (creatorAttr === true) {
        _clubQuery['AttributesToGet'].push('creator');
    }

    const data = (await dynamoClient.get(_clubQuery).promise())['Item'];
    if (data) {
        callback(data);
    }
}



module.exports = router;