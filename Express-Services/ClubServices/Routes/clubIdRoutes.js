const router = require('express').Router();

const {
    audienceDynamicDataIndex,
    dynamoClient,
    myTable,
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
const Constants = require('../constants');



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
            TableName: myTable,
            Key: {
                P_K: `CLUB#${clubId}`,
                S_K: `AUDIENCE#${audienceId}`,
            },
            AttributesToGet: ['status', 'joinRequestAttempts', 'audience', 'invitationId', 'timestamp', 'isMuted'],
        };

        var _audienceDoc = (await dynamoClient.get(_oldAudienceDocQuery).promise())['Item'];

        if (_audienceDoc && _audienceDoc.status === Constants.AudienceStatus.Blocked) {
            reject('BLOCKED_USER');
        }

        var promises = [];

        if (_audienceDoc) {

            _audienceDoc['clubId'] = clubId;

            //updating timestamp and TimestampSortField of audience if it is not participant( participant case can only be possible if this is owner coming back to his club)
            if (_audienceDoc.status === Constants.AudienceStatus.Participant) {
                // data we retrieved is same as what we want to send back.
                _responseAudienceData = _audienceDoc;

            } else {

                _audienceDoc['timestamp'] = Date.now();
                _responseAudienceData = _audienceDoc;

                const _audienceUpdateQuery = {
                    TableName: myTable,
                    Key: {
                        P_K: `CLUB#${clubId}`,
                        S_K: `AUDIENCE#${audienceId}`,
                    },
                    UpdateExpression: 'set #tsp = :tsp',
                    ExpressionAttributeNames: {
                        '#tsp': 'timestamp'
                    },
                    ExpressionAttributeValues: {
                        ':tsp': _audienceDoc.timestamp,
                    },
                };

                promises.push(dynamoClient.update(_audienceUpdateQuery).promise());

            }

        } else {

            // new audience, it is :)

            // retrieving summary data for user
            const _audienceSummaryQuery = {
                TableName: myTable,
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

            // deleting TimestampSortField as it projects this user into audience list
            // once user play the club, this field will be inserted there        
            delete _newAudienceDoc.TimestampSortField;

            const _newAudienceDocQuery = {
                TableName: myTable,
                Item: _newAudienceDoc,
            };



            promises.push(dynamoClient.put(_newAudienceDocQuery).promise());

        }

        await Promise.all(promises);

        resolve(_responseAudienceData);

    })
}

async function fetchAudienceReactionValue({
    clubId,
    audienceId,
}) {

    return new Promise(async (resolve, reject) => {

        if (!clubId || !audienceId) {
            console.log(clubId, audienceId);
            reject('INSUFFICIENT_PARAMETERS');
        }
        const _reactionQuery = {
            TableName: myTable,
            Key: {
                P_K: `CLUB#${clubId}`,
                S_K: `REACT#${audienceId}`
            },
            AttributesToGet: ['indexValue'],
        };
        const data = (await dynamoClient.get(_reactionQuery).promise())['Item'];
        if (data) {
            resolve(data.indexValue);
        }
        resolve();
    });
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


    const _getQuery = {
        TableName: myTable,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `CLUBMETA#${clubId}`
        },
        AttributesToGet: ['clubId', 'clubName', 'creator', 'agoraToken', 'category',
            'isLive', 'isConcluded',
            'scheduleTime', 'clubAvatar', 'description', 'isPrivate', 'tags',
        ],
    };

    // audience data to be sent in response
    var _responseAudienceData, _reactionIndexValue, _clubData;

    const promises = [
        fetchAndRegisterAudience({
            clubId: clubId,
            audienceId: audienceId,
        }),
        fetchAudienceReactionValue({
            clubId: clubId,
            audienceId: audienceId,
        }),
        new Promise(async (resolve, _) => {
            const data = (await dynamoClient.get(_getQuery).promise())['Item'];
            resolve(data);
        }),
    ];

    try {
        await Promise.all(promises).then(values => {
            _responseAudienceData = values[0];
            _reactionIndexValue = values[1];
            _clubData = values[2];
        });
    } catch (error) {
        if (error === 'BLOCKED_USER') {
            // user is blocked from this club, hence sending 403 (forbidden)
            return res.status(403).json('BLOCKED_USER');
        }
        console.log(error);
        return res.status(500).json(error);
    }


    return res.status(200).json({
        club: _clubData,
        audienceData: _responseAudienceData,
        reactionIndexValue: _reactionIndexValue,
    });

});


//! get list of all participants
router.get('/participants', async (req, res) => {
    const clubId = req.clubId;

    const query = {
        TableName: myTable,
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
        AttributesToGet: ['audience', 'isMuted'],
        ScanIndexForward: false,
    };

    dynamoClient.query(query, (err, data) => {
        if (err) res.status(404).json(err);
        else {
            console.log(data);
            res.status(200).json(data['Items']);
        }
    });
});


// headers - "lastevaluatedkey"  (optional)
//! get list of audience

router.get('/audience', async (req, res) => {
    const clubId = req.clubId;

    const query = {
        TableName: myTable,
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
            status: {
                ComparisonOperator: 'NULL',
            },
        },
        ScanIndexForward: true, // retrieving oldest audience first
        AttributesToGet: ['audience'],
        Limit: 50,
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