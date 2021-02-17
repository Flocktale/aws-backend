const {
    RtcTokenBuilder,
    RtcRole
} = require('agora-access-token');


const {
    agoraAppId,
    agoraPrimaryCertificate,
} = require('../config');


// To generate temporary token with validity of 24 hrs for Agora live audio interaction
async function generateAgoraToken({
    clubId
}) {
    if (!clubId) {
        throw new Error('clubId is required to generate Agora Token');
    }

    const channelName = clubId; // using clubId as unique channel name
    const uid = 0; //! No authentication using UID to connect to agora 
    const role = RtcRole.PUBLISHER; // this role is required in case of broadcasting 
    const privilegeExpiredTs = 0; // setting it to 0 generate token with expiry of 24 hrs (max expiry time)

    const agoraToken = RtcTokenBuilder.buildTokenWithUid(agoraAppId, agoraPrimaryCertificate, channelName, uid, role, privilegeExpiredTs);


    return agoraToken;

}

module.exports = {
    generateAgoraToken,
};