(function () {
  const HOST_DEVICE_ID = "camera_home_001";
  const HEARTBEAT_INTERVAL_MS = 10000;
  const HOST_OFFLINE_TIMEOUT_MS = 35000;
  const SESSION_TTL_MS = 10 * 60 * 1000;
  const REQUEST_TIMEOUT_MS = 60000;
  const MAX_VIEWERS = 3;
  const RTC_CONFIGURATION = {
    iceServers: [
      {
        urls: "stun:stun.l.google.com:19302",
      },
    ],
  };

  function now() {
    return Date.now();
  }

  function timestampValue() {
    return window.firebase?.database?.ServerValue?.TIMESTAMP || now();
  }

  function safeErrorDetails(error) {
    return {
      code: error?.code || null,
      message: error?.message || String(error || "unknown_error"),
      name: error?.name || null,
      stack: error?.stack || null,
    };
  }

  function logPublisherError(message, error) {
    console.error(message, safeErrorDetails(error));
  }

  function isSafeRealtimeValue(value) {
    if (value === null) return true;
    if (["string", "number", "boolean"].includes(typeof value)) {
      return Number.isFinite(value) || typeof value !== "number";
    }
    return (
      value &&
      typeof value === "object" &&
      Object.keys(value).length === 1 &&
      value[".sv"] === "timestamp"
    );
  }

  function sanitizeRealtimePayload(payload) {
    return Object.entries(payload || {}).reduce((safe, [key, value]) => {
      if (isSafeRealtimeValue(value)) safe[key] = value;
      return safe;
    }, {});
  }

  function hasLiveVideoTrack(mediaStream) {
    return Boolean(
      mediaStream &&
        typeof mediaStream.getVideoTracks === "function" &&
        mediaStream.getVideoTracks().some((track) => track.readyState === "live"),
    );
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function sanitizeKey(value, fallback) {
    const safe = String(value || "")
      .replace(/[.#$\[\]\/\s]/g, "_")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 100);
    return safe || fallback;
  }

  function getFirebaseDatabase() {
    if (!window.firebase || typeof firebase.initializeApp !== "function") {
      throw new Error("firebase_sdk_unavailable");
    }
    if (!window.firebaseConfig) {
      throw new Error("firebase_config_unavailable");
    }
    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(window.firebaseConfig);
    }
    if (typeof firebase.database !== "function") {
      throw new Error("firebase_database_unavailable");
    }
    return firebase.database();
  }

  function toIceCandidateJson(candidate) {
    return candidate && typeof candidate.toJSON === "function"
      ? candidate.toJSON()
      : candidate;
  }

  function isSessionActive(session) {
    if (!session || typeof session !== "object") return false;
    if (["closed", "failed", "expired", "busy"].includes(session.status)) {
      return false;
    }
    return Number(session.expiresAt || 0) > now();
  }

  function createPeerConnection(onStateChange) {
    const peerConnection = new RTCPeerConnection(RTC_CONFIGURATION);
    peerConnection.onconnectionstatechange = () => {
      onStateChange?.(peerConnection.connectionState);
    };
    peerConnection.oniceconnectionstatechange = () => {
      onStateChange?.(peerConnection.iceConnectionState);
    };
    return peerConnection;
  }

  function createCameraHostController(options) {
    const db = getFirebaseDatabase();
    const hostDeviceId = sanitizeKey(options.hostDeviceId, HOST_DEVICE_ID);
    const hostRef = db.ref(`camera_hosts/${hostDeviceId}`);
    const sessionsQuery = db
      .ref("camera_sessions")
      .orderByChild("hostDeviceId")
      .equalTo(hostDeviceId);
    const peers = new Map();
    let hostMetadata = {};
    let streamReady = false;
    let stopped = false;
    let heartbeatTimer = null;
    let sessionsListenerActive = false;
    let heartbeatOkLogged = false;
    let consecutiveHeartbeatFailures = 0;

    async function publishHostStatus(extra = {}, source = "status") {
      hostMetadata = {
        ...hostMetadata,
        ...sanitizeRealtimePayload(extra),
      };

      const payload = sanitizeRealtimePayload({
        deviceId: hostDeviceId,
        online: !stopped,
        streamReady,
        viewerCount: activePeerCount(),
        lastHeartbeatAt: timestampValue(),
        updatedAt: timestampValue(),
        ...hostMetadata,
      });
      await hostRef.update(payload);
      consecutiveHeartbeatFailures = 0;
      if (source === "heartbeat") {
        if (!heartbeatOkLogged) {
          console.info("[CameraPublisher] heartbeat ok", { hostDeviceId });
          heartbeatOkLogged = true;
        }
      } else {
        console.info("[CameraPublisher] host status written", { hostDeviceId });
      }
      options.onHeartbeat?.(payload);
      return payload;
    }

    async function writeHostStatus(extra = {}, source = "status") {
      try {
        await publishHostStatus(extra, source);
        return true;
      } catch (error) {
        if (source === "heartbeat") {
          consecutiveHeartbeatFailures += 1;
          if (
            consecutiveHeartbeatFailures === 1 ||
            consecutiveHeartbeatFailures % 6 === 0
          ) {
            logPublisherError("[CameraPublisher] Heartbeat write failed", error);
          }
          options.onError?.("heartbeat_failed", error);
          return false;
        }

        logPublisherError("[CameraPublisher] Host status write failed", error);
        options.onError?.("host_status_failed", error);
        return false;
      }
    }

    async function writeHostStatusWithRetry(extra = {}, source = "status") {
      const attempts = source === "heartbeat" ? 1 : 3;
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const written = await writeHostStatus(extra, source);
        if (written) return true;
        if (attempt < attempts) await delay(800 * attempt);
      }
      return false;
    }

    function activePeerCount() {
      return Array.from(peers.values()).filter((entry) => !entry.closed).length;
    }

    function notifyViewerCount() {
      const count = activePeerCount();
      options.onViewerCount?.(count);
      hostRef.update({
        viewerCount: count,
        updatedAt: timestampValue(),
      }).catch((error) => {
        logPublisherError("[CameraPublisher] Viewer count update failed", error);
      });
    }

    async function closePeer(sessionId, status = "closed") {
      const peer = peers.get(sessionId);
      if (!peer) return;
      peer.closed = true;
      peer.unsubscribes.forEach((unsubscribe) => unsubscribe());
      peer.viewerCandidatesSeen.clear();
      peer.peerConnection.close();
      peers.delete(sessionId);
      await db.ref(`camera_sessions/${sessionId}`).update({
        status,
        updatedAt: timestampValue(),
      });
      notifyViewerCount();
    }

    async function failExpiredSession(sessionId, session) {
      const createdAt = Number(session.createdAt || 0);
      const expired =
        Number(session.expiresAt || 0) <= now() ||
        (session.status === "requesting" &&
          createdAt > 0 &&
          now() - createdAt > REQUEST_TIMEOUT_MS);
      if (!expired) return false;
      await db.ref(`camera_sessions/${sessionId}`).update({
        status: "expired",
        updatedAt: timestampValue(),
      });
      await closePeer(sessionId, "expired");
      return true;
    }

    async function handleSession(sessionId, session, mediaStream) {
      if (peers.has(sessionId)) return;
      if (!isSessionActive(session)) return;
      if (await failExpiredSession(sessionId, session)) return;
      if (session.status !== "requesting") return;
      console.info("[CameraPublisher] session request received", { sessionId });

      if (!streamReady || !hasLiveVideoTrack(mediaStream)) {
        await db.ref(`camera_sessions/${sessionId}`).update({
          status: "unavailable",
          updatedAt: timestampValue(),
        });
        return;
      }

      if (activePeerCount() >= MAX_VIEWERS) {
        await db.ref(`camera_sessions/${sessionId}`).update({
          status: "busy",
          updatedAt: timestampValue(),
        });
        return;
      }

      const sessionRef = db.ref(`camera_sessions/${sessionId}`);
      const peerConnection = createPeerConnection((state) => {
        options.onPeerState?.(sessionId, state);
        if (state === "connected") {
          console.info("[CameraPublisher] peer connected", { sessionId });
          sessionRef.update({
            status: "connected",
            updatedAt: timestampValue(),
          });
        }
        if (["failed", "disconnected", "closed"].includes(state)) {
          closePeer(sessionId, state === "closed" ? "closed" : "failed").catch(
            (error) => console.warn("CameraHost signaling close failed", error),
          );
        }
      });
      const entry = {
        peerConnection,
        unsubscribes: [],
        viewerCandidatesSeen: new Set(),
        closed: false,
      };
      peers.set(sessionId, entry);

      mediaStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, mediaStream);
      });

      peerConnection.onicecandidate = (event) => {
        if (!event.candidate) return;
        sessionRef.child("hostCandidates").push({
          ...toIceCandidateJson(event.candidate),
          createdAt: timestampValue(),
        });
      };

      const answerRef = sessionRef.child("answer");
      const answerHandler = async (snapshot) => {
        const answer = snapshot.val();
        if (!answer || peerConnection.remoteDescription) return;
        try {
          console.info("[CameraPublisher] answer received", { sessionId });
          await peerConnection.setRemoteDescription(
            new RTCSessionDescription(answer),
          );
          await sessionRef.update({
            status: "connecting",
            updatedAt: timestampValue(),
          });
        } catch (error) {
          console.warn("CameraHost answer rejected", error);
          await closePeer(sessionId, "failed");
        }
      };
      answerRef.on("value", answerHandler);
      entry.unsubscribes.push(() => answerRef.off("value", answerHandler));

      const viewerCandidatesRef = sessionRef.child("viewerCandidates");
      const viewerCandidateHandler = (snapshot) => {
        const candidates = snapshot.val() || {};
        Object.entries(candidates).forEach(([key, candidate]) => {
          if (entry.viewerCandidatesSeen.has(key) || !candidate?.candidate) {
            return;
          }
          entry.viewerCandidatesSeen.add(key);
          peerConnection
            .addIceCandidate(new RTCIceCandidate(candidate))
            .catch((error) => {
              console.warn("CameraHost viewer ICE rejected", error);
            });
        });
      };
      viewerCandidatesRef.on("value", viewerCandidateHandler);
      entry.unsubscribes.push(() =>
        viewerCandidatesRef.off("value", viewerCandidateHandler),
      );

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      await sessionRef.update({
        status: "offer_created",
        offer: {
          type: offer.type,
          sdp: offer.sdp,
        },
        updatedAt: timestampValue(),
      });
      console.info("[CameraPublisher] offer created", { sessionId });
      notifyViewerCount();
      options.onOfferCreated?.(sessionId);
    }

    function startSessionListener(getMediaStream) {
      if (sessionsListenerActive) return;
      sessionsListenerActive = true;
      console.info("[CameraPublisher] listening for sessions", { hostDeviceId });
      const sessionHandler = (snapshot) => {
        const sessions = snapshot.val() || {};
        Object.entries(sessions).forEach(([sessionId, session]) => {
          handleSession(sessionId, session, getMediaStream()).catch((error) => {
            console.warn("CameraHost session failed", error);
            db.ref(`camera_sessions/${sessionId}`).update({
              status: "failed",
              updatedAt: timestampValue(),
            });
          });
        });
      };
      const sessionErrorHandler = (error) => {
        logPublisherError("[CameraPublisher] Session listener failed", error);
        options.onError?.("session_listener_failed", error);
      };
      sessionsQuery.on("value", sessionHandler, sessionErrorHandler);
      options.unsubscribes?.push(() => sessionsQuery.off("value", sessionHandler));
    }

    async function setStreamReady(nextReady, extra = {}) {
      streamReady = Boolean(nextReady);
      return writeHostStatusWithRetry(extra, "status");
    }

    function startHeartbeat() {
      if (heartbeatTimer) return;
      heartbeatTimer = window.setInterval(() => {
        writeHostStatus({}, "heartbeat");
      }, HEARTBEAT_INTERVAL_MS);
    }

    async function start(getMediaStream) {
      stopped = false;
      console.info("[CameraPublisher] initialized", { hostDeviceId });
      startSessionListener(getMediaStream);
      const initialStatusWritten = await writeHostStatusWithRetry({}, "status");
      startHeartbeat();
      return initialStatusWritten;
    }

    async function stopPeers(status = "closed") {
      const sessionIds = Array.from(peers.keys());
      await Promise.all(sessionIds.map((sessionId) => closePeer(sessionId, status)));
    }

    async function shutdown() {
      stopped = true;
      if (heartbeatTimer) {
        window.clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      await stopPeers("closed");
      await hostRef.update({
        online: false,
        streamReady: false,
        viewerCount: 0,
        fallDetectionActive: false,
        updatedAt: timestampValue(),
        lastHeartbeatAt: timestampValue(),
      }).catch((error) => {
        logPublisherError("[CameraPublisher] Host shutdown status failed", error);
      });
    }

    return {
      start,
      setStreamReady,
      stopPeers,
      shutdown,
      publishHostStatus,
      getViewerCount: activePeerCount,
    };
  }

  async function createViewerConnection(options) {
    const db = getFirebaseDatabase();
    const hostDeviceId = sanitizeKey(options.hostDeviceId, HOST_DEVICE_ID);
    const viewerId = sanitizeKey(
      options.viewerId,
      `viewer_${now()}_${Math.random().toString(36).slice(2, 8)}`,
    );
    const sessionRef = db.ref("camera_sessions").push();
    const sessionId = sessionRef.key;
    const viewerCandidatesSeen = new Set();
    const unsubscribes = [];
    let closed = false;
    let offerReceivedLogged = false;
    let answerWrittenLogged = false;
    let connectedLogged = false;

    const viewerPeerConnection = createPeerConnection((state) => {
      options.onConnectionState?.(state);
      if (state === "connected") {
        if (!connectedLogged) {
          console.info("[FamilyViewer] connected", { sessionId });
          connectedLogged = true;
        }
        sessionRef.update({
          status: "connected",
          updatedAt: timestampValue(),
        });
      }
      if (["failed", "disconnected", "closed"].includes(state) && !closed) {
        sessionRef.update({
          status: state === "closed" ? "closed" : "failed",
          updatedAt: timestampValue(),
        });
      }
    });

    viewerPeerConnection.ontrack = (event) => {
      const [remoteStream] = event.streams || [];
      if (remoteStream) {
        console.info("[FamilyViewer] remote track received", { sessionId });
        options.onRemoteStream?.(remoteStream);
      }
    };

    viewerPeerConnection.onicecandidate = (event) => {
      if (!event.candidate) return;
      sessionRef.child("viewerCandidates").push({
        ...toIceCandidateJson(event.candidate),
        createdAt: timestampValue(),
      });
    };

    await sessionRef.set({
      hostDeviceId,
      viewerId,
      status: "requesting",
      offer: null,
      answer: null,
      createdAt: timestampValue(),
      updatedAt: timestampValue(),
      expiresAt: now() + SESSION_TTL_MS,
    });
    console.info("[FamilyViewer] session created", { sessionId, hostDeviceId });
    options.onSessionStatus?.("requesting", { sessionId });
    console.info("[FamilyViewer] waiting for offer", { sessionId });
    options.onSessionStatus?.("waiting_offer", { sessionId });

    const sessionHandler = async (snapshot) => {
      const session = snapshot.val();
      if (!session) return;
      options.onSessionStatus?.(session.status || "requesting", session);

      if (["busy", "unavailable", "expired", "failed", "closed"].includes(session.status)) {
        return;
      }

      if (!session.offer) {
        if (session.status === "requesting") {
          options.onSessionStatus?.("waiting_offer", session);
        }
        return;
      }
      if (viewerPeerConnection.remoteDescription) return;
      try {
        if (!offerReceivedLogged) {
          console.info("[FamilyViewer] offer received", { sessionId });
          offerReceivedLogged = true;
        }
        options.onSessionStatus?.("answering", session);
        await viewerPeerConnection.setRemoteDescription(
          new RTCSessionDescription(session.offer),
        );
        const answer = await viewerPeerConnection.createAnswer();
        await viewerPeerConnection.setLocalDescription(answer);
        await sessionRef.update({
          answer: {
            type: answer.type,
            sdp: answer.sdp,
          },
          status: "answer_created",
          updatedAt: timestampValue(),
        });
        if (!answerWrittenLogged) {
          console.info("[FamilyViewer] answer written", { sessionId });
          answerWrittenLogged = true;
        }
        options.onSessionStatus?.("answer_created", session);
      } catch (error) {
        console.warn("FamilyViewer offer handling failed", error);
        await sessionRef.update({
          status: "failed",
          updatedAt: timestampValue(),
        });
      }
    };
    sessionRef.on("value", sessionHandler);
    unsubscribes.push(() => sessionRef.off("value", sessionHandler));

    const hostCandidatesRef = sessionRef.child("hostCandidates");
    const hostCandidateHandler = (snapshot) => {
      const candidates = snapshot.val() || {};
      Object.entries(candidates).forEach(([key, candidate]) => {
        if (viewerCandidatesSeen.has(key) || !candidate?.candidate) return;
        viewerCandidatesSeen.add(key);
        viewerPeerConnection
          .addIceCandidate(new RTCIceCandidate(candidate))
          .catch((error) => {
            console.warn("FamilyViewer host ICE rejected", error);
          });
      });
    };
    hostCandidatesRef.on("value", hostCandidateHandler);
    unsubscribes.push(() => hostCandidatesRef.off("value", hostCandidateHandler));

    async function close(status = "closed") {
      if (closed) return;
      closed = true;
      unsubscribes.forEach((unsubscribe) => unsubscribe());
      viewerCandidatesSeen.clear();
      viewerPeerConnection.close();
      await sessionRef.update({
        status,
        updatedAt: timestampValue(),
      });
    }

    return {
      sessionId,
      viewerPeerConnection,
      close,
    };
  }

  window.TsunagariCameraSignaling = {
    HOST_DEVICE_ID,
    HEARTBEAT_INTERVAL_MS,
    HOST_OFFLINE_TIMEOUT_MS,
    MAX_VIEWERS,
    RTC_CONFIGURATION,
    createCameraHostController,
    createViewerConnection,
    getFirebaseDatabase,
    isSessionActive,
    hasLiveVideoTrack,
  };
})();
