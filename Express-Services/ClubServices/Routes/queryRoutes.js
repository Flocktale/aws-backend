const router = require('express').Router();
const Joi = require('joi');

const { searchByUsernameIndex, dynamoClient, tableName } = require('../config');

// required
// query parameters - "username"
// headers - "lastevaluatedkey"  (optional)

router.get('/', async (req, res) => {

    const clubName = req.query.clubName;
    try {
        const _schema = Joi.string().min(3).max(25).required();
        await _schema.validateAsync(clubName);
    } catch (error) {
        res.status(400).json(error);
        return;
    }

    const _query = {
        TableName: tableName,
        IndexName: searchByUsernameIndex,
        KeyConditions: {
            "PublicSearch": {
                "ComparisonOperator": "EQ",
                "AttributeValueList": [1]
            },
            "FilterDataName": {
                "ComparisonOperator": "BEGINS_WITH",
                "AttributeValueList": [`CLUB#${clubName}`]
            },
        },
        AttributesToGet: [
            'clubId', 'clubName', 'creatorId', 'creatorUsername', 'category', 'scheduleTime',
            'creatorAvatar', 'clubAvatar', 'tags', 'duration'
        ],
        Limit: 10,
        ReturnConsumedCapacity: "INDEXES"
    };

    if (req.headers.lastevaluatedkey) {
        query['ExclusiveStartKey'] = JSON.parse(req.headers.lastevaluatedkey);
    }
    dynamoClient.query(_query, (err, data) => {
        if (err) res.status(404).json(err);
        else {
            console.log(data);
            res.status(200).json({
                "clubs": data["Items"],
                'lastevaluatedkey': data["LastEvaluatedKey"]
            });
        }
    });
});


module.exports = router;