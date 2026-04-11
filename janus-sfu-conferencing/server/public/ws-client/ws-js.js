
let socket = null;
let connectionLog = [];

// WebRTC variables
let localStream = null;
let publisherPC = null;
let subscriberPC = null;
let collectedIceCandidates = [];
let currentFeedId = null;

// ============================================================================
// 🎚️ SIMULCAST CONFIGURATION - Easy Testing Configuration
// ============================================================================
// Change this to enable/disable simulcast for testing:
let ENABLE_SIMULCAST = true;  // Set to false to disable simulcast globally

// Simulcast monitoring
let simulcastMonitors = new Map(); // feedId -> interval
let videoTransceiver = null; // Store reference to video transceiver for simulcast control

// Cache user's simulcast choices from join-conference-as-publisher
let cachedSimulcastEnabled = false;
let cachedSimulcastResolutions = null;

// Cache keys for localStorage
const CACHE_KEYS = {
  SERVER_URL: 'ws_client_server_url',
  API_KEY: 'ws_client_api_key',
  AUTH_TOKEN: 'ws_client_auth_token'
};

// Load cached values and populate form fields
function loadCachedValues() {
  const serverUrlField = document.getElementById("serverUrl");
  const apiKeyField = document.getElementById("apiKey");
  const authTokenField = document.getElementById("authToken");

  // Load cached values if they exist
  const cachedServerUrl = localStorage.getItem(CACHE_KEYS.SERVER_URL);
  const cachedApiKey = localStorage.getItem(CACHE_KEYS.API_KEY);
  const cachedAuthToken = localStorage.getItem(CACHE_KEYS.AUTH_TOKEN);

  let loadedCount = 0;
  
  if (cachedServerUrl && serverUrlField) {
    serverUrlField.value = cachedServerUrl;
    loadedCount++;
  }
  if (cachedApiKey && apiKeyField) {
    apiKeyField.value = cachedApiKey;
    loadedCount++;
  }
  if (cachedAuthToken && authTokenField) {
    authTokenField.value = cachedAuthToken;
    loadedCount++;
  }

  if (loadedCount > 0) {
    console.log(`Loaded ${loadedCount} cached connection values`);
    // Show a subtle notification if connection log exists
    const connectionLog = document.getElementById("connectionLog");
    if (connectionLog) {
      addToLog("connectionLog", `📋 Loaded ${loadedCount} cached values (URL, API key, token)`, "info");
    }
  }
}

// Save current form values to localStorage
function saveCachedValues() {
  const serverUrl = document.getElementById("serverUrl").value;
  const apiKey = document.getElementById("apiKey").value;
  const authToken = document.getElementById("authToken").value;

  if (serverUrl) {
    localStorage.setItem(CACHE_KEYS.SERVER_URL, serverUrl);
  }
  if (apiKey) {
    localStorage.setItem(CACHE_KEYS.API_KEY, apiKey);
  }
  if (authToken) {
    localStorage.setItem(CACHE_KEYS.AUTH_TOKEN, authToken);
  }

  console.log("Saved connection values to cache");
}

// Clear cached values
function clearCachedValues() {
  localStorage.removeItem(CACHE_KEYS.SERVER_URL);
  localStorage.removeItem(CACHE_KEYS.API_KEY);
  localStorage.removeItem(CACHE_KEYS.AUTH_TOKEN);
  
  // Clear form fields too
  const serverUrlField = document.getElementById("serverUrl");
  const apiKeyField = document.getElementById("apiKey");
  const authTokenField = document.getElementById("authToken");
  
  if (serverUrlField) serverUrlField.value = "";
  if (apiKeyField) apiKeyField.value = "";
  if (authTokenField) authTokenField.value = "";
  
  console.log("Cleared cached connection values");
  
  // Show feedback
  const connectionLog = document.getElementById("connectionLog");
  if (connectionLog) {
    addToLog("connectionLog", "🗑️ Cleared cached connection values", "info");
  }
}

// UI Functions
function toggleEndpoint(header) {
  const details = header.nextElementSibling;
  const icon = header.querySelector(".expand-icon");

  if (details.classList.contains("expanded")) {
    details.classList.remove("expanded");
    icon.classList.remove("expanded");
  } else {
    details.classList.add("expanded");
    icon.classList.add("expanded");
  }
}

// Make functions globally available
window.toggleEndpoint = toggleEndpoint;

function updateConnectionStatus(connected) {
  const indicator = document.getElementById("statusIndicator");
  const status = document.getElementById("connectionStatus");
  const connectBtn = document.getElementById("connectBtn");
  const disconnectBtn = document.getElementById("disconnectBtn");

  if (connected) {
    indicator.classList.add("connected");
    status.textContent = "Connected";
    connectBtn.disabled = true;
    disconnectBtn.disabled = false;
  } else {
    indicator.classList.remove("connected");
    status.textContent = "Disconnected";
    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
  }
}

function addToLog(logId, message, type = "info") {
  const logElement = document.getElementById(logId);
  const timestamp = new Date().toLocaleTimeString();
  const entry = document.createElement("div");
  entry.className = `log-entry log-${type}`;
  entry.innerHTML = `
                <div class="timestamp">${timestamp}</div>
                <div>${message}</div>
            `;
  logElement.appendChild(entry);
  logElement.scrollTop = logElement.scrollHeight;
}

function clearLog(logId) {
  document.getElementById(logId).innerHTML = "";
}

// WebSocket Functions
function connect() {
  console.log("called connect")
  const serverUrl = document.getElementById("serverUrl").value;
  const apiKey = document.getElementById("apiKey").value;
  const authToken = document.getElementById("authToken").value;

  if (!serverUrl || !apiKey || !authToken) {
    addToLog("connectionLog", "Please fill in all connection fields", "error");
    return;
  }

  try {
    socket = new WebSocket(serverUrl, {
      headers: {
        "x-api-key": apiKey,
        authorization: `Bearer ${authToken}`,
      },
    });

    socket.onopen = function(event) {
      updateConnectionStatus(true);
      addToLog("connectionLog", "WebSocket connection established", "received");
    };

    socket.onmessage = function(event) {
      try {
        const data = JSON.parse(event.data);
        addToLog("connectionLog", `Received: ${JSON.stringify(data, null, 2)}`, "received");
        handleServerMessage(data);
      } catch (e) {
        addToLog("connectionLog", `Received: ${event.data}`, "received");
      }
    };

    socket.onclose = function(event) {
      updateConnectionStatus(false);
      addToLog("connectionLog", `Connection closed: ${event.code} ${event.reason}`, "error");
    };

    socket.onerror = function(error) {
      addToLog("connectionLog", `Connection error: ${error.message || "Unknown error"}`, "error");
    };
  } catch (error) {
    addToLog("connectionLog", `Failed to connect: ${error.message}`, "error");
  }
}

function disconnect() {
  if (socket) {
    socket.close();
    socket = null;
  }
}

function sendMessage(type, data) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    addToLog("connectionLog", "Not connected to WebSocket", "error");
    return;
  }

  const message = { type, ...data };
  const messageStr = JSON.stringify(message);

  try {
    socket.send(messageStr);
    addToLog("connectionLog", `Sent: ${messageStr}`, "sent");
  } catch (error) {
    addToLog("connectionLog", `Failed to send: ${error.message}`, "error");
  }
}

