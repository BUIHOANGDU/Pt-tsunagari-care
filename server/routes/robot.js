const express = require("express");

const deviceAuth = require("../middleware/deviceAuth");
const { createSmartHomeCommand } = require("../lib/smartHomeCommands");

const router = express.Router();

function normalizeIntentText(text) {
  const normalized = typeof text === "string"
    ? text.trim().toLowerCase().replace(/\s+/g, " ")
    : "";

  const accentless = normalized
    ? normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    : "";

  return {
    normalized,
    accentless,
  };
}

function includesAny(text, phrases) {
  return phrases.some((phrase) => text.includes(phrase));
}

function detectRobotIntent(text) {
  const { normalized, accentless } = normalizeIntentText(text);

  if (!normalized) {
    return null;
  }

  const lightPhrases = [
    "bat den",
    "tat den",
    "den phong",
    "den phong khach",
    "mo den",
    "turn on light",
    "turn off light",
    "light on",
    "light off",
  ];
  const acCoolPhrases = [
    "bat dieu hoa",
    "mo dieu hoa",
    "bat may lanh",
    "mo may lanh",
    "dieu hoa 26",
    "may lanh 26",
    "lanh 26",
    "cool 26",
    "ac 26",
  ];
  const acOffPhrases = [
    "tat dieu hoa",
    "tat may lanh",
    "off dieu hoa",
    "off may lanh",
    "turn off ac",
    "ac off",
  ];

  if (
    includesAny(accentless, lightPhrases) ||
    includesAny(normalized, ["ライト", "電気", "電気つけて", "電気消して"])
  ) {
    return {
      intent: "smart_home_light_toggle",
      key: "room_light_power",
      message: "Đã gửi lệnh bật/tắt đèn phòng khách",
    };
  }

  if (
    includesAny(accentless, acCoolPhrases) ||
    includesAny(normalized, ["冷房", "26度", "エアコンつけて"])
  ) {
    return {
      intent: "smart_home_ac_cool_26",
      key: "ac_cool_26",
      message: "Đã gửi lệnh bật điều hòa Cool 26°C",
    };
  }

  if (
    includesAny(accentless, acOffPhrases) ||
    includesAny(normalized, ["停止", "エアコン消して", "エアコン止めて"])
  ) {
    return {
      intent: "smart_home_ac_off",
      key: "ac_off",
      message: "Đã gửi lệnh tắt điều hòa",
    };
  }

  return null;
}

router.post("/voice-command", deviceAuth, async (req, res) => {
  const deviceId = typeof req.body?.deviceId === "string" ? req.body.deviceId.trim() : "";
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";

  if (!deviceId) {
    return res.status(400).json({
      ok: false,
      error: "missing_field",
      message: "deviceId is required",
    });
  }

  if (!text) {
    return res.status(400).json({
      ok: false,
      error: "missing_field",
      message: "text is required",
    });
  }

  console.log(`Robot voice command received: deviceId=${deviceId} text=${text}`);

  const detectedIntent = detectRobotIntent(text);

  if (!detectedIntent) {
    console.log(`Detected intent: unknown for deviceId=${deviceId}`);
    return res.status(200).json({
      ok: false,
      error: "unknown_intent",
      message: "Chưa hiểu lệnh điều khiển",
    });
  }

  console.log(
    `Detected intent: ${detectedIntent.intent} key=${detectedIntent.key} deviceId=${deviceId}`,
  );

  try {
    const { commandId } = await createSmartHomeCommand({
      targetDeviceId: "smart_home_001",
      source: "chami_robot",
      type: "ir_send",
      device: "ir_hub_001",
      action: "send",
      key: detectedIntent.key,
      status: "pending",
    });

    console.log(
      `Created smart home command: commandId=${commandId} key=${detectedIntent.key}`,
    );

    return res.status(200).json({
      ok: true,
      intent: detectedIntent.intent,
      key: detectedIntent.key,
      commandId,
      message: detectedIntent.message,
    });
  } catch (error) {
    console.error("Robot voice command failed:", error);

    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

module.exports = router;