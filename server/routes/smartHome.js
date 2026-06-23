const express = require("express");

const deviceAuth = require("../middleware/deviceAuth");
const { getDb, getServerTimestamp } = require("../firebaseAdmin");

const router = express.Router();

router.post("/command", deviceAuth, async (req, res) => {
  const {
    source = "chami_001",
    target = "smart_home_001",
    type = "device_control",
    device,
    action,
    text = "",
  } = req.body || {};

  if (!device) {
    return res.status(400).json({
      ok: false,
      error: "device is required",
    });
  }

  if (!action) {
    return res.status(400).json({
      ok: false,
      error: "action is required",
    });
  }

  try {
    const commandRef = getDb().ref("commands").push();

    await commandRef.set({
      source,
      target,
      type,
      device,
      action,
      text,
      status: "pending",
      createdAt: getServerTimestamp(),
    });

    return res.json({
      ok: true,
      commandId: commandRef.key,
      message: "Smart home command created",
    });
  } catch (error) {
    console.error("Smart home command creation failed:", error);

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
      error: "deviceId is required",
    });
  }

  try {
    const snapshot = await getDb().ref("commands").once("value");
    const commands = snapshot.val() || {};

    const pendingCommands = Object.entries(commands)
      .filter(([, command]) => {
        return command.target === deviceId && command.status === "pending";
      })
      .sort(([, commandA], [, commandB]) => {
        const createdAtA = commandA.createdAt || 0;
        const createdAtB = commandB.createdAt || 0;

        return createdAtA - createdAtB;
      });

    if (pendingCommands.length === 0) {
      return res.json({
        ok: true,
        hasCommand: false,
        command: null,
      });
    }

    const [commandId, command] = pendingCommands[0];

    return res.json({
      ok: true,
      hasCommand: true,
      command: {
        ...command,
        id: commandId,
      },
    });
  } catch (error) {
    console.error("Smart home next command lookup failed:", error);

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
      error: "deviceId is required",
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
        error: "Forbidden",
      });
    }

    await commandRef.remove();

    return res.json({
      ok: true,
      commandId,
      message: "Command processed and removed",
    });
  } catch (error) {
    console.error("Smart home command removal failed:", error);

    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

router.post("/device-status", deviceAuth, async (req, res) => {
  const {
    deviceId,
    name,
    type = "device",
    status,
    source = "smart_home_001",
  } = req.body || {};

  if (!deviceId) {
    return res.status(400).json({
      ok: false,
      error: "deviceId is required",
    });
  }

  if (!status) {
    return res.status(400).json({
      ok: false,
      error: "status is required",
    });
  }

  try {
    await getDb()
      .ref(`devices/${deviceId}`)
      .update({
        id: deviceId,
        name: name || deviceId,
        type,
        status,
        source,
        updatedAt: getServerTimestamp(),
      });

    return res.json({
      ok: true,
      deviceId,
      message: "Device status updated",
    });
  } catch (error) {
    console.error("Smart home device status update failed:", error);

    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

module.exports = router;
