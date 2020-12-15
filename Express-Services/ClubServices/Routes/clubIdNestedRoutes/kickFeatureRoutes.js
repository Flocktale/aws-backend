const router = require('express').Router();

const { CountParticipantSchema } = require('../../Schemas/AtomicCountSchemas');

const { audienceDynamicDataIndex, dynamoClient, tableName } = require('../../config');


// ! req.headers - {audienceid, timestamp of audience}
router.post('/kick', async (req, res) => {
    const clubId = req.clubId;

    const audienceId = req.headers.audienceid;
    const timestamp = req.headers.timestamp;

    if ((!timestamp) || (!audienceId)) {
        res.status(400).json('timestamp should exist in headers and should be equal to entry time of user in club, audienceid should also exist');
        return;
    }

    const newTimestamp = Date.now();

    const _attributeUpdates = {
        isPartcipant: { "Action": "PUT", "Value": false },
        isKickedOut: { "Action": "PUT", "Value": true },
        AudienceDynamicField: { "Action": "PUT", "Value": `KickedOut#${newTimestamp}#${audienceId}` },
    };

    const _audienceKickedQuery = {
        TableName: tableName,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `AUDIENCE#${timestamp}#${audienceId}`
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
        UpdateExpression: 'set count = count - :counter',       // decrementing
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
        if (err) res.status(304).json(`Error kicking out participant: ${err}`);
        else {
            console.log(data);
            res.status(201).json('kicked out participant');
        }
        return;
    });
});


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
                "AttributeValueList": [`KickedOut#`]
            },
        },
        AttributesToGet: [
            'audienceId', 'avatar', 'username', 'AudienceDynamicField'
        ],
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
                "kickedOutParticipants": data["Items"],
                'lastevaluatedkey': data["LastEvaluatedKey"]
            });
        }
    });

});


// ! req.headers - {audienceid, timestamp of audience}
router.post('/revoke', async (req, res) => {
    const clubId = req.clubId;

    const audienceId = req.headers.audienceid;
    const timestamp = req.headers.timestamp;

    if ((!timestamp) || (!audienceId)) {
        res.status(400).json('timestamp should exist in headers and should be equal to entry time of user in club, audienceid should also exist');
        return;
    }

    const _attributeUpdates = {
        isKickedOut: { "Action": "PUT", "Value": false },
        AudienceDynamicField: { "Action": "DELETE" },
    };

    const _audienceUnKickedQuery = {
        TableName: tableName,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `AUDIENCE#${timestamp}#${audienceId}`
        },
        AttributeUpdates: _attributeUpdates,
    }

    dynamoClient.update(_audienceUnKickedQuery, (err, data) => {
        if (err) res.status(304).json(`Error un-kicking the user: ${err}`);
        else {
            console.log(data);
            res.status(201).json('Un-kicked the user');
        }
        return;
    });
});

module.exports = router;
