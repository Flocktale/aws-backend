const router = require('express').Router();

const { ReactionSchema, ReactionSchemaWithDatabaseKeys } = require('../../Schemas/Reaction');

const { dynamoClient, tableName } = require('../../config');



//! headers - {previousindexvalue , currentindexvalue} , req.body => {userId,username,avatar}
router.post('/', async (req, res) => {

    const clubId = req.clubId;

    try {
        const _temp = req.body;
        _temp['indexValue'] = 0;        // necessary to validate schema
        _temp['clubId'] = clubId;
        await ReactionSchema.validateAsync(_temp); // if successfull then req.body contains {userId,username,avatar}
    } catch (error) {
        res.status(400).json(`invalid body: ${error}`);
        return;
    }

    const userId = req.body.userId;
    const username = req.body.username;
    const avatar = req.body.avatar;

    const previousIndexValue = req.headers.previousindexvalue;
    const currentIndexValue = req.headers.currentindexvalue;

    const _transactQuery = { TransactItems: [] };

    const _reactionCounterQuery = {         //by default => increment (Key required)
        TableName: tableName,
        UpdateExpression: 'set count = count + :counter',
        ExpressionAttributeValues: {
            ':counter': 1,
        }
    };

    if (currentIndexValue)                 // if a user select new reaction on club  
    {
        console.log('new reaction of user on club id:' + clubId + '     reaction: ' + currentIndexValue);
        var reactionDoc;
        try {
            reactionDoc = await ReactionSchemaWithDatabaseKeys.validateAsync({
                clubId: clubId,
                userId: userId,
                username: username,
                avatar: avatar,
                indexValue: currentIndexValue
            });
        } catch (error) {
            res.status(400).json(error);
            return;
        }
        const _reactionDocQuery = {
            TableName: tableName,
            Item: reactionDoc
        };
        _transactQuery['TransactItems'].push({ Put: _reactionDocQuery });   // created reaction document of user
        const _incrementCounter = _reactionCounterQuery;

        _incrementCounter['Key'] = {        // by default set to increment the counter
            P_K: `CLUB#${clubId}`,
            S_K: `CountReaction#${reactionDoc.indexValue}`
        };

        _transactQuery['TransactItems'].push({ Update: _incrementCounter });    // incremented counter 


    } else {       // if a user only un-react on club (i.e. remove reaction)
        // then delete the reaction document, decrement counter will be handled by previousIndexValue 

        const _removeReactionQuery = {
            TableName: tableName,
            Key: {
                P_K: `CLUB#${clubId}`,
                S_K: `REACT#${userId}`
            }
        };
        _transactQuery['TransactItems'].push({ Delete: _removeReactionQuery });
    }


    if (previousIndexValue) {
        const _decrementCounter = _reactionCounterQuery;
        _decrementCounter['Key'] = {
            P_K: `CLUB#${clubId}`,
            S_K: `CountReaction#${previousIndexValue}`
        };
        _decrementCounter['UpdateExpression'] = 'set count = count - :counter'; //  set to decrement the counter

        _transactQuery['TransactItems'].push({ Update: _decrementCounter });    // decremented counter 
    }

    dynamoClient.transactWrite(_transactQuery, (err, data) => {
        if (err) res.status(304).json(`Error modifying reaction: ${err}`);
        else res.status(201).json(data);
    });
});


router.get('/', async (req, res) => {

    const clubId = req.clubId;

    const query = {
        TableName: tableName,
        Limit: 50,
        KeyConditionExpression: 'P_K = :hkey and begins_with ( S_K , :filter )',
        ExpressionAttributeValues: {
            ":hkey": `CLUB#${clubId}`,
            ":filter": `REACT#`
        },
        AttributesToGet: [
            'userId', 'username', 'avatar', 'indexValue'
        ],
        ScanIndexForward: false,
    };

    if (req.headers.lastevaluatedkey) {
        query['ExclusiveStartKey'] = JSON.parse(req.headers.lastevaluatedkey);
    }

    dynamoClient.query(query, (err, data) => {
        if (err) res.status(404).json(err);
        else res.status(200).json(data);
    });

});


module.exports = router;