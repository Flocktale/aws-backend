const router = require('express').Router();
const Joi = require('joi');

const { AudienceSchemaWithDatabaseKeys, AudienceSchema } = require('../../Schemas/Audience');
const { CountParticipantSchema, CountJoinRequestSchema } = require('../../Schemas/AtomicCountSchemas');

const { audienceDynamicDataIndex, dynamoClient, tableName } = require('../../config');


// required
// body: AudienceSchema validated

router.post('/', async (req, res) => {
    // There is no seperate schema for join requests, instead we change AudienceDynamicField
    const clubId = req.clubId;

    if (!req.body.timestamp) {
        res.status(400).json(`Timestamp should exist in body: ${error}`);
        return;
    }

    try {
        const body = await AudienceSchema.validateAsync(req.body);

        // We don't let kicked out people request to join club
        if (body.isKickedOut === true) {
            // forbidden (403)
            res.status(403).json('User is kicked out by owner, can not request to join!');
            return;
        } else if (body.isPartcipant === true) {
            //  not acceptable (406) since user is already a partcipant.
            res.status(406).json('User is already a participant');
            return;
        } else if (body.joinRequested === true) {
            //  not acceptable (406) since user already have an active join request.
            res.status(406).json('Join request is already pending!');
            return;
        }

        // Now, this is the fresh request!!!
        const newTimestamp = Date.now();

        body['joinRequested'] = true;
        body['AudienceDynamicField'] = `ActiveJoinRequest#${newTimestamp}#${result.audienceId}`;

        const result = await AudienceSchemaWithDatabaseKeys.validateAsync(body);

        const _audienceUpdateQuery = {
            TableName: tableName,
            Key: {
                P_K: result.P_K,
                S_K: result.S_K
            },
            UpdateExpression: 'set joinRequested = :request, AudienceDynamicField = :dynamicField, joinRequestAttempts = joinRequestAttempts + :counter',
            ExpressionAttributeValues: {
                ':request': true,
                ':dynamicField': result.AudienceDynamicField,
                ':counter': 1,

            }
        };

        const counterDoc = await CountJoinRequestSchema.validateAsync({ clubId: clubId });

        const _counterUpdateQuery = {
            TableName: tableName,
            Key: {
                P_K: counterDoc.P_K,
                S_K: counterDoc.S_K
            },
            UpdateExpression: 'set count = count + :counter',
            ExpressionAttributeValues: {
                ':counter': 1,
            }
        }

        const _transactQuery = {
            TransactItems: [
                { Update: _audienceUpdateQuery },
                { Update: _counterUpdateQuery }
            ]
        };

        dynamoClient.transactWrite(_transactQuery, (err, data) => {
            if (err) res.status(404).json(`Error in join request to club: ${err}`);
            else {
                console.log(data);
                res.status(201).json('posted join request');
            }
        });


    } catch (error) {
        res.status(400).json(error);
        return;
    }
});


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
        AttributesToGet: [
            'audienceId', 'joinRequestAttempts', 'avatar', 'username', 'AudienceDynamicField'
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
                "activeJoinRequestUsers": data["Items"],
                'lastevaluatedkey': data["LastEvaluatedKey"]
            });
        }
    });

});



// required
// query parameters - "audienceId" , "timestamp"

router.delete('/', async (req, res) => {
    // we don't decrement counter for join requests because it does not account for unique requests.

    const clubId = req.clubId;

    const audienceId = req.query.audienceId;
    const timestamp = req.query.timestamp;

    if ((!timestamp) || (!audienceId)) {
        res.status(400).json('timestamp should exist in headers and should be equal to entry time of user in club, audienceid should also exist');
        return;
    }

    const _attributeUpdates = {
        joinRequested: { "Action": "PUT", "Value": false },
        AudienceDynamicField: { "Action": "DELETE" },
    };

    const _audienceUpdateQuery = {
        TableName: tableName,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `AUDIENCE#${timestamp}#${audienceId}`
        },
        AttributeUpdates: _attributeUpdates,
    };

    dynamoClient.update(_audienceUpdateQuery, (err, data) => {
        if (err) res.status(404).json(`Error in deleting join request: ${err}`);
        else {
            console.log(data);
            res.status(202).json('Deleted join request');
        }
    });

});


// ! if resp === 'accept'  then req.body should be a AudienceSchema with timestamp
// ! if resp === 'cancel'  then req.query - {audienceid, timestamp of audience}
// query parameters - "audienceId" , "timestamp" (optional)

router.post('/:resp', async (req, res) => {

    const clubId = req.clubId;

    const requestAction = req.params.resp;

    try {
        const _schema = Joi.string().valid('accept', 'cancel').required();
        await _schema.validateAsync(requestAction);
    } catch (error) {
        res.status(400).json('invalid response , valid => accept or cancel');
        return;
    }

    if (requestAction === 'accept') {

        if (!req.body.timestamp) {
            res.status(400).json('timestamp should exist in body when accepting the join request');
            return;
        }
        var result;
        try {
            result = await AudienceSchemaWithDatabaseKeys.validateAsync(req.body);
        } catch (error) {
            res.status(400).json(`Invalid body: ${error}`);
            return;
        }
        const newTimestamp = Date.now();

        const _attributeUpdates = {
            joinRequested: { "Action": "PUT", "Value": false },
            AudienceDynamicField: { "Action": "PUT", "Value": `Participant#${newTimestamp}#${result.audienceId}` },
            isPartcipant: { "Action": "PUT", "Value": true }
        };
        const _audienceUpdateQuery = {
            TableName: tableName,
            Key: {
                P_K: result.P_K,
                S_K: result.S_K
            },
            AttributeUpdates: _attributeUpdates,
        };


        const counterDoc = await CountParticipantSchema.validateAsync({ clubId: clubId });

        const _counterUpdateQuery = {
            TableName: tableName,
            Key: {
                P_K: counterDoc.P_K,
                S_K: counterDoc.S_K
            },
            UpdateExpression: 'set count = count + :counter',       //incrementing
            ExpressionAttributeValues: {
                ':counter': 1,
            }
        }


        const _transactQuery = {
            TransactItems: [
                { Update: _audienceUpdateQuery },
                { Update: _counterUpdateQuery }
            ]
        };

        dynamoClient.transactWrite(_transactQuery, (err, data) => {
            if (err) res.status(404).json(`Error accepting join request: ${err}`);
            else {
                console.log(data);
                res.status(201).json('Accepted join request');
            }
            return;
        });


    } else if (requestAction === 'cancel') {


        const audienceId = req.query.audienceId;
        const timestamp = req.query.timestamp;

        if ((!timestamp) || (!audienceId)) {
            res.status(400).json('timestamp should exist in query parameters and should be equal to entry time of user in club, audienceId should also exist');
            return;
        }


        const _attributeUpdates = {
            joinRequested: { "Action": "PUT", "Value": false },
            AudienceDynamicField: { "Action": "DELETE" },
        };


        const _audienceUpdateQuery = {
            TableName: tableName,
            Key: {
                P_K: `CLUB#${clubId}`,
                S_K: `AUDIENCE#${timestamp}#${audienceId}`
            },
            AttributeUpdates: _attributeUpdates,
        };

        dynamoClient.update(_audienceUpdateQuery, (err, data) => {
            if (err) res.status(404).json(`Error in cancelling join request: ${err}`);
            else {
                console.log(data);
                res.status(202).json('Cancelled join request');
            }
        });

    } else {
        res.status(501).json('request has hit a dead end');
        return;
    }

});


module.exports = router;
