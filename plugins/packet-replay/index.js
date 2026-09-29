/*
 * Packet Replay (Jam Reborn)
 *
 * A manual packet workbench: type or paste a packet, get it explained, send it
 * once to the server, and save it to a local library for later.
 *
 * This is a single-shot developer/testing tool by design - it sends one packet
 * when you click Send. It has no looping, timers, or auto-repeat (that would be
 * a spammer, not a test tool).
 *
 * Saved packets live as JSON files in the plugin's ./saved folder, so you can
 * back them up or share individual ones.
 */

const fs = require('fs')
const path = require('path')

const SAVE_DIR = path.join(__dirname, 'saved')

// ---- explanation dictionary (shared idea with Packet Inspector) ----
const EXPLAIN = {
  au: { name: 'Avatar Move', desc: 'Sent as you move. Carries position and size.',
        out: ['room id', 'internal id', 'x', 'y', 'size', 'state'] },
  rj: { name: 'Room Join', desc: 'Warps into a room.',
        out: ['current room id', 'destination path#instance', '?', '?', '?'] },
  rx: { name: 'Room Exit', desc: 'Leaves the current room.', out: ['room id'] },
  ib: { name: 'Buy Item', desc: 'Buys a clothing/den-store item.',
        out: ['room id', 'shop id', '?', 'item id', '?', '?', '?'] },
  db: { name: 'Den Buy', desc: 'Buys a den item from a den shop.',
        out: ['room id', '?', 'shop id', 'item id', '?', '?', '?', '?'] },
  iu: { name: 'Wear / Unwear Item', desc: '1 = worn, 0 = not worn.',
        out: ['room id', '?', '1 = wear / 0 = off', 'slot', '?'] },
  ir: { name: 'Recycle Item', desc: 'Recycles the item in a slot.', out: ['room id', 'slot'] },
  ts: { name: 'Trade List Update', desc: 'Sets your trade-list items.',
        out: ['room id', 'removed count', '(type, slot)...', 'added count', '(type, slot)...'] },
  zs: { name: 'Currency / Stat Update', desc: 'A gem/diamond or stat counter.',
        out: ['-1', 'stat type', 'amount', '0'] },
  grc: { name: 'Redeem Gift Code', desc: 'Redeems a code you own.', out: ['room id', 'code'] },
  ka: { name: 'Keep-Alive', desc: 'Heartbeat so the server knows you are connected.', out: ['room id'] },
  qj: { name: 'Quest Join', desc: 'Joins an adventure instance.' },
  qs: { name: 'Quest Start', desc: 'Starts the adventure.' },
  qx: { name: 'Quest Exit', desc: 'Leaves the adventure.' },
  qat: { name: 'Quest Action', desc: 'An adventure action/target.' },
  qpup: { name: 'Quest Power-up', desc: 'Uses an adventure power-up.' }
}

let jamRef = null

function $ (id) { return document.getElementById(id) }
function setStatus (msg, isErr) {
  const el = $('status'); el.textContent = msg; el.className = (isErr ? 'err' : 'ok') + ' mt'
}
function escapeHtml (s) { const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML }

function parseXt (raw) {
  if (typeof raw !== 'string' || !raw.startsWith('%xt%')) return null
  const parts = raw.split('%')
  const typeIdx = parts[2] === 'o' ? 3 : 2
  const type = parts[typeIdx]
  const args = parts.slice(typeIdx + 1)
  while (args.length && args[args.length - 1] === '') args.pop()
  return { type, args }
}

function showExplanation (raw) {
  const card = $('explainCard')
  const parsed = parseXt(raw)
  if (!raw.trim()) { card.style.display = 'none'; return }

  const info = parsed ? EXPLAIN[parsed.type] : null
  $('exName').textContent = info ? info.name : (parsed ? `Unknown (${parsed.type})` : 'Not an %xt% packet')
  $('exDesc').textContent = info ? info.desc
    : (parsed ? 'No description yet for this type.' : 'This tool explains %xt% packets; others just send as-is.')

  let html = ''
  if (parsed) {
    const labels = (info && info.out) || []
    html = '<table><thead><tr><th>#</th><th>Field</th><th>Value</th></tr></thead><tbody>'
    parsed.args.forEach((v, i) => {
      html += `<tr><td class="idx">${i}</td><td class="lab">${escapeHtml(labels[i] || 'field ' + i)}</td><td class="val">${escapeHtml(v)}</td></tr>`
    })
    html += '</tbody></table>'
  }
  $('exFields').innerHTML = html
  card.style.display = 'block'
}

