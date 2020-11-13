const express = require('express');
const app = express();
let http = require('http').createServer(app);
let minimist = require('minimist');

let io = require('socket.io')(http);

const kurento = require('kurento-client');

let kurentoClient = null;
let iceCandidateQueues = {};


let argv = minimist(process.argv.slice(2), {
    default: {
        as_uri: 'http://localhost:3000',
        ws_uri: 'ws://localhost:8888/kurento'
    }
})

io.on('connection', socket => {
    socket.on('message', message => {
        switch (message.event) {
            case 'joinRoom':
                joinRoom(socket, message.userName, message.roomName, err => {
                    if (err) {
                        console.log(err);
                    }
                });
                break;
            case 'receiveVideoFrom':
                receiveVideoFrom(socket, message.userId, message.roomName, message.sdpOffer, err => {
                    if (err) console.log(err);
                })
                break;
            case 'candidate':
                addIceCandidate(socket, message.userId, message.roomName, message.candidate, err => {
                    if (err) console.log(err);
                });
                break;
        }
    });
});

function joinRoom(socket, userName, roomName, callback) {
    getRoom(socket, roomName, (err, myRoom) => {
        if (err) {
            return callback(err);
        }

        myRoom.pipeline.create('WebRtcEndpoint', (error, outgoingMedia) => {
            if (error) { return callback(error); }



            let user = {
                id: socket.id,
                name: userName,
                outgoingMedia: outgoingMedia,
                incomingMedia: {}
            };

            let iceCandidateQueue = iceCandidateQueues[user.id];
            if (iceCandidateQueue) {
                while (iceCandidateQueue.length) {
                    let ice = iceCandidateQueue.shift();
                    user.outgoingMedia.addIceCandidate(ice.candidate);
                }
            }

            user.outgoingMedia.on('OnIceCandidate', event => {
                let candidate = kurento.register.complexTypes.IceCandidate(event.candidate);
                socket.emit('candidate', {
                    event: 'candidate',
                    userId: user.id,
                    candidate: candidate
                });
            });

            socket.to(roomName).emit('message', {
                event: 'newParticipantArrived',
                userId: user.id,
                userName: user.name
            });

            let existingUsers = [];
            for (let i in myRoom.participants) {
                if (myRoom.participants[i].id !== user.id) {
                    existingUsers.push({
                        id: myRoom.participants[i].id,
                        name: myRoom.participants[i].name
                    });
                }
            }

            socket.emit('message', {
                event: 'existingParticipants',
                existingUsers: existingUsers,
                userId: user.id
            });

            myRoom.participants[user.id] = user;

        });
    });
}


function getKurentoClient(callback) {
    if (kurentoClient !== null) { return callback(null, kurentoClient); }

    kurento(argv.ws_uri, (err, _kurentoClient) => {
        if (err) {
            console.log(err);
            return callback(err);
        }
        kurentoClient = _kurentoClient;
        callback(null, kurentoClient);
    });
}


function getRoom(socket, roomName, callback) {
    let myRoom = io.sockets.adapter.rooms[roomName] || { length: 0 };
    let numClients = myRoom.length;

    if (numClients == 0) {
        socket.join(roomName, () => {
            myRoom = io.sockets.adapter.rooms[roomName];
            getKurentoClient((err, _kurento) => {
                _kurento.create('MediaPipeline', (error, pipeline) => {
                    myRoom.pipeline = pipeline;
                    myRoom.participants = {};
                    callback(null, myRoom);
                });
            });
        });
    } else {
        socket.join(roomName);
        callback(null, myRoom);
    }
}

function getEndpointForUser(socket, roomName, senderId, callback) {
    let myRoom = io.sockets.adapter.rooms[roomName];
    let asker = myRoom.participants[socket.id];
    let sender = myRoom.participants[senderId];

    if (asker.id === sender.id) {
        return callback(null, asker.outgoingMedia);
    }

    if (asker.incomingMedia[sender.id]) {
        sender.outgoingMedia.connect(asker.incomingMedia[sender.id], err => {
            if (err) { return callback(err); }
            callback(null, asker.incomingMedia[sender.id]);
        });
    } else {

        myRoom.pipeline.create('WebRtcEndpoint', (error, incoming) => {
            if (error) { return callback(error); }

            asker.incomingMedia[sender.id] = incoming;

            let iceCandidateQueue = iceCandidateQueues[sender.id];
            if (iceCandidateQueue) {
                while (iceCandidateQueue.length) {
                    let ice = iceCandidateQueue.shift();
                    incoming.addIceCandidate(ice.candidate);
                }
            }

            incoming.on('OnIceCandidate', event => {
                let candidate = kurento.register.complexTypes.IceCandidate(event.candidate);
                socket.emit('candidate', {
                    event: 'candidate',
                    userId: sender.id,
                    candidate: candidate
                });
            });

            sender.outgoingMedia.connect(incoming, err => {
                if (err) { return callback(err); }
                callback(null, incoming);
            });


        });

    }

}

function receiveVideoFrom(socket, userId, roomName, sdpOffer, callback) {
    getEndpointForUser(socket, roomName, userId, (err, endpoint) => {
        if (err) { return callback(err); }
        endpoint.processOffer(sdpOffer, (error, sdpAnswer) => {
            if (error) { return callback(error); }
            socket.emit('message', {
                event: 'receiveVideoAnswer',
                senderId: userId,
                sdpAnswer: sdpAnswer
            });

            endpoint.gatherCandidates(_err => {
                if (_err) return callback(_err);
            });

        });
    });
}

function addIceCandidate(socket, senderId, room_name, iceCandidate, callback) {

    let user = io.sockets.adapter.rooms[room_name].participants[socket.id];
    if (user != null) {
        let candidate = kurento.register.complexTypes.IceCandidate(iceCandidate);
        if (senderId === user.id) {
            if (user.outgoingMedia) {
                user.outgoingMedia.addIceCandidate(candidate);
            } else {
                iceCandidateQueues[user.id].push({ candidate: candidate });
            }
        } else {
            if (user.incomingMedia[senderId]) {
                user.incomingMedia[senderId].addIceCandidate(candidate);
            } else {
                if (!iceCandidateQueues[senderId]) {
                    iceCandidateQueues[senderId] = [];
                }
                iceCandidateQueues[senderId].push({ candidate: candidate });
            }
        }
        callback(null);
    } else {
        callback(new Error('addIceCandidate failed'));
    }

}


app.use(express.static('public'));

http.listen(3000, () => {
    console.log('app is running');
})