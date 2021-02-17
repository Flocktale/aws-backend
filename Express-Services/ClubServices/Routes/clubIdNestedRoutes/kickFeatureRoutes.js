const router = require('express').Router();

const {
    CountParticipantSchema
} = require('../../Schemas/AtomicCountSchemas');

const {
    audienceDynamicDataIndex,
    dynamoClient,
    tableName
} = require('../../config');


const {
    postParticipantListToWebsocketUsers,
    postKickOutMessageToWebsocketUser,
} = require('../../Functions/websocketFunctions');

const {
    publishNotification
} = require('../../Functions/notificationFunctions')


// required
// query parameters - "audienceId"
router.post('/', async (req, res) => {
    const clubId = req.clubId;

    const audienceId = req.query.audienceId;

    if (!audienceId) {
        res.status(400).json('audienceId is required');
        return;
    }

    const newTimestamp = Date.now();


    const _audienceKickedQuery = {
        TableName: tableName,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `AUDIENCE#${audienceId}`
        },
        UpdateExpression: 'SET #tsp = :tsp, isParticipant = :fal REMOVE AudienceDynamicField',
        ExpressionAttributeNames: {
            '#tsp': 'timestamp',
        },
        ExpressionAttributeValues: {
            ':tsp': newTimestamp,
            ':fal': false,
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


    const _transactQuery = {
        TransactItems: [{
                Update: _audienceKickedQuery
            },
            {
                Update: _counterUpdateQuery
            }
        ]
    };

    await dynamoClient.transactWrite(_transactQuery).promise();




    // sending this event info to affected user.
    await postKickOutMessageToWebsocketUser({
        userId: audienceId,
        clubId: clubId
    });


    const {
        clubName
    } = await _getClubData(clubId);

    var notifData = {
        title: "You are now a listener on " + clubName + '. Remeber, being a great listener is as important as being an orator.',
        image: `https://mootclub-public.s3.amazonaws.com/clubAvatar/${clubId}`,
    }
    await publishNotification({
        userId: audienceId,
        notifData: notifData,
    })

    // sending new participant list to all connected users.
    await postParticipantListToWebsocketUsers(clubId);

    return res.status(201).json('kicked out participant');

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




module.exports = router;