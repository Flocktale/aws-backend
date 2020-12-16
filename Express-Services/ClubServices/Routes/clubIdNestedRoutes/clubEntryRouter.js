const router = require('express').Router();

const { AudienceSchemaWithDatabaseKeys, AudienceSchema } = require('../../Schemas/Audience');

const { allClubsOfAudienceIndex, dynamoClient, tableName } = require('../../config');


//required
// body: AudienceSchemaWithDatabaseKeys validated

router.post('/', async (req, res) => {

    const clubId = req.clubId;
    const audienceId = req.body['audienceId'];

    var _transactQuery;
    var result;
    try {

        result = await AudienceSchemaWithDatabaseKeys.validateAsync(req.body);

        const _audienceDocQuery = {
            TableName: tableName,
            Item: result,
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

        _transactQuery = {
            TransactItems: [
                { Put: _audienceDocQuery },
                { Update: _audienceCountUpdateQuery }
            ]
        };

    } catch (error) {
        res.status(400).json(error);
        return;
    }

    try {
        // checking if user already exists as audience
        const _crossQuery = {
            TableName: tableName,
            IndexName: allClubsOfAudienceIndex,
            KeyConditionExpression: 'audienceId = :hkey',
            FilterExpression: 'clubId = :queryKey',    //! this is RCU intensive query, it scans all the clubs attended by audience and match for clubId condition against them.
            ExpressionAttributeValues: {
                ":hkey": audienceId,
                ":queryKey": clubId,
            },
            Limit: 1,
            ScanIndexForward: false,
            ReturnConsumedCapacity: "INDEXES"
        };

        const crossResult = await dynamoClient.query(_crossQuery).promise();

        if (crossResult && crossResult['Items'].length === 1) {
            try {
                const responseResult = await AudienceSchema.validateAsync(crossResult['Items'][0]);
                res.status(204).json(responseResult);
            } catch (error) {
                res.status(204).json(`User already have a entry but AudienceSchema has error: ${error}`);
            }
            return;
        } else {
            dynamoClient.transactWrite(_transactQuery, async (err, data) => {
                if (err) res.status(304).json('Error marking entry of user');
                else {
                    try {
                        const responseResult = await AudienceSchema.validateAsync(result);
                        res.status(204).json(responseResult);
                    } catch (error) {
                        res.status(204).json(`User entry created but AudienceSchema has error: ${error}`);
                    }
                    return;
                }
            });

        }

    } catch (error) {
        dynamoClient.transactWrite(_transactQuery, async (err, data) => {
            if (err) res.status(304).json('Error marking entry of user');
            else {
                try {
                    const responseResult = await AudienceSchema.validateAsync(result);
                    res.status(204).json(responseResult);
                } catch (error) {
                    res.status(204).json(`User entry created but AudienceSchema has error:  ${error}`);
                }
                return;
            }
        });
    }

});

module.exports = router;
