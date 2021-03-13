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
    const contacts = Array.from((new Set(req.body.contacts.map(text => {
        return text.split(/\s/).join('');
    }))).values());

    console.log('checking duplicates');

    for (var i = 0; i < contacts.length; i++) {
        for (var j = i + 1; j < contacts.length; j++) {
            if (contacts[i] === contacts[j]) {
                console.log('duplicate: ', contacts[i]);
            }
        }
    }



    const responseList = [];

    const _batchQuery = {
        RequestItems: {
            'MyTable': {
                Keys: [],
                ProjectionExpression: '#userId, #avatar, P_K',
                ExpressionAttributeNames: {
                    '#userId': 'userId',
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
                    avatar: Item.avatar,
                });
            });

        } catch (error) {}
    }

    return res.status(200).json(responseList);

});

module.exports = router;