/*
 * Packet Inspector (Jam Reborn)
 *
 * Shows every packet going to/from the game in real time, with a plain-English
 * explanation and a field-by-field breakdown for known types.
 *
 * It registers a wildcard hook: dispatch.onMessage({ type: '*', callback }).
 * The callback gets { type, message } where:
 *   - type === 'aj'          -> incoming (server -> you)
 *   - type === 'connection'  -> outgoing (you -> server)
 *   - message.type           -> the packet's command (e.g. 'ib', 'rj')
 *   - message.toMessage()    -> the raw packet string
 *
 * ADD YOUR OWN EXPLANATIONS: extend the EXPLAIN object below. Each entry is
 *   type: { name, desc, out: [...argLabels], in: [...argLabels] }
 * "out"/"in" label the arguments that come AFTER the command token, in order.
 * Use '?' for a field you're not sure about yet. Both out and in are optional.
 */

const ANY = '*'

const EXPLAIN = {
  // --- Movement / avatar ---
  au: { name: 'Avatar Move', desc: 'Sent as you move. Carries your position and size.',
        out: ['room id', 'internal id', 'x', 'y', 'size', 'state'] },

  // --- Rooms ---
  rj: { name: 'Room Join', desc: 'Requests to warp into a room (or the server confirming one).',
        out: ['current room id', 'destination path#instance', '?', '?', '?'],
        in: ['room id'] },
  rx: { name: 'Room Exit', desc: 'Leaving the current room.', out: ['room id'] },

  // --- Shops / items ---
  ib: { name: 'Buy Item', desc: 'Buys a clothing/den-store item. Server reply reports the result.',
        out: ['room id', 'shop id', '?', 'item id', '?', '?', '?'],
        in: ['shop id', 'status (1 = ok)', 'item id', 'gems left', '?'] },
  db: { name: 'Den Buy', desc: 'Buys a den item from a den shop.',
        out: ['room id', '?', 'shop id', 'item id', '?', '?', '?', '?'],
        in: ['?', 'status (1 = ok)', 'gems left', '?', '?', 'den slot'] },
  il: { name: 'Inventory Item', desc: 'One item entering your inventory (e.g. after a purchase).',
        in: ['?', '?', '?', 'username', 'unique/color', '?', '?', 'slot', 'item id'] },
  iu: { name: 'Wear / Unwear Item', desc: 'Puts an item on or takes it off. 1 = worn, 0 = not worn.',
        out: ['room id', '?', '1 = wear / 0 = off', 'slot', '?'] },
  ir: { name: 'Recycle Item', desc: 'Recycles (deletes for gems) the item in a given inventory slot.',
        out: ['room id', 'slot'] },
  di: { name: 'Den Inventory', desc: 'Your den item list.', in: ['den items...'] },
  ts: { name: 'Trade List Update', desc: 'Sets which items are on your trade list. Sends removed items, then added.',
        out: ['room id', 'removed count', '(type, slot) pairs...', 'added count', '(type, slot) pairs...'] },

  // --- Currency / account ---
  zs: { name: 'Currency / Stat Update', desc: 'A gem/diamond or stat counter changing.',
        in: ['-1', 'stat type', 'amount', '0'] },
  grc: { name: 'Redeem Gift Code', desc: 'Redeems a code you own.', out: ['room id', 'code'] },

  // --- Adventures / quests ---
  qj: { name: 'Quest Join', desc: 'Joins an adventure/quest instance.' },
  qs: { name: 'Quest Start', desc: 'Starts the joined adventure.' },
  qx: { name: 'Quest Exit', desc: 'Leaves the current adventure.' },
  qat: { name: 'Quest Action', desc: 'An adventure action/target trigger.' },
  qpup: { name: 'Quest Power-up', desc: 'Uses an adventure power-up.' },
  qaskr: { name: 'Quest Reward Request', desc: 'Asks for the adventure reward.' },
  qpgift: { name: 'Quest Prize', desc: 'Claims an adventure prize gift.' },

  // --- Misc / system ---
  ka: { name: 'Keep-Alive', desc: 'Heartbeat so the server knows you are still connected.', out: ['room id'] },
  login: { name: 'Login', desc: 'Login handshake (JSON).' },
  pubMsg: { name: 'Public Chat', desc: 'A public chat message in the room.' },
  dmnMsg: { name: 'Moderation Message', desc: 'A server moderation notice (e.g. a kick or warning).' }
}

