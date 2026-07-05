// Dashboard (mock-first; subscribes to realtime if Firestore configured)
FirebaseService.seedMockData && FirebaseService.seedMockData();

const SMART_HOME_DEVICE_ID = "smart_home_001";
const IR_HUB_DEVICE_ID = "ir_hub_001";
const LIGHT_DEVICE_ID = "light_001";
const LEGACY_LIGHT_DEVICE_ID = "light01";
const AIRCON_DEVICE_ID = "ac01";
const DEFAULT_TSUNAGARI_BRIDGE_API_URL =
  "https://pt-tsunagari-care.onrender.com";
const DEFAULT_TSUNAGARI_DEVICE_TOKEN = "DEV_TOKEN";
const CARE_LOG_DISPLAY_LIMIT = 3;
const ALERT_DISPLAY_LIMIT = 1;
const PENDING_COMMAND_DISPLAY_LIMIT = 2;
const RESOLVED_FALL_HISTORY_LIMIT = 3;
const ROBOT_OFFLINE_TIMEOUT_MS = 90 * 1000;
const ROBOT_STATUS_REFRESH_INTERVAL_MS = 10 * 1000;
const LEGACY_DEMO_MEDICINE_MESSAGE =
  "\u0110\u00e3 u\u1ed1ng thu\u1ed1c (demo)";
const MEDICINE_REMINDER_COMMAND_TEXT =
  "Nh\u1eafc ng\u01b0\u1eddi d\u00f9ng u\u1ed1ng thu\u1ed1c";
const MEDICINE_REMINDER_LOG_MESSAGE =
  "\u0110\u00e3 g\u1eedi l\u1ec7nh nh\u1eafc u\u1ed1ng thu\u1ed1c cho Chami";

function updateRobotSection(robot) {
  // Update overview cards
  document.getElementById("robot-status-text").textContent =
    robot?.status || "offline";
  document.getElementById("robot-battery-text").textContent =
    robot?.battery != null ? robot.battery + "%" : "—";

  // Update robot profile display
  const batteryDisplay = document.getElementById("robot-battery-display");
  const statusDisplay = document.getElementById("robot-status-display");
  if (batteryDisplay)
    batteryDisplay.textContent =
      robot?.battery != null ? robot.battery + "%" : "—%";
  if (statusDisplay) statusDisplay.textContent = robot?.status || "offline";
}

function updateDevicesSection(devices) {
  document.getElementById("devices-count").textContent = devices.length || 0;
  const devicesDisplay = document.getElementById("devices-display");
  if (devicesDisplay) devicesDisplay.textContent = devices.length || 0;
  renderDevices(devices);
}

let latestBridgeRobot = null;
let latestLegacyRobot = null;
let latestSmartHomeDevices = [];

function isBridgeChamiDevice(device) {
  return device?.id === "chami_001" || device?.type === "ai_robot";
}

function getDeviceId(device) {
  return device?.id || device?.deviceId || "";
}

function isLightDevice(device) {
  const id = getDeviceId(device);
  return (
    id === LIGHT_DEVICE_ID ||
    id === LEGACY_LIGHT_DEVICE_ID ||
    device?.type === "light"
  );
}

function isAirconDevice(device) {
  const id = getDeviceId(device);
  return id === AIRCON_DEVICE_ID || device?.type === "ac";
}

function getSmartHomeDevicesForDisplay(devices) {
  const smartHomeDevices = (devices || []).filter(
    (device) => !isBridgeChamiDevice(device),
  );
  const hasBridgeLight = smartHomeDevices.some(
    (device) => getDeviceId(device) === LIGHT_DEVICE_ID,
  );

  if (!hasBridgeLight) {
    return smartHomeDevices;
  }

  return smartHomeDevices.filter(
    (device) => getDeviceId(device) !== LEGACY_LIGHT_DEVICE_ID,
  );
}

function getLightDisplayName() {
  return "Đèn phòng khách";
}

function getLightStatusText(status) {
  return status === "on" ? "Đèn đang bật" : "Đèn đang tắt";
}

function toggleLocalLightDisplayState() {
  latestSmartHomeDevices = latestSmartHomeDevices.map((device) => {
    if (!isLightDevice(device)) {
      return device;
    }

    const nextStatus = device?.status === "on" ? "off" : "on";
    return {
      ...device,
      name: getLightDisplayName(),
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    };
  });

  renderDevices(latestSmartHomeDevices);
}

function getLightCommandText(action) {
  const textByAction = {
    on: "Bật đèn phòng khách",
    off: "Tắt đèn phòng khách",
    toggle: "Đổi trạng thái đèn phòng khách",
  };

  return textByAction[action] || "Điều khiển đèn phòng khách";
}

function getBridgeApiBaseUrl() {
  const configuredBaseUrl =
    window.TSUNAGARI_BRIDGE_API_URL ||
    localStorage.getItem("tsunagari_bridge_api_url") ||
    "";

  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, "");
  }

  return DEFAULT_TSUNAGARI_BRIDGE_API_URL;
}

