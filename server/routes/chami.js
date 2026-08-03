const express = require("express");
const crypto = require("crypto");

const deviceAuth = require("../middleware/deviceAuth");
const { getDb, getServerTimestamp } = require("../firebaseAdmin");
const {
  notifyCaregiversForEvent,
  notifyCaregiversForEventAsync,
} = require("../lib/caregiverNotificationService");
const { schedulePruneCollections } = require("../lib/rtdbRetentionService");

const router = express.Router();
const MEDICINE_EVENT_TYPES = new Set([
  "medicine_taken",
  "medicine_no_response",
]);
const HEALTH_CONCERN_TYPE = "health_concern";
const SAFE_REMINDER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const SAFE_EVENT_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_MEDICINE_NAME_LENGTH = 100;
const MAX_MESSAGE_LENGTH = 300;
const MAX_HEALTH_TRANSCRIPT_LENGTH = 160;
const ALERT_LEVELS = new Set([
  "info",
  "success",
  "normal",
  "warning",
  "danger",
  "emergency",
]);
const LEGACY_ALERT_STATUSES = new Set([
  "new",
  "open",
  "acknowledged",
  "resolved",
]);
const HEALTH_STATUSES = new Set(["detected"]);
const HEALTH_LEVELS = new Set(["info", "warning", "danger"]);
const HEALTH_CATEGORIES = new Set(["health"]);
const HEALTH_LANGUAGES = new Set(["ja", "vi", "unknown"]);
const HEALTH_SYMPTOMS = new Set([
  "fatigue",
  "headache",
  "dizziness",
  "breathing",
  "chest_pain",
  "abdominal_pain",
  "nausea",
  "sleep_problem",
  "heart",
  "weakness_or_numbness",
  "fever",
  "fainting",
  "pain_general",
  "direct_help",
]);
const HISTORY_RETENTION_PATHS = [
  "alerts",
  "health_concerns",
  "care_logs",
  "care_events",
  "caregiver_notifications",
];

function scheduleHistoryPrune(db, paths) {
  schedulePruneCollections({
    db,
    paths,
  });
}

function cleanString(value, maxLength, fallback = "") {
  if (typeof value !== "string") return fallback;
  const cleaned = value.trim();
  if (!cleaned) return fallback;
  return cleaned.slice(0, maxLength);
}

function normalizeChoice(value, allowed, fallback) {
  const cleaned = cleanString(value, 32);
  return allowed.has(cleaned) ? cleaned : fallback;
}

function readBooleanEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).trim().toLowerCase() === "true";
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function rejectNestedHealthPayload(body) {
  if (!isPlainObject(body)) {
    throw new Error("payload must be an object");
  }
  for (const [key, value] of Object.entries(body)) {
    if (value && typeof value === "object") {
      throw new Error(`${key} must not be an object`);
    }
  }
}

function requireHealthString(body, field, maxLength) {
  if (typeof body[field] !== "string") {
    throw new Error(`${field} is required`);
  }
  const cleaned = body[field].trim();
  if (!cleaned) {
    throw new Error(`${field} is required`);
  }
  if (cleaned.length > maxLength) {
    throw new Error(`${field} is too long`);
  }
  return cleaned;
}

function sha256RealtimeKey(value) {
  return crypto
    .createHash("sha256")
    .update(String(value || ""))
    .digest("hex");
}

function isSafeRealtimeId(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    !/[.#$/[\]]/.test(value)
  );
}

function isHealthConcernLineEnabled() {
  return readBooleanEnv("HEALTH_CONCERN_LINE_ENABLED", true);
}

function parseEventTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }

  if (typeof value === "string" && value.trim()) {
    const text = value.trim();
    const parsed = /^\d+$/.test(text) ? Number(text) : Date.parse(text);
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
  }

  if (value && typeof value === "object") {
    const seconds = Number(value.seconds ?? value._seconds);
    const nanoseconds = Number(value.nanoseconds ?? value._nanoseconds ?? 0);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.trunc(seconds * 1000 + nanoseconds / 1000000);
    }
  }

  return null;
}

function readBoundedInteger(value, field, { required = false, fallback = null } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new Error(`${field} is required`);
    return fallback;
  }

  if (!Number.isInteger(value) || value < 1 || value > 3) {
    throw new Error(`${field} must be an integer from 1 to 3`);
  }
  return value;
}

