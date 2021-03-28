const _avatarBucketName = "flocktale-public";
const _userAvatarPrefix = 'userAvatar/';
const _clubAvatarPrefix = 'clubAvatar/';
const _communityAvatarPrefix = 'communityAvatar/';
const _communityCoverImagePrefix = 'communityCoverImage/'

const awsAccountId = "524663372903";
const awsRegion = "ap-south-1";

class Constants {

    // sns related

    static snsTopicArn(name) {
        return "arn:aws:sns:" + awsRegion + ":" + awsAccountId + ":" + name;
    }

    //  sqs related

    static get PostNotificationQueueUrl() {
        return 'https://sqs.ap-south-1.amazonaws.com/524663372903/PostNotificationQueue.fifo';
    }

    static get PostNotificationQueueAction() {
        return {
            send: "send",
            sendAndSave: "sendAndSave",
        }
    }

    static get WsMsgQueueUrl() {
        return 'https://sqs.ap-south-1.amazonaws.com/524663372903/WsMsgQueue.fifo';
    }

    static get WsMsgQueueAction() {
        return {
            postParticipantList: "postParticipantList",
            clubStarted: "clubStarted",
            clubConcluded: "clubConcluded",
            postSocialCount: "postSocialCount",
        };
    }

    // club data related

    static get ClubStatus() {
        return {
            Waiting: "Waiting",
            Live: "Live",
            Concluded: "Concluded",
        };
    }


    // audience data related
    static get AudienceStatus() {
        return {
            Blocked: 'Blocked',
            Participant: 'Participant',
            ActiveJoinRequest: 'ActiveJoinRequest',
        };
    }

    static isAudienceStatusValid(status) {
        return (status === Constants.AudienceStatus.Blocked ||
            status === Constants.AudienceStatus.Participant ||
            status === Constants.AudienceStatus.ActiveJoinRequest);
    }

    static get maxParticipantLimit() {
        return 10;
    }





    // S3 object related
    static get avatarBucketName() {
        return _avatarBucketName;
    }

    //\// User Avatar related 
    static s3UserAvatarThumbKey(uniqueKey) {
        return _userAvatarPrefix + uniqueKey + "_thumb";
    }

    static s3UserAvatarDefaultKey(uniqueKey) {
        return _userAvatarPrefix + uniqueKey;
    }

    static s3UserAvatarLargeKey(uniqueKey) {
        return _userAvatarPrefix + uniqueKey + "_large";
    }

    static UserAvatarUrl(uniqueKey) {
        return "https://" + _avatarBucketName + ".s3.amazonaws.com/" + _userAvatarPrefix + uniqueKey;
    }

    //\// Club Avatar related 
    static s3ClubAvatarThumbKey(uniqueKey) {
        return _clubAvatarPrefix + uniqueKey + "_thumb";
    }

    static s3ClubAvatarDefaultKey(uniqueKey) {
        return _clubAvatarPrefix + uniqueKey;
    }

    static s3ClubAvatarLargeKey(uniqueKey) {
        return _clubAvatarPrefix + uniqueKey + "_large";
    }

    static ClubAvatarUrl(uniqueKey) {
        return "https://" + _avatarBucketName + ".s3.amazonaws.com/" + _clubAvatarPrefix + uniqueKey;
    }

    //\// Community Avatar related
    static s3CommunityAvatarThumbKey(uniqueKey) {
        return _communityAvatarPrefix + uniqueKey + "_thumb";
    }

    static s3CommunityAvatarDefaultKey(uniqueKey) {
        return _communityAvatarPrefix + uniqueKey;
    }

    static s3CommunityAvatarLargeKey(uniqueKey) {
        return _communityAvatarPrefix + uniqueKey + "_large";
    }

    static CommunityAvatarUrl(uniqueKey) {
        return "https://" + _avatarBucketName + ".s3.amazonaws.com/" + _communityAvatarPrefix + uniqueKey;
    }


    //\// Community Cover Image related
    static s3CommunityCoverImageThumbKey(uniqueKey) {
        return _communityCoverImagePrefix + uniqueKey + "_thumb";
    }

    static s3CommunityCoverImageDefaultKey(uniqueKey) {
        return _communityCoverImagePrefix + uniqueKey;
    }

    static s3CommunityCoverImageLargeKey(uniqueKey) {
        return _communityCoverImagePrefix + uniqueKey + "_large";
    }

    static CommunityCoverImageUrl(uniqueKey) {
        return "https://" + _avatarBucketName + ".s3.amazonaws.com/" + _communityCoverImagePrefix + uniqueKey;
    }

}


module.exports = Constants;