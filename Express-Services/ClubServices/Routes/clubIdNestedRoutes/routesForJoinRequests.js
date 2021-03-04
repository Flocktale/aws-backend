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
    postParticipantListToWebsocketUsers,
    postNewJoinRequestToWebsocketUser,
    postJoinRequestResponseToWebsocketUser,
} = require('../../Functions/websocketFunctions');

const {
    publishNotification
} = require('../../Functions/notificationFunctions');
const Constants = require('../../constants');

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
        res.status(400).json('userId  is required');
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
            AttributesToGet: ['clubId', 'status',
                'joinRequestAttempts', 'audience', 'timestamp', 'invitationId'
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
        if (audienceDoc.status === Constants.AudienceStatus.Participant) {
            //  conflict (409) since user is already a partcipant.
            res.status(409).json('User is already a participant');
            return;
        } else if (audienceDoc.status === Constants.AudienceStatus.ActiveJoinRequest) {
            //  conflict (409) since user already have an active join request.
            res.status(409).json('Join request is already pending!');
            return;
        } else if (audienceDoc.status === Constants.AudienceStatus.Blocked) {
            //  conflict (409) since user is blocked.
            res.status(409).json('User is blocked from club!!!, better watch for it.');
            return;
        }

        // Now, this is the fresh request!!!
        const newTimestamp = Date.now();

        audienceDoc['status'] = Constants.AudienceStatus.ActiveJoinRequest;
        audienceDoc['timestamp'] = newTimestamp;

        const result = await AudienceSchemaWithDatabaseKeys.validateAsync(audienceDoc);

        var _audienceUpdateQuery = {
            TableName: tableName,
            Key: {
                P_K: result.P_K,
                S_K: result.S_K
            },
            UpdateExpression: 'set #status = :status, AudienceDynamicField = :dynamicField, joinRequestAttempts = joinRequestAttempts + :counter, UsernameSortField = :usf',
            ExpressionAttributeNames: {
                '#status': 'status',
            },
            ExpressionAttributeValues: {
                ':status': audienceDoc.status,
                ':dynamicField': result.AudienceDynamicField,
                ':counter': 1,
                ':usf': result.UsernameSortField,
            }
        };

        if (audienceDoc.invitationId) {
            // if any pending invitation exists (which should not exists while on this api, this is a case of bad implementation)
            //  we are removing this now
            console.error('invitationId existed when calling join request api, which should not be, amend required implementations');
            _audienceUpdateQuery['UpdateExpression'] += ' REMOVE invitationId';
        }

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

        await dynamoClient.transactWrite(_transactQuery).promise();

        // sending notification and websocket message to club owner
        const {
            clubName,
            creator,
        } = await _getClubData({
            clubId: clubId,
            creatorAttr: true,
        });

        // we don't need to save these notifications in database as they are temporary.
        var notificationObj = {
            title: 'New join request from ' + audienceDoc.audience.username + ' on' + clubName,
        }


        // sending websocket msg.
        await postNewJoinRequestToWebsocketUser({
            creatorId: creator.userId,
            username: audienceDoc.audience.username,
            clubId: clubId,
        });

        await publishNotification({
            userId: creator.userId,
            notifData: notificationObj
        });


        return res.status(201).json('posted join request');

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
        ConditionExpression: '#status = :status',
        UpdateExpression: 'REMOVE #status, AudienceDynamicField, UsernameSortField',
        ExpressionAttributeNames: {
            '#status': 'status',
        },
        ExpressionAttributeValues: {
            ':status': Constants.AudienceStatus.ActiveJoinRequest,
        }
    };

    dynamoClient.update(_audienceUpdateQuery, (err, data) => {
        if (err) res.status(404).json(`Error in deleting join request: ${err}`);
        else {
            return res.status(202).json('Deleted join request');
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
            AttributesToGet: ['status', 'audience', 'timestamp', 'invitationId'],
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



    if (audienceDoc.status !== Constants.AudienceStatus.ActiveJoinRequest) {
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

        audienceDoc['status'] = Constants.AudienceStatus.Participant;
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
            UpdateExpression: 'SET #status = :status, AudienceDynamicField = :adf REMOVE UsernameSortField',
            ExpressionAttributeNames: {
                '#status': 'status',
            },
            ExpressionAttributeValues: {
                ':adf': result.AudienceDynamicField,
                ':status': result.status,
            },
        };

        if (audienceDoc.invitationId) {
            // if any pending invitation exists

            // we don't need to mention REMOVE word here as it is already in there.
            _audienceUpdateQuery['UpdateExpression'] += ', invitationId';

        }


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



            // sending websocket msg to this user.
            await postJoinRequestResponseToWebsocketUser({
                userId: audienceDoc.audience.userId,
                clubId: clubId,
                response: 'accept'
            });

            const {
                clubName
            } = await _getClubData({
                clubId: clubId
            });

            // sending notification
            notificationObj['title'] = 'Congratulations, you are now a panelist on ' + clubName;
            await publishNotification({
                userId: audienceId,
                notifData: notificationObj
            });

            // sending new participant list to all connected users.
            await postParticipantListToWebsocketUsers(clubId);


            return res.status(201).json('Accepted join request');
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
            UpdateExpression: 'REMOVE #status, AudienceDynamicField, UsernameSortField',

            ExpressionAttributeNames: {
                '#status': 'status',
            },

        };


        if (audienceDoc.invitationId) {
            // if any pending invitation exists

            // we don't need to mention REMOVE word here as it is already in there.
            _audienceUpdateQuery['UpdateExpression'] += ', invitationId';

        }

        dynamoClient.update(_audienceUpdateQuery, async (err, data) => {
            if (err) res.status(404).json(`Error in cancelling join request: ${err}`);
            else {

                // sending websocket msg to this user.
                await postJoinRequestResponseToWebsocketUser({
                    userId: audienceDoc.audience.userId,
                    clubId: clubId,
                    response: 'cancel',
                });

                // sending notification
                const {
                    clubName
                } = await _getClubData({
                    clubId: clubId
                });
                notificationObj['title'] = 'Your request to speak could not be fulfilled on  ' + clubName;
                await publishNotification({
                    userId: audienceId,
                    notifData: notificationObj
                });

                return res.status(202).json('Cancelled join request');

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
}) {
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
    return data;
}



module.exports = router;