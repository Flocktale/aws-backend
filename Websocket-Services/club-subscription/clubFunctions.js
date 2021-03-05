const {
    myTable,
    dynamoClient,
} = require('./config');


async function _updateAudienceCount(clubId, value) {

    const _audienceCountUpdateQuery = {
        TableName: myTable,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: 'CountAudience#'
        },
        UpdateExpression: 'set #cnt = #cnt + :counter',
        ExpressionAttributeNames: {
            '#cnt': 'count'
        },
        ExpressionAttributeValues: {
            ':counter': value,
        },
        ReturnValues: 'UPDATED_NEW',
    };

    const countReturnedData = (await dynamoClient.update(_audienceCountUpdateQuery).promise())['Attributes'];
    const estimatedAudience = countReturnedData['count'];



    const condition_1 = (estimatedAudience <= 100);
    const condition_2 = (estimatedAudience > 100 && estimatedAudience <= 1000) ? (estimatedAudience % 13 === 0) : false;
    const condition_3 = (estimatedAudience > 1000 && estimatedAudience <= 10000) ? (estimatedAudience % 127 === 0) : false;
    const condition_4 = (estimatedAudience > 10000 && estimatedAudience <= 100000) ? (estimatedAudience % 1700 === 0) : false;
    const condition_5 = (estimatedAudience % 10000 === 0);

    if (condition_1 || condition_2 || condition_3 || condition_4 || condition_5) {


        const _updateClubEstimatedCountQuery = {
            TableName: myTable,
            Key: {
                P_K: `CLUB#${clubId}`,
                S_K: `CLUBMETA#${clubId}`
            },
            UpdateExpression: 'SET estimatedAudience = :est',
            ExpressionAttributeValues: {
                ':est': estimatedAudience,
            },
        }

        await dynamoClient.update(_updateClubEstimatedCountQuery).promise();

    }

}

async function incrementAudienceCount(clubId) {
    return new Promise(async (resolve, reject) => {
        await _updateAudienceCount(clubId, 1);
        resolve();
    });
}

async function decrementAudienceCount(clubId) {
    return new Promise(async (resolve, reject) => {
        await _updateAudienceCount(clubId, -1);
        resolve();
    });
}

async function decrementParticipantCount(clubId) {
    return new Promise(async (resolve, reject) => {

        const _updateParticipantCounterQuery = {
            TableName: myTable,
            Key: {
                P_K: `CLUB#${clubId}`,
                S_K: `CountParticipant#`,
            },
            UpdateExpression: 'set #cnt = #cnt - :counter', // decrementing
            ExpressionAttributeNames: {
                '#cnt': 'count'
            },
            ExpressionAttributeValues: {
                ':counter': 1,
            }
        }
        await dynamoClient.update(_updateParticipantCounterQuery).promise();
        resolve();
    });
}




module.exports = {
    incrementAudienceCount,
    decrementAudienceCount,
    decrementParticipantCount,
};