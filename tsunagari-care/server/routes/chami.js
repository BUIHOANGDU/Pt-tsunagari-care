const express = require("express");
const crypto = require("crypto");

const deviceAuth = require("../middleware/deviceAuth");
const { getDb, getServerTimestamp } = require("../firebaseAdmin");

const router = express.Router();
const MEDICINE_EVENT_TYPES = new Set([
  "medicine_taken",
  "medicine_no_response",
]);
const SAFE_REMINDER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const SAFE_EVENT_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_MEDICINE_NAME_LENGTH = 100;
const MAX_MESSAGE_LENGTH = 300;
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

async function normalizeMedicineEvent(body, db) {
  const type = body?.type;
  if (!MEDICINE_EVENT_TYPES.has(type)) {
    throw new Error("Unsupported medication event type");
  }

  const reminderId =
    typeof body.reminderId === "string" && body.reminderId.trim()
      ? body.reminderId.trim()
      : "medicine_morning";
  if (!SAFE_REMINDER_ID_RE.test(reminderId)) {
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
  const createdAt = parsedCreatedAt ?? getServerTimestamp();
  const medicineName = await resolveMedicineName(
    db,
    reminderId,
    body.medicineName,
  );

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
        reminderId,
        attempt,
        message: cleanString(
          body.message,
          MAX_MESSAGE_LENGTH,
          "Người dùng đã xác nhận uống thuốc",
        ),
        createdAt,
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
      reminderId,
      attempts,
      message: cleanString(
        body.message,
        MAX_MESSAGE_LENGTH,
        "Không có phản hồi sau 3 lần nhắc uống thuốc",
      ),
      createdAt,
    },
    eventId,
    timestampWasSupplied: parsedCreatedAt !== null,
    dedupeCreatedAt,
  };
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
        reminderId: event.reminderId,
        createdAt: getServerTimestamp(),
      };
    });

    if (!lockResult.committed) {
      console.log(`[MedicineFollowup] duplicate event key=${dedupeKey}`);
      return res.json({ ok: true, duplicate: true });
    }

    const alertRef = db.ref("alerts").push();
    const careLogRef = db.ref("care_logs").push();
    const receivedAt = getServerTimestamp();
    const alert = {
      id: alertRef.key,
      ...event,
      receivedAt,
    };
    delete alert.category;
    const careLog = {
      id: careLogRef.key,
      ...event,
      receivedAt,
    };

    await db.ref().update({
      [`alerts/${alertRef.key}`]: alert,
      [`care_logs/${careLogRef.key}`]: careLog,
    });

    console.log(`[MedicineFollowup] alert created id=${alertRef.key}`);
    console.log(`[MedicineFollowup] care log created id=${careLogRef.key}`);
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

  const {
    source,
    type,
    level,
    message,
    status,
  } = req.body || {};

  try {
    const alertRef = getDb().ref("alerts").push();

    await alertRef.set({
      source: cleanString(source, 64, "chami_001"),
      type: cleanString(type, 64, "unknown"),
      level: normalizeChoice(level, ALERT_LEVELS, "warning"),
      message: cleanString(
        message,
        MAX_MESSAGE_LENGTH,
        "Robot Chami sent an alert.",
      ),
      status: normalizeChoice(status, LEGACY_ALERT_STATUSES, "new"),
      createdAt: getServerTimestamp(),
      receivedAt: getServerTimestamp(),
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
