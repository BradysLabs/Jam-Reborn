/*
 * Adventures - runs Animal Jam adventures step by step.
 *
 * Adventures are defined in ./adventures/<name>/index.js (one folder each)
 * and listed in ./adventures.
 * This file is the engine + UI; it shouldn't need changes to add one.
 *
 * Adventure format (see adventures/phantoms/index.js):
 *   {
 *     id, name, questId,
 *     modes: ['hard', 'easy'],          // first = default
 *     afterStart: async ctx => {},      // optional, runs after each room load
 *     handlesPrizes: true,              // optional, steps claim prizes themselves
 *     steps: [{ label, run: async ctx => {} }],
 *     finishMessage: '...'
 *   }
 *
 * ctx (what a step can use):
 *   ctx.pickup(name)        %xt%o%qpup%{room}%name%{player}%
 *   ctx.trigger(name)       %xt%o%qat%{room}%name%0%
 *   ctx.send(packet, ms?)   any packet; {room} and {player} are filled in
 *   ctx.changeRoom(trig)    trigger a door, wait for the new room, init it
 *   ctx.active(prefix)      objects the server showed this run, e.g. 'cork_'
 *   ctx.wait(ms)
 *   ctx.log(type, message)  type: info | warn | error | ok
 */

const { dispatch, application } = jam;

const ADVENTURES = require('./adventures');


// ============================================================
// TIMING (ms)
// ============================================================

const STEP_DELAY = 1200;
const PICKUP_DELAY = 700;
const CREATE_DELAY = 2500;
const ROOM_WAIT_TIMEOUT = 10000;
const ROOM_SETTLE_DELAY = 1500;
const PRIZE_SCREEN_TIMEOUT = 15000;
const MANUAL_PICK_TIMEOUT = 60000;


// ============================================================
// DOM
// ============================================================

const $ = id => document.getElementById(id);

const listEl = $('adventureList');
const modeEl = $('modeToggle');
const stepsEl = $('stepList');
const statusEl = $('status');
const logEl = $('log');
const startButton = $('startButton');
const stopButton = $('stopButton');
const loopToggle = $('loopToggle');
const loopRunsInput = $('loopRuns');
const loopDelayInput = $('loopDelay');
const prizeChoice = $('prizeChoice');
const runCounterEl = $('runCounter');


// ============================================================
// STATE
// ============================================================

let selected = ADVENTURES[0] || null;
let mode = selected ? selected.modes[0] : null;

let running = false;
let playerId = null;
let lastJoinedRoomName = null;
let joinReply = null;      // server's answer to the adventure request
let prizeOffered = false;   // server opened the prize screen this run
let prizeClaimed = false;   // a prize was claimed this run
const activeObjects = new Set();

let currentRoom = null;
let currentInternalRoomId = null;

let pendingTimer = null;
let pendingResolve = null;


// ============================================================
// UTILITIES
// ============================================================

class Stopped extends Error {}

function sleep(ms) {
  return new Promise(resolve => {
    pendingResolve = resolve;
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      pendingResolve = null;
      resolve();
    }, ms);
  });
}

function cancelSleep() {
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = null;
  if (pendingResolve) {
    const resolve = pendingResolve;
    pendingResolve = null;
    resolve();
  }
}

function log(type, message) {
  // Streaming mode: hide the real username in this window too.
  const streaming = jam.application && jam.application.streamingMode;
  if (streaming && typeof streaming.mask === 'function') message = streaming.mask(message);

  console.log(`[Adventures] ${message}`);

  const line = document.createElement('div');
  line.className = type;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;

  // Keep the log from growing forever.
  while (logEl.childElementCount > 400) logEl.removeChild(logEl.firstChild);
}

function setStatus(message) {
  statusEl.textContent = message;

  if (application && typeof application.consoleMessage === 'function') {
    application.consoleMessage({ type: 'notify', message: `Adventures: ${message}` });
  }
}

