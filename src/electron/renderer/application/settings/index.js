const { readFile, writeFile } = require('fs/promises')
const { watch, existsSync, writeFileSync } = require('fs')
const path = require('path')
const { debounce } = require('lodash')

const BASE_DIR = process.platform === 'win32'
  ? path.resolve('.')
  : process.platform === 'darwin'
    ? path.join(__dirname, '..', '..', '..', '..', '..', '..', '..')
    : undefined

/**
 * settings.json holds the defaults that ship with Jam Reborn.
 * Your own settings are saved to settings.local.json next to it, which git
 * ignores, so personal settings never end up in a commit.
 * @constant
 */
const DEFAULTS_PATH = BASE_DIR && path.join(BASE_DIR, 'settings.json')
const BASE_PATH = BASE_DIR && path.join(BASE_DIR, 'settings.local.json')

module.exports = class Settings {
  constructor () {
    this.settings = {}
    this._isLoaded = false

    /**
     * Debounced save operation
     * @type {Function}
     * @private
     */
    this._saveSettingsDebounced = debounce(this._saveSettings, 500, { maxWait: 2000 })
    this._watching = false
  }

  get path () {
    return BASE_PATH
  }

  /**
   * Loads the settings file
   * @returns {Promise<void>}
   * @public
   */
  async load () {
    try {
      const readJson = async file => {
        try {
          return JSON.parse(await readFile(file, 'utf-8'))
        } catch (error) {
          if (error.code === 'ENOENT') return null
          throw error
        }
      }

      const defaults = (await readJson(DEFAULTS_PATH)) || {}
      let user = await readJson(BASE_PATH)

      if (!user) {
        // First run with settings.local.json: older versions saved everything
        // to settings.json, so carry those settings over.
        user = { ...defaults }
        writeFileSync(BASE_PATH, JSON.stringify(user, null, 2))
      }

      this.settings = { ...defaults, ...user }
      this._isLoaded = true
      this._watchSettingsFile()
    } catch (error) {
      throw new Error(`Failed loading the settings file. ${error.message}`)
    }
  }

  /**
   * Returns the value if the given key is found
   * @param key
   * @param defaultValue
   * @returns {any}
   * @public
   */
  get (key, defaultValue = false) {
    if (!this._isLoaded) {
      throw new Error('Settings have not been loaded yet. Call `load()` first.')
    }
    return this.settings[key] !== undefined ? this.settings[key] : defaultValue
  }

  /**
   * Gets all settings
   * @returns
   */
  getAll () {
    if (!this._isLoaded) {
      throw new Error('Settings have not been loaded yet. Call `load()` first.')
    }
    return this.settings
  }

  /**
   * Saves all settings
   */
  setAll (settings) {
    if (!this._isLoaded) {
      throw new Error('Settings have not been loaded yet. Call `load()` first.')
    }

    this.settings = settings
    this._saveSettingsDebounced()
  }

  /**
   * Updates the settings file
   * @param key
   * @param value
   * @returns {Promise<void>}
   * @public
   */
  async update (key, value) {
    if (!this._isLoaded) throw new Error('Settings have not been loaded yet. Call `load()` first.')

    this.settings[key] = value
    this._saveSettingsDebounced()
  }

  /**
   * Immediately saves the settings to file
   * @private
   */
  async _saveSettings () {
    try {
      await writeFile(BASE_PATH, JSON.stringify(this.settings, null, 2))
    } catch (error) {
      console.error(`Failed saving the settings file. ${error.message}`)
    }
  }

  /**
   * Watches the settings file for external changes and reloads if necessary
   * @private
   */
  _watchSettingsFile () {
    if (this._watching || !existsSync(BASE_PATH)) return
    this._watching = true
    watch(BASE_PATH, async (eventType) => {
      if (eventType === 'change') {
        try {
          const settings = await readFile(BASE_PATH, 'utf-8')
          this.settings = JSON.parse(settings)
        } catch (error) {
          console.error(`Failed reloading the settings file after external change. ${error.message}`)
        }
      }
    })
  }
}
