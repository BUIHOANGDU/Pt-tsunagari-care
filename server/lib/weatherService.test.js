const assert = require("assert");

const {
  clearWeatherCache,
  getCurrentWeather,
  getWeatherConfig,
} = require("./weatherService");

function createProviderPayload(overrides = {}) {
  return {
    current: {
      time: "2026-08-03T15:10",
      temperature_2m: 31.2,
      apparent_temperature: 34.1,
      relative_humidity_2m: 68,
      weather_code: 1,
      ...overrides,
    },
  };
}

function createFetch(payload, status = 200) {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return {
      ok: status >= 200 && status < 300,
      status,
      async json() {
        return payload;
      },
    };
  };
  fetchImpl.getCalls = () => calls;
  return fetchImpl;
}

async function run() {
  const invalidConfig = getWeatherConfig({
    WEATHER_LOCATION_NAME: "",
    WEATHER_LATITUDE: "1000",
    WEATHER_LONGITUDE: "-999",
    WEATHER_TIMEZONE: "",
    WEATHER_CACHE_MINUTES: "1",
  });
  assert.strictEqual(invalidConfig.location.name, "Tokyo");
  assert.strictEqual(invalidConfig.location.latitude, 35.6762);
  assert.strictEqual(invalidConfig.location.longitude, 139.6503);
  assert.strictEqual(invalidConfig.location.timezone, "Asia/Tokyo");
  assert.strictEqual(invalidConfig.cacheMinutes, 10);

  clearWeatherCache();
  const fetchSuccess = createFetch(createProviderPayload());
  const success = await getCurrentWeather({ fetchImpl: fetchSuccess });
  assert.strictEqual(success.ok, true);
  assert.strictEqual(success.location.name, "Tokyo");
  assert.strictEqual(success.weather.temperatureC, 31.2);
  assert.strictEqual(success.weather.humidityPercent, 68);
  assert.strictEqual(success.weather.observedAt, "2026-08-03T15:10:00+09:00");

  const cacheHit = await getCurrentWeather({
    fetchImpl: async () => {
      throw new Error("should_not_fetch");
    },
  });
  assert.strictEqual(cacheHit.ok, true);
  assert.strictEqual(cacheHit.cached, true);
  assert.strictEqual(fetchSuccess.getCalls(), 1);

  const stale = await getCurrentWeather({
    forceRefresh: true,
    fetchImpl: async () => {
      throw new Error("provider_timeout");
    },
  });
  assert.strictEqual(stale.ok, true);
  assert.strictEqual(stale.cached, true);
  assert.strictEqual(stale.stale, true);

  clearWeatherCache();
  const unavailable = await getCurrentWeather({
    fetchImpl: async () => {
      throw new Error("provider_timeout");
    },
  });
  assert.strictEqual(unavailable.ok, false);
  assert.strictEqual(unavailable.error, "weather_unavailable");

  clearWeatherCache();
  const invalidJson = await getCurrentWeather({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        throw new Error("invalid_json");
      },
    }),
  });
  assert.strictEqual(invalidJson.ok, false);
  assert.strictEqual(invalidJson.error, "weather_unavailable");

  clearWeatherCache();
  const httpError = await getCurrentWeather({
    fetchImpl: createFetch({ error: "upstream" }, 500),
  });
  assert.strictEqual(httpError.ok, false);

  console.log("weatherService tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
