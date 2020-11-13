let divRoomSelection = document.getElementById('roomSelection');
let divMeetingRoom = document.getElementById('meetingRoom');
let inputRoom = document.getElementById('room');
let inputName = document.getElementById('name');
let btnRegister = document.getElementById('register');

let roomName;
let userName;
let participants = {};

let socket = io();

btnRegister.onclick = () => {
    roomName = inputRoom.value;
    userName = inputName.value;

    if (roomName === '' || userName === '') {
        alert('Room and name are required');
    } else {
        let message = {
            event: 'joinRoom',
            userName: userName,
            roomName: roomName,
        };
        sendMessage(message);

        divRoomSelection.style = 'display: none';
        divMeetingRoom.style = 'display:block';

    }
};

socket.on('message', message => {
    console.log('message arrived', message.event);
    switch (message.event) {
        case 'newParticipantArrived':
            receiveVideo(message.userId, message.userName);
            break;
        case 'existingParticipants':
            onExistingParticipants(message.userId, message.existingUsers);
            break;
        case 'receiveVideoAnswer':
            onReceiveVideoAnswer(message.senderId, message.sdpAnswer)
            break;
        case 'candidate':
            addIceCandidate(message.userId, message.candidate);
            break;
    }
});

function sendMessage(message) {
    socket.emit('message', message);
}


function receiveVideo(user_id, user_name) {
    let video = document.createElement('video');
    let div = document.createElement('div');
    div.className = 'videoContainer';
    let name = document.createElement('div');
    video.id = user_id;
    video.autoplay = true;
    name.appendChild(document.createTextNode(user_name));
    div.appendChild(video);
    div.appendChild(name);
    divMeetingRoom.appendChild(div);

    let user = {
        id: user_id,
        userName: user_name,
        video: video,
        rtcPeer: null
    };
    participants[user.id] = user;

    let options = {
        remoteVideo: video,
        onicecandidate: onIceCandidate
    };

    user.rtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options, function (err) {
        if (err) { return console.error(err); }
        this.generateOffer(onOffer);
    });

    let onOffer = (err, offer, wp) => {
        let message = {
            event: 'receiveVideoFrom',
            userId: user.id,
            roomName: roomName,
            sdpOffer: offer
        };
        sendMessage(message);
    }

    function onIceCandidate(candidate, wp) {
        let message = {
            event: 'candidate',
            userId: user.id,
            roomName: roomName,
            candidate: candidate
        };
        sendMessage(message);
    }
}


function onExistingParticipants(user_id, existingUsers) {
    let video = document.createElement('video');
    let div = document.createElement('div');
    div.className = 'videoContainer';
    let name = document.createElement('div');
    video.id = user_id;
    video.autoplay = true;
    name.appendChild(document.createTextNode(userName));
    div.appendChild(video);
    div.appendChild(name);
    divMeetingRoom.appendChild(div);

    let user = {
        id: user_id,
        userName: userName,
        video: video,
        rtcPeer: null
    };
    participants[user.id] = user;

    let constraints = {
        audio: true,
        video: {
            mandatory: {
                maxWidth: 320,
                maxFrameRate: 30,
                minFrameRate: 15
            }
        }
        // video:false
    };

    let options = {
        localVideo: video,
        onicecandidate: onIceCandidate,
        mediaConstraints: constraints
    };

    user.rtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendonly(options, function (err) {
        if (err) { return console.error(err); }
        this.generateOffer(onOffer);
    });

    existingUsers.forEach(element => {
        receiveVideo(element.id, element.name);
    });

    let onOffer = (err, offer, wp) => {
        let message = {
            event: 'receiveVideoFrom',
            userId: user.id,
            roomName: roomName,
            sdpOffer: offer
        };
        sendMessage(message);
    }

    function onIceCandidate(candidate, wp) {
        let message = {
            event: 'candidate',
            userId: user.id,
            roomName: roomName,
            candidate: candidate
        };
        sendMessage(message);
    }
}

function onReceiveVideoAnswer(senderId, sdpAnswer) {
    participants[senderId].rtcPeer.processAnswer(sdpAnswer);
}

function addIceCandidate(user_id, candidate) {
    participants[user_id].rtcPeer.addIceCandidate(candidate);
}