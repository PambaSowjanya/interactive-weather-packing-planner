/* =========================================================================
   Interactive Weather & Packing Planner — script.js
   Vanilla ES6+, no frameworks. Each function does exactly one job.
   ========================================================================= */

'use strict';

/* --------------------------------------------------------------------- *
 * CONFIG
 * ---------------------------------------------------------------------- */

// Paste your free OpenWeatherMap API key between the quotes.
// Get one at: https://home.openweathermap.org/users/sign_up
const API_KEY = 'dd768b024d2821f1c147378ea23d599e';

const BASE_URL = 'https://api.openweathermap.org/data/2.5';
const HISTORY_KEY = 'weatherPlanner.searchHistory';
const HISTORY_LIMIT = 5;

/* --------------------------------------------------------------------- *
 * STATE
 * Keep the "source of truth" temperatures in Celsius always; the unit
 * toggle only changes how they are *displayed*, never re-fetches data.
 * ---------------------------------------------------------------------- */

const state = {
  unit: 'C',                // 'C' | 'F'
  currentWeatherData: null, // raw normalized current weather (Celsius)
  forecastData: null,       // array of 3 normalized forecast days (Celsius)
};

/* --------------------------------------------------------------------- *
 * DOM REFERENCES
 * ---------------------------------------------------------------------- */

const dom = {
  form: document.getElementById('search-form'),
  cityInput: document.getElementById('city-input'),
  searchBtn: document.getElementById('search-btn'),
  searchSpinner: document.getElementById('search-spinner'),
  geoBtn: document.getElementById('geo-btn'),

  unitC: document.getElementById('unit-c'),
  unitF: document.getElementById('unit-f'),

  historyList: document.getElementById('history-list'),
  historyEmpty: document.getElementById('history-empty'),

  errorBanner: document.getElementById('error-banner'),
  errorMessage: document.getElementById('error-message'),

  dashboard: document.getElementById('dashboard'),
  emptyState: document.getElementById('empty-state'),

  currentCityName: document.getElementById('current-city-name'),
  currentCountry: document.getElementById('current-country'),
  currentDate: document.getElementById('current-date'),
  currentIcon: document.getElementById('current-icon'),
  currentTemp: document.getElementById('current-temp'),
  currentCondition: document.getElementById('current-condition'),
  currentFeelsLike: document.getElementById('current-feels-like'),
  statHumidity: document.getElementById('stat-humidity'),
  statWind: document.getElementById('stat-wind'),
  statPressure: document.getElementById('stat-pressure'),
  statVisibility: document.getElementById('stat-visibility'),

  packingList: document.getElementById('packing-list'),
  forecastRow: document.getElementById('forecast-row'),

  darkModeToggle: document.getElementById('dark-mode-toggle'),
  liveClock: document.getElementById('live-clock'),
  weatherBg: document.getElementById('weather-bg'),
};

/* --------------------------------------------------------------------- *
 * THEME TOKENS — one entry per OpenWeatherMap condition group.
 * Only 4 CSS variables are ever touched, per the design spec.
 * ---------------------------------------------------------------------- */

const WEATHER_THEMES = {
  Clear: {
    bg: '#3a2b12',
    accent: '#ffb347',
    card: 'rgba(255, 179, 71, 0.10)',
    text: '#fff6e9',
    particle: 'ray',
  },
  Clouds: {
    bg: '#2b2f36',
    accent: '#9aa5b1',
    card: 'rgba(255, 255, 255, 0.07)',
    text: '#eef1f5',
    particle: 'none',
  },
  Rain: {
    bg: '#111c2b',
    accent: '#4fa3d1',
    card: 'rgba(79, 163, 209, 0.10)',
    text: '#e8f1f8',
    particle: 'rain',
  },
  Drizzle: {
    bg: '#15202e',
    accent: '#6db8e0',
    card: 'rgba(109, 184, 224, 0.10)',
    text: '#e8f1f8',
    particle: 'rain',
  },
  Thunderstorm: {
    bg: '#1a1023',
    accent: '#9b6bd6',
    card: 'rgba(155, 107, 214, 0.12)',
    text: '#f1eafb',
    particle: 'rain',
  },
  Snow: {
    bg: '#e9f2f9',
    accent: '#5b8bb0',
    card: 'rgba(91, 139, 176, 0.10)',
    text: '#1c2a36',
    particle: 'snow',
  },
  Mist: {
    bg: '#3a3d40',
    accent: '#c7ccd1',
    card: 'rgba(255, 255, 255, 0.08)',
    text: '#f2f3f4',
    particle: 'none',
  },
};
// Fog, Haze, Smoke, Dust etc. read the same as Mist
['Fog', 'Haze', 'Smoke', 'Dust', 'Sand', 'Ash', 'Squall', 'Tornado'].forEach((key) => {
  WEATHER_THEMES[key] = WEATHER_THEMES.Mist;
});

