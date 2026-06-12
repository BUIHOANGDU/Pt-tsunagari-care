/*
  Minimal firebase service wrapper + local fallback.
  If user provides `src/js/firebase-config.js` with `const firebaseConfig = {...}`
  and includes Firebase SDK in the page, this will initialize Firestore.
  Otherwise operations are performed against localStorage for demo.
*/

const FirebaseService = (function () {
  let useFirestore = false;
  let db = null;

  function init() {
    if (window.firebaseConfig && window.firebase && firebase.initializeApp) {
      try {
        firebase.initializeApp(window.firebaseConfig);
        db = firebase.firestore();
        useFirestore = true;
        console.log("Firebase initialized");
      } catch (e) {
        console.warn("Firebase init failed, using local demo", e);
        useFirestore = false;
      }
    } else {
      console.log("No firebase config detected — using local demo fallback");
      useFirestore = false;
    }
  }

  function serverTimestamp() {
    return new Date().toISOString();
  }

  // robots/chami01 get or create
  async function getRobot(id = "chami01") {
    if (useFirestore) {
      const doc = await db.collection("robots").doc(id).get();
      return doc.exists ? doc.data() : null;
    }
    const key = `mock:robots:${id}`;
    return JSON.parse(localStorage.getItem(key) || "null");
  }

  async function setRobot(id, data) {
    data.updatedAt = serverTimestamp();
    if (useFirestore) {
      await db.collection("robots").doc(id).set(data, { merge: true });
      return;
    }
    const key = `mock:robots:${id}`;
    localStorage.setItem(key, JSON.stringify(data));
  }

  async function listDevices() {
    if (useFirestore) {
      const snap = await db.collection("devices").get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    const raw = localStorage.getItem("mock:devices");
    return raw
      ? JSON.parse(raw)
      : [
          {
            id: "light01",
            name: "Đèn phòng",
            type: "light",
            status: "off",
            room: "living_room",
          },
        ];
  }

  async function createCommand(cmd) {
    cmd.createdAt = serverTimestamp();
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
    log.createdAt = serverTimestamp();
    log.source = log.source || "web_dashboard";
    if (useFirestore) {
      await db.collection("care_logs").add(log);
      return;
    }
    const arr = JSON.parse(localStorage.getItem("mock:care_logs") || "[]");
    arr.push(log);
    localStorage.setItem("mock:care_logs", JSON.stringify(arr));
  }

  async function createAlert(alert) {
    alert.createdAt = serverTimestamp();
    alert.status = alert.status || "open";
    if (useFirestore) {
      await db.collection("alerts").add(alert);
      return;
    }
    const arr = JSON.parse(localStorage.getItem("mock:alerts") || "[]");
    arr.push(alert);
    localStorage.setItem("mock:alerts", JSON.stringify(arr));
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

  return {
    init,
    getRobot,
    setRobot,
    listDevices,
    createCommand,
    createCareLog,
    createAlert,
    listAlerts,
  };
})();

// auto init
try {
  if (window) FirebaseService.init();
} catch (e) {}
