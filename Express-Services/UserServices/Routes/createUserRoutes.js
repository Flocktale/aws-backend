const router = require('express').Router();
const fs = require('fs');
const {
    UserBaseCompleteSchema
} = require('../Schemas/UserBase');
const {
    imageUploadConstParams,
    dynamoClient,
    s3,
    tableName
} = require('../config');

const {
    isUsernameAvailable
} = require('../Functions/userFunctions');



// required
// body : UserBaseCompleteSchema validated
// username must be unique.

router.post("/", async (req, res) => {

    try {
        req.body['avatar'] = `https://mootclub-public.s3.amazonaws.com/userAvatar/${req.body.userId}`;
        const result = await UserBaseCompleteSchema.validateAsync(req.body);

        const _availability = await isUsernameAvailable(result.username);
        if (_availability !== true) {
            return res.status(400).json('username is not available');
        }

        const query = {
            TableName: tableName,
            Item: result,
            ConditionExpression: "P_K <> :hkey and S_K <> :skey",
            ExpressionAttributeValues: {
                ":hkey": result.P_K,
                ":skey": result.S_K
            }
        };

        const phoneRecordQuery = {
            TableName: tableName,
            Item: {
                P_K: `PHONE#${result.phone}`,
                S_K: `PHONEMETA#${result.phone}`,
                userId: result.userId,
                username: result.username,
                avatar: result.avatar,
            },
            ConditionExpression: "P_K <> :hkey and S_K <> :skey",
            ExpressionAttributeValues: {
                ":hkey": `PHONE#${result.phone}`,
                ":skey": `PHONEMETA#${result.phone}`,
            }
        };

        const _transactQuery = {
            TransactItems: [{
                Put: query
            }, {
                Put: phoneRecordQuery
            }]
        };

        dynamoClient.transactWrite(_transactQuery, async (err, data) => {
            if (err) {
                console.log(err);
                res.status(404).json(`Error creating profile: ${err}`);
            } else {
                const fileName = result.userId;
                var params = {
                    ...imageUploadConstParams,
                    Body: fs.createReadStream('./static/dp.jpg'),
                    Key: `userAvatar/${fileName}`
                };

                try {
                    await s3.upload(params).promise();
                } catch (error) {
                    console.log(`Error occured while trying to upload: ${error}`);
                }

                return res.status(201).json('User Profile created successfully.');
            }
        });

    } catch (error) {
        res.status(400).json(error);
    }
});

module.exports = router;