function sendMessageWithData(type, inputId) {
  const data = document.getElementById(inputId).value;
  if (!data.trim()) {
    addToLog("connectionLog", "Please enter message data", "error");
    return;
  }
  sendMessage(type, { data: data.trim() });
}

function sendMessageWithInput(type, inputId) {
  const data = document.getElementById(inputId).value;
  if (!data.trim()) {
    addToLog("connectionLog", "Please enter required data", "error");
    return;
  }
  sendMessage(type, { data: data.trim() });
}

function sendMessageWithJsonData(type, inputId) {
  const jsonStr = document.getElementById(inputId).value;
  if (!jsonStr.trim()) {
    addToLog("connectionLog", "Please enter JSON data", "error");
    return;
  }

  try {
    const data = JSON.parse(jsonStr);
    sendMessage(type, { data });
  } catch (error) {
    addToLog("connectionLog", `Invalid JSON: ${error.message}`, "error");
  }
}

function sendToggleMediaStream() {
  const feedId = parseInt(document.getElementById("toggleFeedId").value);
  const video = document.getElementById("videoEnabled").checked;
  const audio = document.getElementById("audioEnabled").checked;

  if (!feedId) {
    addToLog("connectionLog", "Please join as publisher first to get feed ID", "error");
    return;
  }

  // Toggle local stream tracks
  if (localStream) {
    const videoTracks = localStream.getVideoTracks();
    const audioTracks = localStream.getAudioTracks();
    
    videoTracks.forEach(track => {
      track.enabled = video;
    });
    
    audioTracks.forEach(track => {
      track.enabled = audio;
    });
    
    // Update local video visibility for visual feedback
    const localVideo = document.getElementById("localVideo");
    if (localVideo) {
      localVideo.style.opacity = video ? "1" : "0.3";
      if (!video) {
        localVideo.style.background = "#333";
      } else {
        localVideo.style.background = "transparent";
      }
    }
    
    addToLog("connectionLog", `Local tracks toggled: video=${video}, audio=${audio}`, "info");
  }

  // Send message to server
  sendMessage("toggle-media-stream", { 
    data: { 
      video, 
      audio, 
      feedId 
    } 
  });
  
  addToLog("connectionLog", `Sent toggle media stream: video=${video}, audio=${audio}, feedId=${feedId}`, "sent");
}

function sendUnpublishFeed() {
  const feedId = parseInt(document.getElementById("unpublishFeedId").value);

  if (!feedId) {
    addToLog("connectionLog", "Please enter Feed ID to unpublish", "error");
    return;
  }

  // Send message to server
  sendMessage("unpublish-feed", { 
    data: { 
      feedId 
    } 
  });
  
  addToLog("connectionLog", `Sent unpublish feed request for feedId=${feedId}`, "sent");
}

function sendOfferForPublishing() {
  const feedId = parseInt(document.getElementById("offerFeedId").value);
  const jsepStr = document.getElementById("offerJsepData").value;

  if (!feedId) {
    addToLog("connectionLog", "Please enter Feed ID", "error");
    return;
  }

  if (!jsepStr.trim()) {
    addToLog("connectionLog", "Please enter WebRTC offer JSON", "error");
    return;
  }

  try {
    const jsep = JSON.parse(jsepStr);
    sendMessage("send-offer-for-publishing", { data: { feedId, jsep } });
  } catch (error) {
    addToLog("connectionLog", `Invalid JSEP JSON: ${error.message}`, "error");
  }
}

function sendIceCandidates() {
  const type = document.getElementById("iceCandidateType").value;
  const feedId = parseInt(document.getElementById("iceFeedId").value);
  const candidatesStr = document.getElementById("iceCandidatesData").value;

  if (!feedId) {
    addToLog("connectionLog", "Please enter Feed ID", "error");
    return;
  }

  if (!candidatesStr.trim()) {
    addToLog("connectionLog", "Please enter ICE candidates JSON", "error");
    return;
  }

  try {
    const candidates = JSON.parse(candidatesStr);
    sendMessage("send-ice-candidates", { data: { type, feedId, candidates } });
  } catch (error) {
    addToLog("connectionLog", `Invalid candidates JSON: ${error.message}`, "error");
  }
}

function sendIceCandidateCompleted() {
  const type = document.getElementById("iceCompletedType").value;
  const feedId = parseInt(document.getElementById("iceCompletedFeedId").value);

  if (!feedId) {
    addToLog("connectionLog", "Please enter Feed ID", "error");
    return;
  }

  sendMessage("send-ice-candidate-completed", { data: { type, feedId } });
}

// WebRTC Functions
async function startFeed() {
  try {
    const feedType = document.getElementById("publishFeedType").value;
    let mediaStream;

    if (feedType === "screenshare") {
      mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });
      addToLog("connectionLog", "Screen sharing access granted", "received");
    } else {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      addToLog("connectionLog", "Camera and microphone access granted", "received");
    }

    localStream = mediaStream;
    const localVideo = document.getElementById("localVideo");
    localVideo.srcObject = localStream;
    localVideo.style.display = "block";

    document.getElementById("startFeedBtn").disabled = true;
    document.getElementById("stopFeedBtn").disabled = false;
    document.getElementById("generateOfferBtn").disabled = false;
  } catch (error) {
    const feedType = document.getElementById("publishFeedType").value;
    const feedLabel = feedType === "screenshare" ? "screen sharing" : "camera";
    addToLog("connectionLog", `Failed to access ${feedLabel}: ${error.message}`, "error");
  }
}

function stopFeed() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  const localVideo = document.getElementById("localVideo");
  localVideo.srcObject = null;
  localVideo.style.display = "none";

  document.getElementById("startFeedBtn").disabled = false;
  document.getElementById("stopFeedBtn").disabled = true;
  document.getElementById("generateOfferBtn").disabled = true;

  // Disable toggle media button when feed is stopped
  const toggleMediaBtn = document.getElementById("toggleMediaBtn");
  if (toggleMediaBtn) {
    toggleMediaBtn.disabled = true;
  }

  // Reset toggle feed ID
  const toggleFeedIdField = document.getElementById("toggleFeedId");
  if (toggleFeedIdField) {
    toggleFeedIdField.value = "";
  }

  // Clean up peer connections
  if (publisherPC) {
    publisherPC.close();
    publisherPC = null;
  }

  addToLog("connectionLog", "Feed stopped and connections closed", "info");
}

function createPeerConnection(type) {
  console.log("creating publisher peer")
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' }
    ]
  });

  // Handle ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log("received ice candidate")

      // Extract only the serializable properties for Janus
      const candidateData = {
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid,
        sdpMLineIndex: event.candidate.sdpMLineIndex
      };

      collectedIceCandidates.push(candidateData);

      addToLog("connectionLog", `ICE candidate collected: ${event.candidate.candidate.substring(0, 50)}...`, "info");
      const sendIceCandidatesBtn = document.getElementById("sendIceCandidatesBtn");
      if (sendIceCandidatesBtn) {
        sendIceCandidatesBtn.disabled = false;
      }
    } else {
      addToLog("connectionLog", "ICE gathering completed", "info");
      const sendIceCompletedBtn = document.getElementById("sendIceCompletedBtn");
      if (sendIceCompletedBtn) {
        sendIceCompletedBtn.disabled = false;
      }
    }
  };

  pc.onconnectionstatechange = () => {
    addToLog("connectionLog", `${type} connection state: ${pc.connectionState}`, "info");
  };

  return pc;
}

