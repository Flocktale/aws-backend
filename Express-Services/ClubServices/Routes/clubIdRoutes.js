const router = require('express').Router();

const { audienceDynamicDataIndex, dynamoClient, tableName } = require('../config');


const avatarRouter = require('./clubIdNestedRoutes/avatarRoutes');
const clubEntryRouter = require('./clubIdNestedRoutes/clubEntryRouter');
const reactionRouter = require('./clubIdNestedRoutes/reactionRoutes');
const reportRouter = require('./clubIdNestedRoutes/reportRoutes');
const joinRequestRouter = require('./clubIdNestedRoutes/routesForJoinRequests');
const kickFeatureRouter = require('./clubIdNestedRoutes/kickFeatureRoutes');

router.use('/avatar', avatarRouter);
router.use('/enter', clubEntryRouter);
router.use('/reactions', reactionRouter);
router.use('/reports', reportRouter);
router.use('/join-request', joinRequestRouter);
router.use('/kick', kickFeatureRouter);

// _________________________________________________________________________________________________________________________________________________________
// _________________________________________________________________________________________________________________________________________________________

router.get('/', async (req, res) => {

    const clubId = req.clubId;

    const _getQuery = {
        TableName: tableName,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `CLUBMETA#${clubId}`
        },
    };

    dynamoClient.get(_getQuery, (err, data) => {
        if (err) {
            console.log(err);
            res.status(404).json(err);
        }
        else {
            console.log(data);
            res.status(200).json(data['Item']);
        }
    });

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


module.exports = router;
