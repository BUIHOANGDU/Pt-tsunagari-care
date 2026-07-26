const { getDb, getServerTimestamp } = require("../firebaseAdmin");

const DEFAULT_TIMEZONE = "Asia/Tokyo";
const DEFAULT_TARGET_DEVICE_ID = "chami_001";
const DEFAULT_MEDICINE_NAME = "Thuốc";
const EXPECTED_DATABASE_ID = "tsunagari-care-2026-default-rtdb";
const TICK_INTERVAL_MS = 30 * 1000;
const BUSY_RETRY_WINDOW_MINUTES = 5;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const LOG_PREFIX = "[MedicineScheduler]";

let medicineReminderSchedulerStarted = false;
let medicineReminderSchedulerTimer = null;
let medicineReminderSchedulerTickRunning = false;
let rtdbInitializationLogged = false;
const medicineReminderRetries = new Map();

function log(message) {
  console.log(`${LOG_PREFIX} ${message}`);
}

function logError(message, error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`${LOG_PREFIX} ${message}: ${detail}`);
}

function getSafeLogText(value, fallback = "") {
  const text = typeof value === "string" ? value : fallback;
  return text.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 120);
}

function getDatabaseId() {
  try {
    const hostname = new URL(process.env.FIREBASE_DATABASE_URL || "").hostname;
    return hostname.split(".")[0] || "unknown";
  } catch (_error) {
    return "unknown";
  }
}

function getSchedulerDb() {
  const db = getDb();

  if (!rtdbInitializationLogged) {
    const databaseId = getDatabaseId();
    log(`RTDB initialized database=${databaseId}`);
    if (databaseId !== EXPECTED_DATABASE_ID) {
      console.warn(
        `${LOG_PREFIX} RTDB database mismatch expected=${EXPECTED_DATABASE_ID} actual=${databaseId}`,
      );
    }
    rtdbInitializationLogged = true;
  }

  return db;
}

