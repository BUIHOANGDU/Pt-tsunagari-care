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
const FALL_RESPONSE_EVENT_WINDOW_MS = 10 * 60 * 1000;
const FALL_RESPONSE_CLOCK_SKEW_MS = 30 * 1000;
const FALL_RESPONSE_TIMELINE_REFRESH_INTERVAL_MS = 30 * 1000;
const LEGACY_DEMO_MEDICINE_MESSAGE =
  "\u0110\u00e3 u\u1ed1ng thu\u1ed1c (demo)";
const MEDICINE_REMINDER_COMMAND_TEXT =
  "Nh\u1eafc ng\u01b0\u1eddi d\u00f9ng u\u1ed1ng thu\u1ed1c";
const MEDICINE_REMINDER_LOG_MESSAGE =
  "\u0110\u00e3 g\u1eedi l\u1ec7nh nh\u1eafc u\u1ed1ng thu\u1ed1c cho Chami";
const MEDICINE_REMINDER_ID = "medicine_morning";
const DEFAULT_MEDICINE_REMINDER = {
  medicineName: "Thuốc huyết áp",
  time: "08:00",
  timezone: "Asia/Tokyo",
  repeat: "daily",
  enabled: true,
  targetDeviceId: "chami_001",
};
const MEDICINE_REMINDER_SENT_MESSAGE = "Đã gửi lời nhắc uống thuốc";
const MEDICINE_REMINDER_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
let latestMedicineReminder = null;
let medicineReminderRequestRunning = false;

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
let latestFallResponseCareEvents = [];
let latestChamiAlertsForCareEventMapping = [];
const mappedChamiEmergencyAlertIds = new Set();
const duplicateCareEventLogIds = new Set();
const invalidTimelineTimestampLogIds = new Set();
const alertReceiveFallbackTimestamps = new Map();
let fallResponseCareEventsLoaded = false;
let fallTimelineLoadedLogged = false;
let lastFallTimelineSignature = "";
let lastMissingSafeFlowKey = "";

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
    emergency_response: "Phản hồi khẩn cấp",
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
    fall_camera: "Fall Camera",
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
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const numericTimestamp = Number(value);
    return Number.isFinite(numericTimestamp) ? numericTimestamp : 0;
  }
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value === "object") {
    const seconds = value.seconds ?? value._seconds;
    const nanoseconds = value.nanoseconds ?? value._nanoseconds ?? 0;
    if (Number.isFinite(seconds)) {
      return seconds * 1000 + Math.floor(nanoseconds / 1000000);
    }
  }

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

function getMedicineReminderEls() {
  return {
    nameInput: document.getElementById("medicine-name-input"),
    timeInput: document.getElementById("medicine-time-input"),
    enabledInput: document.getElementById("medicine-enabled-input"),
    saveButton: document.getElementById("medicine-reminder-save"),
    nowButton: document.getElementById("medicine-reminder-now"),
    status: document.getElementById("medicine-reminder-status"),
    lastTriggered: document.getElementById("medicine-last-triggered"),
  };
}

function setMedicineReminderStatus(message) {
  const { status } = getMedicineReminderEls();
  if (status) status.textContent = message || "";
}

function getMedicineReminderFormData() {
  const { nameInput, timeInput, enabledInput } = getMedicineReminderEls();
  const medicineName = (nameInput?.value || "").trim();
  const time = (timeInput?.value || "").trim();

  if (!medicineName) {
    throw new Error("Tên thuốc không được rỗng");
  }

  if (!MEDICINE_REMINDER_TIME_RE.test(time)) {
    throw new Error("Giờ uống phải đúng định dạng HH:mm");
  }

  return {
    ...DEFAULT_MEDICINE_REMINDER,
    medicineName,
    time,
    enabled: Boolean(enabledInput?.checked),
  };
}

function renderMedicineReminder(reminder) {
  const { nameInput, timeInput, enabledInput, lastTriggered } =
    getMedicineReminderEls();
  const data = reminder || DEFAULT_MEDICINE_REMINDER;
  latestMedicineReminder = reminder || null;

  if (nameInput) nameInput.value = data.medicineName || DEFAULT_MEDICINE_REMINDER.medicineName;
  if (timeInput) timeInput.value = data.time || DEFAULT_MEDICINE_REMINDER.time;
  if (enabledInput) enabledInput.checked = data.enabled !== false;
  if (lastTriggered) {
    lastTriggered.textContent = data.lastTriggeredAt
      ? formatDateTime(data.lastTriggeredAt)
      : "Chưa có";
  }
}

