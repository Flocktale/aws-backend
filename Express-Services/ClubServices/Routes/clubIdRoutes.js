const router = require('express').Router();

const {
    audienceDynamicDataIndex,
    dynamoClient,
    tableName,
    timestampSortIndex,
} = require('../config');


const avatarRouter = require('./clubIdNestedRoutes/avatarRoutes');
const reactionRouter = require('./clubIdNestedRoutes/reactionRoutes');
const reportRouter = require('./clubIdNestedRoutes/reportRoutes');
const joinRequestRouter = require('./clubIdNestedRoutes/routesForJoinRequests');
const kickFeatureRouter = require('./clubIdNestedRoutes/kickFeatureRoutes');

const startClubRouter = require('./clubIdNestedRoutes/startClubRoutes');

const inviteRouter = require('./clubIdNestedRoutes/inviteRoutes');

const blockFeatureRouter = require('./clubIdNestedRoutes/blockFeatureRoutes');

const muteFeatureRouter = require('./clubIdNestedRoutes/muteFeatureRoutes');

const concludeRouter = require('./clubIdNestedRoutes/concludeRoute');

router.use('/avatar', avatarRouter);
router.use('/reactions', reactionRouter);
router.use('/reports', reportRouter);
router.use('/join-request', joinRequestRouter);
router.use('/kick', kickFeatureRouter);

router.use('/start', startClubRouter);

router.use('/invite', inviteRouter);

router.use('/block', blockFeatureRouter);

router.use('/mute', muteFeatureRouter);

router.use('/conclude', concludeRouter);

// _________________________________________________________________________________________________________________________________________________________
// _________________________________________________________________________________________________________________________________________________________


const {
    AudienceSchemaWithDatabaseKeys,
    AudienceSchema
} = require('../Schemas/Audience');


async function fetchAndRegisterAudience({
    clubId,
    audienceId,
}) {
    return new Promise(async function (resolve, reject) {

        if (!clubId || !audienceId) {
            console.log(clubId, audienceId);
            reject('INSUFFICIENT_PARAMETERS');
        }
        var _responseAudienceData;

        // checking if user already exists as an audience
        const _oldAudienceDocQuery = {
            TableName: tableName,
            Key: {
                P_K: `CLUB#${clubId}`,
                S_K: `AUDIENCE#${audienceId}`,
            },
            AttributesToGet: ['isBlocked', 'isParticipant', 'joinRequested', 'joinRequestAttempts', 'audience', 'invitationId', 'timestamp'],
        };

        var _audienceDoc = (await dynamoClient.get(_oldAudienceDocQuery).promise())['Item'];

        if (_audienceDoc && _audienceDoc.isBlocked === true) {
            reject('BLOCKED_USER');
        }

        if (_audienceDoc) {
            // data we retrieved is same as what we want to send back.
            _responseAudienceData = {
                clubId: clubId,
                ..._audienceDoc,
            };

        } else {

            // new audience, it is :)

            // retrieving summary data for user
            const _audienceSummaryQuery = {
                TableName: tableName,
                Key: {
                    P_K: `USER#${audienceId}`,
                    S_K: `USERMETA#${audienceId}`,
                },
                AttributesToGet: ["userId", "username", "avatar"],
            };
            const audience = (await dynamoClient.get(_audienceSummaryQuery).promise())['Item'];

            if (!audience) {
                // it means audience has no registered data in database, 
                // this condition should not arise lest we have some serious implementation problems 
                console.log('could not fetch user summary data');
                reject('could not fetch user summary data');

            }

            _responseAudienceData = await AudienceSchema.validateAsync({
                clubId: clubId,
                audience: audience,
            });

            const _newAudienceDoc = await AudienceSchemaWithDatabaseKeys.validateAsync(_responseAudienceData);

            const _newAudienceDocQuery = {
                TableName: tableName,
                Item: _newAudienceDoc,
            };


            const _audienceCountUpdateQuery = {
                TableName: tableName,
                Key: {
                    P_K: `CLUB#${clubId}`,
                    S_K: 'CountAudience#'
                },
                UpdateExpression: 'set #cnt = #cnt + :counter',
                ExpressionAttributeNames: {
                    '#cnt': 'count'
                },
                ExpressionAttributeValues: {
                    ':counter': 1,
                },
                ReturnValues: 'UPDATED_NEW',
            };

            // we are not using transaction because that won't return the data of audienceCount.

            await dynamoClient.put(_newAudienceDocQuery).promise();
            const countReturnedData = (await dynamoClient.update(_audienceCountUpdateQuery).promise())['Attributes'];

            if (countReturnedData) {
                const estimatedAudience = countReturnedData['count'];

                const _updateClubEstimatedCountQuery = {
                    TableName: tableName,
                    Key: {
                        P_K: `CLUB#${clubId}`,
                        S_K: `CLUBMETA#${clubId}`
                    },
                    UpdateExpression: 'SET estimatedAudience = :est',
                    ExpressionAttributeValues: {
                        ':est': estimatedAudience,
                    },
                }
                const condition_1 = (estimatedAudience <= 100);
                const condition_2 = (estimatedAudience > 100 && estimatedAudience <= 1000) ? (estimatedAudience % 13 === 0) : false;
                const condition_3 = (estimatedAudience > 1000 && estimatedAudience <= 10000) ? (estimatedAudience % 127 === 0) : false;
                const condition_4 = (estimatedAudience > 10000 && estimatedAudience <= 100000) ? (estimatedAudience % 1700 === 0) : false;
                const condition_5 = (estimatedAudience % 10000 === 0);

                if (condition_1 || condition_2 || condition_3 || condition_4 || condition_5) {
                    await dynamoClient.update(_updateClubEstimatedCountQuery).promise();
                    console.log('ho gya');
                }

            }



        }
        resolve(_responseAudienceData);
    })
}