const DEFAULT_THEME = {
  bg: '#171c26',
  accent: '#ff8c42',
  card: 'rgba(255, 255, 255, 0.06)',
  text: '#eef1f5',
  particle: 'none',
};

/* --------------------------------------------------------------------- *
 * PACKING RULES ENGINE
 * Each rule is independently evaluated against the day's data — no
 * long if/else chain. `test` receives the normalized weather reading.
 * ---------------------------------------------------------------------- */

const PACKING_RULES = [
  {
    label: 'Rain',
    test: (w) => w.mainGroup === 'Rain' || w.mainGroup === 'Drizzle',
    items: ['☔ Umbrella', '🧥 Waterproof jacket', '👢 Waterproof shoes'],
  },
  {
    label: 'Snow',
    test: (w) => w.mainGroup === 'Snow',
    items: ['🥾 Boots', '🧤 Gloves', '🧥 Heavy jacket'],
  },
  {
    label: 'Cold',
    test: (w) => w.tempC < 10,
    items: ['🧥 Heavy coat', '🧤 Gloves', '🧢 Wool cap'],
  },
  {
    label: 'Hot',
    test: (w) => w.tempC > 30,
    items: ['👕 Light clothing', '🕶️ Sunglasses', '🧴 Sunscreen'],
  },
  {
    label: 'Humid',
    test: (w) => w.humidity > 70,
    items: ['👚 Breathable clothes'],
  },
  {
    label: 'Windy',
    test: (w) => w.windKph > 25,
    items: ['🌬️ Windbreaker'],
  },
  {
    label: 'Clear sky',
    test: (w) => w.mainGroup === 'Clear',
    items: ['🕶️ Sunglasses', '💧 Water bottle'],
  },
];

/**
 * getPackingSuggestions(weather)
 * Runs every rule against the normalized weather reading and returns
 * a flat, de-duplicated list of packing suggestions.
 */
function getPackingSuggestions(weather) {
  const suggestions = PACKING_RULES
    .filter((rule) => rule.test(weather))
    .flatMap((rule) => rule.items);

  return [...new Set(suggestions)];
}

/* --------------------------------------------------------------------- *
 * UNIT CONVERSION
 * ---------------------------------------------------------------------- */

/**
 * convertTemperature(celsius, unit)
 * Converts a Celsius value for display only; stored state stays Celsius.
 */
function convertTemperature(celsius, unit) {
  if (unit === 'F') {
    return Math.round((celsius * 9) / 5 + 32);
  }
  return Math.round(celsius);
}

/* --------------------------------------------------------------------- *
 * NETWORKING
 * ---------------------------------------------------------------------- */

/**
 * fetchCurrentWeather(city)
 * Calls the OpenWeatherMap "current weather" endpoint for a city name
 * and returns the normalized reading used throughout the app.
 */
async function fetchCurrentWeather(city) {
  const url = `${BASE_URL}/weather?q=${encodeURIComponent(city)}&units=metric&appid=${API_KEY}`;
  const response = await requestJson(url);
  return normalizeCurrentWeather(response);
}

/**
 * fetchForecast(lat, lon)
 * Calls the 5-day/3-hour forecast endpoint and reduces it down to
 * exactly 3 daily summaries (min/max/condition per day).
 */
async function fetchForecast(lat, lon) {
  const url = `${BASE_URL}/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`;
  const response = await requestJson(url);
  return normalizeForecast(response);
}

