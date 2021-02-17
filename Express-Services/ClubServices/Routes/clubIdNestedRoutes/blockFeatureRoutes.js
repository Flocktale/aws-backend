const router = require('express').Router();

const {
    audienceDynamicDataIndex,
    dynamoClient,
    tableName
} = require('../../config');

const {
    AudienceSchemaWithDatabaseKeys
} = require('../../Schemas/Audience');

const {
    CountParticipantSchema
} = require('../../Schemas/AtomicCountSchemas');

const {
    publishNotification
} = require('../../Functions/notificationFunctions')


const {
    postParticipantListToWebsocketUsers,
    postBlockMessageToWebsocketUser,
} = require('../../Functions/websocketFunctions');


router.get('/', async (req, res) => {

    const clubId = req.clubId;

    const query = {
        TableName: tableName,
        IndexName: audienceDynamicDataIndex,
        KeyConditions: {
            "P_K": {
                "ComparisonOperator": "EQ",
                "AttributeValueList": [`CLUB#${clubId}`]
            },
            "AudienceDynamicField": {
                "ComparisonOperator": "BEGINS_WITH",
                "AttributeValueList": [`Blocked#`]
            },
        },
        AttributesToGet: ['audience', 'timestamp'],
        ScanIndexForward: false,
        ReturnConsumedCapacity: "INDEXES"
    };

    dynamoClient.query(query, (err, data) => {
        if (err) res.status(404).json(err);
        else {
            console.log(data);
            res.status(200).json(data['Items']);
        }
    });

});


// required
// query parameters - "audienceId"
router.post('/', async (req, res) => {
    const clubId = req.clubId;

    const audienceId = req.query.audienceId;

    if (!audienceId) {
        res.status(400).json('audienceId is required');
        return;
    }

    // fetching audience info for this club
    const _audienceDocQuery = {
        TableName: tableName,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `AUDIENCE#${audienceId}`,
        },
        AttributesToGet: ['audience', 'isParticipant', 'isBlocked', 'invitationId'],
    };

    var audienceDoc = (await dynamoClient.get(_audienceDocQuery).promise())['Item'];


    if (!audienceDoc) {
        res.status(404).json("This user doesn't exist as audience");
        return;
    }

    if (audienceDoc.isBlocked === true) {
        res.status(404).json('This user is already blocked');
        return;
    }

    const wasParticipant = audienceDoc.isParticipant;

    audienceDoc['clubId'] = clubId;
    audienceDoc['isBlocked'] = true;
    audienceDoc['isParticipant'] = false;
    audienceDoc['timestamp'] = Date.now();

    try {
        audienceDoc = await AudienceSchemaWithDatabaseKeys.validateAsync(audienceDoc);
    } catch (error) {
        console.log('error in validating audience schema while blocking user: ', error);
        return res.status(500).json('error in validating audience schema');
    }



    // updating all possible attriubtes

    const _audienceBlockQuery = {
        TableName: tableName,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `AUDIENCE#${audienceId}`
        },
        UpdateExpression: 'SET #tsp = :tsp, isParticipant = :fal, joinRequested = :fal, isBlocked = :tr, AudienceDynamicField = :adf REMOVE TimestampSortField, UsernameSortField',
        ExpressionAttributeNames: {
            '#tsp': 'timestamp',
        },
        ExpressionAttributeValues: {
            ':tsp': audienceDoc.timestamp,
            ':fal': false,
            ':tr': true,
            ':adf': audienceDoc.AudienceDynamicField,
        }
    }

    if (audienceDoc.invitationId) {
        // if any invitation exists for this user, delete that.
        _audienceBlockQuery['UpdateExpression'] += ', invitationId';
    }


    const _transactQuery = {
        TransactItems: [{
            Update: _audienceBlockQuery
        }]
    };

    if (wasParticipant === true) {
        // decrementing participant counter
        const counterDoc = await CountParticipantSchema.validateAsync({
            clubId: clubId
        });

        const _counterUpdateQuery = {
            TableName: tableName,
            Key: {
                P_K: counterDoc.P_K,
                S_K: counterDoc.S_K
            },
            UpdateExpression: 'set #cnt = #cnt - :counter', // decrementing
            ExpressionAttributeNames: {
                '#cnt': 'count'
            },
            ExpressionAttributeValues: {
                ':counter': 1,
            }
        }
        _transactQuery.TransactItems.push({
            Update: _counterUpdateQuery
        });
    }


    dynamoClient.transactWrite(_transactQuery, async (err, data) => {
        if (err) res.status(400).json(`Error in blocking from club : ${err}`);
        else {
            console.log(data);


            // send a message through websocket to user.
            await postBlockMessageToWebsocketUser({
                clubId: clubId,
                blockAction: "blocked",
                userId: audienceId
            });


            // send notification to affected user
            const {
                clubName
            } = await _getClubData(clubId);

            var notifData = {
                title: 'You are blocked from  ' + clubName,
                image: `https://mootclub-public.s3.amazonaws.com/clubAvatar/${clubId}`,
            }
            await publishNotification({
                userId: audienceId,
                notifData: notifData
            });


            if (wasParticipant === true) {
                // send updated participant list to club subscribers.
                await postParticipantListToWebsocketUsers(clubId);
            }

            return res.status(202).json('blocked user');


        }
    });
});


