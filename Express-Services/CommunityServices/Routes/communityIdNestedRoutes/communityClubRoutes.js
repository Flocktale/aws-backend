const {
    myTable,
    clubCommunityIndex,
    dynamoClient
} = require('../../config');
const Constants = require('../../constants');

const router = require('express').Router();


// headers - lastevaluatedkey (optional)
router.get('/', async (req, res) => {
    const communityId = req.communityId;

    const _query = {
        TableName: myTable,
        IndexName: clubCommunityIndex,
        KeyConditions: {
            'ClubCommunityField': {
                ComparisonOperator: 'EQ',
                AttributeValueList: [`COMMUNITY#CLUB#${communityId}`]
            }
        },
        QueryFilter: {
            'status': {
                ComparisonOperator: 'NE',
                AttributeValueList: [Constants.ClubStatus.Concluded]
            }
        },
        AttributesToGet: ['clubId', 'creator', 'clubName', 'category', 'scheduleTime',
            'clubAvatar', 'tags', 'status', 'subCategory',
            'estimatedAudience', 'participants'
        ],
        ScanIndexForward: false,
        Limit: 20,
        ExclusiveStartKey: req.headers.lastevaluatedkey,
    };

    const data = await dynamoClient.query(_query).promise();

    return res.status(200).json({
        clubs: data['Items'],
        lastevaluatedkey: data['LastEvaluatedKey'],
    })

});

module.exports = router;