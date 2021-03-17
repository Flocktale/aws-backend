const router = require('express').Router();
const fs = require('fs');
const {
    UserBaseCompleteSchema
} = require('../Schemas/UserBase');
const {
    dynamoClient,
    myTable
} = require('../config');

const {
    isUsernameAvailable,
    uploadFile
} = require('../Functions/userFunctions');
const Constants = require('../constants');



// required
// body : UserBaseCompleteSchema validated
// username must be unique.

router.post("/", async (req, res) => {

    try {

        const _availability = await isUsernameAvailable(result.username);
        if (_availability !== true) {
            return res.status(400).json('username is not available');
        }

        req.body['avatar'] = Constants.UserAvatarUrl(req.body.userId);
        const result = await UserBaseCompleteSchema.validateAsync(req.body);

        const query = {
            TableName: myTable,
            Item: result,
            ConditionExpression: "P_K <> :hkey and S_K <> :skey",
            ExpressionAttributeValues: {
                ":hkey": result.P_K,
                ":skey": result.S_K
            }
        };

        const phoneRecordQuery = {
            TableName: myTable,
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

                const _thumbnail = fs.createReadStream('./static/dp_thumb.jpg');
                const _default = fs.createReadStream('./static/dp.jpg');
                const _large = fs.createReadStream('./static/dp_large.jpg');

                const uploadPromises = [
                    uploadFile(Constants.s3UserAvatarThumbKey(fileName), _thumbnail),
                    uploadFile(Constants.s3UserAvatarDefaultKey(fileName), _default),
                    uploadFile(Constants.s3UserAvatarLargeKey(fileName), _large),
                ];

                try {
                    await Promise.all(uploadPromises);
                } catch (error) {
                    console.log(`Error occured while trying to upload:`, error);
                }

                return res.status(201).json('User Profile created successfully.');
            }
        });

    } catch (error) {
        res.status(400).json(error);
    }
});

module.exports = router;