async function _getClubData(clubId) {
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


    const data = (await dynamoClient.get(_clubQuery).promise())['Item'];
    return data;

}

// required
// query parameters - "audienceId"

router.delete('/', async (req, res) => {
    const clubId = req.clubId;

    const audienceId = req.query.audienceId;

    if (!audienceId) {
        res.status(400).json('audienceId is required');
        return;
    }

    // fetching audience info for this club
    const _audienceDocQuery = {
        TableName: tableName,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `AUDIENCE#${audienceId}`,
        },
        AttributesToGet: ['audience', 'isBlocked'],
    };

    var audienceDoc = (await dynamoClient.get(_audienceDocQuery).promise())['Item'];

    if (!audienceDoc) {
        res.status(404).json("This user doesn't exist for this club");
        return;
    }

    if (audienceDoc.isBlocked !== true) {
        res.status(404).json('This user is unblocked already. ')
        return;
    }


    audienceDoc['clubId'] = clubId;
    audienceDoc['isBlocked'] = false;
    audienceDoc['timestamp'] = Date.now();

    try {
        audienceDoc = await AudienceSchemaWithDatabaseKeys.validateAsync(audienceDoc);
    } catch (error) {
        console.log('error in validating audience schema while blocking user: ', error);
        return res.status(500).json('error in validating audience schema');
    }

    // updating all possible attriubtes
    const _attributeUpdates = {
        timestamp: {
            "Action": "PUT",
            "Value": audienceDoc.timestamp
        },

        isBlocked: {
            "Action": "PUT",
            "Value": false
        },
        AudienceDynamicField: {
            "Action": "DELETE"
        },
        TimestampSortField: {
            "Action": "PUT",
            "Value": audienceDoc.TimestampSortField,
        },
    };

    const _audienceUnblockQuery = {
        TableName: tableName,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `AUDIENCE#${audienceId}`
        },
        AttributeUpdates: _attributeUpdates,
    }


    // audience counter is not incremented here, as it was not decremented when blocking user
    // to prevent blocked user data being shown up in list of all audience, we delete TimestampSortField,
    /// which is used by GSI TimestampSortIndex to display list of audience.

    dynamoClient.update(_audienceUnblockQuery, async (err, data) => {
        if (err) res.status(400).json(`Error in unblocking from club : ${err}`);
        else {

            // send notification to affected user
            const {
                clubName
            } = await _getClubData(clubId);

            // send a message through websocket to user.
            await postBlockMessageToWebsocketUser({
                clubId: clubId,
                blockAction: "unblocked",
                userId: audienceId
            });


            var notifData = {
                title: 'No more blocking from  ' + clubName + '. You can listen to it now.',
                image: `https://mootclub-public.s3.amazonaws.com/clubAvatar/${clubId}`,
            }
            await publishNotification({
                userId: audienceId,
                notifData: notifData
            });

            return res.status(202).json('unblocked user');


        }

    });



})

module.exports = router;