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

Thunder Client test for Smart Home command queue:

1. Send `POST /api/smart-home/commands`
2. Add header `Content-Type: application/json`
3. If `TSUNAGARI_DEVICE_TOKEN` is configured, add header `x-device-token: <your token>`
4. Example body:

```json
{
  "targetDeviceId": "smart_home_001",
  "source": "dashboard",
  "type": "ir_learn",
  "device": "ir_hub_001",
  "action": "start",
  "key": "room_light_power",
  "name": "Den phong bat tat",
  "category": "light",
  "description": "Nut bat tat den phong",
  "status": "pending"
}
```

5. Verify the response includes `ok: true` and a `commandId`
6. Then call `GET /api/smart-home/commands/next?deviceId=smart_home_001` to confirm the command is visible in the queue

Thunder Client test for IR command storage:

1. Send `POST /api/smart-home/ir-commands`
2. Add header `Content-Type: application/json`
3. If `TSUNAGARI_DEVICE_TOKEN` is configured, add header `x-device-token: <your token>`
4. Example body:

```json
{
  "deviceId": "smart_home_001",
  "irHubDeviceId": "ir_hub_001",
  "key": "ac_cool_26",
  "name": "Dieu hoa cool 26",
  "category": "aircon",
  "description": "Bat dieu hoa che do cool 26 do",
  "protocol": "MULTIBRACKETS",
  "bits": 8,
  "valueHex": "0xC0",
  "rawData": [29724, 49406, 3336, 1690, 380],
  "rawLength": 100,
  "frequency": 38,
  "source": "esp32-ir-learn"
}
```

5. Verify the response includes `ok: true`, `key: "ac_cool_26"`, and the saved command payload
6. Then call `GET /api/smart-home/ir-commands/ac_cool_26`
7. Verify the response returns `found: true` and the stored IR command data

Thunder Client test for Robot Voice Command:

1. Send `POST https://pt-tsunagari-care.onrender.com/api/robot/voice-command`
2. Add headers:

```txt
Content-Type: application/json
x-device-token: DEV_TOKEN
```

3. Test light command:

```json
{
  "deviceId": "chami_001",
  "text": "Chami bật đèn phòng khách"
}
```

4. Test aircon cool 26 command:

```json
{
  "deviceId": "chami_001",
  "text": "Chami bật điều hòa 26 độ"
}
```

5. Test aircon off command:

```json
{
  "deviceId": "chami_001",
  "text": "Chami tắt điều hòa"
}
```

6. Expected backend response:

- `ok: true`
- `commandId` is present
- `intent` maps to one of:
  - `smart_home_light_toggle`
  - `smart_home_ac_cool_26`
  - `smart_home_ac_off`

7. The backend stores the generated IR command in the existing Realtime Database queue at `commands/{pushId}`.
8. Then the ESP32 Smart Home Bridge should log:

- `IR send command received`
- `IR send key: room_light_power` or `ac_cool_26` or `ac_off`
- `IR command sent`
- `result=ir_sent`