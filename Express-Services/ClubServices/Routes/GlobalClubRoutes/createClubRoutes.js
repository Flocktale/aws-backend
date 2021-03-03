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
    tableName
} = require('../../config');

const {
    uploadFile
} = require('../../Functions/clubFunctions');


//required
// query parameters - "creatorId"
// body: ClubRoomCompleteSchema validated (except clubId, clubAvatar, creator)

router.post('/', async (req, res) => {

    const creatorId = req.query.creatorId;

    if (!creatorId) {
        res.status(400).json('creator id is required');
        return;
    }

    try {

        const _creatorSummaryQuery = {
            TableName: tableName,
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
        req.body['clubAvatar'] = `https://mootclub-public.s3.amazonaws.com/clubAvatar/${clubId}`;

        const newClub = await ClubRoomCompleteSchema.validateAsync(req.body);

        const _createClubQuery = {
            TableName: tableName,
            Item: newClub,
        };

        const _audienceDoc = await AudienceSchemaWithDatabaseKeys.validateAsync({
            clubId: clubId,
            audience: {
                userId: newClub.creator.userId,
                username: newClub.creator.username,
                avatar: newClub.creator.avatar,
            },

            isParticipant: true,
            timestamp: newClub.scheduleTime,
            AudienceDynamicField: `Participant#${newClub.scheduleTime}#${newClub.creator.userId}`
        });

        const _audienceQuery = {
            TableName: tableName,
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

        const _transactQuery = {
            TransactItems: [{
                    Put: _createClubQuery
                },
                {
                    Put: _audienceQuery
                },
                {
                    Put: {
                        TableName: tableName,
                        Item: countCommentObject
                    }
                },
                {
                    Put: {
                        TableName: tableName,
                        Item: countReactionObject_0
                    }
                }, {
                    Put: {
                        TableName: tableName,
                        Item: countReactionObject_1
                    }
                }, {
                    Put: {
                        TableName: tableName,
                        Item: countReactionObject_2
                    }
                }, {
                    Put: {
                        TableName: tableName,
                        Item: countReportObject
                    }
                }, {
                    Put: {
                        TableName: tableName,
                        Item: countParticipantObject
                    }
                }, {
                    Put: {
                        TableName: tableName,
                        Item: countAudienceObject
                    }
                }, {
                    Put: {
                        TableName: tableName,
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

                const uploadPromises = [
                    uploadFile(`clubAvatar/${fileName}_thumb`, _thumbnail),
                    uploadFile(`clubAvatar/${fileName}`, _default),
                    uploadFile(`clubAvatar/${fileName}_large`, _large),
                ];

                try {
                    await Promise.all(uploadPromises);
                } catch (error) {
                    console.log(`Error occured while trying to upload:`, error);
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

module.exports = router;