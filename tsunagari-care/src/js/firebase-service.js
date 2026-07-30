/*
  FirebaseService for TsunagariCare
  - Uses Firebase Realtime Database when firebase-config.js + SDK are loaded.
  - Falls back to localStorage when Firebase is not configured.
*/

const FirebaseService = (function () {
  let useRealtime = false;
  let db = null;

  const listeners = {
    robots: [],
    devices: [],
    alerts: [],
    care_logs: [],
    care_events: [],
    caregiver_notifications: [],
    commands: [],
    medicine_reminders: [],
    health_concerns: [],
  };

  const unsubscribes = {
    robots: null,
    devices: null,
    alerts: null,
    care_logs: null,
    care_events: null,
    caregiver_notifications: null,
    commands: null,
    medicine_reminders: null,
    health_concerns: null,
  };
  const DEFAULT_MEDICINE_REMINDER = {
    type: "medicine",
    medicineName: "Thuốc huyết áp",
    time: "08:00",
    timezone: "Asia/Tokyo",
    repeat: "daily",
    enabled: true,
    targetDeviceId: "chami_001",
  };
  const MEDICINE_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const LEGACY_DEMO_MEDICINE_MESSAGE =
    "\u0110\u00e3 u\u1ed1ng thu\u1ed1c (demo)";

  function init() {
    try {
      if (window.firebaseConfig && window.firebase) {
        if (!firebase.apps || !firebase.apps.length) {
          firebase.initializeApp(window.firebaseConfig);
        }

        if (typeof firebase.database === "function") {
          db = firebase.database();
          useRealtime = true;
          console.log("FirebaseService: using Realtime Database");
          seedRealtimeData();
        } else {
          console.warn("Firebase Realtime Database SDK not loaded.");
          useRealtime = false;
        }
      } else {
        console.log("FirebaseService: using local demo mode");
        useRealtime = false;
      }
    } catch (e) {
      console.warn("FirebaseService init failed, fallback to local", e);
      useRealtime = false;
    }

    seedMockData();
  }

  function serverTs() {
    return new Date().toISOString();
  }

  function normalizeTimestamp(value) {
    if (typeof value === "number") {
      return Number.isFinite(value) && value > 0 ? value : 0;
    }
    if (typeof value === "string" && value.trim()) {
      const text = value.trim();
      const parsed = /^\d+$/.test(text) ? Number(text) : Date.parse(text);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    }
    if (value && typeof value.toMillis === "function") {
      const millis = value.toMillis();
      return Number.isFinite(millis) ? millis : 0;
    }
    if (value && typeof value.toDate === "function") {
      const millis = value.toDate().getTime();
      return Number.isFinite(millis) ? millis : 0;
    }
    if (value && typeof value === "object") {
      const seconds = Number(value.seconds ?? value._seconds);
      const nanoseconds = Number(value.nanoseconds ?? value._nanoseconds ?? 0);
      if (Number.isFinite(seconds)) {
        return seconds * 1000 + Math.floor(nanoseconds / 1000000);
      }
    }
    return 0;
  }

  function realtimeServerTs() {
    if (
      useRealtime &&
      window.firebase &&
      firebase.database &&
      firebase.database.ServerValue
    ) {
      return firebase.database.ServerValue.TIMESTAMP;
    }

    return serverTs();
  }

  function sortByCreatedAtDesc(arr) {
    return arr.sort((a, b) => {
      const ta = normalizeTimestamp(
        a.createdAt || a.receivedAt || a.updatedAt || a.timestamp,
      );
      const tb = normalizeTimestamp(
        b.createdAt || b.receivedAt || b.updatedAt || b.timestamp,
      );
      return tb - ta;
    });
  }

  function objectToArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;

    return Object.entries(value).map(([id, data]) => {
      if (data && typeof data === "object") {
        return { id, ...data };
      }
      return { id, value: data };
    });
  }

  // ---------- Local helpers ----------
  function readLocal(key) {
    return JSON.parse(localStorage.getItem(key) || "null");
  }

  function writeLocal(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function listLocalRobots() {
    const out = [];

    for (const key in localStorage) {
      if (key.startsWith("mock:robots:")) {
        try {
          out.push(JSON.parse(localStorage.getItem(key)));
        } catch (e) {
          console.warn("Invalid local robot data", e);
        }
      }
    }

    return out;
  }

  function notifyLocal(kind) {
    if (kind === "robots") {
      listeners.robots.forEach((cb) => cb(listLocalRobots()));
      return;
    }

    const map = {
      devices: "mock:devices",
      alerts: "mock:alerts",
      care_logs: "mock:care_logs",
      care_events: "mock:care_events",
      caregiver_notifications: "mock:caregiver_notifications",
      commands: "mock:commands",
      medicine_reminders: "mock:reminders",
      health_concerns: "mock:health_concerns",
    };

    const key = map[kind];
    if (!key) return;

    const data = JSON.parse(localStorage.getItem(key) || "[]");
    listeners[kind].forEach((cb) => cb(data));
  }

  // ---------- Realtime Database helpers ----------
  async function getRealtimeValue(path) {
    const snap = await db.ref(path).get();
    return snap.exists() ? snap.val() : null;
  }

  async function setRealtimeValue(path, value) {
    await db.ref(path).set(value);
  }

  async function updateRealtimeValue(path, value) {
    await db.ref(path).update(value);
  }

  async function pushRealtimeValue(path, value) {
    const ref = db.ref(path).push();
    const data = { id: ref.key, ...value };
    await ref.set(data);
    return data;
  }

  // ---------- Subscribe ----------
  function subscribeTo(collection, cb) {
    if (!listeners[collection]) {
      throw new Error("Unknown collection " + collection);
    }

    listeners[collection].push(cb);

    if (useRealtime && !unsubscribes[collection]) {
      const ref = db.ref(collection);

      const handler = (snapshot) => {
        const value = snapshot.val();
        let data = objectToArray(value);

        if (
          collection === "alerts" ||
          collection === "care_logs" ||
          collection === "care_events" ||
          collection === "health_concerns" ||
          collection === "commands"
        ) {
          data = sortByCreatedAtDesc(data);
        }

        listeners[collection].forEach((fn) => fn(data));
      };

      ref.on("value", handler, (err) => {
        console.warn("Realtime Database listener error", err);
        if (collection === "care_events") {
          listeners.care_events.forEach((fn) => fn([]));
        }
      });

      unsubscribes[collection] = () => ref.off("value", handler);
    }

    if (!useRealtime) {
      notifyLocal(collection);
    }

    return () => {
      const idx = listeners[collection].indexOf(cb);
      if (idx > -1) listeners[collection].splice(idx, 1);

      if (
        useRealtime &&
        listeners[collection].length === 0 &&
        unsubscribes[collection]
      ) {
        unsubscribes[collection]();
        unsubscribes[collection] = null;
      }
    };
  }

  function subscribeToRobots(cb) {
    return subscribeTo("robots", cb);
  }

  function subscribeToDevices(cb) {
    return subscribeTo("devices", cb);
  }

  function subscribeToAlerts(cb) {
    return subscribeTo("alerts", cb);
  }

  function subscribeToCareLogs(cb) {
    return subscribeTo("care_logs", cb);
  }

  function listenMedicineCareLogs(callback, limit = 50) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const isMedicineLog = (log) =>
      log?.category === "medicine" ||
      (typeof log?.type === "string" && log.type.startsWith("medicine_"));
    const normalizeLogs = (logs) =>
      sortByCreatedAtDesc(
        (logs || []).filter(isMedicineLog).map((log) => ({
          ...log,
          timestamp: normalizeTimestamp(
            log.createdAt || log.receivedAt || log.updatedAt,
          ),
        })),
      );

    if (useRealtime) {
      const query = db
        .ref("care_logs")
        .orderByChild("type")
        .startAt("medicine_")
        .endAt("medicine_\uf8ff")
        .limitToLast(safeLimit);
      const handler = (snapshot) => {
        callback(normalizeLogs(objectToArray(snapshot.val())));
      };
      query.on("value", handler, (error) => {
        console.warn("Medicine care log listener error", error);
        callback([]);
      });
      return () => query.off("value", handler);
    }

    const emit = (logs) => callback(normalizeLogs(logs).slice(0, safeLimit));
    listeners.care_logs.push(emit);
    emit(JSON.parse(localStorage.getItem("mock:care_logs") || "[]"));
    return () => {
      const index = listeners.care_logs.indexOf(emit);
      if (index > -1) listeners.care_logs.splice(index, 1);
    };
  }

  function normalizeCaregiverNotifications(value, limit) {
    return sortByCreatedAtDesc(
      objectToArray(value)
        .filter((item) => {
          const timestamp = normalizeTimestamp(
            item?.createdAt || item?.sentAt || item?.updatedAt,
          );
          const valid =
            item &&
            typeof item === "object" &&
            typeof item.status === "string" &&
            timestamp > 0;
          if (!valid) {
            console.warn("FirebaseService: invalid caregiver notification skipped");
          }
          return valid;
        })
        .map((item) => ({
          ...item,
          timestamp: normalizeTimestamp(
            item.createdAt || item.sentAt || item.updatedAt,
          ),
        })),
    ).slice(0, limit);
  }

  function listenCaregiverNotifications(callback, limit = 10) {
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);

    if (useRealtime) {
      const query = db
        .ref("caregiver_notifications")
        .orderByChild("createdAt")
        .limitToLast(safeLimit);
      const handler = (snapshot) => {
        const data = normalizeCaregiverNotifications(snapshot.val(), safeLimit);
        console.log(
          `Dashboard: caregiver notifications loaded count=${data.length}`,
        );
        callback(data);
      };
      query.on("value", handler, (error) => {
        console.warn("Caregiver notification listener error", error);
        callback([]);
      });
      return () => query.off("value", handler);
    }

    const emit = (records) => {
      const data = normalizeCaregiverNotifications(records, safeLimit);
      console.log(
        `Dashboard: caregiver notifications loaded count=${data.length}`,
      );
      callback(data);
    };
    listeners.caregiver_notifications.push(emit);
    emit(JSON.parse(localStorage.getItem("mock:caregiver_notifications") || "[]"));
    return () => {
      const index = listeners.caregiver_notifications.indexOf(emit);
      if (index > -1) listeners.caregiver_notifications.splice(index, 1);
    };
  }

  function normalizeHealthConcerns(value, limit) {
    return sortByCreatedAtDesc(
      objectToArray(value)
        .filter((item) => item && item.type === "health_concern")
        .map((item) => ({
          ...item,
          timestamp: normalizeTimestamp(item.createdAt || item.receivedAt),
          resolved: item.resolved === true,
        })),
    ).slice(0, limit);
  }

  function listenHealthConcerns(callback, limit = 20) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);

    if (useRealtime) {
      const query = db
        .ref("health_concerns")
        .orderByChild("createdAt")
        .limitToLast(safeLimit);
      const handler = (snapshot) => {
        callback(normalizeHealthConcerns(snapshot.val(), safeLimit));
      };
      query.on("value", handler, (error) => {
        console.warn("Health concern listener error", error);
        callback([]);
      });
      return () => query.off("value", handler);
    }

    const emit = (records) => {
      callback(normalizeHealthConcerns(records, safeLimit));
    };
    listeners.health_concerns.push(emit);
    emit(JSON.parse(localStorage.getItem("mock:health_concerns") || "[]"));
    return () => {
      const index = listeners.health_concerns.indexOf(emit);
      if (index > -1) listeners.health_concerns.splice(index, 1);
    };
  }

  async function resolveHealthConcern(id) {
    const safeId = sanitizeRealtimeKey(id);
    if (!safeId) throw new Error("Invalid health concern id");
    const payload = {
      resolved: true,
      resolvedAt: realtimeServerTs(),
      resolvedBy: "dashboard",
    };

    if (useRealtime) {
      await updateRealtimeValue(`health_concerns/${safeId}`, payload);
      return;
    }

    const records = JSON.parse(localStorage.getItem("mock:health_concerns") || "[]");
    const index = records.findIndex((item) => item.id === safeId);
    if (index > -1) {
      records[index] = {
        ...records[index],
        ...payload,
        resolvedAt: serverTs(),
      };
      localStorage.setItem("mock:health_concerns", JSON.stringify(records));
      notifyLocal("health_concerns");
    }
  }

  function subscribeToCareEvents(cb) {
    return subscribeTo("care_events", cb);
  }

  function subscribeToCommands(cb) {
    return subscribeTo("commands", cb);
  }

  // ---------- CRUD ----------
  async function getRobot(id = "chami01") {
    if (useRealtime) {
      const bridgeRobot = await getRealtimeValue("devices/chami_001");
      if (bridgeRobot) {
        return { id: "chami_001", ...bridgeRobot };
      }

      const data = await getRealtimeValue(`robots/${id}`);
      return data ? { id, ...data } : null;
    }

    return JSON.parse(localStorage.getItem("mock:robots:" + id) || "null");
  }

  async function setRobot(id, data) {
    const payload = {
      id,
      ...data,
      updatedAt: serverTs(),
    };

    if (useRealtime) {
      await updateRealtimeValue(`robots/${id}`, payload);
      return;
    }

    localStorage.setItem(
      "mock:robots:" + id,
      JSON.stringify({
        ...(readLocal("mock:robots:" + id) || {}),
        ...payload,
      }),
    );

    notifyLocal("robots");
  }

  async function listDevices() {
    if (useRealtime) {
      return objectToArray(await getRealtimeValue("devices"));
    }

    return JSON.parse(localStorage.getItem("mock:devices") || "[]");
  }

  async function listCommands() {
    if (useRealtime) {
      return sortByCreatedAtDesc(
        objectToArray(await getRealtimeValue("commands")),
      );
    }

    return JSON.parse(localStorage.getItem("mock:commands") || "[]");
  }

  async function updateCommandStatus(id, status) {
    const payload = {
      status,
      updatedAt: serverTs(),
    };

    if (useRealtime) {
      await updateRealtimeValue(`commands/${id}`, payload);
      return;
    }

    const arr = JSON.parse(localStorage.getItem("mock:commands") || "[]");
    const idx = arr.findIndex((c) => c.id === id);

    if (idx > -1) {
      arr[idx] = { ...arr[idx], ...payload };
      localStorage.setItem("mock:commands", JSON.stringify(arr));
      notifyLocal("commands");
    }
  }

  async function createCommand(cmd) {
    const payload = {
      targetType: cmd.targetType || "device",
      targetId: cmd.targetId || "",
      command: cmd.command || "unknown",
      status: cmd.status || "pending",
      source: cmd.source || "web_dashboard",
      createdAt: cmd.createdAt || serverTs(),
    };

    if (useRealtime) {
      await pushRealtimeValue("commands", payload);
      return;
    }

    const arr = JSON.parse(localStorage.getItem("mock:commands") || "[]");
    arr.unshift({
      id: cmd.id || "cmd_" + Date.now(),
      ...payload,
    });

    localStorage.setItem("mock:commands", JSON.stringify(arr));
    notifyLocal("commands");
  }

  async function createDeviceControlCommand(deviceId, action, options = {}) {
    const payload = {
      source: options.source || "dashboard",
      target: options.target || "smart_home_001",
      type: "device_control",
      device: deviceId,
      action,
      text: options.text || "",
      status: "pending",
      createdAt: options.createdAt || realtimeServerTs(),
    };

    if (useRealtime) {
      return pushRealtimeValue("commands", payload);
    }

    const arr = JSON.parse(localStorage.getItem("mock:commands") || "[]");
    const data = {
      id: options.id || "cmd_" + Date.now(),
      ...payload,
    };

    arr.unshift(data);
    localStorage.setItem("mock:commands", JSON.stringify(arr));
    notifyLocal("commands");
    return data;
  }

  async function createRobotActionCommand(target, action, text, options = {}) {
    const payload = {
      source: options.source || "dashboard",
      target,
      type: "robot_action",
      action,
      text: text || "",
      status: options.status || "pending",
      createdAt: options.createdAt || realtimeServerTs(),
    };

    if (useRealtime) {
      return pushRealtimeValue("commands", payload);
    }

    const arr = JSON.parse(localStorage.getItem("mock:commands") || "[]");
    const data = {
      id: options.id || "cmd_" + Date.now(),
      ...payload,
    };

    arr.unshift(data);
    localStorage.setItem("mock:commands", JSON.stringify(arr));
    notifyLocal("commands");
    return data;
  }

  async function createSmartHomeCommand(action) {
    const textByAction = {
      on: "Bật đèn phòng khách",
      off: "Tắt đèn phòng khách",
      toggle: "Đổi trạng thái đèn phòng khách",
    };

    return createDeviceControlCommand("light_001", action, {
      text: textByAction[action] || "Điều khiển đèn phòng khách",
    });
  }

  async function createCareLog(log) {
    const message = typeof log?.message === "string" ? log.message : "";

    if (message.includes(LEGACY_DEMO_MEDICINE_MESSAGE)) {
      console.warn("FirebaseService: ignored legacy demo medicine care log");
      return null;
    }

    const payload = {
      userId: log.userId || "user01",
      type: log.type || "unknown",
      status: log.status || "done",
      message: log.message || "",
      source: log.source || "web_dashboard",
      createdAt: log.createdAt || serverTs(),
    };
    [
      "category",
      "level",
      "medicineName",
      "reminderId",
      "attempt",
      "attempts",
      "receivedAt",
    ].forEach((field) => {
      if (log[field] !== undefined) payload[field] = log[field];
    });

    if (useRealtime) {
      await pushRealtimeValue("care_logs", payload);
      return;
    }

    const arr = JSON.parse(localStorage.getItem("mock:care_logs") || "[]");
    arr.unshift({
      id: log.id || "cl_" + Date.now(),
      ...payload,
    });

    localStorage.setItem("mock:care_logs", JSON.stringify(arr));
    notifyLocal("care_logs");
  }

  function assertMedicineReminderId(reminderId) {
    if (
      typeof reminderId !== "string" ||
      !reminderId.trim() ||
      reminderId.length > 128 ||
      /[.#$\[\]\/]/.test(reminderId)
    ) {
      throw new Error("Invalid medicine reminder id");
    }
    return reminderId.trim();
  }

  function normalizeMedicineReminderList(value) {
    if (!value || typeof value !== "object") return [];

    const entries = Array.isArray(value)
      ? value
          .filter((item) => item && typeof item === "object" && item.id)
          .map((item) => [item.id, item])
      : Object.entries(value);

    return entries
      .filter(
        ([reminderId, reminder]) =>
          reminderId &&
          reminder &&
          typeof reminder === "object" &&
          reminder.type === "medicine",
      )
      .map(([reminderId, reminder]) => ({
        ...reminder,
        id: String(reminderId),
      }))
      .sort(
        (a, b) =>
          String(a.time || "").localeCompare(String(b.time || "")) ||
          String(a.medicineName || "").localeCompare(
            String(b.medicineName || ""),
            "vi",
          ),
      );
  }

  function getLocalMedicineReminders() {
    return normalizeMedicineReminderList(readLocal("mock:reminders") || {});
  }

  function notifyLocalMedicineReminders() {
    const reminders = getLocalMedicineReminders();
    listeners.medicine_reminders.forEach((cb) => cb(reminders));
  }

  function sanitizeMedicineReminderData(data = {}, existing = null) {
    const medicineName =
      typeof data.medicineName === "string"
        ? data.medicineName.trim()
        : String(existing?.medicineName || "").trim();
    const time =
      typeof data.time === "string"
        ? data.time.trim()
        : String(existing?.time || "").trim();
    const repeat =
      data.repeat === undefined ? existing?.repeat || "daily" : data.repeat;

    if (!medicineName) {
      throw new Error("medicineName is required");
    }
    if (medicineName.length > 100) {
      throw new Error("medicineName is too long");
    }
    if (!MEDICINE_TIME_RE.test(time)) {
      throw new Error("time must use HH:mm format");
    }
    if (repeat !== "daily") {
      throw new Error("repeat currently supports daily only");
    }

    const timezone =
      typeof data.timezone === "string" && data.timezone.trim()
        ? data.timezone.trim()
        : existing?.timezone || DEFAULT_MEDICINE_REMINDER.timezone;
    const targetDeviceId =
      typeof data.targetDeviceId === "string" && data.targetDeviceId.trim()
        ? data.targetDeviceId.trim()
        : existing?.targetDeviceId ||
          DEFAULT_MEDICINE_REMINDER.targetDeviceId;

    return {
      type: "medicine",
      medicineName,
      time,
      timezone,
      repeat: "daily",
      enabled:
        typeof data.enabled === "boolean"
          ? data.enabled
          : existing?.enabled ?? true,
      targetDeviceId,
    };
  }

  async function listMedicineReminders() {
    if (useRealtime) {
      return normalizeMedicineReminderList(
        await getRealtimeValue("reminders"),
      );
    }
    return getLocalMedicineReminders();
  }

  function listenMedicineReminders(callback) {
    if (typeof callback !== "function") {
      throw new Error("Medicine reminder callback is required");
    }
    listeners.medicine_reminders.push(callback);

    if (useRealtime) {
      const ref = db.ref("reminders");
      const handler = (snapshot) => {
        callback(normalizeMedicineReminderList(snapshot.val()));
      };
      ref.on("value", handler, (error) => {
        console.warn("Medicine reminder listener error", error);
        callback([]);
      });
      return () => {
        ref.off("value", handler);
        const index = listeners.medicine_reminders.indexOf(callback);
        if (index > -1) listeners.medicine_reminders.splice(index, 1);
      };
    }

    callback(getLocalMedicineReminders());
    return () => {
      const index = listeners.medicine_reminders.indexOf(callback);
      if (index > -1) listeners.medicine_reminders.splice(index, 1);
    };
  }

  async function getMedicineReminder(reminderId) {
    const safeId = assertMedicineReminderId(reminderId);
    if (useRealtime) {
      const data = await getRealtimeValue(`reminders/${safeId}`);
      return data?.type === "medicine" ? { ...data, id: safeId } : null;
    }
    return (
      getLocalMedicineReminders().find((reminder) => reminder.id === safeId) ||
      null
    );
  }

  async function createMedicineReminder(data) {
    const timestamp = realtimeServerTs();
    if (useRealtime) {
      const ref = db.ref("reminders").push();
      const reminderId = ref.key;
      const payload = {
        ...sanitizeMedicineReminderData(data),
        id: reminderId,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await ref.set(payload);
      return { ...payload, id: reminderId };
    }

    const reminderId = `medicine_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const payload = {
      ...sanitizeMedicineReminderData(data),
      id: reminderId,
      createdAt: serverTs(),
      updatedAt: serverTs(),
    };
    const reminders = readLocal("mock:reminders") || {};
    reminders[reminderId] = payload;
    writeLocal("mock:reminders", reminders);
    notifyLocalMedicineReminders();
    return payload;
  }

  async function updateMedicineReminder(reminderId, data) {
    const safeId = assertMedicineReminderId(reminderId);
    const existing = await getMedicineReminder(safeId);
    if (!existing) {
      throw new Error("Medicine reminder not found");
    }

    const payload = {
      ...sanitizeMedicineReminderData(data, existing),
      id: safeId,
      createdAt: existing.createdAt || realtimeServerTs(),
      updatedAt: realtimeServerTs(),
    };
    if (useRealtime) {
      await updateRealtimeValue(`reminders/${safeId}`, payload);
      return { ...existing, ...payload, id: safeId };
    }

    const reminders = readLocal("mock:reminders") || {};
    reminders[safeId] = {
      ...existing,
      ...payload,
      createdAt: existing.createdAt || serverTs(),
      updatedAt: serverTs(),
    };
    writeLocal("mock:reminders", reminders);
    notifyLocalMedicineReminders();
    return { ...reminders[safeId], id: safeId };
  }

  async function setMedicineReminderEnabled(reminderId, enabled) {
    return updateMedicineReminder(reminderId, { enabled: Boolean(enabled) });
  }

  async function deleteMedicineReminder(reminderId) {
    const safeId = assertMedicineReminderId(reminderId);
    if (useRealtime) {
      await db.ref(`reminders/${safeId}`).remove();
      return;
    }

    const reminders = readLocal("mock:reminders") || {};
    delete reminders[safeId];
    writeLocal("mock:reminders", reminders);
    notifyLocalMedicineReminders();
  }

  async function getPendingMedicineReminderState(reminder) {
    const commands = await listCommands();
    const target = reminder.targetDeviceId || "chami_001";
    const pending = commands.filter(
      (command) =>
        command?.target === target &&
        command?.action === "remind_medicine" &&
        command?.status === "pending",
    );
    if (pending.some((command) => command.reminderId === reminder.id)) {
      return "pending_same_reminder";
    }
    return pending.length > 0 ? "robot_busy" : null;
  }

  async function hasPendingMedicineReminderCommand(
    target = "chami_001",
    reminderId = "",
  ) {
    return Boolean(
      await getPendingMedicineReminderState({
        id: reminderId,
        targetDeviceId: target,
      }),
    );
  }

  async function createMedicineReminderCommand(reminder) {
    if (!reminder || typeof reminder !== "object") {
      throw new Error("Medicine reminder is required");
    }
    const reminderId = assertMedicineReminderId(reminder.id);
    const medicineName = String(reminder.medicineName || "").trim();
    if (!medicineName) {
      throw new Error("medicineName is required");
    }

    const pendingReason = await getPendingMedicineReminderState(reminder);
    if (pendingReason) {
      return { skipped: true, reason: pendingReason };
    }

    const payload = {
      source: "dashboard",
      target: reminder.targetDeviceId || "chami_001",
      type: "robot_action",
      action: "remind_medicine",
      reminderId,
      medicineName,
      text: `Đã đến giờ uống thuốc: ${medicineName}`,
      status: "pending",
      createdAt: realtimeServerTs(),
    };

    if (useRealtime) {
      const command = await pushRealtimeValue("commands", payload);
      return { skipped: false, command };
    }

    const commands = readLocal("mock:commands") || [];
    const command = {
      id: `cmd_${Date.now()}`,
      ...payload,
      createdAt: serverTs(),
    };
    commands.unshift(command);
    writeLocal("mock:commands", commands);
    notifyLocal("commands");
    return { skipped: false, command };
  }

  function listenMedicineReminder(callback, reminderId) {
    const safeId = assertMedicineReminderId(reminderId);
    return listenMedicineReminders((reminders) => {
      callback(
        reminders.find((reminder) => reminder.id === safeId) || null,
      );
    });
  }

  async function saveMedicineReminder(data, reminderId) {
    return updateMedicineReminder(reminderId, data);
  }

  function sanitizeRealtimeKey(value) {
    return String(value || "")
      .replace(/[.#$\[\]\/]/g, "_")
      .slice(0, 180);
  }

  async function createCareEvent(event, options = {}) {
    const payload = {
      flow: event.flow || "fall_response",
      flowId: event.flowId || "",
      source: event.source || "dashboard",
      type: event.type || "unknown",
      status: event.status || "warning",
      message: event.message || "",
      detail: event.detail || "",
      relatedCommandId: event.relatedCommandId || "",
      relatedAlertId: event.relatedAlertId || "",
      cameraId: event.cameraId || "default_cam",
      location: event.location || "living_room",
      createdAt: event.createdAt || realtimeServerTs(),
    };
    const requestedId = sanitizeRealtimeKey(options.eventId || event.id);

    if (useRealtime) {
      if (requestedId) {
        const ref = db.ref(`care_events/${requestedId}`);
        const data = { id: requestedId, ...payload };
        const result = await ref.transaction((current) => {
          if (current !== null) return;
          return data;
        });
        const stored = result.snapshot?.val() || data;
        return {
          event: { id: requestedId, ...stored },
          created: result.committed,
        };
      }

      const data = await pushRealtimeValue("care_events", payload);
      return { event: data, created: true };
    }

    const arr = JSON.parse(localStorage.getItem("mock:care_events") || "[]");
    const existing = requestedId
      ? arr.find((item) => item.id === requestedId)
      : payload.relatedAlertId
        ? arr.find((item) => item.relatedAlertId === payload.relatedAlertId)
        : null;

    if (existing) {
      return { event: existing, created: false };
    }

    const data = {
      id: requestedId || `care_event_${Date.now()}`,
      ...payload,
    };
    arr.unshift(data);
    localStorage.setItem("mock:care_events", JSON.stringify(arr));
    notifyLocal("care_events");
    return { event: data, created: true };
  }

  async function createAlert(alert) {
    const payload = {
      type: alert.type || "unknown_alert",
      level: alert.level || "warning",
      message: alert.message || "",
      status: alert.status || "open",
      source: alert.source || "web_dashboard",
      lineStatus: alert.lineStatus || "sent",
      createdAt: alert.createdAt || serverTs(),
    };
    ["medicineName", "reminderId", "attempt", "attempts", "receivedAt"].forEach(
      (field) => {
        if (alert[field] !== undefined) payload[field] = alert[field];
      },
    );

    if (useRealtime) {
      await pushRealtimeValue("alerts", payload);
      return;
    }

    const arr = JSON.parse(localStorage.getItem("mock:alerts") || "[]");
    arr.unshift({
      id: alert.id || "alert_" + Date.now(),
      ...payload,
    });

    localStorage.setItem("mock:alerts", JSON.stringify(arr));
    notifyLocal("alerts");
  }

  async function listAlerts() {
    if (useRealtime) {
      return sortByCreatedAtDesc(
        objectToArray(await getRealtimeValue("alerts")),
      );
    }

    return JSON.parse(localStorage.getItem("mock:alerts") || "[]");
  }

  async function listCareLogs() {
    if (useRealtime) {
      return sortByCreatedAtDesc(
        objectToArray(await getRealtimeValue("care_logs")),
      );
    }

    return JSON.parse(localStorage.getItem("mock:care_logs") || "[]");
  }

  async function listCareEvents() {
    if (useRealtime) {
      return sortByCreatedAtDesc(
        objectToArray(await getRealtimeValue("care_events")),
      );
    }

    return JSON.parse(localStorage.getItem("mock:care_events") || "[]");
  }

  // ---------- Seed data ----------
  async function seedRealtimeData() {
    try {
      const robot = await getRealtimeValue("robots/chami01");
      if (!robot) {
        await setRealtimeValue("robots/chami01", {
          id: "chami01",
          name: "Chami",
          status: "online",
          battery: 87,
          lastActive: serverTs(),
          emotion: "normal",
          firmware: "xiaozhi-based",
        });
      }

      const devices = await getRealtimeValue("devices");
      if (!devices) {
        await setRealtimeValue("devices", {
          light01: {
            id: "light01",
            name: "Đèn phòng",
            type: "light",
            status: "off",
            room: "living_room",
            updatedAt: serverTs(),
          },
          fan01: {
            id: "fan01",
            name: "Quạt phòng",
            type: "fan",
            status: "off",
            room: "bedroom",
            updatedAt: serverTs(),
          },
          ac01: {
            id: "ac01",
            name: "Điều hòa",
            type: "ac",
            status: "off",
            room: "living_room",
            updatedAt: serverTs(),
          },
        });
      }

      const alerts = await getRealtimeValue("alerts");
      if (!alerts) {
        await setRealtimeValue("alerts/alert1", {
          id: "alert1",
          type: "low_battery",
          level: "warning",
          message: "Pin robot còn 20% (demo)",
          status: "open",
          source: "robot_chami",
          lineStatus: "sent",
          createdAt: serverTs(),
        });
      }

      const careLogs = await getRealtimeValue("care_logs");
      if (!careLogs) {
        await setRealtimeValue("care_logs", {
          cl1: {
            id: "cl1",
            userId: "user01",
            type: "medicine",
            status: "done",
            message: "Đã uống thuốc buổi sáng",
            source: "demo",
            createdAt: serverTs(),
          },
          cl2: {
            id: "cl2",
            userId: "user01",
            type: "meal",
            status: "done",
            message: "Đã ăn sáng",
            source: "demo",
            createdAt: serverTs(),
          },
        });
      }

      const commands = await getRealtimeValue("commands");
      if (!commands) {
        await setRealtimeValue("commands", {
          cmd1: {
            id: "cmd1",
            targetType: "device",
            targetId: "light01",
            command: "turn_on",
            status: "pending",
            source: "demo",
            createdAt: serverTs(),
          },
          cmd2: {
            id: "cmd2",
            targetType: "device",
            targetId: "fan01",
            command: "turn_off",
            status: "completed",
            source: "demo",
            createdAt: serverTs(),
            updatedAt: serverTs(),
          },
        });
      }

      console.log("FirebaseService: Realtime Database seed checked");
    } catch (e) {
      console.warn("Realtime seed failed", e);
    }
  }

  function seedMockData() {
    if (useRealtime) return;

    if (!localStorage.getItem("mock:devices")) {
      writeLocal("mock:devices", [
        {
          id: "light01",
          name: "Đèn phòng",
          type: "light",
          status: "off",
          room: "living_room",
          updatedAt: serverTs(),
        },
        {
          id: "fan01",
          name: "Quạt phòng",
          type: "fan",
          status: "off",
          room: "bedroom",
          updatedAt: serverTs(),
        },
        {
          id: "ac01",
          name: "Điều hòa",
          type: "ac",
          status: "off",
          room: "living_room",
          updatedAt: serverTs(),
        },
      ]);
    }

    if (!localStorage.getItem("mock:alerts")) {
      writeLocal("mock:alerts", [
        {
          id: "alert1",
          type: "low_battery",
          level: "warning",
          message: "Pin robot còn 20% (demo)",
          status: "open",
          createdAt: serverTs(),
          source: "robot_chami",
          lineStatus: "sent",
        },
      ]);
    }

    if (!localStorage.getItem("mock:care_logs")) {
      writeLocal("mock:care_logs", [
        {
          id: "cl1",
          userId: "user01",
          type: "medicine",
          status: "done",
          message: "Đã uống thuốc buổi sáng",
          createdAt: serverTs(),
          source: "demo",
        },
        {
          id: "cl2",
          userId: "user01",
          type: "meal",
          status: "done",
          message: "Đã ăn sáng",
          createdAt: serverTs(),
          source: "demo",
        },
      ]);
    }

    if (!localStorage.getItem("mock:commands")) {
      writeLocal("mock:commands", [
        {
          id: "cmd1",
          targetType: "device",
          targetId: "light01",
          command: "turn_on",
          status: "pending",
          createdAt: serverTs(),
          source: "demo",
        },
        {
          id: "cmd2",
          targetType: "device",
          targetId: "fan01",
          command: "turn_off",
          status: "completed",
          createdAt: serverTs(),
          updatedAt: serverTs(),
          source: "demo",
        },
      ]);
    }

    if (!localStorage.getItem("mock:caregiver_notifications")) {
      writeLocal("mock:caregiver_notifications", []);
    }

    if (!localStorage.getItem("mock:health_concerns")) {
      writeLocal("mock:health_concerns", []);
    }

    if (!localStorage.getItem("mock:robots:chami01")) {
      writeLocal("mock:robots:chami01", {
        id: "chami01",
        name: "Chami",
        status: "online",
        battery: 87,
        lastActive: serverTs(),
        emotion: "normal",
        firmware: "xiaozhi-based",
      });
    }
  }

  try {
    if (window) init();
  } catch (e) {
    console.warn("FirebaseService init error", e);
  }

  return {
    init,
    useRealtime: () => useRealtime,
    subscribeToRobots,
    subscribeToDevices,
    subscribeToAlerts,
    subscribeToCareLogs,
    listenMedicineCareLogs,
    listenCaregiverNotifications,
    listenHealthConcerns,
    subscribeToCareEvents,
    subscribeToCommands,
    listenMedicineReminder,
    listenMedicineReminders,
    getRobot,
    setRobot,
    listDevices,
    listCommands,
    listMedicineReminders,
    getMedicineReminder,
    saveMedicineReminder,
    createMedicineReminder,
    updateMedicineReminder,
    setMedicineReminderEnabled,
    deleteMedicineReminder,
    hasPendingMedicineReminderCommand,
    updateCommandStatus,
    createCommand,
    createDeviceControlCommand,
    createRobotActionCommand,
    createMedicineReminderCommand,
    createSmartHomeCommand,
    createCareLog,
    createCareEvent,
    resolveHealthConcern,
    createAlert,
    listAlerts,
    listCareLogs,
    listCareEvents,
    normalizeTimestamp,
    seedMockData,
  };
})();