async function generateAndSendOffer() {
  const feedId = parseInt(document.getElementById("offerFeedId").value);

  if (!feedId) {
    addToLog("connectionLog", "Please enter Feed ID", "error");
    return;
  }

  if (!localStream) {
    addToLog("connectionLog", "Please start feed first", "error");
    return;
  }

  try {
    // Create publisher peer connection
    publisherPC = createPeerConnection("publisher");

    // Add local stream to peer connection with simulcast support based on cached user choice
    const useSimulcast = cachedSimulcastEnabled && ENABLE_SIMULCAST; // Respect both user choice and global override
    console.log(`🎚️ SIMULCAST MODE: ${useSimulcast ? 'ENABLED' : 'DISABLED'} (user choice: ${cachedSimulcastEnabled}, global: ${ENABLE_SIMULCAST})`);
    addToLog("connectionLog", `SIMULCAST MODE: ${useSimulcast ? 'ENABLED' : 'DISABLED'} (user choice: ${cachedSimulcastEnabled}, global: ${ENABLE_SIMULCAST})`, "info");
    
    if (useSimulcast) {
      addTracksWithSimulcast(publisherPC, localStream);
    } else {
      addTracksWithoutSimulcast(publisherPC, localStream);
    }

    // Create offer
    const offer = await publisherPC.createOffer();
    await publisherPC.setLocalDescription(offer);

    currentFeedId = feedId;
    collectedIceCandidates = []; // Reset candidates for this session

    // Send offer to server
    sendMessage("send-offer-for-publishing", {
      data: {
        feedId,
        jsep: {
          type: offer.type,
          sdp: offer.sdp
        }
      }
    });

    addToLog("connectionLog", `Generated and sent WebRTC offer for feed ${feedId}`, "sent");
  } catch (error) {
    addToLog("connectionLog", `Failed to generate offer: ${error.message}`, "error");
  }
}

function subscribeToFeed() {
  const feedId = parseInt(document.getElementById("subscribeFeedId").value);
  const resolutionPreference = document.getElementById("preferredResolution");

  if (!feedId) {
    addToLog("connectionLog", "Please enter Feed ID", "error");
    return;
  }

  let data = { feedId };
  
  // Add resolution preference if specified
  if (resolutionPreference && resolutionPreference.value) {
    data.resolution = resolutionPreference.value;
  }

  sendMessage("subscribe-to-user-feed", { data });
  
  let logMessage = `Subscribing to feed ${feedId}`;
  if (resolutionPreference && resolutionPreference.value) {
    logMessage += ` with resolution: ${resolutionPreference.value}`;
  }
  addToLog("connectionLog", logMessage, "sent");
}

async function generateAndSendAnswer() {
  // Try to get feed ID from either the subscriber section or the dedicated answer section
  let feedId = parseInt(document.getElementById("subscribeFeedId").value);
  const answerFeedId = parseInt(document.getElementById("answerFeedId").value);
  
  if (answerFeedId) {
    feedId = answerFeedId;
  }

  if (!feedId) {
    addToLog("connectionLog", "Please enter Feed ID", "error");
    return;
  }

  if (!subscriberPC) {
    addToLog("connectionLog", "No subscriber peer connection available", "error");
    return;
  }

  try {
    // Create answer
    const answer = await subscriberPC.createAnswer();
    await subscriberPC.setLocalDescription(answer);

    // Display the generated answer in the textarea
    const generatedAnswerField = document.getElementById("generatedAnswer");
    if (generatedAnswerField) {
      generatedAnswerField.value = JSON.stringify({
        type: answer.type,
        sdp: answer.sdp
      }, null, 2);
    }

    // Send answer to server
    sendMessage("send-answer-for-subscribing", {
      data: {
        feedId,
        jsep: {
          type: answer.type,
          sdp: answer.sdp
        }
      }
    });

    addToLog("connectionLog", `Generated and sent WebRTC answer for feed ${feedId}`, "sent");
  } catch (error) {
    addToLog("connectionLog", `Failed to generate answer: ${error.message}`, "error");
  }
}

function sendCollectedIceCandidates() {
  const type = document.getElementById("iceCandidateType").value;
  const feedId = parseInt(document.getElementById("iceFeedId").value);

  if (!feedId) {
    addToLog("connectionLog", "Please enter Feed ID", "error");
    return;
  }

  sendMessage("send-ice-candidates", {
    data: {
      type,
      feedId,
      candidates: collectedIceCandidates
    }
  });

  addToLog("connectionLog", `Sent ${collectedIceCandidates.length} ICE candidates for ${type} feed ${feedId}`, "sent");
}

function sendJoinConferenceAsPublisher() {
  const feedTypeSelect = document.getElementById("feedTypeSelect");
  const publishFeedType = document.getElementById("publishFeedType");
  const audioEnabledJoin = document.getElementById("audioEnabledJoin");
  const videoEnabledJoin = document.getElementById("videoEnabledJoin");
  const simulcastEnabledJoin = document.getElementById("simulcastEnabledJoin");
  const simulcastResolutionsJoin = document.getElementById("simulcastResolutionsJoin");
  
  // Use publishFeedType if available, fallback to feedTypeSelect, then default to camera
  let feedType = "camera";
  if (publishFeedType) {
    feedType = publishFeedType.value;
    // Sync the other selector if it exists
    if (feedTypeSelect) {
      feedTypeSelect.value = feedType;
    }
  } else if (feedTypeSelect) {
    feedType = feedTypeSelect.value;
  }

  // Get audio/video settings (default to true if checkboxes don't exist)
  const audio = audioEnabledJoin ? audioEnabledJoin.checked : true;
  const video = videoEnabledJoin ? videoEnabledJoin.checked : true;
  
  // Get simulcast settings
  const simulcastEnabled = simulcastEnabledJoin ? simulcastEnabledJoin.checked : false;
  let simulcastResolutions = null;
  if (simulcastEnabled) {
    // Collect resolution checkboxes
    const resolutionHigh = document.getElementById("resolutionHigh");
    const resolutionMedium = document.getElementById("resolutionMedium");
    const resolutionLow = document.getElementById("resolutionLow");
    
    simulcastResolutions = [];
    if (resolutionHigh && resolutionHigh.checked) {
      simulcastResolutions.push("h");
    }
    if (resolutionMedium && resolutionMedium.checked) {
      simulcastResolutions.push("m");
    }
    if (resolutionLow && resolutionLow.checked) {
      simulcastResolutions.push("l");
    }
  }

  const message = {
    type: "join-conference-as-publisher"
  };

  // Build data object with all parameters
  const data = { 
    feedType,
    audio,
    video
  };
  
  if (simulcastEnabled) {
    data.simulcast = simulcastEnabled;
    if (simulcastResolutions && simulcastResolutions.length > 0) {
      data.resolutions = simulcastResolutions;
    }
  }

  // Always include data
  message.data = data;

  // Cache simulcast settings for later use in WebRTC offer generation
  cachedSimulcastEnabled = simulcastEnabled;
  cachedSimulcastResolutions = simulcastResolutions;
  
  addToLog("connectionLog", `Cached simulcast settings: enabled=${simulcastEnabled}, resolutions=${simulcastResolutions ? JSON.stringify(simulcastResolutions) : 'null'}`, "info");

  sendMessage(message.type, { data: message.data });
  
  let logMessage = `Joining conference as publisher with feedType: ${feedType}, audio: ${audio}, video: ${video}`;
  if (simulcastEnabled) {
    logMessage += `, simulcast: enabled`;
    if (simulcastResolutions && simulcastResolutions.length > 0) {
      logMessage += ` (${simulcastResolutions.join(', ')})`;
    }
  }
  addToLog("connectionLog", logMessage, "sent");
}

