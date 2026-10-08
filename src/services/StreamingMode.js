const path = require('path')
const os = require('os')
const { mkdirSync, writeFileSync, readFileSync, existsSync } = require('fs')

/**
 * Folders the game client may keep its data in. It's named "AJ Classic", so
 * Electron uses %APPDATA%/AJ Classic; "Jam Classic" is checked too in case
 * a build renames it. The client reads streaming-mode.json from its folder
 * and saves the last login (config.json) there.
 * @constant
 */
const APP_DATA = process.platform === 'win32'
  ? path.join(os.homedir(), 'AppData', 'Roaming')
  : process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support')
    : undefined

const CLIENT_DATA_PATHS = APP_DATA
  ? [path.join(APP_DATA, 'AJ Classic'), path.join(APP_DATA, 'Jam Classic')]
  : []

/**
 * The Jam Classic game install folder (see the patcher). The flag file is also
 * written here, since the game can always find files next to itself.
 * @constant
 */
const GAME_INSTALL_PATH = process.platform === 'win32'
  ? path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'jam-classic')
  : process.platform === 'darwin'
    ? path.join('/', 'Applications', 'Jam Classic.app', 'Contents')
    : undefined

const DEFAULT_ALIAS = 'Streamer'

/**
 * Escapes a string for use inside a RegExp.
 * @param {string} text
 * @returns {string}
 */
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Streaming mode: shows a display name of your choosing instead of your real
 * username, so it never appears on stream.
 *
 * How it works (client side only - the server and other players still see
 * your real name):
 *   - Packets going TO the game have your real name swapped for the display
 *     name, so name tags, your HUD, buddy lists, den names, etc. show it.
 *   - Packets going TO the server have the display name swapped back, so
 *     anything the game sends using it (e.g. "denDisplayName") still works.
 *   - Jam's own console and packet views are masked the same way.
 *
 * The real name is learned from the login packet the game sends.
 */
