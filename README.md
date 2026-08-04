# TsunagariCare

TsunagariCare is a care dashboard and bridge API for Chami robot, smart-home,
medicine reminder, fall response, and health monitoring demos.

## Project Structure

- `server/` - Render backend production
- `tsunagari-care/` - GitHub Pages frontend production
- `docs/` - project documentation
- `.github/workflows/` - deployment workflows
- `PROJECT_HISTORY.md` - canonical changelog
- `AGENTS.md` - canonical editing rules

## Canonical Paths

Backend production exists only in `server/`. Render uses the repository root
and runs:

```bash
npm run bridge
```

The root `package.json` script points to `server/index.js`.

Frontend production exists only in `tsunagari-care/`. The GitHub Pages workflow
uploads `./tsunagari-care`.

## Run Locally

Backend, from the repository root:

```bash
npm install
npm run bridge
```

Frontend, from the repository root:

```bash
cd tsunagari-care
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Firebase

The GitHub Pages frontend uses Firebase Web Config in:

```text
tsunagari-care/src/js/firebase-config.js
```

This file contains public Firebase Web App identifiers only. Do not put Firebase
Admin credentials, LINE tokens, device tokens, service account JSON, private
keys, or `.env` values in frontend files.

Backend secrets belong in Render environment variables and local `.env` files.
Never commit them.

## Deployment Notes

- Render backend production runs from root `server/`.
- GitHub Pages frontend production deploys `tsunagari-care/`.
- Project-wide documentation belongs in root `docs/`.
- All change history belongs in root `PROJECT_HISTORY.md`.

## Render Keep-Alive

The workflow `.github/workflows/keep-alive.yml` can call a Render health URL
stored in the GitHub Actions secret `RENDER_HEALTH_URL`.

## Smart Home Command Test

Send `POST /api/smart-home/commands` to the root backend with
`Content-Type: application/json`. If `TSUNAGARI_DEVICE_TOKEN` is configured,
include `x-device-token`.

Example body:

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

Verify that the response includes `ok: true` and a `commandId`.

## Robot Voice Command Test

Send `POST /api/robot/voice-command` to the root backend with
`Content-Type: application/json`. If device auth is enabled, include
`x-device-token`.

Example body:

```json
{
  "deviceId": "chami_001",
  "text": "Chami bat den phong khach"
}
```

Expected response:

- `ok: true`
- `commandId` is present
- `intent` maps to a supported smart-home command
