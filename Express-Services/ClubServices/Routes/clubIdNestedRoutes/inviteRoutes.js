const router = require('express').Router();

const Joi = require('joi');

const {
    dynamoClient,
    tableName,
} = require('../../config');

const {
    NotificationSchemaWithDatabaseKeys
} = require('../../Schemas/notificationSchema');

const {
    AudienceSchemaWithDatabaseKeys
} = require('../../Schemas/Audience');

const {
    publishNotification
} = require('./notificationFunctions');


//required
// query parameters - "sponsorId" (the one who is sending invitation, it should be of owner in case of participant type of invitation)
// body - {"invitee" (list of invited user's id), "type" (acceptable values -> 'audience' , 'participant' , by default set to 'audience') }
router.post('/', async (req, res) => {
    const clubId = req.clubId;
    const sponsorId = req.query.sponsorId;
    if (!sponsorId) {
        return res.status(400).json('sponsorId is required');
    }

    var invitation;

    try {
        const schema = Joi.object({
            invitee: Joi.array().items(Joi.string()).min(1).required(),
            type: Joi.string().valid('audience', 'participant').default('audience'),
        });
        invitation = await schema.validateAsync(req.body);
    } catch (error) {
        return res.status(400).json(error);
    }


    const _clubDocQuery = {
        TableName: tableName,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `CLUBMETA#${clubId}`,
        },
        AttributesToGet: ['creator', 'scheduleTime', 'clubName', 'category'],
    };


    const clubData = (await dynamoClient.get(_clubDocQuery).promise())['Item'];

    var notificationObj = {
        userId: 'undefined', // iterate over to every user in invitee
        data: {
            type: "CLUB#INV#adc", // by default
            title: "undefined",
            avatar: `https://mootclub-public.s3.amazonaws.com/userAvatar/${sponsorId}`,
            timestamp: Date.now(),

            targetResourceId: clubId,

            secondaryAvatar: `https://mootclub-public.s3.amazonaws.com/clubAvatar/${clubId}`,

            extraData: {
                scheduleTime: clubData.scheduleTime,
                category: clubData.category
            },

        },
    };

    if (sponsorId === clubData.creator.userId) {

        if (invitation.type === 'participant') {
            notificationObj['data']['title'] = clubData.creator.username + ' would like you to be a Panelist on ' + clubData.clubName;
            notificationObj['data']['type'] = 'CLUB#INV#prt';
        } else {
            notificationObj['data']['title'] = 'Tune to ' + clubData.clubName + ' and listen to what ' + clubData.creator.username + ' and others have to say';
        }

    } else {
        const _sponsorDocQuery = {
            TableName: tableName,
            Key: {
                P_K: `USER#${sponsorId}`,
                S_K: `USERMETA#${sponsorId}`,
            },
            AttributesToGet: ['username'],
        }

        const _sponsorData = (await dynamoClient.get(_sponsorDocQuery).promise())['Item'];

        notificationObj['data']['title'] = 'Get along with ' + _sponsorData.username + ' on ' + clubData.clubName + ' , their interest might intrigue you too.';
    }

    // asynchronously sending and saving notifications for all invitee.
    for (var userId of invitation.invitee) {
        notificationObj['userId'] = userId;


        if (invitation.type === 'participant') {

            // checking if an audience doc already exists or not for this user.
            const _oldAudienceDocQuery = {
                TableName: tableName,
                Key: {
                    P_K: `CLUB#${clubId}`,
                    S_K: `AUDIENCE#${userId}`,
                },
                AttributesToGet: ['isBlocked', 'isParticipant']
            };

            const oldAudienceDoc = (await dynamoClient.get(_oldAudienceDocQuery).promise())['Item'];

            var _userData;

            if (oldAudienceDoc) {
                if (oldAudienceDoc.isBlocked === true || oldAudienceDoc.isParticipant === true) {
                    console.error('invitation was being intended to be sent to wrong user, audience data for that user, isBlocked: ', oldAudienceDoc.isBlocked, ', isParticipant: ', oldAudienceDoc.isParticipant, '............. this is an example of bad implementation, fix this.');
                    // skip the loop
                    continue;
                }
            } else {
                const _userQuery = {
                    TableName: tableName,
                    Key: {
                        P_K: `USER#${userId}`,
                        S_K: `USERMETA#${userId}`,
                    },
                    AttributesToGet: ['username', 'avatar'],
                }
                _userData = (await dynamoClient.get(_userQuery).promise())['Item'];
            }

            _sendAndSaveNotification(notificationObj, async (notificationId) => {

                if (oldAudienceDoc) {
                    // updating oldAudienceDoc
                    const _audienceUpdateQuery = {
                        TableName: tableName,
                        Key: {
                            P_K: `CLUB#${clubId}`,
                            S_K: `AUDIENCE#${userId}`
                        },
                        UpdateExpression: 'SET invitationId = :invId',
                        ExpressionAttributeValues: {
                            ':invId': notificationId,
                        },
                    }

                    await dynamoClient.update(_audienceUpdateQuery).promise();

                } else {

                    // creating audience doc for this user and storing notificationId for invitation

                    const _audienceDoc = await AudienceSchemaWithDatabaseKeys.validateAsync({
                        clubId: clubId,
                        audience: {
                            userId: userId,
                            username: _userData.username,
                            avatar: _userData.avatar,
                        },
                        invitationId: notificationId,
                    });

                    const _audiencePutQuery = {
                        TableName: tableName,
                        Item: _audienceDoc,
                    };
                    await dynamoClient.put(_audiencePutQuery).promise();
                }

            });
        } else {
            _sendAndSaveNotification(notificationObj);
        }
    }

    return res.status(202).json('Notifications sent to invitee');

});