function sendReaction() {
  const reactionInput = document.getElementById("reactionData");
  const reaction = reactionInput.value.trim();
  
  if (!reaction) {
    addToLog("connectionLog", "Please enter a reaction", "error");
    return;
  }
  
  if (reaction.length > 50) {
    addToLog("connectionLog", "Reaction is too long (max 50 characters)", "error");
    return;
  }
  
  sendMessage("send-reaction", { data: reaction });
  addToLog("connectionLog", `Sent reaction: ${reaction}`, "sent");
  
  // Clear the input field
  reactionInput.value = "";
}

function sendRaiseHand() {
  const feedId = parseInt(document.getElementById("handRaiseFeedId").value);
  
  if (!feedId) {
    addToLog("connectionLog", "Please enter a valid feed ID to raise hand", "error");
    return;
  }
  
  sendMessage("raise-hand", { data: { feedId } });
  addToLog("connectionLog", `Raised hand for feed ${feedId}`, "sent");
}

function sendLowerHand() {
  const feedId = parseInt(document.getElementById("handRaiseFeedId").value);
  
  if (!feedId) {
    addToLog("connectionLog", "Please enter a valid feed ID to lower hand", "error");
    return;
  }
  
  sendMessage("lower-hand", { data: { feedId } });
  addToLog("connectionLog", `Lowered hand for feed ${feedId}`, "sent");
}

