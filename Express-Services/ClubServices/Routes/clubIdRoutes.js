const router = require('express').Router();

const { audienceDynamicDataIndex, dynamoClient, tableName } = require('../config');


const avatarRouter = require('./clubIdNestedRoutes/avatarRoutes');
const clubEntryRouter = require('./clubIdNestedRoutes/clubEntryRouter');
const joinRequestRouter = require('./clubIdNestedRoutes/routesForJoinRequests');
const kickFeatureRouter = require('./clubIdNestedRoutes/kickFeatureRoutes');
const reactionRouter = require('./clubIdNestedRoutes/reactionRoutes');
const reportRouter = require('./clubIdNestedRoutes/reportRoutes');

router.use('/avatar', avatarRouter);
router.use('/enter', clubEntryRouter);
router.use('/join-request', joinRequestRouter);
router.use('/kick', kickFeatureRouter);
router.use('/reactions', reactionRouter);
router.use('/reports', reportRouter);

// _________________________________________________________________________________________________________________________________________________________
// _________________________________________________________________________________________________________________________________________________________

//! req.headers - {creatorId}
router.get('/', async (req, res) => {

    const clubId = req.clubId;
    const creatorId = req.headers.creatorId;
    if (!creatorId) {
        res.status(400).json('creatorId is required in headers');
        return;
    }

    const _getQuery = {
        TableName: tableName,
        Key: {
            P_K: `USER#${creatorId}`,
            S_K: `CLUB#${clubId}`
        }
    };

    dynamoClient.get(_getQuery, (err, data) => {
        if (err) res.status(404).json(err);
        else res.status(200).json(data);
    });

});

//! get list of participants
router.get('/participants', async (req, res) => {
    const clubId = req.clubId;

    const query = {
        TableName: tableName,
        IndexName: audienceDynamicDataIndex,
        KeyConditionExpression: 'P_K = :hkey and begins_with ( AudienceDynamicField , :filter )',
        ExpressionAttributeValues: {
            ":hkey": `CLUB#${clubId}`,
            ":filter": `Participant#`
        },
        AttributesToGet: [
            'audienceId', 'isOwner', 'avatar', 'username', 'AudienceDynamicField'
        ],
        ScanIndexForward: false,
        ReturnConsumedCapacity: "INDEXES"
    };

    dynamoClient.query(query, (err, data) => {
        if (err) res.status(404).json(err);
        else res.status(200).json(data);
    });

});


module.exports = router;
