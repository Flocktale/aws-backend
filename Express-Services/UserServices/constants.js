class Constants {

    static AudienceStatus = {
        Blocked: 'Blocked',
        Participant: 'Participant',
        ActiveJoinRequest: 'ActiveJoinRequest',
    };

    static isAudienceStatusValid(status) {
        return (status === Constants.AudienceStatus.Blocked ||
            status === Constants.AudienceStatus.Participant ||
            status === Constants.AudienceStatus.ActiveJoinRequest);
    }

    static UserAvatarPrefix = "https://mootclub-public.s3.amazonaws.com/userAvatar/";
    static ClubAvatarPrefix = "https://mootclub-public.s3.amazonaws.com/clubAvatar/";

}


module.exports = Constants;