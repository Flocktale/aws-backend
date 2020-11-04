const router = require('express').Router();
const { nanoid } = require('nanoid');


const { CountReportSchema } = require('../../Schemas/AtomicCountSchemas');
const { ReportSchemaWithDatabaseKeys } = require('../../Schemas/Report');


const { dynamoClient, tableName } = require('../../config');

router.post('/', async (req, res) => {

    const clubId = req.clubId;

    try {
        const body = req.body;
        body['reportId'] = nanoid();
        const result = await ReportSchemaWithDatabaseKeys.validateAsync(body);

        const _putQuery = {
            TableName: tableName,
            Item: result
        };
        const counterDoc = await CountReportSchema.validateAsync({ clubId: clubId });
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
                { Put: _putQuery },
                { Update: _counterUpdateQuery }
            ]
        };

        dynamoClient.transactWrite(_transactQuery, (err, data) => {
            if (err) res.status(304).json(`Error reporting club: ${err}`);
            else res.status(201).json(data);
        });

    } catch (error) {
        res.status(400).json(error);
        return;
    }

});




router.get('/', async (req, res) => {

    const clubId = req.clubId;

    const query = {
        TableName: tableName,
        Limit: 20,
        KeyConditionExpression: 'P_K = :hkey and begins_with ( S_K , :filter )',
        ExpressionAttributeValues: {
            ":hkey": `CLUB#${clubId}`,
            ":filter": `REPORT#`
        },
        AttributesToGet: [
            'userId', 'username', 'avatar', 'body', 'timestamp'
        ],
        ScanIndexForward: false,
        ReturnConsumedCapacity: "INDEXES"
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
