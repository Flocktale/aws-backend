const {
    myTable,
    dynamoClient
} = require('../config');

const router = require('express').Router();

const communityUsersRouter = require('./communityIdNestedRoutes/communityUsersRoutes');
const imageRouter = require('./communityIdNestedRoutes/imageRoutes');
const communityClubRouter = require('./communityIdNestedRoutes/communityClubRoutes');
const Constants = require('../constants');

router.use('/users', communityUsersRouter);
router.use('/image', imageRouter);
router.use('/clubs', communityClubRouter);

// query parameters - "userId"
router.get('/', async (req, res) => {
    const communityId = req.communityId;
    const userId = req.query.userId;


    const _getQuery = {
        TableName: myTable,
        Key: {
            P_K: `COMMUNITY#${communityId}`,
            S_K: `COMMUNITYMETA#${communityId}`,
        },
        AttributesToGet: ['communityId', 'name', 'description', 'avatar', 'coverImage',
            'creator', 'hosts', 'liveClubCount', 'scheduledClubCount', 'memberCount'
        ],
    };


    const community = (await dynamoClient.get(_getQuery).promise())['Item'];
    var communityUser;

    if (userId) {
        var isHost = false;
        for (var avatar of community.hosts.values) {
            if (avatar === Constants.UserAvatarUrl(userId)) {
                isHost = true;
                break;
            }
        }

        const _userQuery = {
            TableName: myTable,
            Key: {
                P_K: `COMMUNITY#MEMBER#${communityId}`, // by default, fetching as member
                S_K: `COMMUNITY#USER#${userId}`,
            },
            AttributesToGet: ['community', 'user', 'type', 'timestamp', 'invited'],
        };
        if (isHost === true) {
            _userQuery['Key']['P_K'] = `COMMUNITY#HOST#${communityId}`;
        }
        communityUser = (await dynamoClient.get(_userQuery).promise())['Item'];
    }

    return res.status(200).json({
        community: community,
        communityUser: communityUser,
    });

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
            P_K: `COMMUNITY#${communityId}`,
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