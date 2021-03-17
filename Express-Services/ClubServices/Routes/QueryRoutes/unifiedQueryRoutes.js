const router = require('express').Router();
const Joi = require('joi');

const {
    searchByUsernameIndex,
    dynamoClient,
    myTable
} = require('../../config');



async function getSearchResult(searchString, _query, type, attributes, req) {

    searchString = searchString.toLowerCase();

    const _specificQuery = {
        ..._query
    };
    _specificQuery["Limit"] = 10;

    var filterKey;
    filterKey = `${type}#${searchString}`;
    _specificQuery["AttributesToGet"] = attributes;
    _specificQuery["KeyConditions"]["FilterDataName"]["AttributeValueList"] = [filterKey];

    if (req.headers.lastevaluatedkey) {
        _specificQuery['ExclusiveStartKey'] = JSON.parse(req.headers.lastevaluatedkey);
    }

    const specificData = await dynamoClient.query(_specificQuery).promise();
    return specificData;
}



// required
// query parameters - "searchString" , "type" (values are - "unified","clubs","users")
// headers - "lastevaluatedkey"  (optional)
router.get('/', async (req, res) => {

    var searchString = req.query.searchString;
    const type = req.query.type;
    try {
        await Joi.string().max(25).required().validateAsync(searchString);
        await Joi.string().valid("unified", "clubs", "users").required().validateAsync(type);
    } catch (error) {
        res.status(400).json(error);
        return;
    }

    searchString = searchString.toLowerCase();


    const _query = {
        TableName: myTable,
        IndexName: searchByUsernameIndex,
        KeyConditions: {
            "PublicSearch": {
                "ComparisonOperator": "EQ",
                "AttributeValueList": [1]
            },
            "FilterDataName": {
                "ComparisonOperator": "BEGINS_WITH",
                // "AttributeValueList": [""]
            },
        },
        // AttributesToGet: [],
        Limit: 5,
        ReturnConsumedCapacity: "INDEXES"
    };

    const clubAttributes = ['clubId', 'clubName', 'creator', 'category', 'scheduleTime', 'clubAvatar', 'tags', 'duration'];

    const userAttributes = ['userId', 'username', 'tagline', 'name', 'avatar'];


    if (type === "unified") {

        var clubData, userData;

        await Promise.all([
            getSearchResult(searchString, _query, "CLUB", clubAttributes, req),
            getSearchResult(searchString, _query, "USER", userAttributes, req)
        ]).then(values => {
            clubData = values[0];
            userData = values[1];
        });


        return res.status(200).json({
            clubs: clubData['Items'],
            clublastevaluatedkey: clubData["LastEvaluatedKey"],

            users: userData['Items'],
            userlastevaluatedkey: userData["LastEvaluatedKey"],
        });
    } else {

        var result = {};
        if (type === "clubs") {
            const specificData = await getSearchResult(searchString, _query, "CLUB", clubAttributes, req)
            result["clubs"] = specificData["Items"];
            result["clublastevaluatedkey"] = specificData["LastEvaluatedKey"];
        } else {
            // result["users"] = specificData["Items"];
            const specificData = await getSearchResult(searchString, _query, "USER", userAttributes, req)
            result["users"] = specificData["Items"];
            result["userlastevaluatedkey"] = specificData["LastEvaluatedKey"];
        }

        return res.status(200).json(result);
    }
});


module.exports = router;