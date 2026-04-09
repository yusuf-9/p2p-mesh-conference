import { EVENTS } from '../constants';
import useStore from '../../../store';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

/**
 * P2P Mesh Manager
 * Handles peer-to-peer WebRTC connections in a full-mesh topology.
 *
 * Signaling flow:
 *   - Joiner initiates offers to all peers already in the call (via initiateCallConnections)
 *   - Peers already in the call wait for offers and respond with answers
 *   - ICE candidates are trickled as they become available
 *   - onnegotiationneeded handles future renegotiations (e.g. track changes)
 */
class P2PMeshManager {
  constructor(webSocket) {
    this.webSocket = webSocket;
    this.localStream = null;
    this.peerConnections = new Map(); // userId -> RTCPeerConnection
    this.isInitiator = new Map();     // userId -> boolean
    console.log('🔗 P2PMeshManager initialized');
  }

  /**
   * Store the local MediaStream (obtained by the caller before joining).
   */
  setLocalStream(stream) {
    this.localStream = stream;
  }

  /**
   * Called after JOINED_CALL — initiate peer connections to every user already in call.
   * @param {string[]} userIds
   */
  initiateCallConnections(userIds) {
    for (const userId of userIds) {
      this.initiatePeerConnection(userId);
    }
  }

  /**
   * Route incoming WebSocket messages related to P2P signaling.
   * Returns true if the message was handled.
   */
  handleMessage(message) {
    const { type, data } = message;
    switch (type) {
      case EVENTS.RECEIVE_WEBRTC_OFFER_FOR_VIDEO_CALL:
        this.handlePeerOffer(data);
        return true;
      case EVENTS.RECEIVE_WEBRTC_ANSWER_FOR_VIDEO_CALL:
        this.handlePeerAnswer(data);
        return true;
      case EVENTS.RECEIVE_WEBRTC_ICE_CANDIDATE_FOR_VIDEO_CALL:
        this.handlePeerIceCandidate(data);
        return true;
      default:
        return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Peer connection lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Create a new RTCPeerConnection to userId and send an offer.
   * Adding local tracks triggers onnegotiationneeded which creates and sends the offer.
   */
  async initiatePeerConnection(userId) {
    if (this.peerConnections.has(userId)) {
      console.warn(`Peer connection to ${userId} already exists, skipping`);
      return;
    }
    console.log(`🤝 Initiating peer connection to: ${userId}`);

    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.peerConnections.set(userId, pc);
    this.isInitiator.set(userId, true);

    this._setupPcHandlers(pc, userId);

    // Adding tracks fires onnegotiationneeded, which creates and sends the offer
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream));
    }
  }

  /**
   * Handle an incoming offer from a peer.
   * Creates a peer connection, adds local tracks, sets remote desc, sends answer.
   */
  async handlePeerOffer(data) {
    const { from, offer } = data;
    console.log(`📥 Received offer from: ${from}`);

    // If we already have a connection, close and recreate (e.g. renegotiation restart)
    if (this.peerConnections.has(from)) {
      this.peerConnections.get(from).close();
      this.peerConnections.delete(from);
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.peerConnections.set(from, pc);
    this.isInitiator.set(from, false);

    this._setupPcHandlers(pc, from);

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream));
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const { user } = useStore.getState();
      this.sendMessage(EVENTS.SEND_WEBRTC_ANSWER_FOR_VIDEO_CALL, {
        to: from,
        roomId: user.roomId,
        answer: pc.localDescription,
      });
      console.log(`📤 Sent answer to: ${from}`);
    } catch (err) {
      console.error(`Failed to handle offer from ${from}:`, err);
    }
  }

  async handlePeerAnswer(data) {
    const { from, answer } = data;
    const pc = this.peerConnections.get(from);
    if (!pc) {
      console.warn(`No peer connection for answer from ${from}`);
      return;
    }
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      console.log(`✅ Set remote description (answer) from: ${from}`);
    } catch (err) {
      console.error(`Failed to handle answer from ${from}:`, err);
    }
  }

  async handlePeerIceCandidate(data) {
    const { from, candidate } = data;
    const pc = this.peerConnections.get(from);
    if (!pc) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn(`Failed to add ICE candidate from ${from}:`, err);
    }
  }

  // ---------------------------------------------------------------------------
  // Shared peer connection setup
  // ---------------------------------------------------------------------------

  _setupPcHandlers(pc, userId) {
    // onnegotiationneeded — fires when tracks are added or renegotiation is needed.
    // Only the initiator side sends offers to avoid glare.
    pc.onnegotiationneeded = async () => {
      if (!this.isInitiator.get(userId)) return;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const { user } = useStore.getState();
        this.sendMessage(EVENTS.SEND_WEBRTC_OFFER_FOR_VIDEO_CALL, {
          to: userId,
          roomId: user.roomId,
          offer: pc.localDescription,
        });
        console.log(`📤 Sent offer to: ${userId}`);
      } catch (err) {
        console.error(`onnegotiationneeded error with ${userId}:`, err);
      }
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      const { user } = useStore.getState();
      this.sendMessage(EVENTS.SEND_WEBRTC_ICE_CANDIDATE_FOR_VIDEO_CALL, {
        to: userId,
        roomId: user.roomId,
        candidate: event.candidate,
      });
    };

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (!remoteStream) return;
      console.log(`📺 Got remote track from: ${userId}`);

      const store = useStore.getState();
      // Find the camera handle for this user and attach the MediaStream to it
      const handle = store.remoteStreams.find(
        s => s.userId === userId && s.feedType === 'camera'
      );
      if (handle) {
        store.updateRemoteStream(handle.id, { stream: remoteStream });
      } else {
        console.warn(`No remote stream handle found for user ${userId}`);
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log(`Connection state with ${userId}: ${state}`);
      if (state === 'failed') {
        console.warn(`Connection to ${userId} failed — attempting ICE restart`);
        pc.restartIce();
      }
    };
  }

  // ---------------------------------------------------------------------------
  // Leave / cleanup
  // ---------------------------------------------------------------------------

  leaveCall() {
    this.peerConnections.forEach(pc => pc.close());
    this.peerConnections.clear();
    this.isInitiator.clear();

    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }

    useStore.getState().clearAllStreams();
    useStore.getState().updateCallState({
      isInCall: false,
      joinRequestState: { isLoading: false, error: null },
    });
  }

  // ---------------------------------------------------------------------------
  // Media controls
  // ---------------------------------------------------------------------------

  toggleAudio() {
    const track = this.localStream?.getAudioTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    useStore.getState().updateCallState({ isAudioEnabled: track.enabled });
    return track.enabled;
  }

  toggleVideo() {
    const track = this.localStream?.getVideoTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    useStore.getState().updateCallState({ isVideoEnabled: track.enabled });
    return track.enabled;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  sendMessage(type, data) {
    if (this.webSocket?.readyState === WebSocket.OPEN) {
      this.webSocket.send(JSON.stringify({ type, data }));
      return true;
    }
    console.error('WebSocket not open, cannot send:', type);
    return false;
  }

  cleanup() {
    this.leaveCall();
  }
}

export default P2PMeshManager;