// Handle incoming server messages
async function handleServerMessage(data) {
  console.log("recived event")
  switch (data.type) {
    case "joined-conference-as-publisher":
      // Auto-fill the feed ID when we join as publisher  
      const feedIdField = document.getElementById("offerFeedId");
      const toggleFeedIdField = document.getElementById("toggleFeedId");
      
      const feedId = data.data.feed?.id;
      if (feedIdField && feedId) {
        feedIdField.value = feedId;
        addToLog("connectionLog", `Auto-filled feed ID: ${feedId}`, "info");
      }
      
      if (toggleFeedIdField && feedId) {
        toggleFeedIdField.value = feedId;
        const toggleMediaBtn = document.getElementById("toggleMediaBtn");
        if (toggleMediaBtn) {
          toggleMediaBtn.disabled = false;
        }
        addToLog("connectionLog", `Auto-filled toggle feed ID: ${feedId}`, "info");
      }
      
      // Auto-fill hand raise feed ID field
      const handRaiseFeedIdField = document.getElementById("handRaiseFeedId");
      if (handRaiseFeedIdField && feedId) {
        handRaiseFeedIdField.value = feedId;
        addToLog("connectionLog", `Auto-filled hand raise feed ID: ${feedId}`, "info");
      }
      
      // Display available publishers using new standardized format
      if (data.data.publishers && Array.isArray(data.data.publishers)) {
        const publisherInfo = data.data.publishers.map(pub => {
          const audioState = pub.audio ? '🔊' : '🔇';
          const videoState = pub.video ? '📹' : '📹❌';
          const talkingState = pub.talking ? '🗣️' : '';
          const handRaisedState = pub.handRaised ? '✋' : '';
          const feedTypeIcon = pub.feedType === 'screenshare' ? '🖥️' : '📷';
          
          return `  Feed ID: ${pub.id} | User: ${pub.userId} | Type: ${feedTypeIcon}${pub.feedType} | ${audioState} ${videoState} ${talkingState} ${handRaisedState}`;
        }).join('\n');
        addToLog("connectionLog", `Joined conference! Available publishers (${data.data.publishers.length}):\n${publisherInfo}`, "info");
      }
      break;

    case "receive-answer-for-publishing":
      console.log("recieved answer")
      // Handle WebRTC answer from server
      if (publisherPC && data.data.jsep) {
        try {
          await publisherPC.setRemoteDescription(data.data.jsep);
          console.log("setting answer")
          addToLog("connectionLog", "Set remote description (answer) for publisher", "received");
        } catch (error) {
          addToLog("connectionLog", `Failed to set remote description: ${error.message}`, "error");
        }
      }
      break;

    case "subscribed-to-user-feed":
      console.log("subscribed")
      // Handle WebRTC offer from server when subscribing
      if (data.data.jsep) {
        try {
          // Get the feed ID we subscribed to
          const subscribeFeedId = document.getElementById("subscribeFeedId").value;
          
          // Create subscriber peer connection
          subscriberPC = createPeerConnection("subscriber");
          
          // Set current feed ID for ICE handling
          currentFeedId = parseInt(subscribeFeedId);

          // Set up remote stream handling
          subscriberPC.ontrack = (event) => {
            const remoteVideo = document.getElementById("remoteVideo");
            if (remoteVideo && event.streams[0]) {
              remoteVideo.srcObject = event.streams[0];
              remoteVideo.style.display = "block";
              addToLog("connectionLog", "Received remote video stream", "received");
            }
          };

          await subscriberPC.setRemoteDescription(data.data.jsep);
          
          // Auto-fill the feed ID for answer generation
          const answerFeedIdField = document.getElementById("answerFeedId");
          if (answerFeedIdField && subscribeFeedId) {
            answerFeedIdField.value = subscribeFeedId;
            addToLog("connectionLog", `Auto-filled answer feed ID: ${subscribeFeedId}`, "info");
          }
          
          const generateAnswerBtn = document.getElementById("generateAnswerBtn");
          const generateAnswerBtn2 = document.getElementById("generateAnswerBtn2");
          if (generateAnswerBtn) {
            generateAnswerBtn.disabled = false;
          }
          if (generateAnswerBtn2) {
            generateAnswerBtn2.disabled = false;
          }
          addToLog("connectionLog", "Set remote description (offer) for subscriber", "received");
        } catch (error) {
          addToLog("connectionLog", `Failed to handle subscription offer: ${error.message}`, "error");
        }
      }
      break;

    case "publisher-list":
      // Display publisher list using new standardized publisher objects
      if (data.data && Array.isArray(data.data)) {
        const publisherInfo = data.data.map(pub => {
          const audioState = pub.audio ? '🔊' : '🔇';
          const videoState = pub.video ? '📹' : '📹❌';
          const talkingState = pub.talking ? '🗣️' : '';
          const handRaisedState = pub.handRaised ? '✋' : '';
          const feedTypeIcon = pub.feedType === 'screenshare' ? '🖥️' : '📷';
          
          return `Feed ID: ${pub.id} | User: ${pub.userId} | Type: ${feedTypeIcon}${pub.feedType} | ${audioState} ${videoState} ${talkingState} ${handRaisedState}`;
        }).join('\n');
        addToLog("connectionLog", `Available publishers (${data.data.length}):\n${publisherInfo}`, "info");
        
        // Log the raw data for debugging
        console.log("Publisher list data:", data.data);
      }
      break;

    case "media-stream-toggled":
      // Handle confirmation of media stream toggle
      if (data.data) {
        const { video, audio } = data.data;
        addToLog("connectionLog", `Media stream toggled confirmed: video=${video}, audio=${audio}`, "received");
        
        // Update UI checkboxes to reflect server state
        const videoCheckbox = document.getElementById("videoEnabled");
        const audioCheckbox = document.getElementById("audioEnabled");
        
        if (videoCheckbox) {
          videoCheckbox.checked = video;
        }
        if (audioCheckbox) {
          audioCheckbox.checked = audio;
        }
      }
      break;

    case "feed-unpublished":
      // Handle confirmation of feed unpublish
      if (data.data) {
        const { feedId } = data.data;
        addToLog("connectionLog", `Feed ${feedId} unpublished confirmed`, "received");
        
        // Clear the unpublish feed ID field
        const unpublishFeedIdField = document.getElementById("unpublishFeedId");
        if (unpublishFeedIdField) {
          unpublishFeedIdField.value = "";
        }
      }
      break;

    case "publisher-unpublished-feed":
      // Handle broadcast when another user unpublishes a feed
      if (data.data) {
        const { userId, feedId } = data.data;
        addToLog("connectionLog", `User ${userId} unpublished feed ${feedId}`, "received");
        // Here you would typically remove the feed from your UI
        // For now, just log the event
      }
      break;

    case "screenshot-taken-by-user":
      // Handle screenshot notification from another user
      if (data.data) {
        const { userId } = data.data;
        addToLog("connectionLog", `📷 User ${userId} took a screenshot`, "received");
        // Here you would typically show a notification to the user
        // For now, just log the event
      }
      break;

    case "screenshot-taken":
      // Handle confirmation that screenshot notification was sent
      addToLog("connectionLog", "📷 Screenshot notification sent", "received");
      break;

    case "reaction-sent":
      // Handle confirmation that reaction was sent
      addToLog("connectionLog", "😀 Reaction sent successfully", "received");
      break;

    case "reaction-received":
      // Handle reaction from another user
      if (data.data) {
        const { userId, reaction } = data.data;
        addToLog("connectionLog", `😀 User ${userId} sent reaction: ${reaction}`, "received");
        // Here you would typically display the reaction in your UI temporarily
        // For now, just log the event
      }
      break;

    case "hand-raised":
      // Handle own hand raised confirmation
      addToLog("connectionLog", "✋ Your hand has been raised", "received");
      break;
      
    case "hand-raised-by-user":
      // Handle hand raised notification from another user
      if (data.data) {
        const { userId, feedId } = data.data;
        addToLog("connectionLog", `✋ User ${userId} raised hand (Feed ${feedId})`, "received");
        // Here you would typically show a hand raised indicator in your UI
        // For now, just log the event
      }
      break;

    case "hand-lowered":
      // Handle own hand lowered confirmation
      addToLog("connectionLog", "👋 Your hand has been lowered", "received");
      break;
      
    case "hand-lowered-by-user":
      // Handle hand lowered notification from another user
      if (data.data) {
        const { userId, feedId } = data.data;
        addToLog("connectionLog", `👋 User ${userId} lowered hand (Feed ${feedId})`, "received");
        // Here you would typically remove the hand raised indicator in your UI
        // For now, just log the event
      }
      break;

    case "publisher-joined-conference":
      // Handle when another publisher joins the conference
      if (data.data && data.data.publisher) {
        const pub = data.data.publisher;
        const audioState = pub.audio ? '🔊' : '🔇';
        const videoState = pub.video ? '📹' : '📹❌';
        const talkingState = pub.talking ? '🗣️' : '';
        const handRaisedState = pub.handRaised ? '✋' : '';
        const feedTypeIcon = pub.feedType === 'screenshare' ? '🖥️' : '📷';
        
        const publisherInfo = `Feed ID: ${pub.id} | User: ${pub.userId} | Type: ${feedTypeIcon}${pub.feedType} | ${audioState} ${videoState} ${talkingState} ${handRaisedState}`;
        addToLog("connectionLog", `📹 Publisher joined conference:\n  ${publisherInfo}`, "received");
      }
      break;

    case "publisher-toggled-media-stream":
      // Handle when another publisher toggles their media
      if (data.data) {
        const { userId, feedId, video, audio } = data.data;
        const audioState = audio ? '🔊 ON' : '🔇 OFF';
        const videoState = video ? '📹 ON' : '📹❌ OFF';
        addToLog("connectionLog", `🎚️ User ${userId} toggled media (Feed ${feedId}): Audio ${audioState}, Video ${videoState}`, "received");
      }
      break;

    case "user-joined-call":
      // Handle when a user joins the call
      if (data.data) {
        const { userId } = data.data;
        addToLog("connectionLog", `📞 User ${userId} joined the call`, "received");
      }
      break;

    case "user-left-call":
      // Handle when a user leaves the call
      if (data.data) {
        const { userId } = data.data;
        addToLog("connectionLog", `📞❌ User ${userId} left the call`, "received");
      }
      break;

    case "publisher-webrtc-connection-established":
      // Handle when publisher WebRTC connection is established
      if (data.data) {
        const { feedId } = data.data;
        addToLog("connectionLog", `🔗 Publisher WebRTC connection established for feed ${feedId}`, "received");
      }
      break;

    case "subscriber-webrtc-connection-established":
      // Handle when subscriber WebRTC connection is established
      if (data.data) {
        const { feedId } = data.data;
        addToLog("connectionLog", `🔗 Subscriber WebRTC connection established for feed ${feedId}`, "received");
      }
      break;

    case "left-conference":
      // Handle confirmation of leaving conference
      addToLog("connectionLog", "📤 Left conference", "received");
      break;

    case "moderation-success":
      // Handle confirmation of successful moderation
      if (data.data) {
        const { feedId } = data.data;
        addToLog("connectionLog", `⚖️ Successfully moderated feed ${feedId}`, "received");
      }
      break;

    case "feed-moderated":
      // Handle notification that our feed was moderated
      if (data.data) {
        const { feedId, hostId } = data.data;
        addToLog("connectionLog", `⚖️ Your feed ${feedId} was moderated by host ${hostId}`, "received");
      }
      break;

    case "feed-moderated-by-host":
      // Handle broadcast when a feed is moderated by host
      if (data.data) {
        const { feedId, userId, hostId } = data.data;
        addToLog("connectionLog", `⚖️ Host ${hostId} moderated feed ${feedId} of user ${userId}`, "received");
      }
      break;
  }
}

// Event Listeners
document.getElementById("connectBtn").addEventListener("click", connectWithAuth);
document.getElementById("disconnectBtn").addEventListener("click", disconnect);

// Load cached values when page loads
document.addEventListener("DOMContentLoaded", function() {
  loadCachedValues();
  
  // Auto-save values when user types (with debouncing)
  let saveTimeout;
  const autoSave = () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveCachedValues();
    }, 1000); // Save 1 second after user stops typing
  };
  
  // Add auto-save listeners to form fields
  const serverUrlField = document.getElementById("serverUrl");
  const apiKeyField = document.getElementById("apiKey");
  const authTokenField = document.getElementById("authToken");
  
  if (serverUrlField) serverUrlField.addEventListener("input", autoSave);
  if (apiKeyField) apiKeyField.addEventListener("input", autoSave);
  if (authTokenField) authTokenField.addEventListener("input", autoSave);
});