// ---- state ----
const CAP = 800
let packets = []
let nextId = 1
let selectedId = null
let paused = false
let dir = 'all'
let jamRef = null
let hookCb = null

// ---- helpers ----
function now () {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

// Split an %xt% packet into { type, args }. Returns null for non-xt packets.
function parseXt (raw) {
  if (typeof raw !== 'string' || !raw.startsWith('%xt%')) return null
  const parts = raw.split('%')
  const typeIdx = parts[2] === 'o' ? 3 : 2
  const type = parts[typeIdx]
  let args = parts.slice(typeIdx + 1)
  while (args.length && args[args.length - 1] === '') args.pop()
  return { type, args }
}

function explain (pkt) {
  const info = EXPLAIN[pkt.type] || null
  const parsed = parseXt(pkt.raw)
  const fields = []

  if (parsed) {
    const labels = (info && (pkt.dir === 'in' ? info.in : info.out)) || []
    parsed.args.forEach((val, i) => {
      fields.push({ idx: i, label: labels[i] || `field ${i}`, val })
    })
  }

  return {
    name: info ? info.name : `Unknown (${pkt.type || '?'})`,
    desc: info ? info.desc : 'No description yet. Add this type to EXPLAIN in index.js.',
    fields
  }
}

function passesFilter (pkt) {
  if (dir !== 'all' && pkt.dir !== dir) return false
  const q = document.getElementById('search').value.toLowerCase().trim()
  if (!q) return true
  const info = EXPLAIN[pkt.type]
  const name = info ? info.name.toLowerCase() : ''
  return pkt.type.toLowerCase().includes(q) || pkt.raw.toLowerCase().includes(q) || name.includes(q)
}

// ---- rendering ----
function rowEl (pkt) {
  const info = EXPLAIN[pkt.type]
  const row = document.createElement('div')
  row.className = `row ${pkt.dir}` + (pkt.id === selectedId ? ' selected' : '')
  row.dataset.id = pkt.id

  const arrow = document.createElement('span')
  arrow.className = 'arrow'
  arrow.textContent = pkt.dir === 'in' ? '↓' : '↑'

  const type = document.createElement('span')
  type.className = 'type'
  type.textContent = pkt.type || '?'

  const name = document.createElement('span')
  name.className = 'name'
  name.textContent = info ? info.name : ''

  const raw = document.createElement('span')
  raw.className = 'raw'
  raw.textContent = pkt.raw

  const time = document.createElement('span')
  time.className = 'time'
  time.textContent = pkt.time

  row.append(arrow, type, name, raw, time)
  row.addEventListener('click', () => select(pkt.id))
  return row
}

function isAtBottom (el) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 30
}

function appendRow (pkt) {
  const list = document.getElementById('list')
  const empty = list.querySelector('.empty')
  if (empty) empty.remove()

  const stick = isAtBottom(list)
  list.appendChild(rowEl(pkt))

  // Trim DOM + data together.
  while (list.children.length > CAP) list.removeChild(list.firstChild)
  if (stick) list.scrollTop = list.scrollHeight
}

function renderAll () {
  const list = document.getElementById('list')
  list.innerHTML = ''
  const shown = packets.filter(passesFilter)
  if (shown.length === 0) {
    list.innerHTML = '<div class="empty">No packets match this filter.</div>'
    return
  }
  shown.forEach(p => list.appendChild(rowEl(p)))
  list.scrollTop = list.scrollHeight
}

