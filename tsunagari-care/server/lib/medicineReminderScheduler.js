const { getDb, getServerTimestamp } = require("../firebaseAdmin");

const DEFAULT_TIMEZONE = "Asia/Tokyo";
const DEFAULT_TARGET_DEVICE_ID = "chami_001";
const EXPECTED_DATABASE_ID = "tsunagari-care-2026-default-rtdb";
const TICK_INTERVAL_MS = 60 * 1000;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const LOG_PREFIX = "[MedicineScheduler]";

let medicineReminderSchedulerStarted = false;
let medicineReminderSchedulerTimer = null;
let rtdbInitializationLogged = false;

function log(message) {
  console.log(`${LOG_PREFIX} ${message}`);
}

function logError(message, error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`${LOG_PREFIX} ${message}: ${detail}`);
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
  // Some Node/ICU builds format midnight as 24:xx even with hour12 disabled.
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

async function hasPendingMedicineReminderCommand(targetDeviceId) {
  const snapshot = await getSchedulerDb()
    .ref("commands")
    .orderByChild("target")
    .equalTo(targetDeviceId)
    .once("value");

  let hasPending = false;
  snapshot.forEach((childSnapshot) => {
    const command = childSnapshot.val();
    if (
      command?.target === targetDeviceId &&
      command.action === "remind_medicine" &&
      command.status === "pending"
    ) {
      hasPending = true;
    }
  });

  log(`pending command check result=${hasPending}`);
  return hasPending;
}

async function createMedicineReminderCommand(reminderId, reminder) {
  const target = reminder.targetDeviceId || DEFAULT_TARGET_DEVICE_ID;
  const commandRef = getSchedulerDb().ref("commands").push();
  const medicineName = reminder.medicineName || "Thuốc huyết áp";

  log(`command create start id=${reminderId}`);
  await commandRef.set({
    id: commandRef.key,
    source: "medicine_scheduler",
    target,
    type: "robot_action",
    action: "remind_medicine",
    text: `Đã đến giờ uống thuốc: ${medicineName}`,
    status: "pending",
    createdAt: getServerTimestamp(),
  });
  log(`command created commandId=${commandRef.key}`);
  return commandRef.key;
}

async function createMedicineReminderCareLog(reminder) {
  const logRef = getSchedulerDb().ref("care_logs").push();

  await logRef.set({
    id: logRef.key,
    type: "medicine_reminder_sent",
    source: "medicine_scheduler",
    target: reminder.targetDeviceId || DEFAULT_TARGET_DEVICE_ID,
    medicineName: reminder.medicineName || "Thuốc huyết áp",
    time: reminder.time || "",
    message: "Đã gửi lời nhắc uống thuốc",
    status: "sent",
    createdAt: getServerTimestamp(),
  });
  log(`care log created careLogId=${logRef.key}`);
}

async function rollbackReminderTriggerMarker(
  reminderId,
  previousLastTriggeredDate,
  previousLastTriggeredAt,
) {
  await getSchedulerDb().ref(`reminders/${reminderId}`).update({
    lastTriggeredDate: previousLastTriggeredDate ?? null,
    lastTriggeredAt: previousLastTriggeredAt ?? null,
    updatedAt: getServerTimestamp(),
  });
}

async function processDueReminder(reminderId, reminder, zonedNow) {
  const target = reminder.targetDeviceId || DEFAULT_TARGET_DEVICE_ID;
  const invalidReason = getInvalidReason(reminder);

  if (invalidReason) {
    log(`skip id=${reminderId} reason=${invalidReason}`);
    return;
  }
  if (zonedNow.time !== reminder.time) {
    log(
      `skip id=${reminderId} reason=time_not_due ` +
        `now=${zonedNow.time} expected=${reminder.time}`,
    );
    return;
  }
  if (reminder.lastTriggeredDate === zonedNow.date) {
    log(`skip id=${reminderId} reason=already_triggered_today`);
    return;
  }

  if (await hasPendingMedicineReminderCommand(target)) {
    log(`skip id=${reminderId} reason=pending_command_exists`);
    return;
  }

  const previousLastTriggeredDate = reminder.lastTriggeredDate ?? null;
  const previousLastTriggeredAt = reminder.lastTriggeredAt ?? null;
  const triggerDateRef = getSchedulerDb().ref(
    `reminders/${reminderId}/lastTriggeredDate`,
  );
  let transactionReason = "already_triggered_today";

  log(`transaction start id=${reminderId} path=lastTriggeredDate`);
  const transactionResult = await triggerDateRef.transaction((currentDate) => {
    log(`transaction currentDate=${currentDate ?? "null"}`);
    if (currentDate === zonedNow.date) {
      transactionReason = "already_triggered_today";
      return;
    }

    transactionReason = "committed";
    return zonedNow.date;
  });

  if (!transactionResult.committed) {
    log(
      `transaction not committed id=${reminderId} reason=${transactionReason}`,
    );
    return;
  }

  log(`transaction committed id=${reminderId} date=${zonedNow.date}`);

  try {
    await getSchedulerDb().ref(`reminders/${reminderId}`).update({
      lastTriggeredAt: getServerTimestamp(),
      updatedAt: getServerTimestamp(),
    });
    log(`trigger timestamps updated id=${reminderId}`);
    await createMedicineReminderCommand(reminderId, reminder);
    await createMedicineReminderCareLog(reminder);
  } catch (error) {
    logError(`command/care log failed id=${reminderId}`, error);
    try {
      await rollbackReminderTriggerMarker(
        reminderId,
        previousLastTriggeredDate,
        previousLastTriggeredAt,
      );
      log(`transaction marker rollback succeeded id=${reminderId}`);
    } catch (rollbackError) {
      logError(`transaction marker rollback failed id=${reminderId}`, rollbackError);
    }
  }
}

async function runMedicineReminderSchedulerTick(now = new Date()) {
  log("tick start");
  const tokyoNow = getZonedDateTimeParts(now, DEFAULT_TIMEZONE);
  log(
    `now timezone=${tokyoNow.timezone} date=${tokyoNow.date} time=${tokyoNow.time}`,
  );
  log(`timezone normalized date=${tokyoNow.date} time=${tokyoNow.time}`);

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

    log(
      `check id=${reminderId} enabled=${reminder.enabled === true} ` +
        `repeat=${reminder.repeat || ""} reminderTime=${reminder.time || ""} ` +
        `lastTriggeredDate=${reminder.lastTriggeredDate || ""} ` +
        `target=${reminder.targetDeviceId || ""}`,
    );

    const invalidReason = getInvalidReason(reminder);
    if (invalidReason) {
      log(`skip id=${reminderId} reason=${invalidReason}`);
      continue;
    }

    const zonedNow = getZonedDateTimeParts(
      now,
      reminder.timezone || DEFAULT_TIMEZONE,
    );
    if (zonedNow.time !== reminder.time) {
      log(
        `skip id=${reminderId} reason=time_not_due ` +
          `now=${zonedNow.time} expected=${reminder.time}`,
      );
      continue;
    }
    if (reminder.lastTriggeredDate === zonedNow.date) {
      log(`skip id=${reminderId} reason=already_triggered_today`);
      continue;
    }

    log(`due id=${reminderId}`);
    await processDueReminder(reminderId, reminder, zonedNow);
  }
}

function runTickSafely(label) {
  runMedicineReminderSchedulerTick().catch((error) => {
    logError(`${label} tick failed`, error);
  });
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
  getZonedDateTimeParts,
  runMedicineReminderSchedulerTick,
  startMedicineReminderScheduler,
};