async function resolveMedicineName(db, reminderId, suppliedName) {
  if (
    suppliedName !== undefined &&
    suppliedName !== null &&
    typeof suppliedName !== "string"
  ) {
    throw new Error("medicineName must be a string");
  }
  const cleaned = cleanString(suppliedName, MAX_MEDICINE_NAME_LENGTH);
  if (cleaned) return cleaned;
  if (!reminderId) return "Thuốc";

  try {
    const snapshot = await db
      .ref(`reminders/${reminderId}/medicineName`)
      .once("value");
    return cleanString(snapshot.val(), MAX_MEDICINE_NAME_LENGTH, "Thuốc");
  } catch (error) {
    console.warn(`[MedicineFollowup] reminder lookup failed: ${error.message}`);
    return "Thuốc";
  }
}

function buildMedicineDedupeKey(
  event,
  eventId,
  timestampWasSupplied,
  dedupeCreatedAt,
) {
  if (eventId) return `event_${eventId}`;

  const timestampPart = timestampWasSupplied
    ? String(dedupeCreatedAt)
    : `received-day-${new Date(dedupeCreatedAt).toISOString().slice(0, 10)}`;
  const raw = [
    event.type,
    event.source,
    event.reminderId,
    event.attempt ?? event.attempts ?? "",
    timestampPart,
  ].join("|");
  return `hash_${crypto.createHash("sha256").update(raw).digest("hex")}`;
}

function buildAlertDedupeKey(event, eventId, timestampWasSupplied, dedupeCreatedAt) {
  if (eventId) return `event_${eventId}`;

  const timestampPart = timestampWasSupplied
    ? String(dedupeCreatedAt)
    : `received-window-${Math.floor(dedupeCreatedAt / 30000)}`;
  const raw = [
    event.type,
    event.source,
    event.status,
    event.level,
    event.message,
    timestampPart,
  ].join("|");
  return `hash_${crypto.createHash("sha256").update(raw).digest("hex")}`;
}

async function normalizeMedicineEvent(body, db) {
  const type = body?.type;
  if (!MEDICINE_EVENT_TYPES.has(type)) {
    throw new Error("Unsupported medication event type");
  }

  if (
    body.reminderId !== undefined &&
    body.reminderId !== null &&
    typeof body.reminderId !== "string"
  ) {
    throw new Error("reminderId must be a string");
  }
  const reminderId =
    typeof body.reminderId === "string" && body.reminderId.trim()
      ? body.reminderId.trim()
      : null;
  if (reminderId && !SAFE_REMINDER_ID_RE.test(reminderId)) {
    throw new Error("Invalid reminderId");
  }

  const eventId =
    typeof body.eventId === "string" ? body.eventId.trim() : "";
  if (
    body.eventId !== undefined &&
    body.eventId !== null &&
    typeof body.eventId !== "string"
  ) {
    throw new Error("eventId must be a string");
  }
  if (eventId && !SAFE_EVENT_ID_RE.test(eventId)) {
    throw new Error("Invalid eventId");
  }

  const parsedCreatedAt = parseEventTimestamp(body.createdAt);
  if (
    body.createdAt !== undefined &&
    body.createdAt !== null &&
    parsedCreatedAt === null
  ) {
    throw new Error("Invalid createdAt");
  }

  const source = cleanString(body.source, 64, "chami_001");
  const dedupeCreatedAt = parsedCreatedAt ?? Date.now();
  const createdAtMs = Date.now();
  const createdAt = parsedCreatedAt ?? getServerTimestamp();
  const medicineName = await resolveMedicineName(
    db,
    reminderId,
    body.medicineName,
  );
  const reminderFields = reminderId ? { reminderId } : {};

  if (type === "medicine_taken") {
    const attempt = readBoundedInteger(body.attempt, "attempt", {
      required: true,
    });
    return {
      event: {
        type,
        category: "medicine",
        source,
        status: "confirmed",
        level: normalizeChoice(body.level, ALERT_LEVELS, "info"),
        medicineName,
        ...reminderFields,
        attempt,
        message: cleanString(
          body.message,
          MAX_MESSAGE_LENGTH,
          "Người dùng đã xác nhận uống thuốc",
        ),
        createdAt,
        createdAtMs,
      },
      eventId,
      timestampWasSupplied: parsedCreatedAt !== null,
      dedupeCreatedAt,
    };
  }

  const attempts = readBoundedInteger(body.attempts, "attempts", {
    fallback: 3,
  });
  return {
    event: {
      type,
      category: "medicine",
      source,
      status: "no_response",
      level: normalizeChoice(body.level, ALERT_LEVELS, "warning"),
      medicineName,
      ...reminderFields,
      attempts,
      message: cleanString(
        body.message,
        MAX_MESSAGE_LENGTH,
        "Không có phản hồi sau 3 lần nhắc uống thuốc",
      ),
      createdAt,
      createdAtMs,
    },
    eventId,
    timestampWasSupplied: parsedCreatedAt !== null,
    dedupeCreatedAt,
  };
}

