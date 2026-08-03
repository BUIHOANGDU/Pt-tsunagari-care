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
const TOKYO_TIMEZONE = "Asia/Tokyo";
const WEATHER_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const CARE_LOG_DISPLAY_LIMIT = 3;
const ALERT_DISPLAY_LIMIT = 1;
const CAREGIVER_NOTIFICATION_DISPLAY_LIMIT = 3;
const HEALTH_CONVERSATION_COLLAPSED_LIMIT = 5;
const HEALTH_CONVERSATION_MAX_RECORDS = 30;
const COMMAND_TOAST_MAX_VISIBLE = 3;
const COMMAND_TOAST_DEFAULT_DURATION_MS = 6000;
const COMMAND_TOAST_DURATIONS_MS = {
  pending: 6000,
  processing: 6000,
  completed: 4000,
  failed: 8000,
  cancelled: 6000,
  warning: 6000,
};
const RESOLVED_FALL_HISTORY_LIMIT = 3;
const ROBOT_OFFLINE_TIMEOUT_MS = 90 * 1000;
const ROBOT_STATUS_REFRESH_INTERVAL_MS = 10 * 1000;
const FALL_RESPONSE_EVENT_WINDOW_MS = 10 * 60 * 1000;
const FALL_RESPONSE_CLOCK_SKEW_MS = 30 * 1000;
const FALL_RESPONSE_TIMELINE_REFRESH_INTERVAL_MS = 30 * 1000;
let healthConversationExpanded = false;
let latestHealthConcerns = [];
const LEGACY_DEMO_MEDICINE_MESSAGE =
  "\u0110\u00e3 u\u1ed1ng thu\u1ed1c (demo)";
const DEFAULT_MEDICINE_REMINDER = {
  medicineName: "",
  time: "08:00",
  timezone: TOKYO_TIMEZONE,
  repeat: "daily",
  enabled: true,
  targetDeviceId: "chami_001",
};
const ROOM_ENVIRONMENT_DEMO = {
  temperatureC: 25,
  humidityPercent: 50,
  source: "demo",
  updatedAt: new Date().toISOString(),
  online: true,
};

function uiText(key) {
  return window.TsunagariI18n?.t
    ? window.TsunagariI18n.t(key)
    : key;
}

function getUiLanguage() {
  return window.TsunagariI18n?.getCurrentLanguage
    ? window.TsunagariI18n.getCurrentLanguage()
    : "ja";
}

function getDateTimeLocale() {
  return getUiLanguage() === "vi" ? "vi-VN" : "ja-JP";
}

function getTokyoDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat(getDateTimeLocale(), {
    timeZone: TOKYO_TIMEZONE,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    weekday: byType.weekday || "",
    year: byType.year || "",
    month: byType.month || "",
    day: byType.day || "",
  };
}

function formatTokyoDate(date = new Date()) {
  const parts = getTokyoDateParts(date);
  if (getUiLanguage() === "vi") {
    return `${parts.weekday}, ${parts.day}/${parts.month}/${parts.year}`;
  }

  return `${parts.year}年${Number(parts.month)}月${Number(parts.day)}日 ${parts.weekday}`;
}

