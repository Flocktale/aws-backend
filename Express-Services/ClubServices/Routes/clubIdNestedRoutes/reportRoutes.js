const router = require('express').Router();
const { nanoid } = require('nanoid');


const { CountReportSchema } = require('../../Schemas/AtomicCountSchemas');
const { ReportSchemaWithDatabaseKeys } = require('../../Schemas/Report');


const { dynamoClient, tableName } = require('../../config');

// required
// body : ReportSchemaWithDatabaseKeys validated

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
            if (err) res.status(404).json(`Error reporting club: ${err}`);
            else {
                console.log(data);
                res.status(201).json('Reported club');
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
        Limit: 20,
        KeyConditions: {
            "P_K": {
                "ComparisonOperator": "EQ",
                "AttributeValueList": [`CLUB#${clubId}`]
            },
            "AudienceDynamicField": {
                "ComparisonOperator": "BEGINS_WITH",
                "AttributeValueList": [`REPORT#`]
            },
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
        else {
            console.log(data);
            res.status(200).json({
                "reports": data["Items"],
                'lastevaluatedkey': data["LastEvaluatedKey"]
            });
        }
    });

});



module.exports = router;