function normalizeHealthConcern(body) {
  rejectNestedHealthPayload(body);

  const type = requireHealthString(body, "type", 64);
  if (type !== HEALTH_CONCERN_TYPE) {
    throw new Error("type must be health_concern");
  }

  const status = requireHealthString(body, "status", 32);
  if (!HEALTH_STATUSES.has(status)) {
    throw new Error("invalid status");
  }

  const level = requireHealthString(body, "level", 32);
  if (!HEALTH_LEVELS.has(level)) {
    throw new Error("invalid level");
  }

  const category = requireHealthString(body, "category", 32);
  if (!HEALTH_CATEGORIES.has(category)) {
    throw new Error("invalid category");
  }

  const symptom = requireHealthString(body, "symptom", 64);
  if (!HEALTH_SYMPTOMS.has(symptom)) {
    throw new Error("invalid symptom");
  }

  const language = requireHealthString(body, "language", 16);
  if (!HEALTH_LANGUAGES.has(language)) {
    throw new Error("invalid language");
  }

  const eventId = requireHealthString(body, "eventId", 128);

  const message = requireHealthString(body, "message", MAX_MESSAGE_LENGTH);
  const deviceId = cleanString(
    body.deviceId,
    64,
    cleanString(body.source, 64, "chami_001"),
  );
  const event = {
    eventId,
    deviceId,
    type,
    status,
    level,
    category,
    symptom,
    message,
    language,
    confidence: 0,
  };

  if (body.confidence !== undefined && body.confidence !== null) {
    if (
      typeof body.confidence !== "number" ||
      !Number.isFinite(body.confidence) ||
      body.confidence < 0 ||
      body.confidence > 1
    ) {
      throw new Error("confidence must be a number from 0 to 1");
    }
    event.confidence = body.confidence;
  }

  if (body.transcript !== undefined && body.transcript !== null) {
    if (typeof body.transcript !== "string") {
      throw new Error("transcript must be a string");
    }
    const transcript = body.transcript.trim();
    if (transcript.length > MAX_HEALTH_TRANSCRIPT_LENGTH) {
      throw new Error("transcript is too long");
    }
    if (readBooleanEnv("HEALTH_CONCERN_STORE_TRANSCRIPT", false) && transcript) {
      event.transcript = transcript;
    }
  }

  return event;
}

