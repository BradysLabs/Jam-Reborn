const path = require('path')
const { PluginManager: PM } = require('live-plugin-manager')
const fs = require('fs').promises
const { existsSync, mkdirSync } = require('fs')
const Ajv = new (require('ajv'))({ useDefaults: true })
const { ConnectionMessageTypes, PluginTypes } = require('../../../../Constants')

/**
 * The path to the plugins folder
 * @constant
 */
const BASE_PATH = process.platform === 'win32'
  ? path.resolve('plugins/')
  : process.platform === 'darwin'
    ? path.join(__dirname, '..', '..', '..', '..', '..', '..', '..', 'plugins/')
    : undefined

/**
 * Plugin folders that ship with Jam Reborn. These are always trusted;
 * any other plugin must be approved once before it loads.
 * @constant
 */
const BUNDLED_PLUGINS = new Set([
  'achievements',
  'adventure-runner',
  'asset-browser',
  'glow-picker',
  'masterpiece',
  'membership',
  'name-checker',
  'packet-inspector',
  'pairs',
  'room-browser',
  'spammer'
])

/**
 * A packet hook taking this long (ms) gets a warning in the console.
 * @constant
 */
const SLOW_HOOK_MS = 100

/**
 * The default Configuration schema
 * @type {Object}
 * @private
 */
const ConfigurationSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    main: { type: 'string', default: 'index.js' },
    description: { type: 'string', default: '' },
    author: { type: 'string', default: 'Sxip' },
    type: { type: 'string', default: 'game' },
    dependencies: { type: 'object', default: {} }
  },
  required: [
    'name',
    'main',
    'description',
    'author',
    'type',
    'dependencies'
  ]
}

