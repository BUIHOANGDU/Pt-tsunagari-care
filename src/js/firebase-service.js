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
    commands: [],
  };

  const unsubscribes = {
    robots: null,
    devices: null,
    alerts: null,
    care_logs: null,
    commands: null,
  };

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
      const ta = new Date(a.createdAt || a.updatedAt || 0).getTime();
      const tb = new Date(b.createdAt || b.updatedAt || 0).getTime();
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
      commands: "mock:commands",
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
          collection === "commands"
        ) {
          data = sortByCreatedAtDesc(data);
        }

        listeners[collection].forEach((fn) => fn(data));
      };

      ref.on("value", handler, (err) => {
        console.warn("Realtime Database listener error", err);
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
    const payload = {
      userId: log.userId || "user01",
      type: log.type || "unknown",
      status: log.status || "done",
      message: log.message || "",
      source: log.source || "web_dashboard",
      createdAt: log.createdAt || serverTs(),
    };

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
    subscribeToCommands,
    getRobot,
    setRobot,
    listDevices,
    listCommands,
    updateCommandStatus,
    createCommand,
    createDeviceControlCommand,
    createSmartHomeCommand,
    createCareLog,
    createAlert,
    listAlerts,
    listCareLogs,
    seedMockData,
  };
})();
