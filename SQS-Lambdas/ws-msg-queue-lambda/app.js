const Constants = require("./constants");

const {
    postParticipantListToWebsocketUsers,

    postClubStartedMessageToWebsocketUsers,
    postClubConcludedMessageToWebsocketUsers,
    postSocialCountToBothUser,

} = require("./websocketFunctions");




exports.lambdaHandler = async (event, context) => {


    const promises = [];

    for (var msg of event.Records) {

        console.log(msg.messageAttributes);

        try {

            const action = msg.messageAttributes.action.stringValue;

            if (action === Constants.actionName.postParticipantList) {

                const clubId = msg.messageAttributes.clubId.stringValue;
                promises.push(postParticipantListToWebsocketUsers(clubId));

            } else if (action === Constants.actionName.clubStarted) {

                const clubId = msg.messageAttributes.clubId.stringValue;
                const agoraToken = msg.messageAttributes.agoraToken.stringValue;

                promises.push(postClubStartedMessageToWebsocketUsers({
                    clubId: clubId,
                    agoraToken: agoraToken
                }));

            } else if (action === Constants.actionName.clubConcluded) {
                const clubId = msg.messageAttributes.clubId.stringValue;

                promises.push(postClubConcludedMessageToWebsocketUsers({
                    clubId: clubId
                }));

            } else if (action === Constants.actionName.postSocialCount) {
                const userId1 = msg.messageAttributes.userId1.stringValue;
                const userId2 = msg.messageAttributes.userId2.stringValue;


                promises.push(postSocialCountToBothUser({
                    userId1: userId1,
                    userId2: userId2
                }));

            }
        } catch (error) {
            console.log('error: ', error);
        }


    }

    await Promise.all(promises);

    return 'Success';
};