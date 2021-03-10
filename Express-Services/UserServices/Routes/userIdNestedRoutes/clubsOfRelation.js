const router = require('express').Router();

const {
    dynamoClient,
    myTable,
    timestampSortIndex,
    clubCreatorIdIndex,
} = require('../../config');


// required
// query parameters - "socialRelation"  (valid values => "friend" , "following")
//                  - "lastevaluatedkey" (optional)

router.get('/related', async (req, res) => {
    const userId = req.userId;
    const socialRelation = req.query.socialRelation;

    if (!(socialRelation === 'friend' || socialRelation === 'following')) {
        return res.status(400).json("WRONG_QUERY_PARAMETERS");
    }

    var lastevaluatedkey = req.query.lastevaluatedkey;

    var responseList = [],
        clubOwnerCount = 0;
    do {

        await _getListOfClubOfRelatedUser(userId, socialRelation, lastevaluatedkey).then((data) => {

            lastevaluatedkey = data['lastevaluatedkey'];
            clubOwnerCount += data['clubOwnerCount'];
            for (var club in data['responseList']) {
                responseList.push(club);
            }
        });

    } while (clubOwnerCount < 10 && lastevaluatedkey) // either we get atleast 10 clubs or we have explored whole relation list.

    return res.status(200).json({
        clubs: responseList,
        lastevaluatedkey: lastevaluatedkey,
    })

});

async function _getListOfClubOfRelatedUser(userId, socialRelation, lastevaluatedkey) {

    if (!userId || !(socialRelation === 'friend' || socialRelation === 'following')) {
        return;
    }

    var bitChecker, scanOrder;
    if (socialRelation === 'friend') {
        bitChecker = 'B1';
        scanOrder = true; // oldest friends first
    } else {
        bitChecker = 'B5';
        scanOrder = false; // latest following first
    }

    const _relationIdListQuery = {
        TableName: myTable,
        IndexName: timestampSortIndex,
        KeyConditionExpression: 'P_K = :pk and begins_with(TimestampSortField,:tsf)',
        FilterExpression: 'relationIndexObj.#bit = :tr',
        ExpressionAttributeNames: {
            '#bit': bitChecker,
        },
        ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':tsf': 'RELATION-SORT-TIMESTAMP#',
            ':tr': true,
        },
        ProjectionExpression: 'foreignUser.userId',
        ScanIndexForward: scanOrder,
        Limit: 25,
    };

    if (lastevaluatedkey) {
        _relationIdListQuery['ExclusiveStartKey'] = JSON.parse(lastevaluatedkey);
    }

    const userListData = (await dynamoClient.query(_relationIdListQuery).promise());

    const userIdList = userListData['Items'].map(({
        foreignUser
    }) => {
        return foreignUser.userId;
    });

    const responseList = [];
    var clubOwnerCount = 0;

    var promises = [];

    const currentDate = new Date();
    currentDate.setHours(currentDate.getHours() - 12); // setting it 12 hours slow (to get all the clubs within last 12 hours )

    const thresholdTime = Date.parse(currentDate);


    for (var id of userIdList) {

        promises.push(new Promise(async (resolve, reject) => {
            try {
                const clubQuery = {
                    TableName: myTable,
                    IndexName: clubCreatorIdIndex,
                    KeyConditions: {
                        'ClubCreatorIdField': {
                            ComparisonOperator: 'EQ',
                            AttributeValueList: [`USER#${id}`]
                        },
                        'scheduleTime': {
                            ComparisonOperator: 'GT',
                            AttributeValueList: [thresholdTime]
                        }
                    },
                    QueryFilter: {
                        'isConcluded': {
                            ComparisonOperator: 'NE',
                            AttributeValueList: [true]
                        }
                    },
                    AttributesToGet: ['clubId', 'creator', 'clubName', 'category', 'scheduleTime',
                        'clubAvatar', 'tags', 'isLive', 'subCategory',
                        'estimatedAudience', 'participants'
                    ],
                    ScanIndexForward: false,
                    Limit: 1,
                };

                const clubs = (await dynamoClient.query(clubQuery).promise())['Items'];

                if (clubs && clubs[0]) {
                    responseList.push(clubs[0]);
                    clubOwnerCount++;
                }

            } catch (error) {
                console.log('error while fetching club of a friend of this user: ', error);
            }
            resolve();
        }));

    }

    await Promise.all(promises);

    return {
        responseList,
        clubOwnerCount,
        lastevaluatedkey: userListData['LastEvaluatedKey'],
    }

}

module.exports = router;