function getBridgeDeviceToken() {
  return (
    window.TSUNAGARI_DEVICE_TOKEN ||
    localStorage.getItem("tsunagari_device_token") ||
    DEFAULT_TSUNAGARI_DEVICE_TOKEN
  );
}

async function createBackendSmartHomeCommand(command) {
  const headers = {
    "Content-Type": "application/json",
  };
  const deviceToken = getBridgeDeviceToken();
  const baseUrl = getBridgeApiBaseUrl();
  const requestUrl = `${baseUrl}/api/smart-home/commands`;

  if (deviceToken) {
    headers["x-device-token"] = deviceToken;
  }

  console.log("Smart Home backend URL:", requestUrl);
  console.log("Smart Home auth header attached:", Boolean(deviceToken));

  const response = await fetch(requestUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(command),
  });
  const payload = await response
    .json()
    .catch(() => ({ ok: false, error: "invalid_json_response" }));

  if (!response.ok || payload?.ok !== true) {
    throw new Error(
      payload?.message || payload?.error || `HTTP ${response.status}`,
    );
  }

  return payload;
}

async function sendIRCommand(key) {
  const command = {
    targetDeviceId: SMART_HOME_DEVICE_ID,
    source: "dashboard",
    type: "ir_send",
    device: IR_HUB_DEVICE_ID,
    action: "send",
    key,
    status: "pending",
  };
  const payload = await createBackendSmartHomeCommand(command);

  console.log("Đã gửi lệnh tới IR Hub", {
    commandId: payload?.commandId || null,
    targetDeviceId: command.targetDeviceId,
    type: command.type,
    device: command.device,
    action: command.action,
    key: command.key,
    status: command.status,
  });

  return payload;
}

async function createLightControlCommand() {
  return sendIRCommand("room_light_power");
}

async function createAirconControlCommand(action) {
  return sendIRCommand(action === "off" ? "ac_off" : "ac_cool_26");
}

function pickRobotForDisplay() {
  return latestBridgeRobot || latestLegacyRobot;
}

function getRobotHeartbeatTimestamp(robot) {
  if (!robot) return 0;

  if (isBridgeChamiDevice(robot)) {
    return getTimeValue(robot.lastSeen || robot.updatedAt);
  }

  return getTimeValue(robot.lastSeen || robot.updatedAt || robot.lastActive);
}

function normalizeRobotForDisplay(robot) {
  if (!robot) {
    return {
      online: false,
      statusText: "offline",
      detailText: "offline",
      batteryText: "--",
      lastSeenText: "No recent update",
    };
  }

  const heartbeatTimestamp = getRobotHeartbeatTimestamp(robot);
  const hasRecentHeartbeat =
    heartbeatTimestamp > 0 &&
    Date.now() - heartbeatTimestamp <= ROBOT_OFFLINE_TIMEOUT_MS;
  const hasOnlineFlag = typeof robot.online === "boolean";
  const reportedOnline = hasOnlineFlag
    ? robot.online
    : robot.status === "online";
  const isOnline = reportedOnline && hasRecentHeartbeat;
  const state = robot.state || robot.status || (isOnline ? "online" : "offline");
  const emotion = robot.emotion || "";
  const lastSeen = isBridgeChamiDevice(robot)
    ? robot.lastSeen || robot.updatedAt
    : robot.lastSeen || robot.updatedAt || robot.lastActive;
  const detailParts = isOnline
    ? [isOnline ? "online" : "offline", state, emotion].filter(Boolean)
    : [isBridgeChamiDevice(robot) ? "offline" : state || "offline", "mất kết nối"];

  return {
    online: isOnline,
    statusText: isOnline ? "online" : "offline",
    detailText: detailParts.join(" / "),
    batteryText: robot.battery != null ? robot.battery + "%" : "--",
    lastSeenText: lastSeen ? formatDateTime(lastSeen) : "No recent update",
  };
}

updateRobotSection = function (robot) {
  const display = normalizeRobotForDisplay(robot);

  document.getElementById("robot-status-text").textContent = display.statusText;
  document.getElementById("robot-battery-text").textContent =
    display.batteryText;

  const batteryDisplay = document.getElementById("robot-battery-display");
  const statusDisplay = document.getElementById("robot-status-display");
  const lastSeenDisplay = document.getElementById("devices-display");
  const availabilityDot = document.querySelector(".availability-dot");

  if (batteryDisplay) batteryDisplay.textContent = display.batteryText;
  if (statusDisplay) statusDisplay.textContent = display.detailText;
  if (lastSeenDisplay) lastSeenDisplay.textContent = display.lastSeenText;
  if (availabilityDot) {
    availabilityDot.classList.toggle("status-offline", !display.online);
  }
};

