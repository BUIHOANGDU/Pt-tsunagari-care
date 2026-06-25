const { getDb } = require("../firebaseAdmin");

function normalizeString(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function getMissingCommandField(body = {}) {
  const requiredFields = ["targetDeviceId", "type", "device", "action"];

  return requiredFields.find((field) => {
    const value = body[field];
    return typeof value !== "string" || value.trim() === "";
  });
}

function getIsoTimestamp() {
  return new Date().toISOString();
}

async function createSmartHomeCommand(commandPayload = {}) {
  const commandRef = getDb().ref("commands").push();
  const now = getIsoTimestamp();
  const targetDeviceId = normalizeString(commandPayload.targetDeviceId);
  const command = {
    id: commandRef.key,
    commandId: commandRef.key,
    targetDeviceId,
    target: targetDeviceId,
    source: normalizeString(commandPayload.source, "dashboard") || "dashboard",
    type: normalizeString(commandPayload.type),
    device: normalizeString(commandPayload.device),
    action: normalizeString(commandPayload.action),
    key: normalizeString(commandPayload.key),
    name: normalizeString(commandPayload.name),
    category: normalizeString(commandPayload.category),
    description: normalizeString(commandPayload.description),
    status: normalizeString(commandPayload.status, "pending") || "pending",
    createdAt: now,
    updatedAt: now,
  };

  await commandRef.set(command);

  return {
    commandId: commandRef.key,
    command,
  };
}

module.exports = {
  createSmartHomeCommand,
  getMissingCommandField,
};