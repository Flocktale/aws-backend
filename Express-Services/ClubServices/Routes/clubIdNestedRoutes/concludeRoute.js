const router = require('express').Router();

const {
    dynamoClient,
    myTable
} = require('../../config');
const Constants = require('../../constants');
const {
    pushToWsMsgQueue
} = require('../../Functions/sqsFunctions');




//required
// query parameters - "creatorId"

router.post('/', async (req, res) => {
    const clubId = req.clubId;

    const creatorId = req.query.creatorId;

    const currTime = Date.now();

    const _clubQuery = {
        TableName: myTable,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `CLUBMETA#${clubId}`
        },
        AttributesToGet: ['status', 'creator', 'scheduleTime', 'community'],
    };

    const _clubData = (await dynamoClient.get(_clubQuery).promise())['Item'];
    if (!_clubData) {
        return res.status(404).json('no such club exists');
    } else if (_clubData.creator.userId !== creatorId) {
        return res.status(403).json('Only club owner can entertain this request.');
    } else if (_clubData.status === Constants.ClubStatus.Concluded) {
        return res.status(400).json('This club is already concluded.');
    }

    const duration = Math.floor((currTime - _clubData.scheduleTime) / 1000);

    const _updateQuery = {
        TableName: myTable,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `CLUBMETA#${clubId}`
        },
        UpdateExpression: 'SET #status = :stat, #duration = :duration, REMOVE agoraToken DELETE participants :prtUser ',
        ExpressionAttributeNames: {
            '#duration': 'duration',
            '#status': 'status',
        },
        ExpressionAttributeValues: {
            ':stat': Constants.ClubStatus.Concluded,
            ':duration': duration,
            ':prtUser': dynamoClient.createSet([_clubData.creator.avatar]),
        },
    };

    try {
        if (_clubData.community) {
            const _communityDocUpdateQuery = {
                TableName: myTable,
                Key: {
                    P_K: `COMMUNITY#${_clubData.community.communityId}`,
                    S_K: `COMMUNITYMETA#${_clubData.community.communityId}`
                },
                UpdateExpression: 'ADD liveClubCount :counter ',
                ExpressionAttributeValues: {
                    ':counter': -1,
                },
            }

            await dynamoClient.transactWrite({
                TransactItems: [{
                    Update: _communityDocUpdateQuery
                }, {
                    Update: _updateQuery
                }]
            }).promise();

        } else {
            await dynamoClient.update(_updateQuery).promise();
        }
        await pushToWsMsgQueue({
            action: Constants.WsMsgQueueAction.clubConcluded,
            MessageGroupId: clubId,
            attributes: {
                clubId: clubId
            }
        });

        return res.status(202).json('Club is concluded');
    } catch (error) {
        console.log('error in concluding club: ', error);
        return res.status(400).json('Error in concluding club');
    }

});

module.exports = router;