async function fetchAudienceReactionValue({
    clubId,
    audienceId,
}) {

    if (!clubId || !audienceId) {
        console.log(clubId, audienceId);
        reject('INSUFFICIENT_PARAMETERS');
    }
    const _reactionQuery = {
        TableName: tableName,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `REACT#${audienceId}`
        },
        AttributesToGet: ['indexValue'],
    };
    const data = (await dynamoClient.get(_reactionQuery).promise())['Item'];
    if (data) {
        return data.indexValue;
    }
}

// required
// query parameters - "userId"
router.get('/', async (req, res) => {

    const clubId = req.clubId;
    const audienceId = req.query.userId;

    if (!audienceId) {
        res.status(400).json('user id is required in query parameters');
        return;
    }

    // audience data to be sent in response
    var _responseAudienceData = {};

    try {
        _responseAudienceData = await fetchAndRegisterAudience({
            clubId: clubId,
            audienceId: audienceId,
        });
    } catch (error) {
        if (error === 'BLOCKED_USER') {
            // user is blocked from this club, hence sending 403 (forbidden)
            return res.status(403).json('BLOCKED_USER');
        }
        console.log(error);
        return res.status(500).json(error);
    }


    const _reactionIndexValue = await fetchAudienceReactionValue({
        clubId: clubId,
        audienceId: audienceId,
    });

    const _getQuery = {
        TableName: tableName,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `CLUBMETA#${clubId}`
        },
        AttributesToGet: ['clubId', 'clubName', 'creator', 'agoraToken', 'category',
            'isLive', 'isConcluded',
            'scheduleTime', 'clubAvatar', 'description', 'isPrivate', 'tags',
        ],
    };

    try {
        const data = (await dynamoClient.get(_getQuery).promise())['Item'];

        return res.status(200).json({
            club: data,
            audienceData: _responseAudienceData,
            reactionIndexValue: _reactionIndexValue,
        });
    } catch (error) {
        console.log(error);
        return res.status(404).json(error);
    }

});


//! get list of all participants
router.get('/participants', async (req, res) => {
    const clubId = req.clubId;

    const query = {
        TableName: tableName,
        IndexName: audienceDynamicDataIndex,
        KeyConditions: {
            "P_K": {
                "ComparisonOperator": "EQ",
                "AttributeValueList": [`CLUB#${clubId}`]
            },
            "AudienceDynamicField": {
                "ComparisonOperator": "BEGINS_WITH",
                "AttributeValueList": [`Participant#`]
            },
        },
        AttributesToGet: ['audience'],
        ScanIndexForward: false,
        ReturnConsumedCapacity: "INDEXES"
    };

    dynamoClient.query(query, (err, data) => {
        if (err) res.status(404).json(err);
        else {
            console.log(data);
            res.status(200).json({
                "participants": data["Items"],
                'lastevaluatedkey': data["LastEvaluatedKey"]
            });
        }
    });
});


// headers - "lastevaluatedkey"  (optional)
//! get list of audience

router.get('/audience', async (req, res) => {
    const clubId = req.clubId;

    const query = {
        TableName: tableName,
        IndexName: timestampSortIndex,
        KeyConditions: {
            "P_K": {
                "ComparisonOperator": "EQ",
                "AttributeValueList": [`CLUB#${clubId}`]
            },
            "TimestampSortField": {
                "ComparisonOperator": "BEGINS_WITH",
                "AttributeValueList": [`AUDIENCE-SORT-TIMESTAMP#`]
            },
        },
        QueryFilter: {
            isBlocked: {
                ComparisonOperator: 'EQ',
                AttributeValueList: [false]

            },
            isParticipant: {
                ComparisonOperator: 'EQ',
                AttributeValueList: [false]

            },
        },
        AttributesToGet: ['audience'],
        Limit: 30,
    };

    if (req.headers.lastevaluatedkey) {
        query['ExclusiveStartKey'] = JSON.parse(req.headers.lastevaluatedkey);
    }

    dynamoClient.query(query, (err, data) => {
        if (err) res.status(404).json(err);
        else {
            console.log(data);
            res.status(200).json({
                "audience": data["Items"],
                'lastevaluatedkey': data["LastEvaluatedKey"]
            });
        }
    });
});


module.exports = router;