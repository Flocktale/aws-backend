const router = require('express').Router();

const {
    dynamoClient,
    myTable,
    sns,
} = require('../../config');


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
        AttributesToGet: ['clubName', 'creator', 'status', 'community'],
    };

    try {
        const _clubData = (await dynamoClient.get(_clubQuery).promise())['Item'];

        if (!_clubData) {
            res.status(404).json('No such club exists');
            return;
        } else if (_clubData.creator.userId !== userId) {
            res.status(403).json('This user is not the owner of club, hence can not start club');
            return;
        } else if (_clubData.status === Constants.ClubStatus.Concluded) {
            return res.status(400).json('This club is already concluded, can not start again!!!');
        }



        const _updateDocQuery = {
            TableName: myTable,
            Key: {
                P_K: `CLUB#${clubId}`,
                S_K: `CLUBMETA#${clubId}`,
            },
            UpdateExpression: 'SET  #status = :stat, scheduleTime = :curr',
            ExpressionAttributeNames: {
                '#status': 'status',
            },
            ExpressionAttributeValues: {
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

            const promises = [];

            // sending club started event to all user subscribed to this club at this moment
            promises.push(pushToWsMsgQueue({
                action: Constants.WsMsgQueueAction.clubStarted,
                MessageGroupId: clubId,
                attributes: {
                    clubId: clubId,
                }
            }));

            if (_clubData.community) {

                // sending notification to all community members via community topic

                const snsPushNotificationObj = {
                    GCM: JSON.stringify({
                        notification: {
                            title: `LIVE Now : ${_clubData.clubName} by ${_clubData.creator.username} in ${_clubData.community.name}, hurry & join now`,
                            image: _clubData.avatar + '_large',
                            sound: "default",
                            color: '#fff74040',
                            click_action: 'FLUTTER_NOTIFICATION_CLICK',
                            icon: 'ic_notification',
                        },
                        priority: 'HIGH',
                    }),
                };
                promises.push(sns.publish({
                    Message: JSON.stringify(snsPushNotificationObj),
                    MessageStructure: 'json',
                    TopicArn: Constants.snsTopicArn(_clubData.community.communityId),
                }).promise());
            }

            try {
                await Promise.all(promises);
            } catch (error) {
                console.log(`Error in resolving promises`, error);
            }



            return res.status(201).json({});

        } catch (error) {
            console.log(error);
            return res.status(400).json(`Error starting in club: ${error}`);

        }


    } catch (error) {
        console.log(`Some error  ${error}`);
        return res.status(400).json(`Some error`);
    }
});

module.exports = router;