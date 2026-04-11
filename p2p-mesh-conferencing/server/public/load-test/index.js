const EVENTS = {
    // client -> server
    SEND_MESSAGE: "send-message",
    DISCONNECT: "disconnect",
    PING: "ping",
    JOIN_CONFERENCE_AS_PUBLISHER: "join-conference-as-publisher",
    SEND_OFFER_FOR_PUBLISHING: "send-offer-for-publishing",
    SEND_ICE_CANDIDATES: "send-ice-candidates",
    SEND_ICE_CANDIDATE_COMPLETED: "send-ice-candidate-completed",
    GET_PUBLISHER_LIST: "get-publisher-list",
    SUBSCRIBE_TO_USER_FEED: "subscribe-to-user-feed",
    SEND_ANSWER_FOR_SUBSCRIBING: "send-answer-for-subscribing",
    TOGGLE_MEDIA_STREAM: "toggle-media-stream",
    LEAVE_CONFERENCE: "leave-conference",

    // server -> client
    CONNECTED: "connected",
    MESSAGE_SENT: "message-sent",
    PONG: "pong",
    ERROR: "error",
    JOINED_CONFERENCE_AS_PUBLISHER: "joined-conference-as-publisher",
    RECEIVE_ANSWER_FOR_PUBLISHING: "receive-answer-for-publishing",
    SUBSCRIBED_TO_USER_FEED: "subscribed-to-user-feed",
    MEDIA_STREAM_TOGGLED: "media-stream-toggled",
    PUBLISHER_LIST: "publisher-list",
    LEFT_CONFERENCE: "left-conference",
    PUBLISHER_JOINED_CONFERENCE: "publisher-joined-conference",

    // server -> room
    USER_CONNECTED: "user-connected",
    USER_DISCONNECTED: "user-disconnected",
    MESSAGE_RECEIVED: "message-received",
    USER_JOINED_ROOM: "user-joined-room",
    USER_LEFT_ROOM: "user-left-room",
    PUBLISHER_TOGGLED_MEDIA_STREAM: "publisher-toggled-media-stream",
    USER_LEFT_CONFERENCE: "user-left-conference",
};

let apikey = "";
let roomId = "";
let numUsers = 0;
let connectedCount = 0;
let wsMap = new Map();
let rtcPeerConnectionMapForPublishers = new Map();
let rtcPeerConnectionMapForSubscribers = new Map();
let candidatesMap = new Map();
let isTestStarted = false;
let pendingSubscriptions = new Map(); // Track pending subscriptions per user

function loadFromLocalStorage() {
    const savedApiKey = localStorage.getItem('loadTest_apiKey');
    const savedRoomId = localStorage.getItem('loadTest_roomId');

    if (savedApiKey) {
        document.getElementById('apiKey').value = savedApiKey;
    }
    if (savedRoomId) {
        document.getElementById('roomId').value = savedRoomId;
    }
}

function saveToLocalStorage(apiKey, roomId) {
    localStorage.setItem('loadTest_apiKey', apiKey);
    localStorage.setItem('loadTest_roomId', roomId);
}

window.addEventListener('DOMContentLoaded', () => {
    loadFromLocalStorage();
    setupToggleSubscriberButton();
});

