// To generate temporary token with validity of 24 hrs for Agora live audio interaction

const router = require('express').Router();
const {
    RtcTokenBuilder,
    RtcRole
} = require('agora-access-token');

const {
    dynamoClient,
    tableName,
    agoraAppId,
    agoraPrimaryCertificate,
} = require('../../config');

const {
    postClubStartedMessageToWebsocketUsers
} = require('./websocketFunctions');


// required
// query parameters - "userId" (this user must be owner of club)
router.post('/token/create', async (req, res) => {

    const clubId = req.clubId;
    const userId = req.query.userId;

    if (!userId) {
        res.status(400).json('user id of user is required in query parameters');
        return;
    }

    const _clubQuery = {
        TableName: tableName,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `CLUBMETA#${clubId}`,
        },
        AttributesToGet: ['creator', 'agoraToken'],
    };

    try {
        const _clubData = (await dynamoClient.get(_clubQuery).promise())['Item'];

        if (!_clubData) {
            res.status(400).json('No such club exists');
            return;
        } else if (_clubData.creator.userId !== userId) {
            res.status(403).json('This user is not the owner of club, hence can not generate token');
            return;
        } else if (_clubData.agoraToken) {
            res.status(200).json({
                "token": _clubData.agoraToken
            });
            return;
        }

        // generating new token for this club


        const channelName = clubId; // using clubId as unique channel name
        const uid = 0; //! No authentication using UID to connect to agora 
        const role = RtcRole.PUBLISHER; // this role is required in case of broadcasting 
        const privilegeExpiredTs = 0; // setting it to 0 generate token with expiry of 24 hrs (max expiry time)

        const agoraToken = RtcTokenBuilder.buildTokenWithUid(agoraAppId, agoraPrimaryCertificate, channelName, uid, role, privilegeExpiredTs);

        const _updateDocQuery = {
            TableName: tableName,
            Key: {
                P_K: `CLUB#${clubId}`,
                S_K: `CLUBMETA#${clubId}`,
            },
            UpdateExpression: 'SET agoraToken = :token',
            ExpressionAttributeValues: {
                ':token': agoraToken,
            }
        };

        dynamoClient.update(_updateDocQuery, async (err, data) => {
            if (err) {
                console.log(err);
                res.status(400).json(`Error in updating token in club: ${err}`);
            } else {


                // sending agoraToken to all user subscribed to this club at this moment
                await postClubStartedMessageToWebsocketUsers({
                    clubId: clubId,
                    agoraToken: agoraToken
                });

                return res.status(201).json({
                    "agoraToken": agoraToken,
                });

            }
        });

    } catch (error) {
        console.log(`Some error in /token/create ${error}`);
        return res.status(400).json(`Some error in /token/create ${error}`);
    }
});

module.exports = router;