module.exports = class Dispatch {
  /**
   * Constructor
   * @param {Application} application
   * @constructor
   */
  constructor (application) {
    this._application = application

    /**
     * Stores all of the plugins
     * @type {Map<string, any>}
     * @public
     */
    this.plugins = new Map()

    /**
     * Dependency manager plugin manager
     * @type {PluginManager}
     * @public
     */
    this.dependencyManager = new PM(process.platform === 'darwin'
      ? { pluginsPath: path.join(__dirname, '..', '..', '..', '..', '..', '..', '..', 'plugin_packages') }
      : {}
    )

    /**
     * Stores all of the commands
     * @type {Map<string, object>}
     * @public
     */
    this.commands = new Map()

    /**
     * Intervals set
     * @type {Set<Interval>}
     * @public
     */
    this.intervals = new Set()

    /**
     * State object
     * @type {Object}
     * @public
     */
    this.state = {}

    /**
     * Listeners added with onPacket(): called with every packet, including
     * packets sent by plugins.
     * @type {Set<Function>}
     * @private
     */
    this._packetListeners = new Set()

    /**
     * Plugins found but not loaded yet because they haven't been approved.
     * @type {Map<string, {configuration: Object, filepath: string, folder: string}>}
     * @public
     */
    this.pendingPlugins = new Map()

    /**
     * Send-rate limiting for packets plugins send to the server.
     * @private
     */
    this._sendTimes = []
    this._sendChain = Promise.resolve()
    this._throttleWarnedAt = 0

    /**
     * Stores the message hooks
     * @type {Object}
     * @public
     */
    this.hooks = {
      connection: new Map(),
      aj: new Map(),
      any: new Map()
    }

    /**
     * Debug mode flag
     * @type {boolean}
     * @private
     */
    this._debugMode = false

    /**
     * Initializes the default message handlers
     */
    this._initDefaultHandlers()
  }

  /**
   * Initializes the default message handlers
   * @private
   */
  _initDefaultHandlers () {
    this.onMessage({
      type: 'aj',
      message: 'rj',
      callback: ({ message }) => {
        // %xt%rj%<previous room id>%<success>%<room name>%<joined room id>%...
        // e.g. %xt%rj%827248%1%denYourName%828083%...
        const [, , , , success, roomName, roomId] = message.value
        if (success !== '1' || !/^\d+$/.test(roomId || '')) return

        this.setState('room', roomId)
        this.setState('internalRoomId', roomId)
        this.setState('roomName', roomName)
      }
    }).onMessage({
      type: 'aj',
      message: 'login',
      callback: ({ message }) => {
        const { params } = message.value.b.o

        this.setState('player', params)

        this._application.consoleMessage({
          message: 'Successfully logged in!',
          type: 'action'
        })
      }
    })
  }

  /**
   * Commands built into Jam (re-added every time plugins load).
   * @private
   */
  _registerBuiltInCommands () {
    this.onCommand({
      name: 'report',
      description: 'Copies a support report (version, plugins, recent console) to paste when asking for help.',
      callback: () => this._copySupportReport()
    })

    this.onCommand({
      name: 'streaming',
      description: 'Shows what streaming mode is doing right now.',
      callback: () => {
        const streaming = this._application.streamingMode
        this._application.consoleMessage({
          message: streaming ? `Streaming mode - ${streaming.status()}` : 'Streaming mode is not available.',
          type: 'notify'
        })
      }
    })
  }

  /**
   * Builds a support report and copies it to the clipboard. Leaves out
   * personal settings, and hides your username if streaming mode is on.
   * @private
   */
  _copySupportReport () {
    const os = require('os')
    let version = 'unknown'
    try { version = require(path.join(__dirname, '..', '..', '..', '..', '..', 'package.json')).version } catch (_) {}

    const setting = (key, fallback) => {
      try { return this._application.settings.get(key, fallback) } catch (_) { return fallback }
    }

    const consoleLines = []
    try {
      document.querySelectorAll('#messages > div').forEach(el => {
        const text = el.textContent.replace(/\s+/g, ' ').trim()
        if (text) consoleLines.push(text)
      })
    } catch (_) {}

    const plugins = [...this.plugins.values()].map(p => p.configuration.name).sort()
    const lines = [
      `Jam Reborn ${version}`,
      `Electron ${process.versions.electron || '?'} / Node ${process.versions.node} / ${os.platform()} ${os.release()} (${os.arch()})`,
      `Connected: ${this.connected ? 'yes' : 'no'} | Server: ${setting('smartfoxServer', '?')} | Secure: ${setting('secureConnection', '?')}`,
      `Streaming mode: ${setting('streamingMode', false) ? 'on' : 'off'} | Log files: ${setting('saveLogs', false) ? 'on' : 'off'} | Packet limit: ${setting('sendRateLimit', 20)}/s`,
      `Plugins (${plugins.length}): ${plugins.join(', ') || 'none'}`,
      this.pendingPlugins.size ? `Waiting for approval: ${[...this.pendingPlugins.keys()].join(', ')}` : null,
      '',
      'Recent console:',
      ...consoleLines.slice(-40)
    ].filter(line => line !== null)

    let report = lines.join('\n')
    const streaming = this._application.streamingMode
    if (streaming && typeof streaming.mask === 'function') report = streaming.mask(report)

    try {
      require('electron').clipboard.writeText(report)
      this._application.consoleMessage({ type: 'success', message: 'Support report copied. Paste it wherever you\'re asking for help.' })
    } catch (error) {
      this._application.consoleMessage({ type: 'error', message: `Couldn't copy the report: ${error.message}` })
    }
  }

  get connected () {
    return this._application.server.clients.size > 0
  }

  get settings () {
    return this._application.settings
  }

  /**
   * Reads files recursively from a directory
   * @param {string} directory
   * @returns {string[]}
   * @static
   */
  static async readdirRecursive (directory) {
    const result = []

    const read = async (dir) => {
      const entries = await fs.readdir(dir, { withFileTypes: true })

      const promises = entries.map(async (entry) => {
        const filepath = path.join(dir, entry.name)

        if (entry.isDirectory()) {
          await read(filepath)
        } else {
          result.push(filepath)
        }
      })

      await Promise.all(promises)
    }

    await read(directory)
    return result
  }

  /**
   * Opens the plugin window
   * @param name
   * @public
   */
  open (name) {
    const plugin = this.plugins.get(name)

    if (plugin) {
      const { filepath, configuration: { main } } = plugin
      const url = `file://${path.join(filepath, main)}`

      const popup = window.open(url)

      if (popup) {
        // The window gets its own view of dispatch that remembers the packet
        // hooks, packet listeners and commands it adds, so they're all removed
        // when the window closes. Without this, every reopen of a plugin
        // stacked another set of hooks that kept running in the background.
        const view = this._createWindowView(name)
        let cleanedUp = false
        const cleanup = () => {
          if (cleanedUp) return
          cleanedUp = true
          view._dispose()
        }

        popup.jam = {
          application: this._application,
          dispatch: view,
          onPacket: (callback) => view.onPacket(callback),
          offPacket: (callback) => view.offPacket(callback)
        }

        // Show errors from the plugin's window in Jam's console, so broken
        // plugins aren't silently blank.
        const reportError = (message) => {
          this._application.consoleMessage({
            type: 'error',
            message: `Plugin "${name}": ${message}`
          })
        }
        popup.addEventListener('error', (event) => {
          const where = event.filename ? ` (${path.basename(event.filename)}:${event.lineno})` : ''
          reportError(`${event.message || 'Unknown error'}${where}`)
        })
        popup.addEventListener('unhandledrejection', (event) => {
          const reason = event.reason
          reportError(reason && reason.message ? reason.message : String(reason))
        })

        popup.addEventListener('beforeunload', cleanup)
        const closedCheck = setInterval(() => {
          if (popup.closed) {
            clearInterval(closedCheck)
            cleanup()
          }
        }, 2000)
      }
    } else {
      this._application.consoleMessage({
        type: 'error',
        message: `Plugin "${name}" not found.`
      })
    }
  }

  /**
   * A copy of dispatch for one plugin window. It works exactly like dispatch
   * (same state, plugins and sending), but keeps a list of the hooks,
   * packet listeners and commands the window adds so _dispose() can remove
   * them all when the window closes.
   * @returns {Dispatch}
   * @private
   */
  _createWindowView (pluginName = null) {
    const root = this
    const view = Object.create(root)
    const hooks = []
    const packetListeners = new Set()
    const commands = []

    view._root = root

    view.onMessage = function (options = {}) {
      if (options && pluginName && !options.pluginName) options = { ...options, pluginName }
      root.onMessage(options)
      if (options && typeof options.callback === 'function') hooks.push(options)
      return view
    }

    view.offMessage = function (options = {}) {
      root.offMessage(options)
      const index = hooks.findIndex(h => h.callback === options.callback && h.type === options.type)
      if (index !== -1) hooks.splice(index, 1)
      return view
    }

    view.onPacket = function (callback) {
      if (typeof callback !== 'function') return () => {}
      packetListeners.add(callback)
      root.onPacket(callback)
      return () => view.offPacket(callback)
    }

    view.offPacket = function (callback) {
      packetListeners.delete(callback)
      root.offPacket(callback)
    }

    view.onCommand = function (options = {}) {
      const added = options && !root.commands.has(options.name)
      root.onCommand(options)
      if (added && root.commands.has(options.name)) commands.push(options)
      return view
    }

    view._dispose = function () {
      hooks.splice(0).forEach(h => {
        root.offMessage(h)
        const refs = pluginName && root._pluginReferences && root._pluginReferences.get(pluginName)
        if (refs) refs.hooks.forEach(set => set.delete(h.callback))
      })
      packetListeners.forEach(listener => root.offPacket(listener))
      packetListeners.clear()
      commands.splice(0).forEach(c => root.offCommand(c))
      try { root._application.refreshAutoComplete() } catch (_) {}
    }

    return view
  }

  /**
   * Installs plugin dependencies
   * @param {object} configuration
   * @public
   */
  async installDependencies (configuration) {
    const { dependencies } = configuration

    if (!dependencies || Object.keys(dependencies).length === 0) {
      return
    }

    const installPromises = Object.entries(dependencies).map(
      ([module, version]) => this.dependencyManager.install(module, version)
    )

    await Promise.all(installPromises)
  }

  /**
   * Requires a plugin dependency
   * @param {string} name
   */
  require (name) {
    return this.dependencyManager.require(name)
  }

  /**
   * Helper function to wait for the jquery preload to finish
   * @param {Window} window
   * @param {Function} callback
   * @public
   */
  waitForJQuery (window, callback) {
    return new Promise((resolve, reject) => {
      const checkInterval = 100
      const maxRetries = 100
      let retries = 0

      const intervalId = setInterval(() => {
        if (typeof window.$ !== 'undefined') {
          clearInterval(intervalId)
          try {
            callback()
            resolve()
          } catch (error) {
            reject(error)
          }
        } else if (retries >= maxRetries) {
          clearInterval(intervalId)
          reject(new Error('jQuery was not found within the expected time.'))
        } else {
          retries++
        }
      }, checkInterval)
    })
  }

  /**
   * Loads all of the plugins
   * @returns {Promise<void>}
   * @public
   */
  async load (filter = file => path.basename(file) === 'plugin.json') {
    try {
      this._application.consoleMessage({
        message: 'Loading plugins...',
        type: 'wait'
      })

      this._registerBuiltInCommands()

      if (!existsSync(BASE_PATH)) mkdirSync(BASE_PATH, { recursive: true })

      const filepaths = await this.constructor.readdirRecursive(BASE_PATH)
      const validPaths = filepaths.filter(filter)

      if (validPaths.length === 0) {
        this._application.consoleMessage({
          message: 'No plugins found in the plugins directory.',
          type: 'notify'
        })
        return
      }

      this._migrateTrustedPlugins(validPaths)

      const results = await Promise.allSettled(validPaths.map(async filepath => {
        try {
          const configuration = require(filepath)
          await this._storeAndValidate(path.dirname(filepath), configuration.default || configuration)
          return { success: true, path: filepath }
        } catch (error) {
          return {
            success: false,
            path: filepath,
            error: error.message
          }
        }
      }))

      const successful = results.filter(r => r.status === 'fulfilled' && r.value?.success).length
      const failed = results.filter(r => r.status === 'fulfilled' && !r.value?.success).length
      const errors = results
        .filter(r => r.status === 'fulfilled' && !r.value?.success)
        .map(r => r.value)

      if (failed > 0) {
        this._application.consoleMessage({
          message: `${successful} plugins loaded successfully, ${failed} plugins failed to load.`,
          type: failed > 0 ? 'warn' : 'success'
        })

        errors.forEach(({ path: pluginPath, error }) => {
          this._application.consoleMessage({
            message: `Failed to load plugin at ${path.relative(BASE_PATH, pluginPath)}: ${error}`,
            type: 'error'
          })
        })
      } else {
        this._application.consoleMessage({
          message: `Successfully loaded ${successful} plugins.`,
          type: 'success'
        })
      }
    } catch (error) {
      this._application.consoleMessage({
        type: 'error',
        message: `Error loading plugins: ${error.message}`
      })
    }
  }

  /**
   * Dispatches all of the message hooks
   * @param {Object} options - The message context
   * @param {Object} options.client - The client sending the message
   * @param {string} options.type - The message type
   * @param {Object} options.message - The message object
   * @returns {Promise<void>}
   * @public
   */
  async all ({ client, type, message }) {
    const messageType = message.type

    if (this._packetListeners.size || this._logging) {
      this._emitPacket({
        raw: this.constructor._rawOf(message),
        direction: type === ConnectionMessageTypes.aj ? 'in' : 'out',
        type: messageType,
        fromPlugin: false
      })
    }
    const hasAjHooks = type === ConnectionMessageTypes.aj && this.hooks.aj.has(messageType)
    const hasConnectionHooks = type === ConnectionMessageTypes.connection && this.hooks.connection.has(messageType)
    const hasAnyHooks = this.hooks.any.has(ConnectionMessageTypes.any)

    if (!hasAjHooks && !hasConnectionHooks && !hasAnyHooks) {
      return
    }

    const hooks = [
      ...(hasAjHooks ? this.hooks.aj.get(messageType) : []),
      ...(hasConnectionHooks ? this.hooks.connection.get(messageType) : []),
      ...(hasAnyHooks ? this.hooks.any.get(ConnectionMessageTypes.any) : [])
    ]

    if (hooks.length === 0) return

    const context = { client, type, dispatch: this, message }

    try {
      const results = await Promise.allSettled(hooks.map(hook => this._runHook(hook, context, messageType)))

      const errors = results
        .filter(result => result.status === 'rejected')
        .map(result => result.reason)

      if (errors.length > 0) {
        errors.forEach(error => {
          this._application.consoleMessage({
            type: 'error',
            message: `Failed hooking packet ${messageType}: ${error.message}`
          })
        })
      }
    } catch (error) {
      this._application.consoleMessage({
        type: 'error',
        message: `Unexpected error dispatching hooks for ${messageType}: ${error.message}`
      })
    }
  }

  /**
   * Runs one packet hook and times it. Packet hooks run while the packet is
   * waiting to be delivered, so a slow one lags the game; Jam names it in the
   * console (at most once a minute per packet type).
   * @private
   */
  _runHook (hook, context, messageType) {
    const started = Date.now()
    let result
    try {
      result = hook(context)
    } catch (error) {
      return Promise.reject(error)
    }
    const took = Date.now() - started
    if (took >= SLOW_HOOK_MS) {
      if (!this._slowHookWarnings) this._slowHookWarnings = new Map()
      const now = Date.now()
      if (now - (this._slowHookWarnings.get(messageType) || 0) > 60000) {
        this._slowHookWarnings.set(messageType, now)
        const owner = this._hookOwner(hook)
        this._application.consoleMessage({
          type: 'warn',
          message: `${owner ? `Plugin "${owner}"` : 'A plugin'} took ${took}ms to handle a "${messageType}" packet, which can lag the game.`
        })
      }
    }
    return result
  }

  /**
   * Name of the plugin that registered a hook, if it was registered with
   * pluginName.
   * @private
   */
  _hookOwner (hook) {
    if (!this._pluginReferences) return null
    for (const [name, refs] of this._pluginReferences) {
      for (const set of refs.hooks.values()) {
        if (set.has(hook)) return name
      }
    }
    return null
  }

  /**
   * Sends multiple messages
   * @param messages
   * @public
   */
  async sendMultipleMessages ({ type, messages = [] } = {}) {
    if (messages.length === 0) {
      return Promise.resolve()
    }

    const sendFunction = type === ConnectionMessageTypes.aj
      ? this.sendRemoteMessage.bind(this)
      : this.sendConnectionMessage.bind(this)

    try {
      await Promise.all(messages.map(sendFunction))
    } catch (error) {
      this._application.consoleMessage({
        type: 'error',
        message: `Error sending messages: ${error.message}`
      })
    }
  }

  /**
   * Stores and validates the plugin configuration
   * @param filepath
   * @param configuration
   * @private
   */
  async _storeAndValidate (filepath, configuration) {
    const validate = Ajv.compile(ConfigurationSchema)

    if (!validate(configuration)) {
      this._application.consoleMessage({
        type: 'error',
        message: `Failed validating the configuration for the plugin ${filepath}. ${validate.errors[0].message}.`
      })
      return
    }

    let disabledPlugins = []
    try { disabledPlugins = this._application.settings.get('disabledPlugins', []) || [] } catch (_) {}
    if (disabledPlugins.includes(configuration.name)) {
      this._application.consoleMessage({
        type: 'notify',
        message: `Plugin "${configuration.name}" is disabled, skipping.`
      })
      return
    }

    if (this.plugins.has(configuration.name)) {
      this._application.consoleMessage({
        type: 'error',
        message: `Plugin with the name ${configuration.name} already exists.`
      })
      return
    }

    // Plugins that don't ship with Jam must be approved once before they run.
    const folder = path.basename(filepath)
    if (!this.isTrustedPlugin(folder)) {
      this.pendingPlugins.set(configuration.name, { configuration, filepath, folder })
      this._application.consoleMessage({
        type: 'warn',
        message: `New plugin "${configuration.name}" by ${configuration.author || 'unknown'} is waiting for your approval. Open Plugins to review it.`
      })
      this._application.renderPluginItems(configuration)
      return
    }

    try {
      await this.installDependencies(configuration)

      switch (configuration.type) {
        case PluginTypes.game: {
          const PluginInstance = require(path.join(filepath, configuration.main))
          const plugin = new PluginInstance({
            application: this._application,
            dispatch: this
          })

          this.plugins.set(configuration.name, {
            configuration,
            filepath,
            plugin
          })
          break
        }

        case PluginTypes.ui:
          this.plugins.set(configuration.name, { configuration, filepath })
          break

        default:
          throw new Error(`Unsupported plugin type: ${configuration.type}`)
      }

      this._application.renderPluginItems(configuration)
    } catch (error) {
      this._application.consoleMessage({
        type: 'error',
        message: `Error processing the plugin ${filepath}: ${error.message}`
      })
    }
  }

  /**
   * Refreshes a plugin
   * @param {string} The plugin name
   * @returns {Promise<void>}
   */
  async refresh () {
    const { $pluginList, consoleMessage } = this._application

    $pluginList.empty()

    const pluginPaths = [...this.plugins.values()].map(({ filepath, configuration: { main } }) => ({
      jsPath: path.resolve(filepath, main),
      jsonPath: path.resolve(filepath, 'plugin.json')
    }))

    for (const { jsPath, jsonPath } of pluginPaths) {
      const jsCacheKey = require.resolve(jsPath)
      const jsonCacheKey = require.resolve(jsonPath)
      if (require.cache[jsCacheKey]) delete require.cache[jsCacheKey]
      if (require.cache[jsonCacheKey]) delete require.cache[jsonCacheKey]
    }

    this.clearAll()

    // clearAll() also removes Jam's own handlers (room and login tracking),
    // so put them back before plugins load again.
    this._initDefaultHandlers()

    await this.load()

    this._application.emit('refresh:plugins')
    consoleMessage({
      type: 'success',
      message: 'Successfully refreshed plugins.'
    })
  }

  /**
   * Promise timeout helper
   * @param ms
   * @returns {Promise<void>}
   * @public
   */
  wait (ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Displays a server admin message
   * @param {string} text
   * @public
   */
  serverMessage (text) {
    return this.sendConnectionMessage(`%xt%ua%${text}%0%`)
  }

  /**
   * Helper method for random
   * @param {number} min
   * @param {number} max
   * @public
   */
  random (min, max) {
    return ~~(Math.random() * (max - min + 1)) + min
  }

  /**
   * Sets a state
   * @param {string} key
   * @param {any} value
   * @returns {this}
   * @public
   */
  setState (key, value) {
    this.state[key] = value
    return this
  }

  /**
   * Fetches the state
   * @param key
   * @param defaultValue
   * @returns {any}
   * @public
   */
  getState (key, defaultValue = null) {
    const value = this.state[key]
    return value === undefined || value === null ? defaultValue : value
  }

  /**
   * Updates a state
   * @param {string} key
   * @param {any} value
   * @returns {this}
   * @public
   */
  updateState (key, value) {
    if (Object.prototype.hasOwnProperty.call(this.state, key)) this.state[key] = value
    else throw new Error('Invalid state key.')
    return this
  }

  /**
   * Sends a connection message with retry capability
   * @param {string} message - The message to send
   * @param {Object} options - Send options
   * @param {number} [options.retries=0] - Number of retries on failure
   * @param {number} [options.retryDelay=100] - Delay between retries in ms
   * @returns {Promise<number[]>} - Results from sending
   * @public
   */
  async sendConnectionMessage (message, options = {}) {
    return this._sendWithRetry(message, ConnectionMessageTypes.connection, options)
  }

  /**
   * Sends a remote message with retry capability
   * @param {string} message - The message to send
   * @param {Object} options - Send options
   * @param {number} [options.retries=0] - Number of retries on failure
   * @param {number} [options.retryDelay=100] - Delay between retries in ms
   * @returns {Promise<number[]>} - Results from sending
   * @public
   */
  async sendRemoteMessage (message, options = {}) {
    return this._sendWithRetry(message, ConnectionMessageTypes.aj, options)
  }

  /**
   * Internal method to handle sending messages with retry logic
   * @param {string} message - The message to send
   * @param {string} type - Message type (aj or connection)
   * @param {Object} options - Send options
   * @returns {Promise<number[]>} - Results from sending
   * @private
   */
  async _sendWithRetry (message, type, { retries = 0, retryDelay = 100 } = {}) {
    if (this._application.server.clients.size === 0) {
      return []
    }

    // Packets to the server are rate limited; packets to the game are not.
    if (type === ConnectionMessageTypes.aj) await this._waitForSendSlot()

    const clients = [...this._application.server.clients]
    if (clients.length === 0) {
      return []
    }

    const sendMethod = type === ConnectionMessageTypes.aj
      ? client => client.sendRemoteMessage(message)
      : client => client.sendConnectionMessage(message)

    let attempt = 0
    let lastError

    do {
      try {
        if (attempt > 0) {
          await this.wait(retryDelay)

          if (this._debugMode) {
            this._debugLog(`Retry attempt ${attempt} for sending ${type} message`, 'warn')
          }
        }

        const results = await Promise.all(clients.map(sendMethod))

        if (this._packetListeners.size || this._logging) {
          const raw = this.constructor._rawOf(message)
          const parts = raw.split('%')
          this._emitPacket({
            raw,
            direction: type === ConnectionMessageTypes.aj ? 'out' : 'in',
            type: raw[0] === '%' ? (parts[2] === 'o' ? parts[3] : parts[2]) : null,
            fromPlugin: true
          })
        }

        return results
      } catch (error) {
        lastError = error
        attempt++
      }
    } while (attempt <= retries)

    this._application.consoleMessage({
      type: 'error',
      message: `Failed to send message after ${retries + 1} attempts: ${lastError?.message || 'Unknown error'}`
    })

    throw lastError || new Error('Failed to send message')
  }

  /**
   * Plugin folders the user has approved.
   * @returns {string[]}
   * @private
   */
  _trustedPlugins () {
    try {
      const list = this._application.settings.get('trustedPlugins', null)
      return Array.isArray(list) ? list : null
    } catch (_) {
      return null
    }
  }

  /**
   * Whether a plugin folder may load: bundled, or approved by the user.
   * @param {string} folder
   * @returns {boolean}
   * @public
   */
  isTrustedPlugin (folder) {
    if (BUNDLED_PLUGINS.has(folder)) return true
    const trusted = this._trustedPlugins()
    return Array.isArray(trusted) && trusted.includes(folder)
  }

  /**
   * First run with plugin approval: trust every plugin that's already
   * installed, so nothing the user already uses gets switched off.
   * @param {string[]} pluginJsonPaths
   * @private
   */
  _migrateTrustedPlugins (pluginJsonPaths) {
    if (this._trustedPlugins() !== null) return
    const folders = pluginJsonPaths
      .map(file => path.basename(path.dirname(file)))
      .filter(folder => !BUNDLED_PLUGINS.has(folder))
    try { this._application.settings.update('trustedPlugins', [...new Set(folders)]) } catch (_) {}
  }

  /**
   * Approves a waiting plugin and reloads plugins so it starts.
   * @param {string} name
   * @public
   */
  async approvePlugin (name) {
    const pending = this.pendingPlugins.get(name)
    if (!pending) return
    const trusted = this._trustedPlugins() || []
    if (!trusted.includes(pending.folder)) {
      this._application.settings.update('trustedPlugins', [...trusted, pending.folder])
    }
    await this.refresh()
  }

  /**
   * Turns a waiting plugin off (it stays installed; re-enable in Settings).
   * @param {string} name
   * @public
   */
  async rejectPlugin (name) {
    const pending = this.pendingPlugins.get(name)
    if (!pending) return
    let disabled = []
    try { disabled = this._application.settings.get('disabledPlugins', []) || [] } catch (_) {}
    if (!disabled.includes(name)) {
      this._application.settings.update('disabledPlugins', [...disabled, name])
    }
    this.pendingPlugins.delete(name)
    this._application.renderPluginItems()
  }

  /**
   * Listens to every packet: from the game, from the server, and those sent
   * by plugins. The callback gets
   *   { raw, direction: 'in' | 'out', type, fromPlugin, timestamp }
   * where 'in' means towards the game and 'out' towards the server.
   * Returns a function that stops listening.
   * @param {Function} callback
   * @returns {Function}
   * @public
   */
  onPacket (callback) {
    if (typeof callback !== 'function') return () => {}
    this._packetListeners.add(callback)
    return () => this.offPacket(callback)
  }

  /**
   * Stops a listener added with onPacket().
   * @param {Function} callback
   * @public
   */
  offPacket (callback) {
    this._packetListeners.delete(callback)
  }

  /**
   * Calls every packet listener. A listener that throws (for example one
   * from a plugin window that was closed) is removed.
   * @param {Object} packet
   * @private
   */
  _emitPacket (packet) {
    const info = Object.freeze({ timestamp: Date.now(), ...packet })
    if (this._logging) this._application.packetLogger.packet(info)
    for (const listener of [...this._packetListeners]) {
      try {
        listener(info)
      } catch (_) {
        this._packetListeners.delete(listener)
      }
    }
  }

  /**
   * Whether packets should be written to the log file.
   * @returns {boolean}
   * @private
   */
  get _logging () {
    const logger = this._application.packetLogger
    return Boolean(logger && logger.enabled)
  }

  /**
   * Raw text of a message object or string.
   * @param {Message|string} message
   * @returns {string}
   * @private
   */
  static _rawOf (message) {
    if (typeof message === 'string') return message
    try {
      return message && typeof message.toMessage === 'function' ? message.toMessage() : String(message)
    } catch (_) {
      return ''
    }
  }

  /**
   * Max packets per second plugins may send to the server (0 = no limit).
   * @returns {number}
   * @private
   */
  get _sendRateLimit () {
    try {
      const limit = Number(this._application.settings.get('sendRateLimit', 20))
      return Number.isFinite(limit) && limit > 0 ? limit : 0
    } catch (_) {
      return 20
    }
  }

  /**
   * Waits until another packet may be sent without going over the limit.
   * Calls are queued in order, so nothing is dropped - just slowed down.
   * @returns {Promise<void>}
   * @private
   */
  _waitForSendSlot () {
    // Plugin windows share the main limiter, so all of them together stay
    // under the limit.
    if (this._root && this._root !== this) return this._root._waitForSendSlot()

    const run = async () => {
      const limit = this._sendRateLimit
      if (!limit) return

      for (;;) {
        const now = Date.now()
        while (this._sendTimes.length && now - this._sendTimes[0] >= 1000) this._sendTimes.shift()
        if (this._sendTimes.length < limit) break

        if (now - this._throttleWarnedAt > 10000) {
          this._throttleWarnedAt = now
          this._application.consoleMessage({
            type: 'warn',
            message: `Plugins are sending packets very fast - slowing them to ${limit} per second to protect your account. (Settings > Advanced)`
          })
        }
        await this.wait(1000 - (now - this._sendTimes[0]) + 1)
      }

      this._sendTimes.push(Date.now())
    }

    const slot = this._sendChain.then(run, run)
    this._sendChain = slot.catch(() => {})
    return slot
  }

  /**
   * Sets an interval
   * @param {Function} fn - The function to call at intervals
   * @param {number} delay - The delay in milliseconds
   * @param  {...any} args - Additional arguments to pass to the function
   * @returns {number} - The interval ID
   * @public
   */
  setInterval (fn, delay, ...args) {
    if (typeof fn !== 'function') {
      this._application.consoleMessage({
        type: 'error',
        message: 'Invalid interval function provided'
      })
      return null
    }

    try {
      const interval = setInterval(fn, delay, ...args)
      this.intervals.add(interval)
      return interval
    } catch (error) {
      this._application.consoleMessage({
        type: 'error',
        message: `Failed to set interval: ${error.message}`
      })
      return null
    }
  }

  /**
   * Clears an interval
   * @param {number} interval - The interval ID to clear
   * @public
   */
  clearInterval (interval) {
    if (!interval) return

    try {
      clearInterval(interval)
      this.intervals.delete(interval)
    } catch (error) {
      this._application.consoleMessage({
        type: 'error',
        message: `Failed to clear interval: ${error.message}`
      })
    }
  }

  /**
   * Clears all registered intervals
   * @returns {void}
   * @public
   */
  clearAllIntervals () {
    try {
      for (const interval of this.intervals) {
        clearInterval(interval)
      }
      this.intervals.clear()
    } catch (error) {
      this._application.consoleMessage({
        type: 'error',
        message: `Failed to clear all intervals: ${error.message}`
      })
    }
  }

  /**
   * Hooks a command
   * @param command
   * @public
   */
  onCommand ({ name, description = '', callback, pluginName = null } = {}) {
    if (typeof name !== 'string' || typeof callback !== 'function') return

    if (this.commands.has(name)) return
    this.commands.set(name, { name, description, callback })

    if (pluginName) {
      this._trackPluginReference(pluginName, 'command', name, callback)
    }

    return this
  }

  /**
   * Off command, removes the command
   * @param command
   * @public
   */
  offCommand ({ name, callback } = {}) {
    if (!this.commands.has(name)) return

    // Each name maps to one command; remove it if the callback matches
    // (or if no callback was given).
    const command = this.commands.get(name)
    if (!callback || command.callback === callback) this.commands.delete(name)
    return this
  }

  /**
   * Hooks a message by the type
   * @param options
   * @public
   */
  onMessage ({ type, message, callback, pluginName = null } = {}) {
    const registrationMap = {
      [ConnectionMessageTypes.aj]: this._registerAjHook.bind(this),
      [ConnectionMessageTypes.connection]: this._registerConnectionHook.bind(this),
      [ConnectionMessageTypes.any]: this._registerAnyHook.bind(this)
    }

    const registerHook = registrationMap[type]
    if (registerHook) {
      registerHook({ type, message, callback })

      if (pluginName) {
        this._trackPluginReference(pluginName, type, message, callback)
      }
    }

    return this
  }

  /**
   * Unhooks a message
   * @param options
   * @public
   */
  offMessage ({ type, message, callback } = {}) {
    const hooksMap = {
      [ConnectionMessageTypes.aj]: this.hooks.aj,
      [ConnectionMessageTypes.connection]: this.hooks.connection,
      [ConnectionMessageTypes.any]: this.hooks.any
    }

    const hooks = hooksMap[type]
    if (!hooks || typeof callback !== 'function') return this

    // Hooks are stored per packet command (or '*' for "any"). Remove the
    // callback from that list, or from every list if no command was given.
    const key = type === ConnectionMessageTypes.any ? ConnectionMessageTypes.any : message
    const lists = key !== undefined && hooks.has(key)
      ? [[key, hooks.get(key)]]
      : [...hooks.entries()]

    for (const [name, hookList] of lists) {
      const index = hookList.indexOf(callback)
      if (index !== -1) hookList.splice(index, 1)
      if (hookList.length === 0) hooks.delete(name)
    }

    return this
  }

  /**
   * Registers a message hook for the specified type
   * @param {string} type - The type of hook to register
   * @param {object} hook - The hook object containing message and callback
   * @private
   */
  _registerHook (type, { message, callback }) {
    if (!this.hooks[type]) {
      return this._application.consoleMessage({
        type: 'error',
        message: `Invalid hook type: ${type}`
      })
    }

    const hooksMap = this.hooks[type]
    if (hooksMap.has(message)) {
      hooksMap.get(message).push(callback)
    } else {
      hooksMap.set(message, [callback])
    }
  }

  /**
   * Registers a local message hook
   * @param {object} hook - The hook object
   * @private
   */
  _registerConnectionHook (hook) {
    this._registerHook('connection', hook)
  }

  /**
   * Registers a remote message hook
   * @param {object} hook - The hook object
   * @private
   */
  _registerAjHook (hook) {
    this._registerHook('aj', hook)
  }

  /**
   * Registers any message hook
   * @param {object} hook - The hook object
   * @private
   */
  _registerAnyHook (hook) {
    this._registerHook('any', { message: ConnectionMessageTypes.any, callback: hook.callback })
  }

  /**
   * Safely unloads a specific plugin by name
   * @param {string} pluginName - The name of the plugin to unload
   * @returns {boolean} - Whether the plugin was successfully unloaded
   * @public
   */
  async unloadPlugin (pluginName) {
    if (!this.plugins.has(pluginName)) {
      this._application.consoleMessage({
        type: 'error',
        message: `Plugin "${pluginName}" not found.`
      })
      return false
    }

    try {
      const pluginInfo = this.plugins.get(pluginName)

      for (const [type, hooks] of Object.entries(this.hooks)) {
        for (const [messageType, callbacksList] of hooks.entries()) {
          // For now I have to remove all - this is a limitation
          // In the future I will have to remove only the ones that belong to the plugin
        }
      }

      if (pluginInfo.plugin && typeof pluginInfo.plugin.dispose === 'function') {
        await pluginInfo.plugin.dispose()
      }

      this.plugins.delete(pluginName)
      this._application.consoleMessage({
        type: 'success',
        message: `Plugin "${pluginName}" has been unloaded.`
      })

      return true
    } catch (error) {
      this._application.consoleMessage({
        type: 'error',
        message: `Error unloading plugin "${pluginName}": ${error.message}`
      })
      return false
    }
  }

  /**
   * Load a single plugin by path
   * @param {string} filepath - Path to the plugin.json file
   * @returns {Promise<boolean>} - Whether the plugin was loaded successfully
   * @public
   */
  async loadSinglePlugin (filepath) {
    try {
      if (!filepath.endsWith('plugin.json')) {
        throw new Error('Invalid plugin path: must point to a plugin.json file')
      }

      const fullPath = path.resolve(filepath)
      if (require.cache[fullPath]) {
        delete require.cache[fullPath]
      }

      const configuration = require(fullPath)
      const dirPath = path.dirname(fullPath)

      await this._storeAndValidate(dirPath, configuration.default || configuration)

      this._application.consoleMessage({
        type: 'success',
        message: `Plugin "${configuration.name || 'unknown'}" loaded successfully.`
      })

      return true
    } catch (error) {
      this._application.consoleMessage({
        type: 'error',
        message: `Failed to load plugin at ${filepath}: ${error.message}`
      })

      return false
    }
  }

  /**
   * Handles cleanup
   * @public
   */
  clearAll () {
    const pluginsToUnload = [...this.plugins.keys()]

    pluginsToUnload.forEach(pluginName => {
      try {
        const pluginInfo = this.plugins.get(pluginName)
        if (pluginInfo.plugin && typeof pluginInfo.plugin.dispose === 'function') {
          pluginInfo.plugin.dispose()
        }
      } catch (error) {
        this._application.consoleMessage({
          type: 'error',
          message: `Error disposing plugin "${pluginName}": ${error.message}`
        })
      }
    })

    this.plugins.clear()
    this.commands.clear()
    this._packetListeners.clear()
    this.pendingPlugins.clear()

    Object.values(this.hooks).forEach(hookMap => hookMap.clear())
    this.clearAllIntervals()
  }

  /**
   * State management with transaction support
   * @param {Object} stateUpdates - Object containing key-value pairs to update
   * @returns {boolean} - Success status
   * @public
   */
  updateMultipleStates (stateUpdates) {
    if (!stateUpdates || typeof stateUpdates !== 'object') {
      return false
    }

    try {
      Object.entries(stateUpdates).forEach(([key, value]) => {
        this.state[key] = value
      })
      return true
    } catch (error) {
      this._application.consoleMessage({
        type: 'error',
        message: `Failed to update multiple states: ${error.message}`
      })
      return false
    }
  }

  /**
   * Get multiple state values at once
   * @param {string[]} keys - Array of state keys to retrieve
   * @returns {Object} - Object with requested state values
   * @public
   */
  getMultipleStates (keys) {
    if (!Array.isArray(keys)) {
      return {}
    }

    const result = {}
    keys.forEach(key => {
      result[key] = this.getState(key)
    })
    return result
  }

  /**
   * Track plugin hooks and commands
   * @param {string} pluginName - The name of the plugin
   * @param {string} hookType - Type of hook (command, message, any)
   * @param {string} hookId - Identifier for the hook
   * @param {Function} callback - The callback function
   * @private
   */
  _trackPluginReference (pluginName, hookType, hookId, callback) {
    if (!this._pluginReferences) {
      this._pluginReferences = new Map()
    }

    if (!this._pluginReferences.has(pluginName)) {
      this._pluginReferences.set(pluginName, {
        commands: new Set(),
        hooks: new Map()
      })
    }

    const pluginRefs = this._pluginReferences.get(pluginName)

    if (hookType === 'command') {
      pluginRefs.commands.add(hookId)
    } else {
      if (!pluginRefs.hooks.has(hookType)) {
        pluginRefs.hooks.set(hookType, new Set())
      }
      pluginRefs.hooks.get(hookType).add(callback)
    }
  }

  /**
   * Toggle debug mode
   * @param {boolean} enabled - Whether to enable debug mode
   * @returns {boolean} - The new state of debug mode
   * @public
   */
  setDebugMode (enabled = true) {
    this._debugMode = !!enabled
    this._application.consoleMessage({
      type: 'notify',
      message: `Dispatch debug mode ${this._debugMode ? 'enabled' : 'disabled'}`
    })
    return this._debugMode
  }

  /**
   * Log message when in debug mode
   * @param {string} message - Message to log
   * @param {string} [type='notify'] - Message type
   * @private
   */
  _debugLog (message, type = 'notify') {
    if (this._debugMode) {
      this._application.consoleMessage({
        type,
        message: `[DISPATCH DEBUG] ${message}`
      })
    }
  }

  /**
   * Btch message sending
   * @param {Object} options - Batch options
   * @param {string} options.type - Message type (aj or connection)
   * @param {Array<string>} options.messages - Array of messages to send
   * @param {Object} [options.config] - Configuration options
   * @param {number} [options.config.batchSize=10] - Number of messages to send in parallel
   * @param {number} [options.config.delayBetweenBatches=50] - Milliseconds between batches
   * @returns {Promise<Array>} - Array of send results
   * @public
   */
  async sendMessageBatch ({ type, messages = [], config = {} } = {}) {
    if (!messages.length) return []

    const { batchSize = 10, delayBetweenBatches = 50 } = config
    const results = []
    const sendFunction = type === ConnectionMessageTypes.aj
      ? this.sendRemoteMessage.bind(this)
      : this.sendConnectionMessage.bind(this)

    this._debugLog(`Sending batch of ${messages.length} messages (${type})`, 'wait')

    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize)

      try {
        const batchResults = await Promise.allSettled(batch.map(sendFunction))
        results.push(...batchResults)

        if (this._debugMode) {
          const successes = batchResults.filter(r => r.status === 'fulfilled').length
          const failures = batchResults.filter(r => r.status === 'rejected').length
          if (failures > 0) {
            this._debugLog(`Batch ${i / batchSize + 1}: ${successes} succeeded, ${failures} failed`, 'warn')
          }
        }

        if (i + batchSize < messages.length && delayBetweenBatches > 0) {
          await this.wait(delayBetweenBatches)
        }
      } catch (error) {
        this._application.consoleMessage({
          type: 'error',
          message: `Error in message batch at index ${i}: ${error.message}`
        })
      }
    }

    const successful = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length

    this._debugLog(`Batch sending complete: ${successful} succeeded, ${failed} failed`,
      failed > 0 ? 'warn' : 'success')

    return results
  }
}