document.getElementById('loadTestForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const apiKeyLocal = document.getElementById('apiKey').value;
    const roomIdLocal = document.getElementById('roomId').value;
    const numUsersLocal = parseInt(document.getElementById('numUsers').value);

    if (!apiKeyLocal || !roomIdLocal || !numUsersLocal) {
        alert('Please fill in all fields');
        return;
    }

    const button = document.getElementById('startLoadTest');
    button.disabled = true;
    button.textContent = 'Starting Load Test...';

    console.log('Starting load test with:', {
        apiKeyLocal,
        roomIdLocal,
        numUsersLocal
    });

    apikey = apiKeyLocal;
    roomId = roomIdLocal;
    numUsers = numUsersLocal;

    saveToLocalStorage(apiKeyLocal, roomIdLocal);

    isTestStarted = true;
    button.textContent = 'Load testing';
    connectedCount = 0;
    updateStats();
    showProgress();
    setStepActive(1);

    const promises = Array.from({ length: numUsers }, (_, i) => joinRoomAndConnectToSocket(i));
    await Promise.all(promises)
        .then(() => {
            console.log('All users connected');
            button.textContent = 'Load testing';
            setStepCompleted(1);
            setStepActive(2);
        })
        .catch((error) => {
            console.error('Error connecting to socket:', error);
            button.textContent = 'Start Load Test';
            button.disabled = false;
        });

    // Join users as publishers one by one
    const feedIds = [];
    for (let i = 0; i < numUsers; i++) {
        try {
            console.log(`Joining user ${i} as publisher...`);
            const feedId = await joinRoomAsPublisher(i);
            feedIds.push(feedId);
            console.log(`User ${i} joined as publisher with feedId: ${feedId}`);
        } catch (error) {
            console.error(`Error joining user ${i} as publisher:`, error);
            button.textContent = 'Start Load Test';
            button.disabled = false;
            throw error;
        }
    }

    console.log('All users joined as publisher');
    button.textContent = 'Load testing';
    setStepCompleted(2);
    setStepActive(3);

    const sendOfferForPublishingPromises = Array.from({ length: numUsers }, (_, i) => sendOfferForPublishing(i, feedIds[i]));
    const sfuAnswers = await Promise.all(sendOfferForPublishingPromises)
        .then((results) => {
            console.log('All users sent offer for publishing');
            button.textContent = 'Load testing';
            return results;
        })
        .catch((error) => {
            console.error('Error sending offer for publishing:', error);
            button.textContent = 'Start Load Test';
            button.disabled = false;
        });

    const setAnswerForPublishingPromises = Array.from({ length: numUsers }, (_, i) => setAnswerForPublishing(i, sfuAnswers[i]));
    await Promise.all(setAnswerForPublishingPromises)
        .then((results) => {
            console.log('All users have set answer for publishing');
            button.textContent = 'Load testing';
            setStepCompleted(3);
            setStepActive(4);
            return results;
        })
        .catch((error) => {
            console.error('Error setting answers for publishing', error);
            button.textContent = 'Start Load Test';
            button.disabled = false;
        });

    await new Promise(res => setTimeout(res, 2000))

    const peerList = await getPeersList()
    console.log({ peerList })

    const subscribePromises = Array.from({ length: numUsers }, (_, i) => subscribeToPeers(i, peerList));
    await Promise.all(subscribePromises)
        .then((results) => {
            console.log('All users have subscribed to each other');
            button.textContent = 'Load testing complete';
            setStepCompleted(4);
            return results;
        })
        .catch((error) => {
            console.error('Error subscribing to peers', error);
            button.textContent = 'Start Load Test';
            button.disabled = false;
        });
});


