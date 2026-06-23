# TsunagariCare

TsunagariCare is a web dashboard and bridge API demo for an AI robot + IoT care scenario.

Quick start:

- Open [index.html](index.html) in a browser, or serve the project locally.
- Firebase config is optional. Without it, the dashboard runs in local demo mode.

Main folders:

- [index.html](index.html)
- [src/](src/) - frontend source
- [server/](server/) - Express bridge API
- [docs/](docs/) - architecture and schema notes

Run locally:

```bash
cd tsunagari-care

# serve the static dashboard on port 8000
python -m http.server 8000

# run the bridge API
node server/index.js
```

Then open `http://localhost:8000`.

Important notes:

- The dashboard is mock-first and can run without a real robot or ESP32.
- Commands created by the dashboard are stored in the Realtime Database / Firestore-backed command queue with `status: pending`.
- Fall detection demo runs in the browser and only stores detection metadata.

Firebase integration:

1. In Firebase Console, create a project and enable Firestore or Realtime Database as needed.
2. Create a Web App and copy the config object.
3. Create `src/js/firebase-config.js`:

```js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "...",
  appId: "...",
};
```

4. Add Firebase SDK script tags in `index.html` before `src/js/firebase-service.js`.
5. Reload the page.

Security note:

- Never commit `src/js/firebase-config.js` with real keys.
- Use `src/js/firebase-config.js.example` as the template.

Render keep-alive:

1. In your GitHub repository, go to `Settings > Secrets and variables > Actions`.
2. Add a secret named `RENDER_HEALTH_URL`.
3. Example value: `https://your-app.onrender.com/health`
4. The workflow [`.github/workflows/keep-alive.yml`](.github/workflows/keep-alive.yml) calls this URL every 5 minutes using `curl -fsS`.

Note:

- This keep-alive setup is intended for demo/dev usage.
- For production, prefer a paid Render instance or a more suitable platform such as Firebase Hosting or Cloud Functions.