function getZonedDateTimeParts(date = new Date(), timezone = DEFAULT_TIMEZONE) {
  let formatter;
  let normalizedTimezone = timezone || DEFAULT_TIMEZONE;

  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: normalizedTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch (_error) {
    normalizedTimezone = DEFAULT_TIMEZONE;
    console.warn(`${LOG_PREFIX} invalid timezone; using ${DEFAULT_TIMEZONE}`);
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: normalizedTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  const hour = parts.hour === "24" ? "00" : parts.hour;

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${hour}:${parts.minute}`,
    timezone: normalizedTimezone,
  };
}

function getInvalidReason(reminder) {
  if (!reminder || reminder.type !== "medicine") {
    return "invalid_type";
  }
  if (reminder.enabled !== true) {
    return "disabled";
  }
  if (!TIME_RE.test(reminder.time || "")) {
    return "invalid_time";
  }
  if (reminder.repeat !== "daily") {
    return "invalid_repeat";
  }
  if (
    typeof reminder.targetDeviceId !== "string" ||
    reminder.targetDeviceId.trim() === ""
  ) {
    return "invalid_target";
  }
  return null;
}

function timeToMinutes(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function getDueOccurrence(reminder, zonedNow) {
  const elapsedMinutes =
    timeToMinutes(zonedNow.time) - timeToMinutes(reminder.time);
  if (elapsedMinutes !== 0) return null;

  return {
    date: zonedNow.date,
    time: reminder.time,
    key: `${zonedNow.date}_${reminder.time}`,
  };
}

function hasTriggeredOccurrence(reminder, occurrence) {
  if (reminder.lastTriggeredKey === occurrence.key) {
    return true;
  }

  // Compatibility for records triggered by the former date-only scheduler.
  return (
    !reminder.lastTriggeredKey &&
    reminder.lastTriggeredDate === occurrence.date &&
    (!reminder.lastTriggeredTime ||
      reminder.lastTriggeredTime === occurrence.time)
  );
}

async function getPendingMedicineCommandState(targetDeviceId, reminderId) {
  const snapshot = await getSchedulerDb()
    .ref("commands")
    .orderByChild("target")
    .equalTo(targetDeviceId)
    .once("value");

  let pendingSameReminder = false;
  let robotBusy = false;
  snapshot.forEach((childSnapshot) => {
    const command = childSnapshot.val();
    if (
      command?.target !== targetDeviceId ||
      command.action !== "remind_medicine" ||
      command.status !== "pending"
    ) {
      return;
    }

    robotBusy = true;
    if (command.reminderId === reminderId) {
      pendingSameReminder = true;
    }
  });

  if (pendingSameReminder) return "pending_same_reminder";
  return robotBusy ? "robot_busy" : null;
}

function buildCommand(commandRef, reminderId, reminder) {
  const medicineName =
    getSafeLogText(reminder.medicineName, DEFAULT_MEDICINE_NAME) ||
    DEFAULT_MEDICINE_NAME;
  return {
    id: commandRef.key,
    source: "medicine_scheduler",
    target: reminder.targetDeviceId || DEFAULT_TARGET_DEVICE_ID,
    type: "robot_action",
    action: "remind_medicine",
    reminderId,
    medicineName,
    text: `Đã đến giờ uống thuốc: ${medicineName}`,
    status: "pending",
    createdAt: getServerTimestamp(),
  };
}

function buildCareLog(careLogRef, reminderId, reminder) {
  return {
    id: careLogRef.key,
    type: "medicine_reminder_sent",
    category: "medicine",
    source: "medicine_scheduler",
    target: reminder.targetDeviceId || DEFAULT_TARGET_DEVICE_ID,
    reminderId,
    medicineName:
      getSafeLogText(reminder.medicineName, DEFAULT_MEDICINE_NAME) ||
      DEFAULT_MEDICINE_NAME,
    time: reminder.time,
    status: "sent",
    message: "Đã gửi lời nhắc uống thuốc",
    createdAt: getServerTimestamp(),
  };
}

async function rollbackOccurrenceMarker(
  reminderId,
  occurrenceKey,
  previousValues,
) {
  const reminderRef = getSchedulerDb().ref(`reminders/${reminderId}`);
  const currentKeySnapshot = await reminderRef
    .child("lastTriggeredKey")
    .once("value");

  if (currentKeySnapshot.val() !== occurrenceKey) {
    throw new Error("occurrence marker changed before rollback");
  }

  await reminderRef.update({
    lastTriggeredKey: previousValues.lastTriggeredKey ?? null,
    lastTriggeredDate: previousValues.lastTriggeredDate ?? null,
    lastTriggeredTime: previousValues.lastTriggeredTime ?? null,
    lastTriggeredAt: previousValues.lastTriggeredAt ?? null,
    updatedAt: previousValues.updatedAt ?? getServerTimestamp(),
  });
}

async function processDueReminder(reminderId, reminder, occurrence) {
  const target = reminder.targetDeviceId || DEFAULT_TARGET_DEVICE_ID;
  if (hasTriggeredOccurrence(reminder, occurrence)) {
    log(`skip id=${reminderId} reason=already_triggered_occurrence`);
    return "already_triggered_occurrence";
  }

  const pendingState = await getPendingMedicineCommandState(
    target,
    reminderId,
  );
  if (pendingState) {
    log(`skip id=${reminderId} reason=${pendingState}`);
    return pendingState;
  }

  const previousValues = {
    lastTriggeredKey: reminder.lastTriggeredKey,
    lastTriggeredDate: reminder.lastTriggeredDate,
    lastTriggeredTime: reminder.lastTriggeredTime,
    lastTriggeredAt: reminder.lastTriggeredAt,
    updatedAt: reminder.updatedAt,
  };
  const triggerKeyRef = getSchedulerDb().ref(
    `reminders/${reminderId}/lastTriggeredKey`,
  );
  let transactionReason = "already_triggered_occurrence";

  log(`transaction start id=${reminderId} path=lastTriggeredKey`);
  const transactionResult = await triggerKeyRef.transaction((currentKey) => {
    log(`transaction currentKey=${currentKey ?? "null"}`);
    if (currentKey === occurrence.key) {
      transactionReason = "already_triggered_occurrence";
      return;
    }

    transactionReason = "committed";
    return occurrence.key;
  });

  if (!transactionResult.committed) {
    log(
      `transaction not committed id=${reminderId} reason=${transactionReason}`,
    );
    return transactionReason;
  }

  log(
    `transaction committed id=${reminderId} key=${occurrence.key}`,
  );

  const db = getSchedulerDb();
  const commandRef = db.ref("commands").push();
  const careLogRef = db.ref("care_logs").push();
  const timestamp = getServerTimestamp();
  const command = buildCommand(commandRef, reminderId, reminder);
  const careLog = buildCareLog(careLogRef, reminderId, reminder);

  try {
    await db.ref().update({
      [`reminders/${reminderId}/lastTriggeredDate`]: occurrence.date,
      [`reminders/${reminderId}/lastTriggeredTime`]: occurrence.time,
      [`reminders/${reminderId}/lastTriggeredAt`]: timestamp,
      [`reminders/${reminderId}/updatedAt`]: timestamp,
      [`commands/${commandRef.key}`]: command,
      [`care_logs/${careLogRef.key}`]: careLog,
    });
    log(`trigger timestamps updated id=${reminderId}`);
    log(
      `command created reminderId=${reminderId} commandId=${commandRef.key}`,
    );
    log(`care log created reminderId=${reminderId}`);
    return "created";
  } catch (error) {
    logError(`command/care log failed id=${reminderId}`, error);
    try {
      await rollbackOccurrenceMarker(
        reminderId,
        occurrence.key,
        previousValues,
      );
      log(`transaction marker rollback succeeded id=${reminderId}`);
    } catch (rollbackError) {
      logError(
        `transaction marker rollback failed id=${reminderId}`,
        rollbackError,
      );
    }
    return "write_failed";
  }
}

async function runMedicineReminderSchedulerTick(now = new Date()) {
  log("tick start");
  for (const [reminderId, retry] of medicineReminderRetries) {
    if (retry.deadline < now.getTime()) {
      medicineReminderRetries.delete(reminderId);
    }
  }

  let snapshot;
  try {
    snapshot = await getSchedulerDb().ref("reminders").once("value");
  } catch (error) {
    logError("reminders read failed", error);
    throw error;
  }

  const reminders = snapshot.val() || {};
  log(`reminders loaded count=${Object.keys(reminders).length}`);

  for (const [reminderId, reminder] of Object.entries(reminders)) {
    if (!reminder || reminder.type !== "medicine") {
      continue;
    }

    const medicineName =
      getSafeLogText(reminder.medicineName, DEFAULT_MEDICINE_NAME) ||
      DEFAULT_MEDICINE_NAME;
    log(
      `check id=${reminderId} medicine=${medicineName} time=${reminder.time || ""}`,
    );

    const invalidReason = getInvalidReason(reminder);
    if (invalidReason) {
      log(`skip id=${reminderId} reason=${invalidReason}`);
      medicineReminderRetries.delete(reminderId);
      continue;
    }

    const zonedNow = getZonedDateTimeParts(
      now,
      reminder.timezone || DEFAULT_TIMEZONE,
    );
    const dueNow = getDueOccurrence(reminder, zonedNow);
    let retry = medicineReminderRetries.get(reminderId);
    if (retry && retry.occurrence.time !== reminder.time) {
      medicineReminderRetries.delete(reminderId);
      retry = null;
    }
    const occurrence = dueNow || retry?.occurrence || null;
    const calculatedKey =
      occurrence?.key || `${zonedNow.date}_${reminder.time}`;
    log(
      `occurrence calculated id=${reminderId} key=${calculatedKey}`,
    );

    if (!occurrence) {
      log(
        `skip id=${reminderId} reason=time_not_due now=${zonedNow.time} expected=${reminder.time}`,
      );
      continue;
    }
    if (hasTriggeredOccurrence(reminder, occurrence)) {
      log(`skip id=${reminderId} reason=already_triggered_occurrence`);
      medicineReminderRetries.delete(reminderId);
      continue;
    }

    log(`due id=${reminderId}`);
    try {
      const result = await processDueReminder(
        reminderId,
        reminder,
        occurrence,
      );
      if (
        result === "pending_same_reminder" ||
        result === "robot_busy" ||
        result === "write_failed"
      ) {
        if (!retry) {
          medicineReminderRetries.set(reminderId, {
            deadline:
              now.getTime() + BUSY_RETRY_WINDOW_MINUTES * 60 * 1000,
            occurrence,
          });
        }
      } else {
        medicineReminderRetries.delete(reminderId);
      }
    } catch (error) {
      logError(`reminder processing failed id=${reminderId}`, error);
      if (!retry) {
        medicineReminderRetries.set(reminderId, {
          deadline:
            now.getTime() + BUSY_RETRY_WINDOW_MINUTES * 60 * 1000,
          occurrence,
        });
      }
    }
  }
}

async function runTickSafely(label) {
  if (medicineReminderSchedulerTickRunning) {
    log(`skip tick reason=already_running label=${label}`);
    return;
  }

  medicineReminderSchedulerTickRunning = true;
  try {
    await runMedicineReminderSchedulerTick();
  } catch (error) {
    logError(`${label} tick failed`, error);
  } finally {
    medicineReminderSchedulerTickRunning = false;
  }
}

function startMedicineReminderScheduler() {
  log("start requested");
  if (medicineReminderSchedulerStarted) {
    log("start skipped: already running");
    return medicineReminderSchedulerTimer;
  }

  medicineReminderSchedulerStarted = true;
  medicineReminderSchedulerTimer = setInterval(
    () => runTickSafely("interval"),
    TICK_INTERVAL_MS,
  );

  if (typeof medicineReminderSchedulerTimer.unref === "function") {
    medicineReminderSchedulerTimer.unref();
  }

  log(`started intervalMs=${TICK_INTERVAL_MS}`);
  log("initial tick scheduled");
  runTickSafely("initial");
  return medicineReminderSchedulerTimer;
}

module.exports = {
  getDueOccurrence,
  getInvalidReason,
  getZonedDateTimeParts,
  runMedicineReminderSchedulerTick,
  startMedicineReminderScheduler,
};
