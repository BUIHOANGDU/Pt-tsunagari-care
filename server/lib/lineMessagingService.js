const LINE_PUSH_ENDPOINT = "https://api.line.me/v2/bot/message/push";
const HTTP_TIMEOUT_MS = 10 * 1000;
const RETRY_DELAYS_MS = [2000, 5000, 15000];
const MAX_DEBUG_BODY_LENGTH = 500;

function readBooleanEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).trim().toLowerCase() === "true";
}

function parseCaregiverUserIds(raw) {
  return String(raw || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function maskRecipient(value) {
  const text = String(value || "").trim();
  if (!text) return "unknown";
  if (text.length <= 8) return `${text.slice(0, 2)}...${text.slice(-2)}`;
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function getConfig() {
  const enabled = readBooleanEnv("LINE_MESSAGING_ENABLED");
  const token = String(process.env.LINE_CHANNEL_ACCESS_TOKEN || "").trim();
  const recipients = parseCaregiverUserIds(
    process.env.LINE_CAREGIVER_USER_IDS,
  );
  const hasFetch = typeof fetch === "function";
  const reasons = [];

  if (!enabled) reasons.push("LINE_MESSAGING_ENABLED is not true");
  if (!token) reasons.push("LINE_CHANNEL_ACCESS_TOKEN is missing");
  if (recipients.length === 0) reasons.push("LINE_CAREGIVER_USER_IDS is empty");
  if (!hasFetch) reasons.push("global fetch is not available");

  return {
    enabled,
    token,
    recipients,
    hasFetch,
    configured: enabled && Boolean(token) && recipients.length > 0 && hasFetch,
    reason: reasons.join("; "),
  };
}

function logConfiguration() {
  const config = getConfig();
  console.log(
    `[LineMessaging] configuration enabled=${config.configured} recipients=${config.recipients.length}`,
  );
  if (!config.configured && config.reason) {
    console.warn(`[LineMessaging] disabled reason=${config.reason}`);
  }
}

function isLineMessagingConfigured() {
  return getConfig().configured;
}

function getConfiguredRecipientCount() {
  return getConfig().recipients.length;
}

function isRetryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readDebugBody(response) {
  try {
    const text = await response.text();
    return text.slice(0, MAX_DEBUG_BODY_LENGTH);
  } catch (error) {
    return "";
  }
}

function buildDisabledResult(to, reason) {
  return {
    ok: false,
    status: 0,
    recipientMasked: maskRecipient(to),
    errorCode: "line_not_configured",
    errorMessage: reason || "LINE Messaging API is not configured",
    retryable: false,
  };
}

async function sendLineTextMessage({ to, text, notificationDisabled = false }) {
  const config = getConfig();
  const recipientMasked = maskRecipient(to);

  if (!config.configured) {
    return buildDisabledResult(to, config.reason);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  console.log(`[LineMessaging] send start recipient=${recipientMasked}`);

  try {
    const response = await fetch(LINE_PUSH_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to,
        messages: [
          {
            type: "text",
            text,
          },
        ],
        notificationDisabled: Boolean(notificationDisabled),
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      console.log(
        `[LineMessaging] send success recipient=${recipientMasked} status=${response.status}`,
      );
      return {
        ok: true,
        status: response.status,
        recipientMasked,
        errorCode: null,
        errorMessage: null,
        retryable: false,
      };
    }

    const body = await readDebugBody(response);
    console.warn(
      `[LineMessaging] send failed recipient=${recipientMasked} status=${response.status}`,
    );
    return {
      ok: false,
      status: response.status,
      recipientMasked,
      errorCode: "line_http_error",
      errorMessage: body || response.statusText || "LINE push failed",
      retryable: isRetryableStatus(response.status),
    };
  } catch (error) {
    clearTimeout(timeout);
    const timedOut = error?.name === "AbortError";
    console.warn(
      `[LineMessaging] send failed recipient=${recipientMasked} status=${timedOut ? "timeout" : "network"}`,
    );
    return {
      ok: false,
      status: 0,
      recipientMasked,
      errorCode: timedOut ? "line_timeout" : "line_network_error",
      errorMessage: timedOut ? "LINE request timed out" : error.message,
      retryable: true,
    };
  }
}

async function sendLineTextMessageWithRetry(params) {
  let lastResult = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    lastResult = await sendLineTextMessage(params);
    if (lastResult.ok || !lastResult.retryable) {
      return lastResult;
    }
    if (attempt < RETRY_DELAYS_MS.length) {
      await wait(RETRY_DELAYS_MS[attempt]);
    }
  }

  return lastResult;
}

async function sendLineMessageToCaregivers({
  text,
  eventId,
  eventType,
  notificationDisabled = false,
}) {
  const config = getConfig();

  if (!config.configured) {
    return {
      ok: false,
      eventId,
      eventType,
      status: "failed",
      recipientCount: config.recipients.length,
      successCount: 0,
      failureCount: config.recipients.length,
      results: config.recipients.map((recipient) =>
        buildDisabledResult(recipient, config.reason),
      ),
      disabled: true,
      errorMessage: config.reason || "LINE Messaging API is not configured",
    };
  }

  const results = [];
  for (const recipient of config.recipients) {
    const result = await sendLineTextMessageWithRetry({
      to: recipient,
      text,
      notificationDisabled,
    });
    results.push(result);
  }

  const successCount = results.filter((result) => result.ok).length;
  const failureCount = results.length - successCount;
  const status =
    successCount === results.length ? "sent" : successCount > 0 ? "partial" : "failed";

  return {
    ok: successCount > 0,
    eventId,
    eventType,
    status,
    recipientCount: results.length,
    successCount,
    failureCount,
    results,
    disabled: false,
    errorMessage: results.find((result) => !result.ok)?.errorMessage || null,
  };
}

logConfiguration();

module.exports = {
  isLineMessagingConfigured,
  getConfiguredRecipientCount,
  maskRecipient,
  sendLineTextMessage,
  sendLineMessageToCaregivers,
};
