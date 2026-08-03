(function () {
  const CAMERA_ID = "default_cam";
  const LOCATION = "living_room";
  const LOG_KEY = "tsunagari_fall_camera_log";
  const MAX_LOCAL_LOG_ITEMS = 20;
  const DETECTION_INTERVAL_MS = 200;
  const LYING_DURATION_LOG_INTERVAL_MS = 1000;
  const SUSPECTED_FALL_MS = 1500;
  // Demo threshold. Real deployments may prefer 5000-10000 ms.
  const CONFIRMED_FALL_MS = 3000;
  const FALL_ALERT_COOLDOWN_MS = 30000;
  const FALL_EMERGENCY_COOLDOWN_MS = 30000;
  const FALL_RESET_GRACE_MS = 1500;
  const MIN_FALL_CONFIDENCE = 0.7;
  const MIN_VALID_LANDMARKS = 12;
  const MIN_LANDMARK_VISIBILITY = 0.5;
  const CHAMI_EMERGENCY_TARGET = "chami_001";
  const CHAMI_EMERGENCY_ACTION = "emergency_check";
  const CHAMI_EMERGENCY_TEXT =
    "Camera phát hiện nguy cơ té ngã. Chami kiểm tra tình trạng người dùng.";
  const MEDIAPIPE_MODULE_URL =
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs";
  const MEDIAPIPE_WASM_ROOT =
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
  const POSE_MODEL_URL =
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";
  const POSE_CONNECTIONS = [
    [11, 12],
    [11, 13],
    [13, 15],
    [12, 14],
    [14, 16],
    [11, 23],
    [12, 24],
    [23, 24],
    [23, 25],
    [25, 27],
    [27, 29],
    [29, 31],
    [24, 26],
    [26, 28],
    [28, 30],
    [30, 32],
  ];
  const FALL_STAGE_LABELS = {
    normal: "Normal",
    suspected_fall: "Suspected Fall",
    confirmed_fall: "Confirmed Fall",
    chami_check_sent: "Chami Check Sent",
    cooldown: "Cooldown",
  };
  const FALL_STAGE_TONES = {
    normal: "success",
    suspected_fall: "warning",
    confirmed_fall: "danger",
    chami_check_sent: "accent",
    cooldown: "accent",
  };

  const video = document.getElementById("camera-video");
  const canvas = document.getElementById("camera-overlay");
  const emptyState = document.getElementById("empty-camera-state");
  const startButton = document.getElementById("start-camera");
  const stopButton = document.getElementById("stop-camera");
  const testFallAlertButton = document.getElementById("test-fall-alert");
  const resetFallStateButton = document.getElementById("reset-fall-state");
  const clearLogButton = document.getElementById("clear-log");
  const logList = document.getElementById("local-log");
  const fallCommandStatus = document.getElementById("fall-command-status");
  const cameraStatus = document.getElementById("camera-status");
  const cameraStatusPill = document.getElementById("camera-status-pill");
  const personStatus = document.getElementById("person-status");
  const postureStatus = document.getElementById("posture-status");
  const detectionStage = document.getElementById("detection-stage");
  const fallStatus = document.getElementById("fall-status");
  const lyingDurationStatus = document.getElementById("lying-duration");
  const fallConfidenceStatus = document.getElementById("fall-confidence");
  const cooldownStatus = document.getElementById("cooldown-status");
  const lastChamiCommandStatus = document.getElementById("last-chami-command");

  let stream = null;
  let firestoreDb = null;
  let firestoreInitAttempted = false;
  let poseLandmarker = null;
  let poseLoadPromise = null;
  let detectionAnimationId = null;
  let cooldownAnimationId = null;
  let lastDetectionAt = 0;
  let lyingStartAt = null;
  let fallEventActive = false;
  let currentFallAlertId = null;
  let fallAlertCreatePending = false;
  let confirmedUpdateSent = false;
  let confirmedUpdatePending = false;
  let nextFallEventAllowedAt = 0;
  let fallEventGeneration = 0;
  let mediaPipeRuntimeErrorLogged = false;
  let lastFallEmergencyCommandAt = 0;
  let fallEmergencyCommandPending = false;
  let currentFallEventConfirmed = false;
  let chamiCheckSentForCurrentEvent = false;
  let fallExitStartedAt = null;
  let lastLyingDurationLoggedAt = 0;
  let lastPersonDetected = false;
  let suspectedFallLogged = false;
  let currentFallStage = "normal";
  let currentChamiCommandId = null;
  let currentFallFlowId = null;
  let fallConfirmedCareEventWritten = false;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function getFirebaseConfig() {
    if (window.firebaseConfig) return window.firebaseConfig;

    try {
      if (typeof firebaseConfig !== "undefined") return firebaseConfig;
    } catch (error) {
      return null;
    }

    return null;
  }

  function initFirestore() {
    if (firestoreInitAttempted) return firestoreDb;
    firestoreInitAttempted = true;

    const config = getFirebaseConfig();

    if (!window.firebase || typeof firebase.initializeApp !== "function") {
      console.warn("FallCamera: Firebase SDK is not loaded.");
      return null;
    }

    if (!config) {
      console.warn("FallCamera: Firebase config is not available.");
      return null;
    }

    if (typeof firebase.firestore !== "function") {
      console.warn("FallCamera: Firestore SDK is not loaded.");
      return null;
    }

    try {
      if (!firebase.apps || !firebase.apps.length) {
        firebase.initializeApp(config);
      }

      firestoreDb = firebase.firestore();
      console.log("FallCamera: Firestore initialized.");
      return firestoreDb;
    } catch (error) {
      console.warn("FallCamera: Firestore initialization failed.", error);
      return null;
    }
  }

  function getServerTimestamp() {
    return firebase.firestore.FieldValue.serverTimestamp();
  }

  function getFirestoreOrThrow() {
    const db = initFirestore();

    if (!db) {
      throw new Error("Firebase Firestore is not configured");
    }

    return db;
  }

  function getLogs() {
    try {
      return JSON.parse(localStorage.getItem(LOG_KEY)) || [];
    } catch (error) {
      return [];
    }
  }

  function saveLogs(logs) {
    localStorage.setItem(LOG_KEY, JSON.stringify(logs));
  }

  function renderLogs() {
    const logs = getLogs();
    logList.innerHTML = "";

    if (logs.length === 0) {
      const emptyItem = document.createElement("li");
      emptyItem.className = "empty-log";
      emptyItem.textContent = "No local events";
      logList.appendChild(emptyItem);
      return;
    }

    logs.forEach((entry) => {
      const item = document.createElement("li");
      const title = document.createElement("strong");
      const time = document.createElement("time");

      title.textContent = entry.message;
      time.dateTime = entry.timestamp;
      time.textContent = new Date(entry.timestamp).toLocaleString();

      item.appendChild(title);
      item.appendChild(time);
      logList.appendChild(item);
    });
  }

  function addLog(message) {
    const logs = getLogs();
    logs.unshift({
      cameraId: CAMERA_ID,
      location: LOCATION,
      message,
      timestamp: new Date().toISOString(),
    });
    saveLogs(logs.slice(0, MAX_LOCAL_LOG_ITEMS));
    renderLogs();
  }

  function setFallCommandStatus(message = "", tone = "") {
    if (!fallCommandStatus) return;

    fallCommandStatus.textContent = message;

    if (tone) {
      fallCommandStatus.dataset.tone = tone;
    } else {
      delete fallCommandStatus.dataset.tone;
    }
  }

  function logCameraEvent(message, level = "info", error = null) {
    addLog(message);

    if (level === "error") {
      console.error("FallCamera:", message, error || "");
      return;
    }

    if (level === "warn") {
      console.warn("FallCamera:", message, error || "");
      return;
    }

    console.log("FallCamera:", message);
  }

  function getFirebaseService() {
    if (window.FirebaseService) {
      return window.FirebaseService;
    }

    try {
      if (typeof FirebaseService !== "undefined") {
        return FirebaseService;
      }
    } catch (error) {
      return null;
    }

    return null;
  }

  function getRealtimeDatabaseOrThrow() {
    if (!window.firebase || typeof firebase.database !== "function") {
      throw new Error("firebase.database is not available");
    }

    const config = getFirebaseConfig();
    if ((!firebase.apps || !firebase.apps.length) && config) {
      firebase.initializeApp(config);
    }

    const realtimeDb = firebase.database();
    if (!realtimeDb) {
      throw new Error("Realtime Database is not initialized");
    }

    return realtimeDb;
  }

  function objectToArray(value) {
    if (!value || typeof value !== "object") {
      return [];
    }

    return Object.entries(value).map(([id, data]) => {
      if (data && typeof data === "object") {
        return { id, ...data };
      }

      return { id, value: data };
    });
  }

  function setStatusTone(element, tone = "") {
    if (!element) return;

    if (tone) {
      element.dataset.tone = tone;
    } else {
      delete element.dataset.tone;
    }
  }

  function getCooldownRemainingMs(now = Date.now()) {
    const alertCooldownRemaining = Math.max(0, nextFallEventAllowedAt - now);
    const emergencyCooldownRemaining = lastFallEmergencyCommandAt
      ? Math.max(
          0,
          lastFallEmergencyCommandAt + FALL_EMERGENCY_COOLDOWN_MS - now,
        )
      : 0;

    return Math.max(alertCooldownRemaining, emergencyCooldownRemaining);
  }

  function updateCooldownUI(now = Date.now()) {
    const remainingMs = getCooldownRemainingMs(now);

    if (remainingMs > 0) {
      cooldownStatus.textContent = `Cooldown: ${Math.ceil(remainingMs / 1000)}s`;
      setStatusTone(cooldownStatus, "warning");
      return remainingMs;
    }

    cooldownStatus.textContent = "Ready";
    setStatusTone(cooldownStatus, "success");
    return 0;
  }

  function updateLastChamiCommandStatus(message = "Waiting", tone = "") {
    if (!lastChamiCommandStatus) return;

    lastChamiCommandStatus.textContent = message;
    setStatusTone(lastChamiCommandStatus, tone);
  }

  function getCurrentLyingDuration(now = Date.now()) {
    return lyingStartAt ? Math.max(0, now - lyingStartAt) : 0;
  }

  function calculateDemoFallConfidence(hasPerson, stage, lyingDurationMs) {
    // Demo confidence only. This is not a true ML probability.
    if (!hasPerson) return 0;

    if (stage === "normal") return 20;

    if (stage === "cooldown") return 30;

    if (stage === "suspected_fall") {
      const progress = clamp(lyingDurationMs / CONFIRMED_FALL_MS, 0, 1);
      return Math.round(40 + progress * 40);
    }

    return 95;
  }

  function updateFallProgressUI({
    hasPerson = lastPersonDetected,
    lyingDurationMs = getCurrentLyingDuration(),
    stage = currentFallStage,
    now = Date.now(),
  } = {}) {
    const targetSeconds = (CONFIRMED_FALL_MS / 1000).toFixed(1);
    const currentSeconds = hasPerson
      ? (lyingDurationMs / 1000).toFixed(1)
      : "0.0";
    const demoConfidence = calculateDemoFallConfidence(
      hasPerson,
      stage,
      lyingDurationMs,
    );

    lyingDurationStatus.textContent = `${currentSeconds}s / ${targetSeconds}s`;
    fallConfidenceStatus.textContent = `${demoConfidence}% (demo)`;
    setStatusTone(
      fallConfidenceStatus,
      FALL_STAGE_TONES[stage] || (hasPerson ? "normal" : "normal"),
    );
    updateCooldownUI(now);
  }

  function setFallStage(
    stage,
    {
      hasPerson = lastPersonDetected,
      lyingDurationMs = getCurrentLyingDuration(),
      fallStatusText = FALL_STAGE_LABELS[stage] || "Normal",
      now = Date.now(),
    } = {},
  ) {
    currentFallStage = stage;

    detectionStage.textContent = FALL_STAGE_LABELS[stage] || "Normal";
    fallStatus.textContent = fallStatusText;

    const tone = FALL_STAGE_TONES[stage] || "normal";
    setStatusTone(detectionStage, tone);
    setStatusTone(fallStatus, tone);

    updateFallProgressUI({ hasPerson, lyingDurationMs, stage, now });
  }

  function refreshIdleStage(now = Date.now(), hasPerson = lastPersonDetected) {
    const remainingMs = getCooldownRemainingMs(now);

    if (
      remainingMs > 0 &&
      !lyingStartAt &&
      !fallEventActive &&
      !currentFallEventConfirmed &&
      !chamiCheckSentForCurrentEvent
    ) {
      if (currentFallStage !== "cooldown") {
        logCameraEvent("FallCamera: fall emergency cooldown active");
      }
      setFallStage("cooldown", {
        hasPerson,
        lyingDurationMs: 0,
        fallStatusText: "Cooldown",
        now,
      });
      return;
    }

    setFallStage("normal", {
      hasPerson,
      lyingDurationMs: 0,
      fallStatusText: "Normal",
      now,
    });
  }

  async function hasPendingChamiEmergencyCheckCommand() {
    const firebaseService = getFirebaseService();
    let commands = [];

    if (firebaseService && typeof firebaseService.listCommands === "function") {
      logCameraEvent("Using FirebaseService wrapper for Chami emergency command");
      commands = await firebaseService.listCommands();
    } else {
      logCameraEvent("Using firebase.database fallback for Chami emergency command");
      const realtimeDb = getRealtimeDatabaseOrThrow();
      const snapshot = await realtimeDb.ref("commands").once("value");
      commands = objectToArray(snapshot.val());
    }

    return commands.some((command) => {
      if (!command || typeof command !== "object") return false;

      return (
        command.target === CHAMI_EMERGENCY_TARGET &&
        command.action === CHAMI_EMERGENCY_ACTION &&
        command.status === "pending"
      );
    });
  }

  async function createChamiEmergencyCheckCommand() {
    const firebaseService = getFirebaseService();

    if (
      firebaseService &&
      typeof firebaseService.createRobotActionCommand === "function"
    ) {
      logCameraEvent("Using FirebaseService wrapper for Chami emergency command");
      return firebaseService.createRobotActionCommand(
        CHAMI_EMERGENCY_TARGET,
        CHAMI_EMERGENCY_ACTION,
        CHAMI_EMERGENCY_TEXT,
        { source: "fall_camera" },
      );
    }

    logCameraEvent("Using firebase.database fallback for Chami emergency command");
    const realtimeDb = getRealtimeDatabaseOrThrow();
    const ref = realtimeDb.ref("commands").push();
    const payload = {
      source: "fall_camera",
      target: CHAMI_EMERGENCY_TARGET,
      type: "robot_action",
      action: CHAMI_EMERGENCY_ACTION,
      text: CHAMI_EMERGENCY_TEXT,
      status: "pending",
      createdAt: firebase.database.ServerValue.TIMESTAMP,
    };
    const data = {
      id: ref.key,
      ...payload,
    };

    await ref.set(data);
    return data;
  }

  function getOrCreateFallFlowId() {
    if (!currentFallFlowId) {
      currentFallFlowId = `fall_${Date.now()}`;
    }

    return currentFallFlowId;
  }

  async function writeFallResponseCareEvent(type, status, message, detail, extra = {}) {
    const payload = {
      flow: "fall_response",
      flowId: getOrCreateFallFlowId(),
      source: "fall_camera",
      type,
      status,
      message,
      detail,
      relatedCommandId: extra.relatedCommandId || "",
      relatedAlertId: "",
      cameraId: CAMERA_ID,
      location: LOCATION,
    };

    try {
      const firebaseService = getFirebaseService();
      if (
        firebaseService &&
        typeof firebaseService.createCareEvent === "function"
      ) {
        await firebaseService.createCareEvent(payload);
      } else {
        const realtimeDb = getRealtimeDatabaseOrThrow();
        const ref = realtimeDb.ref("care_events").push();
        await ref.set({
          id: ref.key,
          ...payload,
          createdAt: firebase.database.ServerValue.TIMESTAMP,
        });
      }

      logCameraEvent(`care event written: ${type}`);
      return true;
    } catch (error) {
      logCameraEvent(`care event write failed: ${type}`, "warn", error);
      return false;
    }
  }

  async function handleFallConfirmed() {
    logCameraEvent("Fall confirmed by camera");

    if (fallEmergencyCommandPending) {
      return;
    }

    fallEmergencyCommandPending = true;
    getOrCreateFallFlowId();
    if (!fallConfirmedCareEventWritten) {
      fallConfirmedCareEventWritten = true;
      writeFallResponseCareEvent(
        "fall_confirmed",
        "danger",
        "Camera phát hiện nguy cơ té ngã",
        "Fall Camera xác nhận tư thế nằm/ngã",
      );
    }
    setFallStage("confirmed_fall", {
      hasPerson: lastPersonDetected,
      lyingDurationMs: getCurrentLyingDuration(),
      fallStatusText: "Confirmed Fall",
    });

    try {
      if (await hasPendingChamiEmergencyCheckCommand()) {
        chamiCheckSentForCurrentEvent = true;
        logCameraEvent("Emergency_check command already pending for Chami");
        setFallStage("chami_check_sent", {
          hasPerson: lastPersonDetected,
          lyingDurationMs: getCurrentLyingDuration(),
          fallStatusText: "Chami Check Sent",
        });
        updateLastChamiCommandStatus("Pending command already exists", "warning");
        setFallCommandStatus(
          "Chami đã có yêu cầu kiểm tra đang chờ xử lý",
          "warning",
        );
        return;
      }

      if (
        lastFallEmergencyCommandAt &&
        Date.now() - lastFallEmergencyCommandAt < FALL_EMERGENCY_COOLDOWN_MS
      ) {
        logCameraEvent("Fall emergency_check skipped by cooldown");
        logCameraEvent("FallCamera: fall emergency cooldown active");
        setFallStage("cooldown", {
          hasPerson: lastPersonDetected,
          lyingDurationMs: getCurrentLyingDuration(),
          fallStatusText: "Cooldown",
        });
        updateLastChamiCommandStatus("Cooldown active", "warning");
        setFallCommandStatus(
          "Đã phát hiện ngã, đang trong thời gian chờ chống spam",
          "warning",
        );
        return;
      }

      logCameraEvent("Creating Chami emergency_check command from fall camera");
      const command = await createChamiEmergencyCheckCommand();
      lastFallEmergencyCommandAt = Date.now();
      chamiCheckSentForCurrentEvent = true;
      currentChamiCommandId = command && command.id ? command.id : null;
      logCameraEvent("Created Chami emergency_check command from fall camera");
      if (currentChamiCommandId) {
        addLog(`Chami emergency_check command id: ${currentChamiCommandId}`);
      }
      writeFallResponseCareEvent(
        "chami_command_sent",
        "active",
        "Đã yêu cầu Chami kiểm tra người dùng",
        "Command emergency_check đã được gửi tới Chami",
        { relatedCommandId: currentChamiCommandId || "" },
      );
      setFallStage("chami_check_sent", {
        hasPerson: lastPersonDetected,
        lyingDurationMs: getCurrentLyingDuration(),
        fallStatusText: "Chami Check Sent",
      });
      updateLastChamiCommandStatus(
        currentChamiCommandId
          ? `Created: ${currentChamiCommandId}`
          : "Created successfully",
        "success",
      );
      setFallCommandStatus("Đã yêu cầu Chami kiểm tra người dùng", "success");
    } catch (error) {
      logCameraEvent(
        "Failed to create Chami emergency_check command from fall camera",
        "error",
        error,
      );
      updateLastChamiCommandStatus("Command error", "danger");
      setFallCommandStatus("Không thể gửi yêu cầu kiểm tra tới Chami", "danger");
    } finally {
      fallEmergencyCommandPending = false;
      updateCooldownUI();
    }
  }

  function markCurrentFallAlertConfirmedIfNeeded() {
    if (
      !currentFallAlertId ||
      confirmedUpdateSent ||
      confirmedUpdatePending ||
      !currentFallEventConfirmed
    ) {
      return;
    }

    confirmedUpdateSent = true;
    confirmedUpdatePending = true;
    addLog(`Fall event confirmed: ${currentFallAlertId}`);

    updateFallAlertConfirmed(currentFallAlertId).finally(() => {
      confirmedUpdatePending = false;
    });
  }

  function confirmFallFromCamera(now = Date.now()) {
    if (currentFallEventConfirmed) {
      return;
    }

    currentFallEventConfirmed = true;
    setFallStage("confirmed_fall", {
      hasPerson: true,
      lyingDurationMs: getCurrentLyingDuration(now),
      fallStatusText: "Confirmed Fall",
      now,
    });
    logCameraEvent("FallCamera: confirmed fall threshold reached");
    logCameraEvent("FallCamera: real camera confirmed fall");
    handleFallConfirmed();
    markCurrentFallAlertConfirmedIfNeeded();
  }

  function setCameraOnline(isOnline) {
    cameraStatus.textContent = isOnline ? "Online" : "Offline";
    cameraStatusPill.textContent = isOnline ? "Online" : "Offline";
    cameraStatusPill.classList.toggle("online", isOnline);
    cameraStatusPill.classList.toggle("offline", !isOnline);
    emptyState.classList.toggle("hidden", isOnline);
    startButton.disabled = isOnline;
    stopButton.disabled = !isOnline;
  }

  async function syncCameraOnline() {
    const db = getFirestoreOrThrow();
    const timestamp = getServerTimestamp();

    await db.collection("cameras").doc(CAMERA_ID).set(
      {
        name: "Living Room Camera",
        location: LOCATION,
        status: "online",
        deviceType: "webcam",
        aiModel: "none_mvp",
        lastSeen: timestamp,
        updatedAt: timestamp,
      },
      { merge: true },
    );
  }

  async function syncCameraOffline() {
    const db = getFirestoreOrThrow();

    await db.collection("cameras").doc(CAMERA_ID).update({
      status: "offline",
      updatedAt: getServerTimestamp(),
    });
  }

  async function runCameraStatusSync(syncFn, successMessage) {
    try {
      await syncFn();
      addLog(successMessage);
      console.log("FallCamera:", successMessage);
    } catch (error) {
      const message = `Firestore sync failed: ${error.message}`;
      addLog(message);
      console.warn("FallCamera:", message, error);
    }
  }

  async function initPoseLandmarker() {
    if (poseLandmarker) return poseLandmarker;
    if (poseLoadPromise) return poseLoadPromise;

    postureStatus.textContent = "Loading MediaPipe Pose...";
    addLog("Loading MediaPipe Pose...");

    poseLoadPromise = (async () => {
      try {
        const { FilesetResolver, PoseLandmarker } = await import(
          MEDIAPIPE_MODULE_URL
        );
        const vision = await FilesetResolver.forVisionTasks(
          MEDIAPIPE_WASM_ROOT,
        );

        poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: POSE_MODEL_URL,
          },
          runningMode: "VIDEO",
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
          outputSegmentationMasks: false,
        });

        postureStatus.textContent = "Unknown";
        addLog("MediaPipe Pose ready");
        console.log("FallCamera: MediaPipe Pose Landmarker ready.");
        return poseLandmarker;
      } catch (error) {
        poseLoadPromise = null;
        postureStatus.textContent = "MediaPipe error";
        addLog(`MediaPipe Pose load failed: ${error.message}`);
        console.error("FallCamera: MediaPipe Pose load failed.", error);
        throw error;
      }
    })();

    return poseLoadPromise;
  }

  function resizeOverlay() {
    const width = video.videoWidth || video.clientWidth;
    const height = video.videoHeight || video.clientHeight;

    if (!width || !height) return;

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    drawOverlay();
  }

  function drawOverlay() {
    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "rgba(255, 255, 255, 0.42)";
    context.lineWidth = 2;
    context.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
  }

  function isValidLandmark(landmark) {
    if (!landmark) return false;
    if (landmark.x < 0 || landmark.x > 1 || landmark.y < 0 || landmark.y > 1) {
      return false;
    }

    return (landmark.visibility ?? 1) >= MIN_LANDMARK_VISIBILITY;
  }

  function getLandmarkPoint(landmark) {
    return {
      x: landmark.x * canvas.width,
      y: landmark.y * canvas.height,
    };
  }

  function calculatePosture(landmarks) {
    if (!landmarks || landmarks.length === 0) {
      return {
        hasPerson: false,
        posture: "Unknown",
        confidence: 0,
        validLandmarks: [],
      };
    }

    const validLandmarks = landmarks.filter(isValidLandmark);

    if (validLandmarks.length < MIN_VALID_LANDMARKS) {
      return {
        hasPerson: false,
        posture: "Unknown",
        confidence: 0,
        validLandmarks,
      };
    }

    const points = validLandmarks.map(getLandmarkPoint);
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const bodyWidth = Math.max(0, maxX - minX);
    const bodyHeight = Math.max(0, maxY - minY);
    const bodyRatio = bodyHeight > 0 ? bodyWidth / bodyHeight : 0;
    const confidence =
      validLandmarks.reduce(
        (sum, landmark) => sum + (landmark.visibility ?? 0.8),
        0,
      ) / validLandmarks.length;

    let posture = "Unknown";
    if (bodyHeight > bodyWidth * 1.2) {
      posture = "Standing";
    } else if (bodyWidth > bodyHeight * 1.3) {
      posture = "Lying";
    }

    return {
      hasPerson: true,
      posture,
      bodyWidth,
      bodyHeight,
      bodyRatio,
      confidence,
      validLandmarks,
      boundingBox: { minX, maxX, minY, maxY },
    };
  }

  function updatePoseStatus(postureInfo) {
    if (!postureInfo.hasPerson) {
      lastPersonDetected = false;
      personStatus.textContent = "No person";
      postureStatus.textContent = "Unknown";
      return;
    }

    if (!lastPersonDetected) {
      logCameraEvent("FallCamera: person detected");
    }

    lastPersonDetected = true;
    personStatus.textContent = "Person detected";
    postureStatus.textContent = postureInfo.posture;
  }

  function handleFallDetection(postureInfo, now = Date.now()) {
    updateCooldownUI(now);

    if (!postureInfo.hasPerson || postureInfo.posture !== "Lying") {
      const hadActiveSequence =
        lyingStartAt ||
        fallEventActive ||
        currentFallAlertId ||
        currentFallEventConfirmed ||
        chamiCheckSentForCurrentEvent;

      if (hadActiveSequence) {
        if (!fallExitStartedAt) {
          fallExitStartedAt = now;
        }

        if (now - fallExitStartedAt >= FALL_RESET_GRACE_MS) {
          resetFallEvent(now, true, "recovery");
        } else {
          refreshIdleStage(now, postureInfo.hasPerson);
          updateFallProgressUI({
            hasPerson: postureInfo.hasPerson,
            lyingDurationMs: 0,
            stage: currentFallStage,
            now,
          });
        }
      } else {
        fallExitStartedAt = null;
        refreshIdleStage(now, postureInfo.hasPerson);
        updateFallProgressUI({
          hasPerson: postureInfo.hasPerson,
          lyingDurationMs: 0,
          stage: currentFallStage,
          now,
        });
      }

      return;
    }

    fallExitStartedAt = null;

    if (!lyingStartAt) {
      lyingStartAt = now;
      lastLyingDurationLoggedAt = 0;
      suspectedFallLogged = false;
      logCameraEvent("FallCamera: lying candidate started");
    }

    const lyingDuration = now - lyingStartAt;
    const confidence = clamp(postureInfo.confidence || 0, 0, 1);

    if (
      !lastLyingDurationLoggedAt ||
      now - lastLyingDurationLoggedAt >= LYING_DURATION_LOG_INTERVAL_MS
    ) {
      lastLyingDurationLoggedAt = now;
      logCameraEvent(`FallCamera: lying duration ms=${lyingDuration}`);
    }

    if (!suspectedFallLogged) {
      suspectedFallLogged = true;
      logCameraEvent("FallCamera: suspected fall");
    }

    if (chamiCheckSentForCurrentEvent) {
      setFallStage("chami_check_sent", {
        hasPerson: true,
        lyingDurationMs: lyingDuration,
        fallStatusText: "Chami Check Sent",
        now,
      });
    } else if (currentFallEventConfirmed) {
      setFallStage("confirmed_fall", {
        hasPerson: true,
        lyingDurationMs: lyingDuration,
        fallStatusText: "Confirmed Fall",
        now,
      });
    } else {
      setFallStage("suspected_fall", {
        hasPerson: true,
        lyingDurationMs: lyingDuration,
        fallStatusText: "Suspected Fall",
        now,
      });
    }

    if (
      lyingDuration >= SUSPECTED_FALL_MS &&
      confidence >= MIN_FALL_CONFIDENCE &&
      !fallEventActive &&
      !fallAlertCreatePending &&
      now >= nextFallEventAllowedAt
    ) {
      const eventGeneration = fallEventGeneration;
      fallEventActive = true;
      fallAlertCreatePending = true;
      addLog("Fall event started: suspected");

      sendFallAlert("suspected", postureInfo, lyingDuration).then((alertId) => {
        fallAlertCreatePending = false;

        if (eventGeneration !== fallEventGeneration) return;

        if (!alertId) {
          resetFallEvent(Date.now(), true, "alert_failed");
          return;
        }

        currentFallAlertId = alertId;
        addLog(`Fall alert created: ${alertId}`);
        markCurrentFallAlertConfirmedIfNeeded();
      });
    }

    if (lyingDuration >= CONFIRMED_FALL_MS) {
      confirmFallFromCamera(now);
    }
  }

  async function sendFallAlert(status, postureInfo, lyingDuration) {
    const confidence = Math.max(
      0,
      Math.min(1, Number((postureInfo.confidence || 0.7).toFixed(2))),
    );
    const ratio = Number((postureInfo.bodyRatio || 0).toFixed(2));
    const seconds = Math.round(lyingDuration / 1000);

    try {
      const db = getFirestoreOrThrow();
      const docRef = await db.collection("fallAlerts").add({
        cameraId: CAMERA_ID,
        location: LOCATION,
        type: "fall_detected",
        status,
        confidence,
        source: "webcam",
        aiModel: "mediapipe_pose_landmarker",
        createdAt: getServerTimestamp(),
        resolvedAt: null,
        note: `MediaPipe detected lying posture for ${seconds}s, body ratio ${ratio}`,
      });
      const message = `Auto fall alert sent (${status}): ${docRef.id}`;
      addLog(message);
      console.log("FallCamera:", message);
      return docRef.id;
    } catch (error) {
      const message = `Auto fall alert failed (${status}): ${error.message}`;
      addLog(message);
      console.warn("FallCamera:", message, error);
      return null;
    }
  }

  async function updateFallAlertConfirmed(alertId) {
    try {
      const db = getFirestoreOrThrow();
      const timestamp = getServerTimestamp();

      await db.collection("fallAlerts").doc(alertId).update({
        status: "confirmed",
        confirmedAt: timestamp,
        updatedAt: timestamp,
      });

      const message = "Fall alert updated to confirmed";
      addLog(message);
      console.log("FallCamera:", message);
      return true;
    } catch (error) {
      const message = `Fall alert confirm failed: ${error.message}`;
      addLog(message);
      console.warn("FallCamera:", message, error);
      return false;
    }
  }

  function resetFallEvent(now = Date.now(), startCooldown = false, reason = "") {
    const hadFallSequence =
      !!lyingStartAt ||
      fallEventActive ||
      !!currentFallAlertId ||
      fallAlertCreatePending ||
      currentFallEventConfirmed ||
      chamiCheckSentForCurrentEvent;

    lyingStartAt = null;
    fallEventActive = false;
    currentFallAlertId = null;
    fallAlertCreatePending = false;
    currentFallEventConfirmed = false;
    chamiCheckSentForCurrentEvent = false;
    currentFallFlowId = null;
    fallConfirmedCareEventWritten = false;
    fallExitStartedAt = null;
    confirmedUpdateSent = false;
    confirmedUpdatePending = false;
    suspectedFallLogged = false;
    lastLyingDurationLoggedAt = 0;
    fallEventGeneration += 1;

    if (startCooldown && hadFallSequence) {
      nextFallEventAllowedAt = Math.max(
        nextFallEventAllowedAt,
        now + FALL_ALERT_COOLDOWN_MS,
      );
      logCameraEvent("FallCamera: fall event reset after recovery");
      if (reason === "recovery") {
        setFallCommandStatus("Đang chờ cooldown trước khi detect lại", "warning");
      }
    }

    refreshIdleStage(now, lastPersonDetected);
    updateFallProgressUI({
      hasPerson: lastPersonDetected,
      lyingDurationMs: 0,
      stage: currentFallStage,
      now,
    });
  }

  function drawPose(landmarks, postureInfo) {
    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    drawOverlay();

    if (!landmarks || !postureInfo.hasPerson) return;

    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";

    context.strokeStyle =
      postureInfo.posture === "Lying"
        ? "rgba(201, 58, 58, 0.92)"
        : "rgba(19, 138, 97, 0.9)";
    context.lineWidth = Math.max(3, canvas.width * 0.004);

    POSE_CONNECTIONS.forEach(([startIndex, endIndex]) => {
      const start = landmarks[startIndex];
      const end = landmarks[endIndex];

      if (!isValidLandmark(start) || !isValidLandmark(end)) return;

      const startPoint = getLandmarkPoint(start);
      const endPoint = getLandmarkPoint(end);

      context.beginPath();
      context.moveTo(startPoint.x, startPoint.y);
      context.lineTo(endPoint.x, endPoint.y);
      context.stroke();
    });

    context.fillStyle = "rgba(255, 255, 255, 0.95)";
    landmarks.forEach((landmark) => {
      if (!isValidLandmark(landmark)) return;

      const point = getLandmarkPoint(landmark);
      context.beginPath();
      context.arc(point.x, point.y, Math.max(3, canvas.width * 0.004), 0, 7);
      context.fill();
    });

    if (postureInfo.boundingBox) {
      const { minX, minY, maxX, maxY } = postureInfo.boundingBox;
      context.strokeStyle = "rgba(255, 255, 255, 0.72)";
      context.lineWidth = 2;
      context.strokeRect(minX, minY, maxX - minX, maxY - minY);
    }

    context.restore();
  }

  function startCooldownTicker() {
    if (cooldownAnimationId) return;

    const tick = () => {
      updateCooldownUI();
      if (!stream && getCooldownRemainingMs() <= 0) {
        cooldownAnimationId = null;
        refreshIdleStage(Date.now(), false);
        return;
      }

      cooldownAnimationId = window.setTimeout(tick, 250);
    };

    tick();
  }

  function stopCooldownTicker() {
    if (!cooldownAnimationId) return;

    window.clearTimeout(cooldownAnimationId);
    cooldownAnimationId = null;
  }

  function startPoseDetection() {
    if (detectionAnimationId || !poseLandmarker || !stream) return;

    lastDetectionAt = 0;
    mediaPipeRuntimeErrorLogged = false;
    startCooldownTicker();
    detectPoseLoop();
  }

  function stopPoseDetection() {
    if (detectionAnimationId) {
      cancelAnimationFrame(detectionAnimationId);
      detectionAnimationId = null;
    }

    lastDetectionAt = 0;
    resetFallEvent(Date.now(), false, "stopped");
  }

  function detectPoseLoop(timestamp = performance.now()) {
    if (!stream || !poseLandmarker) {
      detectionAnimationId = null;
      return;
    }

    detectionAnimationId = requestAnimationFrame(detectPoseLoop);

    if (timestamp - lastDetectionAt < DETECTION_INTERVAL_MS) return;
    lastDetectionAt = timestamp;

    if (video.readyState < 2) return;

    try {
      resizeOverlay();

      const result = poseLandmarker.detectForVideo(video, timestamp);
      const landmarks = result.landmarks?.[0] || null;
      const postureInfo = calculatePosture(landmarks);

      updatePoseStatus(postureInfo);
      drawPose(landmarks, postureInfo);
      handleFallDetection(postureInfo);
    } catch (error) {
      if (!mediaPipeRuntimeErrorLogged) {
        mediaPipeRuntimeErrorLogged = true;
        postureStatus.textContent = "MediaPipe error";
        addLog(`MediaPipe detection failed: ${error.message}`);
        console.error("FallCamera: MediaPipe detection failed.", error);
      }
    }
  }

  async function startCamera() {
    if (stream) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      addLog("Camera permission denied");
      return;
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      video.srcObject = stream;
      await video.play();
      setCameraOnline(true);
      personStatus.textContent = "No person";
      postureStatus.textContent = poseLandmarker
        ? "Unknown"
        : "Loading MediaPipe Pose...";
      refreshIdleStage(Date.now(), false);
      setFallCommandStatus("");
      updateLastChamiCommandStatus(
        currentChamiCommandId ? `Last: ${currentChamiCommandId}` : "Waiting",
        currentChamiCommandId ? "success" : "",
      );
      addLog("Camera started");
      runCameraStatusSync(syncCameraOnline, "Firestore camera status: online");
      resizeOverlay();

      initPoseLandmarker()
        .then(() => {
          if (stream) startPoseDetection();
        })
        .catch(() => {});
    } catch (error) {
      stream = null;
      video.srcObject = null;
      setCameraOnline(false);
      addLog("Camera permission denied");
    }
  }

  function stopCamera() {
    if (!stream) return;

    stopPoseDetection();
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
    video.pause();
    video.srcObject = null;
    setCameraOnline(false);
    personStatus.textContent = "No person";
    postureStatus.textContent = "Unknown";
    lastPersonDetected = false;
    refreshIdleStage(Date.now(), false);
    setFallCommandStatus("");
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    addLog("Camera stopped");
    runCameraStatusSync(syncCameraOffline, "Firestore camera status: offline");
  }

  async function handleManualTestFallAlert() {
    testFallAlertButton.disabled = true;

    try {
      if (
        currentFallFlowId &&
        !fallEmergencyCommandPending &&
        getCooldownRemainingMs() === 0
      ) {
        resetFallEvent(Date.now(), false, "manual_demo_repeat");
      }
      logCameraEvent("Manual demo fall confirmed");
      currentFallEventConfirmed = true;
      setFallStage("confirmed_fall", {
        hasPerson: true,
        lyingDurationMs: Math.max(CONFIRMED_FALL_MS, getCurrentLyingDuration()),
        fallStatusText: "Confirmed Fall",
      });
      await handleFallConfirmed();
    } catch (error) {
      logCameraEvent("Manual test fall flow failed", "error", error);
      setFallCommandStatus("Không thể gửi yêu cầu kiểm tra tới Chami", "danger");
    } finally {
      testFallAlertButton.disabled = false;
    }
  }

  function handleManualResetFallState() {
    logCameraEvent("FallCamera: manual fall state reset");
    resetFallEvent(Date.now(), false, "manual");
    setFallCommandStatus("");
    updateLastChamiCommandStatus(
      currentChamiCommandId ? `Last: ${currentChamiCommandId}` : "Waiting",
      currentChamiCommandId ? "success" : "",
    );
  }

  function clearLocalLog() {
    saveLogs([]);
    renderLogs();
  }

  startButton.addEventListener("click", startCamera);
  stopButton.addEventListener("click", stopCamera);
  testFallAlertButton.addEventListener("click", handleManualTestFallAlert);
  resetFallStateButton.addEventListener("click", handleManualResetFallState);
  clearLogButton.addEventListener("click", clearLocalLog);
  video.addEventListener("loadedmetadata", resizeOverlay);
  window.addEventListener("resize", resizeOverlay);
  window.addEventListener("beforeunload", stopCamera);

  setCameraOnline(false);
  setFallCommandStatus("");
  updateLastChamiCommandStatus("Waiting");
  refreshIdleStage(Date.now(), false);
  renderLogs();
  startCooldownTicker();
  initPoseLandmarker().catch(() => {});
})();