updateDevicesSection = function (devices) {
  const data = devices || [];
  const smartHomeDevices = getSmartHomeDevicesForDisplay(data);
  const bridgeRobot = data.find((device) => device?.id === "chami_001");

  latestSmartHomeDevices = smartHomeDevices.map((device) =>
    isLightDevice(device)
      ? { ...device, name: getLightDisplayName() }
      : device,
  );
  latestBridgeRobot = bridgeRobot || null;
  updateRobotSection(pickRobotForDisplay());

  document.getElementById("devices-count").textContent =
    latestSmartHomeDevices.length || 0;
  renderDevices(latestSmartHomeDevices);
};

function refreshRobotPresenceDisplay() {
  updateRobotSection(pickRobotForDisplay());
}

function updateAlertsSection(alerts) {
  document.getElementById("alerts-count").textContent = alerts.length || 0;
  renderAlerts(alerts);
}

function updateCareLogsSection(logs) {
  renderCareLogs(logs);
}

// Render helpers
function renderDevices(devices) {
  const wrap = document.getElementById("devices-list");
  wrap.innerHTML = "";
  devices.forEach((d) => {
    const item = document.createElement("div");
    item.className = "device-item";
    const isLight = isLightDevice(d);
    const isAircon = isAirconDevice(d);
    const deviceDetail = isLight
      ? d.status === "on"
        ? "Đèn đang bật"
        : "Đèn đang tắt"
      : d.room || "";
    const leftDiv = document.createElement("div");
    leftDiv.className = "left";
    leftDiv.innerHTML = `<strong>${d.name}</strong><small>${deviceDetail}</small>`;

    const btn = document.createElement("button");
    btn.className = "device-toggle";
    btn.dataset.id = d.id || d.deviceId || "";
    btn.textContent = isLight
      ? d.status === "on"
        ? "Tắt đèn"
        : "Bật đèn"
      : (d.status === "on" ? "✓ " : "") + "Toggle";
    btn.onclick = async () => {
      const id = btn.dataset.id;

      if (isLight) {
        const action = d.status === "on" ? "off" : "on";
        await createLightControlCommand(action);
        alert("Smart home command created");
        return;
      }

      await FirebaseService.createCommand({
        targetType: "device",
        targetId: id,
        command: "toggle",
        status: "pending",
        source: "web_dashboard",
      });
      alert("Command created (demo)");
    };

    item.appendChild(leftDiv);
    item.appendChild(btn);
    wrap.appendChild(item);
  });
}

renderDevices = function (devices) {
  const wrap = document.getElementById("devices-list");
  wrap.innerHTML = "";
  devices.forEach((d) => {
    const item = document.createElement("div");
    item.className = "device-item";
    const isLight = isLightDevice(d);
    const isAircon = isAirconDevice(d);
    const deviceName = isLight ? getLightDisplayName() : d.name;
    const deviceDetail = isLight
      ? getLightStatusText(d.status)
      : isAircon
        ? d.status === "on"
          ? "Điều hòa đang bật"
          : "Điều hòa đang tắt"
        : d.room || "";
    const leftDiv = document.createElement("div");
    leftDiv.className = "left";
    leftDiv.innerHTML = `<strong>${deviceName}</strong><small>${deviceDetail}</small>`;

    const btn = document.createElement("button");
    btn.className = "device-toggle";
    btn.dataset.id = d.id || d.deviceId || "";
    btn.textContent = isLight
      ? "Bật / Tắt đèn"
      : isAircon
        ? d.status === "on"
          ? "Tắt điều hòa"
          : "Bật điều hòa"
        : (d.status === "on" ? "✓ " : "") + "Toggle";
    btn.onclick = async () => {
      const id = btn.dataset.id;
      btn.disabled = true;

      try {
        if (isLight) {
          await createLightControlCommand();
          toggleLocalLightDisplayState();
          alert("Đã gửi lệnh tới IR Hub");
          return;
        }

        if (isAircon) {
          const action = d.status === "on" ? "off" : "on";
          await createAirconControlCommand(action);
          alert("Đã gửi lệnh tới IR Hub");
          return;
        }

        await FirebaseService.createCommand({
          targetType: "device",
          targetId: id,
          command: "toggle",
          status: "pending",
          source: "web_dashboard",
        });
        alert("Command created (demo)");
      } catch (error) {
        console.error("Không gửi được lệnh", error);
        alert("Không gửi được lệnh");
      } finally {
        btn.disabled = false;
      }
    };

    item.appendChild(leftDiv);
    item.appendChild(btn);
    wrap.appendChild(item);
  });
};

function getAlertTypeLabel(type) {
  const labels = {
    fall_detected: "Phát hiện ngã",
    robot_offline: "Robot mất kết nối",
    low_battery: "Pin yếu",
    no_response: "Không phản hồi",
    medicine_missed: "Chưa uống thuốc",
  };

  return labels[type] || type || "Cảnh báo";
}

