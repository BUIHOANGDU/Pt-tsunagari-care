(function () {
  const LANGUAGE_KEY = "tsunagariCareLanguage";
  const DEFAULT_LANGUAGE = "ja";
  const SUPPORTED_LANGUAGES = new Set(["ja", "vi"]);
  const HOST_DEVICE_ID = "camera_home_001";
  const HOST_OFFLINE_TIMEOUT_MS = 35 * 1000;
  const WEATHER_API_URL = "https://pt-tsunagari-care.onrender.com/api/weather/current";
  const VIEWER_ID_KEY = "tsunagariFamilyViewerId";

  const translations = {
    ja: {
      language: "表示言語",
      skipToContent: "本文へ移動",
      remoteCameraVideo: "Camera Hostの映像",
      familyHistory: "家族向けケア履歴",
      viewerLabel: "ファミリービュー",
      familyMonitoring: "ファミリーモニタリング",
      cameraSubtitle: "Camera Hostから届く映像だけを表示します。",
      statusSummary: "ステータス概要",
      environmentSummary: "環境サマリー",
      alertsSummary: "重要なお知らせ",
      careSchedule: "ケア予定",
      healthSummary: "健康メモ",
      checking: "確認中",
      lastUpdated: "最終更新",
      cameraArea: "カメラエリア",
      liveCamera: "ライブカメラ",
      cameraNotConfigured: "カメラ未設定",
      waitingSource: "映像待機中",
      noCameraSource: "ライブカメラの送信元がまだありません",
      viewerNoLocalCamera: "この端末のカメラやマイクは使用しません。",
      retryConnection: "再接続",
      fullscreen: "全画面",
      hostDevice: "Camera Host",
      hostHeartbeat: "ハートビート",
      connectionStatus: "接続状態",
      notConfigured: "未設定",
      familyStatus: "見守り状態",
      chamiStatus: "Chami状態",
      cameraHostStatus: "Camera Host状態",
      fallDetection: "転倒検知",
      safetyOverview: "安全概要",
      unknown: "不明",
      environment: "環境",
      outdoorTemp: "外気温",
      weather: "天気",
      weatherUnavailable: "天気情報なし",
      roomTemp: "室温",
      noSensor: "センサーなし",
      noSensorConnected: "センサー未接続",
      humidity: "湿度",
      roomSensorNote: "室内センサーはまだ接続されていません。",
      latestAlerts: "最新アラート",
      maxThree: "最大3件",
      medicineToday: "本日の服薬",
      recentHealth: "最近の健康状態",
      maxFive: "最大5件",
      online: "オンライン",
      offline: "オフライン",
      streamReady: "配信準備完了",
      streamNotReady: "配信未準備",
      requesting: "視聴リクエスト中",
      waitingOffer: "オファー待機中",
      answering: "応答作成中",
      connecting: "接続中",
      connected: "接続済み",
      disconnected: "切断",
      failed: "接続失敗",
      sessionExpired: "セッション期限切れ",
      hostBusy: "ホストが混み合っています",
      unavailable: "利用できません",
      cameraUnavailable: "カメラ機能はまだ構成されていません",
      live: "ライブ",
      safe: "安定",
      attention: "注意が必要",
      danger: "緊急",
      warning: "注意",
      info: "情報",
      resolved: "対応済み",
      unresolved: "未対応",
      noAlerts: "最新アラートはありません。",
      noMedicine: "本日の服薬予定はありません。",
      noHealth: "最近の健康記録はありません。",
      medicineTaken: "服薬済み",
      noResponse: "応答なし",
      missed: "未服薬",
      notYet: "予定前",
      active: "有効",
      inactive: "停止中",
      firebaseUnavailable: "Firebaseに接続できません。",
      invalidTimestamp: "--",
      symptomFatigue: "疲労感",
      symptomHeadache: "頭痛",
      symptomDizziness: "めまい",
      symptomBreathing: "息苦しさ",
      symptomChestPain: "胸の痛み",
      symptomAbdominalPain: "腹痛",
      symptomNausea: "吐き気",
      symptomSleepProblem: "睡眠の問題",
      symptomHeart: "動悸",
      symptomWeaknessOrNumbness: "しびれ・脱力",
      symptomFever: "発熱",
      symptomFainting: "失神の恐れ",
      symptomGeneralPain: "痛み",
    },
    vi: {
      language: "Ngôn ngữ hiển thị",
      skipToContent: "Chuyển đến nội dung chính",
      remoteCameraVideo: "Hình ảnh từ Camera Host",
      familyHistory: "Lịch sử chăm sóc cho gia đình",
      viewerLabel: "Màn hình người nhà",
      familyMonitoring: "Theo dõi gia đình",
      cameraSubtitle: "Chỉ hiển thị hình ảnh từ Camera Host.",
      statusSummary: "Tóm tắt trạng thái",
      environmentSummary: "Tóm tắt môi trường",
      alertsSummary: "Thông báo quan trọng",
      careSchedule: "Lịch chăm sóc",
      healthSummary: "Ghi chú sức khỏe",
      checking: "Đang kiểm tra",
      lastUpdated: "Cập nhật lần cuối",
      cameraArea: "Khu vực camera",
      liveCamera: "Camera trực tiếp",
      cameraNotConfigured: "Camera chưa cấu hình",
      waitingSource: "Đang chờ nguồn hình",
      noCameraSource: "Chưa có nguồn camera trực tiếp",
      viewerNoLocalCamera: "Thiết bị này không dùng camera hoặc microphone.",
      retryConnection: "Thử kết nối lại",
      fullscreen: "Toàn màn hình",
      hostDevice: "Camera Host",
      hostHeartbeat: "Heartbeat",
      connectionStatus: "Trạng thái kết nối",
      notConfigured: "Chưa cấu hình",
      familyStatus: "Trạng thái người thân",
      chamiStatus: "Trạng thái Chami",
      cameraHostStatus: "Trạng thái Camera Host",
      fallDetection: "Phát hiện ngã",
      safetyOverview: "Tổng quan an toàn",
      unknown: "Không rõ",
      environment: "Môi trường",
      outdoorTemp: "Nhiệt độ ngoài trời",
      weather: "Thời tiết",
      weatherUnavailable: "Không có thông tin thời tiết",
      roomTemp: "Nhiệt độ phòng",
      noSensor: "Chưa có cảm biến",
      noSensorConnected: "Chưa kết nối cảm biến",
      humidity: "Độ ẩm",
      roomSensorNote: "Cảm biến phòng thật chưa được kết nối.",
      latestAlerts: "Cảnh báo mới nhất",
      maxThree: "Tối đa 3",
      medicineToday: "Thuốc hôm nay",
      recentHealth: "Sức khỏe gần đây",
      maxFive: "Tối đa 5",
      online: "Trực tuyến",
      offline: "Ngoại tuyến",
      streamReady: "Sẵn sàng phát",
      streamNotReady: "Chưa sẵn sàng phát",
      requesting: "Đang yêu cầu xem",
      waitingOffer: "Đang chờ offer",
      answering: "Đang tạo answer",
      connecting: "Đang kết nối",
      connected: "Đã kết nối",
      disconnected: "Đã ngắt",
      failed: "Kết nối thất bại",
      sessionExpired: "Phiên xem hết hạn",
      hostBusy: "Host đang bận",
      unavailable: "Không khả dụng",
      cameraUnavailable: "Chức năng camera chưa được cấu hình",
      live: "Trực tiếp",
      safe: "Ổn định",
      attention: "Cần chú ý",
      danger: "Khẩn cấp",
      warning: "Chú ý",
      info: "Thông tin",
      resolved: "Đã xử lý",
      unresolved: "Chưa xử lý",
      noAlerts: "Không có cảnh báo mới.",
      noMedicine: "Không có lịch uống thuốc hôm nay.",
      noHealth: "Không có ghi nhận sức khỏe gần đây.",
      medicineTaken: "Đã uống",
      noResponse: "Không phản hồi",
      missed: "Bỏ lỡ",
      notYet: "Chưa đến giờ",
      active: "Đang bật",
      inactive: "Đang tắt",
      firebaseUnavailable: "Không kết nối được Firebase.",
      invalidTimestamp: "--",
      symptomFatigue: "Mệt mỏi",
      symptomHeadache: "Đau đầu",
      symptomDizziness: "Chóng mặt",
      symptomBreathing: "Khó thở",
      symptomChestPain: "Đau ngực",
      symptomAbdominalPain: "Đau bụng",
      symptomNausea: "Buồn nôn",
      symptomSleepProblem: "Vấn đề giấc ngủ",
      symptomHeart: "Tim đập bất thường",
      symptomWeaknessOrNumbness: "Tê hoặc yếu",
      symptomFever: "Sốt",
      symptomFainting: "Có nguy cơ ngất",
      symptomGeneralPain: "Đau",
    },
  };

  const state = {
    db: null,
    cameraHost: null,
    latestAlerts: [],
    latestHealth: [],
    latestReminders: [],
    remoteStream: null,
    viewerPeerConnection: null,
    viewerConnection: null,
    viewerConnecting: false,
    cameraState: "not_configured",
  };

  function getLanguage() {
    const language = localStorage.getItem(LANGUAGE_KEY) || DEFAULT_LANGUAGE;
    return SUPPORTED_LANGUAGES.has(language) ? language : DEFAULT_LANGUAGE;
  }

  function t(key) {
    const language = getLanguage();
    return translations[language]?.[key] || translations.ja[key] || key;
  }

  function setLanguage(language) {
    const nextLanguage = SUPPORTED_LANGUAGES.has(language)
      ? language
      : DEFAULT_LANGUAGE;
    localStorage.setItem(LANGUAGE_KEY, nextLanguage);
    applyTranslations();
    renderAll();
  }

  function applyTranslations() {
    document.documentElement.lang = getLanguage();
    document.title = "TsunagariCare Family";
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = t(element.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
      element.setAttribute("aria-label", t(element.getAttribute("data-i18n-aria-label")));
    });
    document.querySelectorAll("[data-language-option]").forEach((button) => {
      const active = button.getAttribute("data-language-option") === getLanguage();
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function getViewerId() {
    const existing = localStorage.getItem(VIEWER_ID_KEY);
    if (existing) return existing;
    const viewerId =
      "viewer_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 10);
    localStorage.setItem(VIEWER_ID_KEY, viewerId);
    return viewerId;
  }

  function parseTimestamp(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : Date.parse(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    if (value && typeof value === "object") {
      const seconds = Number(value.seconds || value._seconds);
      if (Number.isFinite(seconds)) return seconds * 1000;
    }
    return 0;
  }

  function formatTime(value) {
    const timestamp = parseTimestamp(value);
    if (!timestamp) return t("invalidTimestamp");
    return new Intl.DateTimeFormat(getLanguage() === "vi" ? "vi-VN" : "ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(timestamp));
  }

  function objectToArray(value) {
    if (!value || typeof value !== "object") return [];
    return Object.entries(value).map(([id, item]) =>
      item && typeof item === "object" ? { id, ...item } : { id, value: item },
    );
  }

  function sortNewest(items) {
    return items.sort((a, b) => {
      const bt = parseTimestamp(b.createdAtMs || b.createdAt || b.receivedAt || b.updatedAt);
      const at = parseTimestamp(a.createdAtMs || a.createdAt || a.receivedAt || a.updatedAt);
      return bt - at;
    });
  }

  function badgeClass(level) {
    if (level === "danger") return "is-danger";
    if (level === "warning") return "is-warning";
    if (level === "online" || level === "connected" || level === "safe") {
      return "is-success";
    }
    return "is-muted";
  }

  function setBadge(id, key, level = "muted") {
    const element = byId(id);
    if (!element) return;
    element.textContent = t(key);
    element.className = `badge ${badgeClass(level)}`;
  }

  function renderEmpty(list, key) {
    list.innerHTML = "";
    const item = document.createElement("li");
    item.className = "is-empty";
    const icon = document.createElement("span");
    icon.className = "empty-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "✓";
    const text = document.createElement("span");
    text.textContent = t(key);
    item.append(icon, text);
    list.appendChild(item);
  }

  function createStatusBadge(key, level) {
    const badge = document.createElement("span");
    badge.className = `badge ${badgeClass(level)}`;
    badge.textContent = t(key);
    return badge;
  }

  function toneFromLevel(level) {
    if (level === "danger") return "is-danger";
    if (level === "warning") return "is-warning";
    if (level === "online" || level === "connected" || level === "safe") {
      return "is-success";
    }
    return "is-muted";
  }

  function symptomLabel(record) {
    if (record.symptomLabel) return record.symptomLabel;
    const symptom = String(record.symptom || record.type || "").toLowerCase();
    const symptomKeys = {
      fatigue: "symptomFatigue",
      headache: "symptomHeadache",
      dizziness: "symptomDizziness",
      breathing: "symptomBreathing",
      chest_pain: "symptomChestPain",
      abdominal_pain: "symptomAbdominalPain",
      nausea: "symptomNausea",
      sleep_problem: "symptomSleepProblem",
      heart: "symptomHeart",
      weakness_or_numbness: "symptomWeaknessOrNumbness",
      fever: "symptomFever",
      fainting: "symptomFainting",
      general_pain: "symptomGeneralPain",
    };
    if (symptomKeys[symptom]) return t(symptomKeys[symptom]);
    return symptom ? symptom.replace(/_/g, " ") : t("unknown");
  }

  function isCameraHostOnline() {
    const host = state.cameraHost;
    if (!host || host.online !== true) return false;
    const heartbeat = parseTimestamp(host.lastHeartbeatAt);
    return heartbeat > 0 && Date.now() - heartbeat <= HOST_OFFLINE_TIMEOUT_MS;
  }

  function showCameraState(nextState) {
    state.cameraState = nextState;
    const connectionText = byId("camera-connection-text");
    const placeholder = byId("video-placeholder");
    const fullscreenButton = byId("fullscreen-camera");
    const states = {
      not_configured: ["cameraNotConfigured", "cameraUnavailable", "muted"],
      offline: ["offline", "offline", "muted"],
      stream_not_ready: ["streamNotReady", "streamNotReady", "warning"],
      waiting_source: ["waitingSource", "waitingSource", "muted"],
      requesting: ["requesting", "requesting", "warning"],
      waiting_offer: ["waitingOffer", "waitingOffer", "warning"],
      answering: ["answering", "answering", "warning"],
      answer_created: ["connecting", "connecting", "warning"],
      connecting: ["connecting", "connecting", "warning"],
      connected: ["live", "connected", "online"],
      disconnected: ["disconnected", "disconnected", "warning"],
      failed: ["failed", "failed", "danger"],
      session_expired: ["sessionExpired", "sessionExpired", "warning"],
      busy: ["hostBusy", "hostBusy", "warning"],
      unavailable: ["unavailable", "unavailable", "warning"],
    };
    const [badgeKey, textKey, tone] = states[nextState] || states.not_configured;
    setBadge("connection-state-badge", badgeKey, tone);
    connectionText.textContent = t(textKey);
    placeholder.classList.toggle("is-hidden", nextState === "connected");
    fullscreenButton.disabled = nextState !== "connected" || !state.remoteStream;
  }

  function setCameraHostStatus(host) {
    state.cameraHost = host;
    const hasHost = Boolean(host && typeof host === "object");
    const online = isCameraHostOnline();
    byId("host-heartbeat").textContent = formatTime(host?.lastHeartbeatAt);
    byId("camera-host-status").textContent = hasHost
      ? t(online ? "online" : "offline")
      : t("cameraNotConfigured");
    byId("fall-detection-status").textContent = hasHost
      ? t(host.fallDetectionActive ? "active" : "inactive")
      : t("unknown");
    setBadge(
      "camera-state-badge",
      hasHost ? (online ? "online" : "offline") : "cameraNotConfigured",
      online ? "online" : "muted",
    );
    const pendingConnectionStates = new Set([
      "requesting",
      "waiting_offer",
      "answering",
      "answer_created",
      "connecting",
    ]);
    if (!hasHost) {
      showCameraState("not_configured");
    } else if (!online) {
      showCameraState("offline");
    } else if (host.streamReady === true) {
      if (state.remoteStream) {
        showCameraState("connected");
      } else if (
        !state.viewerConnection &&
        !state.viewerConnecting &&
        !pendingConnectionStates.has(state.cameraState)
      ) {
        showCameraState("waiting_source");
      }
      requestRemoteConnection();
    } else {
      showCameraState("stream_not_ready");
    }
  }

  function attachRemoteStream(remoteStream) {
    state.remoteStream = remoteStream;
    const remoteVideo = byId("remote-video");
    remoteVideo.srcObject = remoteStream;
    showCameraState("connected");
  }

  function detachRemoteStream() {
    state.remoteStream = null;
    const remoteVideo = byId("remote-video");
    remoteVideo.srcObject = null;
    showCameraState(isCameraHostOnline() ? "waiting_source" : "offline");
  }

  async function closeViewerConnection(status = "closed") {
    if (!state.viewerConnection) return;
    const current = state.viewerConnection;
    state.viewerConnection = null;
    state.viewerPeerConnection = null;
    await current.close(status).catch((error) => {
      console.warn("FamilyViewer: close failed", error);
    });
  }

  async function requestRemoteConnection() {
    if (state.viewerConnecting || state.remoteStream || state.viewerConnection) {
      return;
    }
    if (!state.cameraHost) {
      showCameraState("not_configured");
      return;
    }
    if (!isCameraHostOnline()) {
      showCameraState("offline");
      return;
    }
    if (state.cameraHost.streamReady !== true) {
      showCameraState("stream_not_ready");
      return;
    }
    if (!window.TsunagariCameraSignaling) {
      showCameraState("unavailable");
      return;
    }

    state.viewerConnecting = true;
    showCameraState("requesting");
    try {
      const connection = await window.TsunagariCameraSignaling.createViewerConnection({
        hostDeviceId: HOST_DEVICE_ID,
        viewerId: getViewerId(),
        onRemoteStream: (remoteStream) => {
          attachRemoteStream(remoteStream);
        },
        onSessionStatus: (status) => {
          if (status === "requesting") showCameraState("requesting");
          if (status === "waiting_offer") showCameraState("waiting_offer");
          if (status === "offer_created") showCameraState("answering");
          if (status === "answering") showCameraState("answering");
          if (status === "answer_created") showCameraState("answer_created");
          if (status === "busy") showCameraState("busy");
          if (status === "unavailable") showCameraState("unavailable");
          if (status === "expired") showCameraState("session_expired");
          if (status === "failed") showCameraState("failed");
          if (status === "connecting") showCameraState("connecting");
        },
        onConnectionState: (status) => {
          if (status === "connected") {
            showCameraState(state.remoteStream ? "connected" : "connecting");
          }
          if (status === "disconnected") showCameraState("disconnected");
          if (status === "failed") showCameraState("failed");
        },
      });
      state.viewerConnection = connection;
      state.viewerPeerConnection = connection.viewerPeerConnection;
    } catch (error) {
      console.warn("FamilyViewer: remote connection failed", error);
      showCameraState("failed");
    } finally {
      state.viewerConnecting = false;
    }
  }

  function retryRemoteConnection() {
    closeViewerConnection("closed").finally(() => {
      detachRemoteStream();
      requestRemoteConnection();
    });
  }

  function destroyFamilyCameraViewer() {
    closeViewerConnection("closed");
    detachRemoteStream();
  }

  function renderOverall() {
    const hasDanger = state.latestAlerts.some((alert) => alert.level === "danger");
    const hasWarning =
      state.latestAlerts.some((alert) => alert.level === "warning") ||
      state.latestHealth.some((item) => item.level === "warning" || item.severity === "warning");
    const key = hasDanger ? "danger" : hasWarning ? "attention" : "safe";
    const tone = hasDanger ? "danger" : hasWarning ? "warning" : "safe";
    setBadge("overall-status-badge", key, tone);
    byId("safety-overview").textContent = t(key);
    byId("last-updated").textContent = formatTime(Date.now());
  }

  function renderAlerts() {
    const list = byId("alerts-list");
    const alerts = state.latestAlerts.slice(0, 3);
    if (!alerts.length) {
      renderEmpty(list, "noAlerts");
      return;
    }
    list.innerHTML = "";
    alerts.forEach((alert) => {
      const item = document.createElement("li");
      const level = alert.level || "info";
      item.classList.add(toneFromLevel(level));
      const top = document.createElement("div");
      top.className = "item-top";
      const title = document.createElement("strong");
      title.className = "item-title";
      title.textContent = alert.messageKey ? t(alert.messageKey) : alert.message || alert.type || t("unknown");
      top.append(title, createStatusBadge(level === "danger" ? "danger" : level === "warning" ? "warning" : "info", level));
      const source = document.createElement("span");
      source.className = "item-source";
      source.textContent = `${alert.source || t("unknown")} · ${alert.status === "resolved" ? t("resolved") : t("unresolved")}`;
      const time = document.createElement("time");
      time.textContent = formatTime(alert.createdAtMs || alert.createdAt || alert.receivedAt);
      item.append(top, source, time);
      list.appendChild(item);
    });
  }

  function getMedicineStatus(reminder) {
    const status = String(reminder.status || "").toLowerCase();
    if (status === "confirmed" || status === "done") return "medicineTaken";
    if (status === "no_response") return "noResponse";
    if (status === "missed") return "missed";
    return "notYet";
  }

  function renderMedicine() {
    const list = byId("medicine-list");
    const reminders = state.latestReminders
      .filter((reminder) => reminder.enabled !== false)
      .slice(0, 8);
    if (!reminders.length) {
      renderEmpty(list, "noMedicine");
      return;
    }
    list.innerHTML = "";
    reminders.forEach((reminder) => {
      const item = document.createElement("li");
      const statusKey = getMedicineStatus(reminder);
      if (statusKey === "medicineTaken") item.classList.add("is-success");
      if (statusKey === "missed" || statusKey === "noResponse") item.classList.add("is-warning");
      const top = document.createElement("div");
      top.className = "item-top";
      const title = document.createElement("strong");
      title.className = "item-title";
      title.textContent = reminder.medicineName || reminder.name || t("unknown");
      top.append(title, createStatusBadge(statusKey, statusKey === "medicineTaken" ? "online" : "muted"));
      const time = document.createElement("span");
      time.className = "item-source";
      time.textContent = reminder.time || "--:--";
      item.append(top, time);
      list.appendChild(item);
    });
  }

  function renderHealth() {
    const list = byId("health-list");
    const records = state.latestHealth.slice(0, 5);
    if (!records.length) {
      renderEmpty(list, "noHealth");
      return;
    }
    list.innerHTML = "";
    records.forEach((record) => {
      const item = document.createElement("li");
      const top = document.createElement("div");
      top.className = "item-top";
      const title = document.createElement("strong");
      title.className = "item-title";
      title.textContent = symptomLabel(record);
      const level = record.level || record.severity || "info";
      item.classList.add(record.resolved ? "is-success" : toneFromLevel(level));
      top.append(title, createStatusBadge(level === "danger" ? "danger" : level === "warning" ? "warning" : "info", level));
      const status = document.createElement("span");
      status.className = "item-source";
      status.textContent = record.resolved ? t("resolved") : t("unresolved");
      const time = document.createElement("time");
      time.textContent = formatTime(record.createdAtMs || record.createdAt || record.receivedAt);
      item.append(top, status, time);
      list.appendChild(item);
    });
  }

  function renderAll() {
    renderOverall();
    setCameraHostStatus(state.cameraHost);
    renderAlerts();
    renderMedicine();
    renderHealth();
  }

  function initFirebaseReadOnly() {
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
    state.db = firebase.database();
  }

  function listenValue(path, onValue) {
    const ref = state.db.ref(path);
    ref.on(
      "value",
      (snapshot) => onValue(snapshot.val()),
      () => onValue(null),
    );
    return () => ref.off();
  }

  function listenLimited(path, limit, onValue) {
    const ref = state.db.ref(path).orderByChild("createdAtMs").limitToLast(limit);
    ref.on(
      "value",
      (snapshot) => onValue(sortNewest(objectToArray(snapshot.val())).slice(0, limit)),
      () => onValue([]),
    );
    return () => ref.off();
  }

  function startDataListeners() {
    listenValue("robots/chami01", (robot) => {
      byId("chami-status").textContent = robot?.status ? t(robot.status) || robot.status : t("unknown");
      renderOverall();
    });
    listenValue(`camera_hosts/${HOST_DEVICE_ID}`, (host) => {
      setCameraHostStatus(host);
      renderOverall();
    });
    listenLimited("alerts", 3, (alerts) => {
      state.latestAlerts = alerts;
      renderAlerts();
      renderOverall();
    });
    listenLimited("health_concerns", 5, (records) => {
      state.latestHealth = records.filter((record) => record && record.type !== "raw_transcript");
      renderHealth();
      renderOverall();
    });
    const remindersRef = state.db
      .ref("reminders")
      .orderByChild("enabled")
      .equalTo(true)
      .limitToFirst(10);
    remindersRef.on(
      "value",
      (snapshot) => {
        state.latestReminders = objectToArray(snapshot.val()).slice(0, 8);
        renderMedicine();
      },
      () => {
        state.latestReminders = [];
        renderMedicine();
      },
    );
  }

  async function fetchWeather() {
    try {
      const response = await fetch(WEATHER_API_URL, {
        headers: { accept: "application/json" },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || !payload.weather) {
        throw new Error("weather_unavailable");
      }
      byId("outdoor-temp").textContent = `${Math.round(payload.weather.temperatureC)}°C`;
      byId("weather-state").textContent = payload.weather.description || t("weather");
    } catch (error) {
      byId("outdoor-temp").textContent = "--°C";
      byId("weather-state").textContent = t("weatherUnavailable");
    }
  }

  function initializeFamilyCameraViewer() {
    byId("retry-camera").addEventListener("click", retryRemoteConnection);
    byId("fullscreen-camera").addEventListener("click", () => {
      if (!state.remoteStream) return;
      byId("remote-video").requestFullscreen?.();
    });
    showCameraState("not_configured");
  }

  function initLanguageSwitcher() {
    document.querySelectorAll("[data-language-option]").forEach((button) => {
      button.addEventListener("click", () => {
        setLanguage(button.getAttribute("data-language-option"));
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    applyTranslations();
    initLanguageSwitcher();
    initializeFamilyCameraViewer();
    try {
      initFirebaseReadOnly();
      startDataListeners();
      fetchWeather();
      window.setInterval(fetchWeather, 10 * 60 * 1000);
    } catch (error) {
      setBadge("overall-status-badge", "firebaseUnavailable", "warning");
      byId("safety-overview").textContent = t("firebaseUnavailable");
      renderEmpty(byId("alerts-list"), "noAlerts");
      renderEmpty(byId("medicine-list"), "noMedicine");
      renderEmpty(byId("health-list"), "noHealth");
      showCameraState("not_configured");
    }
  });

  window.addEventListener("pagehide", () => {
    closeViewerConnection("closed");
  });

  window.TsunagariFamilyViewer = {
    initializeFamilyCameraViewer,
    attachRemoteStream,
    detachRemoteStream,
    setCameraHostStatus,
    showCameraState,
    retryRemoteConnection,
    destroyFamilyCameraViewer,
  };
})();
