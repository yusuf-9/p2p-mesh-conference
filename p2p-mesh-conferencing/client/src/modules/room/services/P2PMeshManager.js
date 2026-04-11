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
 * Each pair of users has TWO peer connections:
 *   - Camera PC  (peerConnections map)        — carries audio + camera video
 *   - Screen PC  (screenSharePeerConnections)  — carries screen share video only
 *
 * Camera signaling:  SEND/RECEIVE_WEBRTC_*_FOR_VIDEO_CALL
 * Screen signaling:  SEND/RECEIVE_WEBRTC_*_FOR_SCREEN_SHARE
 *
 * The user who joins initiates camera offers to everyone already in call.
 * The user who starts screen sharing initiates screen share offers to everyone in call.
 * New users who join mid-screenshare get a screen share offer from the sharer.
 */
class P2PMeshManager {
  constructor(webSocket) {
    this.webSocket = webSocket;
    this.localStream = null;
    this.screenShareStream = null;

    // Camera peer connections
    this.peerConnections = new Map();   // userId -> RTCPeerConnection
    this.isInitiator = new Map();        // userId -> boolean

    // Screen share peer connections (separate from camera)
    this.screenSharePeerConnections = new Map(); // userId -> RTCPeerConnection

    console.log('🔗 P2PMeshManager initialized');
  }

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------

  setLocalStream(stream) {
    this.localStream = stream;
  }

  /** Called after JOINED_CALL — initiate camera connections to existing peers. */
  initiateCallConnections(userIds) {
    for (const userId of userIds) {
      this.initiatePeerConnection(userId);
    }
  }

  // ---------------------------------------------------------------------------
  // Message routing
  // ---------------------------------------------------------------------------

