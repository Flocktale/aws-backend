const router = require('express').Router();

const { ReactionSchemaWithDatabaseKeys } = require('../../Schemas/Reaction');

const { timestampSortIndex, dynamoClient, myTable } = require('../../config');
const Joi = require('joi');


// required
// query parameters - "indexValue" , "audienceId"

router.post('/', async (req, res) => {

    const clubId = req.clubId;
    var newIndexValue = req.query.indexValue;
    const audienceId = req.query.audienceId;

    if (!audienceId) {
        res.status(400).json('audienceId is required');
        return;
    }

    try {
        newIndexValue = await Joi.number().integer().valid(0, 1, 2).validateAsync(newIndexValue);
        
    } catch (error) {
        res.status(400).json(` indexValue should be a valid integer (0,1,2) :${error}`);
        return;
    }

    const _reactionDocKey = {
        P_K: `CLUB#${clubId}`,
        S_K: `REACT#${audienceId}`
    };

    const _oldReactionQuery = {
        TableName: myTable,
        Key: _reactionDocKey,
    };

    let _oldReactionDoc;

    const _transactQuery = { TransactItems: [] };

    try {
        _oldReactionDoc = (await dynamoClient.get(_oldReactionQuery).promise())['Item'];
    } catch (error) {
        console.log('error in fetching old reaction document: ', error);
    }

    if (_oldReactionDoc) {

        const previousIndexValue = _oldReactionDoc.indexValue;

        // decrementing counter of previous reaction
        _transactQuery['TransactItems'].push({
            Update: {
                TableName: myTable,
                Key: {
                    P_K: `CLUB#${clubId}`,
                    S_K: `CountReaction#${previousIndexValue}`
                },
                UpdateExpression: 'set #cnt = #cnt - :counter',
                ExpressionAttributeNames: {
                    '#cnt': 'count'
                },
                ExpressionAttributeValues: {
                    ':counter': 1
                }
            }
        });
        console.log(previousIndexValue,newIndexValue);
        if (previousIndexValue === newIndexValue) {
            _transactQuery['TransactItems'].push({
                Delete: {
                    TableName: myTable,
                    Key: _reactionDocKey,
                }
            });
        } else {

            // incremeting counter of new reaction
            _transactQuery['TransactItems'].push({
                Update: {
                    TableName: myTable,
                    Key: {
                        P_K: `CLUB#${clubId}`,
                        S_K: `CountReaction#${newIndexValue}`
                    },
                    UpdateExpression: 'set #cnt = #cnt + :counter',
                    ExpressionAttributeNames: {
                        '#cnt': 'count'
                    },
                    ExpressionAttributeValues: {
                        ':counter': 1
                    }
                }
            });

            _oldReactionDoc['indexValue'] = newIndexValue;
            _oldReactionDoc['timestamp'] = Date.now();

            const _updatedReactionDoc = await ReactionSchemaWithDatabaseKeys.validateAsync(_oldReactionDoc);

            // upadating index value of reaction doc
            _transactQuery['TransactItems'].push({
                Update: {
                    TableName: myTable,
                    Key: _reactionDocKey,
                    UpdateExpression: 'set #indVal = :val, #tsp = :tsp, #tspSort = :tspSort ',
                    ExpressionAttributeNames: {
                        '#indVal': 'indexValue',
                        '#tsp': 'timestamp',
                        '#tspSort': 'TimestampSortField'
                    },
                    ExpressionAttributeValues: {
                        ':val': _updatedReactionDoc.indexValue,
                        ":tsp": _updatedReactionDoc.timestamp,
                        ':tspSort': _updatedReactionDoc.TimestampSortField
                    }
                }
            });

        }

    } else {
        // generating new reaction doc for user


        const _userSummaryQuery = {
            TableName: myTable,
            Key: {
                P_K: `USER#${audienceId}`,
                S_K: `USERMETA#${audienceId}`,
            },
            AttributesToGet: ["userId", "username", "avatar"],
        };

        var reactionDoc, user;

        try {

            // fetching user summary data
            user = (await dynamoClient.get(_userSummaryQuery).promise())['Item'];

            if (!user) {
                console.log('could not fetch user summary data');
                res.status(500).json('could not fetch user summary data');
                return;
            }

            reactionDoc = await ReactionSchemaWithDatabaseKeys.validateAsync({
                clubId: clubId,
                user: user,
                indexValue: newIndexValue
            });

        } catch (error) {
            res.status(400).json(error);
            return;
        }


        const _reactionDocQuery = {
            TableName: myTable,
            Item: reactionDoc
        };
        _transactQuery['TransactItems'].push({ Put: _reactionDocQuery });   // creating reaction document of user

        // incremeting counter of new reaction
        _transactQuery['TransactItems'].push({
            Update: {
                TableName: myTable,
                Key: {
                    P_K: `CLUB#${clubId}`,
                    S_K: `CountReaction#${newIndexValue}`
                },
                UpdateExpression: 'set #cnt = #cnt + :counter',
                ExpressionAttributeNames: {
                    '#cnt': 'count'
                },
                ExpressionAttributeValues: {
                    ':counter': 1
                }
            }
        });

    }  

    // _transactQuery.TransactItems.forEach((e)=>console.log(e));
    
    dynamoClient.transactWrite(_transactQuery, (err, data) => {
        if (err) res.status(404).json(`Error modifying reaction: ${err}`);
        else {
            console.log(data);
            res.status(201).json('Modified reaction');
        }
    });
});





// required
// headers - "lastevaluatedkey"  (optional)

router.get('/', async (req, res) => {

    const clubId = req.clubId;

    const query = {
        TableName: myTable,
        IndexName: timestampSortIndex,
        Limit: 30,
        KeyConditions: {
            "P_K": {
                "ComparisonOperator": "EQ",
                "AttributeValueList": [`CLUB#${clubId}`]
            },
            "TimestampSortField": {
                "ComparisonOperator": "BEGINS_WITH",
                "AttributeValueList": [`REACT-SORT-TIMESTAMP#`]
            },
        },
        AttributesToGet: ['user', 'indexValue', 'timestamp'],
        ScanIndexForward: false,
    };

    if (req.headers.lastevaluatedkey) {
        query['ExclusiveStartKey'] = JSON.parse(req.headers.lastevaluatedkey);
    }

    dynamoClient.query(query, (err, data) => {
        if (err) res.status(404).json(err);
        else {
            console.log(data);
            res.status(200).json({
                "reactions": data["Items"],
                'lastevaluatedkey': data["LastEvaluatedKey"]
            });
        }
    });

});


module.exports = router;
