'use strict';

// Toda la lógica vive aquí; GitHub Pages solo entrega este archivo al navegador.
const DURATIONS = { focus: 25 * 60, short: 5 * 60, long: 15 * 60 };
const LABELS = { focus: 'Tiempo de trabajo', short: 'Descanso corto', long: 'Descanso largo' };
const STORAGE_KEY = 'focusflow_history_v1';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
let mode = 'focus';
let remaining = DURATIONS.focus;
let deadline = null;
let interval = null;
let history = readHistory();

function localDay(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function readHistory() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch (_) {
    return {};
  }
}

function saveHistory() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history)); }
  catch (_) { setMessage('No se pueden guardar los datos en este navegador.'); }
}

function todayData() {
  const data = history[localDay()] || {};
  return {
    sessions: Number(data.sessions) || 0,
    focus: Number(data.focus) || 0,
    breaks: Number(data.breaks) || 0
  };
}

function setMessage(message) { $('#message').textContent = message; }

function renderTimer() {
  const minutes = Math.floor(remaining / 60).toString().padStart(2, '0');
  const seconds = (remaining % 60).toString().padStart(2, '0');
  $('#clock').textContent = `${minutes}:${seconds}`;
  $('#mode-label').textContent = LABELS[mode];
  document.title = `${minutes}:${seconds} · FocusFlow`;
  const progress = Math.max(0, Math.min(100, 100 * (1 - remaining / DURATIONS[mode])));
  $('#timer-ring').style.background = `conic-gradient(#218b66 ${progress}%, #e9eff2 ${progress}%)`;
  $('#toggle').textContent = interval ? 'Ⅱ Pausar' : '▶ Iniciar';
  $$('.mode-btn').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
}

function renderStats() {
  const today = todayData();
  $('#today-sessions').textContent = today.sessions;
  $('#today-focus').textContent = `${today.focus} min`;
  $('#today-breaks').textContent = `${today.breaks} min`;

  const days = Array.from({ length: 7 }, (_, i) => {
    const day = new Date();
    day.setHours(12, 0, 0, 0);
    day.setDate(day.getDate() - 6 + i);
    const data = history[localDay(day)] || {};
    return { date: day, sessions: Number(data.sessions) || 0, focus: Number(data.focus) || 0 };
  });
  const count = days.reduce((sum, day) => sum + day.sessions, 0);
  const minutes = days.reduce((sum, day) => sum + day.focus, 0);
  const best = days.reduce((highest, day) => day.sessions > highest.sessions ? day : highest, { sessions: 0 });
  $('#total-week-sessions').textContent = count;
  $('#total-week-focus').textContent = `${minutes} min`;
  $('#best-day').textContent = best.sessions ? best.date.toLocaleDateString('es-ES', { weekday: 'short' }) : '—';
  const max = Math.max(4, ...days.map(day => day.sessions));
  const chart = $('#week-chart');
  chart.replaceChildren();
  days.forEach(day => {
    const column = document.createElement('div');
    column.className = 'day-column';
    const zone = document.createElement('div');
    zone.className = 'bar-zone';
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.height = `${day.sessions / max * 100}%`;
    zone.title = `${day.date.toLocaleDateString('es-ES')}: ${day.sessions} sesiones`;
    zone.setAttribute('aria-label', zone.title);
    zone.appendChild(bar);
    const label = document.createElement('span');
    label.className = 'day-label';
    label.textContent = day.date.toLocaleDateString('es-ES', { weekday: 'short' });
    column.append(zone, label);
    chart.appendChild(column);
  });
}

function pause() {
  if (!interval) return;
  remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  clearInterval(interval);
  interval = null;
  deadline = null;
  renderTimer();
}

function setMode(next, message) {
  if (interval) pause();
  mode = next;
  remaining = DURATIONS[mode];
  deadline = null;
  renderTimer();
  setMessage(message || 'Listo cuando tú lo estés.');
}

function bell() {
  try {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    const audio = new Context();
    const oscillator = audio.createOscillator();
    const volume = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 740;
    volume.gain.setValueAtTime(0.0001, audio.currentTime);
    volume.gain.exponentialRampToValueAtTime(0.15, audio.currentTime + 0.03);
    volume.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.42);
    oscillator.connect(volume);
    volume.connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.45);
    oscillator.onended = () => audio.close();
  } catch (_) { /* El sonido es opcional. */ }
}

function finishPhase() {
  clearInterval(interval);
  interval = null;
  deadline = null;
  const today = todayData();
  const finished = mode;
  if (finished === 'focus') {
    today.sessions += 1;
    today.focus += DURATIONS.focus / 60;
  } else {
    today.breaks += DURATIONS[finished] / 60;
  }
  history[localDay()] = today;
  saveHistory();
  renderStats();
  bell();
  if (finished === 'focus') {
    const nextMode = today.sessions % 4 === 0 ? 'long' : 'short';
    setMode(nextMode, '¡Muy bien! Sesión completada. Ahora toca descansar.');
  } else {
    setMode('focus', 'Descanso completado. ¡A por otro bloque de concentración!');
  }
}

function tick() {
  if (!interval) return;
  remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  if (remaining === 0) { finishPhase(); return; }
  renderTimer();
}

function start() {
  if (interval) { pause(); setMessage('Temporizador pausado.'); return; }
  if (remaining <= 0) remaining = DURATIONS[mode];
  deadline = Date.now() + remaining * 1000;
  interval = setInterval(tick, 250);
  setMessage(mode === 'focus' ? 'Un momento de concentración, sin distracciones.' : 'Es hora de desconectar un poco.');
  renderTimer();
}

$('#toggle').addEventListener('click', start);
$('#reset').addEventListener('click', () => setMode(mode, 'Sesión reiniciada.'));
$('#skip').addEventListener('click', () => {
  const next = mode === 'focus' ? 'short' : 'focus';
  setMode(next, 'Sesión saltada (no suma estadísticas).');
});
$$('.mode-btn').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
$$('[data-page]').forEach(button => button.addEventListener('click', () => {
  const page = button.dataset.page;
  $$('.page').forEach(section => { section.hidden = section.id !== `page-${page}`; });
  $$('[data-page]').forEach(nav => nav.setAttribute('aria-current', nav === button ? 'page' : 'false'));
  if (page === 'estadisticas') renderStats();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}));

// La hora se calcula con Date.now(): si el navegador ralentiza los intervalos,
// el contador se pone al día cuando vuelve a estar activo.
document.addEventListener('visibilitychange', tick);
renderTimer();
renderStats();