module.exports = class StreamingMode {
  /**
   * @param {Application} application
   */
  constructor (application) {
    this._application = application

    /**
     * Real username, learned at login.
     * @type {string|null}
     */
    this.realName = null

    /**
     * Every username of yours seen this session (current login, earlier
     * logins, the game's saved login). All of them are hidden, so switching
     * accounts never shows a previous account's real name.
     * @type {Set<string>}
     */
    this.knownNames = new Set()

    /**
     * Whether packet swapping is active for the current login. Only turned on
     * at login so the game never sees a mix of real and display names.
     * @type {boolean}
     */
    this.sessionActive = false

    this._maskPattern = null

    /**
     * How many packets had the name swapped (for the status command).
     */
    this.stats = { toClient: 0, toServer: 0 }
  }

  /**
   * Whether streaming mode is turned on in settings.
   * @returns {boolean}
   */
  get enabled () {
    try {
      return this._application.settings.get('streamingMode', false) === true
    } catch (_) {
      return false
    }
  }

  /**
   * The display name shown instead of the real username.
   * @returns {string}
   */
  get alias () {
    let alias = DEFAULT_ALIAS
    try {
      alias = this._application.settings.get('streamingAlias', DEFAULT_ALIAS)
    } catch (_) {}
    return StreamingMode.isValidAlias(alias) ? alias : DEFAULT_ALIAS
  }

  /**
   * Display names must look like a username: 3-20 letters/numbers.
   * @param {string} alias
   * @returns {boolean}
   */
  static isValidAlias (alias) {
    return typeof alias === 'string' && /^[A-Za-z0-9]{3,20}$/.test(alias)
  }

  /**
   * Handles the game's login packet, e.g.
   * <login z='sbiLogin'><nick><![CDATA[Name]]></nick>...
   *
   * With streaming mode on, the game client logs in with the display name,
   * so it's swapped back to the real username (read from the game client's
   * saved login) before the packet goes to the server.
   *
   * @param {string} packet Raw outgoing login packet
   * @returns {string} The packet to send to the server
   */
  onLoginPacket (packet) {
    const nickPattern = /(<nick>\s*(?:<!\[CDATA\[)?\s*)([^\]<]*?)(\s*(?:\]\]>)?\s*<\/nick>)/i
    const match = nickPattern.exec(packet || '')
    if (!match) return packet

    const nick = match[2]
    const alias = this.alias
    const saved = StreamingMode.readClientUsername()
    const aliasInNick = new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(alias)}(?![A-Za-z0-9])`, 'i')

    // The nick is "<username>%<...>%<version>%electron%...": the username is
    // the first field. The game's saved login can still be the previous
    // account (it's only updated after a successful login), so the name in
    // the login itself wins.
    const loginName = String(nick).split('%')[0].trim()
    const loginIsAlias = loginName.toLowerCase() === alias.toLowerCase()
    const loginNameValid = /^[A-Za-z0-9]{3,20}$/.test(loginName)

    this.stats = { toClient: 0, toServer: 0 }
    this._maskPattern = null
    this.nameSource = loginNameValid && !loginIsAlias ? 'login packet' : 'saved login'
    this.nickMatchesSaved = saved ? nick.toLowerCase().includes(saved.toLowerCase()) : null

    if (aliasInNick.test(nick) && (loginIsAlias || !loginNameValid)) {
      // The game logged in with the display name: swap the real name back in.
      if (!saved) {
        this.realName = null
        this.sessionActive = false
        this._application.consoleMessage({
          message: 'Streaming mode: could not find your real username, so login may fail. Turn streaming mode off and restart the game.',
          type: 'error'
        })
        return packet
      }

      this.realName = saved
      this._remember(saved)
      // The game already uses the display name, so swapping must stay on
      // for this login even if streaming mode was turned off in the meantime.
      this.sessionActive = true
      const fixedNick = nick.replace(new RegExp(aliasInNick.source, 'gi'), (_, before) => `${before}${saved}`)
      packet = packet.replace(nickPattern, (_, before, __, after) => `${before}${fixedNick}${after}`)
    } else {
      this.realName = loginNameValid ? loginName : saved
      this.sessionActive = Boolean(this.realName) && this.enabled && this.realName.toLowerCase() !== alias.toLowerCase()
    }

    this._remember(this.realName)
    if (saved && saved.toLowerCase() !== alias.toLowerCase()) this._remember(saved)

    if (this.sessionActive) {
      this._application.consoleMessage({
        message: `Streaming mode on: showing your name as "${alias}".`,
        type: 'notify'
      })
    }

    return packet
  }

  /**
   * The username saved by the game client at its last login.
   * @returns {string|null}
   */
  static readClientUsername () {
    for (const folder of CLIENT_DATA_PATHS) {
      try {
        const data = JSON.parse(readFileSync(path.join(folder, 'config.json'), 'utf8'))
        const name = data && data.login && data.login.username
        if (typeof name === 'string' && /^[A-Za-z0-9]+$/.test(name)) return name
      } catch (_) { /* not this folder */ }
    }
    return null
  }

  /**
   * Adds a username to the set of names to hide.
   * @param {string} name
   * @private
   */
  _remember (name) {
    if (typeof name !== 'string' || !/^[A-Za-z0-9]{3,20}$/.test(name)) return
    const before = this.knownNames.size
    this.knownNames.add(name.toLowerCase())
    if (this.knownNames.size !== before) this._maskPattern = null
  }

  /**
   * Regex matching the real name (and "den" + real name) as a whole word.
   * @returns {RegExp|null}
   * @private
   */
  _pattern () {
    if (!this.knownNames.size) return null
    if (!this._maskPattern) {
      const names = [...this.knownNames].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|')
      this._maskPattern = new RegExp(
        `(^|[^A-Za-z0-9])(den)?(?:${names})(?![A-Za-z0-9])`,
        'gi'
      )
    }
    this._maskPattern.lastIndex = 0
    return this._maskPattern
  }

  /**
   * Replaces the real name with the display name in any text.
   * @param {string} text
   * @param {string} alias
   * @returns {string}
   * @private
   */
  _replaceRealName (text, alias) {
    const pattern = this._pattern()
    if (!pattern || typeof text !== 'string') return text
    return text.replace(pattern, (_, before, den) => `${before}${den || ''}${alias}`)
  }

  /**
   * Packet on its way to the game: real name -> display name.
   * @param {string} packet
   * @returns {string}
   */
  toClient (packet) {
    if (!this.sessionActive) return packet
    const swapped = this._replaceRealName(packet, this.alias)
    if (swapped !== packet) this.stats.toClient++
    return swapped
  }

  /**
   * Packet on its way to the server: display name -> real name.
   * Only exact %xt% fields are swapped, so chat text is never touched.
   * @param {string} packet
   * @returns {string}
   */
  toServer (packet) {
    if (!this.sessionActive || !this.realName || typeof packet !== 'string') return packet
    if (packet[0] !== '%') return packet

    const alias = this.alias.toLowerCase()
    const denAlias = `den${alias}`
    let changed = false

    const parts = packet.split('%').map(field => {
      const lower = field.toLowerCase()
      if (lower === alias) {
        changed = true
        return this.realName
      }
      if (lower === denAlias) {
        changed = true
        return `${field.slice(0, 3)}${this.realName}`
      }
      return field
    })

    if (!changed) return packet
    this.stats.toServer++
    return parts.join('%')
  }

  /**
   * One-line summary for the "streaming" command.
   * @returns {string}
   */
  status () {
    return [
      `Setting: ${this.enabled ? 'on' : 'off'}`,
      `display name: ${this.alias}`,
      `swapping this login: ${this.sessionActive ? 'yes' : 'no'}`,
      `real name known: ${this.realName ? `yes (from ${this.nameSource})` : 'no'}`,
      `names hidden: ${this.knownNames.size}`,
      `login matches saved name: ${this.nickMatchesSaved === null || this.nickMatchesSaved === undefined ? 'n/a' : (this.nickMatchesSaved ? 'yes' : 'no')}`,
      `packets swapped to game: ${this.stats.toClient}`,
      `to server: ${this.stats.toServer}`
    ].join(' | ')
  }

  /**
   * Masks the real name in text shown in Jam's own windows (console,
   * packet logs). Works whenever streaming mode is on, even mid-session.
   * @param {string} text
   * @returns {string}
   */
  mask (text) {
    if (!this.enabled) return text
    return this._replaceRealName(text, this.alias)
  }

  /**
   * Tells the game client (via a small file) whether to hide the username
   * on its login screen.
   */
  writeClientFlag () {
    const flag = JSON.stringify({ enabled: this.enabled, alias: this.alias })

    if (GAME_INSTALL_PATH && existsSync(GAME_INSTALL_PATH)) {
      try {
        writeFileSync(path.join(GAME_INSTALL_PATH, 'streaming-mode.json'), flag)
      } catch (error) {
        console.error(`Failed writing streaming mode flag next to the game: ${error.message}`)
      }
    }

    for (const folder of CLIENT_DATA_PATHS) {
      try {
        mkdirSync(folder, { recursive: true })
        writeFileSync(path.join(folder, 'streaming-mode.json'), flag)
      } catch (error) {
        console.error(`Failed writing streaming mode flag to ${folder}: ${error.message}`)
      }
    }
  }
}
