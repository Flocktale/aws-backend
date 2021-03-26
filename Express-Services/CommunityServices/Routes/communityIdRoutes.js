const {
    myTable,
    dynamoClient
} = require('../config');

const router = require('express').Router();

const communityUsersRouter = require('./communityIdNestedRoutes/communityUsersRoutes');
const imageRouter = require('./communityIdNestedRoutes/imageRoutes');
const communityClubRouter = require('./communityIdNestedRoutes/communityClubRoutes');

router.use('/users', communityUsersRouter);
router.use('/image', imageRouter);
router.use('/clubs', communityClubRouter);


router.get('/', async (req, res) => {
    const communityId = req.communityId;

    const _getQuery = {
        TableName: myTable,
        Key: {
            P_K: 'COMMUNITY#DATA',
            S_K: `COMMUNITYMETA#${communityId}`,
        },
        AttributesToGet: ['communityId', 'name', 'description', 'avatar', 'coverImage',
            'creator', 'hosts', 'liveClubCount', 'scheduledClubCount', 'memberCount'
        ],
    };

    const community = (await dynamoClient.get(_getQuery).promise())['Item'];

    return res.status(200).json(community);

});

router.patch('/', async (req, res) => {
    const communityId = req.communityId;

    if (!req.body || !req.body.description) {
        return res.status(400).json('body with description is required');
    }


    const description = req.body.description;


    const _communityDocUpdateQuery = {
        TableName: myTable,
        Key: {
            P_K: 'COMMUNITY#DATA',
            S_K: `COMMUNITYMETA#${communityId}`
        },
        UpdateExpression: 'set description :dscp',
        ExpressionAttributeValues: {
            ':dscp': description,
        },
    }

    await dynamoClient.update(_communityDocUpdateQuery).promise();

    return res.status(200).json('decription updated successfully');

});

module.exports = router;