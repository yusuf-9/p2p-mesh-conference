// Web Worker for handling subscriber stream processing
let rtcPeerConnection = null;
let feedId = null;
let userIndex = null;

self.onmessage = function(event) {
    const { type, data } = event.data;
    
    switch (type) {
        case 'init':
            init(data);
            break;
        case 'setRemoteDescription':
            setRemoteDescription(data.jsep);
            break;
        case 'createAnswer':
            createAnswer();
            break;
        case 'addIceCandidate':
            addIceCandidate(data.candidate);
            break;
        case 'close':
            cleanup();
            break;
        default:
            console.warn('Unknown worker message type:', type);
    }
};

function init({ userIndex: ui, feedId: fid }) {
    userIndex = ui;
    feedId = fid;
    
    rtcPeerConnection = new RTCPeerConnection();
    
    rtcPeerConnection.ontrack = (event) => {
        console.log(`Worker ${userIndex}-${feedId}: received track`);
        
        // Send stream back to main thread
        self.postMessage({
            type: 'trackReceived',
            data: {
                userIndex,
                feedId,
                // Note: streams cannot be transferred directly, we'll handle this differently
                trackInfo: {
                    kind: event.track.kind,
                    id: event.track.id,
                    label: event.track.label
                }
            }
        });
    };
    
    rtcPeerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            self.postMessage({
                type: 'iceCandidate',
                data: {
                    userIndex,
                    feedId,
                    candidate: event.candidate
                }
            });
        } else {
            self.postMessage({
                type: 'iceCandidatesComplete',
                data: {
                    userIndex,
                    feedId
                }
            });
        }
    };
    
    rtcPeerConnection.oniceconnectionstatechange = () => {
        self.postMessage({
            type: 'iceConnectionStateChange',
            data: {
                userIndex,
                feedId,
                state: rtcPeerConnection.iceConnectionState
            }
        });
    };
    
    self.postMessage({
        type: 'initialized',
        data: { userIndex, feedId }
    });
}

async function setRemoteDescription(jsep) {
    try {
        await rtcPeerConnection.setRemoteDescription(jsep);
        self.postMessage({
            type: 'remoteDescriptionSet',
            data: { userIndex, feedId }
        });
    } catch (error) {
        self.postMessage({
            type: 'error',
            data: {
                userIndex,
                feedId,
                error: error.message
            }
        });
    }
}

async function createAnswer() {
    try {
        const answer = await rtcPeerConnection.createAnswer();
        await rtcPeerConnection.setLocalDescription(answer);
        
        self.postMessage({
            type: 'answerCreated',
            data: {
                userIndex,
                feedId,
                answer
            }
        });
    } catch (error) {
        self.postMessage({
            type: 'error',
            data: {
                userIndex,
                feedId,
                error: error.message
            }
        });
    }
}

function addIceCandidate(candidate) {
    if (rtcPeerConnection && candidate) {
        rtcPeerConnection.addIceCandidate(candidate).catch(error => {
            self.postMessage({
                type: 'error',
                data: {
                    userIndex,
                    feedId,
                    error: `Failed to add ICE candidate: ${error.message}`
                }
            });
        });
    }
}

function cleanup() {
    if (rtcPeerConnection) {
        rtcPeerConnection.close();
        rtcPeerConnection = null;
    }
    
    self.postMessage({
        type: 'cleanedUp',
        data: { userIndex, feedId }
    });
}