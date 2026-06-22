const express = require("express");

const deviceAuth = require("../middleware/deviceAuth");
const { getDb, getServerTimestamp } = require("../firebaseAdmin");

const router = express.Router();

router.post("/state", deviceAuth, async (req, res) => {
  const {
    deviceId,
    name,
    online = true,
    state,
    emotion,
    battery = null,
  } = req.body || {};

  if (!deviceId) {
    return res.status(400).json({
      ok: false,
      error: "Missing deviceId",
    });
  }

  try {
    await getDb().ref(`devices/${deviceId}`).set({
      id: deviceId,
      name: name || "Chami Robot",
      type: "ai_robot",
      online,
      state: state || "unknown",
      emotion: emotion || "unknown",
      battery,
      lastSeen: getServerTimestamp(),
      updatedAt: getServerTimestamp(),
    });

    return res.json({
      ok: true,
      deviceId,
      message: "Chami state updated",
    });
  } catch (error) {
    console.error("Chami state update failed:", error);

    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

router.post("/alert", deviceAuth, async (req, res) => {
  const {
    source,
    type,
    level,
    message,
  } = req.body || {};

  try {
    const alertRef = getDb().ref("alerts").push();

    await alertRef.set({
      source: source || "chami_001",
      type: type || "unknown",
      level: level || "warning",
      message: message || "Robot Chami sent an alert.",
      status: "new",
      createdAt: getServerTimestamp(),
    });

    return res.json({
      ok: true,
      alertId: alertRef.key,
      message: "Chami alert created",
    });
  } catch (error) {
    console.error("Chami alert creation failed:", error);

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
      error: "Missing deviceId",
    });
  }

  try {
    const snapshot = await getDb()
      .ref("commands")
      .orderByChild("target")
      .equalTo(deviceId)
      .once("value");

    let nextCommand = null;

    snapshot.forEach((childSnapshot) => {
      const command = childSnapshot.val();

      if (!command || command.status !== "pending") {
        return;
      }

      const createdAt = command.createdAt || Number.MAX_SAFE_INTEGER;

      if (!nextCommand || createdAt < nextCommand.createdAt) {
        nextCommand = {
          id: childSnapshot.key,
          createdAt,
          data: command,
        };
      }
    });

    if (!nextCommand) {
      return res.json({
        ok: true,
        hasCommand: false,
        command: null,
      });
    }

    return res.json({
      ok: true,
      hasCommand: true,
      command: {
        ...nextCommand.data,
        id: nextCommand.id,
      },
    });
  } catch (error) {
    console.error("Chami command lookup failed:", error);

    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

router.post("/commands/:commandId/done", deviceAuth, async (req, res) => {
  const { commandId } = req.params;
  const { deviceId, result, message } = req.body || {};

  if (!deviceId) {
    return res.status(400).json({
      ok: false,
      error: "Missing deviceId",
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
        error: "Command target does not match deviceId",
      });
    }

    await commandRef.update({
      status: "done",
      doneAt: getServerTimestamp(),
      result: result || "done",
      resultMessage: message || "",
    });

    return res.json({
      ok: true,
      commandId,
      message: "Command marked as done",
    });
  } catch (error) {
    console.error("Chami command completion failed:", error);

    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

module.exports = router;