async function saveMedicineReminderFromDashboard() {
  const { saveButton } = getMedicineReminderEls();

  try {
    if (saveButton) saveButton.disabled = true;
    const payload = getMedicineReminderFormData();
    const saved = await FirebaseService.saveMedicineReminder(
      payload,
      MEDICINE_REMINDER_ID,
    );
    latestMedicineReminder = saved;
    console.log("Dashboard: medicine reminder saved");
    setMedicineReminderStatus("Đã lưu lịch nhắc thuốc");
  } catch (error) {
    console.error("Dashboard: medicine reminder save failed", error);
    setMedicineReminderStatus("Không thể lưu lịch nhắc thuốc");
  } finally {
    if (saveButton) saveButton.disabled = false;
  }
}

async function updateMedicineReminderEnabled(enabled) {
  try {
    await FirebaseService.setMedicineReminderEnabled(
      enabled,
      MEDICINE_REMINDER_ID,
    );
    console.log(
      enabled
        ? "Dashboard: medicine reminder enabled"
        : "Dashboard: medicine reminder disabled",
    );
    setMedicineReminderStatus(enabled ? "Đã bật lịch nhắc thuốc" : "Lịch đang tắt");
  } catch (error) {
    console.error("Dashboard: medicine reminder enabled update failed", error);
    setMedicineReminderStatus("Không thể lưu lịch nhắc thuốc");
  }
}

async function createMedicineReminderNowCommand() {
  if (medicineReminderRequestRunning) return;

  const { nowButton } = getMedicineReminderEls();
  medicineReminderRequestRunning = true;

  try {
    if (nowButton) nowButton.disabled = true;
    const formData = getMedicineReminderFormData();
    const medicineName =
      latestMedicineReminder?.medicineName || formData.medicineName;
    const result = await FirebaseService.createMedicineReminderCommand({
      source: "dashboard",
      targetDeviceId: "chami_001",
      medicineName,
    });

    if (result?.skipped) {
      setMedicineReminderStatus(
        "Chami đã có yêu cầu nhắc thuốc đang chờ xử lý",
      );
      return;
    }

    console.log("Chami medicine reminder command created", {
      id: result?.command?.id || null,
      target: result?.command?.target || "chami_001",
      action: result?.command?.action || "remind_medicine",
      status: result?.command?.status || "pending",
    });
    setMedicineReminderStatus("Đã tạo yêu cầu nhắc ngay");
  } catch (error) {
    console.error("Failed to create Chami medicine reminder command", error);
    setMedicineReminderStatus("Không thể tạo yêu cầu nhắc ngay");
  } finally {
    medicineReminderRequestRunning = false;
    if (nowButton) nowButton.disabled = false;
  }
}

function bindMedicineReminderDashboard() {
  const { saveButton, nowButton, enabledInput } = getMedicineReminderEls();

  renderMedicineReminder(latestMedicineReminder);
  saveButton?.addEventListener("click", saveMedicineReminderFromDashboard);
  nowButton?.addEventListener("click", createMedicineReminderNowCommand);
  enabledInput?.addEventListener("change", (event) => {
    updateMedicineReminderEnabled(event.target.checked);
  });

  if (typeof FirebaseService.listenMedicineReminder === "function") {
    FirebaseService.listenMedicineReminder((reminder) => {
      renderMedicineReminder(reminder);
      if (reminder?.enabled === false) {
        setMedicineReminderStatus("Lịch đang tắt");
      }
    }, MEDICINE_REMINDER_ID);
  }
}

function normalizeTimelineText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getTimelineTimestamp(item) {
  const candidates = [
    item?.createdAt,
    item?.confirmedAt,
    item?.updatedAt,
    item?.observedAt,
    item?.timelineFallbackAt,
  ];

  for (const candidate of candidates) {
    const timestamp = getTimeValue(candidate);
    if (timestamp > 0) return timestamp;
  }

  const logId = item?.id || item?.relatedAlertId || item?.type || "unknown";
  if (!invalidTimelineTimestampLogIds.has(logId)) {
    invalidTimelineTimestampLogIds.add(logId);
    console.warn("Dashboard: Fall response timestamp parse failed", {
      id: item?.id || null,
      type: item?.type || null,
      createdAt: item?.createdAt ?? null,
    });
  }

  return 0;
}