async function _sendAndSaveNotification(notificationObj, callback) {
    if (!notificationObj) {
        console.log('no notificationObj was passed when _sendAndSaveNotification was called');
        return;
    }

    // first saving the notification in database.

    const notifData = await NotificationSchemaWithDatabaseKeys.validateAsync(notificationObj);

    const _notificationPutQuery = {
        TableName: tableName,
        Item: notifData,
    }

    await dynamoClient.put(_notificationPutQuery).promise();

    if (callback) {
        // sending back notificationId for further use.
        callback(notifData.notificationId);
    }

    await publishNotification({
        userId: notifData.userId,
        notifData: {
            title: notifData.data.title,
            image: notifData.data.secondaryAvatar
        }
    });
}

// to send audience notification to all followers of sponsor
// required
// query parameters - "sponsorId" (the one who is sending invitation)
router.post('/all-followers', async (req, res) => {
    const clubId = req.clubId;
    const sponsorId = req.query.sponsorId;
    if (!sponsorId) {
        return res.status(400).json('sponsorId is required');
    }

    const _clubDocQuery = {
        TableName: tableName,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `CLUBMETA#${clubId}`,
        },
        AttributesToGet: ['creator', 'scheduleTime', 'clubName', 'category'],
    };


    const clubData = (await dynamoClient.get(_clubDocQuery).promise())['Item'];

    var notificationObj = {
        userId: 'undefined', // iterate over to every user in followers
        data: {
            type: "CLUB#INV#adc", // invitation for being audience
            title: "undefined",
            avatar: `https://mootclub-public.s3.amazonaws.com/userAvatar/${sponsorId}`,
            timestamp: Date.now(),

            targetResourceId: clubId,

            secondaryAvatar: `https://mootclub-public.s3.amazonaws.com/clubAvatar/${clubId}`,

            extraData: {
                scheduleTime: clubData.scheduleTime,
                category: clubData.category
            },

        },
    };

    if (sponsorId === clubData.creator.userId) {

        notificationObj['data']['title'] = 'Tune to ' + clubData.clubName + ' and listen to what ' + clubData.creator.username + ' and others have to say';

    } else {
        const _sponsorDocQuery = {
            TableName: tableName,
            Key: {
                P_K: `USER#${sponsorId}`,
                S_K: `USERMETA#${sponsorId}`,
            },
            AttributesToGet: ['username'],
        }

        const _sponsorData = (await dynamoClient.get(_sponsorDocQuery).promise())['Item'];

        notificationObj['data']['title'] = 'Get along with ' + _sponsorData.username + ' on ' + clubData.clubName + ' , their interest might intrigue you too.';
    }

    // get list of all followers

    const _followersQuery = {
        TableName: tableName,

        KeyConditionExpression: 'P_K = :pk and begins_with(S_K,:sk)',
        FilterExpression: "relationIndexObj.B4 = :tr",
        ExpressionAttributeValues: {
            ':pk': `USER#${sponsorId}`,
            ':sk': `RELATION#`,
            ':tr': true,
        },
        ProjectionExpression: 'S_K', // we don't need whole foreign user (foreignUser.userId can't be fetched alone(i guess)), so using S_K (small in size) to retrieve foreign user's id.
    }



    const _followersData = (await dynamoClient.query(_followersQuery).promise())['Items'];


    const _followersIds = _followersData.map(({
        S_K
    }) => {
        return S_K.split("RELATION#")[1];
    });

    for (var userId of _followersIds) {
        notificationObj['userId'] = userId;
        _sendAndSaveNotification(notificationObj); // asynchronously sending and saving notifications for all followers.
    }

    return res.status(202).json('Notifications sent to all followers');

});


module.exports = router;