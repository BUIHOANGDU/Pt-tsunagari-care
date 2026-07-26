const crypto = require("crypto");

const { getDb, getServerTimestamp } = require("../firebaseAdmin");
const {
  getConfiguredRecipientCount,
  sendLineMessageToCaregivers,
} = require("./lineMessagingService");

const NOTIFIABLE_EVENT_TYPES = new Set([
  "fall_confirmed",
  "danger",
  "emergency_no_response",
  "medicine_no_response",
]);
const SAFE_KEY_RE = /[.#$\[\]\/]/g;
const MAX_PREVIEW_LENGTH = 160;

function shouldNotifyCaregiver(event) {
  if (
    event?.source === "demo" &&
    !(
      process.env.LINE_NOTIFICATION_DEMO_ENABLED === "true" &&
      event?.allowDemoNotification === true
    )
  ) {
    return false;
  }
  return NOTIFIABLE_EVENT_TYPES.has(event?.type);
}

function cleanString(value, maxLength, fallback = "") {
  if (typeof value !== "string") return fallback;
  const cleaned = value.trim();
  if (!cleaned) return fallback;
  return cleaned.slice(0, maxLength);
}

function sanitizeRealtimeKey(value) {
  return String(value || "")
    .replace(SAFE_KEY_RE, "_")
    .slice(0, 180);
}

function parseTimestamp(value) {
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

function formatJapanTime(value) {
  const timestamp = parseTimestamp(value) || Date.now();
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function shortHash(parts) {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}

function getStableEventId(event) {
  const supplied = cleanString(event?.eventId, 128);
  if (supplied) return supplied;

  const fallback = cleanString(event?.dedupeKey, 180) || cleanString(event?.id, 180);
  if (fallback) return fallback;

  const timestamp =
    parseTimestamp(event?.createdAt || event?.receivedAt || event?.timestamp) ||
    Math.floor(Date.now() / 30000) * 30000;
  return `generated_${shortHash([
    event?.type || "unknown",
    event?.source || "",
    event?.status || "",
    event?.level || "",
    cleanString(event?.message, 300),
    String(timestamp),
  ])}`;
}

function buildReminderPublicId(reminderId) {
  const text = cleanString(reminderId, 128);
  if (!text) return "";
  if (text.length <= 8) return text;
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function buildMessage(event) {
  const time = formatJapanTime(event?.createdAt || event?.receivedAt);
  const source = cleanString(
    event?.cameraId || event?.source,
    80,
    event?.type === "fall_confirmed" ? "camera" : "Chami",
  );

  if (event.type === "fall_confirmed") {
    return [
      "【TsunagariCare】Phát hiện nguy cơ té ngã",
      `Thời gian: ${time} (Nhật Bản)`,
      `Nguồn: ${source}`,
      "Trạng thái: cần người chăm sóc kiểm tra.",
    ].join("\n");
  }

  if (event.type === "danger") {
    return [
      "【TsunagariCare】Người dùng yêu cầu trợ giúp",
      `Thời gian: ${time} (Nhật Bản)`,
      "Chami nhận phản hồi nguy hiểm.",
      "Vui lòng liên hệ hoặc kiểm tra ngay.",
    ].join("\n");
  }

  if (event.type === "emergency_no_response") {
    return [
      "【TsunagariCare】Không nhận được phản hồi",
      `Thời gian: ${time} (Nhật Bản)`,
      "Chami đã kiểm tra nhưng không nhận phản hồi.",
      "Cần người chăm sóc kiểm tra.",
    ].join("\n");
  }

  const attempts = Number.isInteger(event.attempts) ? event.attempts : 3;
  const medicineName = cleanString(event.medicineName, 100);
  const reminderPublicId = buildReminderPublicId(event.reminderId);
  return [
    "【TsunagariCare】Chưa xác nhận uống thuốc",
    medicineName ? `Thuốc: ${medicineName}` : "",
    `Không phản hồi sau ${attempts} lần nhắc.`,
    `Thời gian: ${time} (Nhật Bản)`,
    reminderPublicId ? `Mã nhắc: ${reminderPublicId}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildPreview(text) {
  const preview = String(text || "")
    .split("\n")
    .slice(1)
    .join(" ")
    .trim();
  return (preview || text || "").slice(0, MAX_PREVIEW_LENGTH);
}

function summarizeSendResult(sendResult) {
  const recipientCount = sendResult?.recipientCount ?? getConfiguredRecipientCount();
  const successCount = sendResult?.successCount ?? 0;
  const failureCount = sendResult?.failureCount ?? recipientCount;
  const status =
    sendResult?.status ||
    (successCount === recipientCount && recipientCount > 0
      ? "sent"
      : successCount > 0
        ? "partial"
        : "failed");
  const firstFailure = (sendResult?.results || []).find((result) => !result.ok);

  return {
    status,
    recipientCount,
    successCount,
    failureCount,
    lastError:
      sendResult?.errorMessage ||
      firstFailure?.errorMessage ||
      (status === "failed" ? "LINE send failed" : null),
  };
}

async function writeNotification(ref, payload) {
  await ref.set({
    id: ref.key,
    ...payload,
  });
}

async function notifyCaregiversForEvent(event, options = {}) {
  const eventType = event?.type || "unknown";
  const eventId = getStableEventId(event);
  console.log(`[CaregiverNotify] received eventId=${eventId} type=${eventType}`);

  if (!shouldNotifyCaregiver(event)) {
    console.log("[CaregiverNotify] skipped reason=not_eligible");
    return { ok: true, status: "skipped", reason: "not_eligible" };
  }

  const db = options.db || getDb();
  const notificationRef = db.ref("caregiver_notifications").push();
  const dedupeRef = db.ref(
    `line_notification_dedup/${sanitizeRealtimeKey(eventId)}`,
  );
  const now = getServerTimestamp();
  const lockResult = await dedupeRef.transaction((current) => {
    if (
      current &&
      (current.status !== "failed" || Number(current.retryRequests || 0) >= 3)
    ) {
      return;
    }
    return {
      eventId,
      eventType,
      notificationId: notificationRef.key,
      status: "pending",
      retryRequests: current?.retryRequests ? current.retryRequests + 1 : 0,
      createdAt: current?.createdAt || now,
      updatedAt: now,
    };
  });

  if (!lockResult.committed) {
    console.log("[CaregiverNotify] skipped reason=duplicate");
    await writeNotification(notificationRef, {
      eventId,
      eventType,
      source: cleanString(event?.source, 80, "unknown"),
      status: "skipped",
      recipientCount: 0,
      successCount: 0,
      failureCount: 0,
      messagePreview: "Bỏ qua thông báo trùng",
      createdAt: now,
      sentAt: null,
      updatedAt: now,
      lastError: "duplicate event",
    });
    return { ok: true, status: "skipped", reason: "duplicate" };
  }

  const text = buildMessage(event);
  const messagePreview = buildPreview(text);
  await writeNotification(notificationRef, {
    eventId,
    eventType,
    source: cleanString(event?.source, 80, "unknown"),
    status: "pending",
    recipientCount: getConfiguredRecipientCount(),
    successCount: 0,
    failureCount: 0,
    messagePreview,
    createdAt: now,
    sentAt: null,
    updatedAt: now,
    lastError: null,
  });
  console.log(`[CaregiverNotify] notification created id=${notificationRef.key}`);

  let summary;
  try {
    const sendResult = await sendLineMessageToCaregivers({
      text,
      eventId,
      eventType,
      notificationDisabled: Boolean(options.notificationDisabled),
    });
    summary = summarizeSendResult(sendResult);
  } catch (error) {
    summary = {
      status: "failed",
      recipientCount: getConfiguredRecipientCount(),
      successCount: 0,
      failureCount: getConfiguredRecipientCount(),
      lastError: error.message,
    };
  }

  await notificationRef.update({
    status: summary.status,
    recipientCount: summary.recipientCount,
    successCount: summary.successCount,
    failureCount: summary.failureCount,
    sentAt: getServerTimestamp(),
    updatedAt: getServerTimestamp(),
    lastError: summary.lastError,
  });
  await dedupeRef.update({
    status: summary.status,
    successCount: summary.successCount,
    failureCount: summary.failureCount,
    retryable: summary.status === "failed",
    updatedAt: getServerTimestamp(),
  });

  console.log(
    `[CaregiverNotify] completed status=${summary.status} success=${summary.successCount} failed=${summary.failureCount}`,
  );
  return {
    ok: summary.successCount > 0,
    notificationId: notificationRef.key,
    eventId,
    ...summary,
  };
}

function notifyCaregiversForEventAsync(event, options = {}) {
  notifyCaregiversForEvent(event, options).catch((error) => {
    console.error(`[CaregiverNotify] async notification failed: ${error.message}`);
  });
}

module.exports = {
  shouldNotifyCaregiver,
  buildMessage,
  notifyCaregiversForEvent,
  notifyCaregiversForEventAsync,
};
