const router = require('express').Router();
const Joi = require('joi');

const { searchByUsernameIndex, dynamoClient, tableName } = require('../config');


router.get('/', async (req, res) => {

    const searchString = req.body;
    try {
        const _schema = Joi.string().min(3).max(25).required();
        await _schema.validateAsync(searchString);
    } catch (error) {
        res.status(400).json(error);
        return;
    }

    const _query = {
        TableName: tableName,
        IndexName: searchByUsernameIndex,
        KeyConditionExpression: 'PublicSearch = :hkey and begins_with ( FilterDataName , :filter )',
        ExpressionAttributeValues: {
            ":hkey": 1,
            ":filter": `CLUB#${searchString}`,
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
    dynamoClient.query(query, (err, data) => {
        if (err) res.status(404).json(err);
        else res.status(200).json(data);
    });
});


module.exports = router;