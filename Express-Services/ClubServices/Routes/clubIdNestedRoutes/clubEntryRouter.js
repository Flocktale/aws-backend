const router = require('express').Router();

const { AudienceSchemaWithDatabaseKeys, AudienceSchema } = require('../../Schemas/Audience');

const { dynamoClient, tableName } = require('../../config');


//required
// body: AudienceSchemaWithDatabaseKeys validated

router.post('/:userId', async (req, res) => {

    const clubId = req.clubId;
    const audienceId = req.params.userId;

    try {
        // checking if user already exists as audience
        const _oldAudienceDocQuery = {
            TableName: tableName,
            Key: {
                P_K: `CLUB#${clubId}`,
                S_K: `AUDIENCE#${audienceId}`,
            },
            AttributesToGet: ['clubId', 'creatorId', 'isKickedOut', 'isParticipant', 'joinRequested',
                'joinRequestAttempts', 'audience', 'timestamp'],
        };

        const oldAudienceDoc = (await dynamoClient.get(_oldAudienceDocQuery).promise())['Item'];

        if (oldAudienceDoc) {
            res.status(204).json(oldAudienceDoc);
            return;
        }
    } catch (error) {
        console.log('no old doc exists for this request hence this is new audience');
    }

    // new audience, it is :)

    try {
        const _audienceSummaryQuery = {
            TableName: tableName,
            Key: {
                P_K: `USER#${audienceId}`,
                S_K: `USERMETA#${audienceId}`,
            },
            AttributesToGet: ["userId", "username", "avatar"],
        };
        const audience = (await dynamoClient.get(_audienceSummaryQuery).promise())['Item'];

        if (!audience) {
            console.log('could not fetch user summary data');
            res.status(500).json('could not fetch user summary data');
            return;
        }

        const _newAudienceDoc = await AudienceSchemaWithDatabaseKeys.validateAsync({
            clubId: clubId,
            audience: audience,
        });

        const _newAudienceDocQuery = {
            TableName: tableName,
            Item: _newAudienceDoc,
        };

        const _audienceCountUpdateQuery = {
            TableName: tableName,
            Key: {
                P_K: `CLUB#${clubId}`,
                S_K: 'CountAudience#'
            },
            UpdateExpression: 'set count = count + :counter',
            ExpressionAttributeValues: {
                ':counter': 1,
            }
        };

        const _transactQuery = {
            TransactItems: [
                { Put: _newAudienceDocQuery },
                { Update: _audienceCountUpdateQuery }
            ]
        };

        ynamoClient.transactWrite(_transactQuery, async (err, data) => {
            if (err) res.status(404).json('Error marking entry of user');
            else {
                const responseResult = await AudienceSchema.validateAsync({
                    clubId: clubId,
                    audience: audience,
                });     // same data just without database keys.

                res.status(201).json(responseResult);
            }
        });

    } catch (error) {
        res.status(400).json(error);
    }

});

module.exports = router;