function formatTokyoTime(date = new Date()) {
  return new Intl.DateTimeFormat(getDateTimeLocale(), {
    timeZone: TOKYO_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function roundTemperature(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function formatTemperature(value, digits = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "--°C";
  return `${parsed.toFixed(digits).replace(/\.0$/, "")}°C`;
}

function getLocalizedLocationName(location = {}) {
  const name = String(location.name || "").trim();
  return name.toLowerCase() === "tokyo" ? uiText("tokyo") : name || uiText("tokyo");
}

function getWeatherKind(weatherCode) {
  const code = Number(weatherCode);
  if (code === 0) return "clear";
  if (code === 1 || code === 2) return "partlyCloudy";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "drizzle";
  if ([61, 63, 66, 67, 80, 81].includes(code)) return "rain";
  if (code === 65 || code === 82) return "heavyRain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "thunderstorm";
  return "unknownWeather";
}

function getWeatherIcon(kind) {
  const icons = {
    clear: "☀️",
    partlyCloudy: "🌤️",
    cloudy: "☁️",
    fog: "🌫️",
    drizzle: "🌧️",
    rain: "🌧️",
    heavyRain: "🌧️",
    snow: "❄️",
    thunderstorm: "⛈️",
    unknownWeather: "☁️",
  };

  return icons[kind] || icons.unknownWeather;
}

function getRoomEnvironment() {
  return ROOM_ENVIRONMENT_DEMO;
}

function updateDateTimeEnvironmentClock() {
  const now = new Date();
  const dateEl = document.getElementById("current-date-text");
  const timeEl = document.getElementById("current-time-text");

  if (dateEl) dateEl.textContent = formatTokyoDate(now);
  if (timeEl) timeEl.textContent = formatTokyoTime(now);
}

function renderRoomEnvironment() {
  const room = getRoomEnvironment();
  const temperatureEl = document.getElementById("room-temperature-text");
  const humidityEl = document.getElementById("room-humidity-text");
  const badgeEl = document.getElementById("room-demo-badge");

  if (temperatureEl) {
    temperatureEl.textContent = formatTemperature(room.temperatureC);
  }
  if (humidityEl) {
    humidityEl.textContent = `${uiText("humidity")} ${Math.round(room.humidityPercent)}%`;
  }
  if (badgeEl) {
    badgeEl.textContent = room.source === "demo" ? uiText("demo") : room.source;
  }
}

function renderOutdoorWeather() {
  const tile = document.getElementById("outdoor-weather-tile");
  const iconEl = document.getElementById("outdoor-weather-icon");
  const temperatureEl = document.getElementById("outdoor-temperature-text");
  const detailEl = document.getElementById("outdoor-weather-detail");
  if (!tile || !iconEl || !temperatureEl || !detailEl) return;

  tile.classList.remove("is-loading", "is-stale", "is-unavailable");

  if (latestWeatherState.status === "loading") {
    tile.classList.add("is-loading");
    iconEl.textContent = "☁️";
    iconEl.setAttribute("aria-label", uiText("weatherLoading"));
    temperatureEl.textContent = "--°C";
    detailEl.textContent = uiText("weatherLoading");
    return;
  }

  if (latestWeatherState.status === "unavailable" || !latestWeatherState.data) {
    tile.classList.add("is-unavailable");
    iconEl.textContent = "☁️";
    iconEl.setAttribute("aria-label", uiText("weatherUnavailable"));
    temperatureEl.textContent = "--°C";
    detailEl.textContent = uiText("weatherUnavailable");
    return;
  }

  const data = latestWeatherState.data;
  const weather = data.weather || {};
  const kind = getWeatherKind(weather.weatherCode);
  const description = uiText(kind);
  const location = getLocalizedLocationName(data.location);
  const staleLabel = latestWeatherState.status === "stale" ? `${uiText("weatherStale")} · ` : "";
  const observedAt = weather.observedAt ? formatMedicineTime(weather.observedAt) : "";
  const updated = observedAt ? ` · ${uiText("lastUpdated")} ${observedAt}` : "";

  if (latestWeatherState.status === "stale") {
    tile.classList.add("is-stale");
  }
  iconEl.textContent = getWeatherIcon(kind);
  iconEl.setAttribute("aria-label", description);
  temperatureEl.textContent = `${location} ${formatTemperature(roundTemperature(weather.temperatureC))}`;
  detailEl.textContent =
    `${staleLabel}${description} · ${uiText("feelsLike")} ${formatTemperature(
      weather.apparentTemperatureC,
      1,
    )} · ${uiText("humidity")} ${Math.round(weather.humidityPercent)}%${updated}`;
}

async function fetchOutdoorWeather() {
  if (document.visibilityState === "hidden") return;
  lastWeatherFetchAt = Date.now();

  if (!latestWeatherState.data) {
    latestWeatherState = { status: "loading", data: null };
    renderOutdoorWeather();
  }

  try {
    const response = await fetch(`${getBridgeApiBaseUrl()}/api/weather/current`, {
      headers: {
        accept: "application/json",
      },
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.ok || !payload.weather) {
      throw new Error(payload?.error || `HTTP ${response.status}`);
    }

    latestWeatherState = {
      status: payload.stale ? "stale" : "success",
      data: payload,
    };
  } catch (error) {
    console.warn("Dashboard: weather fetch failed", error);
    latestWeatherState = latestWeatherState.data
      ? { status: "stale", data: latestWeatherState.data }
      : { status: "unavailable", data: null };
  }

  renderOutdoorWeather();
}

function startEnvironmentWidget() {
  if (environmentWidgetStarted) return;
  environmentWidgetStarted = true;

  updateDateTimeEnvironmentClock();
  renderRoomEnvironment();
  renderOutdoorWeather();
  fetchOutdoorWeather();

  environmentClockIntervalId = window.setInterval(
    updateDateTimeEnvironmentClock,
    1000,
  );
  weatherRefreshIntervalId = window.setInterval(() => {
    if (document.visibilityState !== "hidden") {
      fetchOutdoorWeather();
    }
  }, WEATHER_REFRESH_INTERVAL_MS);

  document.addEventListener("visibilitychange", () => {
    if (
      document.visibilityState === "visible" &&
      Date.now() - lastWeatherFetchAt > WEATHER_REFRESH_INTERVAL_MS
    ) {
      fetchOutdoorWeather();
    }
  });

  window.addEventListener("pagehide", () => {
    if (environmentClockIntervalId) {
      window.clearInterval(environmentClockIntervalId);
      environmentClockIntervalId = null;
    }
    if (weatherRefreshIntervalId) {
      window.clearInterval(weatherRefreshIntervalId);
      weatherRefreshIntervalId = null;
    }
  });
}

const statusTranslationKeys = {
  active: "active",
  cancelled: "cancelled",
  completed: "completed",
  confirmed: "confirmed",
  danger: "emergency",
  done: "done",
  failed: "failed",
  idle: "idle",
  listening: "listening",
  no_response: "noResponse",
  "no-response": "noResponse",
  offline: "offline",
  online: "online",
  partial: "partial",
  pending: "pending",
  processing: "processing",
  resolved: "resolved",
  safe: "safe",
  sent: "sent",
  skipped: "skipped",
  speaking: "speaking",
  suspected: "suspected",
  warning: "warning",
};

const demoMedicineNameKeys = {
  "Thuốc bổ tim": "heartMedicine",
  "Thuốc huyết áp": "bloodPressureMedicine",
};

const demoDeviceNameKeys = {
  ac01: "airConditioner",
  aircon: "airConditioner",
  fan: "bedroomFan",
  fan01: "bedroomFan",
  ir_hub_001: "irHub",
  light01: "livingRoomLight",
  light_001: "livingRoomLight",
};

const legacySystemMessageKeys = {
  "Camera phát hiện nguy cơ té ngã": "cameraFallDetected",
  "Chami đã hoàn tất kiểm tra": "chamiCheckCompleted",
  "Không có phản hồi sau thời gian chờ": "noResponseAfterWait",
  "Người dùng cần trợ giúp": "userNeedsHelp",
  "Đã gửi cảnh báo khẩn cấp cho người nhà": "emergencyAlertSent",
  "Người dùng xác nhận an toàn": "userConfirmedSafe",
  "Đã gửi lời nhắc uống thuốc": "reminderSent",
  "Đã uống thuốc": "medicineTaken",
  "Đã uống thuốc buổi sáng": "medicineTaken",
  "Người dùng đã xác nhận uống thuốc": "medicineTaken",
  "Không phản hồi": "noResponse",
  "Không có phản hồi sau 3 lần nhắc uống thuốc": "noResponseAfterThreeReminders",
  "Đã ăn sáng": "ateMeal",
  "Phát hiện ngã tại phòng khách": "fallDetectedLivingRoom",
  "Phát hiện ngã (demo)": "fallDetected",
  "Robot Chami mất kết nối": "robotDisconnected",
};

function translateStatus(status) {
  const normalized = String(status || "").toLowerCase();
  return uiText(statusTranslationKeys[normalized] || normalized || "unknown");
}

function getDisplayMedicineName(name) {
  if (!name) return uiText("genericMedicine");
  const key = demoMedicineNameKeys[name];
  return key ? uiText(key) : name;
}

function getDisplayDeviceName(device) {
  const id = getDeviceId(device);
  const key =
    demoDeviceNameKeys[id] ||
    (isLightDevice(device) ? "livingRoomLight" : null) ||
    (isAirconDevice(device) ? "airConditioner" : null);
  return key ? uiText(key) : device?.name || id || uiText("unknown");
}

function translateKnownSystemMessage(message) {
  if (!message) return "";
  const key = legacySystemMessageKeys[String(message).trim()];
  return key ? uiText(key) : message;
}

function getSystemMessageDisplay(record) {
  if (record?.messageKey) return uiText(record.messageKey);
  return translateKnownSystemMessage(record?.message);
}

const MEDICINE_REMINDER_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MEDICINE_CARE_TYPES = new Set([
  "medicine_reminder_sent",
  "medicine_taken",
  "medicine_no_response",
]);
let latestMedicineReminders = [];
let latestMedicineCareLogs = [];
let latestAlerts = [];
let latestCareLogs = [];
let latestCaregiverNotifications = [];
let latestFallAlerts = [];
let commandToastListenerPrimed = false;
let latestWeatherState = { status: "loading", data: null };
let environmentClockIntervalId = null;
let weatherRefreshIntervalId = null;
let lastWeatherFetchAt = 0;
let environmentWidgetStarted = false;
let editingMedicineReminderId = null;
const medicineReminderRequests = new Set();
const commandToastSeen = new Set();
const commandToastRecentFingerprints = new Map();
const activeCommandToasts = [];

function updateRobotSection(robot) {
  // Update overview cards
  document.getElementById("robot-status-text").textContent =
    robot?.status ? translateStatus(robot.status) : uiText("offline");
  document.getElementById("robot-battery-text").textContent =
    robot?.battery != null ? robot.battery + "%" : "—";

  // Update robot profile display
  const batteryDisplay = document.getElementById("robot-battery-display");
  const statusDisplay = document.getElementById("robot-status-display");
  if (batteryDisplay)
    batteryDisplay.textContent =
      robot?.battery != null ? robot.battery + "%" : "—%";
  if (statusDisplay) {
    statusDisplay.textContent = robot?.status
      ? translateStatus(robot.status)
      : uiText("offline");
  }
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
  return uiText("livingRoomLight");
}

function getLightStatusText(status) {
  return status === "on" ? uiText("lightOnStatus") : uiText("lightOffStatus");
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
    on: uiText("turnLightOn"),
    off: uiText("turnLightOff"),
    toggle: uiText("toggleLight"),
  };

  return textByAction[action] || uiText("toggleLight");
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

async function resolveBackendHealthConcern(healthConcernId) {
  if (!healthConcernId) {
    throw new Error("Missing health concern id");
  }

  const headers = {
    "Content-Type": "application/json",
  };
  const deviceToken = getBridgeDeviceToken();
  const baseUrl = getBridgeApiBaseUrl();
  const requestUrl = `${baseUrl}/api/chami/health-concerns/${encodeURIComponent(
    healthConcernId,
  )}/resolve`;

  if (deviceToken) {
    headers["x-device-token"] = deviceToken;
  }

  const response = await fetch(requestUrl, {
    method: "POST",
    headers,
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

  console.log("Dashboard: IR Hub command sent", {
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
      statusText: uiText("offline"),
      detailText: uiText("offline"),
      batteryText: "--",
      lastSeenText: uiText("noRecentUpdate"),
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
    ? [uiText("online"), translateStatus(state), emotion].filter(Boolean)
    : [
        isBridgeChamiDevice(robot) ? uiText("offline") : translateStatus(state || "offline"),
        uiText("disconnected"),
      ];

  return {
    online: isOnline,
    statusText: isOnline ? uiText("online") : uiText("offline"),
    detailText: detailParts.join(" / "),
    batteryText: robot.battery != null ? robot.battery + "%" : "--",
    lastSeenText: lastSeen ? formatDateTime(lastSeen) : uiText("noRecentUpdate"),
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
  latestAlerts = alerts || [];
  document.getElementById("alerts-count").textContent = latestAlerts.length || 0;
  renderAlerts(latestAlerts);
}

function updateCareLogsSection(logs) {
  latestCareLogs = logs || [];
  renderCareLogs(latestCareLogs);
}

function updateCaregiverNotificationsSection(records) {
  latestCaregiverNotifications = records || [];
  renderCaregiverNotifications(latestCaregiverNotifications);
}

function updateHealthConcernsSection(records) {
  latestHealthConcerns = records || [];
  renderHealthConcerns(records);
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
    const deviceName = getDisplayDeviceName(d);
    const deviceDetail = isLight
      ? d.status === "on"
        ? uiText("lightOnStatus")
        : uiText("lightOffStatus")
      : isAircon
        ? d.status === "on"
          ? uiText("airconOnStatus")
          : uiText("airconOffStatus")
      : d.room || "";
    const leftDiv = document.createElement("div");
    leftDiv.className = "left";
    leftDiv.innerHTML = `<strong>${deviceName}</strong><small>${deviceDetail}</small>`;

    const btn = document.createElement("button");
    btn.className = "device-toggle";
    btn.dataset.id = d.id || d.deviceId || "";
    btn.textContent = isLight
      ? d.status === "on"
        ? uiText("turnLightOff")
        : uiText("turnLightOn")
      : isAircon
        ? d.status === "on"
          ? uiText("turnAirconOff")
          : uiText("turnAirconOn")
        : d.status === "on"
          ? `${uiText("on")} · ${uiText("toggle")}`
          : uiText("toggle");
    btn.onclick = async () => {
      const id = btn.dataset.id;

      if (isLight) {
        const action = d.status === "on" ? "off" : "on";
        const payload = await createLightControlCommand(action);
        showCommandToast({
          ...payload,
          key: "room_light_power",
          type: "ir_send",
          status: "pending",
        });
        return;
      }

      await FirebaseService.createCommand({
        targetType: "device",
        targetId: id,
        command: "toggle",
        status: "pending",
        source: "web_dashboard",
      });
      showCommandToast({
        targetType: "device",
        targetId: id,
        command: "toggle",
        status: "pending",
        source: "web_dashboard",
      });
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
    const deviceName = getDisplayDeviceName(d);
    const deviceDetail = isLight
      ? getLightStatusText(d.status)
      : isAircon
        ? d.status === "on"
          ? uiText("airconOnStatus")
          : uiText("airconOffStatus")
        : d.room || "";
    const leftDiv = document.createElement("div");
    leftDiv.className = "left";
    leftDiv.innerHTML = `<strong>${deviceName}</strong><small>${deviceDetail}</small>`;

    const btn = document.createElement("button");
    btn.className = "device-toggle";
    btn.dataset.id = d.id || d.deviceId || "";
    btn.textContent = isLight
      ? uiText("toggleLight")
      : isAircon
        ? d.status === "on"
          ? uiText("turnAirconOff")
          : uiText("turnAirconOn")
        : d.status === "on"
          ? `${uiText("on")} · ${uiText("toggle")}`
          : uiText("toggle");
    btn.onclick = async () => {
      const id = btn.dataset.id;
      btn.disabled = true;

      try {
        if (isLight) {
          const payload = await createLightControlCommand();
          toggleLocalLightDisplayState();
          showCommandToast({
            ...payload,
            key: "room_light_power",
            type: "ir_send",
            status: "pending",
          });
          return;
        }

        if (isAircon) {
          const action = d.status === "on" ? "off" : "on";
          const payload = await createAirconControlCommand(action);
          showCommandToast({
            ...payload,
            key: action === "off" ? "ac_off" : "ac_cool_26",
            type: "ir_send",
            status: "pending",
          });
          return;
        }

        await FirebaseService.createCommand({
          targetType: "device",
          targetId: id,
          command: "toggle",
          status: "pending",
          source: "web_dashboard",
        });
        showCommandToast({
          targetType: "device",
          targetId: id,
          command: "toggle",
          status: "pending",
          source: "web_dashboard",
        });
      } catch (error) {
        console.error("Dashboard: command send failed", error);
        showCommandToast(
          {
            targetId: id,
            command: isLight ? "living_room_light" : isAircon ? "air_conditioner_on" : "toggle",
            status: "failed",
          },
          { status: "failed", dedupe: false },
        );
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
    fall_detected: uiText("fallDetected"),
    emergency_response: uiText("emergencyResponse"),
    robot_offline: uiText("robotDisconnected"),
    low_battery: uiText("lowBattery"),
    no_response: uiText("noResponse"),
    medicine_missed: uiText("medicineMissed"),
    medicine_taken: uiText("medicineTaken"),
    medicine_no_response: uiText("medicineNoResponse"),
    health_concern: uiText("healthHistory"),
    meal: uiText("ateMeal"),
    response: uiText("response"),
  };

  return labels[type] || type || uiText("alerts");
}

function getAlertSourceLabel(source) {
  const labels = {
    camera_ai: uiText("cameraAi"),
    fall_camera: uiText("fallCamera"),
    chami_001: uiText("chamiRobot"),
    robot_chami: uiText("chamiRobot"),
    health_module: uiText("healthModule"),
    smart_home: uiText("smartHome"),
    web_dashboard: uiText("webDashboard"),
    demo: uiText("demoMode"),
  };

  return labels[source] || uiText("unknownSource");
}

function getLineStatusLabel(status) {
  const labels = {
    pending: `LINE: ${uiText("pending")}`,
    sent: `LINE: ${uiText("sent")}`,
    failed: `LINE: ${uiText("failed")}`,
  };

  return labels[status] || `LINE: ${uiText("demoMode")}`;
}

function getAlertMessageDisplay(alert) {
  if (alert?.type === "health_concern") {
    return getHealthMessageDisplay(alert);
  }

  return getSystemMessageDisplay(alert);
}

function getCaregiverNotificationStatus(record) {
  const status = String(record?.status || "").toLowerCase();
  if (status === "sent") {
    return { label: `LINE ${uiText("sent")}`, badge: uiText("sent"), className: "is-sent" };
  }
  if (status === "partial") {
    return { label: uiText("partialSent"), badge: uiText("partial"), className: "is-partial" };
  }
  if (status === "failed") {
    return { label: uiText("sendFailed"), badge: uiText("failed"), className: "is-failed" };
  }
  if (status === "skipped") {
    return { label: uiText("duplicateSkipped"), badge: uiText("skipped"), className: "is-skipped" };
  }
  return { label: `LINE ${uiText("pending")}`, badge: uiText("pending"), className: "is-pending" };
}

function getCaregiverNotificationDetail(record) {
  const failed = String(record?.status || "").toLowerCase() === "failed";
  if (failed && record?.lastError) return record.lastError;

  if (
    record?.sourceEventType === "health_concern" ||
    record?.eventType === "health_concern"
  ) {
    const symptomMessage = getHealthMessageDisplay(record);
    if (symptomMessage) return symptomMessage;
  }

  return (
    translateKnownSystemMessage(record?.messagePreview) ||
    translateKnownSystemMessage(record?.lastError) ||
    record?.eventType ||
    uiText("caregiverNotifications")
  );
}

function renderCaregiverNotifications(records) {
  const el = document.getElementById("caregiver-notifications-list");
  if (!el) return;
  el.innerHTML = "";

  const sorted = sortByNewest(records || [], (record) =>
    getTimeValue(record.createdAt || record.sentAt || record.updatedAt),
  );
  const visible = sorted.slice(0, CAREGIVER_NOTIFICATION_DISPLAY_LIMIT);
  const hiddenCount = Math.max(sorted.length - visible.length, 0);

  if (visible.length === 0) {
    el.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "empty-state compact-empty";
    empty.textContent = uiText("noLineNotifications");
    el.appendChild(empty);
    return;
  }

  visible.forEach((record) => {
    const presentation = getCaregiverNotificationStatus(record);
    const item = document.createElement("div");
    item.className = `caregiver-notification-item ${presentation.className}`;

    const content = document.createElement("div");
    content.className = "caregiver-notification-content";

    const title = document.createElement("strong");
    title.textContent = presentation.label;

    const detail = document.createElement("small");
    const detailText = getCaregiverNotificationDetail(record);
    detail.textContent = `${detailText} • ${formatMedicineTime(
      record.sentAt || record.createdAt || record.updatedAt,
    )}`;

    const badge = document.createElement("span");
    badge.className = `caregiver-notification-badge ${presentation.className}`;
    badge.textContent = presentation.badge;

    content.append(title, detail);
    item.append(content, badge);
    el.appendChild(item);
  });

  appendCompactMore(el, hiddenCount, uiText("olderNotifications"));
}

function getHealthSymptomLabel(symptom) {
  const key = `health.symptom.${symptom}`;
  const label = uiText(key);
  return label === key ? uiText("healthSymptomFallback") : label;
}

function getHealthMessageDisplay(record) {
  const mapped = uiText(`health.message.${record?.symptom}`);
  if (mapped && mapped !== `health.message.${record?.symptom}`) return mapped;
  return getSystemMessageDisplay(record) || uiText("healthFallback");
}

function getHealthLevelPresentation(level) {
  if (level === "danger") {
    return { label: uiText("danger"), className: "is-danger" };
  }
  if (level === "warning") {
    return { label: uiText("warning"), className: "is-warning" };
  }
  return { label: uiText("info"), className: "is-info" };
}

function renderHealthConcerns(records) {
  const el = document.getElementById("health-conversation-list");
  if (!el) return;
  el.replaceChildren();

  const sorted = sortByNewest((records || []).slice(0, HEALTH_CONVERSATION_MAX_RECORDS), (record) =>
    getTimeValue(record.createdAtMs || record.createdAt || record.receivedAt),
  );
  const displayLimit = healthConversationExpanded
    ? HEALTH_CONVERSATION_MAX_RECORDS
    : HEALTH_CONVERSATION_COLLAPSED_LIMIT;
  const visible = sorted.slice(0, displayLimit);
  const hiddenCount = Math.max(sorted.length - visible.length, 0);

  if (visible.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = uiText("noHealthHistory");
    el.appendChild(empty);
    return;
  }

  visible.forEach((record) => {
    const presentation = getHealthLevelPresentation(record.level);
    const item = document.createElement("article");
    item.className = `health-concern-item ${presentation.className}`;

    const main = document.createElement("div");
    main.className = "health-concern-main";

    const heading = document.createElement("div");
    heading.className = "health-concern-heading";
    const icon = document.createElement("span");
    icon.className = `health-concern-dot ${presentation.className}`;
    icon.setAttribute("aria-hidden", "true");
    const title = document.createElement("strong");
    title.textContent = getHealthSymptomLabel(record.symptom);
    const badge = document.createElement("span");
    badge.className = `health-level-badge ${presentation.className}`;
    badge.textContent = presentation.label;
    heading.append(icon, title, badge);

    const message = document.createElement("p");
    message.className = "health-concern-message";
    message.textContent = getHealthMessageDisplay(record);

    const footer = document.createElement("div");
    footer.className = "health-concern-footer";
    const meta = document.createElement("div");
    meta.className = "health-concern-meta";
    [
      formatDateTime(record.createdAtMs || record.createdAt || record.receivedAt),
      record.language || "unknown",
      record.deviceId || record.source || "chami_001",
    ].forEach((value) => {
      const span = document.createElement("span");
      span.textContent = value;
      meta.appendChild(span);
    });

    const status = document.createElement("span");
    status.className = record.resolved
      ? "health-status-badge is-resolved"
      : `health-status-badge ${record.level === "danger" ? "is-open-danger" : "is-open"}`;
    status.textContent = record.resolved ? uiText("resolved") : uiText("unresolved");
    footer.append(meta, status);

    main.append(heading, message, footer);
    item.appendChild(main);

    if (!record.resolved) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "health-resolve-button";
      button.textContent = uiText("resolved");
      button.addEventListener("click", async () => {
        try {
          button.disabled = true;
          button.textContent = uiText("saving");
          try {
            await resolveBackendHealthConcern(record.id);
          } catch (backendError) {
            console.warn("Dashboard: backend health resolve failed", backendError);
            await FirebaseService.resolveHealthConcern(record.id);
          }
          status.className = "health-status-badge is-resolved";
          status.textContent = uiText("resolved");
          button.remove();
        } catch (error) {
          console.error("Dashboard: health concern resolve failed", error);
          button.disabled = false;
          button.textContent = uiText("resolved");
        }
      });
      item.appendChild(button);
    }

    el.appendChild(item);
  });

  if (sorted.length > HEALTH_CONVERSATION_COLLAPSED_LIMIT) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "health-history-toggle";
    toggle.textContent = healthConversationExpanded
      ? uiText("collapse")
      : `${uiText("showAll")} (${Math.min(sorted.length, HEALTH_CONVERSATION_MAX_RECORDS)})`;
    toggle.addEventListener("click", () => {
      healthConversationExpanded = !healthConversationExpanded;
      renderHealthConcerns(sorted);
    });
    el.appendChild(toggle);
  } else {
    appendCompactMore(el, hiddenCount, uiText("oldHistory"));
  }
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

function formatMedicineTime(value) {
  const timestamp = getTimeValue(value);
  if (!timestamp) return "--:--";
  return new Date(timestamp).toLocaleTimeString(
    getUiLanguage() === "vi" ? "vi-VN" : "ja-JP",
    {
      timeZone: TOKYO_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
    },
  );
}

function isValidMedicineCareLog(log) {
  if (!log || !MEDICINE_CARE_TYPES.has(log.type)) return false;
  const timestamp = getTimeValue(
    log.createdAt || log.receivedAt || log.updatedAt,
  );
  if (!timestamp) {
    console.warn("Dashboard: invalid medicine care log skipped");
    return false;
  }
  if (
    log.type === "medicine_taken" &&
    (!Number.isInteger(log.attempt) || log.attempt < 1 || log.attempt > 3)
  ) {
    console.warn("Dashboard: invalid medicine care log skipped");
    return false;
  }
  return true;
}

function getMedicineCarePresentation(log) {
  const linkedReminder = log.reminderId
    ? latestMedicineReminders.find(
        (reminder) => reminder.id === log.reminderId,
      )
    : latestMedicineReminders.length === 1
      ? latestMedicineReminders[0]
      : null;
  const medicineName = getDisplayMedicineName(
    log.medicineName || linkedReminder?.medicineName,
  );
  const time = formatMedicineTime(log.createdAt || log.receivedAt);
  const demoLabel = log.source === "demo" ? uiText("demoMode") : "";

  if (log.type === "medicine_taken") {
    return {
      title: uiText("medicineTaken"),
      detail: `${medicineName} • ${uiText("confirmed")} ${uiText("attempt")} ${log.attempt} • ${time}`,
      badge: uiText("confirmed"),
      status: "confirmed",
      cardText: `${uiText("takenAt")} ${time}`,
      cardDetail: `${uiText("confirmed")} ${uiText("attempt")} ${log.attempt}`,
      demoLabel,
    };
  }
  if (log.type === "medicine_no_response") {
    const attempts = Number.isInteger(log.attempts) ? log.attempts : 3;
    const title =
      attempts === 3
        ? uiText("noResponseAfterThreeReminders")
        : `${uiText("noResponse")} ${attempts} ${uiText("afterAttempts")}`;
    return {
      title,
      detail: `${medicineName} • ${time}`,
      badge: uiText("noResponse"),
      status: "no-response",
      cardText: `${uiText("noResponseAt")} ${time}`,
      cardDetail: `${attempts} ${uiText("afterAttempts")}`,
      demoLabel,
    };
  }
  return {
    title: uiText("reminderSent"),
    detail: `${medicineName} • ${time}`,
    badge: uiText("sent"),
    status: "sent",
    cardText: `${uiText("sentAt")} ${time}`,
    cardDetail: "",
    demoLabel,
  };
}

function renderLatestMedicineFollowup() {
  const latest = latestMedicineCareLogs[0];
  if (!latest) return;
  const presentation = getMedicineCarePresentation(latest);
  const lastTriggered = document.getElementById("medicine-last-triggered");
  const detail = document.getElementById("medicine-last-triggered-detail");
  if (lastTriggered) lastTriggered.textContent = presentation.cardText;
  if (detail) detail.textContent = presentation.cardDetail;
  console.log(`Dashboard: medicine follow-up rendered type=${latest.type}`);
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
  if (!value) return uiText("unknownTime");

  const locale = getUiLanguage() === "vi" ? "vi-VN" : "ja-JP";
  const options = { timeZone: TOKYO_TIMEZONE };

  if (typeof value.toDate === "function") {
    return value.toDate().toLocaleString(locale, options);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return uiText("unknownTime");
  }

  return date.toLocaleString(locale, options);
}

function getMedicineReminderEls() {
  return {
    list: document.getElementById("medicine-reminder-list"),
    addButton: document.getElementById("medicine-reminder-add"),
    dialog: document.getElementById("medicine-reminder-dialog"),
    dialogTitle: document.getElementById("medicine-reminder-dialog-title"),
    form: document.getElementById("medicine-reminder-form"),
    closeButton: document.getElementById("medicine-reminder-dialog-close"),
    cancelButton: document.getElementById("medicine-reminder-cancel"),
    nameInput: document.getElementById("medicine-name-input"),
    timeInput: document.getElementById("medicine-time-input"),
    enabledInput: document.getElementById("medicine-enabled-input"),
    saveButton: document.getElementById("medicine-reminder-save"),
    status: document.getElementById("medicine-reminder-status"),
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
    throw new Error(uiText("medicineNameRequired"));
  }

  if (!MEDICINE_REMINDER_TIME_RE.test(time)) {
    throw new Error(uiText("medicineTimeInvalid"));
  }

  return {
    ...DEFAULT_MEDICINE_REMINDER,
    medicineName,
    time,
    enabled: Boolean(enabledInput?.checked),
  };
}

function createMedicineActionButton(action, reminderId, label, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.medicineAction = action;
  button.dataset.reminderId = reminderId;
  button.textContent = label;
  if (className) button.className = className;
  return button;
}

function renderMedicineReminders(reminders) {
  const { list } = getMedicineReminderEls();
  if (!list) return;

  latestMedicineReminders = Array.isArray(reminders) ? reminders : [];
  list.replaceChildren();

  if (!latestMedicineReminders.length) {
    const empty = document.createElement("p");
    empty.className = "medicine-reminder-empty";
    empty.textContent = uiText("noMedicineReminders");
    list.appendChild(empty);
    renderLatestMedicineFollowup();
    return;
  }

  latestMedicineReminders.forEach((reminder) => {
    const row = document.createElement("article");
    row.className = "medicine-reminder-row medicine-alarm-item";
    if (reminder.enabled === false) row.classList.add("is-disabled");
    row.dataset.reminderId = reminder.id;

    const top = document.createElement("div");
    top.className = "medicine-alarm-top";
    const time = document.createElement("time");
    time.className = "medicine-alarm-time";
    time.dateTime = reminder.time || "";
    time.textContent = reminder.time || "--:--";

    const toggle = document.createElement("label");
    toggle.className = "medicine-list-toggle medicine-alarm-toggle";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = reminder.enabled !== false;
    checkbox.dataset.medicineAction = "toggle";
    checkbox.dataset.reminderId = reminder.id;
    checkbox.setAttribute(
      "aria-label",
      `${checkbox.checked ? uiText("off") : uiText("on")} ${getDisplayMedicineName(reminder.medicineName)}`,
    );
    const toggleText = document.createElement("span");
    toggleText.textContent = checkbox.checked ? uiText("on") : uiText("off");
    toggle.append(checkbox, toggleText);
    top.append(time, toggle);

    const name = document.createElement("div");
    name.className = "medicine-alarm-name";
    name.textContent = getDisplayMedicineName(reminder.medicineName);

    const meta = document.createElement("div");
    meta.className = "medicine-alarm-meta";
    const repeat = document.createElement("span");
    repeat.textContent = uiText("everyDay");
    const timezone = document.createElement("span");
    timezone.textContent = reminder.timezone || TOKYO_TIMEZONE;
    meta.append(repeat, timezone);

    const actions = document.createElement("div");
    actions.className = "medicine-reminder-actions medicine-alarm-actions";
    actions.append(
      createMedicineActionButton("edit", reminder.id, uiText("edit")),
      createMedicineActionButton(
        "delete",
        reminder.id,
        uiText("delete"),
        "medicine-delete-button",
      ),
      createMedicineActionButton(
        "now",
        reminder.id,
        uiText("remindNow"),
        "primary",
      ),
    );

    if (reminder.lastTriggeredAt) {
      const lastTriggered = document.createElement("small");
      lastTriggered.className = "medicine-reminder-last-triggered";
      lastTriggered.textContent = `${uiText("lastRun")}: ${formatDateTime(
        reminder.lastTriggeredAt,
      )}`;
      meta.appendChild(lastTriggered);
    }

    row.append(top, name, meta, actions);
    list.appendChild(row);
  });

  renderLatestMedicineFollowup();
}

function openMedicineReminderDialog(reminder = null) {
  const {
    dialog,
    dialogTitle,
    nameInput,
    timeInput,
    enabledInput,
  } = getMedicineReminderEls();
  if (!dialog) return;

  editingMedicineReminderId = reminder?.id || null;
  if (dialogTitle) {
    dialogTitle.textContent = reminder
      ? uiText("editMedicineReminder")
      : uiText("addMedicineReminder");
  }
  if (nameInput) nameInput.value = reminder?.medicineName || "";
  if (timeInput) {
    timeInput.value = reminder?.time || DEFAULT_MEDICINE_REMINDER.time;
  }
  if (enabledInput) enabledInput.checked = reminder?.enabled !== false;

  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
  nameInput?.focus();
}

function closeMedicineReminderDialog() {
  const { dialog } = getMedicineReminderEls();
  editingMedicineReminderId = null;
  if (dialog?.open && typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog?.removeAttribute("open");
  }
}

async function saveMedicineReminderFromDashboard(event) {
  event.preventDefault();
  const { saveButton } = getMedicineReminderEls();

  try {
    if (saveButton) saveButton.disabled = true;
    const payload = getMedicineReminderFormData();
    if (editingMedicineReminderId) {
      const reminderId = editingMedicineReminderId;
      await FirebaseService.updateMedicineReminder(reminderId, payload);
      console.log(`Dashboard: medicine reminder updated id=${reminderId}`);
      setMedicineReminderStatus(uiText("medicineReminderUpdated"));
    } else {
      const created = await FirebaseService.createMedicineReminder(payload);
      console.log(`Dashboard: medicine reminder created id=${created.id}`);
      setMedicineReminderStatus(uiText("medicineReminderAdded"));
    }
    closeMedicineReminderDialog();
  } catch (error) {
    console.error("Dashboard: medicine reminder save failed", error);
    setMedicineReminderStatus(error.message || uiText("medicineReminderSaveFailed"));
  } finally {
    if (saveButton) saveButton.disabled = false;
  }
}

async function updateMedicineReminderEnabled(reminderId, enabled, checkbox) {
  try {
    checkbox.disabled = true;
    await FirebaseService.setMedicineReminderEnabled(reminderId, enabled);
    console.log(
      `Dashboard: medicine reminder toggled id=${reminderId} enabled=${enabled}`,
    );
    setMedicineReminderStatus(
      enabled ? uiText("medicineReminderEnabled") : uiText("medicineReminderDisabled"),
    );
  } catch (error) {
    checkbox.checked = !enabled;
    console.error("Dashboard: medicine reminder toggle failed", error);
    setMedicineReminderStatus(uiText("medicineReminderToggleFailed"));
  } finally {
    checkbox.disabled = false;
  }
}

async function removeMedicineReminder(reminderId) {
  const reminder = latestMedicineReminders.find(
    (item) => item.id === reminderId,
  );
  if (!reminder) return;
  if (!window.confirm(`${uiText("delete")} “${reminder.medicineName}” ${reminder.time}?`)) {
    return;
  }

  try {
    await FirebaseService.deleteMedicineReminder(reminderId);
    console.log(`Dashboard: medicine reminder deleted id=${reminderId}`);
    setMedicineReminderStatus(uiText("medicineReminderDeleted"));
  } catch (error) {
    console.error("Dashboard: medicine reminder delete failed", error);
    setMedicineReminderStatus(uiText("medicineReminderDeleteFailed"));
  }
}

async function createMedicineReminderNowCommand(reminderId, button) {
  if (medicineReminderRequests.has(reminderId)) return;
  const reminder = latestMedicineReminders.find(
    (item) => item.id === reminderId,
  );
  if (!reminder) return;
  medicineReminderRequests.add(reminderId);

  try {
    button.disabled = true;
    const result =
      await FirebaseService.createMedicineReminderCommand(reminder);

    if (result?.skipped) {
      setMedicineReminderStatus(
        result.reason === "pending_same_reminder"
          ? uiText("pendingSameReminder")
          : uiText("robotBusyReminder"),
      );
      return;
    }

    console.log(
      `Dashboard: immediate reminder command created reminderId=${reminderId}`,
    );
    showCommandToast({
      ...(result?.command || {}),
      action: "remind_medicine",
      type: "robot_action",
      reminderId,
      medicineName: reminder.medicineName,
      status: "pending",
    });
    setMedicineReminderStatus(uiText("medicineReminderImmediateCreated"));
  } catch (error) {
    console.error("Dashboard: immediate medicine reminder failed", error);
    showCommandToast(
      {
        action: "remind_medicine",
        type: "robot_action",
        reminderId,
        medicineName: reminder.medicineName,
        status: "failed",
      },
      { status: "failed", dedupe: false },
    );
    setMedicineReminderStatus(uiText("medicineReminderImmediateFailed"));
  } finally {
    medicineReminderRequests.delete(reminderId);
    button.disabled = false;
  }
}

function bindMedicineReminderDashboard() {
  const {
    list,
    addButton,
    dialog,
    form,
    closeButton,
    cancelButton,
  } = getMedicineReminderEls();

  renderMedicineReminders([]);
  addButton?.addEventListener("click", () => openMedicineReminderDialog());
  closeButton?.addEventListener("click", closeMedicineReminderDialog);
  cancelButton?.addEventListener("click", closeMedicineReminderDialog);
  form?.addEventListener("submit", saveMedicineReminderFromDashboard);
  dialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeMedicineReminderDialog();
  });

  list?.addEventListener("change", (event) => {
    const checkbox = event.target.closest(
      'input[data-medicine-action="toggle"]',
    );
    if (!checkbox) return;
    updateMedicineReminderEnabled(
      checkbox.dataset.reminderId,
      checkbox.checked,
      checkbox,
    );
  });

  list?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-medicine-action]");
    if (!button) return;
    const reminderId = button.dataset.reminderId;
    const reminder = latestMedicineReminders.find(
      (item) => item.id === reminderId,
    );

    if (button.dataset.medicineAction === "edit" && reminder) {
      openMedicineReminderDialog(reminder);
    } else if (button.dataset.medicineAction === "delete") {
      removeMedicineReminder(reminderId);
    } else if (button.dataset.medicineAction === "now") {
      createMedicineReminderNowCommand(reminderId, button);
    }
  });

  if (typeof FirebaseService.listenMedicineReminders === "function") {
    FirebaseService.listenMedicineReminders((reminders) => {
      renderMedicineReminders(reminders);
      console.log(
        `Dashboard: medicine reminders loaded count=${reminders.length}`,
      );
      if (!reminders.length) {
        setMedicineReminderStatus(uiText("noMedicineReminders"));
      }
    });
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
  if (!timestamp) return uiText("pending");

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
    return uiText("cameraFallDetected");
  }

  if (event?.type === "chami_command_sent") {
    return uiText("chamiCheckRequested");
  }

  if (event?.type === "chami_alert_received") {
    if (event.status === "no_response") {
      return uiText("noResponseAfterWait");
    }

    if (event.status === "danger") {
      return uiText("emergencyAlertSent");
    }

    if (event.status === "safe") {
      return uiText("userConfirmedSafe");
    }
  }

  return event?.message || uiText("careEvent");
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
    detail: translateKnownSystemMessage(event.detail || event.message || ""),
  }));

  if (!hasFinalResult && steps.length < 5) {
    steps.push({
      id: "waiting_for_chami_result",
      title: uiText("waitingForChamiResult"),
      status: "active",
      time: null,
      detail: uiText("noFinalFallEvent"),
    });
  }

  let summary = uiText("processing");
  let summaryStatus = "active";
  if (latestResult?.status === "safe") {
    summary = uiText("safe");
    summaryStatus = "safe";
  } else if (latestResult?.status === "no_response") {
    summary = uiText("noResponse");
    summaryStatus = "danger";
  } else if (latestResult?.status === "danger") {
    summary = uiText("emergency");
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
  const detail = uiText("cameraEventMissing");
  const resultTitle = noResponse
    ? uiText("noResponseAfterWait")
    : uiText("userNeedsHelp");
  const relatedAlertId =
    alert.id || `chami_${getTimelineTimestamp(alert) || Date.now()}`;

  return {
    flowKey: `alert-fallback:${relatedAlertId}`,
    outcome: noResponse ? "no_response" : "danger",
    summary: noResponse ? uiText("noResponse") : uiText("emergency"),
    summaryStatus: "danger",
    steps: [
      {
        id: `${relatedAlertId}_checking`,
        title: uiText("chamiCheckCompleted"),
        status: "done",
        time: alertTime,
        detail,
      },
      {
        id: `${relatedAlertId}_result`,
        title: resultTitle,
        status: "danger",
        time: alertTime,
        detail: translateKnownSystemMessage(alert.message) || detail,
      },
      {
        id: `${relatedAlertId}_family_alert`,
        title: uiText("emergencyAlertSent"),
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
          message: noResponse ? uiText("noResponseAfterWait") : uiText("userNeedsHelp"),
          detail: translateKnownSystemMessage(alert.message),
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
    empty.textContent = uiText("noFallTimeline");
    timeline.appendChild(empty);
    timeline.removeAttribute("role");
    summary.className = "fall-response-summary is-empty";
    summary.textContent = uiText("noData");
    note.textContent = uiText("fallResponseNote");
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
    note.textContent = uiText("fallbackTimelineNote");
  } else if (model.outcome === "safe") {
    note.textContent = uiText("safeResultConfirmed");
  } else if (["danger", "no_response"].includes(model.outcome)) {
    note.textContent = uiText("emergencyResultMapped");
  } else {
    note.textContent = uiText("noFallInference");
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

  badge.textContent = translateStatus(status);
  badge.classList.toggle("status-online", status === "online");
  badge.classList.toggle("status-offline", status !== "online");

  details.innerHTML = "";

  [
    [uiText("name"), data.name || uiText("unknownCamera")],
    [uiText("location"), data.location || uiText("unknown")],
    [uiText("deviceType"), data.deviceType || uiText("unknown")],
    [uiText("aiModel"), data.aiModel || uiText("unknown")],
    [uiText("lastSeen"), formatDateTime(data.lastSeen || data.updatedAt)],
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
  status.textContent = translateStatus(alert.status || "unknown");

  const headerActions = document.createElement("div");
  headerActions.className = "fall-alert-actions";

  headerActions.appendChild(status);

  if (options.canResolve && canResolveFallAlert(alert.status)) {
    const notifyButton = document.createElement("button");
    notifyButton.className = "fall-alert-notify";
    notifyButton.type = "button";
    notifyButton.textContent = uiText("notifyChami");
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
    resolveButton.textContent = uiText("markResolved");
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
    [uiText("confidence"), formatConfidence(alert.confidence)],
    [uiText("camera"), alert.cameraId || uiText("unknown")],
    [uiText("created"), formatDateTime(alert.createdAt)],
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
  latestFallAlerts = data;
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

  renderFallAlertList(activeList, activeAlerts, uiText("noActiveFallAlerts"), {
    canResolve: true,
  });
  renderFallAlertList(
    resolvedList,
    resolvedAlerts,
    uiText("noResolvedFallAlerts"),
  );
  appendCompactMore(resolvedList, hiddenResolvedCount, uiText("olderItems"));
}

function setupResolvedFallHistoryToggle() {
  const details = document.querySelector(".fall-alert-history");
  const summary = details?.querySelector("summary");

  if (!details || !summary) return;

  const updateSummary = () => {
    summary.textContent = `${details.open ? "▼" : "▶"} ${uiText("resolvedFallHistory")}`;
  };

  updateSummary();
  if (details.dataset.i18nToggleBound !== "true") {
    details.dataset.i18nToggleBound = "true";
    details.addEventListener("toggle", updateSummary);
  }
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
    message: uiText("fallCheckCommandMessage"),
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
    const empty = document.createElement("div");
    empty.className = "empty-state compact-empty";
    empty.textContent = uiText("noAlerts");
    el.appendChild(empty);
    return;
  }

  alerts.slice(0, 8).forEach((a) => {
    const row = document.createElement("div");
    row.className = `alert-item alert-${a.level || "warning"}`;

    row.innerHTML = `
      <div class="left">
        <strong>${getAlertTypeLabel(a.type)}</strong>
        <small>${getAlertMessageDisplay(a)}</small>

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
    const empty = document.createElement("div");
    empty.className = "empty-state compact-empty";
    empty.textContent = uiText("noAlerts");
    el.appendChild(empty);
    return;
  }

  const isNewAlert = (alert) =>
    alert?.status === "new" || MEDICINE_CARE_TYPES.has(alert?.type);
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
    const medicationClass =
      a.type === "medicine_taken"
        ? "alert-success"
        : a.type === "medicine_no_response"
          ? "alert-warning"
          : `alert-${a.level || "warning"}`;
    row.className = `alert-item ${medicationClass}`;

    const medicineDetail =
      a.type === "medicine_taken"
        ? [
            getDisplayMedicineName(a.medicineName),
            a.attempt ? `${uiText("attempt")} ${a.attempt}` : "",
          ]
            .filter(Boolean)
            .join(" • ")
        : a.type === "medicine_no_response"
          ? [
              getDisplayMedicineName(a.medicineName),
              a.attempts ? `${a.attempts} ${uiText("afterAttempts")}` : "",
            ]
              .filter(Boolean)
              .join(" • ")
          : "";

    const meta = [
      formatDateTime(a.createdAt),
      getAlertSourceLabel(a.source),
      medicineDetail,
      a.lineStatus ? getLineStatusLabel(a.lineStatus) : "",
    ].filter(Boolean);

    row.innerHTML = `
      <div class="left">
        <strong>${getAlertTypeLabel(a.type)}</strong>
        <small>${getAlertMessageDisplay(a)}</small>

        <div class="alert-meta">
          ${meta.map((item) => `<span>${item}</span>`).join("<span>/</span>")}
        </div>
      </div>
    `;

    el.appendChild(row);
  });

  appendCompactMore(el, hiddenCount, uiText("otherAlerts"));
};

function renderCareLogs(logs) {
  const el = document.getElementById("care-logs");
  el.innerHTML = "";
  const validLogs = sortByNewest(
    (logs || []).filter(
      (log) =>
        !isLegacyDemoMedicineLog(log) &&
        (!MEDICINE_CARE_TYPES.has(log?.type) || isValidMedicineCareLog(log)),
    ),
    (log) => getTimeValue(log.createdAt),
  );
  const visibleLogs = validLogs.slice(0, CARE_LOG_DISPLAY_LIMIT);
  const hiddenCount = Math.max(validLogs.length - visibleLogs.length, 0);

  if (visibleLogs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state compact-empty";
    empty.textContent = uiText("noRecentActivity");
    el.appendChild(empty);
    return;
  }

  visibleLogs.forEach((l) => {
    const item = document.createElement("div");
    item.className = "care-item";
    const isMedicine = MEDICINE_CARE_TYPES.has(l.type);
    const presentation = isMedicine ? getMedicineCarePresentation(l) : null;
    if (isMedicine) item.classList.add(`medicine-${presentation.status}`);

    const dot = document.createElement("div");
    dot.className = "timeline-dot";
    const content = document.createElement("div");
    content.className = "timeline-content";
    const heading = document.createElement("div");
    heading.className = "care-item-heading";
    const title = document.createElement("strong");
    title.textContent = presentation?.title || getAlertTypeLabel(l.type);
    heading.appendChild(title);

    if (presentation) {
      const badge = document.createElement("span");
      badge.className = `medicine-status-badge is-${presentation.status}`;
      badge.textContent = presentation.badge;
      heading.appendChild(badge);
      if (presentation.demoLabel) {
        const demo = document.createElement("span");
        demo.className = "medicine-demo-label";
        demo.textContent = presentation.demoLabel;
        heading.appendChild(demo);
      }
    }

    const detail = document.createElement("small");
    detail.className = "timeline-time";
    detail.textContent =
      presentation?.detail ||
      getSystemMessageDisplay(l) ||
      (l.status ? translateStatus(l.status) : "") ||
      "";
    content.append(heading, detail);
    item.append(dot, content);
    el.appendChild(item);
  });

  appendCompactMore(el, hiddenCount, uiText("olderActivities"));
}

// Command toast notifications
function getCommandTitle(command) {
  return command?.command || command?.type || command?.action || "unknown";
}

function normalizeCommandStatus(status) {
  const normalized = String(status || "pending").toLowerCase();
  if (normalized === "done") return "completed";
  if (
    ["pending", "processing", "completed", "failed", "cancelled", "warning"].includes(
      normalized,
    )
  ) {
    return normalized;
  }

  return "pending";
}

function getCommandToastTitleKey(status) {
  const keys = {
    pending: "commandSent",
    processing: "commandProcessing",
    completed: "commandCompleted",
    failed: "commandFailed",
    cancelled: "commandCancelled",
    warning: "commandSent",
  };

  return keys[normalizeCommandStatus(status)] || "commandSent";
}

function getCommandToastIcon(status) {
  const icons = {
    pending: "↗",
    processing: "…",
    completed: "✓",
    failed: "!",
    cancelled: "×",
    warning: "!",
  };

  return icons[normalizeCommandStatus(status)] || "↗";
}

function sanitizeCommandText(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getCommandToastDescription(command = {}) {
  const key = command.key || command.commandKey || "";
  const type = command.type || command.command || "";
  const action = command.action || "";
  const target = command.target || command.targetId || command.device || "";

  if (
    key === "room_light_power" ||
    command.command === "living_room_light" ||
    target === LIGHT_DEVICE_ID ||
    target === LEGACY_LIGHT_DEVICE_ID ||
    target === "living_room_light"
  ) {
    return uiText("commandDescriptionLightToggle");
  }

  if (key === "ac_cool_26" || command.command === "air_conditioner_on") {
    return uiText("commandDescriptionAirconOn");
  }

  if (key === "ac_off" || command.command === "air_conditioner_off") {
    return uiText("commandDescriptionAirconOff");
  }

  if (command.command === "fan_toggle" || target === "fan01" || target === "fan") {
    return uiText("commandDescriptionFanToggle");
  }

  if (action === "remind_medicine" || type === "remind_medicine") {
    const medicineName = getDisplayMedicineName(command.medicineName);
    return medicineName
      ? `${uiText("medicineReminder")} · ${medicineName}`
      : uiText("medicineReminder");
  }

  const fallback = sanitizeCommandText(
    command.label || type || action || command.command || target,
  );
  return fallback || uiText("commandDescriptionFallback");
}

function getCommandToastId(command = {}) {
  return (
    command.id ||
    command.commandId ||
    command.localToastId ||
    command.createdAt ||
    command.updatedAt ||
    `${getCommandTitle(command)}:${command.targetId || command.target || ""}`
  );
}

function getCommandToastFingerprint(command, status) {
  return `${status}:${getCommandToastDescription(command)}`;
}

function rememberCommandToastFingerprint(fingerprint) {
  const now = Date.now();
  commandToastRecentFingerprints.set(fingerprint, now);
  for (const [key, timestamp] of commandToastRecentFingerprints.entries()) {
    if (now - timestamp > 8000) {
      commandToastRecentFingerprints.delete(key);
    }
  }
}

function removeCommandToast(toastId) {
  const index = activeCommandToasts.findIndex((item) => item.toastId === toastId);
  if (index === -1) return;

  const [toast] = activeCommandToasts.splice(index, 1);
  window.clearTimeout(toast.timeoutId);
  toast.node.remove();
}

function renderCommandToastNode(toast) {
  const status = normalizeCommandStatus(toast.status);
  toast.node.className = `toast-card is-${status}`;
  toast.node.style.setProperty("--toast-duration", `${toast.durationMs}ms`);
  toast.node.setAttribute("role", status === "failed" ? "alert" : "status");

  const title = uiText(getCommandToastTitleKey(status));
  const description = getCommandToastDescription(toast.command);
  const badge = translateStatus(status);

  const icon = document.createElement("span");
  icon.className = "toast-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = getCommandToastIcon(status);

  const content = document.createElement("div");
  content.className = "toast-content";
  const titleEl = document.createElement("strong");
  titleEl.className = "toast-title";
  titleEl.textContent = title;
  const descriptionEl = document.createElement("span");
  descriptionEl.className = "toast-description";
  descriptionEl.textContent = description;
  content.append(titleEl, descriptionEl);

  const badgeEl = document.createElement("span");
  badgeEl.className = "toast-badge";
  badgeEl.textContent = badge;

  const close = document.createElement("button");
  close.className = "toast-close";
  close.type = "button";
  close.setAttribute("aria-label", uiText("closeNotification"));
  close.textContent = "×";
  close.addEventListener("click", () => removeCommandToast(toast.toastId));

  const progress = document.createElement("span");
  progress.className = "toast-progress";
  progress.setAttribute("aria-hidden", "true");

  toast.node.replaceChildren(icon, content, badgeEl, close, progress);
}

function showCommandToast(command = {}, options = {}) {
  const toastCommand =
    command.id || command.commandId || command.createdAt || command.updatedAt
      ? command
      : { ...command, localToastId: `local:${Date.now()}:${Math.random()}` };
  const status = normalizeCommandStatus(options.status || toastCommand.status);
  const commandId = getCommandToastId(toastCommand);
  const seenKey = `${commandId}:${status}`;
  const fingerprint = getCommandToastFingerprint(toastCommand, status);
  const shouldDedupe = options.dedupe !== false;

  if (shouldDedupe && commandToastSeen.has(seenKey)) return;
  if (
    shouldDedupe &&
    commandToastRecentFingerprints.has(fingerprint) &&
    !options.force
  ) {
    commandToastSeen.add(seenKey);
    return;
  }

  commandToastSeen.add(seenKey);
  rememberCommandToastFingerprint(fingerprint);

  const container = document.getElementById("toast-container");
  if (!container) return;

  while (activeCommandToasts.length >= COMMAND_TOAST_MAX_VISIBLE) {
    removeCommandToast(activeCommandToasts[0].toastId);
  }

  const durationMs =
    options.durationMs ||
    COMMAND_TOAST_DURATIONS_MS[status] ||
    COMMAND_TOAST_DEFAULT_DURATION_MS;
  const node = document.createElement("article");
  const toast = {
    toastId: `${seenKey}:${Date.now()}`,
    command: toastCommand,
    status,
    durationMs,
    node,
    timeoutId: 0,
  };

  renderCommandToastNode(toast);
  container.prepend(node);
  toast.timeoutId = window.setTimeout(
    () => removeCommandToast(toast.toastId),
    durationMs,
  );
  activeCommandToasts.push(toast);
}

function handleCommandToastSnapshot(commands) {
  const statusesToShow = new Set([
    "pending",
    "processing",
    "completed",
    "failed",
    "cancelled",
    "warning",
  ]);
  const data = sortByNewest(commands || [], (command) =>
    getTimeValue(command.updatedAt || command.createdAt),
  );

  if (!commandToastListenerPrimed) {
    data.forEach((command) => {
      const status = normalizeCommandStatus(command.status);
      commandToastSeen.add(`${getCommandToastId(command)}:${status}`);
    });
    commandToastListenerPrimed = true;
    return;
  }

  data
    .slice()
    .reverse()
    .forEach((command) => {
      const status = normalizeCommandStatus(command.status);
      if (statusesToShow.has(status)) {
        showCommandToast(command, { status });
      }
    });
}

function rerenderCommandToasts() {
  activeCommandToasts.forEach(renderCommandToastNode);
}

async function createDemoMedicineEvent(type) {
  const linkedReminder =
    latestMedicineReminders.length === 1 ? latestMedicineReminders[0] : null;
  const medicineName = linkedReminder?.medicineName || "";
  const createdAt = new Date().toISOString();
  const confirmed = type === "medicine_taken";
  const event = {
    type,
    category: "medicine",
    source: "demo",
    status: confirmed ? "confirmed" : "no_response",
    level: confirmed ? "info" : "warning",
    attempt: confirmed ? 2 : undefined,
    attempts: confirmed ? null : 3,
    medicineName,
    ...(linkedReminder?.id ? { reminderId: linkedReminder.id } : {}),
    messageKey: confirmed ? "medicineTaken" : "noResponseAfterThreeReminders",
    message: confirmed
      ? uiText("medicineTaken")
      : uiText("noResponseAfterThreeReminders"),
    createdAt,
  };

  await FirebaseService.createCareLog(event);
  await FirebaseService.createAlert(event);
  console.log(`Dashboard: demo medicine event created type=${type}`);
}

// bind buttons (demo actions)
document.getElementById("btn-medicine-done").onclick = async () => {
  await createDemoMedicineEvent("medicine_taken");
};
document.getElementById("btn-medicine-missed").onclick = async () => {
  await createDemoMedicineEvent("medicine_no_response");
};
document.getElementById("btn-ate").onclick = async () => {
  await FirebaseService.createCareLog({
    userId: "user01",
    type: "meal",
    status: "done",
    messageKey: "ateMeal",
    message: uiText("ateMeal"),
    source: "web_dashboard",
  });
};
document.getElementById("btn-no-response").onclick = async () => {
  await FirebaseService.createCareLog({
    userId: "user01",
    type: "response",
    status: "no_response",
    messageKey: "noResponse",
    message: uiText("noResponse"),
    source: "web_dashboard",
  });
};

document.getElementById("btn-sim-fall").onclick = async () => {
  await FirebaseService.createAlert({
    type: "fall_detected",
    level: "emergency",
    messageKey: "fallDetectedLivingRoom",
    message: uiText("fallDetectedLivingRoom"),
    source: "camera_ai",
    lineStatus: "sent",
    createdAt: new Date().toISOString(),
  });
};
document.getElementById("btn-sim-robot-offline").onclick = async () => {
  await FirebaseService.createAlert({
    type: "robot_offline",
    level: "warning",
    messageKey: "robotDisconnected",
    message: uiText("robotDisconnected"),
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
    messageKey: "fallDetected",
    message: uiText("fallDetected"),
    source: "demo",
  });
};
document.getElementById("demo-medicine-done").onclick = async () => {
  await createDemoMedicineEvent("medicine_taken");
};
document.getElementById("demo-no-response").onclick = async () => {
  await createDemoMedicineEvent("medicine_no_response");
};
document.getElementById("demo-toggle-light").onclick = async () => {
  const button = document.getElementById("demo-toggle-light");
  if (button) {
    button.disabled = true;
  }
  try {
    const payload = await createLightControlCommand();
    toggleLocalLightDisplayState();
    showCommandToast({
      ...payload,
      key: "room_light_power",
      type: "ir_send",
      status: "pending",
    });
  } catch (error) {
    console.error("Dashboard: command send failed", error);
    showCommandToast(
      {
        command: "living_room_light",
        status: "failed",
      },
      { status: "failed", dedupe: false },
    );
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

if (typeof FirebaseService.listenMedicineCareLogs === "function") {
  FirebaseService.listenMedicineCareLogs((data) => {
    latestMedicineCareLogs = sortByNewest(
      (data || []).filter(isValidMedicineCareLog),
      (log) => getTimeValue(log.createdAt || log.receivedAt),
    );
    console.log(
      `Dashboard: medicine care logs loaded count=${latestMedicineCareLogs.length}`,
    );
    renderLatestMedicineFollowup();
  }, 30);
}

if (typeof FirebaseService.listenCaregiverNotifications === "function") {
  FirebaseService.listenCaregiverNotifications((data) => {
    updateCaregiverNotificationsSection(data || []);
  }, 10);
}

if (typeof FirebaseService.listenHealthConcerns === "function") {
  FirebaseService.listenHealthConcerns((data) => {
    updateHealthConcernsSection(data || []);
  }, 30);
}

window.addEventListener("tsunagari-language-change", () => {
  window.TsunagariI18n?.applyTranslations?.();
  updateDateTimeEnvironmentClock();
  renderRoomEnvironment();
  renderOutdoorWeather();
  renderHealthConcerns(latestHealthConcerns);
  renderLatestMedicineFollowup();
  renderMedicineReminders(latestMedicineReminders);
  updateRobotSection(pickRobotForDisplay());
  renderDevices(latestSmartHomeDevices);
  updateCaregiverNotificationsSection(latestCaregiverNotifications);
  updateAlertsSection(latestAlerts);
  updateCareLogsSection(latestCareLogs);
  updateFallResponseTimelineFromCareEvents();
  renderFallAlerts(latestFallAlerts);
  rerenderCommandToasts();
  setupResolvedFallHistoryToggle();
});

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
    handleCommandToastSnapshot(commands);
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
startEnvironmentWidget();
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

