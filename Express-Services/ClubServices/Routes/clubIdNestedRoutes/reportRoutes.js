const router = require('express').Router();
const {
    nanoid
} = require('nanoid');


const {
    CountReportSchema
} = require('../../Schemas/AtomicCountSchemas');
const {
    ReportSchemaWithDatabaseKeys
} = require('../../Schemas/Report');


const {
    timestampSortIndex,
    dynamoClient,
    myTable
} = require('../../config');

// required
// query parameters - "userId"
// body; {'body': String}

router.post('/', async (req, res) => {

    const clubId = req.clubId;
    const userId = req.query.userId;

    const reportBody = req.body.body;

    if (!reportBody) {
        res.status(400).json('Body is Required');
        return;
    }

    if (!userId) {
        res.status(400).json('userId is required');
        return;
    }


    const _userSummaryQuery = {
        TableName: myTable,
        Key: {
            P_K: `USER#${userId}`,
            S_K: `USERMETA#${userId}`,
        },
        AttributesToGet: ["userId", "username", "avatar"],
    };


    try {

        const user = (await dynamoClient.get(_userSummaryQuery).promise())['Item'];

        if (!user) {
            console.log('could not fetch user summary data');
            res.status(500).json('could not fetch user summary data');
            return;
        }

        const reportId = nanoid();

        const result = await ReportSchemaWithDatabaseKeys.validateAsync({
            clubId: clubId,
            user: user,
            reportId: reportId,
            body: reportBody,
        });

        const _putQuery = {
            TableName: myTable,
            Item: result
        };

        const counterDoc = await CountReportSchema.validateAsync({
            clubId: clubId
        });
        const _counterUpdateQuery = {
            TableName: myTable,
            Key: {
                P_K: counterDoc.P_K,
                S_K: counterDoc.S_K
            },
            UpdateExpression: 'ADD #cnt :counter',
            ExpressionAttributeNames: {
                '#cnt': 'count'
            },
            ExpressionAttributeValues: {
                ':counter': 1,
            }
        }

        const _transactQuery = {
            TransactItems: [{
                    Put: _putQuery
                },
                {
                    Update: _counterUpdateQuery
                }
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
        TableName: myTable,
        IndexName: timestampSortIndex,
        Limit: 20,
        KeyConditions: {
            "P_K": {
                "ComparisonOperator": "EQ",
                "AttributeValueList": [`CLUB#${clubId}`]
            },
            "TimestampSortField": {
                "ComparisonOperator": "BEGINS_WITH",
                "AttributeValueList": [`REPORT-SORT-TIMESTAMP#`]
            },
        },
        AttributesToGet: ['clubId', 'user', 'reportId', 'body', 'timestamp'],
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