// Name of the den you're standing in (e.g. "denYourName"), or null.
async function findDenName() {
  const denPattern = /(?:^|[^A-Za-z0-9_])(den[A-Za-z0-9]+)/;
  const seen = {};

  for (const key of ['room', 'roomName', 'currentRoom']) {
    try {
      const value = await dispatch.getState(key);
      if (value === undefined || value === null) continue;

      const text = typeof value === 'string' ? value : JSON.stringify(value);
      seen[key] = text;

      const match = text.match(denPattern);
      if (match) return match[1];
    } catch (error) { /* key not available */ }
  }

  // Fallback 1: the last room the server told us we joined.
  if (lastJoinedRoomName && denPattern.test(lastJoinedRoomName)) {
    return lastJoinedRoomName.match(denPattern)[1];
  }

  // Fallback 2: dens are named "den" + username.
  const username = await findUsername(seen);
  if (username) return `den${username}`;

  log('warn', `Couldn't find a den name. Room info from Jam: ${JSON.stringify(seen)} | last joined: ${lastJoinedRoomName}`);
  return null;
}

async function findUsername(seen = {}) {
  for (const key of ['player', 'username', 'userName', 'user', 'account']) {
    try {
      const value = await dispatch.getState(key);
      if (value === undefined || value === null) continue;

      if (typeof value === 'string') {
        seen[key] = value;
        if (/^[A-Za-z0-9]{3,}$/.test(value)) return value;
        continue;
      }

      seen[key] = JSON.stringify(value).slice(0, 200);
      const name =
        value.username ?? value.userName ?? value.user_name ??
        value.screenName ?? value.name ?? value.nickname;
      if (typeof name === 'string' && /^[A-Za-z0-9]{3,}$/.test(name)) return name;
    } catch (error) { /* key not available */ }
  }
  return null;
}

async function refreshRoom() {
  try {
    currentRoom = (await dispatch.getState('room')) || null;
    const parsed = parseInt(await dispatch.getState('internalRoomId'), 10);
    currentInternalRoomId = Number.isNaN(parsed) ? null : parsed;
  } catch (error) {
    currentRoom = null;
    currentInternalRoomId = null;
  }
  return currentInternalRoomId || currentRoom || null;
}


// ============================================================
// INCOMING PACKETS
// ============================================================

function partsOf(message) {
  if (!message) return [];
  if (typeof message === 'string') return message.split('%');
  if (Array.isArray(message.value)) return message.value.map(String);
  if (typeof message.raw === 'string') return message.raw.split('%');
  if (typeof message.toMessage === 'function') {
    try { return String(message.toMessage()).split('%'); } catch (e) { /* ignore */ }
  }
  if (message.message && message.message !== message) return partsOf(message.message);
  return [];
}

function handleIncoming(message) {
  const parts = partsOf(message);
  const command = parts[2];

  // Your player ID for this session: %xt%qw%<room>%<playerId>%
  if (command === 'qw' && /^\d+$/.test(parts[4] || '')) {
    if (playerId !== parts[4]) {
      playerId = parts[4];
      log('info', `Player ID ${playerId}`);
    }
    return;
  }

  // Room joined: %xt%rj%<oldRoom>%1%<roomName>%<newRoom>%...
  if (command === 'rj' && parts[5]) {
    lastJoinedRoomName = parts[5];
    return;
  }

  // Answer to the adventure request: %xt%qjc%<room>%<1 ok / 0 refused>%<reason or details>%
  if (command === 'qjc') {
    joinReply = { ok: parts[4] === '1', reason: parts[5] || '' };
    return;
  }

  // Prize screen opened: %xt%qpgift%-1%5%...
  if (command === 'qpgift') {
    prizeOffered = true;
    return;
  }

  // Item added to inventory (prize received)
  if (command === 'il' && running) {
    prizeClaimed = true;
    return;
  }

  // Objects the server shows this run: %xt%qcmd%-1%1%<name>%1%1%...
  if (command === 'qcmd' && running && parts[4] === '1' && parts[6] === '1' && parts[5]) {
    activeObjects.add(parts[5]);
  }
}