async function writeHealthConcern(req, res) {
  let event;
  try {
    event = normalizeHealthConcern(req.body || {});
  } catch (error) {
    console.warn(`[HealthConcern] validation failed: ${error.message}`);
    return res.status(400).json({
      ok: false,
      error: "invalid_health_concern",
      details: error.message,
    });
  }

  const db = getDb();
  const dedupeKey = sha256RealtimeKey(event.eventId);
  const dedupeRef = db.ref(`health_concern_dedup/${dedupeKey}`);
  let lockResult;

  try {
    lockResult = await dedupeRef.transaction((current) => {
      if (current) return;
      return {
        eventId: event.eventId,
        type: event.type,
        deviceId: event.deviceId,
        level: event.level,
        symptom: event.symptom,
        createdAt: getServerTimestamp(),
      };
    });

    if (!lockResult.committed) {
      console.log(`[HealthConcern] duplicate eventId=${event.eventId}`);
      return res.json({
        ok: true,
        duplicate: true,
        eventId: event.eventId,
      });
    }

    const alertRef = db.ref("alerts").push();
    const healthConcernRef = db.ref("health_concerns").push();
    const createdAtMs = Date.now();
    const now = getServerTimestamp();
    const healthConcern = {
      id: healthConcernRef.key,
      ...event,
      createdAt: now,
      createdAtMs,
      receivedAt: now,
      resolved: false,
      source: "robot_conversation",
    };
    const alert = {
      id: alertRef.key,
      source: event.deviceId,
      type: event.type,
      level: event.level,
      message: event.message,
      status: "new",
      category: event.category,
      symptom: event.symptom,
      language: event.language,
      eventId: event.eventId,
      healthConcernId: healthConcernRef.key,
      createdAt: now,
      createdAtMs,
      receivedAt: now,
    };

    await db.ref().update({
      [`alerts/${alertRef.key}`]: alert,
      [`health_concerns/${healthConcernRef.key}`]: healthConcern,
    });
    scheduleHistoryPrune(db, HISTORY_RETENTION_PATHS);

    let lineNotification = {
      eligible: false,
      status: "not_required",
    };

    if (event.level === "danger" && event.status === "detected") {
      if (!isHealthConcernLineEnabled()) {
        lineNotification = {
          eligible: true,
          status: "skipped",
          reason: "health_concern_line_disabled",
        };
      } else {
        try {
          const notificationResult = await notifyCaregiversForEvent({
            ...event,
            id: healthConcernRef.key,
            source: event.deviceId,
            healthConcernId: healthConcernRef.key,
            alertId: alertRef.key,
            createdAt: Date.now(),
            receivedAt: Date.now(),
          }, { db });
          const rawNotificationStatus = notificationResult.status || "failed";
          lineNotification = {
            eligible: true,
            status:
              rawNotificationStatus === "sent" ||
              rawNotificationStatus === "skipped"
                ? rawNotificationStatus
                : rawNotificationStatus === "partial"
                  ? "sent"
                  : "failed",
            notificationId: notificationResult.notificationId || null,
          };
        } catch (notificationError) {
          console.error(
            `[HealthConcern] caregiver notification failed: ${notificationError.message}`,
          );
          lineNotification = {
            eligible: true,
            status: "failed",
          };
        }
      }
    }

    console.log(
      `[HealthConcern] stored id=${healthConcernRef.key} level=${event.level} eventId=${event.eventId}`,
    );
    return res.json({
      ok: true,
      duplicate: false,
      alertId: alertRef.key,
      healthConcernId: healthConcernRef.key,
      eventId: event.eventId,
      level: event.level,
      message: "Chami alert created",
      lineNotification,
    });
  } catch (error) {
    if (lockResult?.committed) {
      try {
        await dedupeRef.remove();
      } catch (rollbackError) {
        console.error(`[HealthConcern] dedupe rollback failed: ${rollbackError.message}`);
      }
    }
    console.error(`[HealthConcern] write failed: ${error.message}`);
    return res.status(500).json({
      ok: false,
      error: "health_concern_write_failed",
    });
  }
}

async function resolveHealthConcern(req, res) {
  const healthConcernId = cleanString(req.params.healthConcernId, 128);

  if (!isSafeRealtimeId(healthConcernId)) {
    return res.status(400).json({
      ok: false,
      error: "invalid_health_concern_id",
    });
  }

  try {
    const now = getServerTimestamp();
    await getDb().ref(`health_concerns/${healthConcernId}`).update({
      resolved: true,
      resolvedAt: now,
      resolvedBy: "dashboard",
      updatedAt: now,
    });

    return res.json({
      ok: true,
      healthConcernId,
    });
  } catch (error) {
    console.error(`[HealthConcern] resolve failed: ${error.message}`);
    return res.status(500).json({
      ok: false,
      error: "health_concern_resolve_failed",
    });
  }
}

