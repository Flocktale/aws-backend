const router = require('express').Router();
const Joi = require('joi');

const {
    searchByUsernameIndex,
    dynamoClient,
    myTable
} = require('../../config');
const {
    cloneObj
} = require('../../Functions/customFunctions');


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
// query parameters - "searchString" , "type" (values are - "unified","clubs","users","communities")
// headers - "lastevaluatedkey"  (optional)
router.get('/', async (req, res) => {

    var searchString = req.query.searchString;
    const type = req.query.type;
    try {
        await Joi.string().max(25).required().validateAsync(searchString);
        await Joi.string().valid("unified", "clubs", "users", "communities").required().validateAsync(type);
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
                // "AttributeValueList": []
            },
            "FilterDataName": {
                "ComparisonOperator": "BEGINS_WITH",
                // "AttributeValueList": [""]
            },
        },
        // AttributesToGet: [],
        Limit: 20,
    };

    const clubAttributes = ['clubId', 'clubName', 'creator', 'category', 'scheduleTime', 'clubAvatar', 'tags', 'duration', 'community'];

    const userAttributes = ['userId', 'username', 'tagline', 'name', 'avatar'];

    const communityAttributes = ['communityId', 'name', 'description', 'avatar', 'coverImage',
        'creator', 'hosts', 'liveClubCount', 'scheduledClubCount', 'memberCount'
    ];

    var result = {};

    const _clubQuery = cloneObj(_query);
    const _userQuery = cloneObj(_query);

    const _communityQuery = cloneObj(_query);


    _clubQuery['KeyConditions']['PublicSearch']['AttributeValueList'] = [2];

    _userQuery['KeyConditions']['PublicSearch']['AttributeValueList'] = [1];


    _communityQuery['KeyConditions']['PublicSearch']['AttributeValueList'] = [3];
    _communityQuery['Limit'] = 10;


    if (type === "unified") {

        var clubData, userData, communityData;


        await Promise.all([
            getSearchResult(searchString, _clubQuery, "CLUB", clubAttributes, req),
            getSearchResult(searchString, _userQuery, "USER", userAttributes, req),
            getSearchResult(searchString, _communityQuery, "COMMUNITY", communityAttributes, req),
        ]).then(values => {
            clubData = values[0];
            userData = values[1];
            communityData = values[2];
        });

        result = {
            clubs: clubData['Items'],
            clublastevaluatedkey: clubData["LastEvaluatedKey"],

            users: userData['Items'],
            userlastevaluatedkey: userData["LastEvaluatedKey"],

            communities: communityData['Items'],
            communitylastevaluatedkey: communityData["LastEvaluatedKey"],
        };

    } else {

        if (type === "clubs") {
            const specificData = await getSearchResult(searchString, _clubQuery, "CLUB", clubAttributes, req)
            result["clubs"] = specificData["Items"];
            result["clublastevaluatedkey"] = specificData["LastEvaluatedKey"];
        } else if (type === "users") {
            const specificData = await getSearchResult(searchString, _userQuery, "USER", userAttributes, req)
            result["users"] = specificData["Items"];
            result["userlastevaluatedkey"] = specificData["LastEvaluatedKey"];
        } else if (type === "communities") {
            const specificData = await getSearchResult(searchString, _communityQuery, "COMMUNITY", communityAttributes, req)
            result["communities"] = specificData["Items"];
            result["communitylastevaluatedkey"] = specificData["LastEvaluatedKey"];
        }

    }

    return res.status(200).json(result);
});


module.exports = router;