function setupListeners() {
  let hooked = false;

  if (dispatch && typeof dispatch.onMessage === 'function') {
    for (const message of ['qw', 'qcmd', 'rj', 'qjc', 'qpgift', 'il']) {
      try {
        dispatch.onMessage({
          type: 'aj',
          message,
          callback: payload => handleIncoming(payload && payload.message ? payload.message : payload)
        });
        hooked = true;
      } catch (error) { /* try the next method */ }
    }
  }

  // Also listen the way Pairs does; handlers are safe to run twice.
  if (typeof jam.onPacket === 'function') {
    try {
      jam.onPacket(packet => {
        if (!packet) return;
        if (packet.direction === 'out') {
          // You picked a prize yourself on the prize screen.
          if (String(packet.raw || '').includes('%qpgiftdone%')) prizeClaimed = true;
          return;
        }
        handleIncoming(packet.raw);
      });
      hooked = true;
    } catch (error) { /* ignore */ }
  }

  if (!hooked) {
    log('error', 'Could not listen to game packets; corks/keys and player ID won\'t be detected.');
  }
}


// ============================================================
// STEP CONTEXT
// ============================================================

function makeContext(adventure) {
  const ctx = {
    async send(template, delay = STEP_DELAY) {
      if (!running) throw new Stopped();

      const room = await refreshRoom();
      if (!room) throw new Error('No room ID available.');

      if (template.includes('{player}') && !playerId) {
        throw new Error('Player ID not detected yet.');
      }

      const packet = template
        .replaceAll('{room}', String(room))
        .replaceAll('{player}', String(playerId));

      log('send', `SEND ${packet}`);
      await dispatch.sendRemoteMessage(packet);

      await sleep(delay);
      if (!running) throw new Stopped();
    },

    pickup(name) {
      return ctx.send(`%xt%o%qpup%{room}%${name}%{player}%`, PICKUP_DELAY);
    },

    trigger(name) {
      return ctx.send(`%xt%o%qat%{room}%${name}%0%`);
    },

    async changeRoom(triggerName) {
      const before = await refreshRoom();
      await ctx.send(`%xt%o%qat%{room}%${triggerName}%0%`, 0);
      await waitForRoomChange(before);
      await ctx.send('%xt%o%qmi%{room}%');
      if (adventure.afterStart) await adventure.afterStart(ctx);
    },

    active(prefix) {
      return [...activeObjects].filter(name => name.startsWith(prefix));
    },

    async wait(ms) {
      await sleep(ms);
      if (!running) throw new Stopped();
    },

    log
  };

  return ctx;
}

async function waitForRoomChange(previousRoom) {
  const deadline = Date.now() + ROOM_WAIT_TIMEOUT;

  while (Date.now() < deadline) {
    await sleep(250);
    if (!running) throw new Stopped();

    const room = await refreshRoom();
    if (room && room !== previousRoom) {
      await sleep(ROOM_SETTLE_DELAY);
      if (!running) throw new Stopped();
      return room;
    }
  }

  throw new Error('Timed out waiting for the next room to load.');
}


// ============================================================
// RUN
// ============================================================

function readInt(input, fallback) {
  const value = parseInt(input && input.value, 10);
  return Number.isNaN(value) || value < 0 ? fallback : value;
}

