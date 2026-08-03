#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <IRremoteESP8266.h>
#include <IRrecv.h>
#include <IRsend.h>
#include <IRutils.h>
#include "config.h"

const unsigned long CHECK_INTERVAL_MS = 3000;
const uint16_t IR_CAPTURE_BUFFER_SIZE = 1024;
const uint8_t IR_CAPTURE_TIMEOUT_MS = 50;
const uint16_t IR_SEND_RAW_BUFFER_SIZE = 1024;

bool lightIsOn = false;
unsigned long lastCheckAt = 0;
bool irLearnMode = false;
unsigned long irLearnStartedAt = 0;
const unsigned long IR_LEARN_TIMEOUT_MS = 30000;
String pendingLearnCommandId = "";
String pendingLearnKey = "";
String pendingLearnName = "";
String pendingLearnCategory = "";
String pendingLearnDescription = "";
IRrecv irrecv(
    IR_RECEIVE_PIN,
    IR_CAPTURE_BUFFER_SIZE,
    IR_CAPTURE_TIMEOUT_MS,
    true);
IRsend irsend(IR_SEND_PIN);
decode_results irResults;

void connectWiFi()
{
  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED)
  {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("Wi-Fi connected");
  Serial.print("ESP32 IP: ");
  Serial.println(WiFi.localIP());
}

bool isHttpsBridgeUrl(const String &url)
{
  return url.startsWith("https://");
}

bool beginBridgeRequest(
    HTTPClient &http,
    WiFiClientSecure &secureClient,
    const String &url,
    const String &method)
{
  if (isHttpsBridgeUrl(url))
  {
    Serial.print(method);
    Serial.println(" using HTTPS transport");
    secureClient.setInsecure();

    if (!http.begin(secureClient, url))
    {
      Serial.print(method);
      Serial.println(" HTTPS begin failed. Check URL, TLS support, and network.");
      return false;
    }

    return true;
  }

  Serial.print(method);
  Serial.println(" using HTTP transport");

  if (!http.begin(url))
  {
    Serial.print(method);
    Serial.println(" HTTP begin failed. Check Bridge API URL.");
    return false;
  }

  return true;
}

void logBridgeResponse(
    const String &method,
    int statusCode,
    const String &payload,
    bool usingHttps,
    HTTPClient &http)
{
  Serial.print(method);
  Serial.print(" status: ");
  Serial.println(statusCode);

  if (statusCode < 0)
  {
    Serial.print(usingHttps ? "HTTPS " : "HTTP ");
    Serial.print(method);
    Serial.print(" error: ");
    Serial.println(http.errorToString(statusCode));
  }

  Serial.print(method);
  Serial.print(" response: ");
  Serial.println(payload);
}

String httpGetBridge(const String &path)
{
  if (WiFi.status() != WL_CONNECTED)
  {
    Serial.println("Wi-Fi disconnected, reconnecting before GET");
    connectWiFi();
  }

  HTTPClient http;
  WiFiClientSecure secureClient;
  String url = String(BRIDGE_API_URL) + path;
  bool usingHttps = isHttpsBridgeUrl(url);

  Serial.print("GET ");
  Serial.println(url);

  if (!beginBridgeRequest(http, secureClient, url, "GET"))
  {
    return "";
  }

  http.addHeader("x-device-token", DEVICE_TOKEN);

  int statusCode = http.GET();
  String payload = http.getString();

  logBridgeResponse("GET", statusCode, payload, usingHttps, http);

  http.end();
  return payload;
}

