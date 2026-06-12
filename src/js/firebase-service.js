/*
  FirebaseService
  - If `src/js/firebase-config.js` exists and Firebase SDK loaded, uses Firestore realtime
    listeners (onSnapshot) for robots, devices, alerts, care_logs.
  - Otherwise falls back to localStorage-based mock data and notifies local listeners.
  - Exposes subscribe/unsubscribe helpers and CRUD helpers used by dashboard/demo.
*/

const FirebaseService = (function () {
  let useFirestore = false;
  let db = null;
  const listeners = { robots: [], devices: [], alerts: [], care_logs: [] };
  const unsubscribes = {
    robots: null,
    devices: null,
    alerts: null,
    care_logs: null,
  };

  function init() {
    try {
      if (window.firebaseConfig && window.firebase) {
        if (!firebase.apps || !firebase.apps.length)
          firebase.initializeApp(window.firebaseConfig);
        db = firebase.firestore();
        useFirestore = true;
        console.log("FirebaseService: using Firestore realtime");
      } else {
        console.log("FirebaseService: using local demo (no firebase config)");
        useFirestore = false;
      }
    } catch (e) {
      console.warn("FirebaseService init failed, fallback to local", e);
      useFirestore = false;
    }
    seedMockData();
  }

  function serverTs() {
    return new Date().toISOString();
  }

  // ---------- Local helpers ----------
  function readLocal(key) {
    return JSON.parse(localStorage.getItem(key) || "null");
  }
  function writeLocal(key, v) {
    localStorage.setItem(key, JSON.stringify(v));
  }

  function listLocalRobots() {
    const out = [];
    for (const k in localStorage) {
      if (k.startsWith("mock:robots:")) {
        try {
          out.push(JSON.parse(localStorage.getItem(k)));
        } catch (e) {}
      }
    }
    return out;
  }

  function notifyLocal(kind) {
    if (kind === "robots") {
      const data = listLocalRobots();
      listeners.robots.forEach((cb) => cb(data));
    } else if (kind === "devices") {
      const d = JSON.parse(localStorage.getItem("mock:devices") || "[]");
      listeners.devices.forEach((cb) => cb(d));
    } else if (kind === "alerts") {
      const a = JSON.parse(localStorage.getItem("mock:alerts") || "[]");
      listeners.alerts.forEach((cb) => cb(a));
    } else if (kind === "care_logs") {
      const c = JSON.parse(localStorage.getItem("mock:care_logs") || "[]");
      listeners.care_logs.forEach((cb) => cb(c));
    }
  }

  // ---------- Public API: subscribe/unsubscribe ----------
  function subscribeTo(collection, cb) {
    if (!listeners[collection])
      throw new Error("Unknown collection " + collection);
    listeners[collection].push(cb);

    // attach firestore listener if available and not yet attached
    if (useFirestore && !unsubscribes[collection]) {
      const col = collection === "care_logs" ? "care_logs" : collection;
      unsubscribes[collection] = db
        .collection(col)
        .orderBy("createdAt", "desc")
        .onSnapshot(
          (snap) => {
            const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            listeners[collection].forEach((fn) => fn(arr));
          },
          (err) => {
            console.warn("Firestore onSnapshot error", err);
          },
        );
    }

    // if local fallback, immediately notify with current data
    if (!useFirestore) notifyLocal(collection);

    // return unsubscribe function for this callback
    return () => {
      const idx = listeners[collection].indexOf(cb);
      if (idx > -1) listeners[collection].splice(idx, 1);
      // if no callbacks left, detach firestore listener
      if (
        useFirestore &&
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

  // ---------- CRUD helpers ----------
  async function getRobot(id = "chami01") {
    if (useFirestore) {
      const doc = await db.collection("robots").doc(id).get();
      return doc.exists ? { id: doc.id, ...doc.data() } : null;
    }
    return JSON.parse(localStorage.getItem("mock:robots:" + id) || "null");
  }

  async function setRobot(id, data) {
    data.updatedAt = serverTs();
    if (useFirestore) {
      await db.collection("robots").doc(id).set(data, { merge: true });
      return;
    }
    localStorage.setItem(
      "mock:robots:" + id,
      JSON.stringify(
        Object.assign({}, readLocal("mock:robots:" + id) || {}, data),
      ),
    );
    notifyLocal("robots");
  }

  async function listDevices() {
    if (useFirestore) {
      const snap = await db.collection("devices").get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    return JSON.parse(localStorage.getItem("mock:devices") || "[]");
  }

  async function createCommand(cmd) {
    cmd.createdAt = cmd.createdAt || serverTs();
    cmd.status = cmd.status || "pending";
    cmd.source = cmd.source || "web_dashboard";
    if (useFirestore) {
      await db.collection("commands").add(cmd);
      return;
    }
    const arr = JSON.parse(localStorage.getItem("mock:commands") || "[]");
    arr.push(cmd);
    localStorage.setItem("mock:commands", JSON.stringify(arr));
  }

  async function createCareLog(log) {
    log.createdAt = log.createdAt || serverTs();
    log.source = log.source || "web_dashboard";
    if (useFirestore) {
      await db.collection("care_logs").add(log);
      return;
    }
    const arr = JSON.parse(localStorage.getItem("mock:care_logs") || "[]");
    arr.unshift(log);
    localStorage.setItem("mock:care_logs", JSON.stringify(arr));
    notifyLocal("care_logs");
  }

  async function createAlert(alert) {
    alert.createdAt = alert.createdAt || serverTs();
    alert.status = alert.status || "open";
    alert.source = alert.source || "web_module";
    if (useFirestore) {
      await db.collection("alerts").add(alert);
      return;
    }
    const arr = JSON.parse(localStorage.getItem("mock:alerts") || "[]");
    arr.unshift(alert);
    localStorage.setItem("mock:alerts", JSON.stringify(arr));
    notifyLocal("alerts");
  }

  async function listAlerts() {
    if (useFirestore) {
      const snap = await db
        .collection("alerts")
        .orderBy("createdAt", "desc")
        .get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    return JSON.parse(localStorage.getItem("mock:alerts") || "[]");
  }
  async function listCareLogs() {
    if (useFirestore) {
      const snap = await db
        .collection("care_logs")
        .orderBy("createdAt", "desc")
        .limit(50)
        .get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    return JSON.parse(localStorage.getItem("mock:care_logs") || "[]");
  }

  // seed local demo dataset
  function seedMockData() {
    if (useFirestore) return;
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
      ]);
    }
    if (!localStorage.getItem("mock:alerts")) writeLocal("mock:alerts", []);
    if (!localStorage.getItem("mock:care_logs"))
      writeLocal("mock:care_logs", []);
    if (!localStorage.getItem("mock:commands")) writeLocal("mock:commands", []);
    if (!localStorage.getItem("mock:robots:chami01"))
      writeLocal("mock:robots:chami01", {
        id: "chami01",
        name: "Chami",
        status: "offline",
        battery: 88,
        lastActive: serverTs(),
        emotion: "normal",
        firmware: "xiaozhi-based",
      });
  }

  // init auto
  try {
    if (window) init();
  } catch (e) {
    console.warn("FirebaseService init error", e);
  }

  return {
    init,
    useFirestore: () => useFirestore,
    // subscribe
    subscribeToRobots,
    subscribeToDevices,
    subscribeToAlerts,
    subscribeToCareLogs,
    // CRUD
    getRobot,
    setRobot,
    listDevices,
    createCommand,
    createCareLog,
    createAlert,
    listAlerts,
    listCareLogs,
    seedMockData,
  };

  // helper export bindings (hoist)
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
})();