/**
 * fetchCurrentWeatherByCoords(lat, lon)
 * Same as fetchCurrentWeather but by geographic coordinates, used by
 * the "Use My Location" button.
 */
async function fetchCurrentWeatherByCoords(lat, lon) {
  const url = `${BASE_URL}/weather?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`;
  const response = await requestJson(url);
  return normalizeCurrentWeather(response);
}

/**
 * requestJson(url)
 * Shared fetch wrapper that turns HTTP/network failures into
 * descriptive errors the UI can show directly to the user.
 */
async function requestJson(url) {
  if (!API_KEY) {
    throw new Error('Missing API key. Add your OpenWeatherMap key to the API_KEY constant in script.js.');
  }

  let response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error('Network error — check your internet connection and try again.');
  }

  if (response.status === 404) {
    throw new Error("We couldn't find that city. Check the spelling and try again.");
  }

  if (response.status === 401) {
    throw new Error('Invalid API key. Double-check the API_KEY value in script.js.');
  }

  if (!response.ok) {
    throw new Error(`Weather service error (status ${response.status}). Please try again shortly.`);
  }

  return response.json();
}

/* --------------------------------------------------------------------- *
 * NORMALIZATION
 * Converts raw OpenWeatherMap payloads into the flat shape the rest
 * of the app relies on (also what the packing rules test against).
 * ---------------------------------------------------------------------- */

function normalizeCurrentWeather(raw) {
  return {
    city: raw.name,
    country: raw.sys?.country ?? '—',
    tempC: raw.main.temp,
    feelsLikeC: raw.main.feels_like,
    humidity: raw.main.humidity,
    pressure: raw.main.pressure,
    visibilityKm: (raw.visibility ?? 0) / 1000,
    windKph: (raw.wind?.speed ?? 0) * 3.6, // m/s -> km/h
    mainGroup: raw.weather?.[0]?.main ?? 'Clear',
    description: raw.weather?.[0]?.description ?? '—',
    icon: raw.weather?.[0]?.icon ?? '01d',
    lat: raw.coord?.lat,
    lon: raw.coord?.lon,
    timestamp: Date.now(),
  };
}

function normalizeForecast(raw) {
  // Group the 3-hour entries by calendar day, then pick the midday
  // reading (closest to 12:00) as representative for icon/condition,
  // while tracking min/max across the whole day.
  const dayBuckets = new Map();

  raw.list.forEach((entry) => {
    const dayKey = entry.dt_txt.split(' ')[0];
    if (!dayBuckets.has(dayKey)) {
      dayBuckets.set(dayKey, []);
    }
    dayBuckets.get(dayKey).push(entry);
  });

  const todayKey = new Date().toISOString().split('T')[0];

  const days = [...dayBuckets.entries()]
    .filter(([dayKey]) => dayKey !== todayKey)
    .slice(0, 3)
    .map(([dayKey, entries]) => {
      const temps = entries.map((e) => e.main.temp);
      const middayEntry = entries.reduce((closest, e) => {
        const hour = Number(e.dt_txt.split(' ')[1].split(':')[0]);
        const closestHour = Number(closest.dt_txt.split(' ')[1].split(':')[0]);
        return Math.abs(hour - 12) < Math.abs(closestHour - 12) ? e : closest;
      });

      return {
        date: dayKey,
        dayName: new Date(dayKey).toLocaleDateString(undefined, { weekday: 'short' }),
        minC: Math.min(...temps),
        maxC: Math.max(...temps),
        mainGroup: middayEntry.weather?.[0]?.main ?? 'Clear',
        description: middayEntry.weather?.[0]?.description ?? '—',
        icon: middayEntry.weather?.[0]?.icon ?? '01d',
        humidity: middayEntry.main.humidity,
        windKph: (middayEntry.wind?.speed ?? 0) * 3.6,
        tempC: middayEntry.main.temp,
      };
    });

  return days;
}

/* --------------------------------------------------------------------- *
 * ICON MAPPING (emoji, so the app has zero external icon dependencies)
 * ---------------------------------------------------------------------- */

