const DEFAULT_LOCATION = {
  name: "Tokyo",
  latitude: 35.6762,
  longitude: 139.6503,
  timezone: "Asia/Tokyo",
};

const DEFAULT_CACHE_MINUTES = 10;
const MIN_CACHE_MINUTES = 5;
const MAX_CACHE_MINUTES = 60;
const REQUEST_TIMEOUT_MS = 7000;
const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

let weatherCache = null;

function parseNumberInRange(value, min, max, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback;
}

function isNumberInRange(value, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max;
}

function isValidTimeZone(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value.trim() });
    return true;
  } catch (error) {
    return false;
  }
}

function getWeatherConfig(env = process.env) {
  const hasValidLatitude = isNumberInRange(env.WEATHER_LATITUDE, -90, 90);
  const hasValidLongitude = isNumberInRange(env.WEATHER_LONGITUDE, -180, 180);
  const hasValidTimezone = isValidTimeZone(env.WEATHER_TIMEZONE);
  const useDefaultLocation =
    !hasValidLatitude || !hasValidLongitude || !hasValidTimezone;
  const cacheMinutes = parseNumberInRange(
    env.WEATHER_CACHE_MINUTES,
    MIN_CACHE_MINUTES,
    MAX_CACHE_MINUTES,
    DEFAULT_CACHE_MINUTES,
  );

  return {
    location: useDefaultLocation
      ? { ...DEFAULT_LOCATION }
      : {
          name:
            typeof env.WEATHER_LOCATION_NAME === "string" &&
            env.WEATHER_LOCATION_NAME.trim()
              ? env.WEATHER_LOCATION_NAME.trim()
              : DEFAULT_LOCATION.name,
          latitude: Number(env.WEATHER_LATITUDE),
          longitude: Number(env.WEATHER_LONGITUDE),
          timezone: env.WEATHER_TIMEZONE.trim(),
        },
    cacheMinutes,
  };
}

function buildWeatherUrl(location) {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    timezone: location.timezone,
    forecast_days: "1",
    temperature_unit: "celsius",
    current:
      "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code",
  });

  return `${OPEN_METEO_URL}?${params.toString()}`;
}

function asFiniteNumber(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`invalid_weather_field_${fieldName}`);
  }
  return parsed;
}

function getTimeZoneOffsetSuffix(timeZone, localIsoValue) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(
    localIsoValue,
  );
  if (!match) return "+09:00";

  const [, year, month, day, hour, minute, second = "00"] = match;
  const utcGuess = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ),
  );
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(utcGuess).map((part) => [part.type, part.value]),
  );
  const zonedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offsetMinutes = Math.round((zonedAsUtc - utcGuess.getTime()) / 60000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const offsetRemainder = String(absolute % 60).padStart(2, "0");

  return `${sign}${offsetHours}:${offsetRemainder}`;
}

function normalizeObservedAt(value, timezone) {
  if (typeof value !== "string" || !value.trim()) {
    return new Date().toISOString();
  }

  const trimmed = value.trim();
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const withSeconds =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)
      ? `${trimmed}:00`
      : trimmed;

  return `${withSeconds}${getTimeZoneOffsetSuffix(timezone, withSeconds)}`;
}

function normalizeWeatherResponse(payload, location) {
  const current = payload?.current;
  if (!current || typeof current !== "object") {
    throw new Error("invalid_weather_response");
  }

  return {
    ok: true,
    location,
    weather: {
      temperatureC: asFiniteNumber(current.temperature_2m, "temperatureC"),
      apparentTemperatureC: asFiniteNumber(
        current.apparent_temperature,
        "apparentTemperatureC",
      ),
      humidityPercent: asFiniteNumber(
        current.relative_humidity_2m,
        "humidityPercent",
      ),
      weatherCode: asFiniteNumber(current.weather_code, "weatherCode"),
      observedAt: normalizeObservedAt(current.time, location.timezone),
    },
    cached: false,
  };
}

async function fetchWeatherFromProvider(config, fetchImpl = global.fetch) {
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch_unavailable");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetchImpl(buildWeatherUrl(config.location), {
      signal: controller.signal,
      headers: {
        accept: "application/json",
      },
    });

    if (!response || response.ok !== true) {
      throw new Error(`weather_provider_http_${response?.status || "unknown"}`);
    }

    const payload = await response.json();
    return normalizeWeatherResponse(payload, config.location);
  } finally {
    clearTimeout(timeout);
  }
}

function getFreshCachedWeather(now = Date.now()) {
  if (!weatherCache) return null;
  return weatherCache.expiresAt > now ? weatherCache.data : null;
}

function getStaleCachedWeather() {
  if (!weatherCache) return null;
  return {
    ...weatherCache.data,
    cached: true,
    stale: true,
  };
}

async function getCurrentWeather(options = {}) {
  const config = getWeatherConfig(options.env || process.env);
  const now = Date.now();
  const freshCache = options.forceRefresh ? null : getFreshCachedWeather(now);

  if (freshCache) {
    return {
      ...freshCache,
      cached: true,
    };
  }

  try {
    const data = await fetchWeatherFromProvider(config, options.fetchImpl);
    weatherCache = {
      data,
      fetchedAt: now,
      expiresAt: now + config.cacheMinutes * 60 * 1000,
    };
    return data;
  } catch (error) {
    const stale = getStaleCachedWeather();
    if (stale) {
      console.warn(
        `[Weather] provider failed, returning stale cache error=${error.message}`,
      );
      return stale;
    }

    console.warn(`[Weather] provider failed error=${error.message}`);
    return {
      ok: false,
      location: config.location,
      weather: null,
      cached: false,
      stale: false,
      error: "weather_unavailable",
    };
  }
}

function clearWeatherCache() {
  weatherCache = null;
}

module.exports = {
  REQUEST_TIMEOUT_MS,
  buildWeatherUrl,
  clearWeatherCache,
  fetchWeatherFromProvider,
  getCurrentWeather,
  getWeatherConfig,
  normalizeWeatherResponse,
};