async function joinRoomAndConnectToSocket(userIndex) {
    try {
        // Join room via API
        const joinResponse = await fetch(`/api/room/${roomId}/join`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apikey
            },
            body: JSON.stringify({
                name: `LoadTestUser_${userIndex}`
            })
        });

        if (!joinResponse.ok) {
            throw new Error(`Failed to join room: ${joinResponse.status}`);
        }

        const joinData = await joinResponse.json();
        const token = joinData.data.token;

        // Connect to WebSocket
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${location.host}/api/socket/?api_key=${encodeURIComponent(apikey)}&access_token=${encodeURIComponent(token)}`;
        wsMap.set(userIndex, new WebSocket(wsUrl));

        return new Promise((resolve, reject) => {
            wsMap.get(userIndex).onopen = function() {
                console.log('WebSocket connection opened');
            };

            wsMap.get(userIndex).onmessage = function(event) {
                const message = JSON.parse(event.data);
                console.log('Received message:', message);

                if (message.type === EVENTS.CONNECTED) {
                    console.log('Successfully connected to room');
                    connectedCount++;
                    updateStats();
                    resolve(wsMap.get(userIndex));
                }
            };

            wsMap.get(userIndex).onerror = function(error) {
                console.error('WebSocket error:', error);
                reject(error);
            };

            wsMap.get(userIndex).onclose = function() {
                console.log('WebSocket connection closed');
                connectedCount--;
                updateStats();
            };
        });


    } catch (error) {
        console.error('Error joining room and connecting to socket:', error);
        throw error;
    }
}

function joinRoomAsPublisher(userIndex) {
    return new Promise((resolve, reject) => {
        wsMap.get(userIndex).send(JSON.stringify({
            type: EVENTS.JOIN_CONFERENCE_AS_PUBLISHER,
        }));

        wsMap.get(userIndex).onmessage = function(event) {
            const message = JSON.parse(event.data);
            console.log('Received message:', message);

            if (message.type === EVENTS.JOINED_CONFERENCE_AS_PUBLISHER) {
                console.log('Successfully joined as publisher');
                resolve(message.data.feed_id);
            }
        };
    });
}


async function sendOfferForPublishing(userIndex, feedId) {
    return new Promise(async (resolve, reject) => {
        console.log('Sending offer for publishing', userIndex, feedId);
        const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        createPublisherVideo(userIndex, stream);

        const rtcPeerConnection = new RTCPeerConnection();

        stream.getTracks().forEach(track => {
            rtcPeerConnection.addTrack(track, stream);
        });

        rtcPeerConnectionMapForPublishers.set(userIndex, {
            peer: rtcPeerConnection,
            candidates: [],
            feedId: feedId,
            iceCompleted: false
        });

        rtcPeerConnection.onicecandidate = function(event) {
            if (event.candidate) {
                rtcPeerConnectionMapForPublishers.get(userIndex).candidates.push(event.candidate);
            }
            else {
                rtcPeerConnectionMapForPublishers.get(userIndex).iceCompleted = true;

                candidatesMap.set(userIndex, rtcPeerConnectionMapForPublishers.get(userIndex).iceCompleted);

                wsMap.get(userIndex).send(JSON.stringify({
                    type: EVENTS.SEND_ICE_CANDIDATES,
                    data: {
                        feedId: feedId,
                        type: 'publisher',
                        candidates: rtcPeerConnectionMapForPublishers.get(userIndex).candidates,
                    }
                }));

                wsMap.get(userIndex).send(JSON.stringify({
                    type: EVENTS.SEND_ICE_CANDIDATE_COMPLETED,
                    data: {
                        feedId: feedId,
                        type: 'publisher',
                    }
                }));
            }
        };

        rtcPeerConnection.oniceconnectionstatechange = function(event) {
            if (rtcPeerConnectionMapForPublishers.get(userIndex).peer.iceConnectionState === 'completed') {
                rtcPeerConnectionMapForPublishers.get(userIndex).iceCompleted = true;
            }
        };

        const offer = await rtcPeerConnection.createOffer();
        await rtcPeerConnection.setLocalDescription(offer);

        wsMap.get(userIndex).send(JSON.stringify({
            type: EVENTS.SEND_OFFER_FOR_PUBLISHING,
            data: {
                feedId: feedId,
                jsep: offer
            }
        }));

        wsMap.get(userIndex).onmessage = function(event) {
            const message = JSON.parse(event.data);
            console.log('Received message:', message);

            if (message.type === EVENTS.RECEIVE_ANSWER_FOR_PUBLISHING) {
                console.log('Successfully sent offer for publishing');
                resolve(message.data);
            }
        };
    });
}

const setAnswerForPublishing = (userIndex, jsepAnswer) => {
    return new Promise(async (resolve, reject) => {
        console.log('setting answer for publishing', userIndex, jsepAnswer);

        const peer = rtcPeerConnectionMapForPublishers.get(userIndex)?.peer
        await peer.setRemoteDescription(jsepAnswer.jsep);

        resolve()
    });
}

const getPeersList = async () => {
    return new Promise((resolve, reject) => {
        wsMap.get(0).send(JSON.stringify({
            type: EVENTS.GET_PUBLISHER_LIST,
        }));

        wsMap.get(0).onmessage = function(event) {
            const message = JSON.parse(event.data);
            console.log('Received message:', message);

            if (message.type === EVENTS.PUBLISHER_LIST) {
                resolve(message.data);
            }
        };
    })

}

async function subscribeToPeers(userIndex, peers) {
    return new Promise((resolve, reject) => {
        const userFeedId = rtcPeerConnectionMapForPublishers.get(userIndex).feedId;
        const peersFiltered = peers.filter(p => p.id !== userFeedId && p.publisher === true);

        console.log({ userFeedId, peersFiltered })

        const subscriptionPromises = peersFiltered.map(peer => subscribeToPeerFeed(userIndex, peer.id))

        Promise.all(subscriptionPromises).then(() => {
            console.log(`user ${userIndex} has subscribed to all peers`)
            resolve()
        }).catch((error) => {
            console.error(`user ${userIndex} failed to subscribe to all peers`, error)
            reject()
        })
    })
}

async function subscribeToPeerFeed(userIndex, publisherFeedId) {
    return new Promise(async (resolve, reject) => {
        console.log('subscribing to publisher feed', userIndex, publisherFeedId);

        wsMap.get(userIndex).send(JSON.stringify({
            type: EVENTS.SUBSCRIBE_TO_USER_FEED,
            data: publisherFeedId
        }));

        wsMap.get(userIndex).onmessage = async function(event) {
            const message = JSON.parse(event.data);
            console.log('Received message:', message);

            if (message.type === EVENTS.SUBSCRIBED_TO_USER_FEED) {
                const rtcPeerConnection = new RTCPeerConnection();

                const feedId = message.data.feedId;

                rtcPeerConnection.ontrack = (event) => {
                    console.log("received publisher track", event.track);
                    createSubscriberVideo(userIndex, feedId, event.streams[0]);
                }

                await rtcPeerConnection.setRemoteDescription(message.data.jsep);

                const answer = await rtcPeerConnection.createAnswer()
                await rtcPeerConnection.setLocalDescription(answer)


                if (!rtcPeerConnectionMapForSubscribers.get(userIndex)) {
                    rtcPeerConnectionMapForSubscribers.set(userIndex, new Map())
                }

                rtcPeerConnectionMapForSubscribers.get(userIndex).set(feedId, {
                    peer: rtcPeerConnection,
                    candidates: [],
                    feedId: feedId,
                    iceCompleted: false
                })

                rtcPeerConnection.onicecandidate = function(event) {
                    console.log("recieved sub peer candidate")
                    if (event.candidate) {
                        rtcPeerConnectionMapForSubscribers.get(userIndex).get(feedId).candidates.push(event.candidate);
                    }
                    else {
                        rtcPeerConnectionMapForSubscribers.get(userIndex).get(feedId).iceCompleted = true;

                        candidatesMap.set(userIndex, rtcPeerConnectionMapForSubscribers.get(userIndex).get(feedId).iceCompleted);

                        wsMap.get(userIndex).send(JSON.stringify({
                            type: EVENTS.SEND_ICE_CANDIDATES,
                            data: {
                                feedId: feedId,
                                type: 'subscriber',
                                candidates: rtcPeerConnectionMapForSubscribers.get(userIndex).get(feedId).candidates,
                            }
                        }));

                        wsMap.get(userIndex).send(JSON.stringify({
                            type: EVENTS.SEND_ICE_CANDIDATE_COMPLETED,
                            data: {
                                feedId: feedId,
                                type: 'subscriber',
                            }
                        }));
                    }
                };

                rtcPeerConnection.oniceconnectionstatechange = function(event) {
                    if (rtcPeerConnectionMapForSubscribers.get(userIndex).get(feedId).peer.iceConnectionState === 'completed') {
                        rtcPeerConnectionMapForSubscribers.get(userIndex).get(feedId).iceCompleted = true;
                    }
                };


                wsMap.get(userIndex).send(JSON.stringify({
                    type: EVENTS.SEND_ANSWER_FOR_SUBSCRIBING,
                    data: {
                        feedId: feedId,
                        jsep: answer
                    }
                }));
                resolve()
            }
        };
    });

}

function updateStats() {
    document.getElementById('totalUsers').textContent = numUsers;
    document.getElementById('connectedUsers').textContent = connectedCount;
}

function showProgress() {
    document.getElementById('progressSection').style.display = 'block';
}

function setStepActive(stepNumber) {
    const step = document.getElementById(`step${stepNumber}`);
    if (step) {
        step.classList.add('active');
    }
}

function setStepCompleted(stepNumber) {
    const step = document.getElementById(`step${stepNumber}`);
    if (step) {
        step.classList.remove('active');
        step.classList.add('completed');
    }
}

function createPublisherVideo(userIndex, stream) {
    const publisherContainer = document.getElementById('publisherVideos');
    const videoItem = document.createElement('div');
    videoItem.className = 'video-item';
    videoItem.id = `pub-video-${userIndex}`;

    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;

    const label = document.createElement('div');
    label.className = 'video-label';
    label.textContent = `User ${userIndex}`;

    videoItem.appendChild(video);
    videoItem.appendChild(label);
    publisherContainer.appendChild(videoItem);
}

function createSubscriberVideo(userIndex, publisherFeedId, stream) {
    const subscriberContainer = document.getElementById('subscriberVideos');
    const videoId = `sub-video-${userIndex}-${publisherFeedId}`;

    // Check if video already exists
    const existingVideoItem = document.getElementById(videoId);
    if (existingVideoItem) {
        console.log(`Subscriber video ${videoId} already exists, updating stream`);
        const existingVideo = existingVideoItem.querySelector('video');
        if (existingVideo) {
            existingVideo.srcObject = stream;
        }
        return;
    }

    const videoItem = document.createElement('div');
    videoItem.className = 'video-item';
    videoItem.id = videoId;

    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;

    const label = document.createElement('div');
    label.className = 'video-label';
    label.textContent = `U${userIndex}→P${publisherFeedId}`;

    videoItem.appendChild(video);
    videoItem.appendChild(label);
    subscriberContainer.appendChild(videoItem);

    updateSubscriberCount();
}

function setupToggleSubscriberButton() {
    const toggleBtn = document.getElementById('toggleSubscriberBtn');
    const subscriberVideos = document.getElementById('subscriberVideos');

    if (toggleBtn && subscriberVideos) {
        toggleBtn.addEventListener('click', () => {
            if (subscriberVideos.style.display === 'none') {
                subscriberVideos.style.display = 'grid';
                toggleBtn.textContent = 'Hide';
            } else {
                subscriberVideos.style.display = 'none';
                toggleBtn.textContent = 'Show';
            }
        });
    }
}

function updateSubscriberCount() {
    const subscriberVideos = document.getElementById('subscriberVideos');
    const subscriberCount = document.getElementById('subscriberCount');

    if (subscriberVideos && subscriberCount) {
        const count = subscriberVideos.querySelectorAll('.video-item').length;
        subscriberCount.textContent = `(${count})`;
    }
}