const CONDITION_EMOJI = {
  Clear: '☀️',
  Clouds: '☁️',
  Rain: '🌧️',
  Drizzle: '🌦️',
  Thunderstorm: '⛈️',
  Snow: '❄️',
  Mist: '🌫️',
  Fog: '🌫️',
  Haze: '🌫️',
  Smoke: '🌫️',
  Dust: '🌫️',
  Sand: '🌫️',
  Ash: '🌫️',
  Squall: '💨',
  Tornado: '🌪️',
};

function emojiFor(mainGroup) {
  return CONDITION_EMOJI[mainGroup] ?? '🌡️';
}

/* --------------------------------------------------------------------- *
 * RENDERING
 * ---------------------------------------------------------------------- */

/**
 * renderCurrentWeather(weather)
 * Paints the current-conditions card from a normalized weather object.
 */
function renderCurrentWeather(weather) {
  const temp = convertTemperature(weather.tempC, state.unit);
  const feelsLike = convertTemperature(weather.feelsLikeC, state.unit);

  dom.currentCityName.textContent = weather.city;
  dom.currentCountry.textContent = weather.country;
  dom.currentDate.textContent = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  dom.currentIcon.textContent = emojiFor(weather.mainGroup);
  dom.currentTemp.textContent = `${temp}°${state.unit}`;
  dom.currentCondition.textContent = capitalize(weather.description);
  dom.currentFeelsLike.textContent = `Feels like ${feelsLike}°${state.unit}`;

  dom.statHumidity.textContent = `${Math.round(weather.humidity)}%`;
  dom.statWind.textContent = `${Math.round(weather.windKph)} km/h`;
  dom.statPressure.textContent = `${Math.round(weather.pressure)} hPa`;
  dom.statVisibility.textContent = `${weather.visibilityKm.toFixed(1)} km`;
}

/**
 * renderForecast(days)
 * Renders exactly 3 forecast cards from normalized daily summaries.
 */
function renderForecast(days) {
  dom.forecastRow.innerHTML = '';

  days.forEach((day) => {
    const min = convertTemperature(day.minC, state.unit);
    const max = convertTemperature(day.maxC, state.unit);

    const card = document.createElement('article');
    card.className = 'forecast-card';
    card.innerHTML = `
      <p class="forecast-day">${day.dayName}</p>
      <div class="forecast-icon" aria-hidden="true">${emojiFor(day.mainGroup)}</div>
      <p class="forecast-condition">${capitalize(day.description)}</p>
      <p class="forecast-temps">
        <span class="max">${max}°</span>
        <span class="min">${min}°</span>
      </p>
    `;
    dom.forecastRow.appendChild(card);
  });
}

/**
 * renderPackingSuggestions(weather)
 * Runs the rules engine and renders the resulting checklist.
 */
function renderPackingSuggestions(weather) {
  const suggestions = getPackingSuggestions(weather);
  dom.packingList.innerHTML = '';

  if (suggestions.length === 0) {
    dom.packingList.innerHTML = '<li class="packing-empty">Conditions look easygoing — pack light!</li>';
    return;
  }

  suggestions.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'packing-item';
    li.innerHTML = `<span class="check" aria-hidden="true">✓</span><span>${item}</span>`;
    dom.packingList.appendChild(li);
  });
}

/**
 * applyTheme(mainGroup)
 * Swaps the 4 theme CSS variables to match the current condition, and
 * refreshes the decorative animated background to match.
 */
function applyTheme(mainGroup) {
  const theme = WEATHER_THEMES[mainGroup] ?? DEFAULT_THEME;
  const root = document.documentElement;

  root.style.setProperty('--bg-color', theme.bg);
  root.style.setProperty('--accent-color', theme.accent);
  root.style.setProperty('--card-bg', theme.card);
  root.style.setProperty('--text-color', theme.text);

  renderWeatherParticles(theme.particle);
}

/* --------------------------------------------------------------------- *
 * DECORATIVE BACKGROUND PARTICLES
 * ---------------------------------------------------------------------- */

