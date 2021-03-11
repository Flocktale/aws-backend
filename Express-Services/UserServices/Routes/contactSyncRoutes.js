const router = require('express').Router();

const {
    myTable,
    dynamoClient
} = require('../config');

//  required
// body - {"contacts" : list of phone_numbers}      
// phone_number should be of E.164 format (with + sign and contrycode)
router.post('/', async (req, res) => {

    if (!req.body.contacts) {
        return res.status(400).json('contacts are required in body');
    }

    // removing duplicate items and then converting it to array type.
    const contacts = Array.from((new Set(req.body.contacts)).values());



    const responseList = [];

    const _batchQuery = {
        RequestItems: {
            'MyTable': {
                Keys: [],
                ProjectionExpression: '#userId, #username, #avatar, P_K',
                ExpressionAttributeNames: {
                    '#userId': 'userId',
                    '#username': 'username',
                    '#avatar': 'avatar',
                },
                ConsistentRead: false,
            }
        }
    };



    for (var phone of contacts) {

        _batchQuery.RequestItems.MyTable.Keys.push({
            P_K: `PHONE#${phone}`,
            S_K: `PHONEMETA#${phone}`,
        });


        // batchGet can retrieve upto 100 items and at max 16MB in one call.
        if (_batchQuery.RequestItems.MyTable.Keys.length % 100 === 0) {

            const batchData = await dynamoClient.batchGet(_batchQuery).promise();

            batchData.Responses.MyTable.map(Item => {
                responseList.push({
                    phone: Item.P_K.split('#')[1],
                    userId: Item.userId,
                    username: Item.username,
                    avatar: Item.avatar,
                });
            });

            _batchQuery.RequestItems.MyTable.Keys = []; // emptying the array
        }

    }

    // in case, keys are left at last iteration.
    if (_batchQuery.RequestItems.MyTable.Keys.length) {
        try {
            const batchData = await dynamoClient.batchGet(_batchQuery).promise();

            batchData.Responses.MyTable.map(Item => {
                responseList.push({
                    phone: Item.P_K.split('#')[1],
                    userId: Item.userId,
                    username: Item.username,
                    avatar: Item.avatar,
                });
            });

        } catch (error) {}
    }

    return res.status(200).json(responseList);

});

module.exports = router;