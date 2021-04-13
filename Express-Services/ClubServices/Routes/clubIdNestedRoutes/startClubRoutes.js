const router = require('express').Router();

const {
    dynamoClient,
    myTable,
} = require('../../config');


const {
    generateAgoraToken
} = require('../../Functions/agoraFunctions');
const Constants = require('../../constants');
const {
    pushToWsMsgQueue
} = require('../../Functions/sqsFunctions');


// required
// query parameters - "userId" (this user must be owner of club)
router.post('/', async (req, res) => {

    const clubId = req.clubId;
    const userId = req.query.userId;

    if (!userId) {
        res.status(400).json('user id of user is required in query parameters');
        return;
    }

    const _clubQuery = {
        TableName: myTable,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `CLUBMETA#${clubId}`,
        },
        AttributesToGet: ['creator', 'agoraToken', 'status', 'community'],
    };

    try {
        const _clubData = (await dynamoClient.get(_clubQuery).promise())['Item'];

        if (!_clubData) {
            res.status(404).json('No such club exists');
            return;
        } else if (_clubData.creator.userId !== userId) {
            res.status(403).json('This user is not the owner of club, hence can not generate token');
            return;
        } else if (_clubData.status === Constants.ClubStatus.Concluded) {
            return res.status(400).json('This club is already concluded, can not start again!!!');
        } else if (_clubData.agoraToken) {
            res.status(200).json({
                "token": _clubData.agoraToken
            });
            return;
        }

        // generating new token for this club
        const agoraToken = await generateAgoraToken({
            clubId: clubId
        });



        const _updateDocQuery = {
            TableName: myTable,
            Key: {
                P_K: `CLUB#${clubId}`,
                S_K: `CLUBMETA#${clubId}`,
            },
            UpdateExpression: 'SET agoraToken = :token, #status = :stat, scheduleTime = :curr',
            ExpressionAttributeNames: {
                '#status': 'status',
            },
            ExpressionAttributeValues: {
                ':token': agoraToken,
                ':stat': Constants.ClubStatus.Live,
                ':curr': Date.now(),
            }
        };

        try {

            if (_clubData.community) {
                const _communityDocUpdateQuery = {
                    TableName: myTable,
                    Key: {
                        P_K: `COMMUNITY#${_clubData.community.communityId}`,
                        S_K: `COMMUNITYMETA#${_clubData.community.communityId}`
                    },
                    UpdateExpression: 'ADD scheduledClubCount :counter, liveClubCount :liveHost ',
                    ExpressionAttributeValues: {
                        ':counter': -1,
                        ':liveHost': 1,
                    },
                }

                await dynamoClient.transactWrite({
                    TransactItems: [{
                        Update: _communityDocUpdateQuery
                    }, {
                        Update: _updateDocQuery
                    }]
                }).promise();

            } else {
                await dynamoClient.update(_updateDocQuery).promise();
            }

            // sending agoraToken to all user subscribed to this club at this moment
            await pushToWsMsgQueue({
                action: Constants.WsMsgQueueAction.clubStarted,
                MessageGroupId: clubId,
                attributes: {
                    clubId: clubId,
                    agoraToken: agoraToken
                }
            });

            return res.status(201).json({
                "agoraToken": agoraToken,
            });

        } catch (error) {
            console.log(error);
            return res.status(400).json(`Error in updating token in club: ${error}`);

        }


    } catch (error) {
        console.log(`Some error in /token/create ${error}`);
        return res.status(400).json(`Some error in /token/create ${error}`);
    }
});

module.exports = router;