async function startRun() {
  if (running || !selected) return;

  const adventure = selected;
  const den = await findDenName();

  if (!den) {
    setStatus('Go to your den first, then press Start.');
    return;
  }

  const looping = Boolean(loopToggle && loopToggle.checked);
  const totalRuns = looping ? readInt(loopRunsInput, 0) : 1;   // 0 = until stopped
  const delayMs = readInt(loopDelayInput, 5) * 1000;

  log('info', `Starting from ${den}` + (looping ? ` (loop: ${totalRuns || 'until stopped'})` : ''));

  running = true;
  setRunningUI(true);

  let completed = 0;

  try {
    for (let run = 1; totalRuns === 0 || run <= totalRuns; run++) {
      if (!running) throw new Stopped();
      setRunCounter(looping ? `Run ${run}${totalRuns ? ` / ${totalRuns}` : ''} · ${completed} done` : '');

      await runOnce(adventure, den, looping);
      completed++;

      if (!looping || (totalRuns && run >= totalRuns)) break;

      setStatus(`Run ${run} done. Next run in ${delayMs / 1000}s...`);
      await sleep(delayMs);
      if (!running) throw new Stopped();
    }

    setStatus(looping ? `Loop finished: ${completed} run(s).` : (adventure.finishMessage || 'Done!'));
    log('ok', `${adventure.name}: ${completed} run(s) complete.`);

  } catch (error) {
    if (error instanceof Stopped) {
      setStatus(`Stopped after ${completed} run(s).`);
      log('warn', 'Stopped.');
    } else {
      setStatus(`Error: ${error.message}`);
      log('error', error.message);
      console.error('[Adventures]', error);
    }
  } finally {
    running = false;
    cancelSleep();
    setRunningUI(false);
    if (looping) setRunCounter(`${completed} run(s) done`);
  }
}

async function runOnce(adventure, den, leaveAfter) {
  activeObjects.clear();
  prizeOffered = false;
  prizeClaimed = false;
  renderSteps();

  const ctx = makeContext(adventure);
  let stepIndex = -1;

  try {
    // ---------- Create + start ----------
    setStatus(`Starting ${adventure.name} (${mode})...`);
    const hardFlag = mode === 'hard' ? 1 : 0;

    const denRoom = await refreshRoom();
    joinReply = null;
    await ctx.send(`%xt%o%qjc%{room}%${den}%${adventure.questId}%${hardFlag}%`, 0);
    await waitForJoinReply();
    await ctx.send(`%xt%o%qs%{room}%${den}%`, 0);
    await waitForRoomChange(denRoom);
    await ctx.send('%xt%o%qmi%{room}%');
    if (adventure.afterStart) await adventure.afterStart(ctx);

    if (!playerId) throw new Error('Could not detect your player ID.');

    // ---------- Objectives ----------
    for (stepIndex = 0; stepIndex < adventure.steps.length; stepIndex++) {
      const step = adventure.steps[stepIndex];
      markStep(stepIndex, 'active');
      setStatus(`${step.label}...`);
      await step.run(ctx);
      markStep(stepIndex, 'done');
    }
    stepIndex = -1;

    // ---------- Prize ----------
    // Some adventures claim their own prizes in their steps (e.g. TFD).
    if (!adventure.handlesPrizes) await handlePrize(ctx);

    // ---------- Leave (loop only) ----------
    if (leaveAfter) {
      setStatus('Leaving the adventure...');
      const adventureRoom = await refreshRoom();
      await ctx.send('%xt%o%qx%{room}%%', 0);
      await waitForRoomChange(adventureRoom);
    }

  } catch (error) {
    if (stepIndex >= 0) markStep(stepIndex, 'failed');
    throw error;
  }
}

// Why the server refused to start an adventure, in plain words.
const JOIN_ERRORS = {
  NLAND: 'Switch to a land animal first - this adventure only allows land animals.',
  NOCEAN: 'Switch to an ocean animal first - this adventure only allows ocean animals.',
  NMEM: 'This adventure (or hard mode) is for members only.',
  NLVL: 'Your level is too low for this adventure (or for hard mode).'
};

async function waitForJoinReply() {
  const deadline = Date.now() + CREATE_DELAY + 3000;
  while (!joinReply && Date.now() < deadline) {
    await sleep(100);
    if (!running) throw new Stopped();
  }

  if (!joinReply) {
    // No answer seen (listener may not be hooked) - carry on as before.
    await sleep(CREATE_DELAY);
    return;
  }

  if (!joinReply.ok) {
    const reason = joinReply.reason;
    throw new Error(JOIN_ERRORS[reason] || `The game refused to start the adventure (reason: ${reason || 'unknown'}).`);
  }

  await sleep(500);
}

