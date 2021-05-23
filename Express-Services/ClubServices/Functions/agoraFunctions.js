const {
    RtcTokenBuilder,
    RtcRole
} = require('agora-access-token');


const {
    agoraAppId,
    agoraPrimaryCertificate,
} = require('../config');


// To generate temporary token with validity of 24 hrs for Agora live audio interaction
function generateAgoraToken({
    clubId,
    uid,
}) {
    if (!clubId || !uid) {
        throw new Error('clubId and uid is required to generate Agora Token');
    }


    const channelName = clubId; // using clubId as unique channel name

    // currently we are providing publisher role to every token 
    const role = RtcRole.PUBLISHER; // this role is required in case of broadcasting 

    const privilegeExpiredTs = 0; // setting it to 0 generate token with expiry of 24 hrs (max expiry time)

    const agoraToken = RtcTokenBuilder.buildTokenWithUid(agoraAppId, agoraPrimaryCertificate, channelName, uid, role, privilegeExpiredTs);


    return agoraToken;

}

module.exports = {
    generateAgoraToken,
};