const router = require('express').Router();

const { CountParticipantSchema } = require('../../Schemas/AtomicCountSchemas');

const { audienceDynamicDataIndex, dynamoClient, tableName } = require('../../config');


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

    const _attributeUpdates = {
        timestamp: { "Action": "PUT", "Value": newTimestamp },
        isPartcipant: { "Action": "PUT", "Value": false },
        AudienceDynamicField: { "Action": "DELETE" },
    };

    const _audienceKickedQuery = {
        TableName: tableName,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `AUDIENCE#${audienceId}`
        },
        AttributeUpdates: _attributeUpdates,
    }

    var counterDoc;
    try {
        counterDoc = await CountParticipantSchema.validateAsync({ clubId: clubId });
    } catch (error) {
        res.status(400).json(`error in  validation of CountParticipantSchema: ${error}`);
    }

    const _counterUpdateQuery = {
        TableName: tableName,
        Key: {
            P_K: counterDoc.P_K,
            S_K: counterDoc.S_K
        },
        UpdateExpression: 'set #cnt = #cnt - :counter',       // decrementing
        ExpressionAttributeNames: {
            '#cnt': 'count'
        },
        ExpressionAttributeValues: {
            ':counter': 1,
        }
    }


    const _transactQuery = {
        TransactItems: [
            { Update: _audienceKickedQuery },
            { Update: _counterUpdateQuery }
        ]
    };

    dynamoClient.transactWrite(_transactQuery, (err, data) => {
        if (err) res.status(404).json(`Error kicking out participant: ${err}`);
        else {
            console.log(data);
            res.status(201).json('kicked out participant');
        }
        return;
    });
});


module.exports = router;