function renderWeatherParticles(kind) {
  dom.weatherBg.innerHTML = '';
  if (kind === 'none') return;

  const count = kind === 'ray' ? 10 : 40;

  for (let i = 0; i < count; i += 1) {
    const el = document.createElement('span');
    el.className = `weather-particle ${kind}`;

    if (kind === 'rain') {
      el.style.left = `${Math.random() * 100}%`;
      el.style.height = `${40 + Math.random() * 60}px`;
      el.style.animationDuration = `${0.6 + Math.random() * 0.6}s`;
      el.style.animationDelay = `${Math.random() * 2}s`;
    } else if (kind === 'snow') {
      el.style.left = `${Math.random() * 100}%`;
      el.style.width = el.style.height = `${3 + Math.random() * 4}px`;
      el.style.animationDuration = `${6 + Math.random() * 6}s`;
      el.style.animationDelay = `${Math.random() * 4}s`;
    } else if (kind === 'ray') {
      el.style.left = `${50 + (Math.random() - 0.5) * 10}%`;
      el.style.top = '10%';
      el.style.height = `${200 + Math.random() * 200}px`;
      el.style.transform = `rotate(${(360 / count) * i}deg)`;
    }

    dom.weatherBg.appendChild(el);
  }
}

/* --------------------------------------------------------------------- *
 * LOADING / ERROR / EMPTY STATE HELPERS
 * ---------------------------------------------------------------------- */

function showLoading() {
  dom.searchBtn.disabled = true;
  dom.searchSpinner.hidden = false;
  dom.dashboard.hidden = true;
  hideError();
}

function hideLoading() {
  dom.searchBtn.disabled = false;
  dom.searchSpinner.hidden = true;
}

function showError(message) {
  dom.errorMessage.textContent = message;
  dom.errorBanner.hidden = false;
  dom.dashboard.hidden = true;
  dom.emptyState.hidden = false;
}

function hideError() {
  dom.errorBanner.hidden = true;
}

/**
 * clearUI()
 * Resets the dashboard to a blank slate before a new search resolves.
 */
function clearUI() {
  hideError();
  dom.dashboard.hidden = true;
  dom.emptyState.hidden = true;
}

/* --------------------------------------------------------------------- *
 * SEARCH HISTORY (localStorage)
 * ---------------------------------------------------------------------- */

/**
 * saveHistory(city)
 * Stores up to the 5 most recent unique city searches, newest first.
 */
function saveHistory(city) {
  const existing = loadHistoryRaw().filter(
    (item) => item.toLowerCase() !== city.toLowerCase()
  );
  const updated = [city, ...existing].slice(0, HISTORY_LIMIT);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  loadHistory();
}

function loadHistoryRaw() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * loadHistory()
 * Renders the stored history as clickable chips.
 */
function loadHistory() {
  const history = loadHistoryRaw();
  dom.historyList.innerHTML = '';

  if (history.length === 0) {
    dom.historyList.appendChild(dom.historyEmpty);
    return;
  }

  history.forEach((city) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'history-chip';
    chip.textContent = city;
    chip.addEventListener('click', () => searchFromHistory(city));
    dom.historyList.appendChild(chip);
  });
}

/**
 * searchFromHistory(city)
 * Re-runs a search for a city chosen from the history chips.
 */
function searchFromHistory(city) {
  dom.cityInput.value = city;
  searchWeather(city);
}

/* --------------------------------------------------------------------- *
 * CORE SEARCH FLOW
 * ---------------------------------------------------------------------- */

/**
 * searchWeather(cityOverride)
 * Orchestrates a full search: validation → loading state → fetch
 * current + forecast → render → theme → history → error handling.
 */
async function searchWeather(cityOverride) {
  const city = (cityOverride ?? dom.cityInput.value).trim();

  if (!city) {
    showError('Please enter a city name before searching.');
    return;
  }

  showLoading();

  try {
    const currentWeather = await fetchCurrentWeather(city);
    const forecast = await fetchForecast(currentWeather.lat, currentWeather.lon);

    state.currentWeatherData = currentWeather;
    state.forecastData = forecast;

    renderCurrentWeather(currentWeather);
    renderForecast(forecast);
    renderPackingSuggestions(currentWeather);
    applyTheme(currentWeather.mainGroup);

    saveHistory(currentWeather.city);

    dom.dashboard.hidden = false;
    dom.emptyState.hidden = true;
  } catch (error) {
    showError(error.message || 'Something went wrong. Please try again.');
  } finally {
    hideLoading();
  }
}

