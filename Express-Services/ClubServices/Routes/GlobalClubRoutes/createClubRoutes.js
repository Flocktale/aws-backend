const router = require('express').Router();
const fs = require("fs");
const {
    nanoid
} = require('nanoid');

const {
    ClubRoomCompleteSchema
} = require('../../Schemas/ClubRoom');
const {
    AudienceSchemaWithDatabaseKeys
} = require('../../Schemas/Audience');
const {
    CountCommentSchema,
    CountReactionSchema,
    CountReportSchema,
    CountParticipantSchema,
    CountAudienceSchema,
    CountJoinRequestSchema
} = require('../../Schemas/AtomicCountSchemas');

const {
    dynamoClient,
    myTable,
    sns
} = require('../../config');

const {
    uploadFile
} = require('../../Functions/clubFunctions');
const Constants = require('../../constants');


//required
// query parameters - "creatorId"
// body: ClubRoomCompleteSchema validated (except clubId, clubAvatar, creator)

router.post('/', async (req, res) => {


    if (!req.body) {
        return res.status(400).json('body is required');
    }

    const creatorId = req.query.creatorId;

    if (!creatorId) {
        res.status(400).json('creator id is required');
        return;
    }

    try {

        const _creatorSummaryQuery = {
            TableName: myTable,
            Key: {
                P_K: `USER#${creatorId}`,
                S_K: `USERMETA#${creatorId}`
            },
            AttributesToGet: ['userId', 'username', 'avatar'],
        };

        const _creatorSummaryDoc = (await dynamoClient.get(_creatorSummaryQuery).promise())['Item'];
        const clubId = nanoid();

        req.body['creator'] = _creatorSummaryDoc;
        req.body['clubId'] = clubId;
        req.body['clubAvatar'] = Constants.ClubAvatarUrl(clubId);
        const newClub = await ClubRoomCompleteSchema.validateAsync({
            ...req.body,

            /// adding creator in list of participants
            participants: dynamoClient.createSet([_creatorSummaryDoc.username]),
        });

        const _createClubQuery = {
            TableName: myTable,
            Item: newClub,
        };

        const _audienceDoc = await AudienceSchemaWithDatabaseKeys.validateAsync({
            clubId: clubId,
            isOwner: true,
            audience: {
                userId: newClub.creator.userId,
                username: newClub.creator.username,
                avatar: newClub.creator.avatar,
            },
            status: Constants.AudienceStatus.Participant,
            timestamp: newClub.scheduleTime,
        });

        const _audienceQuery = {
            TableName: myTable,
            Item: _audienceDoc,
        };


        const _countBaseObject = {
            clubId: clubId
        };

        const countCommentObject = await CountCommentSchema.validateAsync(_countBaseObject);
        const countReactionObject_0 = await CountReactionSchema.validateAsync({
            clubId: clubId,
            indexValue: 0
        });
        const countReactionObject_1 = await CountReactionSchema.validateAsync({
            clubId: clubId,
            indexValue: 1
        });
        const countReactionObject_2 = await CountReactionSchema.validateAsync({
            clubId: clubId,
            indexValue: 2
        });
        const countReportObject = await CountReportSchema.validateAsync(_countBaseObject);
        const countParticipantObject = await CountParticipantSchema.validateAsync(_countBaseObject);
        const countAudienceObject = await CountAudienceSchema.validateAsync(_countBaseObject);
        const countJoinRequestObject = await CountJoinRequestSchema.validateAsync(_countBaseObject);


        // at max 25 operations are allowed in transactWrite (remember that).
        const _transactQuery = {
            TransactItems: [{
                    Put: _createClubQuery
                },
                {
                    Put: _audienceQuery
                },
                {
                    Put: {
                        TableName: myTable,
                        Item: countCommentObject
                    }
                },
                {
                    Put: {
                        TableName: myTable,
                        Item: countReactionObject_0
                    }
                }, {
                    Put: {
                        TableName: myTable,
                        Item: countReactionObject_1
                    }
                }, {
                    Put: {
                        TableName: myTable,
                        Item: countReactionObject_2
                    }
                }, {
                    Put: {
                        TableName: myTable,
                        Item: countReportObject
                    }
                }, {
                    Put: {
                        TableName: myTable,
                        Item: countParticipantObject
                    }
                }, {
                    Put: {
                        TableName: myTable,
                        Item: countAudienceObject
                    }
                }, {
                    Put: {
                        TableName: myTable,
                        Item: countJoinRequestObject
                    }
                },
            ]
        };

        dynamoClient.transactWrite(_transactQuery, async (err, data) => {
            if (err) res.status(404).json('Error creating club');
            else {

                const fileName = clubId;
                const _thumbnail = fs.createReadStream('./static/microphone_thumb.jpg');
                const _default = fs.createReadStream('./static/microphone.jpg');
                const _large = fs.createReadStream('./static/microphone_large.jpg');

                const promises = [
                    uploadFile(Constants.s3ClubAvatarThumbKey(fileName), _thumbnail),
                    uploadFile(Constants.s3ClubAvatarDefaultKey(fileName), _default),
                    uploadFile(Constants.s3ClubAvatarLargeKey(fileName), _large),
                ];

                if (newClub.community) {
                    const _communityDocUpdateQuery = {
                        TableName: myTable,
                        Key: {
                            P_K: `COMMUNITY#${newClub.community.communityId}`,
                            S_K: `COMMUNITYMETA#${newClub.community.communityId}`
                        },
                        UpdateExpression: 'ADD scheduledClubCount :counter',
                        ExpressionAttributeValues: {
                            ':counter': 1,
                        },
                    }

                    promises.push(dynamoClient.update(_communityDocUpdateQuery).promise());


                    // sending notification to all community members via community topic

                    const snsPushNotificationObj = {
                        GCM: JSON.stringify({
                            notification: {
                                title: `${newClub.clubName} by ${newClub.creator.username} in ${newClub.community.name}, join ${getTimeTitle(newClub.scheduleTime)}`,
                                image: newClub.avatar + '_large',
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
                        TopicArn: Constants.snsTopicArn(newClub.community.communityId),
                    }).promise());
                }


                try {
                    await Promise.all(promises);
                } catch (error) {
                    console.log(`Error in resolving promises`, error);
                }

                res.status(201).json({
                    clubId: clubId
                });
            }
        });

    } catch (error) {
        res.status(400).json(error);
    }
});

function getTimeTitle(scheduleTime) {
    const now = new Date();
    const scheduled = new Date(scheduleTime);

    const diffHours = (scheduled - now) / (1000 * 60 * 60);

    if (diffHours <= 48 && (scheduled.getDate() - now.getDate()) <= 1) {
        var title = `at ${scheduled.getHours()}.${scheduled.getMinutes()} `;
        if (scheduled.getDate() - now.getDate() == 1) {
            return title + 'tomorrow';
        } else return title + 'today';
    } else {
        const month = scheduled.toLocaleString('default', {
            month: 'long'
        })
        var title = `on ${month} ${scheduled.getDate()} at ${scheduled.getHours()}.${scheduled.getMinutes()} `;
        return title;
    }

}

module.exports = router;