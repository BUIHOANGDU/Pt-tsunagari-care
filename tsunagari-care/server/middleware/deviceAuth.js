function deviceAuth(req, res, next) {
  const expectedToken = process.env.TSUNAGARI_DEVICE_TOKEN;

  if (!expectedToken) {
    console.warn(
      "TSUNAGARI_DEVICE_TOKEN is not configured. Allowing request in dev mode.",
    );
    return next();
  }

  const providedToken = req.get("x-device-token");

  if (providedToken !== expectedToken) {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized",
    });
  }

  return next();
}

module.exports = deviceAuth;