/**
 * searchWeatherByCoords(lat, lon)
 * Same orchestration as searchWeather(), entered via geolocation
 * instead of a typed city name.
 */
async function searchWeatherByCoords(lat, lon) {
  showLoading();

  try {
    const currentWeather = await fetchCurrentWeatherByCoords(lat, lon);
    const forecast = await fetchForecast(lat, lon);

    state.currentWeatherData = currentWeather;
    state.forecastData = forecast;

    renderCurrentWeather(currentWeather);
    renderForecast(forecast);
    renderPackingSuggestions(currentWeather);
    applyTheme(currentWeather.mainGroup);

    saveHistory(currentWeather.city);

    dom.dashboard.hidden = false;
    dom.emptyState.hidden = true;
  } catch (error) {
    showError(error.message || 'Something went wrong. Please try again.');
  } finally {
    hideLoading();
  }
}

/* --------------------------------------------------------------------- *
 * UNIT TOGGLE
 * ---------------------------------------------------------------------- */

/**
 * toggleUnits(unit)
 * Switches the display unit and re-renders from the cached Celsius
 * data — never re-fetches from the API.
 */
function toggleUnits(unit) {
  if (unit === state.unit) return;
  state.unit = unit;

  dom.unitC.classList.toggle('is-active', unit === 'C');
  dom.unitC.setAttribute('aria-pressed', String(unit === 'C'));
  dom.unitF.classList.toggle('is-active', unit === 'F');
  dom.unitF.setAttribute('aria-pressed', String(unit === 'F'));

  if (state.currentWeatherData) {
    renderCurrentWeather(state.currentWeatherData);
  }
  if (state.forecastData) {
    renderForecast(state.forecastData);
  }
}

/* --------------------------------------------------------------------- *
 * GEOLOCATION
 * ---------------------------------------------------------------------- */

function handleGeolocation() {
  if (!('geolocation' in navigator)) {
    showError('Geolocation is not supported by this browser.');
    return;
  }

  showLoading();

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      searchWeatherByCoords(latitude, longitude);
    },
    (geoError) => {
      hideLoading();
      const message =
        geoError.code === geoError.PERMISSION_DENIED
          ? 'Location access was denied. You can still search by city name above.'
          : 'Could not determine your location. Please search by city name instead.';
      showError(message);
    },
    { timeout: 10000 }
  );
}

/* --------------------------------------------------------------------- *
 * DARK MODE TOGGLE (bonus)
 * ---------------------------------------------------------------------- */

function toggleDarkMode() {
  const isLight = document.body.classList.toggle('light-mode');
  dom.darkModeToggle.setAttribute('aria-pressed', String(isLight));
  dom.darkModeToggle.textContent = isLight ? '☀️' : '🌙';
}

/* --------------------------------------------------------------------- *
 * LIVE CLOCK (bonus)
 * ---------------------------------------------------------------------- */

function updateClock() {
  const now = new Date();
  dom.liveClock.textContent = now.toLocaleString(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/* --------------------------------------------------------------------- *
 * SMALL UTILITIES
 * ---------------------------------------------------------------------- */

function capitalize(text) {
  if (!text) return '—';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/* --------------------------------------------------------------------- *
 * EVENT WIRING & INITIALIZATION
 * ---------------------------------------------------------------------- */

function attachEventListeners() {
  dom.form.addEventListener('submit', (event) => {
    event.preventDefault();
    searchWeather();
  });

  dom.geoBtn.addEventListener('click', handleGeolocation);

  dom.unitC.addEventListener('click', () => toggleUnits('C'));
  dom.unitF.addEventListener('click', () => toggleUnits('F'));

  dom.darkModeToggle.addEventListener('click', toggleDarkMode);

  // Keyboard shortcut: "/" focuses the search field (bonus feature)
  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && document.activeElement !== dom.cityInput) {
      event.preventDefault();
      dom.cityInput.focus();
    }
  });
}

/**
 * initializeApp()
 * Entry point: wires events, restores history, and starts the clock.
 */
function initializeApp() {
  attachEventListeners();
  loadHistory();
  updateClock();
  setInterval(updateClock, 30000);
  applyTheme('default');
}

document.addEventListener('DOMContentLoaded', initializeApp);