async function writeMedicineFollowup(req, res) {
  const body = req.body || {};
  const source = cleanString(body.source, 64, "chami_001");
  console.log(`[MedicineFollowup] received type=${body.type || ""} source=${source}`);

  const db = getDb();
  let normalized;
  try {
    normalized = await normalizeMedicineEvent(body, db);
  } catch (error) {
    console.warn(`[MedicineFollowup] validation failed: ${error.message}`);
    return res.status(400).json({ ok: false, error: error.message });
  }

  const { event, eventId, timestampWasSupplied, dedupeCreatedAt } = normalized;
  console.log(`[MedicineFollowup] validated type=${event.type}`);
  const dedupeKey = buildMedicineDedupeKey(
    event,
    eventId,
    timestampWasSupplied,
    dedupeCreatedAt,
  );
  const dedupeRef = db.ref(`care_event_dedup/${dedupeKey}`);
  let lockResult;

  try {
    lockResult = await dedupeRef.transaction((current) => {
      if (current) return;
      return {
        type: event.type,
        source: event.source,
        ...(event.reminderId ? { reminderId: event.reminderId } : {}),
        createdAt: getServerTimestamp(),
      };
    });

    if (!lockResult.committed) {
      console.log(`[MedicineFollowup] duplicate event key=${dedupeKey}`);
      return res.json({ ok: true, duplicate: true });
    }

    const alertRef = db.ref("alerts").push();
    const careLogRef = db.ref("care_logs").push();
    const createdAtMs = Date.now();
    const receivedAt = getServerTimestamp();
    const alert = {
      id: alertRef.key,
      ...event,
      createdAtMs,
      receivedAt,
    };
    delete alert.category;
    const careLog = {
      id: careLogRef.key,
      ...event,
      createdAtMs,
      receivedAt,
    };

    await db.ref().update({
      [`alerts/${alertRef.key}`]: alert,
      [`care_logs/${careLogRef.key}`]: careLog,
    });
    scheduleHistoryPrune(db, HISTORY_RETENTION_PATHS);

    console.log(`[MedicineFollowup] alert created id=${alertRef.key}`);
    console.log(`[MedicineFollowup] care log created id=${careLogRef.key}`);
    notifyCaregiversForEventAsync({
      ...event,
      id: careLogRef.key,
      eventId: eventId || dedupeKey,
      dedupeKey,
      alertId: alertRef.key,
      careLogId: careLogRef.key,
      receivedAt: Date.now(),
    });
    return res.json({
      ok: true,
      duplicate: false,
      alertId: alertRef.key,
      careLogId: careLogRef.key,
    });
  } catch (error) {
    if (lockResult?.committed) {
      try {
        await dedupeRef.remove();
      } catch (rollbackError) {
        console.error(
          `[MedicineFollowup] dedupe rollback failed: ${rollbackError.message}`,
        );
      }
    }
    console.error(`[MedicineFollowup] write failed: ${error.message}`);
    return res.status(500).json({ ok: false, error: "Medication event write failed" });
  }
}

