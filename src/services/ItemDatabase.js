/**
 * Item database.
 *
 * Downloads Animal Jam Classic's item definitions (defpacks) from the game's
 * content server and turns them into a simple ID -> item lookup, so plugins can
 * show "Spiked Wristband" instead of "1037".
 *
 * The download format and URL hashing are based on animaljam.js by Sxip
 * (https://github.com/sxip/animaljam.js), used with permission.
 *
 * Results are cached to disk per game version, so the download only happens
 * once after each Animal Jam update.
 */
const { inflateRaw } = require('zlib')
const { createHash } = require('crypto')
const { promisify } = require('util')
const { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } = require('fs')
const path = require('path')
const HttpClient = require('./HttpClient')
const AMF3Decoder = require('./amf3')

const inflateRawAsync = promisify(inflateRaw)

const CONTENT_URL = 'https://ajcontent.akamaized.net'
const HASH_KEY = 'W3 7r4Ck h4X0r3rs'

const PACKS = {
  strings: '10230',
  clothing: '1000',
  den: '1030'
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) AJClassic/1.5.4 Chrome/87.0.4280.141 Electron/11.5.0 Safari/537.36'

module.exports = class ItemDatabase {
  /**
   * @param {Object} [options]
   * @param {string} [options.cacheDir] - Where to store the downloaded item lists.
   * @param {Function} [options.fetchBuffer] - Override for downloading (used in tests).
   * @param {Function} [options.fetchDeployVersion] - Override for the game version lookup (used in tests).
   */
  constructor ({ cacheDir = path.resolve('cache'), fetchBuffer, fetchDeployVersion } = {}) {
    this.cacheDir = cacheDir
    this.clothing = new Map()
    this.den = new Map()
    this.deployVersion = null
    this.ready = false
    this._loading = null
    this._fetchBuffer = fetchBuffer || ItemDatabase.fetchBuffer
    this._fetchDeployVersion = fetchDeployVersion || ItemDatabase.fetchDeployVersion
  }

  /**
   * Hashes a defpack id into the file name the content server uses.
   * @param {string} id
   * @returns {string}
   */
  static hash (id) {
    const input = `${HASH_KEY}${id}`
    let output = ''
    for (let i = 0; i < input.length; i++) {
      output = i % 2 === 0 ? output + input.charAt(i) : input.charAt(i) + output
    }
    return createHash('md5').update(output).digest('hex')
  }

  /**
   * Looks up the current game deploy version.
   * @returns {Promise<string>}
   */
  static async fetchDeployVersion () {
    const flashvars = await HttpClient.fetchFlashvars()
    if (!flashvars || !flashvars.deploy_version) throw new Error('No deploy_version in flashvars')
    return String(flashvars.deploy_version)
  }

  /**
   * Downloads a raw file from the content server.
   * @param {string} url
   * @returns {Promise<Buffer>}
   */
  static fetchBuffer (url) {
    return HttpClient.get({ url, encoding: null, headers: { 'User-Agent': USER_AGENT } })
  }

  /**
   * Downloads and decodes a single defpack.
   * @param {string} deployVersion
   * @param {string} id
   * @returns {Promise<any>}
   */
  async fetchPack (deployVersion, id) {
    const url = `${CONTENT_URL}/${deployVersion}/defPacks/${ItemDatabase.hash(id)}`
    const compressed = await this._fetchBuffer(url)
    const raw = await inflateRawAsync(compressed)
    return AMF3Decoder.decode(raw)
  }

  /**
   * Loads the item lists, from cache when possible. Safe to call more than once.
   * @returns {Promise<void>}
   */
  load () {
    if (!this._loading) {
      this._loading = this._load().catch(error => {
        this._loading = null
        throw error
      })
    }
    return this._loading
  }

  async _load () {
    let deployVersion = null
    try {
      deployVersion = await this._fetchDeployVersion()
    } catch (_) {
      // Offline or flashvars unavailable: fall back to the newest cached version.
    }

    const cached = this._readCache(deployVersion)
    if (cached) {
      this._apply(cached)
      return
    }

    if (!deployVersion) throw new Error('Could not determine the game version and no cached item list exists.')

    const [strings, clothing, den] = await Promise.all([
      this.fetchPack(deployVersion, PACKS.strings),
      this.fetchPack(deployVersion, PACKS.clothing),
      this.fetchPack(deployVersion, PACKS.den)
    ])

    const data = {
      deployVersion,
      clothing: ItemDatabase.buildList(clothing, strings, 'titleStrId', 'value'),
      den: ItemDatabase.buildList(den, strings, 'nameStrId', 'cost')
    }

    this._writeCache(data)
    this._apply(data)
  }

  /**
   * Turns a decoded defpack into a compact { id: { name, cost, currency, members } } map.
   * @param {Object|Array} pack
   * @param {Object|Array} strings
   * @param {string} nameKey - Which field points into the string table.
   * @param {string} costKey - Which field holds the price.
   * @returns {Object}
   */
  static buildList (pack, strings, nameKey, costKey) {
    const list = {}
    for (const entry of Object.values(pack || {})) {
      if (!entry || entry.id === undefined) continue
      const strId = entry[nameKey]
      const name = (strings && strId !== undefined && strings[strId]) || entry.abbrName || null
      list[String(entry.id)] = {
        name,
        cost: Number(entry[costKey]) || 0,
        currency: Number(entry.currencyType) === 1 ? 'diamonds' : 'gems',
        members: String(entry.membersOnly) === '1'
      }
    }
    return list
  }

  /**
   * Checks for a newer game version and reloads the item lists if there is one.
   * @returns {Promise<boolean>} true if new item lists were loaded.
   */
  async refresh () {
    let latest = null
    try {
      latest = await this._fetchDeployVersion()
    } catch (_) {
      return false
    }
    if (!latest || latest === this.deployVersion) return false
    if (this._loading) await this._loading.catch(() => {})
    this._loading = null
    await this.load()
    return this.deployVersion === latest
  }

  _apply (data) {
    this.deployVersion = data.deployVersion
    this.clothing = new Map(Object.entries(data.clothing || {}))
    this.den = new Map(Object.entries(data.den || {}))
    this.ready = true
  }

  _cacheFile (deployVersion) {
    return path.join(this.cacheDir, `items-${deployVersion}.json`)
  }

  _readCache (deployVersion) {
    try {
      if (deployVersion) {
        const file = this._cacheFile(deployVersion)
        return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
      }
      if (!existsSync(this.cacheDir)) return null
      const newest = readdirSync(this.cacheDir)
        .filter(f => /^items-.+\.json$/.test(f))
        .sort((a, b) => (parseInt(b.slice(6), 10) || 0) - (parseInt(a.slice(6), 10) || 0))[0]
      return newest ? JSON.parse(readFileSync(path.join(this.cacheDir, newest), 'utf8')) : null
    } catch (_) {
      return null
    }
  }

  _writeCache (data) {
    try {
      if (!existsSync(this.cacheDir)) mkdirSync(this.cacheDir, { recursive: true })
      writeFileSync(this._cacheFile(data.deployVersion), JSON.stringify(data))
    } catch (_) {
      // Caching is best-effort.
    }
  }

  /**
   * Gets a clothing item.
   * @param {string|number} id
   * @returns {{name: string, cost: number, currency: string, members: boolean}|null}
   */
  getClothing (id) {
    return this.clothing.get(String(id)) || null
  }

  /**
   * Gets a den item.
   * @param {string|number} id
   * @returns {{name: string, cost: number, currency: string, members: boolean}|null}
   */
  getDenItem (id) {
    return this.den.get(String(id)) || null
  }

  /**
   * Gets an item's name, or null if unknown.
   * @param {string|number} id
   * @param {'clothing'|'den'} [type='clothing']
   * @returns {string|null}
   */
  name (id, type = 'clothing') {
    const item = type === 'den' ? this.getDenItem(id) : this.getClothing(id)
    return item ? item.name : null
  }
}