function select (id) {
  selectedId = id
  document.querySelectorAll('.row.selected').forEach(r => r.classList.remove('selected'))
  const row = document.querySelector(`.row[data-id="${id}"]`)
  if (row) row.classList.add('selected')

  const pkt = packets.find(p => p.id === id)
  const detail = document.getElementById('detail')
  if (!pkt) { detail.innerHTML = '<div class="placeholder">Packet no longer in buffer.</div>'; return }

  const info = explain(pkt)
  const dirCls = pkt.dir
  const dirLabel = pkt.dir === 'in' ? 'INCOMING' : 'OUTGOING'

  let rows = ''
  info.fields.forEach(f => {
    rows += `<tr><td class="idx">${f.idx}</td><td class="lab">${escapeHtml(f.label)}</td><td class="val">${escapeHtml(f.val)}</td></tr>`
  })
  const table = info.fields.length
    ? `<table><thead><tr><th>#</th><th>Field</th><th>Value</th></tr></thead><tbody>${rows}</tbody></table>`
    : '<div class="placeholder">No field breakdown for this packet type.</div>'

  detail.innerHTML = `
    <div class="head">
      <span class="dname">${escapeHtml(info.name)}</span>
      <span class="badge ${dirCls}">${dirLabel}</span>
      <span style="flex:1"></span>
      <button class="btn" id="copyRaw">Copy</button>
    </div>
    <div class="desc">${escapeHtml(info.desc)}</div>
    <div class="rawline"><code>${escapeHtml(pkt.raw)}</code></div>
    <div class="fields">${table}</div>`

  document.getElementById('copyRaw').addEventListener('click', () => {
    navigator.clipboard.writeText(pkt.raw)
    const b = document.getElementById('copyRaw')
    b.textContent = 'Copied'
    setTimeout(() => { b.textContent = 'Copy' }, 1200)
  })
}

function escapeHtml (s) {
  const d = document.createElement('div')
  d.textContent = String(s)
  return d.innerHTML
}

// ---- capture ----
function onPacket ({ type, message }) {
  if (paused) return
  let raw = ''
  try { raw = message.toMessage() } catch (_) { raw = String(message && message.value) }

  const pkt = {
    id: nextId++,
    dir: type === 'aj' ? 'in' : 'out',
    type: (message && message.type) || (parseXt(raw) || {}).type || '?',
    raw,
    time: now()
  }

  packets.push(pkt)
  if (packets.length > CAP) packets.shift()

  if (passesFilter(pkt)) appendRow(pkt)
}

function waitForJam () {
  return new Promise((resolve) => {
    if (window.jam && window.jam.dispatch) return resolve(window.jam)
    const t = setInterval(() => {
      if (window.jam && window.jam.dispatch) { clearInterval(t); resolve(window.jam) }
    }, 100)
  })
}

// ---- wiring ----
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('search').addEventListener('input', renderAll)

  document.getElementById('dir').addEventListener('click', (e) => {
    const btn = e.target.closest('button')
    if (!btn) return
    dir = btn.dataset.dir
    document.querySelectorAll('#dir button').forEach(b => b.classList.toggle('active', b === btn))
    renderAll()
  })

  const pauseBtn = document.getElementById('pause')
  pauseBtn.addEventListener('click', () => {
    paused = !paused
    pauseBtn.textContent = paused ? 'Resume' : 'Pause'
    pauseBtn.classList.toggle('warn', paused)
    pauseBtn.classList.toggle('active', paused)
    if (!paused) renderAll()
  })

  document.getElementById('clear').addEventListener('click', () => {
    packets = []
    selectedId = null
    document.getElementById('list').innerHTML = '<div class="empty">Cleared. Waiting for packets...</div>'
    document.getElementById('detail').innerHTML = '<div class="placeholder">Click a packet above to see what it means.</div>'
  })

  jamRef = await waitForJam()
  hookCb = onPacket
  jamRef.dispatch.onMessage({ type: ANY, callback: hookCb })

  // Unhook when the window closes so we don't leak or double-hook on reopen.
  window.addEventListener('beforeunload', () => {
    try { jamRef.dispatch.offMessage({ type: ANY, callback: hookCb }) } catch (_) {}
  })
})
