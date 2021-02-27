const router = require('express').Router();

const {
    tableName,
    dynamoClient
} = require('../config');

//  required
// body - {"contacts" : list of phone_numbers}      
// phone_number should be of E.164 format (with + sign and contrycode)
router.post('/', async (req, res) => {

    const contacts = req.body.contacts;
    if (!contacts) {
        return res.status(400).json('contacts are required in body');
    }

    const responseList = [];


    const _transactQuery = {
        TransactItems: []
    };

    for (var index in contacts) {

        const phone = contacts[index];


        if (index !== 0 && index % 25 === 0) {

            const data = (await dynamoClient.transactGet(_transactQuery).promise()).Responses;
            data.map(({
                Item
            }) => {
                responseList.push({
                    phone: phone,
                    ...Item
                });
            });

            _transactQuery.TransactItems = []; // emptying the array
        }


        const _getQuery = {
            TableName: tableName,
            Key: {
                P_K: `PHONE#${phone}`,
                S_K: `PHONEMETA#${phone}`,
            },
            ProjectionExpression: '#userId, #username, #avatar',
            ExpressionAttributeNames: {
                '#userId': 'userId',
                '#username': 'username',
                '#avatar': 'avatar',
            },
        }

        _transactQuery.TransactItems.push({
            Get: _getQuery
        });
    }

    // in case, index didn't reach 25x at last iteration.
    if (_transactQuery.TransactItems[0]) {
        try {
            const data = (await dynamoClient.transactGet(_transactQuery).promise()).Responses;
            data.map(({
                Item
            }) => {
                responseList.push({
                    phone: phone,
                    ...Item
                });
            });

        } catch (error) {}
    }

    return res.status(200).json(responseList);

});

module.exports = router;