// Handle WebSocket connection with custom headers (for demonstration)
// Note: Due to browser security, we can't actually set custom headers on WebSocket
// This is handled server-side through query parameters or subprotocols in real implementation
function connectWithAuth() {
  console.log("called connect with auth")
  const serverUrl = document.getElementById("serverUrl").value;
  const apiKey = document.getElementById("apiKey").value;
  const authToken = document.getElementById("authToken").value;

  if (!serverUrl || !apiKey || !authToken) {
    addToLog("connectionLog", "Please fill in all connection fields", "error");
    return;
  }

  // Save values to cache when attempting to connect
  saveCachedValues();

  // For demo purposes, we'll show that authentication would be handled via URL params
  // In actual implementation, this would be handled server-side
  const authUrl = `${serverUrl}?api_key=${encodeURIComponent(apiKey)}&access_token=${encodeURIComponent(authToken)}`;

  addToLog(
    "connectionLog",
    "Note: In browser environment, authentication headers must be handled server-side during WebSocket upgrade",
    "error"
  );
  addToLog("connectionLog", `Attempting connection to: ${serverUrl}`, "info");

  try {
    socket = new WebSocket(authUrl);

    socket.onopen = function(event) {
      updateConnectionStatus(true);
      addToLog("connectionLog", "WebSocket connection established", "received");
      // Send auth info as first message if needed
      addToLog("connectionLog", "Note: Send API key and auth token as per server requirements", "info");
    };

    socket.onmessage = function(event) {
      try {
        const data = JSON.parse(event.data);
        addToLog("connectionLog", `Received: ${JSON.stringify(data, null, 2)}`, "received");
        handleServerMessage(data);
      } catch (e) {
        addToLog("connectionLog", `Received: ${event.data}`, "received");
      }
    };

    socket.onclose = function(event) {
      updateConnectionStatus(false);
      addToLog(
        "connectionLog",
        `Connection closed: ${event.code} ${event.reason || "No reason provided"}`,
        "error"
      );
    };

    socket.onerror = function(error) {
      addToLog("connectionLog", `Connection error: ${error.message || "Unknown error"}`, "error");
    };
  } catch (error) {
    addToLog("connectionLog", `Failed to connect: ${error.message}`, "error");
  }
}

// Missing client event functions
function sendDisconnect() {
  sendMessage("disconnect", {});
  addToLog("connectionLog", "Sent disconnect request", "sent");
}

function sendLeaveConference() {
  sendMessage("leave-conference", {});
  addToLog("connectionLog", "Sent leave conference request", "sent");
}

function sendModerateFeed() {
  const feedId = parseInt(prompt("Enter Feed ID to moderate:"));
  if (!feedId) {
    addToLog("connectionLog", "Please enter a valid feed ID", "error");
    return;
  }
  
  sendMessage("moderate-feed", { data: { feedId } });
  addToLog("connectionLog", `Sent moderation request for feed ${feedId}`, "sent");
}

function sendGetPublisherList() {
  sendMessage("get-publisher-list", {});
  addToLog("connectionLog", "Requested publisher list", "sent");
}

function sendScreenshotNotification() {
  sendMessage("send-screenshot-notification", {});
  addToLog("connectionLog", "Sent screenshot notification", "sent");
}

function sendConfigureFeed() {
  const feedId = parseInt(document.getElementById("configureFeedId").value);
  const simulcastEnabled = document.getElementById("configureSimulcastEnabled").checked;

  if (!feedId) {
    addToLog("connectionLog", "Please enter Feed ID", "error");
    return;
  }

  let data = { feedId, simulcast: simulcastEnabled };
  
  if (simulcastEnabled) {
    // Collect resolution checkboxes only when simulcast is enabled
    const resolutionHigh = document.getElementById("configureResolutionHigh");
    const resolutionMedium = document.getElementById("configureResolutionMedium");
    const resolutionLow = document.getElementById("configureResolutionLow");
    
    data.resolutions = [];
    if (resolutionHigh && resolutionHigh.checked) {
      data.resolutions.push("h");
    }
    if (resolutionMedium && resolutionMedium.checked) {
      data.resolutions.push("m");
    }
    if (resolutionLow && resolutionLow.checked) {
      data.resolutions.push("l");
    }
  }

  sendMessage("configure-feed", { data });
  
  // Also update local WebRTC connection if this is our own feed
  if (currentFeedId && currentFeedId === feedId && publisherPC) {
    updateLocalSimulcastConfiguration(simulcastEnabled, data.resolutions);
    
    // Update cached settings to reflect the new configuration
    cachedSimulcastEnabled = simulcastEnabled;
    cachedSimulcastResolutions = data.resolutions;
    addToLog("connectionLog", `Updated cached simulcast settings: enabled=${simulcastEnabled}, resolutions=${data.resolutions ? JSON.stringify(data.resolutions) : 'null'}`, "info");
  }
  
  let logMessage = `Configuring feed ${feedId}: simulcast ${simulcastEnabled ? 'enabled' : 'disabled'}`;
  if (simulcastEnabled && data.resolutions && data.resolutions.length > 0) {
    logMessage += ` (${data.resolutions.join(', ')})`;
  }
  addToLog("connectionLog", logMessage, "sent");
}

function sendConfigureFeedSubscription() {
  const feedId = parseInt(document.getElementById("configureSubscriptionFeedId").value);
  const resolution = document.getElementById("configureSubscriptionResolution").value;

  if (!feedId) {
    addToLog("connectionLog", "Please enter Feed ID", "error");
    return;
  }

  if (!resolution) {
    addToLog("connectionLog", "Please select resolution", "error");
    return;
  }

  const data = { feedId, resolution };

  sendMessage("configure-feed-subscription", { data });
  addToLog("connectionLog", `Configuring subscription for feed ${feedId}: resolution ${resolution}`, "sent");
}

// ============================================================================
// 🎚️ SIMULCAST HELPER METHODS
// ============================================================================

function getSimulcastEncodings() {
  return [
    {
      rid: 'high',
      maxBitrate: 1000000,  // 1 Mbps
      scaleResolutionDownBy: 1.0,
      maxFramerate: 30
    },
    {
      rid: 'medium',
      maxBitrate: 500000,   // 500 kbps
      scaleResolutionDownBy: 2.0,
      maxFramerate: 15
    },
    {
      rid: 'low',
      maxBitrate: 200000,   // 200 kbps
      scaleResolutionDownBy: 4.0,
      maxFramerate: 15
    }
  ];
}

function detectSimulcastSupport() {
  try {
    // Check if addTransceiver is available
    const pc = new RTCPeerConnection();
    const hasAddTransceiver = typeof pc.addTransceiver === 'function';
    pc.close();

    // Basic browser detection
    const userAgent = navigator.userAgent.toLowerCase();
    const isChrome = userAgent.includes('chrome') && !userAgent.includes('edg');
    const isFirefox = userAgent.includes('firefox');
    const isEdge = userAgent.includes('edg');
    const isSafari = userAgent.includes('safari') && !userAgent.includes('chrome');

    // Chrome and Edge have good simulcast support
    if ((isChrome || isEdge) && hasAddTransceiver) {
      return { supported: true, browser: isChrome ? 'chrome' : 'edge' };
    }

    // Firefox has partial simulcast support
    if (isFirefox && hasAddTransceiver) {
      return { supported: true, browser: 'firefox', limited: true };
    }

    // Safari has limited simulcast support
    if (isSafari && hasAddTransceiver) {
      return { supported: false, browser: 'safari', reason: 'Limited simulcast support' };
    }

    return { supported: false, reason: 'No addTransceiver support' };
  } catch (error) {
    console.warn('Error detecting simulcast support:', error);
    return { supported: false, reason: 'Detection failed' };
  }
}

