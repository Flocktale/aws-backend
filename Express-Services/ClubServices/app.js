/* 
? Methods to implement =>
! All Clubs List 
# Create Club
# Upload Club Image
# Get all my organized clubs 
# Get my club history timeline (attended, participated as well as organised (owned) )  
! Update Club on owner request 
# Fetch a single club with all details (with clubId and creatorId)
# Search club by clubName
# Enter a club
# React on club
# Get reactions     (List with userId, username, avatar and indexValue) 
! Comment on club
! Get comments
# Report club
# Get reports
# Request to join club 
# Get join requests for club
# Cancellation of join request by requester 
# Response to join-request
# Get Active Participant for club  (List with username, avatar and timestamp)
# Kick out a participant
# Get list of kicked out people by club
# Un-Kick a user from club
*/


const express = require('express');
const fs = require("fs");
const multer = require('multer');
const cors = require('cors');


const { ClubRoomCompleteSchema } = require('./Schemas/ClubRoom');
const { AudienceSchemaWithDatabaseKeys, AudienceSchema } = require('./Schemas/Audience');
const { ReactionSchema, ReactionSchemaWithDatabaseKeys } = require('./Schemas/Reaction');
const { ReportSchemaWithDatabaseKeys } = require('./Schemas/Report');
const { CountCommentSchema, CountReactionSchema, CountReportSchema,
    CountParticipantSchema, CountAudienceSchema, CountJoinRequestSchema
} = require('./Schemas/AtomicCountSchemas');



const AWS = require('aws-sdk');
const Joi = require('joi');
const { nanoid } = require('nanoid');


const app = express();


app.use(cors());
app.use(express.json());

AWS.config.update({
    region: "us-east-1",
    // endpoint: "http://localhost:3000"        //this endpoint is used in case of local dynamodb on pc.
    // endpoint: "http://dynamodb.us-east-1.amazonaws.com"  // by default it is set according to region
});

const dynamoClient = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

const imageUploadConstParams = {
    ACL: 'public-read',
    Bucket: 'mootclub-public',
    // Body:            populate it 
    // Key:             populate it
};

const tableName = "MyTable";
const allClubsOfAudienceIndex = "AllClubsOfAudienceIndex";
const audienceDynamicDataIndex = "AudienceDynamicDataIndex";
const searchByUsernameIndex = "SearchByUsernameIndex";

app.get("/clubs", (req, res) => {
    // TODO: send list of clubs
    res.json('You have hit a TODO: Send list of clubs )');
});

