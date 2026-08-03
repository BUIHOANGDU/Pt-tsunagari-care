const express = require("express");

const { getCurrentWeather } = require("../lib/weatherService");

const router = express.Router();

router.get("/current", async (req, res) => {
  const result = await getCurrentWeather();
  const statusCode = result.ok ? 200 : 503;
  return res.status(statusCode).json(result);
});

module.exports = router;
