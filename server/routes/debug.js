const express = require("express");

const deviceAuth = require("../middleware/deviceAuth");
const { getDb, getServerTimestamp } = require("../firebaseAdmin");

const router = express.Router();

router.post("/rtdb-ping", deviceAuth, async (req, res) => {
  try {
    await getDb().ref("debug/bridgePing").set({
      ok: true,
      service: "tsunagari-bridge-api",
      message: "Realtime Database connection test",
      updatedAt: getServerTimestamp(),
    });

    res.json({
      ok: true,
      message: "Realtime Database ping written",
    });
  } catch (error) {
    console.error("Realtime Database ping failed:", error);

    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

module.exports = router;
