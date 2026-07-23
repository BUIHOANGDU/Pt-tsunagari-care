const { getDb, getServerTimestamp } = require("../firebaseAdmin");

const DEFAULT_TIMEZONE = "Asia/Tokyo";
const DEFAULT_TARGET_DEVICE_ID = "chami_001";
const TICK_INTERVAL_MS = 60 * 1000;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

let medicineReminderSchedulerStarted = false;
let medicineReminderSchedulerTimer = null;

function getZonedDateTimeParts(date = new Date(), timezone = DEFAULT_TIMEZONE) {
  let formatter;

  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || DEFAULT_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch (error) {
    console.warn("Medicine reminder timezone fallback: invalid timezone");
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: DEFAULT_TIMEZONE,
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

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function isValidMedicineReminder(reminder) {
  return (
    reminder &&
    reminder.type === "medicine" &&
    reminder.enabled === true &&
    reminder.repeat === "daily" &&
    typeof reminder.targetDeviceId === "string" &&
    reminder.targetDeviceId.trim() !== "" &&
    TIME_RE.test(reminder.time || "")
  );
}

async function hasPendingMedicineReminderCommand(targetDeviceId) {
  const snapshot = await getDb()
    .ref("commands")
    .orderByChild("target")
    .equalTo(targetDeviceId)
    .once("value");

  let hasPending = false;
  snapshot.forEach((childSnapshot) => {
    const command = childSnapshot.val();

    if (
      command?.action === "remind_medicine" &&
      (command.status || "pending") === "pending"
    ) {
      hasPending = true;
    }
  });

  return hasPending;
}

async function createMedicineReminderCommand(reminder) {
  const target = reminder.targetDeviceId || DEFAULT_TARGET_DEVICE_ID;
  const commandRef = getDb().ref("commands").push();
  const medicineName = reminder.medicineName || "Thuốc huyết áp";

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

  console.log("Medicine reminder command created");
  return commandRef.key;
}

async function createMedicineReminderCareLog(reminder) {
  const logRef = getDb().ref("care_logs").push();

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

  console.log("Medicine reminder care log created");
}

async function rollbackReminderTriggerMarker(
  reminderId,
  previousLastTriggeredDate,
  previousLastTriggeredAt,
) {
  await getDb().ref(`reminders/${reminderId}`).update({
    lastTriggeredDate: previousLastTriggeredDate ?? null,
    lastTriggeredAt: previousLastTriggeredAt ?? null,
    updatedAt: getServerTimestamp(),
  });
}

async function processDueReminder(reminderId, reminder, currentDate) {
  const target = reminder.targetDeviceId || DEFAULT_TARGET_DEVICE_ID;

  if (await hasPendingMedicineReminderCommand(target)) {
    console.log("Medicine reminder command already pending");
    return;
  }

  const previousLastTriggeredDate = reminder.lastTriggeredDate ?? null;
  const previousLastTriggeredAt = reminder.lastTriggeredAt ?? null;
  const reminderRef = getDb().ref(`reminders/${reminderId}`);
  const transactionResult = await reminderRef.transaction((current) => {
    if (!isValidMedicineReminder(current)) {
      return;
    }

    if (current.lastTriggeredDate === currentDate) {
      return;
    }

    return {
      ...current,
      lastTriggeredDate: currentDate,
      lastTriggeredAt: Date.now(),
      updatedAt: Date.now(),
    };
  });

  if (!transactionResult.committed) {
    console.log("Medicine reminder skipped: already triggered today");
    return;
  }

  const committedReminder = transactionResult.snapshot.val();

  try {
    await createMedicineReminderCommand(committedReminder);
    await createMedicineReminderCareLog(committedReminder);
  } catch (error) {
    console.error("Medicine reminder command/care log error:", error);
    try {
      await rollbackReminderTriggerMarker(
        reminderId,
        previousLastTriggeredDate,
        previousLastTriggeredAt,
      );
    } catch (rollbackError) {
      console.error("Medicine reminder rollback failed:", rollbackError);
    }
  }
}

async function runMedicineReminderSchedulerTick(now = new Date()) {
  console.log("Medicine reminder scheduler tick");
  const snapshot = await getDb().ref("reminders").once("value");
  const reminders = snapshot.val() || {};

  for (const [reminderId, reminder] of Object.entries(reminders)) {
    if (!reminder || reminder.type !== "medicine") {
      continue;
    }

    if (reminder.enabled !== true) {
      console.log("Medicine reminder skipped: disabled");
      continue;
    }

    if (!TIME_RE.test(reminder.time || "")) {
      console.log("Medicine reminder skipped: invalid time");
      continue;
    }

    if (!isValidMedicineReminder(reminder)) {
      continue;
    }

    const zonedNow = getZonedDateTimeParts(
      now,
      reminder.timezone || DEFAULT_TIMEZONE,
    );

    if (zonedNow.time !== reminder.time) {
      continue;
    }

    if (reminder.lastTriggeredDate === zonedNow.date) {
      console.log("Medicine reminder skipped: already triggered today");
      continue;
    }

    console.log(`Medicine reminder due: ${reminderId}`);
    await processDueReminder(reminderId, reminder, zonedNow.date);
  }
}

function startMedicineReminderScheduler() {
  if (medicineReminderSchedulerStarted) {
    return medicineReminderSchedulerTimer;
  }

  medicineReminderSchedulerStarted = true;
  medicineReminderSchedulerTimer = setInterval(() => {
    runMedicineReminderSchedulerTick().catch((error) => {
      console.error("Medicine reminder scheduler error", error);
    });
  }, TICK_INTERVAL_MS);

  if (typeof medicineReminderSchedulerTimer.unref === "function") {
    medicineReminderSchedulerTimer.unref();
  }

  console.log("Medicine reminder scheduler started");
  return medicineReminderSchedulerTimer;
}

module.exports = {
  getZonedDateTimeParts,
  runMedicineReminderSchedulerTick,
  startMedicineReminderScheduler,
};