function isChamiEmergencyAlert(alert) {
  const source = alert?.source || alert?.deviceId || "";
  return (
    alert?.type === "emergency_response" &&
    ["chami_001", "robot_chami", "chami"].includes(source) &&
    (!alert?.level || ["danger", "emergency"].includes(alert.level))
  );
}

function isNoResponseEmergencyAlert(alert) {
  const message = normalizeTimelineText(alert?.message);
  return (
    isChamiEmergencyAlert(alert) &&
    (message.includes("no_response") ||
      message.includes("no response") ||
      message.includes("khong co phan hoi"))
  );
}

function formatFallTimelineTime(value) {
  const timestamp = getTimeValue(value);
  if (!timestamp) return "Đang chờ";

  const date = new Date(timestamp);
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  return date.toLocaleString("vi-VN", {
    day: sameDay ? undefined : "2-digit",
    month: sameDay ? undefined : "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function createFallTimelineStep(step, index) {
  const item = document.createElement("article");
  item.className = `fall-response-step is-${step.status}`;
  item.setAttribute("role", "listitem");

  const marker = document.createElement("span");
  marker.className = "fall-response-marker";
  marker.textContent = String(index + 1);
  marker.setAttribute("aria-hidden", "true");

  const content = document.createElement("div");
  content.className = "fall-response-step-content";

  const title = document.createElement("strong");
  title.textContent = step.title;

  const time = document.createElement("time");
  time.textContent = formatFallTimelineTime(step.time);

  const detail = document.createElement("p");
  detail.textContent = step.detail;

  content.append(title, time, detail);
  item.append(marker, content);
  return item;
}

// Prefer persisted care_events; recent Chami alerts are the resilient fallback.
function getRecentFallResponseCareEvents() {
  const now = Date.now();
  const cutoff = now - FALL_RESPONSE_EVENT_WINDOW_MS;

  return (latestFallResponseCareEvents || [])
    .filter((event) => {
      const timestamp = getTimelineTimestamp(event);
      return (
        event?.flow === "fall_response" &&
        timestamp >= cutoff &&
        timestamp <= now + FALL_RESPONSE_CLOCK_SKEW_MS
      );
    })
    .sort((a, b) => getTimelineTimestamp(a) - getTimelineTimestamp(b));
}

function getCareEventTitle(event) {
  if (event?.type === "fall_confirmed") {
    return "Camera phát hiện nguy cơ té ngã";
  }

  if (event?.type === "chami_command_sent") {
    return "Đã yêu cầu Chami kiểm tra người dùng";
  }

  if (event?.type === "chami_alert_received") {
    if (event.status === "no_response") {
      return "Không có phản hồi sau thời gian chờ";
    }

    if (event.status === "danger") {
      return "Đã gửi cảnh báo khẩn cấp cho người nhà";
    }

    if (event.status === "safe") {
      return "Người dùng xác nhận an toàn";
    }
  }

  return event?.message || "Sự kiện chăm sóc";
}

function getCareEventStatus(event) {
  const status = event?.status || "warning";
  if (["done", "active", "safe", "danger", "warning"].includes(status)) {
    return status;
  }

  return status === "no_response" ? "danger" : "warning";
}

function selectLatestFallResponseFlow(events) {
  if (!events.length) return [];

  const latestEvent = events[events.length - 1];
  let flowId = latestEvent.flowId || "";

  if (!flowId) {
    const latestTimestamp = getTimelineTimestamp(latestEvent);
    const nearestFlowEvent = events
      .slice(0, -1)
      .reverse()
      .find((event) => {
        const timestamp = getTimelineTimestamp(event);
        return (
          event.flowId &&
          timestamp <= latestTimestamp + FALL_RESPONSE_CLOCK_SKEW_MS &&
          latestTimestamp - timestamp <= FALL_RESPONSE_EVENT_WINDOW_MS
        );
      });
    flowId = nearestFlowEvent?.flowId || "";
  }

  if (!flowId) {
    return [latestEvent];
  }

  const flowEvents = events.filter((event) => event.flowId === flowId);
  const flowStart = getTimelineTimestamp(flowEvents[0]);
  const flowEnd = flowStart + FALL_RESPONSE_EVENT_WINDOW_MS;

  return events.filter((event) => {
    const timestamp = getTimelineTimestamp(event);
    return (
      event.flowId === flowId ||
      (!event.flowId && timestamp >= flowStart && timestamp <= flowEnd)
    );
  });
}

function buildCareEventFallResponseTimelineModel() {
  const selectedEvents = selectLatestFallResponseFlow(
    getRecentFallResponseCareEvents(),
  );
  if (!selectedEvents.length) return null;

  const latestResult = selectedEvents
    .slice()
    .reverse()
    .find(
      (event) =>
        event.type === "chami_alert_received" &&
        ["safe", "danger", "no_response"].includes(event.status),
    );
  const hasFinalResult = Boolean(latestResult);
  const steps = selectedEvents.slice(-5).map((event) => ({
    id: event.id || `${event.type}_${getTimelineTimestamp(event)}`,
    title: getCareEventTitle(event),
    status: getCareEventStatus(event),
    time: event.createdAt,
    detail: event.detail || event.message || "",
  }));

  if (!hasFinalResult && steps.length < 5) {
    steps.push({
      id: "waiting_for_chami_result",
      title: "Đang chờ kết quả từ Chami",
      status: "active",
      time: null,
      detail: "Chưa có event safe, danger hoặc no_response cho flow này.",
    });
  }

  let summary = "Đang xử lý";
  let summaryStatus = "active";
  if (latestResult?.status === "safe") {
    summary = "An toàn";
    summaryStatus = "safe";
  } else if (latestResult?.status === "no_response") {
    summary = "Không phản hồi";
    summaryStatus = "danger";
  } else if (latestResult?.status === "danger") {
    summary = "Khẩn cấp";
    summaryStatus = "danger";
  }

  const firstEvent = selectedEvents[0];
  return {
    flowKey:
      firstEvent.flowId ||
      `care_event:${firstEvent.id || getTimelineTimestamp(firstEvent)}`,
    outcome: latestResult?.status || null,
    summary,
    summaryStatus,
    steps,
  };
}

function getLatestRecentChamiEmergencyAlert() {
  const now = Date.now();
  const emergencyAlerts = (latestChamiAlertsForCareEventMapping || []).filter(
    isChamiEmergencyAlert,
  );
  const latestValidAlert = emergencyAlerts
    .filter((alert) => {
      const timestamp = getTimelineTimestamp(alert);
      return (
        timestamp >= now - FALL_RESPONSE_EVENT_WINDOW_MS &&
        timestamp <= now + FALL_RESPONSE_CLOCK_SKEW_MS
      );
    })
    .sort((a, b) => getTimelineTimestamp(b) - getTimelineTimestamp(a))[0];

  if (latestValidAlert) return latestValidAlert;
  if (!emergencyAlerts.length) return null;

  const fallbackId = emergencyAlerts[0].id || "latest_emergency_alert";
  if (!alertReceiveFallbackTimestamps.has(fallbackId)) {
    alertReceiveFallbackTimestamps.set(fallbackId, now);
  }
  return {
    ...emergencyAlerts[0],
    timelineFallbackAt: alertReceiveFallbackTimestamps.get(fallbackId),
  };
}

function buildAlertFallbackTimelineModel(alert) {
  if (!alert) return null;

  const noResponse = isNoResponseEmergencyAlert(alert);
  const alertTime = alert.createdAt || alert.timelineFallbackAt;
  const detail =
    "Dữ liệu camera event chưa có trong care_events, timeline được dựng từ alert mới nhất.";
  const resultTitle = noResponse
    ? "Không có phản hồi sau thời gian chờ"
    : "Người dùng cần trợ giúp";
  const relatedAlertId =
    alert.id || `chami_${getTimelineTimestamp(alert) || Date.now()}`;

  return {
    flowKey: `alert-fallback:${relatedAlertId}`,
    outcome: noResponse ? "no_response" : "danger",
    summary: noResponse ? "Không phản hồi" : "Khẩn cấp",
    summaryStatus: "danger",
    steps: [
      {
        id: `${relatedAlertId}_checking`,
        title: "Chami đã hoàn tất kiểm tra",
        status: "done",
        time: alertTime,
        detail,
      },
      {
        id: `${relatedAlertId}_result`,
        title: resultTitle,
        status: "danger",
        time: alertTime,
        detail: alert.message || detail,
      },
      {
        id: `${relatedAlertId}_family_alert`,
        title: "Đã gửi cảnh báo khẩn cấp cho người nhà",
        status: "danger",
        time: alertTime,
        detail,
      },
    ],
  };
}

function isEmergencyAlertRepresentedInCareEvents(alert, careEvents) {
  if (!alert) return false;

  const relatedAlertId = alert.id || "";
  const alertTimestamp = getTimelineTimestamp(alert);
  return (careEvents || []).some((event) => {
    if (
      relatedAlertId &&
      event.type === "chami_alert_received" &&
      event.relatedAlertId === relatedAlertId
    ) {
      return true;
    }

    const eventTimestamp = getTimelineTimestamp(event);
    return (
      event.type === "chami_alert_received" &&
      event.status ===
        (isNoResponseEmergencyAlert(alert) ? "no_response" : "danger") &&
      alertTimestamp > 0 &&
      Math.abs(eventTimestamp - alertTimestamp) <= FALL_RESPONSE_CLOCK_SKEW_MS
    );
  });
}

function getFallResponseTimelineRenderData() {
  const recentCareEvents = getRecentFallResponseCareEvents();
  const careEventModel = buildCareEventFallResponseTimelineModel();
  const latestAlert = getLatestRecentChamiEmergencyAlert();
  const fallbackModel = buildAlertFallbackTimelineModel(latestAlert);

  if (!careEventModel) {
    return {
      model: fallbackModel,
      source: fallbackModel ? "alert_fallback" : "empty",
      recentCareEventCount: recentCareEvents.length,
      latestAlert,
    };
  }

  if (latestAlert) {
    const latestCareEventTimestamp = Math.max(
      ...recentCareEvents.map(getTimelineTimestamp),
    );
    const latestAlertTimestamp = getTimelineTimestamp(latestAlert);
    const alertIsRepresented = isEmergencyAlertRepresentedInCareEvents(
      latestAlert,
      recentCareEvents,
    );

    if (
      !alertIsRepresented &&
      latestAlertTimestamp >=
        latestCareEventTimestamp - FALL_RESPONSE_CLOCK_SKEW_MS
    ) {
      return {
        model: fallbackModel,
        source: "alert_fallback",
        recentCareEventCount: recentCareEvents.length,
        latestAlert,
      };
    }
  }

  return {
    model: careEventModel,
    source: "care_events",
    recentCareEventCount: recentCareEvents.length,
    latestAlert,
  };
}

function findNearestCareEventFlow(alertTimestamp) {
  return getRecentFallResponseCareEvents()
    .slice()
    .reverse()
    .find((event) => {
      const timestamp = getTimelineTimestamp(event);
      return (
        event.flowId &&
        ["fall_confirmed", "chami_command_sent"].includes(event.type) &&
        timestamp <= alertTimestamp + FALL_RESPONSE_CLOCK_SKEW_MS &&
        alertTimestamp - timestamp <= FALL_RESPONSE_EVENT_WINDOW_MS
      );
    });
}

async function mapChamiEmergencyAlertsToCareEvents(alerts) {
  if (typeof FirebaseService.createCareEvent !== "function") {
    console.warn("Dashboard: FirebaseService.createCareEvent is not available");
    return;
  }

  const now = Date.now();
  const emergencyAlerts = (alerts || []).filter(isChamiEmergencyAlert);
  const recentAlerts = emergencyAlerts.filter((alert, index) => {
    const timestamp = getTimelineTimestamp(alert);
    if (!timestamp) return index === 0;
    return (
      timestamp >= now - FALL_RESPONSE_EVENT_WINDOW_MS &&
      timestamp <= now + FALL_RESPONSE_CLOCK_SKEW_MS
    );
  });

  for (const alert of recentAlerts) {
    const relatedAlertId =
      alert.id || `chami_${getTimelineTimestamp(alert) || Date.now()}`;
    if (mappedChamiEmergencyAlertIds.has(relatedAlertId)) {
      if (!duplicateCareEventLogIds.has(relatedAlertId)) {
        duplicateCareEventLogIds.add(relatedAlertId);
        console.log("Dashboard: care_event write skipped duplicate alert");
      }
      continue;
    }

    mappedChamiEmergencyAlertIds.add(relatedAlertId);
    const noResponse = isNoResponseEmergencyAlert(alert);
    const alertTimestamp = getTimelineTimestamp(alert) || Date.now();
    const nearestFlow = findNearestCareEventFlow(alertTimestamp);

    try {
      const result = await FirebaseService.createCareEvent(
        {
          flow: "fall_response",
          flowId: nearestFlow?.flowId || "",
          source: "chami",
          type: "chami_alert_received",
          status: noResponse ? "no_response" : "danger",
          message: noResponse
            ? "Không có phản hồi sau thời gian chờ"
            : "Người dùng cần trợ giúp",
          detail: alert.message || "",
          relatedAlertId,
          cameraId: nearestFlow?.cameraId || "default_cam",
          location: nearestFlow?.location || "living_room",
          createdAt: getTimelineTimestamp(alert) ? alert.createdAt : undefined,
        },
        { eventId: `chami_alert_${relatedAlertId}` },
      );

      if (result?.created) {
        console.log("Dashboard: Chami emergency alert mapped to timeline");
      } else if (!duplicateCareEventLogIds.has(relatedAlertId)) {
        duplicateCareEventLogIds.add(relatedAlertId);
        console.log("Dashboard: care_event write skipped duplicate alert");
      }
    } catch (error) {
      mappedChamiEmergencyAlertIds.delete(relatedAlertId);
      console.warn(
        "Dashboard: care_event write failed, using alert fallback",
        error,
      );
    }
  }
}

function updateFallResponseTimelineFromCareEvents() {
  const timeline = document.getElementById("fall-response-timeline");
  const summary = document.getElementById("fall-response-summary");
  const note = document.getElementById("fall-response-note");
  if (!timeline || !summary || !note) return;

  if (fallResponseCareEventsLoaded && !fallTimelineLoadedLogged) {
    fallTimelineLoadedLogged = true;
    console.log("Dashboard: Fall response care events loaded");
  }

  const renderData = getFallResponseTimelineRenderData();
  const { model, source, recentCareEventCount, latestAlert } = renderData;
  const signature = model
    ? JSON.stringify({
        source,
        flowKey: model.flowKey,
        outcome: model.outcome,
        steps: model.steps.map((step) => ({
          id: step.id,
          status: step.status,
          time: getTimeValue(step.time),
          title: step.title,
        })),
      })
    : "empty";

  if (signature === lastFallTimelineSignature) return;
  lastFallTimelineSignature = signature;
  console.debug("Dashboard: Fall response timeline debug", {
    recentCareEventCount,
    latestEmergencyAlert: latestAlert
      ? {
          id: latestAlert.id || null,
          type: latestAlert.type || null,
          level: latestAlert.level || null,
          source: latestAlert.source || latestAlert.deviceId || null,
          createdAt: latestAlert.createdAt || null,
        }
      : null,
    renderSource: source,
  });
  timeline.replaceChildren();

  if (!model) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Chưa có sự kiện ngã gần đây";
    timeline.appendChild(empty);
    timeline.removeAttribute("role");
    summary.className = "fall-response-summary is-empty";
    summary.textContent = "Chưa có dữ liệu";
    note.textContent =
      "Kết quả an toàn chỉ hiển thị khi Chami gửi care event safe.";
    console.log("Dashboard: No recent fall response timeline");
    return;
  }

  timeline.setAttribute("role", "list");
  model.steps.forEach((step, index) => {
    timeline.appendChild(createFallTimelineStep(step, index));
  });
  summary.className = `fall-response-summary is-${model.summaryStatus}`;
  summary.textContent = model.summary;

  if (source === "alert_fallback") {
    note.textContent =
      "Đang dùng alert emergency_response mới nhất vì care_events chưa có event tương ứng.";
  } else if (model.outcome === "safe") {
    note.textContent = "Kết quả safe được xác nhận từ care_events.";
  } else if (["danger", "no_response"].includes(model.outcome)) {
    note.textContent =
      "Kết quả khẩn cấp dùng đúng timestamp của alert Chami được ánh xạ vào care_events.";
  } else {
    note.textContent =
      "Chưa có event safe, danger hoặc no_response; dashboard không tự suy diễn kết quả.";
    if (lastMissingSafeFlowKey !== model.flowKey) {
      lastMissingSafeFlowKey = model.flowKey;
      console.log("Dashboard: Safe result log is not available yet");
    }
  }

  if (source === "alert_fallback") {
    console.log("Dashboard: Fall response timeline rendered from alert fallback");
  } else {
    console.log("Dashboard: Fall response timeline rendered from care_events");
  }
}

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
    const title =
      l.type === "medicine_reminder_sent"
        ? MEDICINE_REMINDER_SENT_MESSAGE
        : l.type;
    const detail =
      l.type === "medicine_reminder_sent"
        ? [l.medicineName, l.time, l.source].filter(Boolean).join(" / ")
        : l.message || l.status;
    item.innerHTML = `
      <div class="timeline-dot"></div>
      <div class="timeline-content">
        <strong>${title}</strong>
        <small class="timeline-time">${detail}</small>
      </div>
    `;
    el.appendChild(item);
  });

  appendCompactMore(el, hiddenCount, "hoạt động cũ hơn");
}