// ---- saved library ----
function ensureDir () { try { if (!fs.existsSync(SAVE_DIR)) fs.mkdirSync(SAVE_DIR, { recursive: true }) } catch (_) {} }

function safeName (name) {
  return name.trim().replace(/[^a-z0-9-_ ]/gi, '').replace(/\s+/g, '_').slice(0, 60) || 'packet'
}

function listSaved () {
  ensureDir()
  let files = []
  try { files = fs.readdirSync(SAVE_DIR).filter(f => f.endsWith('.json')) } catch (_) {}
  const items = []
  files.forEach(f => {
    try { items.push({ file: f, ...JSON.parse(fs.readFileSync(path.join(SAVE_DIR, f), 'utf8')) }) } catch (_) {}
  })
  items.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
  return items
}

function renderSaved () {
  const list = $('savedList')
  const items = listSaved()
  list.innerHTML = ''
  if (items.length === 0) {
    list.innerHTML = '<div class="muted-note mt">Nothing saved yet.</div>'
    return
  }
  items.forEach(it => {
    const row = document.createElement('div')
    row.className = 'saved-item'

    const col = document.createElement('div')
    col.style.flex = '1'; col.style.minWidth = '0'
    const n = document.createElement('div'); n.className = 'si-name'; n.textContent = it.name || it.file
    const r = document.createElement('div'); r.className = 'si-raw'; r.textContent = it.raw || ''
    col.append(n, r)

    const del = document.createElement('button')
    del.className = 'si-del'; del.textContent = '✕'; del.title = 'Delete'
    del.addEventListener('click', (e) => {
      e.stopPropagation()
      try { fs.unlinkSync(path.join(SAVE_DIR, it.file)) } catch (_) {}
      renderSaved()
    })

    row.append(col, del)
    row.addEventListener('click', () => {
      $('pname').value = it.name || ''
      $('raw').value = it.raw || ''
      $('note').value = it.note || ''
      showExplanation(it.raw || '')
      setStatus(`Loaded "${it.name || it.file}".`, false)
    })
    list.appendChild(row)
  })
}

function savePacket () {
  const name = $('pname').value.trim()
  const raw = $('raw').value.trim()
  if (!name) return setStatus('Give it a name first.', true)
  if (!raw) return setStatus('Nothing to save - the packet is empty.', true)

  ensureDir()
  const record = { name, raw, note: $('note').value.trim(), savedAt: Date.now() }
  const file = safeName(name) + '.json'
  try {
    fs.writeFileSync(path.join(SAVE_DIR, file), JSON.stringify(record, null, 2))
    setStatus(`Saved "${name}".`, false)
    renderSaved()
  } catch (err) {
    setStatus(`Couldn't save: ${err.message}`, true)
  }
}

async function sendPacket () {
  const raw = $('raw').value.trim()
  if (!raw) return setStatus('Nothing to send.', true)
  if (!jamRef) return setStatus('Not connected yet.', true)
  try {
    await jamRef.dispatch.sendRemoteMessage(raw)
    setStatus('Sent once.', false)
  } catch (err) {
    setStatus(`Send failed: ${err.message}`, true)
  }
}

function waitForJam () {
  return new Promise((resolve) => {
    if (window.jam && window.jam.dispatch) return resolve(window.jam)
    const t = setInterval(() => {
      if (window.jam && window.jam.dispatch) { clearInterval(t); resolve(window.jam) }
    }, 100)
  })
}

document.addEventListener('DOMContentLoaded', async () => {
  $('explainBtn').addEventListener('click', () => showExplanation($('raw').value))
  $('saveBtn').addEventListener('click', savePacket)
  $('sendBtn').addEventListener('click', sendPacket)
  $('raw').addEventListener('input', () => showExplanation($('raw').value))

  renderSaved()
  jamRef = await waitForJam()
})
