const DEFAULT_MAX_RECORDS = 30;
const MIN_MAX_RECORDS = 10;
const MAX_MAX_RECORDS = 100;
const DEFAULT_TIMESTAMP_FIELDS = ["createdAtMs", "createdAt", "receivedAt"];
const FIREBASE_PUSH_CHARS =
  "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz";

function getSafeErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.replace(/[\r\n\t]/g, " ").slice(0, 180);
}

function getHistoryMaxRecords(value = process.env.RTDB_HISTORY_MAX_RECORDS) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (
    !Number.isInteger(parsed) ||
    parsed < MIN_MAX_RECORDS ||
    parsed > MAX_MAX_RECORDS
  ) {
    return DEFAULT_MAX_RECORDS;
  }
  return parsed;
}

function parseTimestampValue(value) {
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

function decodeFirebasePushKeyTime(key) {
  if (typeof key !== "string" || key.length < 8) return null;
  let timestamp = 0;
  for (let index = 0; index < 8; index += 1) {
    const charIndex = FIREBASE_PUSH_CHARS.indexOf(key[index]);
    if (charIndex < 0) return null;
    timestamp = timestamp * 64 + charIndex;
  }
  return timestamp > 0 ? timestamp : null;
}

function getRecordTimestamp(record, key, timestampFields) {
  for (const field of timestampFields) {
    const parsed = parseTimestampValue(record?.[field]);
    if (parsed !== null) return parsed;
  }
  return decodeFirebasePushKeyTime(key);
}

function snapshotToRecords(snapshot, timestampFields = DEFAULT_TIMESTAMP_FIELDS) {
  const records = [];
  snapshot.forEach((childSnapshot) => {
    const key = childSnapshot.key;
    records.push({
      key,
      timestamp: getRecordTimestamp(childSnapshot.val(), key, timestampFields),
    });
  });
  return records;
}

function sortRecordsOldestFirst(records) {
  return [...records].sort((left, right) => {
    const leftTime = left.timestamp ?? 0;
    const rightTime = right.timestamp ?? 0;
    if (leftTime !== rightTime) return leftTime - rightTime;
    return String(left.key).localeCompare(String(right.key));
  });
}

async function pruneCollection({
  db,
  path,
  maxRecords = getHistoryMaxRecords(),
  timestampFields = DEFAULT_TIMESTAMP_FIELDS,
}) {
  const safeMaxRecords = getHistoryMaxRecords(maxRecords);
  console.log(`[Retention] prune start path=${path} max=${safeMaxRecords}`);

  try {
    const snapshot = await db.ref(path).once("value");
    const records = snapshotToRecords(snapshot, timestampFields);
    const count = records.length;
    console.log(`[Retention] current count=${count} path=${path}`);

    if (count <= safeMaxRecords) {
      console.log(`[Retention] skipped count=${count} path=${path}`);
      return {
        ok: true,
        path,
        count,
        deletedCount: 0,
        skippedCount: count,
      };
    }

    const deleteCount = count - safeMaxRecords;
    const oldestRecords = sortRecordsOldestFirst(records).slice(0, deleteCount);
    const updates = {};
    oldestRecords.forEach((record) => {
      updates[`${path}/${record.key}`] = null;
    });

    await db.ref().update(updates);
    console.log(`[Retention] deleted count=${deleteCount} path=${path}`);
    return {
      ok: true,
      path,
      count,
      deletedCount: deleteCount,
      skippedCount: safeMaxRecords,
    };
  } catch (error) {
    console.error(
      `[Retention] failed path=${path} error=${getSafeErrorMessage(error)}`,
    );
    return {
      ok: false,
      path,
      error: getSafeErrorMessage(error),
    };
  }
}

function schedulePruneCollection(options) {
  setTimeout(() => {
    pruneCollection(options).catch((error) => {
      console.error(
        `[Retention] failed path=${options.path} error=${getSafeErrorMessage(error)}`,
      );
    });
  }, 0);
}

function schedulePruneCollections({ db, paths, maxRecords, timestampFields }) {
  (paths || []).forEach((path) => {
    schedulePruneCollection({
      db,
      path,
      maxRecords,
      timestampFields,
    });
  });
}

module.exports = {
  DEFAULT_MAX_RECORDS,
  getHistoryMaxRecords,
  parseTimestampValue,
  decodeFirebasePushKeyTime,
  sortRecordsOldestFirst,
  pruneCollection,
  schedulePruneCollection,
  schedulePruneCollections,
};