function addTracksWithSimulcast(peerConnection, localStream) {
  // This function is now only called when simulcast should be enabled
  // No need to check ENABLE_SIMULCAST here as it's already checked in generateAndSendOffer

  const simulcastSupport = detectSimulcastSupport();
  console.log('🔍 Simulcast support detection:', simulcastSupport);
  addToLog("connectionLog", `Simulcast support: ${simulcastSupport.supported ? 'YES' : 'NO'} (${simulcastSupport.browser || simulcastSupport.reason})`, "info");

  const videoTrack = localStream.getVideoTracks()[0];
  const audioTrack = localStream.getAudioTracks()[0];

  // Add audio track (no simulcast needed)
  if (audioTrack) {
    try {
      peerConnection.addTransceiver(audioTrack, {
        direction: 'sendonly',
        streams: [localStream]
      });
      console.log('✅ Added audio transceiver');
      addToLog("connectionLog", "Added audio transceiver", "info");
    } catch (error) {
      console.warn('⚠️ Fallback to addTrack for audio:', error);
      peerConnection.addTrack(audioTrack, localStream);
      addToLog("connectionLog", "Fallback to addTrack for audio", "info");
    }
  }

  // Add video track with simulcast if supported
  if (videoTrack) {
    if (simulcastSupport.supported) {
      try {
        // Get only the encodings that were specified in join-conference event
        const allEncodings = getSimulcastEncodings();
        let encodings = allEncodings;
        
        // Filter encodings based on cached user selections
        if (cachedSimulcastResolutions && cachedSimulcastResolutions.length > 0) {
          encodings = allEncodings.filter(encoding => {
            if (encoding.rid === 'high') return cachedSimulcastResolutions.includes('h');
            if (encoding.rid === 'medium') return cachedSimulcastResolutions.includes('m');
            if (encoding.rid === 'low') return cachedSimulcastResolutions.includes('l');
            return false;
          });
          
          addToLog("connectionLog", `Using only selected resolutions: ${cachedSimulcastResolutions.join(', ')} → ${encodings.map(e => e.rid).join(', ')}`, "info");
        } else {
          // Fallback: if no specific resolutions cached, use all
          addToLog("connectionLog", "No specific resolutions cached, using all encodings", "info");
        }

        // Firefox needs special handling
        if (simulcastSupport.browser === 'firefox' && encodings.length > 2) {
          // Firefox works better with max 2 layers
          encodings = encodings.slice(0, 2);
          addToLog("connectionLog", "Firefox detected: limited to 2 simulcast layers", "info");
        }

        // Safety check: if no encodings remain after filtering, fall back to single stream
        if (encodings.length === 0) {
          addToLog("connectionLog", "No valid encodings selected, falling back to single stream", "warning");
          fallbackToSingleStream(peerConnection, videoTrack, localStream);
          return;
        }

        videoTransceiver = peerConnection.addTransceiver(videoTrack, {
          direction: 'sendonly',
          streams: [localStream],
          sendEncodings: encodings
        });

        console.log(`✅ Added video transceiver with ${encodings.length} simulcast layers:`, encodings.map(e => e.rid));
        addToLog("connectionLog", `✅ Added video transceiver with ${encodings.length} simulcast layers: ${encodings.map(e => e.rid).join(', ')}`, "info");
        
        // Show detailed encoding configuration
        encodings.forEach(encoding => {
          addToLog("connectionLog", `  Layer ${encoding.rid}: ${encoding.maxBitrate/1000}kbps, scale=${encoding.scaleResolutionDownBy}x, ${encoding.maxFramerate}fps`, "info");
        });
      } catch (error) {
        console.warn('⚠️ Simulcast setup failed, falling back to single stream:', error);
        addToLog("connectionLog", `Simulcast setup failed: ${error.message}`, "error");
        fallbackToSingleStream(peerConnection, videoTrack, localStream);
      }
    } else {
      console.log(`⚠️ Simulcast not supported (${simulcastSupport.reason}), using single stream`);
      addToLog("connectionLog", `Simulcast not supported: ${simulcastSupport.reason}`, "info");
      fallbackToSingleStream(peerConnection, videoTrack, localStream);
    }
  }
}

function fallbackToSingleStream(peerConnection, videoTrack, localStream) {
  try {
    peerConnection.addTransceiver(videoTrack, {
      direction: 'sendonly',
      streams: [localStream]
    });
    console.log('✅ Added single video stream via addTransceiver');
    addToLog("connectionLog", "Added single video stream via addTransceiver", "info");
  } catch (error) {
    console.warn('⚠️ Final fallback to legacy addTrack:', error);
    peerConnection.addTrack(videoTrack, localStream);
    addToLog("connectionLog", "Final fallback to legacy addTrack", "info");
  }
}

function addTracksWithoutSimulcast(peerConnection, localStream) {
  console.log('📡 Adding tracks in SINGLE STREAM mode (simulcast disabled)');
  addToLog("connectionLog", "Adding tracks in SINGLE STREAM mode (simulcast disabled)", "info");

  const videoTrack = localStream.getVideoTracks()[0];
  const audioTrack = localStream.getAudioTracks()[0];

  // Add audio track
  if (audioTrack) {
    try {
      peerConnection.addTransceiver(audioTrack, {
        direction: 'sendonly',
        streams: [localStream]
      });
      console.log('✅ Added audio transceiver (single stream)');
    } catch (error) {
      console.warn('⚠️ Fallback to addTrack for audio:', error);
      peerConnection.addTrack(audioTrack, localStream);
    }
  }

  // Add video track (single stream only)
  if (videoTrack) {
    try {
      peerConnection.addTransceiver(videoTrack, {
        direction: 'sendonly',
        streams: [localStream]
      });
      console.log('✅ Added video transceiver (single stream)');
    } catch (error) {
      console.warn('⚠️ Fallback to addTrack for video:', error);
      peerConnection.addTrack(videoTrack, localStream);
    }
  }

  console.log('🔄 Single stream setup completed - no simulcast layers');
  addToLog("connectionLog", "Single stream setup completed - no simulcast layers", "info");
}

// Dynamic simulcast layer control
async function toggleSimulcastLayer(feedId, rid, enabled) {
  if (!publisherPC) {
    console.error(`No publisher peer connection found for feedId: ${feedId}`);
    addToLog("connectionLog", `No publisher peer connection found for feedId: ${feedId}`, "error");
    return false;
  }

  try {
    const senders = publisherPC.getSenders();
    const videoSender = senders.find(sender =>
      sender.track && sender.track.kind === 'video'
    );

    if (!videoSender) {
      console.error('No video sender found');
      addToLog("connectionLog", "No video sender found", "error");
      return false;
    }

    const params = videoSender.getParameters();
    const encoding = params.encodings?.find(enc => enc.rid === rid);

    if (encoding) {
      encoding.active = enabled;
      await videoSender.setParameters(params);
      console.log(`✅ Simulcast layer ${rid} ${enabled ? 'enabled' : 'disabled'} for feedId: ${feedId}`);
      addToLog("connectionLog", `Simulcast layer ${rid} ${enabled ? 'enabled' : 'disabled'}`, "info");
      return true;
    } else {
      console.warn(`Simulcast layer ${rid} not found for feedId: ${feedId}`);
      addToLog("connectionLog", `Simulcast layer ${rid} not found`, "error");
      return false;
    }
  } catch (error) {
    console.error(`Error toggling simulcast layer ${rid}:`, error);
    addToLog("connectionLog", `Error toggling simulcast layer ${rid}: ${error.message}`, "error");
    return false;
  }
}