String httpPostBridge(const String &path, const String &jsonBody)
{
  if (WiFi.status() != WL_CONNECTED)
  {
    Serial.println("Wi-Fi disconnected, reconnecting before POST");
    connectWiFi();
  }

  HTTPClient http;
  WiFiClientSecure secureClient;
  String url = String(BRIDGE_API_URL) + path;
  bool usingHttps = isHttpsBridgeUrl(url);

  Serial.print("POST ");
  Serial.println(url);
  Serial.print("POST body: ");
  Serial.println(jsonBody);

  if (!beginBridgeRequest(http, secureClient, url, "POST"))
  {
    return "";
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-token", DEVICE_TOKEN);

  int statusCode = http.POST(jsonBody);
  String payload = http.getString();

  logBridgeResponse("POST", statusCode, payload, usingHttps, http);

  http.end();
  return payload;
}

int httpPostBridgeStatus(
    const String &path,
    const String &jsonBody,
    String *responsePayload)
{
  if (WiFi.status() != WL_CONNECTED)
  {
    Serial.println("Wi-Fi disconnected, reconnecting before POST");
    connectWiFi();
  }

  HTTPClient http;
  WiFiClientSecure secureClient;
  String url = String(BRIDGE_API_URL) + path;
  bool usingHttps = isHttpsBridgeUrl(url);

  Serial.print("POST ");
  Serial.println(url);
  Serial.print("POST body length: ");
  Serial.println(jsonBody.length());
  Serial.print("POST body: ");
  Serial.println(jsonBody);

  if (!beginBridgeRequest(http, secureClient, url, "POST"))
  {
    if (responsePayload != nullptr)
    {
      *responsePayload = "";
    }
    return -1;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-token", DEVICE_TOKEN);

  int statusCode = http.POST(jsonBody);
  String payload = http.getString();

  if (responsePayload != nullptr)
  {
    *responsePayload = payload;
  }

  logBridgeResponse("POST", statusCode, payload, usingHttps, http);
  http.end();
  return statusCode;
}

void setupIR()
{
  irrecv.enableIRIn();
  irsend.begin();
  Serial.println("IR receiver and sender started");
  Serial.print("IR receive pin: ");
  Serial.println(IR_RECEIVE_PIN);
  Serial.print("IR send pin: ");
  Serial.println(IR_SEND_PIN);
}

void clearIRLearnState()
{
  irLearnMode = false;
  pendingLearnCommandId = "";
  pendingLearnKey = "";
  pendingLearnName = "";
  pendingLearnCategory = "";
  pendingLearnDescription = "";
}

String uint64ToHexString(uint64_t value)
{
  if (value == 0)
  {
    return "0x0";
  }

  const char *digits = "0123456789ABCDEF";
  char buffer[19];
  buffer[18] = '\0';
  int index = 17;

  while (value > 0 && index >= 2)
  {
    buffer[index--] = digits[value & 0xF];
    value >>= 4;
  }

  buffer[index--] = 'x';
  buffer[index] = '0';

  return String(&buffer[index]);
}

String jsonEscape(const String &value)
{
  String escaped;
  escaped.reserve(value.length() + 8);

  for (size_t i = 0; i < value.length(); i++)
  {
    char ch = value.charAt(i);

    if (ch == '\\' || ch == '"')
    {
      escaped += '\\';
    }

    escaped += ch;
  }

  return escaped;
}

size_t getLearnedRawDataCount(decode_results &results)
{
  if (results.rawlen <= 1)
  {
    return 0;
  }

  return results.rawlen - 1;
}

String buildRawDataJsonArray(decode_results &results)
{
  size_t rawCount = getLearnedRawDataCount(results);
  Serial.print("IR raw count to save: ");
  Serial.println(rawCount);

  if (rawCount == 0)
  {
    return "[]";
  }

  String rawJson = "[";

  for (uint16_t i = 1; i < results.rawlen; i++)
  {
    uint32_t micros = results.rawbuf[i] * kRawTick;
    rawJson += String(micros);

    if (i + 1 < results.rawlen)
    {
      rawJson += ",";
    }
  }

  rawJson += "]";
  return rawJson;
}

void printIRRawPreview(decode_results &results)
{
  uint16_t previewLength = results.rawlen < 20 ? results.rawlen : 20;

  Serial.print("Raw preview (us): ");

  for (uint16_t i = 0; i < previewLength; i++)
  {
    uint32_t micros = results.rawbuf[i] * kRawTick;
    Serial.print(micros);

    if (i + 1 < previewLength)
    {
      Serial.print(", ");
    }
  }

  Serial.println();
}

bool saveLearnedIRCommand(
    const String &key,
    const String &name,
    const String &category,
    const String &description,
    decode_results &results)
{
  String rawDataJson = buildRawDataJsonArray(results);
  size_t rawCount = getLearnedRawDataCount(results);
  String protocol = typeToString(results.decode_type);
  String valueHex = uint64ToHexString(results.value);

  String body = "{";
  body += "\"deviceId\":\"" + jsonEscape(String(SMART_HOME_DEVICE_ID)) + "\",";
  body += "\"irHubDeviceId\":\"" + jsonEscape(String(IR_HUB_DEVICE_ID)) + "\",";
  body += "\"key\":\"" + jsonEscape(key) + "\",";
  body += "\"name\":\"" + jsonEscape(name) + "\",";
  body += "\"category\":\"" + jsonEscape(category) + "\",";
  body += "\"description\":\"" + jsonEscape(description) + "\",";
  body += "\"protocol\":\"" + jsonEscape(protocol) + "\",";
  body += "\"bits\":" + String(results.bits) + ",";
  body += "\"valueHex\":\"" + jsonEscape(valueHex) + "\",";
  body += "\"rawData\":" + rawDataJson + ",";
  body += "\"rawLength\":" + String(rawCount) + ",";
  body += "\"frequency\":38,";
  body += "\"source\":\"esp32-ir-learn\"";
  body += "}";

  Serial.println("Saving IR command to backend...");
  String responsePayload;
  int statusCode = httpPostBridgeStatus(
      "/api/smart-home/ir-commands",
      body,
      &responsePayload);

  Serial.print("Save status: ");
  Serial.println(statusCode);

  if (statusCode >= 200 && statusCode < 300)
  {
    Serial.println("IR command learned and saved");
    return true;
  }

  Serial.println("IR command save failed");
  Serial.print("Save response: ");
  Serial.println(responsePayload);
  return false;
}

bool fetchIRCommandRawData(
    const String &key,
    uint16_t *rawBuffer,
    uint16_t maxLength,
    uint16_t *outLength,
    uint16_t *outFrequency)
{
  if (rawBuffer == nullptr || outLength == nullptr || outFrequency == nullptr)
  {
    Serial.println("fetchIRCommandRawData received null output pointer");
    return false;
  }

  *outLength = 0;
  *outFrequency = 38;

  if (key == "")
  {
    Serial.println("fetchIRCommandRawData missing key");
    return false;
  }

  String path = "/api/smart-home/ir-commands/" + key;
  Serial.print("Fetching IR command: ");
  Serial.println(path);

  String payload = httpGetBridge(path);
  if (payload == "")
  {
    Serial.println("IR command fetch returned empty payload");
    return false;
  }

  DynamicJsonDocument doc(payload.length() + 2048);
  DeserializationError error = deserializeJson(doc, payload);

  if (error)
  {
    Serial.print("Failed to parse IR command response: ");
    Serial.println(error.c_str());
    return false;
  }

  bool found = doc["found"] | false;
  if (!found)
  {
    Serial.println("IR command not found in backend");
    return false;
  }

  JsonObject command = doc["command"].as<JsonObject>();
  JsonArray rawData = command["rawData"].as<JsonArray>();
  if (rawData.isNull() || rawData.size() == 0)
  {
    Serial.println("IR command rawData is empty");
    return false;
  }

  if (rawData.size() > maxLength)
  {
    Serial.print("IR command rawData too long: ");
    Serial.print(rawData.size());
    Serial.print(" > ");
    Serial.println(maxLength);
    Serial.println("Increase IR_SEND_RAW_BUFFER_SIZE for long IR payloads.");
    return false;
  }

  for (uint16_t i = 0; i < rawData.size(); i++)
  {
    uint32_t value = rawData[i] | 0;
    if (value > 65535)
    {
      Serial.print("IR raw value too large for uint16 at index ");
      Serial.print(i);
      Serial.print(": ");
      Serial.println(value);
      return false;
    }
    rawBuffer[i] = static_cast<uint16_t>(value);
  }

  *outLength = rawData.size();
  *outFrequency = command["frequency"] | 38;

  Serial.print("Fetched IR raw length: ");
  Serial.println(*outLength);
  Serial.print("Fetched IR frequency: ");
  Serial.println(*outFrequency);
  return true;
}

void sendSavedIRCommand(const String &commandId, const String &key)
{
  uint16_t rawBuffer[IR_SEND_RAW_BUFFER_SIZE];
  uint16_t rawLength = 0;
  uint16_t frequency = 38;

  Serial.println("IR send command received");
  Serial.print("IR send key: ");
  Serial.println(key);

  updateDeviceStatus(IR_HUB_DEVICE_ID, "sending:" + key);

  if (!fetchIRCommandRawData(key, rawBuffer, IR_SEND_RAW_BUFFER_SIZE, &rawLength, &frequency))
  {
    updateDeviceStatus(IR_HUB_DEVICE_ID, "send_failed:" + key);
    markCommandDone(commandId, "ir_command_not_found", "IR command not found or invalid");
    return;
  }

  const bool isAirconKey = key.startsWith("ac_");
  const uint8_t repeatCount = isAirconKey ? 3 : 1;

  Serial.print("Sending raw IR, rawLength=");
  Serial.print(rawLength);
  Serial.print(" frequency=");
  Serial.println(frequency);

  for (uint8_t repeatIndex = 0; repeatIndex < repeatCount; repeatIndex++)
  {
    if (isAirconKey)
    {
      Serial.print("Sending aircon IR repeat ");
      Serial.print(repeatIndex + 1);
      Serial.print("/");
      Serial.println(repeatCount);
    }

    irsend.sendRaw(rawBuffer, rawLength, frequency);

    if (repeatIndex + 1 < repeatCount)
    {
      delay(300);
    }
  }

  delay(100);

  Serial.println("IR command sent");
  updateDeviceStatus(IR_HUB_DEVICE_ID, "sent:" + key);
  markCommandDone(commandId, "ir_sent", "IR command sent");
}

void updateDeviceStatusDetailed(
    const String &deviceId,
    const String &name,
    const String &type,
    const String &status)
{
  StaticJsonDocument<256> doc;
  doc["deviceId"] = deviceId;
  doc["name"] = name;
  doc["type"] = type;
  doc["status"] = status;
  doc["source"] = SMART_HOME_DEVICE_ID;

  String body;
  serializeJson(doc, body);

  Serial.print("Updating device status: ");
  Serial.print(deviceId);
  Serial.print(" -> ");
  Serial.println(status);

  httpPostBridge("/api/smart-home/device-status", body);
}

void updateDeviceStatus(const String &deviceId, const String &status)
{
  if (deviceId == LIGHT_DEVICE_ID)
  {
    updateDeviceStatusDetailed(deviceId, "Den phong khach", "light", status);
    return;
  }

  if (deviceId == IR_HUB_DEVICE_ID)
  {
    updateDeviceStatusDetailed(deviceId, "IR Hub", "ir_hub", status);
    return;
  }

  updateDeviceStatusDetailed(deviceId, "Unknown Device", "unknown", status);
}

void markCommandDone(const String &commandId, const String &result, const String &message)
{
  StaticJsonDocument<256> doc;
  doc["deviceId"] = SMART_HOME_DEVICE_ID;
  doc["result"] = result;
  doc["message"] = message;

  String body;
  serializeJson(doc, body);

  Serial.print("Marking command done: ");
  Serial.print(commandId);
  Serial.print(" result=");
  Serial.println(result);

  httpPostBridge("/api/smart-home/commands/" + commandId + "/done", body);
}

void startIRLearnMode(
    const String &commandId,
    const String &key,
    const String &name,
    const String &category,
    const String &description)
{
  if (irLearnMode == true)
  {
    markCommandDone(commandId, "ir_learn_busy", "IR learn mode is already running");
    return;
  }

  irLearnMode = true;
  irLearnStartedAt = millis();
  pendingLearnCommandId = commandId;
  pendingLearnKey = key;
  pendingLearnName = name;
  pendingLearnCategory = category;
  pendingLearnDescription = description;

  irrecv.resume();
  updateDeviceStatus(IR_HUB_DEVICE_ID, "learning:" + key);

  Serial.println("IR learn started");
  Serial.print("Key: ");
  Serial.println(key);
  Serial.print("Name: ");
  Serial.println(name);
  Serial.println("Please point remote to KY-022 and press a button within 30 seconds");
}

void handleIRLearnMode()
{
  if (irLearnMode == false)
  {
    return;
  }

  if (irrecv.decode(&irResults))
  {
    Serial.println("IR received");
    Serial.print("Protocol: ");
    Serial.println(typeToString(irResults.decode_type));
    Serial.print("Bits: ");
    Serial.println(irResults.bits);
    Serial.print("Value: ");
    Serial.println(uint64ToHexString(irResults.value));
    Serial.print("Raw length: ");
    Serial.println(irResults.rawlen);
    if (irResults.overflow)
    {
      Serial.println("WARNING: IR raw buffer overflow. Increase IR_CAPTURE_BUFFER_SIZE.");
    }
    printIRRawPreview(irResults);

    bool saveOk = saveLearnedIRCommand(
        pendingLearnKey,
        pendingLearnName,
        pendingLearnCategory,
        pendingLearnDescription,
        irResults);

    if (saveOk)
    {
      updateDeviceStatus(IR_HUB_DEVICE_ID, "learned_saved:" + pendingLearnKey);
      markCommandDone(
          pendingLearnCommandId,
          "ir_learned_saved",
          "IR command learned and saved");
    }
    else
    {
      updateDeviceStatus(IR_HUB_DEVICE_ID, "learn_save_failed:" + pendingLearnKey);
      markCommandDone(
          pendingLearnCommandId,
          "ir_learn_save_failed",
          "IR command received but save failed");
    }

    irrecv.resume();
    clearIRLearnState();
    return;
  }

  if (millis() - irLearnStartedAt >= IR_LEARN_TIMEOUT_MS)
  {
    Serial.println("IR learn timeout");
    updateDeviceStatus(IR_HUB_DEVICE_ID, "learn_timeout");
    markCommandDone(pendingLearnCommandId, "ir_learn_timeout", "IR learn timeout");
    clearIRLearnState();
    return;
  }
}

void processCommand(
    const String &commandId,
    const String &type,
    const String &device,
    const String &action,
    const String &irCommandId,
    const String &key,
    const String &name,
    const String &category,
    const String &description)
{
  Serial.print("Processing command: ");
  Serial.print(commandId);
  Serial.print(" type=");
  Serial.print(type);
  Serial.print(" device=");
  Serial.print(device);
  Serial.print(" action=");
  Serial.println(action);

  if (type == "device_control")
  {
    if (device != LIGHT_DEVICE_ID)
    {
      Serial.println("Unsupported device");
      markCommandDone(commandId, "unsupported_device", "Unsupported device");
      return;
    }

    String result;

    if (action == "on")
    {
      lightIsOn = true;
      digitalWrite(LED_PIN, HIGH);
      result = "light_on";
      Serial.println("LED turned on");
    }
    else if (action == "off")
    {
      lightIsOn = false;
      digitalWrite(LED_PIN, LOW);
      result = "light_off";
      Serial.println("LED turned off");
    }
    else if (action == "toggle")
    {
      lightIsOn = !lightIsOn;
      digitalWrite(LED_PIN, lightIsOn ? HIGH : LOW);
      result = lightIsOn ? "light_on" : "light_off";
      Serial.println(lightIsOn ? "LED toggled on" : "LED toggled off");
    }
    else
    {
      Serial.println("Unsupported action");
      markCommandDone(commandId, "unsupported_action", "Unsupported light action");
      return;
    }

    updateDeviceStatus(device, lightIsOn ? "on" : "off");
    markCommandDone(commandId, result, "Light command executed");
    return;
  }

  if (type == "ir_learn")
  {
    if (device != IR_HUB_DEVICE_ID)
    {
      markCommandDone(commandId, "unsupported_device", "Unsupported IR hub device");
      return;
    }

    if (action != "start")
    {
      markCommandDone(commandId, "unsupported_action", "Unsupported IR learn action");
      return;
    }

    if (key == "")
    {
      markCommandDone(commandId, "missing_ir_key", "Missing IR command key");
      return;
    }

    startIRLearnMode(commandId, key, name, category, description);
    return;
  }

  if (type == "ir_send")
  {
    if (device != IR_HUB_DEVICE_ID)
    {
      markCommandDone(commandId, "unsupported_device", "Unsupported IR hub device");
      return;
    }

    if (action != "send")
    {
      markCommandDone(commandId, "unsupported_action", "Unsupported IR send action");
      return;
    }

    String resolvedKey = irCommandId;
    if (resolvedKey == "")
    {
      resolvedKey = key;
    }

    if (resolvedKey == "")
    {
      markCommandDone(commandId, "missing_ir_key", "Missing IR command key");
      return;
    }

    sendSavedIRCommand(commandId, resolvedKey);
    return;
  }

  Serial.println("Unsupported command type");
  markCommandDone(commandId, "unsupported_type", "Unsupported command type");
}

void checkPendingCommand()
{
  Serial.println("Checking pending command");

  String path = String("/api/smart-home/commands/next?deviceId=") + SMART_HOME_DEVICE_ID;
  String payload = httpGetBridge(path);

  StaticJsonDocument<1024> doc;
  DeserializationError error = deserializeJson(doc, payload);

  if (error)
  {
    Serial.print("Failed to parse command response: ");
    Serial.println(error.c_str());
    return;
  }

  bool hasCommand = doc["hasCommand"] | false;

  if (!hasCommand)
  {
    Serial.println("No pending command");
    return;
  }

  JsonObject command = doc["command"].as<JsonObject>();
  String commandId = command["id"] | "";
  String type = command["type"] | "";
  String device = command["device"] | "";
  String action = command["action"] | "";
  String irCommandId = command["irCommandId"] | "";
  String key = command["key"] | "";
  String name = command["name"] | "";
  String category = command["category"] | "";
  String description = command["description"] | "";

  if (commandId == "")
  {
    Serial.println("Command response missing id");
    return;
  }

  Serial.print("Received command id: ");
  Serial.println(commandId);

  processCommand(commandId, type, device, action, irCommandId, key, name, category, description);
}

void setup()
{
  Serial.begin(115200);
  delay(1000);

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  setupIR();

  Serial.println("TsunagariCare Smart Home Bridge Demo");
  connectWiFi();
  updateDeviceStatus(LIGHT_DEVICE_ID, "off");
  updateDeviceStatus(IR_HUB_DEVICE_ID, "online");
}

void loop()
{
  unsigned long now = millis();

  handleIRLearnMode();

  if (!irLearnMode && now - lastCheckAt >= CHECK_INTERVAL_MS)
  {
    lastCheckAt = now;
    checkPendingCommand();
  }
}
