const router = require('express').Router();


const {
    audienceDynamicDataIndex,
    dynamoClient,
    myTable
} = require('../../config');
const Constants = require('../../constants');

const {
    postMuteMessageToParticipantOnly,
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


    const promises = [];

    if (who === 'participant') {
        const participantId = req.query.participantId;

        if (!participantId) {
            return res.status(400).json('participantId is required');
        }

        const _participantQuery = {
            TableName: myTable,
            Key: {
                P_K: `CLUB#${clubId}`,
                S_K: `AUDIENCE#${participantId}`
            },
            AttributesToGet: ['status'],
        };

        const _participantData = (await dynamoClient.get(_participantQuery).promise())['Item'];


        if (!_participantData || _participantData.status !== Constants.AudienceStatus.Participant) {
            return res.status(404).json('this is no participant');
        }


        const _muteUpdateQuery = {
            TableName: myTable,
            Key: {
                P_K: `CLUB#${clubId}`,
                S_K: `AUDIENCE#${participantId}`
            },
            UpdateExpression: 'set isMuted = :isMuted',
            ExpressionAttributeValues: {
                ':isMuted': isMuted,
            },
        }

        promises.push(dynamoClient.update(_muteUpdateQuery).promise());

        console.log('isMuted: ', isMuted);

        //sending message to affected user.
        promises.push(postMuteMessageToParticipantOnly({
            clubId: clubId,
            userId: participantId,
            isMuted: isMuted,
        }));



        await Promise.all(promises);

        return res.status(200).json(`${muteAction} successfully`);
    }

    // mute action message to all participants (except creator) and all club subscribed audience.

    const _creatorQuery = {
        TableName: myTable,
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
        TableName: myTable,
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

    for (var index in participantIds) {

        if (index !== 0 && index % 25 === 0) {
            promises.push(dynamoClient.transactWrite(_transactQuery).promise());
            _transactQuery.TransactItems = []; // emptying the array
        }

        const id = participantIds[index];
        const _updateQuery = {
            Update: {
                TableName: myTable,
                Key: {
                    P_K: `CLUB#${clubId}`,
                    S_K: `AUDIENCE#${id}`
                },
                UpdateExpression: 'set isMuted = :isMuted',
                ExpressionAttributeValues: {
                    ':isMuted': isMuted,
                },
            }
        };

        _transactQuery.TransactItems.push(_updateQuery);
    }

    // in case, index didn't reach 25x at last iteration.
    if (_transactQuery.TransactItems.length) {
        try {
            promises.push(dynamoClient.transactWrite(_transactQuery).promise());
        } catch (error) {}
    }

    for (var participantId of participantIds) {

        //sending message to affected user.
        promises.push(postMuteMessageToParticipantOnly({
            clubId: clubId,
            userId: participantId,
            isMuted: isMuted,
        }));
    }


    await Promise.all(promises);

    return res.status(200).json(`${muteAction} successfully`);
});

module.exports = router;