router.post("/state", deviceAuth, async (req, res) => {
  const {
    deviceId,
    name,
    online = true,
    state,
    emotion,
    battery = null,
  } = req.body || {};

  if (!deviceId) {
    return res.status(400).json({
      ok: false,
      error: "Missing deviceId",
    });
  }

  try {
    await getDb().ref(`devices/${deviceId}`).set({
      id: deviceId,
      name: name || "Chami Robot",
      type: "ai_robot",
      online,
      state: state || "unknown",
      emotion: emotion || "unknown",
      battery,
      lastSeen: getServerTimestamp(),
      updatedAt: getServerTimestamp(),
    });

    return res.json({
      ok: true,
      deviceId,
      message: "Chami state updated",
    });
  } catch (error) {
    console.error("Chami state update failed:", error);

    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

router.post("/alert", deviceAuth, async (req, res) => {
  if (MEDICINE_EVENT_TYPES.has(req.body?.type)) {
    return writeMedicineFollowup(req, res);
  }
  if (req.body?.type === HEALTH_CONCERN_TYPE) {
    return writeHealthConcern(req, res);
  }

  const {
    source,
    type,
    level,
    message,
    status,
    eventId: rawEventId,
    createdAt: rawCreatedAt,
  } = req.body || {};

  try {
    if (
      rawEventId !== undefined &&
      rawEventId !== null &&
      typeof rawEventId !== "string"
    ) {
      return res.status(400).json({ ok: false, error: "eventId must be a string" });
    }
    const eventId = typeof rawEventId === "string" ? rawEventId.trim() : "";
    if (eventId && !SAFE_EVENT_ID_RE.test(eventId)) {
      return res.status(400).json({ ok: false, error: "Invalid eventId" });
    }

    const parsedCreatedAt = parseEventTimestamp(rawCreatedAt);
    if (
      rawCreatedAt !== undefined &&
      rawCreatedAt !== null &&
      parsedCreatedAt === null
    ) {
      return res.status(400).json({ ok: false, error: "Invalid createdAt" });
    }

    const db = getDb();
    const alertRef = db.ref("alerts").push();
    const normalizedType = cleanString(type, 64, "unknown");
    const normalizedLevel = normalizeChoice(level, ALERT_LEVELS, "warning");
    const rawStatus = cleanString(status, 64);
    const rawMessage = cleanString(message, MAX_MESSAGE_LENGTH);
    const normalizedStatus = normalizeChoice(status, LEGACY_ALERT_STATUSES, "new");
    const normalizedEvent = {
      source: cleanString(source, 64, "chami_001"),
      type: normalizedType,
      level: normalizedLevel,
      message: cleanString(
        rawMessage,
        MAX_MESSAGE_LENGTH,
        "Robot Chami sent an alert.",
      ),
      status: normalizedStatus,
      createdAt: parsedCreatedAt ?? getServerTimestamp(),
      receivedAt: getServerTimestamp(),
    };
    const messageForPolicy = normalizedEvent.message.toLowerCase();
    const notificationType =
      normalizedType === "emergency_response" &&
      (rawStatus === "no_response" ||
        messageForPolicy.includes("no_response") ||
        messageForPolicy.includes("no response") ||
        messageForPolicy.includes("khong co phan hoi"))
        ? "emergency_no_response"
        : normalizedType === "emergency_response" &&
            (rawStatus === "danger" ||
              ["danger", "emergency"].includes(normalizedLevel))
          ? "danger"
          : normalizedType;
    const dedupeCreatedAt = parsedCreatedAt ?? Date.now();
    const createdAtMs = Date.now();
    const dedupeKey = buildAlertDedupeKey(
      { ...normalizedEvent, type: notificationType },
      eventId,
      parsedCreatedAt !== null,
      dedupeCreatedAt,
    );

    await alertRef.set({
      id: alertRef.key,
      ...normalizedEvent,
      createdAtMs,
    });
    scheduleHistoryPrune(db, HISTORY_RETENTION_PATHS);

    notifyCaregiversForEventAsync({
      ...normalizedEvent,
      id: alertRef.key,
      type: notificationType,
      eventId: eventId || dedupeKey,
      dedupeKey,
      receivedAt: Date.now(),
    });

    return res.json({
      ok: true,
      alertId: alertRef.key,
      message: "Chami alert created",
    });
  } catch (error) {
    console.error("Chami alert creation failed:", error);

    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

router.post("/line-test", deviceAuth, async (req, res) => {
  if (process.env.LINE_NOTIFICATION_DEMO_ENABLED !== "true") {
    return res.status(403).json({
      ok: false,
      error: "LINE notification demo is disabled",
    });
  }

  try {
    const result = await notifyCaregiversForEvent({
      type: "danger",
      source: "line_demo",
      eventId: `line_demo_${Date.now()}`,
      message: "LINE Messaging API demo",
      createdAt: Date.now(),
    });

    return res.json({
      ok: result.successCount > 0,
      status: result.status,
      successCount: result.successCount,
      failureCount: result.failureCount,
    });
  } catch (error) {
    console.error(`[CaregiverNotify] line-test failed: ${error.message}`);
    return res.status(500).json({
      ok: false,
      status: "failed",
      successCount: 0,
      failureCount: 0,
    });
  }
});

router.post(
  "/health-concerns/:healthConcernId/resolve",
  deviceAuth,
  resolveHealthConcern,
);

router.get("/commands/next", deviceAuth, async (req, res) => {
  const { deviceId } = req.query || {};

  if (!deviceId) {
    return res.status(400).json({
      ok: false,
      error: "Missing deviceId",
    });
  }

  try {
    const snapshot = await getDb()
      .ref("commands")
      .orderByChild("target")
      .equalTo(deviceId)
      .once("value");

    let nextCommand = null;

    snapshot.forEach((childSnapshot) => {
      const command = childSnapshot.val();

      if (!command || command.status !== "pending") {
        return;
      }

      const createdAt = command.createdAt || Number.MAX_SAFE_INTEGER;

      if (!nextCommand || createdAt < nextCommand.createdAt) {
        nextCommand = {
          id: childSnapshot.key,
          createdAt,
          data: command,
        };
      }
    });

    if (!nextCommand) {
      return res.json({
        ok: true,
        hasCommand: false,
        command: null,
      });
    }

    return res.json({
      ok: true,
      hasCommand: true,
      command: {
        ...nextCommand.data,
        id: nextCommand.id,
      },
    });
  } catch (error) {
    console.error("Chami command lookup failed:", error);

    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

router.post("/commands/:commandId/done", deviceAuth, async (req, res) => {
  const { commandId } = req.params;
  const { deviceId } = req.body || {};

  if (!deviceId) {
    return res.status(400).json({
      ok: false,
      error: "Missing deviceId",
    });
  }

  try {
    const commandRef = getDb().ref(`commands/${commandId}`);
    const snapshot = await commandRef.once("value");

    if (!snapshot.exists()) {
      return res.status(404).json({
        ok: false,
        error: "Command not found",
      });
    }

    const command = snapshot.val();

    if (command.target !== deviceId) {
      return res.status(403).json({
        ok: false,
        error: "Command target does not match deviceId",
      });
    }

    await commandRef.remove();

    return res.json({
      ok: true,
      commandId,
      message: "Command processed and removed",
    });
  } catch (error) {
    console.error("Chami command removal failed:", error);

    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

module.exports = router;
