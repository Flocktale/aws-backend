const router = require('express').Router();

const {
    CountParticipantSchema
} = require('../../Schemas/AtomicCountSchemas');

const {
    audienceDynamicDataIndex,
    dynamoClient,
    myTable
} = require('../../config');


const {
    postKickOutMessageToWebsocketUser,
} = require('../../Functions/websocketFunctions');

const {
    incrementAudienceCount
} = require('../../Functions/clubFunctions');

const Constants = require('../../constants');

const {
    pushToWsMsgQueue,
    pushToPostNotificationQueue
} = require('../../Functions/sqsFunctions');

// required
// query parameters - 
//              "audienceId" , 
//              "isSelf" (true if a participant kicks themsemves with their own wish)

router.post('/', async (req, res) => {
    const clubId = req.clubId;

    const audienceId = req.query.audienceId;

    const isSelf = req.query.isSelf;

    if (!audienceId) {
        res.status(400).json('audienceId is required');
        return;
    }

    const _oldAudienceQuery = {
        TableName: myTable,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `AUDIENCE#${audienceId}`
        },
        AttributesToGet: ['status', 'audience', 'isOwner']
    };

    const _oldAudienceData = (await dynamoClient.get(_oldAudienceQuery).promise())['Item'];

    if (_oldAudienceData.isOwner === true) {
        res.status(400).json('Can not kick out the owner of this club');
        return;
    }

    if (_oldAudienceData.status !== Constants.AudienceStatus.Participant) {
        return res.status(400).json('this user is not a participant, whom are you kicking out?');
    }




    const newTimestamp = Date.now();

    const _audienceKickedQuery = {
        TableName: myTable,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `AUDIENCE#${audienceId}`
        },
        UpdateExpression: 'SET #tsp = :tsp, TimestampSortField = :tsf REMOVE AudienceDynamicField, #status',
        ExpressionAttributeNames: {
            '#status': 'status',
            '#tsp': 'timestamp',
        },
        ExpressionAttributeValues: {
            ':tsp': newTimestamp,
            ':tsf': `AUDIENCE-SORT-TIMESTAMP#${newTimestamp}#${audienceId}`
        }
    }

    var counterDoc;
    try {
        counterDoc = await CountParticipantSchema.validateAsync({
            clubId: clubId
        });
    } catch (error) {
        res.status(400).json(`error in  validation of CountParticipantSchema: ${error}`);
    }

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

    // deleting this participant's username from club data.
    const _participantInClubUpdateQuery = {
        TableName: myTable,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `CLUBMETA#${clubId}`,
        },
        UpdateExpression: 'DELETE participants :prtUser',
        ExpressionAttributeValues: {
            ':prtUser': dynamoClient.createSet([_oldAudienceData.audience.username]),
        }
    };


    const _transactQuery = {
        TransactItems: [{
                Update: _audienceKickedQuery
            },
            {
                Update: _counterUpdateQuery
            },
            {
                Update: _participantInClubUpdateQuery
            }
        ]
    };

    await dynamoClient.transactWrite(_transactQuery).promise();


    const promises = [];

    if (isSelf !== true) {

        // sending this event info to affected user.
        promises.push(postKickOutMessageToWebsocketUser({
            userId: audienceId,
            clubId: clubId
        }));

        const {
            clubName
        } = await _getClubData(clubId);

        var notifData = {
            data: {
                title: "You are now a listener on " + clubName + '. Remeber, being a great listener is as important as being an orator.',
                avatar: Constants.ClubAvatarUrl(clubId),
            }
        }
        promises.push(pushToPostNotificationQueue({
            action: Constants.PostNotificationQueueAction.send,
            userId: audienceId,
            notifData: notifData,
        }));

    }


    // sending new participant list to all connected users.
    promises.push(pushToWsMsgQueue({
        action: Constants.WsMsgQueueAction.postParticipantList,
        MessageGroupId: clubId,
        attributes: {
            clubId: clubId,
        }
    }));


    // incrmenting audience count as this participant has a become audience now (and club is already in playing state).
    promises.push(incrementAudienceCount(clubId));

    await Promise.all(promises);


    return res.status(201).json('kicked out participant');

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




module.exports = router;