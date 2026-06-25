const express = require("express");

const deviceAuth = require("../middleware/deviceAuth");
const { createSmartHomeCommand } = require("../lib/smartHomeCommands");

const router = express.Router();

function normalizeCommandText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAnyCommand(text, phrases) {
  const normalizedText = normalizeCommandText(text);
  return phrases.some((phrase) =>
    normalizedText.includes(normalizeCommandText(phrase)),
  );
}

function detectRobotIntent(text) {
  const normalizedText = normalizeCommandText(text);

  if (!normalizedText) {
    return null;
  }

  const lightPhrases = [
    "bật đèn",
    "tắt đèn",
    "đèn phòng",
    "đèn phòng khách",
    "mở đèn",
    "bat den",
    "tat den",
    "den phong khach",
    "turn on light",
    "turn off light",
    "light on",
    "light off",
    "ライト",
    "電気",
    "電気つけて",
    "電気消して",
  ];
  const acCoolPhrases = [
    "bật điều hòa",
    "mở điều hòa",
    "bật máy lạnh",
    "mở máy lạnh",
    "điều hòa 26",
    "máy lạnh 26",
    "lạnh 26",
    "bat dieu hoa 26 do",
    "bat dieu hoa",
    "bat may lanh",
    "cool 26",
    "ac 26",
    "冷房",
    "26度",
    "エアコンつけて",
  ];
  const acOffPhrases = [
    "tắt điều hòa",
    "tắt máy lạnh",
    "off điều hòa",
    "off máy lạnh",
    "tat dieu hoa",
    "tat may lanh",
    "turn off ac",
    "ac off",
    "停止",
    "エアコン消して",
    "エアコン止めて",
  ];

  if (includesAnyCommand(normalizedText, acOffPhrases)) {
    return {
      intent: "smart_home_ac_off",
      key: "ac_off",
      message: "Đã gửi lệnh tắt điều hòa",
    };
  }

  if (includesAnyCommand(normalizedText, acCoolPhrases)) {
    return {
      intent: "smart_home_ac_cool_26",
      key: "ac_cool_26",
      message: "Đã gửi lệnh bật điều hòa Cool 26°C",
    };
  }

  if (includesAnyCommand(normalizedText, lightPhrases)) {
    return {
      intent: "smart_home_light_toggle",
      key: "room_light_power",
      message: "Đã gửi lệnh bật/tắt đèn phòng khách",
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

  const normalizedText = normalizeCommandText(text);
  console.log("Normalized robot text:", normalizedText);

  const detectedIntent = detectRobotIntent(text);
  console.log("Detected robot intent:", detectedIntent);

  if (!detectedIntent) {
    return res.status(200).json({
      ok: false,
      error: "unknown_intent",
      message: "Chưa hiểu lệnh điều khiển",
    });
  }

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