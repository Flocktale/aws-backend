class Constants {
    static get actionName() {
        return {
            postParticipantList: "postParticipantList",
            clubStarted: "clubStarted",
            clubConcluded: "clubConcluded",
            postSocialCount: "postSocialCount",
        };
    }


    static get whatType() {
        return {
            participantList: "participantList",
            clubStarted: "clubStarted",
            clubConcluded: "clubConcluded",
            socialCounts: "socialCounts",
        };
    }

}

module.exports = Constants;