app.post('/clubs/create', async (req, res) => {

    try {
        const clubId = nanoid();
        req.body['clubId'] = clubId;
        req.body['clubAvatar'] = `https://mootclub-public.s3.amazonaws.com/clubAvatar/${clubId}`;
        const newClub = await ClubRoomCompleteSchema.validateAsync(req.body);

        const _createClubQuery = {
            TableName: tableName,
            Item: newClub,
        };

        const _audienceDoc = await AudienceSchemaWithDatabaseKeys.validateAsync({
            clubId: clubId,
            creatorId: newClub.creatorId,
            audienceId: newClub.creatorId,
            isOwner: true,
            isPartcipant: true,
            avatar: newClub.creatorAvatar,
            username: newClub.creatorUsername,
            timestamp: newClub.scheduleTime,
            AudienceDynamicField: `Participant#${newClub.scheduleTime}#${newClub.creatorId}`
        });

        const _audienceQuery = {
            TableName: tableName,
            Item: _audienceDoc,
        };


        const _countBaseObject = { clubId: clubId };

        const countCommentObject = await CountCommentSchema.validateAsync(_countBaseObject);
        const countReactionObject_0 = await CountReactionSchema({ clubId: clubId, indexValue: 0 });
        const countReactionObject_1 = await CountReactionSchema({ clubId: clubId, indexValue: 1 });
        const countReactionObject_2 = await CountReactionSchema({ clubId: clubId, indexValue: 2 });
        const countReportObject = await CountReportSchema(_countBaseObject);
        const countParticipantObject = await CountParticipantSchema(_countBaseObject);
        const countAudienceObject = await CountAudienceSchema(_countBaseObject);
        const countJoinRequestObject = await CountJoinRequestSchema(_countBaseObject);

        const _transactQuery = {
            TransactItems: [
                {
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

        dynamoClient.transactWrite(_transactQuery, (err, data) => {
            if (err) res.status(304).json('Error creating club');
            else {

                const fileName = clubId;
                var params = {
                    ...imageUploadConstParams,
                    Body: fs.createReadStream('./static/microphone.jpg'),
                    Key: `clubAvatar/${fileName}`
                };

                s3.upload(params, (err, data) => {
                    if (err) {
                        console.log(`Error occured while trying to upload: ${err}`);
                        return;
                    }
                    else if (data) {
                        console.log('Default Club Image uploaded successfully!');
                    }
                });

                res.status(201).json(data)

            };
        });

    } catch (error) {
        res.status(400).json(error);
    }

});

app.post("/clubs/:clubId/avatar", multer().single('avatar'), (req, res) => {
    const clubId = req.params.clubId;

    if (!req.file) {
        res.status(400).send('Invalid request. File not found');
        return;
    }

    // TODO: process this file, may include - check for broken/corrupt file, valid image extension, cropping or resizing etc.
    const fileName = clubId;

    var params = {
        ...imageUploadConstParams,
        Body: req.file.buffer,
        Key: `clubAvatar/${fileName}`
    };

    s3.upload(params, (err, data) => {
        if (err) {
            res.json(`Error occured while trying to upload: ${err}`);
            return;
        }
        else if (data) {
            res.status(201).json('Image uploaded successfully');
        }
    });
});

app.get('/myclubs/:userId/organized', (req, res) => {

    const userId = req.params.userId;
    const query = {
        TableName: tableName,
        KeyConditionExpression: 'P_K = :hkey and begins_with ( S_K , :skey )',
        ExpressionAttributeValues: {
            ":hkey": `USER#${userId}`,
            ":skey": 'CLUB#'
        },
        AttributesToGet: [
            'clubId', 'clubName', 'creatorId', 'creatorUsername', 'category', 'scheduleTime',
            'creatorAvatar', 'clubAvatar', 'tags', 'duration'
        ],
        Limit: 10,
        ScanIndexForward: false,
        ReturnConsumedCapacity: "INDEXES"
    };

    if (req.headers.lastevaluatedkey) {
        query['ExclusiveStartKey'] = JSON.parse(req.headers.lastevaluatedkey);
    }

    dynamoClient.query(query, (err, data) => {
        if (err) res.status(404).json(err);
        else res.status(200).json(data);
    });
});


app.get('/myclubs/:userId/history', (req, res) => {
    const userId = req.params.userId;
    const query = {
        TableName: tableName,
        IndexName: allClubsOfAudienceIndex,
        KeyConditionExpression: 'audienceId = :hkey',
        ExpressionAttributeValues: {
            ":hkey": userId,
        },
        AttributesToGet: ['clubId', 'creatorId'],
        Limit: 10,
        ScanIndexForward: false,
        ReturnConsumedCapacity: "INDEXES"
    };

    if (req.headers.lastevaluatedkey) {
        query['ExclusiveStartKey'] = JSON.parse(req.headers.lastevaluatedkey);
    }

    dynamoClient.query(query, (err, data) => {
        if (err) res.status(404).json(`Error getting club history for user at #primary level: ${err}`);
        else {
            // Fetching required details of all these clubs

            console.log('fetched clubs with only clubName for history timeline', data);

            const _transactItems = [];

            data['Items'].forEach((element) => {
                _transactItems.push({
                    Get: {
                        TableName: tableName,
                        Key: {
                            P_K: `USER#${element.creatorId}`,
                            S_K: `CLUB#${element.clubId}`
                        },
                        AttributesToGet: [
                            'clubId', 'clubName', 'creatorId', 'creatorUsername', 'category', 'scheduleTime',
                            'creatorAvatar', 'clubAvatar', 'tags', 'duration'
                        ]
                    }
                });
            });

            const _transactQuery = { TransactItems: _transactItems };

            dynamoClient.transactGet(_transactQuery, (err, data) => {
                if (err) res.status(404).json(`Error getting club history for user: ${err}`);
                else res.status(201).json(data);
            });
        }
    });

});

//! req.headers - {creatorId}
app.get('/clubs/:clubId', async (req, res) => {

    const clubId = req.params.clubId;
    const creatorId = req.headers.creatorId;
    if (!creatorId) {
        res.status(400).json('creatorId is required in headers');
        return;
    }

    const _getQuery = {
        TableName: tableName,
        Key: {
            P_K: `USER#${creatorId}`,
            S_K: `CLUB#${clubId}`
        }
    };

    dynamoClient.get(_getQuery, (err, data) => {
        if (err) res.status(404).json(err);
        else res.status(200).json(data);
    });

});


app.get('/clubs/query', async (req, res) => {

    const searchString = req.body;
    try {
        const _schema = Joi.string().min(3).max(25).required();
        await _schema.validateAsync(searchString);
    } catch (error) {
        res.status(400).json(error);
        return;
    }

    const _query = {
        TableName: tableName,
        IndexName: searchByUsernameIndex,
        KeyConditionExpression: 'PublicSearch = :hkey and begins_with ( FilterDataName , :filter )',
        ExpressionAttributeValues: {
            ":hkey": 1,
            ":filter": `CLUB#${searchString}`,
        },
        AttributesToGet: [
            'clubId', 'clubName', 'creatorId', 'creatorUsername', 'category', 'scheduleTime',
            'creatorAvatar', 'clubAvatar', 'tags', 'duration'
        ],
        Limit: 10,
        ReturnConsumedCapacity: "INDEXES"
    };

    if (req.headers.lastevaluatedkey) {
        query['ExclusiveStartKey'] = JSON.parse(req.headers.lastevaluatedkey);
    }
    dynamoClient.query(query, (err, data) => {
        if (err) res.status(404).json(err);
        else res.status(200).json(data);
    });


});


app.post('/clubs/:clubId/enter', async (req, res) => {

    const clubId = req.params.clubId;
    const audienceId = req.body['audienceId'];

    var _transactQuery;
    var result;
    try {

        result = await AudienceSchemaWithDatabaseKeys.validateAsync(req.body);

        const _audienceDocQuery = {
            TableName: tableName,
            Item: result,
        };

        const _audienceCountUpdateQuery = {
            TableName: tableName,
            Key: {
                P_K: `CLUB#${clubId}`,
                S_K: 'CountAudience#'
            },
            UpdateExpression: 'set count = count + :counter',
            ExpressionAttributeValues: {
                ':counter': 1,
            }
        };

        _transactQuery = {
            TransactItems: [
                { Put: _audienceDocQuery },
                { Update: _audienceCountUpdateQuery }
            ]
        };

    } catch (error) {
        res.status(400).json(error);
        return;
    }

    try {
        // checking if user already exists as audience
        const _crossQuery = {
            TableName: tableName,
            IndexName: allClubsOfAudienceIndex,
            KeyConditionExpression: 'audienceId = :hkey',
            FilterExpression: 'clubId = :queryKey',    //! this is RCU intensive query, it scans all the clubs attended by audience and match for clubId condition against them.
            ExpressionAttributeValues: {
                ":hkey": audienceId,
                ":queryKey": clubId,
            },
            Limit: 1,
            ScanIndexForward: false,
            ReturnConsumedCapacity: "INDEXES"
        };

        const crossResult = await dynamoClient.query(_crossQuery).promise();

        if (crossResult && crossResult['Items'].length === 1) {
            try {
                const responseResult = await AudienceSchema.validateAsync(crossResult['Items'][0]);
                res.status(204).json(responseResult);
            } catch (error) {
                res.status(204).json(`User already have a entry but AudienceSchema has error: ${error}`);
            }
            return;
        } else {
            dynamoClient.transactWrite(_transactQuery, async (err, data) => {
                if (err) res.status(304).json('Error marking entry of user');
                else {
                    try {
                        const responseResult = await AudienceSchema.validateAsync(result);
                        res.status(204).json(responseResult);
                    } catch (error) {
                        res.status(204).json(`User entry created but AudienceSchema has error: ${error}`);
                    }
                    return;
                }
            });

        }

    } catch (error) {
        dynamoClient.transactWrite(_transactQuery, async (err, data) => {
            if (err) res.status(304).json('Error marking entry of user');
            else {
                try {
                    const responseResult = await AudienceSchema.validateAsync(result);
                    res.status(204).json(responseResult);
                } catch (error) {
                    res.status(204).json(`User entry created but AudienceSchema has error:  ${error}`);
                }
                return;
            }
        });
    }

});


//! headers - {previousindexvalue , currentindexvalue} , req.body => {userId,username,avatar}
app.post('/clubs/:clubId/reactions', async (req, res) => {

    const clubId = req.params.clubId;

    try {
        const _temp = req.body;
        _temp['indexValue'] = 0;        // necessary to validate schema
        _temp['clubId'] = clubId;
        await ReactionSchema.validateAsync(_temp); // if successfull then req.body contains {userId,username,avatar}
    } catch (error) {
        res.status(400).json(`invalid body: ${error}`);
        return;
    }

    const userId = req.body.userId;
    const username = req.body.username;
    const avatar = req.body.avatar;

    const previousIndexValue = req.headers.previousindexvalue;
    const currentIndexValue = req.headers.currentindexvalue;

    const _transactQuery = { TransactItems: [] };

    const _reactionCounterQuery = {         //by default => increment (Key required)
        TableName: tableName,
        UpdateExpression: 'set count = count + :counter',
        ExpressionAttributeValues: {
            ':counter': 1,
        }
    };

    if (currentIndexValue)                 // if a user select new reaction on club  
    {
        console.log('new reaction of user on club id:' + clubId + '     reaction: ' + currentIndexValue);
        var reactionDoc;
        try {
            reactionDoc = await ReactionSchemaWithDatabaseKeys.validateAsync({
                clubId: clubId,
                userId: userId,
                username: username,
                avatar: avatar,
                indexValue: currentIndexValue
            });
        } catch (error) {
            res.status(400).json(error);
            return;
        }
        const _reactionDocQuery = {
            TableName: tableName,
            Item: reactionDoc
        };
        _transactQuery['TransactItems'].push({ Put: _reactionDocQuery });   // created reaction document of user
        const _incrementCounter = _reactionCounterQuery;

        _incrementCounter['Key'] = {        // by default set to increment the counter
            P_K: `CLUB#${clubId}`,
            S_K: `CountReaction#${reactionDoc.indexValue}`
        };

        _transactQuery['TransactItems'].push({ Update: _incrementCounter });    // incremented counter 


    } else {       // if a user only un-react on club (i.e. remove reaction)
        // then delete the reaction document, decrement counter will be handled by previousIndexValue 

        const _removeReactionQuery = {
            TableName: tableName,
            Key: {
                P_K: `CLUB#${clubId}`,
                S_K: `REACT#${userId}`
            }
        };
        _transactQuery['TransactItems'].push({ Delete: _removeReactionQuery });
    }


    if (previousIndexValue) {
        const _decrementCounter = _reactionCounterQuery;
        _decrementCounter['Key'] = {
            P_K: `CLUB#${clubId}`,
            S_K: `CountReaction#${previousIndexValue}`
        };
        _decrementCounter['UpdateExpression'] = 'set count = count - :counter'; //  set to decrement the counter

        _transactQuery['TransactItems'].push({ Update: _decrementCounter });    // decremented counter 
    }

    dynamoClient.transactWrite(_transactQuery, (err, data) => {
        if (err) res.status(304).json(`Error modifying reaction: ${err}`);
        else res.status(201).json(data);
    });
});

app.get('/clubs/:clubId/reactions', async (req, res) => {

    const clubId = req.params.clubId;

    const query = {
        TableName: tableName,
        Limit: 50,
        KeyConditionExpression: 'P_K = :hkey and begins_with ( S_K , :filter )',
        ExpressionAttributeValues: {
            ":hkey": `CLUB#${clubId}`,
            ":filter": `REACT#`
        },
        AttributesToGet: [
            'userId', 'username', 'avatar', 'indexValue'
        ],
        ScanIndexForward: false,
    };

    if (req.headers.lastevaluatedkey) {
        query['ExclusiveStartKey'] = JSON.parse(req.headers.lastevaluatedkey);
    }

    dynamoClient.query(query, (err, data) => {
        if (err) res.status(404).json(err);
        else res.status(200).json(data);
    });

});



app.post('/clubs/:clubId/reports', async (req, res) => {

    const clubId = req.params.clubId;

    try {
        const body = req.body;
        body['reportId'] = nanoid();
        const result = await ReportSchemaWithDatabaseKeys.validateAsync(body);

        const _putQuery = {
            TableName: tableName,
            Item: result
        };
        const counterDoc = await CountReportSchema.validateAsync({ clubId: clubId });
        const _counterUpdateQuery = {
            TableName: tableName,
            Key: {
                P_K: counterDoc.P_K,
                S_K: counterDoc.S_K
            },
            UpdateExpression: 'set count = count + :counter',
            ExpressionAttributeValues: {
                ':counter': 1,
            }
        }

        const _transactQuery = {
            TransactItems: [
                { Put: _putQuery },
                { Update: _counterUpdateQuery }
            ]
        };

        dynamoClient.transactWrite(_transactQuery, (err, data) => {
            if (err) res.status(304).json(`Error reporting club: ${err}`);
            else res.status(201).json(data);
        });

    } catch (error) {
        res.status(400).json(error);
        return;
    }

});



app.get('/clubs/:clubId/reports', async (req, res) => {

    const clubId = req.params.clubId;

    const query = {
        TableName: tableName,
        Limit: 20,
        KeyConditionExpression: 'P_K = :hkey and begins_with ( S_K , :filter )',
        ExpressionAttributeValues: {
            ":hkey": `CLUB#${clubId}`,
            ":filter": `REPORT#`
        },
        AttributesToGet: [
            'userId', 'username', 'avatar', 'body', 'timestamp'
        ],
        ScanIndexForward: false,
        ReturnConsumedCapacity: "INDEXES"
    };

    if (req.headers.lastevaluatedkey) {
        query['ExclusiveStartKey'] = JSON.parse(req.headers.lastevaluatedkey);
    }

    dynamoClient.query(query, (err, data) => {
        if (err) res.status(404).json(err);
        else res.status(200).json(data);
    });

});

// ! req.body is AudienceSchema (without DatabaseKeys)
app.post('/clubs/:clubId/join-request', async (req, res) => {
    // There is no seperate schema for join requests, instead we change AudienceDynamicField
    const clubId = req.params.clubId;

    if (!req.body.timestamp) {
        res.status(400).json(`Timestamp should exist in body: ${error}`);
        return;
    }

    try {
        const body = await AudienceSchema.validateAsync(req.body);


        // We don't let kicked out people request to join club
        if (body.isKickedOut === true) {
            // forbidden (403)
            res.status(403).json('User is kicked out by owner, can not request to join!');
            return;
        } else if (body.isPartcipant === true) {
            //  not acceptable (406) since user is already a partcipant.
            res.status(406).json('User is already a participant');
            return;
        } else if (body.joinRequested === true) {
            //  not acceptable (406) since user already have an active join request.
            res.status(406).json('Join request is already pending!');
            return;
        }

        // Now, this is the fresh request!!!
        const newTimestamp = Date.now();

        body['joinRequested'] = true;
        body['AudienceDynamicField'] = `ActiveJoinRequest#${newTimestamp}#${result.audienceId}`;

        const result = await AudienceSchemaWithDatabaseKeys.validateAsync(body);

        const _audienceUpdateQuery = {
            TableName: tableName,
            Key: {
                P_K: result.P_K,
                S_K: result.S_K
            },
            UpdateExpression: 'set joinRequested = :request, AudienceDynamicField = :dynamicField, joinRequestAttempts = joinRequestAttempts + :counter',
            ExpressionAttributeValues: {
                ':request': true,
                ':dynamicField': result.AudienceDynamicField,
                ':counter': 1,

            }
        };

        const counterDoc = await CountJoinRequestSchema.validateAsync({ clubId: clubId });

        const _counterUpdateQuery = {
            TableName: tableName,
            Key: {
                P_K: counterDoc.P_K,
                S_K: counterDoc.S_K
            },
            UpdateExpression: 'set count = count + :counter',
            ExpressionAttributeValues: {
                ':counter': 1,
            }
        }

        const _transactQuery = {
            TransactItems: [
                { Update: _audienceUpdateQuery },
                { Update: _counterUpdateQuery }
            ]
        };

        dynamoClient.transactWrite(_transactQuery, (err, data) => {
            if (err) res.status(304).json(`Error in join request to club: ${err}`);
            else res.status(201).json(data);
        });


    } catch (error) {
        res.status(400).json(error);
        return;
    }
});



app.get('/clubs/:clubId/join-request', async (req, res) => {

    const clubId = req.params.clubId;

    const query = {
        TableName: tableName,
        IndexName: audienceDynamicDataIndex,
        Limit: 30,
        KeyConditionExpression: 'P_K = :hkey and begins_with ( AudienceDynamicField , :filter )',
        ExpressionAttributeValues: {
            ":hkey": `CLUB#${clubId}`,
            ":filter": `ActiveJoinRequest#`
        },
        AttributesToGet: [
            'audienceId', 'joinRequestAttempts', 'avatar', 'username', 'AudienceDynamicField'
        ],
        ScanIndexForward: false,
        ReturnConsumedCapacity: "INDEXES"
    };

    if (req.headers.lastevaluatedkey) {
        query['ExclusiveStartKey'] = JSON.parse(req.headers.lastevaluatedkey);
    }

    dynamoClient.query(query, (err, data) => {
        if (err) res.status(404).json(err);
        else res.status(200).json(data);
    });

});


// ! headers - {audienceid, timestamp of audience}
app.delete('/clubs/:clubId/join-request', async (req, res) => {
    // we don't decrement counter for join requests because it does not account for unique requests.

    const clubId = req.params.clubId;

    const audienceId = req.headers.audienceid;
    const timestamp = req.headers.timestamp;

    if ((!timestamp) || (!audienceId)) {
        res.status(400).json('timestamp should exist in headers and should be equal to entry time of user in club, audienceid should also exist');
        return;
    }

    const _attributeUpdates = {
        joinRequested: { "Action": "PUT", "Value": false },
        AudienceDynamicField: { "Action": "DELETE" },
    };


    const _audienceUpdateQuery = {
        TableName: tableName,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `AUDIENCE#${timestamp}#${audienceId}`
        },
        AttributeUpdates: _attributeUpdates,
    };

    dynamoClient.update(_audienceUpdateQuery, (err, data) => {
        if (err) res.status(304).json(`Error in deleting join request: ${err}`);
        else res.status(202).json(data);
    });

});


// ! if resp === 'accept'  then req.body should be a AudienceSchema with timestamp
// ! if resp === 'cancel'  then req.headers - {audienceid, timestamp of audience}

app.post('/clubs/:clubId/join-request/:resp', async (req, res) => {

    const clubId = req.params.clubId;
    const requestAction = req.params.resp;

    try {
        const _schema = Joi.string().valid('accept', 'cancel').required();
        await _schema.validateAsync(requestAction);
    } catch (error) {
        res.status(400).json('invalid response , valid => accept or cancel');
        return;
    }

    if (requestAction === 'accept') {

        if (!req.body.timestamp) {
            res.status(400).json('timestamp should exist in body when accepting the join request');
            return;
        }
        var result;
        try {
            result = await AudienceSchemaWithDatabaseKeys.validateAsync(req.body);
        } catch (error) {
            res.status(400).json(`Invalid body: ${error}`);
            return;
        }
        const newTimestamp = Date.now();

        const _attributeUpdates = {
            joinRequested: { "Action": "PUT", "Value": false },
            AudienceDynamicField: { "Action": "PUT", "Value": `Participant#${newTimestamp}#${result.audienceId}` },
            isPartcipant: { "Action": "PUT", "Value": true }
        };
        const _audienceUpdateQuery = {
            TableName: tableName,
            Key: {
                P_K: result.P_K,
                S_K: result.S_K
            },
            AttributeUpdates: _attributeUpdates,
        };


        const counterDoc = await CountParticipantSchema.validateAsync({ clubId: clubId });

        const _counterUpdateQuery = {
            TableName: tableName,
            Key: {
                P_K: counterDoc.P_K,
                S_K: counterDoc.S_K
            },
            UpdateExpression: 'set count = count + :counter',       //incrementing
            ExpressionAttributeValues: {
                ':counter': 1,
            }
        }


        const _transactQuery = {
            TransactItems: [
                { Update: _audienceUpdateQuery },
                { Update: _counterUpdateQuery }
            ]
        };

        dynamoClient.transactWrite(_transactQuery, (err, data) => {
            if (err) res.status(304).json(`Error accepting join request: ${err}`);
            else res.status(201).json(data);
            return;
        });


    } else if (requestAction === 'cancel') {


        const audienceId = req.headers.audienceid;
        const timestamp = req.headers.timestamp;

        if ((!timestamp) || (!audienceId)) {
            res.status(400).json('timestamp should exist in headers and should be equal to entry time of user in club, audienceid should also exist');
            return;
        }


        const _attributeUpdates = {
            joinRequested: { "Action": "PUT", "Value": false },
            AudienceDynamicField: { "Action": "DELETE" },
        };


        const _audienceUpdateQuery = {
            TableName: tableName,
            Key: {
                P_K: `CLUB#${clubId}`,
                S_K: `AUDIENCE#${timestamp}#${audienceId}`
            },
            AttributeUpdates: _attributeUpdates,
        };

        dynamoClient.update(_audienceUpdateQuery, (err, data) => {
            if (err) res.status(304).json(`Error in cancelling join request: ${err}`);
            else res.status(202).json(data);
        });

    } else {
        res.status(501).json('request has hit a dead end');
        return;
    }

});

app.get('/clubs/:clubId/participants', async (req, res) => {
    const clubId = req.params.clubId;

    const query = {
        TableName: tableName,
        IndexName: audienceDynamicDataIndex,
        KeyConditionExpression: 'P_K = :hkey and begins_with ( AudienceDynamicField , :filter )',
        ExpressionAttributeValues: {
            ":hkey": `CLUB#${clubId}`,
            ":filter": `Participant#`
        },
        AttributesToGet: [
            'audienceId', 'isOwner', 'avatar', 'username', 'AudienceDynamicField'
        ],
        ScanIndexForward: false,
        ReturnConsumedCapacity: "INDEXES"
    };

    dynamoClient.query(query, (err, data) => {
        if (err) res.status(404).json(err);
        else res.status(200).json(data);
    });

});


// ! req.headers - {audienceid, timestamp of audience}
app.post('/clubs/:clubId/kick', async (req, res) => {
    const clubId = req.params.clubId;

    const audienceId = req.headers.audienceid;
    const timestamp = req.headers.timestamp;

    if ((!timestamp) || (!audienceId)) {
        res.status(400).json('timestamp should exist in headers and should be equal to entry time of user in club, audienceid should also exist');
        return;
    }

    const newTimestamp = Date.now();

    const _attributeUpdates = {
        isPartcipant: { "Action": "PUT", "Value": false },
        isKickedOut: { "Action": "PUT", "Value": true },
        AudienceDynamicField: { "Action": "PUT", "Value": `KickedOut#${newTimestamp}#${audienceId}` },
    };

    const _audienceKickedQuery = {
        TableName: tableName,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `AUDIENCE#${timestamp}#${audienceId}`
        },
        AttributeUpdates: _attributeUpdates,
    }

    var counterDoc;
    try {
        counterDoc = await CountParticipantSchema.validateAsync({ clubId: clubId });
    } catch (error) {
        res.status(400).json(`error in  validation of CountParticipantSchema: ${error}`);
    }

    const _counterUpdateQuery = {
        TableName: tableName,
        Key: {
            P_K: counterDoc.P_K,
            S_K: counterDoc.S_K
        },
        UpdateExpression: 'set count = count - :counter',       // decrementing
        ExpressionAttributeValues: {
            ':counter': 1,
        }
    }


    const _transactQuery = {
        TransactItems: [
            { Update: _audienceKickedQuery },
            { Update: _counterUpdateQuery }
        ]
    };

    dynamoClient.transactWrite(_transactQuery, (err, data) => {
        if (err) res.status(304).json(`Error kicking out participant: ${err}`);
        else res.status(201).json(data);
        return;
    });
});

app.get('/clubs/:clubId/kick', async (req, res) => {

    const clubId = req.params.clubId;

    const query = {
        TableName: tableName,
        IndexName: audienceDynamicDataIndex,
        Limit: 30,
        KeyConditionExpression: 'P_K = :hkey and begins_with ( AudienceDynamicField , :filter )',
        ExpressionAttributeValues: {
            ":hkey": `CLUB#${clubId}`,
            ":filter": `KickedOut#`
        },

        AttributesToGet: [
            'audienceId', 'avatar', 'username', 'AudienceDynamicField'
        ],
        ScanIndexForward: false,
        ReturnConsumedCapacity: "INDEXES"
    };

    if (req.headers.lastevaluatedkey) {
        query['ExclusiveStartKey'] = JSON.parse(req.headers.lastevaluatedkey);
    }

    dynamoClient.query(query, (err, data) => {
        if (err) res.status(404).json(err);
        else res.status(200).json(data);
    });

});


// ! req.headers - {audienceid, timestamp of audience}
app.post('/clubs/:clubId/un-kick', async (req, res) => {
    const clubId = req.params.clubId;

    const audienceId = req.headers.audienceid;
    const timestamp = req.headers.timestamp;

    if ((!timestamp) || (!audienceId)) {
        res.status(400).json('timestamp should exist in headers and should be equal to entry time of user in club, audienceid should also exist');
        return;
    }

    const _attributeUpdates = {
        isKickedOut: { "Action": "PUT", "Value": false },
        AudienceDynamicField: { "Action": "DELETE" },
    };

    const _audienceUnKickedQuery = {
        TableName: tableName,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `AUDIENCE#${timestamp}#${audienceId}`
        },
        AttributeUpdates: _attributeUpdates,
    }

    dynamoClient.update(_audienceUnKickedQuery, (err, data) => {
        if (err) res.status(304).json(`Error un-kicking the user: ${err}`);
        else res.status(201).json(data);
        return;
    });
});



// __________________________________________________________________________________________________________________ //
// __________________________________________________________________________________________________________________ //

module.exports = app;

// __________________________________________________________________________________________________________________ //
// __________________________________________________________________________________________________________________ //
