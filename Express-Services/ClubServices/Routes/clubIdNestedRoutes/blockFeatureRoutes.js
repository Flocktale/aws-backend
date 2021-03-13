const router = require('express').Router();

const {
    audienceDynamicDataIndex,
    dynamoClient,
    myTable
} = require('../../config');

const {
    AudienceSchemaWithDatabaseKeys
} = require('../../Schemas/Audience');

const {
    CountParticipantSchema
} = require('../../Schemas/AtomicCountSchemas');



const {
    postBlockMessageToWebsocketUser,
} = require('../../Functions/websocketFunctions');


const Constants = require('../../constants');

const {
    decrementAudienceCount
} = require('../../Functions/clubFunctions');
const {
    pushToWsMsgQueue,
    pushToPostNotificationQueue,
} = require('../../Functions/sqsFunctions');


router.get('/', async (req, res) => {

    const clubId = req.clubId;

    const query = {
        TableName: myTable,
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
        TableName: myTable,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `AUDIENCE#${audienceId}`,
        },
        AttributesToGet: ['audience', 'status', 'invitationId', 'isOwner'],
    };

    var audienceDoc = (await dynamoClient.get(_audienceDocQuery).promise())['Item'];


    if (!audienceDoc) {
        res.status(404).json("This user doesn't exist as audience");
        return;
    }

    if (audienceDoc.isOwner === true) {
        res.status(400).json('Can not block the owner of this club');
        return;
    }

    if (audienceDoc.status === Constants.AudienceStatus.Blocked) {
        res.status(404).json('This user is already blocked');
        return;
    }

    const wasParticipant = (audienceDoc.status === Constants.AudienceStatus.Participant);

    audienceDoc['clubId'] = clubId;
    audienceDoc['status'] = Constants.AudienceStatus.Blocked;
    audienceDoc['timestamp'] = Date.now();

    try {
        audienceDoc = await AudienceSchemaWithDatabaseKeys.validateAsync(audienceDoc);
    } catch (error) {
        console.log('error in validating audience schema while blocking user: ', error);
        return res.status(500).json('error in validating audience schema');
    }



    // updating all possible attriubtes

    const _audienceBlockQuery = {
        TableName: myTable,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `AUDIENCE#${audienceId}`
        },
        UpdateExpression: 'SET #tsp = :tsp, #status = :status, AudienceDynamicField = :adf REMOVE TimestampSortField, UsernameSortField',
        ExpressionAttributeNames: {
            '#tsp': 'timestamp',
            '#status': 'status',
        },
        ExpressionAttributeValues: {
            ':tsp': audienceDoc.timestamp,
            ':status': audienceDoc.status,
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
            TableName: myTable,
            Key: {
                P_K: counterDoc.P_K,
                S_K: counterDoc.S_K
            },
            UpdateExpression: 'ADD #cnt :counter', // decrementing
            ExpressionAttributeNames: {
                '#cnt': 'count'
            },
            ExpressionAttributeValues: {
                ':counter': -1,
            }
        }

        _transactQuery.TransactItems.push({
            Update: _counterUpdateQuery
        });

        // deleting this participant's username from club data.
        const _participantInClubUpdateQuery = {
            TableName: myTable,
            Key: {
                P_K: `CLUB#${clubId}`,
                S_K: `CLUBMETA#${clubId}`,
            },
            UpdateExpression: 'DELETE participants :prtUser',
            ExpressionAttributeValues: {
                ':prtUser': dynamoClient.createSet([audienceDoc.audience.username]),
            }
        };


        _transactQuery.TransactItems.push({
            Update: _participantInClubUpdateQuery
        });
    }


    dynamoClient.transactWrite(_transactQuery, async (err, data) => {
        if (err) res.status(400).json(`Error in blocking from club : ${err}`);
        else {
            console.log(data);


            var promises = [];


            // send a message through websocket to user.
            promises.push(postBlockMessageToWebsocketUser({
                clubId: clubId,
                blockAction: "blocked",
                userId: audienceId
            }));


            // send notification to affected user
            const {
                clubName
            } = await _getClubData(clubId);

            var notifData = {
                title: 'You are blocked from  ' + clubName,
                image: Constants.ClubAvatarUrl(clubId),
            }



            promises.push(pushToPostNotificationQueue({
                action: Constants.PostNotificationQueueAction.send,
                userId: audienceId,
                notifData: notifData
            }));

            // if this user was not a participant, then remove its count contribution from audience
            if (wasParticipant !== true) {
                promises.push(decrementAudienceCount(clubId));
            }


            if (wasParticipant === true) {
                // send updated participant list to club subscribers.
                promises.push(pushToWsMsgQueue({
                    action: Constants.WsMsgQueueAction.postParticipantList,
                    MessageGroupId: clubId,
                    attributes: {
                        clubId: clubId,
                    }
                }));
            }

            await Promise.all(promises);

            return res.status(202).json('blocked user');


        }
    });
});


async function _getClubData(clubId) {
    if (!clubId) {
        return;
    }
    const _clubQuery = {
        TableName: myTable,
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
        TableName: myTable,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `AUDIENCE#${audienceId}`,
        },
        AttributesToGet: ['audience', 'status'],
    };

    var audienceDoc = (await dynamoClient.get(_audienceDocQuery).promise())['Item'];

    if (!audienceDoc) {
        res.status(404).json("This user doesn't exist for this club");
        return;
    }

    if (audienceDoc.status !== Constants.AudienceStatus.Blocked) {
        res.status(404).json('This user is unblocked already. ')
        return;
    }


    // updating all possible attriubtes
    const _attributeUpdates = {
        timestamp: {
            "Action": "PUT",
            "Value": Date.now()
        },
        status: {
            "Action": "DELETE",
        },
        AudienceDynamicField: {
            "Action": "DELETE"
        },
    };

    const _audienceUnblockQuery = {
        TableName: myTable,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `AUDIENCE#${audienceId}`
        },
        AttributeUpdates: _attributeUpdates,
    }

    dynamoClient.update(_audienceUnblockQuery, async (err, data) => {
        if (err) res.status(400).json(`Error in unblocking from club : ${err}`);
        else {

            // send notification to affected user
            const {
                clubName
            } = await _getClubData(clubId);

            var promises = [];

            // send a message through websocket to user.
            promises.push(postBlockMessageToWebsocketUser({
                clubId: clubId,
                blockAction: "unblocked",
                userId: audienceId
            }));

            var notifData = {
                title: 'No more blocking from  ' + clubName + '. You can listen to it now.',
                image: Constants.ClubAvatarUrl(clubId),
            }

            promises.push(pushToPostNotificationQueue({
                action: Constants.PostNotificationQueueAction.send,
                userId: audienceId,
                notifData: notifData
            }));

            await Promise.all(promises);

            return res.status(202).json('unblocked user');

        }

    });
})

module.exports = router;