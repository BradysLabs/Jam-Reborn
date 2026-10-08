const path = require('path')
const { mkdirSync, appendFile, readdirSync, statSync, unlinkSync } = require('fs')
const { hideSecrets } = require('./Secrets')

/**
 * Log files older than this are deleted, and the folder is kept under
 * MAX_TOTAL_BYTES (oldest files go first), so logs never fill up the drive.
 * @constant
 */
const KEEP_DAYS = 7
const MAX_TOTAL_BYTES = 200 * 1024 * 1024

/**
 * Writes Jam's console messages and every packet to a daily log file
 * (logs/jam-YYYY-MM-DD.log) when "Save log files" is on in Settings.
 *
 * Writes are batched, so logging every packet doesn't slow the game down.
 */
module.exports = class PacketLogger {
  /**
   * @param {Application} application
   */
  constructor (application) {
    this._application = application
    this._buffer = []
    this._timer = null
    this._dirReady = false
    this._lastCleanup = 0
  }

  /**
   * Whether logging is turned on in settings.
   * @returns {boolean}
   */
  get enabled () {
    try {
      return this._application.settings.get('saveLogs', false) === true
    } catch (_) {
      return false
    }
  }

  /**
   * Folder the logs go in.
   * @returns {string}
   */
  get folder () {
    return path.resolve('logs')
  }

  /**
   * Logs a packet.
   * @param {{raw: string, direction: string, type: string, fromPlugin: boolean, timestamp: number}} packet
   */
  packet (packet) {
    if (!this.enabled || !packet) return
    const arrow = packet.direction === 'in' ? 'IN ' : 'OUT'
    const source = packet.fromPlugin ? ' [plugin]' : ''
    this._push(packet.timestamp, `${arrow}${source} ${packet.raw}`)
  }

  /**
   * Logs a console message.
   * @param {string} type
   * @param {string} message
   */
  console (type, message) {
    if (!this.enabled || !message) return
    this._push(Date.now(), `--- [${type}] ${String(message).replace(/\s+/g, ' ')}`)
  }

  /**
   * Adds a line, hiding the username if streaming mode is on.
   * @private
   */
  _push (timestamp, text) {
    // Log files never contain login tokens, hashes or emails.
    text = hideSecrets(text)
    const streaming = this._application.streamingMode
    if (streaming && typeof streaming.mask === 'function') text = streaming.mask(text)

    const time = new Date(timestamp || Date.now())
    const stamp = time.toTimeString().slice(0, 8) + '.' + String(time.getMilliseconds()).padStart(3, '0')
    this._buffer.push(`${stamp} ${text}`)

    if (!this._timer) this._timer = setTimeout(() => this._flush(), 500)
  }

  /**
   * Writes buffered lines to today's file.
   * @private
   */
  /**
   * Deletes old log files and keeps the folder under the size limit.
   * @public
   */
  cleanup () {
    try {
      const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000
      const files = readdirSync(this.folder)
        .filter(name => /^jam-\d{4}-\d{2}-\d{2}\.log$/.test(name))
        .map(name => {
          const file = path.join(this.folder, name)
          const { size, mtimeMs } = statSync(file)
          return { file, size, mtimeMs }
        })
        .sort((a, b) => a.mtimeMs - b.mtimeMs)

      let total = files.reduce((sum, f) => sum + f.size, 0)
      files.forEach((f, index) => {
        const isNewest = index === files.length - 1
        if (isNewest) return
        if (f.mtimeMs < cutoff || total > MAX_TOTAL_BYTES) {
          try {
            unlinkSync(f.file)
            total -= f.size
          } catch (_) {}
        }
      })
    } catch (_) { /* no logs folder yet */ }
  }

  _flush () {
    this._timer = null
    if (!this._buffer.length) return

    const lines = this._buffer.join('\n') + '\n'
    this._buffer = []

    try {
      if (!this._dirReady) {
        mkdirSync(this.folder, { recursive: true })
        this._dirReady = true
      }
    } catch (_) {
      return
    }

    if (Date.now() - this._lastCleanup > 60 * 60 * 1000) {
      this._lastCleanup = Date.now()
      this.cleanup()
    }

    const now = new Date()
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    appendFile(path.join(this.folder, `jam-${day}.log`), lines, () => {})
  }
}
