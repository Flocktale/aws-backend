const router = require('express').Router();


const {
    audienceDynamicDataIndex,
    dynamoClient,
    tableName
} = require('../../config');

const {
    postMuteMessageToWebsocketUser
} = require('./websocketFunctions');

//required
// query parameters - 
///     "who" (valid values are 'all' , 'participant')
///     "participantId" (if who==='participant')


router.post('/', async (req, res) => {
    const clubId = req.clubId;

    const who = req.query.who;
    if (!who || (who !== 'all' && who !== 'participant')) {
        return res.status(400).json('invalid value of "who" query parameter');
    }

    const participantId = req.query.participantId;


    if (who === 'participant') {
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

        // sending message to participant through websocket.
        await postMuteMessageToWebsocketUser({
            userId: participantId,
            clubId: clubId
        });

        return res.status(200).json('muted successfully');
    }

    // mute message to all participants (except creator)

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
    if (participantsData) {
        const participantIds = participantsData.map(({
            audience
        }) => audience.userId);

        for (var id of participantIds) {
            await postMuteMessageToWebsocketUser({
                userId: id,
                clubId: clubId
            });
        }
    }

    return res.status(200).json('muted successfully');

});

module.exports = router;