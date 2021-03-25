const {
    myTable,
    dynamoClient
} = require('../config');

const router = require('express').Router();

const communityUsersRouter = require('./communityIdNestedRoutes/communityUsersRoutes');

router.use('/users', communityUsersRouter);


router.get('/', async (req, res) => {
    const communityId = req.communityId;

    const _getQuery = {
        TableName: myTable,
        Key: {
            P_K: 'COMMUNITY#DATA',
            S_K: `COMMUNITYMETA#${communityId}`,
        },
        AttributesToGet: ['communityId', 'name', 'description', 'avatar', 'coverImage',
            'creator', 'hosts', 'liveClubHosts', 'scheduledClubCount', 'memberCount'
        ],
    };

    const community = (await dynamoClient.get(_getQuery).promise())['Item'];

    return res.status(200).json(community);

});

module.exports = router;