function getAlertSourceLabel(source) {
  const labels = {
    camera_ai: "Camera AI",
    chami_001: "Chami Robot",
    robot_chami: "Chami Robot",
    health_module: "Health Module",
    smart_home: "Smart Home",
    web_dashboard: "Web Dashboard",
    demo: "Demo Mode",
  };

  return labels[source] || "Không rõ nguồn";
}

function getLineStatusLabel(status) {
  const labels = {
    pending: "LINE: Đang gửi",
    sent: "LINE: Đã gửi",
    failed: "LINE: Lỗi",
  };

  return labels[status] || "LINE: Demo";
}

function getTimeValue(value) {
  if (!value) return 0;
  if (typeof value.toDate === "function") return value.toDate().getTime();

  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function sortByNewest(items, getTimestamp) {
  return (items || []).slice().sort((a, b) => {
    const timeA = getTimestamp(a);
    const timeB = getTimestamp(b);
    return timeB - timeA;
  });
}

function appendCompactMore(container, hiddenCount, label) {
  if (!container || hiddenCount <= 0) return;

  const more = document.createElement("div");
  more.className = "compact-more";
  more.textContent = `+ ${hiddenCount} ${label}`;
  container.appendChild(more);
}

function isLegacyDemoMedicineLog(log) {
  const message = typeof log?.message === "string" ? log.message : "";
  return message.includes(LEGACY_DEMO_MEDICINE_MESSAGE);
}

function getRealtimeCommandTimestamp() {
  if (
    typeof FirebaseService?.useRealtime === "function" &&
    FirebaseService.useRealtime() &&
    window.firebase?.database?.ServerValue?.TIMESTAMP
  ) {
    return window.firebase.database.ServerValue.TIMESTAMP;
  }

  return undefined;
}

function formatDateTime(value) {
  if (!value) return "Không rõ thời gian";

  // Firestore Timestamp support
  if (typeof value.toDate === "function") {
    return value.toDate().toLocaleString("vi-VN");
  }

  return new Date(value).toLocaleString("vi-VN");
}
formatDateTime = function (value) {
  if (!value) return "Unknown time";

  if (typeof value.toDate === "function") {
    return value.toDate().toLocaleString("ja-JP");
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return date.toLocaleString("ja-JP");
};

function formatConfidence(value) {
  if (typeof value !== "number") return "N/A";
  return `${Math.round(value * 100)}%`;
}

function getFallAlertStatusClass(status) {
  const classes = {
    suspected: "fall-status-suspected",
    confirmed: "fall-status-confirmed",
    resolved: "fall-status-resolved",
    cancelled: "fall-status-cancelled",
  };

  return classes[status] || "fall-status-unknown";
}

function canResolveFallAlert(status) {
  return status === "suspected" || status === "confirmed";
}

function renderCameraDeviceStatus(camera) {
  const badge = document.getElementById("camera-device-status-badge");
  const details = document.getElementById("camera-device-details");

  if (!badge || !details) return;

  const data = camera || {
    name: "Living Room Camera",
    location: "living_room",
    status: "offline",
    deviceType: "webcam",
    aiModel: "none_mvp",
  };
  const status = data.status || "offline";

  badge.textContent = status;
  badge.classList.toggle("status-online", status === "online");
  badge.classList.toggle("status-offline", status !== "online");

  details.innerHTML = "";

  [
    ["Name", data.name || "Unknown camera"],
    ["Location", data.location || "unknown"],
    ["Device type", data.deviceType || "unknown"],
    ["AI model", data.aiModel || "unknown"],
    ["Last seen", formatDateTime(data.lastSeen || data.updatedAt)],
  ].forEach(([label, value]) => {
    const item = document.createElement("div");
    const title = document.createElement("dt");
    const content = document.createElement("dd");

    title.textContent = label;
    content.textContent = value;

    item.appendChild(title);
    item.appendChild(content);
    details.appendChild(item);
  });
}

function createFallAlertItem(alert, options = {}) {
  const item = document.createElement("article");
  item.className = "fall-alert-item";

  const header = document.createElement("div");
  header.className = "fall-alert-header";

  const location = document.createElement("strong");
  location.textContent = alert.location || "unknown_location";

  const status = document.createElement("span");
  status.className = `fall-alert-status ${getFallAlertStatusClass(alert.status)}`;
  status.textContent = alert.status || "unknown";

  const headerActions = document.createElement("div");
  headerActions.className = "fall-alert-actions";

  headerActions.appendChild(status);

  if (options.canResolve && canResolveFallAlert(alert.status)) {
    const notifyButton = document.createElement("button");
    notifyButton.className = "fall-alert-notify";
    notifyButton.type = "button";
    notifyButton.textContent = "Notify Chami";
    notifyButton.addEventListener("click", () => {
      notifyButton.disabled = true;
      notifyChamiForFallAlert(alert.id).catch(() => {
        notifyButton.disabled = false;
      });
    });
    headerActions.appendChild(notifyButton);

    const resolveButton = document.createElement("button");
    resolveButton.className = "fall-alert-resolve";
    resolveButton.type = "button";
    resolveButton.textContent = "Mark as resolved";
    resolveButton.addEventListener("click", () => {
      resolveButton.disabled = true;
      markFallAlertResolved(alert.id).catch(() => {
        resolveButton.disabled = false;
      });
    });
    headerActions.appendChild(resolveButton);
  }

  header.appendChild(location);
  header.appendChild(headerActions);

  const meta = document.createElement("dl");
  meta.className = "fall-alert-meta";

  [
    ["Confidence", formatConfidence(alert.confidence)],
    ["Camera", alert.cameraId || "unknown"],
    ["Created", formatDateTime(alert.createdAt)],
  ].forEach(([label, value]) => {
    const group = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");

    dt.textContent = label;
    dd.textContent = value;

    group.appendChild(dt);
    group.appendChild(dd);
    meta.appendChild(group);
  });

  const note = document.createElement("p");
  note.className = "fall-alert-note";
  note.textContent = alert.note || "";

  item.appendChild(header);
  item.appendChild(meta);
  item.appendChild(note);

  return item;
}

function renderFallAlertList(el, alerts, emptyMessage, options = {}) {
  if (!el) return;

  el.innerHTML = "";

  if (!alerts || alerts.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = emptyMessage;
    el.appendChild(empty);
    return;
  }

  alerts.forEach((alert) => {
    el.appendChild(createFallAlertItem(alert, options));
  });
}

function renderFallAlerts(alerts) {
  const activeList = document.getElementById("active-fall-alerts-list");
  const resolvedList = document.getElementById("resolved-fall-alerts-list");

  if (!activeList || !resolvedList) return;

  const data = alerts || [];
  const activeAlerts = data.filter((alert) => canResolveFallAlert(alert.status));
  const allResolvedAlerts = sortByNewest(
    data.filter((alert) => alert.status === "resolved"),
    (alert) => getTimeValue(alert.resolvedAt || alert.updatedAt || alert.createdAt),
  );
  const resolvedAlerts = allResolvedAlerts.slice(0, RESOLVED_FALL_HISTORY_LIMIT);
  const hiddenResolvedCount = Math.max(
    allResolvedAlerts.length - resolvedAlerts.length,
    0,
  );

  renderFallAlertList(activeList, activeAlerts, "No active fall alerts", {
    canResolve: true,
  });
  renderFallAlertList(
    resolvedList,
    resolvedAlerts,
    "No resolved fall alerts yet",
  );
  appendCompactMore(resolvedList, hiddenResolvedCount, "mục cũ hơn");
}

function setupResolvedFallHistoryToggle() {
  const details = document.querySelector(".fall-alert-history");
  const summary = details?.querySelector("summary");

  if (!details || !summary) return;

  const updateSummary = () => {
    summary.textContent = `${details.open ? "▼" : "▶"} Resolved Fall History`;
  };

  updateSummary();
  details.addEventListener("toggle", updateSummary);
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

function getFirestoreForDashboard() {
  const config = getFirebaseConfig();

  if (!window.firebase || typeof firebase.initializeApp !== "function") {
    return null;
  }

  if (!config || typeof firebase.firestore !== "function") {
    return null;
  }

  if (!firebase.apps || !firebase.apps.length) {
    firebase.initializeApp(config);
  }

  return firebase.firestore();
}

function addFallCameraLocalLog(message) {
  const key = "tsunagari_fall_camera_log";

  try {
    const logs = JSON.parse(localStorage.getItem(key)) || [];
    logs.unshift({
      cameraId: "default_cam",
      location: "living_room",
      message,
      timestamp: new Date().toISOString(),
    });
    localStorage.setItem(key, JSON.stringify(logs.slice(0, 50)));
  } catch (error) {
    console.warn("Fall camera local log failed.", error);
  }
}

function subscribeToCameraDeviceStatus() {
  renderCameraDeviceStatus(null);

  try {
    const db = getFirestoreForDashboard();

    if (!db) {
      console.warn("Camera device: Firestore is not configured.");
      return null;
    }

    return db
      .collection("cameras")
      .doc("default_cam")
      .onSnapshot(
        (snapshot) => {
          renderCameraDeviceStatus(
            snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null,
          );
        },
        (error) => {
          console.warn("Camera device realtime listener failed.", error);
          renderCameraDeviceStatus(null);
        },
      );
  } catch (error) {
    console.warn("Camera device subscription failed.", error);
    renderCameraDeviceStatus(null);
    return null;
  }
}

async function markFallAlertResolved(alertId) {
  if (!alertId) return;

  const db = getFirestoreForDashboard();

  if (!db) {
    console.warn("Fall alerts: Firestore is not configured.");
    return;
  }

  const timestamp = firebase.firestore.FieldValue.serverTimestamp();

  await db.collection("fallAlerts").doc(alertId).update({
    status: "resolved",
    resolvedAt: timestamp,
    updatedAt: timestamp,
  });

  addFallCameraLocalLog("Fall alert resolved");
}

async function notifyChamiForFallAlert(alertId) {
  if (!alertId) return;

  const db = getFirestoreForDashboard();

  if (!db) {
    console.warn("Notify Chami: Firestore is not configured.");
    return;
  }

  await db.collection("commands").add({
    target: "chami_robot",
    type: "speak",
    status: "pending",
    message: "Có vẻ như có người bị ngã ở phòng khách. Tôi sẽ kiểm tra ngay.",
    source: "fall_detection",
    alertId,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

function subscribeToFallAlerts() {
  renderFallAlerts([]);

  try {
    const db = getFirestoreForDashboard();

    if (!db) {
      console.warn("Fall alerts: Firestore is not configured.");
      return null;
    }

    return db
      .collection("fallAlerts")
      .orderBy("createdAt", "desc")
      .onSnapshot(
        (snapshot) => {
          const alerts = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          renderFallAlerts(alerts);
        },
        (error) => {
          console.warn("Fall alerts realtime listener failed.", error);
          renderFallAlerts([]);
        },
      );
  } catch (error) {
    console.warn("Fall alerts subscription failed.", error);
    renderFallAlerts([]);
    return null;
  }
}

function renderAlerts(alerts) {
  const el = document.getElementById("alerts-list");
  el.innerHTML = "";

  if (!alerts || alerts.length === 0) {
    el.innerHTML =
      '<div style="padding: 12px; color: #6b7280; text-align: center; font-size: 0.9rem;">No alerts</div>';
    return;
  }

  alerts.slice(0, 8).forEach((a) => {
    const row = document.createElement("div");
    row.className = `alert-item alert-${a.level || "warning"}`;

    row.innerHTML = `
      <div class="left">
        <strong>${getAlertTypeLabel(a.type)}</strong>
        <small>${a.message || ""}</small>

        <div class="alert-meta">
          <span>${formatDateTime(a.createdAt)}</span>
          <span>•</span>
          <span>${getAlertSourceLabel(a.source)}</span>
          <span>•</span>
          <span>${getLineStatusLabel(a.lineStatus)}</span>
        </div>
      </div>
    `;

    el.appendChild(row);
  });
}

renderAlerts = function (alerts) {
  const el = document.getElementById("alerts-list");
  el.innerHTML = "";
  const data = alerts || [];

  if (data.length === 0) {
    el.innerHTML =
      '<div style="padding: 12px; color: #6b7280; text-align: center; font-size: 0.9rem;">No alerts</div>';
    return;
  }

  const isNewAlert = (alert) => alert?.status === "new";
  const isDangerOrSosAlert = (alert) =>
    alert?.level === "danger" || alert?.type === "sos";

  const selectedAlerts = data
    .slice()
    .sort((a, b) => {
      const newDiff = Number(isNewAlert(b)) - Number(isNewAlert(a));
      if (newDiff !== 0) return newDiff;

      const dangerOrSosDiff =
        Number(isDangerOrSosAlert(b)) - Number(isDangerOrSosAlert(a));
      if (dangerOrSosDiff !== 0) return dangerOrSosDiff;

      return getTimeValue(b.createdAt) - getTimeValue(a.createdAt);
    })
    .slice(0, ALERT_DISPLAY_LIMIT);
  const hiddenCount = Math.max(data.length - selectedAlerts.length, 0);

  selectedAlerts.forEach((a) => {
    const row = document.createElement("div");
    row.className = `alert-item alert-${a.level || "warning"}`;

    const meta = [
      formatDateTime(a.createdAt),
      getAlertSourceLabel(a.source),
      a.lineStatus ? getLineStatusLabel(a.lineStatus) : "",
    ].filter(Boolean);

    row.innerHTML = `
      <div class="left">
        <strong>${getAlertTypeLabel(a.type)}</strong>
        <small>${a.message || ""}</small>

        <div class="alert-meta">
          ${meta.map((item) => `<span>${item}</span>`).join("<span>/</span>")}
        </div>
      </div>
    `;

    el.appendChild(row);
  });

  appendCompactMore(el, hiddenCount, "cảnh báo khác");
};

function renderCareLogs(logs) {
  const el = document.getElementById("care-logs");
  el.innerHTML = "";
  const validLogs = sortByNewest(
    (logs || []).filter((log) => !isLegacyDemoMedicineLog(log)),
    (log) => getTimeValue(log.createdAt),
  );
  const visibleLogs = validLogs.slice(0, CARE_LOG_DISPLAY_LIMIT);
  const hiddenCount = Math.max(validLogs.length - visibleLogs.length, 0);

  if (visibleLogs.length === 0) {
    el.innerHTML =
      '<div style="padding: 12px; color: #6b7280; text-align: center; font-size: 0.9rem;">Chưa có hoạt động mới</div>';
    return;
  }

  visibleLogs.forEach((l) => {
    const item = document.createElement("div");
    item.className = "care-item";
    item.innerHTML = `
      <div class="timeline-dot"></div>
      <div class="timeline-content">
        <strong>${l.type}</strong>
        <small class="timeline-time">${l.message || l.status}</small>
      </div>
    `;
    el.appendChild(item);
  });

  appendCompactMore(el, hiddenCount, "hoạt động cũ hơn");
}

async function handleMedicineReminderButtonClick() {
  console.log("Medicine button clicked - creating Chami command");

  try {
    if (typeof FirebaseService.createRobotActionCommand !== "function") {
      throw new Error("FirebaseService.createRobotActionCommand is unavailable");
    }

    const commandOptions = {
      source: "dashboard",
      status: "pending",
    };
    const realtimeTimestamp = getRealtimeCommandTimestamp();

    if (typeof realtimeTimestamp !== "undefined") {
      commandOptions.createdAt = realtimeTimestamp;
    }

    const command = await FirebaseService.createRobotActionCommand(
      "chami_001",
      "remind_medicine",
      MEDICINE_REMINDER_COMMAND_TEXT,
      commandOptions,
    );

    console.log("Chami medicine reminder command created", {
      id: command?.id || null,
      target: command?.target || "chami_001",
      type: command?.type || "robot_action",
      action: command?.action || "remind_medicine",
      status: command?.status || "pending",
    });

    await FirebaseService.createCareLog({
      userId: "user01",
      type: "medicine",
      status: "sent",
      message: MEDICINE_REMINDER_LOG_MESSAGE,
      source: "dashboard",
    });
  } catch (error) {
    console.error("Failed to create Chami medicine reminder command", error);
  }
}

function bindMedicineReminderButtonHandler() {
  const button = document.getElementById("demo-medicine-done");
  if (!button) return;

  button.onclick = handleMedicineReminderButtonClick;
}

// Commands UI
function getCommandTitle(command) {
  return command?.command || command?.type || command?.action || "unknown";
}

function getCommandDetail(command) {
  if (command?.device && command?.action) {
    return `${command.device} / ${command.action}`;
  }

  if (command?.target && command?.action) {
    return `${command.target} / ${command.action}`;
  }

  return (
    command?.targetId ||
    command?.device ||
    command?.target ||
    command?.text ||
    ""
  );
}

function renderCommands(cmds) {
  const el = document.getElementById("commands-list");
  el.innerHTML = "";
  const pendingCommands = sortByNewest(
    (cmds || []).filter((command) => (command.status || "pending") === "pending"),
    (command) => getTimeValue(command.createdAt),
  );
  const visibleCommands = pendingCommands.slice(0, PENDING_COMMAND_DISPLAY_LIMIT);
  const hiddenCount = Math.max(pendingCommands.length - visibleCommands.length, 0);

  if (visibleCommands.length === 0) {
    el.innerHTML =
      '<div style="padding: 12px; color: #6b7280; text-align: center; font-size: 0.9rem;">No pending commands</div>';
    return;
  }
  visibleCommands.forEach((c) => {
    const row = document.createElement("div");
    row.className = "commands-item";
    const status = c.status || "pending";
    const statusClass =
      status === "completed" || status === "done"
        ? "cmd-completed"
        : status === "failed"
          ? "cmd-failed"
          : "cmd-pending";
    row.innerHTML = `
      <div>
        <strong>${getCommandTitle(c)}</strong>
        <small>${getCommandDetail(c)}</small>
      </div>
      <span class="cmd-status ${statusClass}">${status.toUpperCase()}</span>
    `;
    el.appendChild(row);
  });

  appendCompactMore(el, hiddenCount, "lệnh chờ khác");
}

document
  .getElementById("btn-refresh-commands")
  ?.addEventListener("click", async () => {
    const cmds = await FirebaseService.listCommands();
    renderCommands(cmds);
  });

// bind buttons (demo actions)
document.getElementById("btn-medicine-done").onclick = async () => {
  await FirebaseService.createCareLog({
    userId: "user01",
    type: "medicine",
    status: "done",
    message: "Đã uống thuốc buổi sáng",
    source: "web_dashboard",
  });
};
document.getElementById("btn-medicine-missed").onclick = async () => {
  await FirebaseService.createCareLog({
    userId: "user01",
    type: "medicine",
    status: "missed",
    message: "Chưa uống thuốc",
    source: "web_dashboard",
  });
};
document.getElementById("btn-ate").onclick = async () => {
  await FirebaseService.createCareLog({
    userId: "user01",
    type: "meal",
    status: "done",
    message: "Đã ăn sáng",
    source: "web_dashboard",
  });
};
document.getElementById("btn-no-response").onclick = async () => {
  await FirebaseService.createCareLog({
    userId: "user01",
    type: "response",
    status: "no_response",
    message: "Không phản hồi",
    source: "web_dashboard",
  });
};

document.getElementById("btn-sim-fall").onclick = async () => {
  await FirebaseService.createAlert({
    type: "fall_detected",
    level: "emergency",
    message: "Phát hiện ngã tại phòng khách",
    source: "camera_ai",
    lineStatus: "sent",
    createdAt: new Date().toISOString(),
  });
};
document.getElementById("btn-sim-robot-offline").onclick = async () => {
  await FirebaseService.createAlert({
    type: "robot_offline",
    level: "warning",
    message: "Robot Chami mất kết nối",
    source: "robot_chami",
    lineStatus: "sent",
    createdAt: new Date().toISOString(),
  });
};

// Demo mode buttons
document.getElementById("demo-robot-online").onclick = async () => {
  await FirebaseService.setRobot("chami01", {
    status: "online",
    battery: 95,
    lastActive: new Date().toISOString(),
  });
};
document.getElementById("demo-robot-offline").onclick = async () => {
  await FirebaseService.setRobot("chami01", { status: "offline" });
};
document.getElementById("demo-low-battery").onclick = async () => {
  await FirebaseService.setRobot("chami01", { battery: 10 });
};
document.getElementById("demo-fall").onclick = async () => {
  await FirebaseService.createAlert({
    type: "fall_detected",
    level: "emergency",
    message: "Phát hiện ngã (demo)",
    source: "demo",
  });
};
document.getElementById("demo-medicine-done").onclick = async () => {
  return handleMedicineReminderButtonClick();

  try {
    const command = await FirebaseService.createRobotActionCommand(
      "chami_001",
      "remind_medicine",
      "Nhắc người dùng uống thuốc",
      {
        source: "dashboard",
      },
    );

    console.log("Chami medicine reminder command created", {
      id: command?.id || null,
      target: command?.target || "chami_001",
      action: command?.action || "remind_medicine",
      status: command?.status || "pending",
    });

    await FirebaseService.createCareLog({
      userId: "user01",
      type: "medicine",
      status: "sent",
      message: "Đã gửi lệnh nhắc uống thuốc cho Chami",
      source: "dashboard",
    });
  } catch (error) {
    console.error("Failed to create Chami medicine reminder command", error);
  }
};
bindMedicineReminderButtonHandler();
setTimeout(bindMedicineReminderButtonHandler, 0);
window.addEventListener("load", bindMedicineReminderButtonHandler);
document.getElementById("demo-no-response").onclick = async () => {
  await FirebaseService.createCareLog({
    userId: "user01",
    type: "response",
    status: "no_response",
    message: "Không phản hồi (demo)",
    source: "demo",
  });
};
document.getElementById("demo-toggle-light").onclick = async () => {
  const button = document.getElementById("demo-toggle-light");
  if (button) {
    button.disabled = true;
  }
  try {
    await createLightControlCommand();
    toggleLocalLightDisplayState();
    alert("Đã gửi lệnh tới IR Hub");
  } catch (error) {
    console.error("Không gửi được lệnh", error);
    alert("Không gửi được lệnh");
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
};

// subscribe to realtime updates (works with Firestore or local fallback)
if (typeof FirebaseService.subscribeToRobots === "function") {
  FirebaseService.subscribeToRobots((data) => {
    // robots data may be array (local/realtime) or a single object.
    const first = Array.isArray(data) ? data[0] : data;
    latestLegacyRobot = first || { name: "Chami", status: "offline", battery: 0 };
    updateRobotSection(pickRobotForDisplay());
  });
}

if (typeof FirebaseService.subscribeToDevices === "function") {
  FirebaseService.subscribeToDevices((data) =>
    updateDevicesSection(data || []),
  );
}

if (typeof FirebaseService.subscribeToAlerts === "function") {
  FirebaseService.subscribeToAlerts((data) => updateAlertsSection(data || []));
}

if (typeof FirebaseService.subscribeToCareLogs === "function") {
  FirebaseService.subscribeToCareLogs((data) =>
    updateCareLogsSection(data || []),
  );
}

if (typeof FirebaseService.subscribeToCommands === "function") {
  FirebaseService.subscribeToCommands((data) => renderCommands(data || []));
}

setInterval(refreshRobotPresenceDisplay, ROBOT_STATUS_REFRESH_INTERVAL_MS);

setupResolvedFallHistoryToggle();
subscribeToCameraDeviceStatus();
subscribeToFallAlerts();

// initial fetch to populate UI immediately
(async () => {
  const r = await FirebaseService.getRobot("chami01");
  latestLegacyRobot = r || { name: "Chami", status: "offline", battery: 0 };
  updateRobotSection(pickRobotForDisplay());
  const devices = await FirebaseService.listDevices();
  updateDevicesSection(devices || []);
  const alerts = await FirebaseService.listAlerts();
  updateAlertsSection(alerts || []);
  const logs = await FirebaseService.listCareLogs();
  updateCareLogsSection(logs || []);
})();

