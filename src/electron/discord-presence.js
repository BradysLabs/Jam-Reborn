const RPC = require('discord-rpc')

/**
 * Discord Application (Client) ID.
 *
 * Create one at https://discord.com/developers/applications, NAME IT
 * "Jam Reborn" (that name is what shows after "Playing"), then copy its
 * Application ID here. Until you do, presence stays off silently.
 */
const CLIENT_ID = '1554620695827316747'

/**
 * Shows a "Playing Jam Reborn" status on the user's Discord profile by
 * talking to their local Discord client over IPC. Fails quietly if Discord
 * isn't running, and retries.
 */
module.exports = class DiscordPresence {
  constructor () {
    this._client = null
    this._enabled = false
    this._connected = false
    this._startTimestamp = Date.now()
    this._reconnectTimer = null
  }

  /**
   * Turns presence on and connects.
   */
  enable () {
    if (this._enabled) return
    this._enabled = true
    this._connect()
  }

  /**
   * Turns presence off and clears the status.
   */
  disable () {
    this._enabled = false
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = null
    }
    if (this._client) {
      try { this._client.clearActivity().catch(() => {}) } catch (_) {}
      try { this._client.destroy() } catch (_) {}
      this._client = null
    }
    this._connected = false
  }

  /**
   * Attempts to connect to the local Discord client.
   * @private
   */
  _connect () {
    if (!this._enabled) return
    if (!CLIENT_ID || CLIENT_ID.startsWith('YOUR_')) return // not configured yet

    const client = new RPC.Client({ transport: 'ipc' })
    this._client = client

    client.on('ready', () => {
      this._connected = true
      this._setActivity()
    })

    client.login({ clientId: CLIENT_ID }).catch(() => {
      // Discord not open yet, or connection failed - retry later.
      this._connected = false
      this._scheduleReconnect()
    })
  }

  /**
   * Schedules a reconnect attempt while enabled.
   * @private
   */
  _scheduleReconnect () {
    if (!this._enabled || this._reconnectTimer) return
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null
      this._connect()
    }, 15000)
  }

  /**
   * Pushes the current activity to Discord.
   * @private
   */
  _setActivity () {
    if (!this._client || !this._connected) return
    this._client.setActivity({
      details: 'Animal Jam Classic',
      state: 'via Jam Reborn',
      startTimestamp: this._startTimestamp,
      largeImageKey: 'logo',
      largeImageText: 'Jam Reborn',
      instance: false
    }).catch(() => {})
  }
}