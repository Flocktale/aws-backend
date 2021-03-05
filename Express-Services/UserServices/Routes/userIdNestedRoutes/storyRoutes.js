const router = require('express').Router();
const {
    nanoid
} = require('nanoid');

const {
    imageUploadConstParams,
    s3,
    dynamoClient,
    myTable,
    timestampSortIndex,
} = require('../../config');

const {
    StorySchemaWithDatabaseKeys
} = require('../../Schemas/StorySchema');

// TODO: Add a method to automatically (delete or move to archives) the stale stories. 
// Configure and use TTL attribute (set to 24 hrs)


// required
// body.image = base 64 encoded image

router.post("/", async (req, res) => {
    const userId = req.userId;

    if (!req.body || !req.body.image) {
        res.status(400).send('Invalid request. image not found');
        return;
    }

    const _userSummaryQuery = {
        TableName: myTable,
        Key: {
            P_K: `USER#${userId}`,
            S_K: `USERMETA#${userId}`,
        },
        AttributesToGet: ["userId", "username", "avatar"],
    };

    const user = (await dynamoClient.get(_userSummaryQuery).promise())['Item'];

    if (!user) {
        console.log('could not fetch user summary data');
        return res.status(500).json('could not fetch user summary data');
    }


    const storyId = nanoid();
    const url = `https://mootclub-public.s3.amazonaws.com/userAvatar/${userId}/${storyId}`;

    const storyData = await StorySchemaWithDatabaseKeys.validateAsync({
        user: user,
        storyId: storyId,
        url: url,
    });

    const buffer = Buffer.from(req.body.image, 'base64');
    var params = {
        ...imageUploadConstParams,
        Body: buffer,
        Key: `userStory/${userId}/${storyId}`
    };

    var imageUploadedData;

    try {
        imageUploadedData = await s3.upload(params).promise();

        console.log('data from story upload to s3: ', imageUploadedData);

    } catch (error) {
        console.log(`Error occured while trying to upload: ${err}`);
        res.json(`Error occured while trying to upload: ${err}`);
        return;
    }

    const _storyQuery = {
        TableName: myTable,
        Item: storyData,
    }

    try {
        await dynamoClient.put(_storyQuery).promise();

        return res.status(201).json('Story created successfully');

    } catch (error) {
        console.log('error while putting story data in dynamoDB: ', error);
        return res.status(404).json(`error while putting story data in database: ${error}`);
    }

});


// get list of the stories posted within last 24 hours by any individual user (limit is 2)
router.get("/", async (req, res) => {
    const userId = req.userId;

    const currentDate = new Date();
    currentDate.setDate(currentDate.getDate() - 1); // setting it 24 hours slow (to get all the stories within last 24 hours )

    const thresholdTime = Date.parse(currentDate);

    const _storySearchQuery = {
        TableName: myTable,
        IndexName: timestampSortIndex,
        KeyConditions: {
            "P_K": {
                "ComparisonOperator": "EQ",
                "AttributeValueList": [`USER#${userId}`]
            },
            "TimestampSortField": {
                "ComparisonOperator": "BEGINS_WITH",
                "AttributeValueList": [`STORY-SORT-TIMESTAMP#`]
            },
        },
        QueryFilter: {
            'timestamp': {
                "ComparisonOperator": "GT",
                "AttributeValueList": [thresholdTime]
            }
        },
        AttributesToGet: ['user', 'storyId', 'url', 'timestamp'],
        ScanIndexForward: false,
        Limit: 2,
    }

    try {
        const data = (await dynamoClient.query(_storySearchQuery).promise())['Items'];
        console.log('stories fetched for userId: ', userId, ' are: ', data);
        return res.status(200).json({
            userId: userId,
            stories: data,
        });
    } catch (error) {
        console.log('error while fetching stories data: ', error);
        return res.status(404).json('error while fetching stories data');
    }

});

// all stories of last 24 hrs of users followed by requested user
router.get("/home/all", async (req, res) => {
    const userId = req.userId;

    const _followingsQuery = {
        TableName: myTable,

        KeyConditionExpression: 'P_K = :pk and begins_with(S_K,:sk)',
        FilterExpression: "relationIndexObj.B1 = :tr OR relationIndexObj.B5 = :tr",
        ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':sk': `RELATION#`,
            ':tr': true,

        },
        ProjectionExpression: 'S_K', // we don't need whole foreign user (foreignUser.userId can't be fetched alone(i guess)), so using S_K (small in size) to retrieve foreign user's id.
    }

    const _followingsData = (await dynamoClient.query(_followingsQuery).promise())['Items'];

    if (!_followingsData) {
        console.log('this user follows no body as it seems');
        return res.status(200).json([]);
    }

    const _followingsIds = _followingsData.map(({
        S_K
    }) => {
        return S_K.split("RELATION#")[1];
    });

    const currentDate = new Date();
    currentDate.setDate(currentDate.getDate() - 1); // setting it 24 hours slow (to get all the stories within last 24 hours )

    const thresholdTime = Date.parse(currentDate);

    const allStories = [];

    for (var followId of _followingsIds) {
        const _storySearchQuery = {
            TableName: myTable,
            IndexName: timestampSortIndex,
            KeyConditions: {
                "P_K": {
                    "ComparisonOperator": "EQ",
                    "AttributeValueList": [`USER#${followId}`]
                },
                "TimestampSortField": {
                    "ComparisonOperator": "BEGINS_WITH",
                    "AttributeValueList": [`STORY-SORT-TIMESTAMP#`]
                },
            },
            QueryFilter: {
                'timestamp': {
                    "ComparisonOperator": "GT",
                    "AttributeValueList": [thresholdTime]
                }
            },
            AttributesToGet: ['user', 'storyId', 'url', 'timestamp'],
            ScanIndexForward: false,
            Limit: 2,
        };

        try {
            const data = (await dynamoClient.query(_storySearchQuery).promise())['Items'];
            if (data) {
                allStories.push({
                    userId: followId,
                    stories: data,
                })
            }
            console.log('stories fetched for userId: ', followId, ' are: ', data);
        } catch (error) {
            console.log('error while fetching stories data: ', error);
        }

    }

    return res.status(200).json(allStories);


});

module.exports = router;