  handleMessage(message) {
    const { type, data } = message;
    switch (type) {
      // Camera signaling
      case EVENTS.RECEIVE_WEBRTC_OFFER_FOR_VIDEO_CALL:
        this.handlePeerOffer(data);
        return true;
      case EVENTS.RECEIVE_WEBRTC_ANSWER_FOR_VIDEO_CALL:
        this.handlePeerAnswer(data);
        return true;
      case EVENTS.RECEIVE_WEBRTC_ICE_CANDIDATE_FOR_VIDEO_CALL:
        this.handlePeerIceCandidate(data);
        return true;

      // Screen share signaling
      case EVENTS.RECEIVE_WEBRTC_OFFER_FOR_SCREEN_SHARE:
        this.handleScreenShareOffer(data);
        return true;
      case EVENTS.RECEIVE_WEBRTC_ANSWER_FOR_SCREEN_SHARE:
        this.handleScreenShareAnswer(data);
        return true;
      case EVENTS.RECEIVE_WEBRTC_ICE_CANDIDATE_FOR_SCREEN_SHARE:
        this.handleScreenShareIceCandidate(data);
        return true;

      default:
        return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Camera peer connection lifecycle
  // ---------------------------------------------------------------------------

  async initiatePeerConnection(userId) {
    if (this.peerConnections.has(userId)) {
      console.warn(`Camera PC to ${userId} already exists, skipping`);
      return;
    }
    console.log(`🤝 Initiating camera PC to: ${userId}`);

    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.peerConnections.set(userId, pc);
    this.isInitiator.set(userId, true);
    useStore.getState().upsertPeerConnectionState(userId, 'camera', 'new');

    this._setupCameraPcHandlers(pc, userId);

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream));
    }
    // onnegotiationneeded fires from addTrack and sends the offer
  }

  async handlePeerOffer(data) {
    const { from, offer } = data;
    console.log(`📥 Received camera offer from: ${from}`);

    if (this.peerConnections.has(from)) {
      this.peerConnections.get(from).close();
      this.peerConnections.delete(from);
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.peerConnections.set(from, pc);
    this.isInitiator.set(from, false);
    useStore.getState().upsertPeerConnectionState(from, 'camera', 'new');

    this._setupCameraPcHandlers(pc, from);

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
    } catch (err) {
      console.error(`Failed to handle camera offer from ${from}:`, err);
    }
  }

  async handlePeerAnswer(data) {
    const { from, answer } = data;
    const pc = this.peerConnections.get(from);
    if (!pc) return;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
      console.error(`Failed to set camera answer from ${from}:`, err);
    }
  }

  async handlePeerIceCandidate(data) {
    const { from, candidate } = data;
    const pc = this.peerConnections.get(from);
    if (!pc) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn(`Failed to add camera ICE from ${from}:`, err);
    }
  }

  _setupCameraPcHandlers(pc, userId) {
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
        console.log(`📤 Sent camera offer to: ${userId}`);
      } catch (err) {
        console.error(`Camera onnegotiationneeded error with ${userId}:`, err);
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
      const store = useStore.getState();
      const handle = store.remoteStreams.find(
        s => s.userId === userId && s.feedType === 'camera'
      );
      if (handle) {
        store.updateRemoteStream(handle.id, { stream: remoteStream });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      useStore.getState().upsertPeerConnectionState(userId, 'camera', state);
      if (state === 'failed') pc.restartIce();
    };
  }

  // ---------------------------------------------------------------------------
  // Screen share peer connection lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Get display media then open a dedicated screen share PC to each current peer.
   * Called by the user who is starting the share.
   */
  async startScreenShare() {
    if (this.screenShareStream) return this.screenShareStream;

    this.screenShareStream = await navigator.mediaDevices.getDisplayMedia({ video: true });

    for (const userId of this.peerConnections.keys()) {
      await this.initiateScreenShareConnection(userId);
    }

    return this.screenShareStream;
  }

  /**
   * Open a screen share PC to one specific peer (sharer-side, initiator).
   * Also called when a new user joins while we are already sharing.
   */
  async initiateScreenShareConnection(userId) {
    if (this.screenSharePeerConnections.has(userId)) return;
    if (!this.screenShareStream) return;

    console.log(`🖥️ Initiating screen share PC to: ${userId}`);

    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.screenSharePeerConnections.set(userId, pc);
    useStore.getState().upsertPeerConnectionState(userId, 'screenshare', 'new');

    this._setupScreenSharePcHandlers(pc, userId, true);

    // Adding the track triggers onnegotiationneeded → creates and sends the offer
    this.screenShareStream.getVideoTracks().forEach(track =>
      pc.addTrack(track, this.screenShareStream)
    );
  }

  /** Receiver-side: handle an incoming screen share offer. */
  async handleScreenShareOffer(data) {
    const { from, offer } = data;
    console.log(`📥 Received screen share offer from: ${from}`);

    if (this.screenSharePeerConnections.has(from)) {
      this.screenSharePeerConnections.get(from).close();
      this.screenSharePeerConnections.delete(from);
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.screenSharePeerConnections.set(from, pc);
    useStore.getState().upsertPeerConnectionState(from, 'screenshare', 'new');

    this._setupScreenSharePcHandlers(pc, from, false);

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const { user } = useStore.getState();
      this.sendMessage(EVENTS.SEND_WEBRTC_ANSWER_FOR_SCREEN_SHARE, {
        to: from,
        roomId: user.roomId,
        answer: pc.localDescription,
      });
    } catch (err) {
      console.error(`Failed to handle screen share offer from ${from}:`, err);
    }
  }

  async handleScreenShareAnswer(data) {
    const { from, answer } = data;
    const pc = this.screenSharePeerConnections.get(from);
    if (!pc) return;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
      console.error(`Failed to set screen share answer from ${from}:`, err);
    }
  }

  async handleScreenShareIceCandidate(data) {
    const { from, candidate } = data;
    const pc = this.screenSharePeerConnections.get(from);
    if (!pc) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn(`Failed to add screen share ICE from ${from}:`, err);
    }
  }

  _setupScreenSharePcHandlers(pc, userId, isInitiator) {
    pc.onnegotiationneeded = async () => {
      if (!isInitiator) return;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const { user } = useStore.getState();
        this.sendMessage(EVENTS.SEND_WEBRTC_OFFER_FOR_SCREEN_SHARE, {
          to: userId,
          roomId: user.roomId,
          offer: pc.localDescription,
        });
        console.log(`📤 Sent screen share offer to: ${userId}`);
      } catch (err) {
        console.error(`Screen share onnegotiationneeded error with ${userId}:`, err);
      }
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      const { user } = useStore.getState();
      this.sendMessage(EVENTS.SEND_WEBRTC_ICE_CANDIDATE_FOR_SCREEN_SHARE, {
        to: userId,
        roomId: user.roomId,
        candidate: event.candidate,
      });
    };

    // Only the receiving side fires ontrack
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (!remoteStream) return;
      console.log(`🖥️ Got screen share track from: ${userId}`);

      const store = useStore.getState();
      const handle = store.remoteStreams.find(
        s => s.userId === userId && s.feedType === 'screenshare'
      );
      if (handle) {
        store.updateRemoteStream(handle.id, { stream: remoteStream });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      useStore.getState().upsertPeerConnectionState(userId, 'screenshare', state);
      if (state === 'failed') pc.restartIce();
    };
  }

  /** Close and remove screen share PC for a specific peer (e.g. they left). */
  closeScreenShareConnection(userId) {
    const pc = this.screenSharePeerConnections.get(userId);
    if (pc) {
      pc.close();
      this.screenSharePeerConnections.delete(userId);
      useStore.getState().removePeerConnectionState(userId, 'screenshare');
    }
  }

  async stopScreenShare() {
    this.screenSharePeerConnections.forEach(pc => pc.close());
    this.screenSharePeerConnections.clear();

    if (this.screenShareStream) {
      this.screenShareStream.getTracks().forEach(t => t.stop());
      this.screenShareStream = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Leave / cleanup
  // ---------------------------------------------------------------------------

  leaveCall() {
    this.peerConnections.forEach(pc => pc.close());
    this.peerConnections.clear();
    this.isInitiator.clear();

    this.screenSharePeerConnections.forEach(pc => pc.close());
    this.screenSharePeerConnections.clear();

    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }

    if (this.screenShareStream) {
      this.screenShareStream.getTracks().forEach(t => t.stop());
      this.screenShareStream = null;
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
    if (!track) return null;
    track.enabled = !track.enabled;
    return track.enabled;
  }

  toggleVideo() {
    const track = this.localStream?.getVideoTracks()[0];
    if (!track) return null;
    track.enabled = !track.enabled;
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
