const express = require("express");

const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "tsunagari-bridge-api",
  });
});

module.exports = router;
