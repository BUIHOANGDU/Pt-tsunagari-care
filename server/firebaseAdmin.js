const admin = require("firebase-admin");

function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!raw) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON");
  }

  try {
    const serviceAccount = JSON.parse(raw);

    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(
        /\\n/g,
        "\n",
      );
    }

    return serviceAccount;
  } catch (error) {
    throw new Error(
      `Invalid FIREBASE_SERVICE_ACCOUNT_JSON: ${error.message}`,
    );
  }
}

function getApp() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const databaseURL = process.env.FIREBASE_DATABASE_URL;

  if (!databaseURL) {
    throw new Error("Missing FIREBASE_DATABASE_URL");
  }

  return admin.initializeApp({
    credential: admin.credential.cert(parseServiceAccount()),
    databaseURL,
  });
}

function getDb() {
  return getApp().database();
}

function getServerTimestamp() {
  return admin.database.ServerValue.TIMESTAMP;
}

module.exports = {
  getDb,
  getServerTimestamp,
};
