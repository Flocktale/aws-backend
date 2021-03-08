const _avatarBucketName = "mootclub-public";
const _userAvatarPrefix = 'userAvatar/';
const _clubAvatarPrefix = 'clubAvatar/';

class Constants {

    // audience data related
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



    // S3 object related
    static get avatarBucketName() {
        return _avatarBucketName;
    }

    //\// User Avatar related 
    static get s3UserAvatarThumbKey(uniqueKey) {
        return _userAvatarPrefix + uniqueKey + "_thumb";
    }

    static get s3UserAvatarDefaultKey(uniqueKey) {
        return _userAvatarPrefix + uniqueKey;
    }

    static get s3UserAvatarLargeKey(uniqueKey) {
        return _userAvatarPrefix + uniqueKey + "_large";
    }

    static get UserAvatarUrl(uniqueKey) {
        return "https://" + _avatarBucketName + ".s3.amazonaws.com/" + _userAvatarPrefix + uniqueKey;
    }

    //\// Club Avatar related 
    static get s3ClubAvatarThumbKey(uniqueKey) {
        return _clubAvatarPrefix + uniqueKey + "_thumb";
    }

    static get s3ClubAvatarDefaultKey(uniqueKey) {
        return _clubAvatarPrefix + uniqueKey;
    }

    static get s3ClubAvatarLargeKey(uniqueKey) {
        return _clubAvatarPrefix + uniqueKey + "_large";
    }

    static get ClubAvatarUrl(uniqueKey) {
        return "https://" + _avatarBucketName + ".s3.amazonaws.com/" + _clubAvatarPrefix + uniqueKey;
    }

}


module.exports = Constants;