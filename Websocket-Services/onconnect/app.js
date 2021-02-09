const AWS = require('aws-sdk');
AWS.config.update({
    region: "us-east-1",
});

const ddb = new AWS.DynamoDB.DocumentClient();

const WsTable = 'WsTable';
const myTable = 'MyTable';
const clubCategoryIndex = 'ClubCategoryIndex';


// key in headers are automatically transformed in lowercase
//required userid in headers

exports.handler = async event => {

    console.log(event);

    const userId = event.headers.userid;

    if (!userId) {
        // TODO: disconnect
        return {
            statusCode: 400,
            body: 'Bad request.'
        };
    }

    const connectionId = event.requestContext.connectionId;

    const putParams = {
        TableName: WsTable,
        Item: {
            connectionId: connectionId,
            userId: userId
        }
    };

    const _onlineStatusUpdateParamas = {
        TableName: myTable,
        Key: {
            P_K: `USER#${userId}`,
            S_K: `USERMETA#${userId}`
        },
        Expected: {
            'P_K': {
                Exists: true,
            },
            'S_K': {
                Exists: true,
            },

        },

        AttributeUpdates: {
            "online": {
                "Action": "PUT",
                "Value": 0,
            }
        },
    };

    try {

        await ddb.put(putParams).promise();

        // this function is not awaited as it is additional operation.
        ddb.update(_onlineStatusUpdateParamas, (err, data) => {
            if (err) {
                console.log('error in modifying online status: ', err);
            }
            if (data) {
                console.log('user is online now');
            }
        });

    } catch (err) {
        return {
            statusCode: 500,
            body: 'Failed to connect: ' + JSON.stringify(err)
        };
    }
    return {
        statusCode: 200,
        body: 'Connected.'
    };

};