async function handleMedicineReminderButtonClick() {
  console.log("Medicine button clicked - creating Chami command");

  try {
    if (typeof FirebaseService.createMedicineReminderCommand !== "function") {
      throw new Error("FirebaseService.createMedicineReminderCommand is unavailable");
    }

    const result = await FirebaseService.createMedicineReminderCommand({
      source: "dashboard",
      targetDeviceId: "chami_001",
      medicineName:
        latestMedicineReminder?.medicineName ||
        DEFAULT_MEDICINE_REMINDER.medicineName,
      text: MEDICINE_REMINDER_COMMAND_TEXT,
      createdAt: getRealtimeCommandTimestamp(),
    });

    if (result?.skipped) {
      console.log("Medicine reminder command already pending for Chami");
      setMedicineReminderStatus(
        "Chami đã có yêu cầu nhắc thuốc đang chờ xử lý",
      );
      return;
    }

    console.log("Chami medicine reminder command created", {
      id: result?.command?.id || null,
      target: result?.command?.target || "chami_001",
      type: result?.command?.type || "robot_action",
      action: result?.command?.action || "remind_medicine",
      status: result?.command?.status || "pending",
    });
    setMedicineReminderStatus("Đã tạo yêu cầu nhắc ngay");
  } catch (error) {
    console.error("Failed to create Chami medicine reminder command", error);
    setMedicineReminderStatus("Không thể tạo yêu cầu nhắc ngay");
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
  FirebaseService.subscribeToAlerts((data) => {
    const alerts = data || [];
    latestChamiAlertsForCareEventMapping = alerts;
    updateAlertsSection(alerts);
    updateFallResponseTimelineFromCareEvents();
    mapChamiEmergencyAlertsToCareEvents(alerts);
  });
}

if (typeof FirebaseService.subscribeToCareLogs === "function") {
  FirebaseService.subscribeToCareLogs((data) => {
    updateCareLogsSection(data || []);
  });
}

if (typeof FirebaseService.subscribeToCareEvents === "function") {
  FirebaseService.subscribeToCareEvents((data) => {
    latestFallResponseCareEvents = data || [];
    fallResponseCareEventsLoaded = true;
    updateFallResponseTimelineFromCareEvents();
    mapChamiEmergencyAlertsToCareEvents(latestChamiAlertsForCareEventMapping);
  });
} else {
  fallResponseCareEventsLoaded = true;
  updateFallResponseTimelineFromCareEvents();
  console.warn("Dashboard: FirebaseService.subscribeToCareEvents is not available");
}

if (typeof FirebaseService.subscribeToCommands === "function") {
  FirebaseService.subscribeToCommands((data) => {
    const commands = data || [];
    renderCommands(commands);
  });
}

setInterval(refreshRobotPresenceDisplay, ROBOT_STATUS_REFRESH_INTERVAL_MS);
// Re-evaluate the local 10-minute window without issuing any Firebase request.
setInterval(
  updateFallResponseTimelineFromCareEvents,
  FALL_RESPONSE_TIMELINE_REFRESH_INTERVAL_MS,
);

setupResolvedFallHistoryToggle();
bindMedicineReminderDashboard();
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

