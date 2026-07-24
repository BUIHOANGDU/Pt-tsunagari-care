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
    commands: [],
    medicine_reminders: [],
  };

  const unsubscribes = {
    robots: null,
    devices: null,
    alerts: null,
    care_logs: null,
    care_events: null,
    commands: null,
    medicine_reminders: null,
  };
  const DEFAULT_MEDICINE_REMINDER_ID = "medicine_morning";
  const DEFAULT_MEDICINE_REMINDER = {
    type: "medicine",
    medicineName: "Thuốc huyết áp",
    time: "08:00",
    timezone: "Asia/Tokyo",
    repeat: "daily",
    enabled: true,
    targetDeviceId: "chami_001",
    lastTriggeredDate: null,
    lastTriggeredAt: null,
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
      commands: "mock:commands",
      medicine_reminders: "mock:reminders",
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

  function subscribeToCareEvents(cb) {
    return subscribeTo("care_events", cb);
  }

  function subscribeToCommands(cb) {
    return subscribeTo("commands", cb);
  }

  function listenMedicineReminder(
    callback,
    reminderId = DEFAULT_MEDICINE_REMINDER_ID,
  ) {
    listeners.medicine_reminders.push(callback);

    if (useRealtime) {
      const ref = db.ref(`reminders/${reminderId}`);
      const handler = (snapshot) => {
        const value = snapshot.val();
        callback(value ? { id: reminderId, ...value } : null);
      };

      ref.on("value", handler, (err) => {
        console.warn("Medicine reminder listener error", err);
        callback(null);
      });

      return () => {
        ref.off("value", handler);
        const idx = listeners.medicine_reminders.indexOf(callback);
        if (idx > -1) listeners.medicine_reminders.splice(idx, 1);
      };
    }

    callback(getLocalMedicineReminder(reminderId));

    return () => {
      const idx = listeners.medicine_reminders.indexOf(callback);
      if (idx > -1) listeners.medicine_reminders.splice(idx, 1);
    };
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

  function getLocalMedicineReminder(reminderId = DEFAULT_MEDICINE_REMINDER_ID) {
    const reminders = readLocal("mock:reminders") || {};
    const reminder = reminders[reminderId];
    return reminder ? { id: reminderId, ...reminder } : null;
  }

  function notifyLocalMedicineReminder(reminderId = DEFAULT_MEDICINE_REMINDER_ID) {
    const reminder = getLocalMedicineReminder(reminderId);
    listeners.medicine_reminders.forEach((cb) => cb(reminder));
  }

  function sanitizeMedicineReminderData(data = {}, existing = null) {
    const medicineName =
      typeof data.medicineName === "string" ? data.medicineName.trim() : "";
    const time = typeof data.time === "string" ? data.time.trim() : "";

    if (!medicineName) {
      throw new Error("medicineName is required");
    }

    if (!MEDICINE_TIME_RE.test(time)) {
      throw new Error("time must use HH:mm format");
    }

    const payload = {
      type: "medicine",
      medicineName,
      time,
      timezone:
        typeof data.timezone === "string" && data.timezone.trim()
          ? data.timezone.trim()
          : DEFAULT_MEDICINE_REMINDER.timezone,
      repeat: "daily",
      enabled:
        typeof data.enabled === "boolean"
          ? data.enabled
          : existing?.enabled ?? DEFAULT_MEDICINE_REMINDER.enabled,
      targetDeviceId:
        typeof data.targetDeviceId === "string" && data.targetDeviceId.trim()
          ? data.targetDeviceId.trim()
          : DEFAULT_MEDICINE_REMINDER.targetDeviceId,
      lastTriggeredDate:
        data.lastTriggeredDate ??
        existing?.lastTriggeredDate ??
        DEFAULT_MEDICINE_REMINDER.lastTriggeredDate,
      lastTriggeredAt:
        data.lastTriggeredAt ??
        existing?.lastTriggeredAt ??
        DEFAULT_MEDICINE_REMINDER.lastTriggeredAt,
      updatedAt: realtimeServerTs(),
    };

    if (existing?.createdAt) {
      payload.createdAt = existing.createdAt;
    } else {
      payload.createdAt = realtimeServerTs();
    }

    return Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined),
    );
  }

  async function getMedicineReminder(reminderId = DEFAULT_MEDICINE_REMINDER_ID) {
    if (useRealtime) {
      const data = await getRealtimeValue(`reminders/${reminderId}`);
      return data ? { id: reminderId, ...data } : null;
    }

    return getLocalMedicineReminder(reminderId);
  }

  async function saveMedicineReminder(
    data,
    reminderId = DEFAULT_MEDICINE_REMINDER_ID,
  ) {
    const existing = await getMedicineReminder(reminderId);
    const payload = sanitizeMedicineReminderData(data, existing);

    if (useRealtime) {
      await setRealtimeValue(`reminders/${reminderId}`, payload);
      return { id: reminderId, ...payload };
    }

    const reminders = readLocal("mock:reminders") || {};
    reminders[reminderId] = {
      ...(existing || {}),
      ...payload,
      createdAt: existing?.createdAt || serverTs(),
      updatedAt: serverTs(),
    };
    delete reminders[reminderId].id;
    writeLocal("mock:reminders", reminders);
    notifyLocalMedicineReminder(reminderId);
    return { id: reminderId, ...reminders[reminderId] };
  }

  async function setMedicineReminderEnabled(
    enabled,
    reminderId = DEFAULT_MEDICINE_REMINDER_ID,
  ) {
    const existing = await getMedicineReminder(reminderId);
    const base = existing || DEFAULT_MEDICINE_REMINDER;
    return saveMedicineReminder({ ...base, enabled: Boolean(enabled) }, reminderId);
  }

  async function hasPendingMedicineReminderCommand(target = "chami_001") {
    const commands = await listCommands();
    return commands.some(
      (command) =>
        command?.target === target &&
        command?.action === "remind_medicine" &&
        (command?.status || "pending") === "pending",
    );
  }

  async function createMedicineReminderCommand(options = {}) {
    const target = options.targetDeviceId || options.target || "chami_001";

    if (await hasPendingMedicineReminderCommand(target)) {
      console.log("Medicine reminder command already pending for Chami");
      return { skipped: true, reason: "pending_command" };
    }

    const medicineName =
      typeof options.medicineName === "string" && options.medicineName.trim()
        ? options.medicineName.trim()
        : DEFAULT_MEDICINE_REMINDER.medicineName;
    const text =
      options.text || `Đã đến giờ uống thuốc: ${medicineName}`;

    const command = await createRobotActionCommand(
      target,
      "remind_medicine",
      text,
      {
        source: options.source || "dashboard",
        status: "pending",
        createdAt: options.createdAt || realtimeServerTs(),
      },
    );

    return { skipped: false, command };
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
    subscribeToCareEvents,
    subscribeToCommands,
    listenMedicineReminder,
    getRobot,
    setRobot,
    listDevices,
    listCommands,
    getMedicineReminder,
    saveMedicineReminder,
    setMedicineReminderEnabled,
    hasPendingMedicineReminderCommand,
    updateCommandStatus,
    createCommand,
    createDeviceControlCommand,
    createRobotActionCommand,
    createMedicineReminderCommand,
    createSmartHomeCommand,
    createCareLog,
    createCareEvent,
    createAlert,
    listAlerts,
    listCareLogs,
    listCareEvents,
    normalizeTimestamp,
    seedMockData,
  };
})();
