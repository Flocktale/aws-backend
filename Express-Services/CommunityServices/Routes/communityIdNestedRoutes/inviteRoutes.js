const {
    NotificationSchemaWithDatabaseKeys
} = require('../../Schemas/notificationSchema');

const {
    myTable,
    dynamoClient,
    sns
} = require('../../config');
const Constants = require('../../constants');
const {
    pushToPostNotificationQueue
} = require('../../Functions/sqsFunctions');
const {
    CommunityHostSchemaWithDatabaseKeys
} = require('../../Schemas/communityUserSchema');

const router = require('express').Router();

// query parameters - 
//              memberId (required)
router.post('/', async (req, res) => {
    const communityId = req.communityId;
    const memberId = req.query.memberId;

    if (!memberId) {
        return res.status(400).json('memberId is required in query parameters');
    }

    const _memberKey = {
        P_K: `COMMUNITY#MEMBER#${communityId}`,
        S_K: `COMMUNITY#USER#${memberId}`,
    };

    const _memberUpdateQuery = {
        TableName: myTable,
        Key: _memberKey,
        UpdateExpression: 'SET invited = :inv',
        ExpressionAttributeValues: {
            ':inv': true,
        },
        ReturnValues: 'ALL_NEW'
    };
    const communityData = (await dynamoClient.update(_memberUpdateQuery).promise())['Attributes']['community'];

    const notifData = await NotificationSchemaWithDatabaseKeys.validateAsync({
        userId: memberId,
        data: {
            type: 'COMMUNITY#INV#host',
            title: 'Invitation: Become a host on ' + communityData.name + '.',
            avatar: communityData.avatar,
            timestamp: Date.now(),
            targetResourceId: communityId,
        }
    });

    await pushToPostNotificationQueue({
        action: Constants.PostNotificationQueueAction.sendAndSave,
        userId: memberId,
        notifData: notifData,
    });

    return res.status(200).json('successful');

});


// query parameters - 
//              memberId (required)
//              response - "accept" or "cancel" (required)
router.post('/response', async (req, res) => {
    const communityId = req.communityId;
    const memberId = req.query.memberId;

    const response = req.query.response;

    if (!memberId || !response) {
        return res.status(400).json('memberId and response both are required in query parameters');
    }

    if (response !== 'accept' && response !== 'cancel') {
        return res.status(400).json('invalid response');
    }

    const _memberKey = {
        P_K: `COMMUNITY#MEMBER#${communityId}`,
        S_K: `COMMUNITY#USER#${memberId}`,
    };

    if (response === 'accept') {

        const _memberDeleteQuery = {
            TableName: myTable,
            Key: _memberKey,
            Expected: {
                invited: {
                    Value: true
                }
            },
            ReturnValues: 'ALL_OLD',
        };

        let data;

        try {
            data = (await dynamoClient.delete(_memberDeleteQuery).promise())['Attributes'];
        } catch (error) {
            return res.status(400).json('NOT_INVITED');
        }

        const newHost = await CommunityHostSchemaWithDatabaseKeys.validateAsync({
            community: data.community,
            user: data.user,
            subscriptionArn: data.subscriptionArn,
        });

        const newHostPutQuery = {
            TableName: myTable,
            Item: newHost,
        };

        const _communityDocUpdateQuery = {
            TableName: myTable,
            Key: {
                P_K: `COMMUNITY#${communityId}`,
                S_K: `COMMUNITYMETA#${communityId}`
            },
            UpdateExpression: 'ADD hosts :host, memberCount :counter',
            ExpressionAttributeValues: {
                ':host': data.user.avatar,
                ':counter': -1,
            },
        }

        const _transactQuery = {
            TransactItems: [{
                Put: newHostPutQuery
            }, {
                Update: _communityDocUpdateQuery
            }],
        };


        await dynamoClient.transactWrite(_transactQuery).promise();

        // publishing notification to community topic

        const snsPushNotificationObj = {
            GCM: JSON.stringify({
                notification: {
                    title: `Welcome ${data.user.username} as new host on ${data.community.name}`,
                    image: data.community.avatar + '_large',
                    sound: "default",
                    color: '#fff74040',
                    click_action: 'FLUTTER_NOTIFICATION_CLICK',
                    icon: 'ic_notification',
                },
                priority: 'HIGH',

            }),
        };

        await sns.publish({
            Message: JSON.stringify(snsPushNotificationObj),
            MessageStructure: 'json',
            TopicArn: Constants.snsTopicArn(communityId),
        }).promise();

        return res.status(200).json({
            community: data.community,
            user: data.user,
            type: newHost.type,
        });

    } else if (response === 'cancel') {

        const _memberUpdateQuery = {
            TableName: myTable,
            Key: _memberKey,
            UpdateExpression: 'REMOVE invited'
        };
        try {
            await dynamoClient.update(_memberUpdateQuery).promise();
        } catch (error) {
            console.log('error in cancelling invitation to become host for community');
        }

        return res.status(200).json('successful');
    }


});


module.exports = router;