async function handlePrize(ctx) {
  // Wait for the prize screen to open.
  const deadline = Date.now() + PRIZE_SCREEN_TIMEOUT;
  while (!prizeOffered && Date.now() < deadline) {
    await ctx.wait(250);
  }

  if (!prizeOffered) {
    log('warn', 'Prize screen never opened (the server may not have counted the run).');
    return;
  }

  const choice = prizeChoice ? prizeChoice.value : 'manual';

  if (choice === 'manual') {
    setStatus('Pick your prize in the game...');
    const pickDeadline = Date.now() + MANUAL_PICK_TIMEOUT;
    while (!prizeClaimed && Date.now() < pickDeadline) {
      await ctx.wait(250);
    }
    if (prizeClaimed) log('ok', 'Prize claimed.');
    else log('warn', 'No prize claim seen within 60s; moving on.');
    await ctx.wait(1000);
    return;
  }

  const slot = parseInt(choice, 10) - 1;
  setStatus(`Claiming prize ${slot + 1}...`);
  await ctx.send(`%xt%o%qpgift%{room}%${slot}%0%0%`, 100);
  await ctx.send('%xt%o%qpgiftdone%{room}%1%', 1500);
}

function setRunCounter(text) {
  if (runCounterEl) runCounterEl.textContent = text;
}

function stopRun() {
  if (!running) return;
  running = false;
  setStatus('Stopping...');
  cancelSleep();
}


// ============================================================
// UI RENDERING
// ============================================================

function renderAdventureList() {
  listEl.innerHTML = '';

  if (!ADVENTURES.length) {
    listEl.textContent = 'No adventures found in ./adventures.';
    return;
  }

  for (const adventure of ADVENTURES) {
    const button = document.createElement('button');
    button.className = 'ar-adventure' + (adventure === selected ? ' selected' : '');
    button.disabled = running;

    const name = document.createElement('span');
    name.className = 'ar-name';
    name.textContent = adventure.name;

    const meta = document.createElement('span');
    meta.className = 'ar-meta';
    meta.textContent = `${adventure.steps.length} objectives`;

    button.append(name, meta);
    button.addEventListener('click', () => {
      if (running) return;
      selected = adventure;
      mode = adventure.modes[0];
      renderAll();
    });

    listEl.appendChild(button);
  }
}

function renderModes() {
  modeEl.innerHTML = '';
  if (!selected) return;

  for (const m of selected.modes) {
    const button = document.createElement('button');
    button.textContent = m;
    button.className = m === mode ? 'active' : '';
    button.disabled = running;
    button.addEventListener('click', () => {
      if (running) return;
      mode = m;
      renderModes();
    });
    modeEl.appendChild(button);
  }

  modeEl.style.display = selected.modes.length > 1 ? '' : 'none';
}

function renderSteps() {
  stepsEl.innerHTML = '';
  if (!selected) return;

  selected.steps.forEach(step => {
    const row = document.createElement('div');
    row.className = 'ar-step';

    const icon = document.createElement('i');
    icon.className = 'far fa-circle';

    const label = document.createElement('span');
    label.textContent = step.label;

    row.append(icon, label);
    stepsEl.appendChild(row);
  });
}

function markStep(index, state) {
  const row = stepsEl.children[index];
  if (!row) return;

  row.className = `ar-step ${state}`;
  const icon = row.querySelector('i');

  icon.className = {
    active: 'fas fa-spinner fa-spin',
    done: 'fas fa-check-circle',
    failed: 'fas fa-times-circle'
  }[state] || 'far fa-circle';
}

function setRunningUI(isRunning) {
  startButton.disabled = isRunning || !selected;
  stopButton.disabled = !isRunning;
  for (const input of [loopToggle, loopRunsInput, loopDelayInput, prizeChoice]) {
    if (input) input.disabled = isRunning;
  }
  renderAdventureList();
  renderModes();
}

function renderAll() {
  renderAdventureList();
  renderModes();
  renderSteps();
  startButton.disabled = running || !selected;
}


// ============================================================
// INIT
// ============================================================

startButton.addEventListener('click', () => { startRun(); });
stopButton.addEventListener('click', () => { stopRun(); });

setupListeners();
renderAll();
log('info', `Loaded ${ADVENTURES.length} adventure(s).`);