// Configure simulcast layers based on resolutions array
async function updateLocalSimulcastConfiguration(simulcastEnabled, resolutions) {
  if (!publisherPC || !videoTransceiver) {
    addToLog("connectionLog", "No publisher connection or video transceiver available for simulcast configuration", "error");
    return false;
  }

  try {
    const videoSender = videoTransceiver.sender;
    if (!videoSender) {
      addToLog("connectionLog", "No video sender found in transceiver", "error");
      return false;
    }

    const params = videoSender.getParameters();
    if (!params.encodings || params.encodings.length <= 1) {
      addToLog("connectionLog", "No simulcast encodings found - WebRTC connection may not have simulcast enabled", "warning");
      return false;
    }

    // Update encodings based on configuration
    if (simulcastEnabled && resolutions && resolutions.length > 0) {
      // Enable selected layers, disable others
      params.encodings.forEach(encoding => {
        const rid = encoding.rid;
        if (rid === 'high' || rid === 'h') {
          encoding.active = resolutions.includes('h');
        } else if (rid === 'medium' || rid === 'm') {
          encoding.active = resolutions.includes('m');
        } else if (rid === 'low' || rid === 'l') {
          encoding.active = resolutions.includes('l');
        }
      });
      
      addToLog("connectionLog", `Updating simulcast layers: ${resolutions.join(', ')} enabled`, "info");
    } else {
      // Disable all simulcast layers if simulcast is disabled
      params.encodings.forEach(encoding => {
        encoding.active = false;
      });
      
      addToLog("connectionLog", "Disabling all simulcast layers", "info");
    }

    await videoSender.setParameters(params);
    addToLog("connectionLog", "Successfully updated local simulcast configuration", "info");
    return true;
  } catch (error) {
    console.error('Error updating local simulcast configuration:', error);
    addToLog("connectionLog", `Error updating simulcast config: ${error.message}`, "error");
    return false;
  }
}

// Helper function to get current simulcast status
function getSimulcastStatus() {
  if (!publisherPC || !videoTransceiver) {
    return { available: false, reason: "No connection or transceiver" };
  }

  try {
    const videoSender = videoTransceiver.sender;
    if (!videoSender) {
      return { available: false, reason: "No video sender" };
    }

    const params = videoSender.getParameters();
    if (!params.encodings || params.encodings.length <= 1) {
      return { available: false, reason: "No simulcast encodings" };
    }

    const activeEncodings = params.encodings
      .filter(enc => enc.active)
      .map(enc => enc.rid)
      .filter(rid => rid); // Remove undefined rids

    return {
      available: true,
      totalLayers: params.encodings.length,
      activeLayers: activeEncodings,
      allLayers: params.encodings.map(enc => enc.rid).filter(rid => rid)
    };
  } catch (error) {
    return { available: false, reason: `Error: ${error.message}` };
  }
}

// Add UI helper functions for testing
function debugSimulcast() {
  addToLog("connectionLog", "=== SIMULCAST DEBUG INFO ===", "info");
  addToLog("connectionLog", `Global ENABLE_SIMULCAST: ${ENABLE_SIMULCAST}`, "info");
  addToLog("connectionLog", `Cached user choice: enabled=${cachedSimulcastEnabled}, resolutions=${cachedSimulcastResolutions ? JSON.stringify(cachedSimulcastResolutions) : 'null'}`, "info");
  
  const support = detectSimulcastSupport();
  addToLog("connectionLog", `Browser support: ${support.supported} (${support.browser || support.reason})`, "info");
  
  const status = getSimulcastStatus();
  if (status.available) {
    addToLog("connectionLog", `Active layers: ${status.activeLayers.join(', ')} of ${status.allLayers.join(', ')}`, "info");
  } else {
    addToLog("connectionLog", `Simulcast not available: ${status.reason}`, "info");
  }
  
  addToLog("connectionLog", "=== END DEBUG INFO ===", "info");
}

function toggleGlobalSimulcast() {
  ENABLE_SIMULCAST = !ENABLE_SIMULCAST;
  addToLog("connectionLog", `Global simulcast ${ENABLE_SIMULCAST ? 'ENABLED' : 'DISABLED'}`, "info");
  addToLog("connectionLog", "Note: This affects new connections only. Restart feed to apply.", "warning");
}

// Make all functions globally available for HTML onclick handlers
window.sendMessage = sendMessage;
window.sendMessageWithData = sendMessageWithData;
window.sendMessageWithInput = sendMessageWithInput;
window.sendMessageWithJsonData = sendMessageWithJsonData;
window.sendToggleMediaStream = sendToggleMediaStream;
window.sendUnpublishFeed = sendUnpublishFeed;
window.sendOfferForPublishing = sendOfferForPublishing;
window.sendIceCandidates = sendIceCandidates;
window.sendIceCandidateCompleted = sendIceCandidateCompleted;
window.startFeed = startFeed;
window.stopFeed = stopFeed;
// Keep old names for backward compatibility
window.startCamera = startFeed;
window.stopCamera = stopFeed;
window.generateAndSendOffer = generateAndSendOffer;
window.subscribeToFeed = subscribeToFeed;
window.generateAndSendAnswer = generateAndSendAnswer;
window.sendCollectedIceCandidates = sendCollectedIceCandidates;
window.sendJoinConferenceAsPublisher = sendJoinConferenceAsPublisher;
window.sendReaction = sendReaction;
window.sendRaiseHand = sendRaiseHand;
window.sendLowerHand = sendLowerHand;
window.sendDisconnect = sendDisconnect;
window.sendLeaveConference = sendLeaveConference;  
window.sendModerateFeed = sendModerateFeed;
window.sendGetPublisherList = sendGetPublisherList;
window.sendScreenshotNotification = sendScreenshotNotification;
window.sendConfigureFeed = sendConfigureFeed;
window.sendConfigureFeedSubscription = sendConfigureFeedSubscription;
window.clearLog = clearLog;

// Simulcast debug functions
window.debugSimulcast = debugSimulcast;
window.toggleGlobalSimulcast = toggleGlobalSimulcast;
window.getSimulcastStatus = getSimulcastStatus;
window.toggleSimulcastLayer = toggleSimulcastLayer;

// Sync feed type selectors
function syncFeedTypeSelectors() {
  const feedTypeSelect = document.getElementById("feedTypeSelect");
  const publishFeedType = document.getElementById("publishFeedType");
  
  if (feedTypeSelect && publishFeedType) {
    feedTypeSelect.addEventListener("change", () => {
      publishFeedType.value = feedTypeSelect.value;
    });
    
    publishFeedType.addEventListener("change", () => {
      feedTypeSelect.value = publishFeedType.value;
    });
  }
}

// Initialize page
updateConnectionStatus(false);
addToLog("connectionLog", "WebSocket documentation loaded. Configure connection and click Connect.", "info");
syncFeedTypeSelectors();
