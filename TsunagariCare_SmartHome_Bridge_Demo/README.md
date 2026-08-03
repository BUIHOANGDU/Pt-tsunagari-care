# TsunagariCare Smart Home Bridge Demo

This is the new ESP32 Smart Home demo that talks to the Tsunagari Bridge API over HTTP.

The old Firebase direct demo is still kept separately in:

```text
../TsunagariCare_SmartHome_Demo
```

## Architecture

```text
ESP32 Smart Home
-> Tsunagari Bridge API
-> Firebase Realtime Database
-> Web Dashboard
```

ESP32 does not call Firebase directly in this version. It does not use `DATABASE_URL`, Firebase keys, or a service account.

## Config

Copy the example config:

```text
config.example.h -> config.h
```

Then edit `config.h` with local values:

```cpp
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define BRIDGE_API_URL "https://pt-tsunagari-care.onrender.com"
#define DEVICE_TOKEN "YOUR_DEVICE_TOKEN"
#define SMART_HOME_DEVICE_ID "smart_home_001"
#define LIGHT_DEVICE_ID "light_001"
#define IR_HUB_DEVICE_ID "ir_hub_001"
#define IR_RECEIVE_PIN 33
#define IR_SEND_PIN 17
#define LED_PIN 2
```

`BRIDGE_API_URL` can point to the deployed Render Bridge API over HTTPS. For local testing, `http://192.168.x.x:3001` still works. Do not use `localhost` on ESP32, because `localhost` means the ESP32 itself.

On Windows, get the computer IP address with:

```powershell
ipconfig
```

Use the IPv4 address of the active Wi-Fi or Ethernet adapter, for example:

```text
http://192.168.1.25:3001
```

## Run Bridge API

From the main web/API project, run:

```bash
npm run bridge
```

Make sure the ESP32 and the computer running the Bridge API are on the same LAN.

## Required Arduino Libraries

- WiFi
- HTTPClient
- ArduinoJson
- IRremoteESP8266

## IR Wiring

KY-022 IR Receiver:

- VCC -> 3.3V
- GND -> GND
- OUT -> GPIO33

IR LED 940nm via transistor:

- GPIO17 -> 1k ohm resistor -> Base of 2N2222 or 2N3904
- Emitter -> GND
- Collector -> IR LED negative leg
- IR LED positive leg -> 100 ohm resistor -> 3.3V
- ESP32 GND must be shared with the IR circuit GND

## Bridge API Endpoints Used

Get the next command:

```text
GET /api/smart-home/commands/next?deviceId=smart_home_001
Header: x-device-token: DEVICE_TOKEN
```

Update device status:

```text
POST /api/smart-home/device-status
Header: x-device-token: DEVICE_TOKEN
```

Mark command done:

```text
POST /api/smart-home/commands/{commandId}/done
Header: x-device-token: DEVICE_TOKEN
```

Save learned IR command:

```text
POST /api/smart-home/ir-commands
Header: x-device-token: DEVICE_TOKEN
```

Fetch saved IR command:

```text
GET /api/smart-home/ir-commands/{key}
Header: x-device-token: DEVICE_TOKEN
```

## Command Schema

The Bridge API returns commands like:

```json
{
  "id": "...",
  "target": "smart_home_001",
  "type": "device_control",
  "device": "light_001",
  "action": "on",
  "status": "pending"
}
```

Supported actions for `light_001`:

- `on`
- `off`
- `toggle`

## Quick Test

1. Start the Bridge API with `npm run bridge`.
2. Create `config.h` from `config.example.h`.
3. Set `BRIDGE_API_URL` to the Render URL or your local Bridge API URL.
4. Upload `TsunagariCare_SmartHome_Bridge_Demo.ino` to ESP32.
5. Open Serial Monitor at `115200`.
6. Create a smart-home command from the dashboard or Bridge API.
7. Watch ESP32 receive the pending command, update the onboard LED, post device status, and mark the command done.

After a command is marked done, the dashboard may hide it because the dashboard only shows pending commands.

## KY-022 Learn Test

1. Upload the sketch to ESP32.
2. Create an `ir_learn` command.
3. Check that Serial Monitor shows `IR learn started`.
4. Point the remote at the KY-022 receiver.
5. Press a remote button.
6. Confirm Serial Monitor shows:
   - `IR received`
   - `Protocol`
   - `Bits`
   - `Value`
   - `Raw length`
   - `Raw preview`
   - optional warning: `WARNING: IR raw buffer overflow. Increase IR_CAPTURE_BUFFER_SIZE.`
   - `Saving IR command to backend...`
   - `Save status: 200`
   - `IR command learned and saved`

After a successful IR learn save, the IR hub status becomes:

- `learned_saved:<key>`

If backend save fails, the IR hub status becomes:

- `learn_save_failed:<key>`

Air conditioner notes:

- Air conditioner IR payloads are usually much longer than simple light or TV remote commands.
- This sketch now uses a larger capture buffer and a larger send buffer for AC-style payloads.
- If the air conditioner still does not react even though the command result is `ir_sent`, learn `ac_cool_26` and `ac_off` again after increasing the buffer.
- When testing air conditioner commands, place the IR LED close to the air conditioner receiver and point it directly at the indoor unit.

## IR Send Test

Create an `ir_send` command such as:

```json
{
  "targetDeviceId": "smart_home_001",
  "source": "dashboard",
  "type": "ir_send",
  "device": "ir_hub_001",
  "action": "send",
  "key": "room_light_power",
  "status": "pending"
}
```

You can also use:

```json
{
  "targetDeviceId": "smart_home_001",
  "source": "dashboard",
  "type": "ir_send",
  "device": "ir_hub_001",
  "action": "send",
  "irCommandId": "ac_cool_26",
  "status": "pending"
}
```

Example keys to test:

- `room_light_power`
- `ac_cool_26`
- `ac_off`

Expected Serial flow:

- `IR send command received`
- `IR send key: ...`
- `Fetching IR command: /api/smart-home/ir-commands/...`
- `Fetched IR raw length: ...`
- `Fetched IR frequency: ...`
- `Sending raw IR, rawLength=... frequency=...`
- `IR command sent`

For `ac_*` keys such as `ac_cool_26` and `ac_off`, the sketch sends the raw IR payload 3 times with a short delay between repeats for better reliability.

## Notes

This sketch only demos the onboard LED. It does not control a real relay, lamp, fan, or air conditioner yet.
