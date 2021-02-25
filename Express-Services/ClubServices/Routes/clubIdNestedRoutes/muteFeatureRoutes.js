const router = require('express').Router();


const {
    audienceDynamicDataIndex,
    dynamoClient,
    tableName
} = require('../../config');

const {
    postMuteActionMessageToClubSubscribers,
} = require('../../Functions/websocketFunctions');



//required
// query parameters - 
///     "who" (valid values are 'all' , 'participant')
///     "participantId" (if who==='participant')
///     "muteAction" (valid values are "mute",'unmute')


router.post('/', async (req, res) => {
    const clubId = req.clubId;

    const who = req.query.who;
    const muteAction = req.query.muteAction;

    if (!who || (who !== 'all' && who !== 'participant')) {
        return res.status(400).json('invalid value of "who" query parameter');
    }


    if (!muteAction || (muteAction !== 'mute' && muteAction !== 'unmute')) {
        return res.status(400).json('invalid value of "muteAction" query parameter');
    }

    var isMuted;
    if (muteAction === 'mute') {
        isMuted = true;
    } else if (muteAction === 'unmute') {
        isMuted = false;
    } else {
        return res.status(500).json('unknown value of muteAction');
    }




    if (who === 'participant') {
        const participantId = req.query.participantId;

        if (!participantId) {
            return res.status(400).json('participantId is required');
        }

        const _participantQuery = {
            TableName: tableName,
            Key: {
                P_K: `CLUB#${clubId}`,
                S_K: `AUDIENCE#${participantId}`
            },
            AttributesToGet: ['isParticipant'],
        };

        const _participantData = (await dynamoClient.get(_participantQuery).promise())['Item'];


        if (!_participantData || _participantData.isParticipant !== true) {
            return res.status(404).json('this is no participant');
        }


        const _muteUpdateQuery = {
            TableName: tableName,
            Key: {
                P_K: `CLUB#${clubId}`,
                S_K: `AUDIENCE#${participantId}`
            },
            UpdateExpression: 'set isMuted = :isMuted',
            ExpressionAttributeValues: {
                ':isMuted': isMuted,
            },
        }

        await dynamoClient.update(_muteUpdateQuery).promise();

        // sending message to participant through websocket.
        await postMuteActionMessageToClubSubscribers({
            userIdList: [participantId],
            clubId: clubId,
            isMuted: isMuted,
        });


        return res.status(200).json(`${muteAction} successfully`);
    }

    // mute action message to all participants (except creator) and all club subscribed audience.

    const _creatorQuery = {
        TableName: tableName,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `CLUBMETA#${clubId}`
        },
        ProjectionExpression: 'creator.userId',
    };

    const creatorData = (await dynamoClient.get(_creatorQuery).promise())['Item'];
    if (!creatorData) {
        return res.status(404).json('no such club found');
    }

    const creatorId = creatorData.creator.userId;

    const _participantsQuery = {
        TableName: tableName,
        IndexName: audienceDynamicDataIndex,

        KeyConditionExpression: 'P_K = :pk and begins_with(AudienceDynamicField,:adf)',
        FilterExpression: "audience.userId <> :owner",
        ExpressionAttributeValues: {
            ':pk': `CLUB#${clubId}`,
            ':adf': `Participant#`,
            ':owner': creatorId,
        },
        ProjectionExpression: 'audience.userId',
    };

    const participantsData = (await dynamoClient.query(_participantsQuery).promise())['Items'];

    const participantIds = participantsData.map(({
        audience
    }) => audience.userId);


    const _transactQuery = {
        TransactItems: []
    };


    //  a transaction can perform atmost 25 operations at once. 
    //  (although no of partcipants would be less than 25 anyways, but still becoming robust and future proof)
    var index = 0;

    for (var id of participantIds) {

        if (index % 25 !== 0) {
            _transactQuery.TransactItems.push({
                Update: {
                    TableName: tableName,
                    Key: {
                        P_K: `CLUB#${clubId}`,
                        S_K: `AUDIENCE#${id}`
                    },
                    UpdateExpression: 'set isMuted = :isMuted',
                    ExpressionAttributeValues: {
                        ':isMuted': isMuted,
                    },
                }
            });
        } else {
            await dynamoClient.transactWrite(_transactQuery).promise();
            _transactQuery.TransactItems = []; // emptying the array
        }

        index++;
    }

    // in case, index didn't reach 25x at last iteration.
    try {
        await dynamoClient.transactWrite(_transactQuery).promise();
    } catch (error) {}


    // sending message to participant through websocket.
    await postMuteActionMessageToClubSubscribers({
        userIdList: participantIds,
        clubId: clubId,
        isMuted: isMuted,
    });

    return res.status(200).json(`${muteAction} successfully`);
});

module.exports = router;