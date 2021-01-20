const router = require('express').Router();
const Joi = require('joi');

const {
    searchByUsernameIndex,
    dynamoClient,
    tableName
} = require('../config');


// required
// query parameters - "username"
// headers - "lastevaluatedkey"  (optional)

//! Search list of users by username. (paginated with limit of 10 results)
router.get("/", async (req, res) => {

    const username = req.query.username;

    try {
        const _schema = Joi.string().max(25).token().required();
        await _schema.validateAsync(username);
    } catch (e) {
        res.status(400).json(e);
        return;
    }

    const query = {
        TableName: tableName,
        IndexName: searchByUsernameIndex,
        KeyConditions: {
            "PublicSearch": {
                "ComparisonOperator": "EQ",
                "AttributeValueList": [1]
            },
            "FilterDataName": {
                "ComparisonOperator": "BEGINS_WITH",
                "AttributeValueList": [`USER#${username}`]
            },
        },
        AttributesToGet: [
            'userId', 'username', 'name', 'avatar'
        ],
        Limit: 10,
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
                "users": data["Items"],
                'lastevaluatedkey': data["LastEvaluatedKey"]
            });
        }
    });

});

module.exports = router;