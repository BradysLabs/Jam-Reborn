/**
 * Module name
 * @type {string}
 */
exports.name = 'settings'

/**
 * Render the settings modal
 * @param {Application} app - The application instance
 * @param {Object} data - Additional data passed to the modal
 * @returns {JQuery<HTMLElement>} The rendered modal element
 */
const fs = require('fs')
const path = require('path')

// Preset accent colors for the Appearance tab.
const ACCENT_PRESETS = [
  { name: 'Green', color: '#38b000' },
  { name: 'Blue', color: '#335fff' },
  { name: 'Pink', color: '#f10048' },
  { name: 'Purple', color: '#8b5cf6' },
  { name: 'Orange', color: '#f0851f' },
  { name: 'Cyan', color: '#06b6d4' },
  { name: 'Red', color: '#ef4444' },
  { name: 'Gold', color: '#f0b429' }
]

exports.render = function (app, data = {}) {
  const $modal = $(`
    <div class="flex items-center justify-center min-h-screen p-4">
      <!-- Modal Backdrop -->
      <div class="fixed inset-0 bg-black/50 transition-opacity"></div>
      
      <!-- Modal Content -->
      <div class="relative bg-secondary-bg rounded-lg shadow-xl max-w-md w-full max-h-[80vh] flex flex-col">
        <!-- Modal Header -->
        <div class="flex items-center justify-between p-4 border-b border-sidebar-border">
          <h3 class="text-lg font-semibold text-text-primary">
            <i class="fas fa-cog text-highlight-yellow mr-2"></i>
            Settings
          </h3>
          <button type="button" class="text-sidebar-text hover:text-text-primary" id="closeSettingsBtn">
            <i class="fas fa-times"></i>
          </button>
        </div>
        
        <!-- Tabs -->
        <div class="border-b border-sidebar-border">
          <nav class="flex px-4" aria-label="Tabs">
            <button id="networkTabBtn" class="px-4 py-3 text-sm font-medium border-b-2 border-custom-pink text-custom-pink">
              Network
            </button>
            <button id="advancedTabBtn" class="px-4 py-3 text-sm font-medium border-b-2 border-transparent text-sidebar-text hover:text-text-primary">
              Advanced
            </button>
            <button id="appearanceTabBtn" class="px-4 py-3 text-sm font-medium border-b-2 border-transparent text-sidebar-text hover:text-text-primary">
              Appearance
            </button>
            <button id="pluginsTabBtn" class="px-4 py-3 text-sm font-medium border-b-2 border-transparent text-sidebar-text hover:text-text-primary">
              Plugins
            </button>
          </nav>
        </div>
        
        <!-- Tab Content -->
        <div class="p-5 overflow-y-auto">
          <!-- Network Settings Content -->
          <div id="networkTab" class="space-y-4">
            <!-- Server IP -->
            <div>
              <label for="smartfoxServer" class="block mb-2 text-sm font-medium text-text-primary">
                Server IP
              </label>
              <input id="smartfoxServer" type="text"
                class="bg-tertiary-bg text-text-primary placeholder-text-primary focus:outline-none rounded px-3 py-2 w-full"
                placeholder="lb-iss02-classic-prod.animaljam.com">
              <p class="mt-1 text-xs text-gray-400">Animal Jam server address</p>
            </div>
            
            <!-- Secure Connection -->
            <div class="flex items-center mt-4 bg-tertiary-bg/30 p-3 rounded">
              <input id="secureConnection" type="checkbox" 
                class="w-4 h-4 bg-tertiary-bg rounded focus:ring-custom-pink">
              <label for="secureConnection" class="ml-2 text-sm text-text-primary">
                Use secure connection (SSL/TLS)
              </label>
            </div>
          </div>
          
          <!-- Advanced Settings Content -->
          <div id="advancedTab" class="space-y-4 hidden">
            <h4 class="text-sm font-medium text-text-primary">Account Safety</h4>

            <!-- Plugin send-rate limit -->
            <div class="flex items-center justify-between bg-tertiary-bg/30 p-3 rounded">
              <div class="pr-4">
                <label for="sendRateLimit" class="text-sm text-text-primary">
                  Plugin packet limit (per second)
                </label>
                <p class="text-xs text-gray-400">Slows plugins that send packets too fast, which can get accounts kicked or banned. 0 = no limit.</p>
              </div>
              <input type="number" id="sendRateLimit" min="0" max="200" step="1"
                class="w-20 bg-tertiary-bg text-text-primary p-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-custom-pink">
            </div>

            <h4 class="text-sm font-medium text-text-primary">Logging</h4>

            <!-- Save log files -->
            <div class="flex items-center justify-between bg-tertiary-bg/30 p-3 rounded">
              <div class="pr-4">
                <label for="saveLogs" class="text-sm text-text-primary">
                  Save log files
                </label>
                <p class="text-xs text-gray-400">Writes the console and every packet to the logs folder (one file per day). Handy for debugging plugins.</p>
              </div>
              <div class="relative inline-block w-10 align-middle select-none cursor-pointer flex-shrink-0">
                <input type="checkbox" id="saveLogs" class="sr-only">
                <div class="block bg-tertiary-bg w-10 h-6 rounded-full"></div>
                <div id="saveLogsToggle" class="dot absolute left-1 top-1 bg-gray-400 w-4 h-4 rounded-full transition"></div>
              </div>
            </div>

            <h4 class="text-sm font-medium text-text-primary">Performance Options</h4>
            
            <!-- HTTP Logging Toggle -->
            <div class="flex items-center justify-between bg-tertiary-bg/30 p-3 rounded">
              <div>
                <label for="enableHttpLogging" class="text-sm text-text-primary">
                  Enable HTTP Logging
                </label>
                <p class="text-xs text-gray-400">Track HTTP requests and responses</p>
              </div>
              <div class="relative inline-block w-10 align-middle select-none cursor-pointer">
                <input type="checkbox" id="enableHttpLogging" class="sr-only">
                <div class="block bg-tertiary-bg w-10 h-6 rounded-full"></div>
                <div id="httpLoggingToggle" class="dot absolute left-1 top-1 bg-gray-400 w-4 h-4 rounded-full transition"></div>
              </div>
            </div>
            
            <p class="text-xs text-gray-400 italic">
              Note: Disabling HTTP logging can improve performance but will prevent you from monitoring and modifying HTTP requests.
            </p>

            <!-- Discord Presence Toggle -->
            <div class="flex items-center justify-between bg-tertiary-bg/30 p-3 rounded">
              <div>
                <label for="discordPresence" class="text-sm text-text-primary">
                  Show Discord status
                </label>
                <p class="text-xs text-gray-400">Display "Playing Jam Reborn" on your Discord profile</p>
              </div>
              <div class="relative inline-block w-10 align-middle select-none cursor-pointer">
                <input type="checkbox" id="discordPresence" class="sr-only">
                <div class="block bg-tertiary-bg w-10 h-6 rounded-full"></div>
                <div id="discordPresenceToggle" class="dot absolute left-1 top-1 bg-gray-400 w-4 h-4 rounded-full transition"></div>
              </div>
            </div>

            <!-- Streaming Mode -->
            <div class="bg-tertiary-bg/30 p-3 rounded space-y-3">
              <div class="flex items-center justify-between">
                <div>
                  <label for="streamingMode" class="text-sm text-text-primary">
                    Streaming mode
                  </label>
                  <p class="text-xs text-gray-400">Hide your username on stream: in game, on the login screen, and in Jam</p>
                </div>
                <div class="relative inline-block w-10 align-middle select-none cursor-pointer">
                  <input type="checkbox" id="streamingMode" class="sr-only">
                  <div class="block bg-tertiary-bg w-10 h-6 rounded-full"></div>
                  <div id="streamingModeToggle" class="dot absolute left-1 top-1 bg-gray-400 w-4 h-4 rounded-full transition"></div>
                </div>
              </div>
              <div>
                <label for="streamingAlias" class="block mb-1 text-xs text-gray-400">Display name (only you see this)</label>
                <input type="text" id="streamingAlias" maxlength="20" placeholder="Streamer"
                  class="w-full bg-tertiary-bg text-text-primary p-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-custom-pink">
                <p class="text-xs text-gray-400 mt-1">3-20 letters or numbers. In-game changes apply from your next login.</p>
              </div>
            </div>
          </div>

          <!-- Appearance Content -->
          <div id="appearanceTab" class="space-y-4 hidden">
            <div>
              <label class="block mb-2 text-sm font-medium text-text-primary">Theme</label>
              <p class="text-xs text-gray-400 mb-3">Sets the background and text together. Applies instantly.</p>
              <div id="themePresets" class="grid grid-cols-2 gap-2"></div>
            </div>
            <div class="pt-1">
              <label class="block mb-2 text-sm font-medium text-text-primary">Accent Color</label>
              <p class="text-xs text-gray-400 mb-3">Changes the app's highlight color. Applies instantly.</p>
              <div id="accentSwatches" class="grid grid-cols-4 gap-2"></div>
            </div>
            <div class="flex items-center gap-2 pt-1">
              <label for="accentCustom" class="text-sm text-text-primary">Custom</label>
              <input id="accentCustom" type="color" class="w-8 h-8 bg-transparent border-0 cursor-pointer">
              <span id="accentValue" class="text-xs text-gray-400 font-mono"></span>
            </div>
          </div>

          <!-- Plugins Content -->
          <div id="pluginsTab" class="space-y-4 hidden">
            <div class="flex justify-between items-center">
              <label class="text-sm font-medium text-text-primary">Installed Plugins</label>
              <span class="text-xs text-gray-400">Changes apply after a reload</span>
            </div>
            <ul id="pluginToggleList" class="space-y-2 text-sm max-h-72 overflow-y-auto">
              <li class="text-center text-gray-400 p-4">Loading plugins...</li>
            </ul>
            <p class="text-xs text-gray-400 italic">
              Disabled plugins stay on disk but won't load. Reload plugins (sidebar) or restart to apply.
            </p>
          </div>

        </div>
        
        <!-- Modal Footer -->
        <div class="flex items-center justify-end p-4 border-t border-sidebar-border">
          <button type="button" class="bg-sidebar-hover text-text-primary px-4 py-2 mr-2 rounded hover:bg-sidebar-hover/70 transition" id="cancelSettingsBtn">
            Cancel
          </button>
          <button type="button" class="bg-custom-pink text-white px-4 py-2 rounded hover:bg-custom-pink/90 transition" id="saveSettingsBtn">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  `)

  setupEventHandlers($modal, app)
  loadSettings($modal, app)
  setupToggleSwitches($modal)
  loadAppearance($modal, app)
  loadPluginToggles($modal, app)
  return $modal
}

/**
 * Resolves the plugins folder the same way the loader does.
 * @returns {string}
 */
const pluginsDir = () => {
  if (process.platform === 'darwin') {
    return path.join(__dirname, '..', '..', '..', '..', '..', '..', '..', 'plugins')
  }
  return path.resolve('plugins')
}

/**
 * Persists a single setting value.
 */
const setSetting = (app, key, value) => {
  const settings = app.settings && typeof app.settings.getAll === 'function' ? app.settings.getAll() : {}
  settings[key] = value
  if (app.settings && typeof app.settings.setAll === 'function') app.settings.setAll(settings)
}

/**
 * Builds the Appearance tab: accent swatches + custom color, applied live.
 * @param {JQuery<HTMLElement>} $modal
 * @param {Application} app
 */
const loadAppearance = ($modal, app) => {
  loadThemePresets($modal, app)

  const current = (app.settings && typeof app.settings.get === 'function')
    ? app.settings.get('accentColor', '#38b000')
    : '#38b000'

  const $swatches = $modal.find('#accentSwatches')
  const $custom = $modal.find('#accentCustom')
  const $value = $modal.find('#accentValue')

  const apply = (color) => {
    if (window.jamApplyTheme) window.jamApplyTheme(color)
    setSetting(app, 'accentColor', color)
    $value.text(color)
    $custom.val(color)
    $swatches.find('.accent-swatch').each(function () {
      $(this).toggleClass('ring-2 ring-white', $(this).data('color').toLowerCase() === color.toLowerCase())
    })
  }

  $swatches.empty()
  ACCENT_PRESETS.forEach(preset => {
    const $btn = $(`<button type="button" class="accent-swatch h-9 rounded-md border border-sidebar-border/50 transition" title="${preset.name}" style="background:${preset.color}"></button>`)
    $btn.attr('data-color', preset.color)
    $btn.on('click', () => apply(preset.color))
    $swatches.append($btn)
  })

  $custom.on('input', function () { apply($(this).val()) })

  $value.text(current)
  $custom.val(current)
  $swatches.find('.accent-swatch').each(function () {
    $(this).toggleClass('ring-2 ring-white', $(this).data('color').toLowerCase() === current.toLowerCase())
  })
}

/**
 * Builds the Theme presets: one button per theme in window.jamThemes.
 * @param {JQuery<HTMLElement>} $modal
 * @param {Application} app
 */
const loadThemePresets = ($modal, app) => {
  const $wrap = $modal.find('#themePresets')
  const themes = window.jamThemes || []
  const currentName = (app.settings && typeof app.settings.get === 'function')
    ? app.settings.get('themeName', 'Dark')
    : 'Dark'

  const markSelected = (name) => {
    $wrap.find('.theme-preset').each(function () {
      $(this).toggleClass('ring-2 ring-white', $(this).data('theme') === name)
    })
  }

  $wrap.empty()
  themes.forEach(theme => {
    const c = theme.colors
    const $btn = $(`
      <button type="button" class="theme-preset flex items-center gap-2 p-2 rounded-md border border-sidebar-border/50 transition" data-theme="${theme.name}" style="background:${c.primaryBg}">
        <span style="display:flex;">
          <span style="width:10px;height:16px;background:${c.secondaryBg};border-radius:2px 0 0 2px;"></span>
          <span style="width:10px;height:16px;background:${c.tertiaryBg};"></span>
          <span style="width:10px;height:16px;background:${c.sidebarBg};border-radius:0 2px 2px 0;"></span>
        </span>
        <span style="color:${c.textPrimary};font-size:12px;font-weight:600;">${theme.name}</span>
      </button>
    `)
    $btn.on('click', () => {
      if (window.jamApplyBackgroundTheme) window.jamApplyBackgroundTheme(theme.name)
      setSetting(app, 'themeName', theme.name)
      markSelected(theme.name)
    })
    $wrap.append($btn)
  })

  markSelected(currentName)
}

/**
 * Builds the Plugins tab: one row per plugin folder with an enable toggle.
 * @param {JQuery<HTMLElement>} $modal
 * @param {Application} app
 */
const loadPluginToggles = ($modal, app) => {
  const $list = $modal.find('#pluginToggleList')
  $list.empty()

  let disabled = []
  try { disabled = app.settings.get('disabledPlugins', []) || [] } catch (_) {}

  let entries = []
  try {
    const dir = pluginsDir()
    const folders = fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory())
    entries = folders.map(folder => {
      const jsonPath = path.join(dir, folder.name, 'plugin.json')
      let meta = { name: folder.name, description: '' }
      try { meta = { ...meta, ...JSON.parse(fs.readFileSync(jsonPath, 'utf8')) } } catch (_) {}
      return { folder: folder.name, name: meta.name || folder.name, description: meta.description || '', author: meta.author || '' }
    })
  } catch (error) {
    $list.html('<li class="text-center text-error-red p-4">Could not read the plugins folder.</li>')
    return
  }

  if (entries.length === 0) {
    $list.html('<li class="text-center text-gray-400 p-4">No plugins installed.</li>')
    return
  }

  entries.sort((a, b) => a.name.localeCompare(b.name))

  entries.forEach(entry => {
    const isEnabled = !disabled.includes(entry.name)
    const $li = $(`
      <li class="flex items-center justify-between bg-tertiary-bg/30 p-2.5 rounded">
        <div class="min-w-0 pr-3">
          <div class="text-text-primary font-medium truncate">${escapeHtml(entry.name)}</div>
          <div class="text-xs text-gray-400 truncate">${escapeHtml(entry.description)}</div>
        </div>
        <div class="relative inline-block w-10 align-middle select-none cursor-pointer flex-shrink-0">
          <div class="block bg-tertiary-bg w-10 h-6 rounded-full"></div>
          <div class="plugin-toggle-dot dot absolute top-1 w-4 h-4 rounded-full transition ${isEnabled ? 'translate-x-5 bg-highlight-green' : 'left-1 bg-gray-400'}"></div>
        </div>
      </li>
    `)

    $li.find('.plugin-toggle-dot').parent().on('click', function () {
      let list = []
      try { list = app.settings.get('disabledPlugins', []) || [] } catch (_) {}
      const nowEnabled = list.includes(entry.name) // was disabled -> will enable
      if (nowEnabled) {
        list = list.filter(n => n !== entry.name)
      } else {
        list.push(entry.name)
      }
      setSetting(app, 'disabledPlugins', list)

      const $dot = $(this).find('.plugin-toggle-dot')
      if (nowEnabled) $dot.removeClass('left-1 bg-gray-400').addClass('translate-x-5 bg-highlight-green')
      else $dot.removeClass('translate-x-5 bg-highlight-green').addClass('left-1 bg-gray-400')

      showToast(`${entry.name} ${nowEnabled ? 'enabled' : 'disabled'} - reload to apply`, 'info')
    })

    $list.append($li)
  })
}

/**
 * Escapes text for safe insertion into HTML.
 */
const escapeHtml = (str) => {
  const div = document.createElement('div')
  div.textContent = String(str == null ? '' : str)
  return div.innerHTML
}

/**
 * Close handler for the settings modal
 * @param {Application} app - The application instance
 */
exports.close = function (app) {
  // Cleanup
}

/**
 * Setup toggle switches in the settings modal
 * @param {JQuery<HTMLElement>} $modal - The modal element
 */
const setupToggleSwitches = ($modal) => {
  const $httpLoggingToggle = $modal.find('#enableHttpLogging')
  const $toggleDot = $modal.find('#httpLoggingToggle')
  const $toggleContainer = $modal.find('#httpLoggingToggle').parent()

  $toggleContainer.on('click', function () {
    const newCheckedState = !$httpLoggingToggle.prop('checked')
    $httpLoggingToggle.prop('checked', newCheckedState)

    if (newCheckedState) {
      $toggleDot.removeClass('left-1 bg-gray-400').addClass('translate-x-4 bg-custom-pink')
    } else {
      $toggleDot.removeClass('translate-x-4 bg-custom-pink').addClass('left-1 bg-gray-400')
    }
  })

  if ($httpLoggingToggle.prop('checked')) {
    $toggleDot.removeClass('left-1 bg-gray-400').addClass('translate-x-4 bg-custom-pink')
  } else {
    $toggleDot.removeClass('translate-x-4 bg-custom-pink').addClass('left-1 bg-gray-400')
  }

  // Discord presence toggle
  const $discord = $modal.find('#discordPresence')
  const $discordDot = $modal.find('#discordPresenceToggle')
  const setDiscordDot = () => {
    if ($discord.prop('checked')) $discordDot.removeClass('left-1 bg-gray-400').addClass('translate-x-4 bg-custom-pink')
    else $discordDot.removeClass('translate-x-4 bg-custom-pink').addClass('left-1 bg-gray-400')
  }
  $discordDot.parent().on('click', function () {
    $discord.prop('checked', !$discord.prop('checked'))
    setDiscordDot()
  })
  setDiscordDot()

  // Save log files toggle
  const $saveLogs = $modal.find('#saveLogs')
  const $saveLogsDot = $modal.find('#saveLogsToggle')
  const setSaveLogsDot = () => {
    if ($saveLogs.prop('checked')) $saveLogsDot.removeClass('left-1 bg-gray-400').addClass('translate-x-4 bg-custom-pink')
    else $saveLogsDot.removeClass('translate-x-4 bg-custom-pink').addClass('left-1 bg-gray-400')
  }
  $saveLogsDot.parent().on('click', function () {
    $saveLogs.prop('checked', !$saveLogs.prop('checked'))
    setSaveLogsDot()
  })
  $saveLogs.on('change', setSaveLogsDot)
  setSaveLogsDot()

  // Streaming mode toggle
  const $streaming = $modal.find('#streamingMode')
  const $streamingDot = $modal.find('#streamingModeToggle')
  const setStreamingDot = () => {
    if ($streaming.prop('checked')) $streamingDot.removeClass('left-1 bg-gray-400').addClass('translate-x-4 bg-custom-pink')
    else $streamingDot.removeClass('translate-x-4 bg-custom-pink').addClass('left-1 bg-gray-400')
  }
  $streamingDot.parent().on('click', function () {
    $streaming.prop('checked', !$streaming.prop('checked'))
    setStreamingDot()
  })
  $streaming.on('change', setStreamingDot)
  setStreamingDot()
}

/**
 * Setup event handlers for the settings modal
 * @param {JQuery<HTMLElement>} $modal - The modal element
 * @param {Application} app - The application instance
 */
const setupEventHandlers = ($modal, app) => {
  $modal.find('#closeSettingsBtn, #cancelSettingsBtn').on('click', () => {
    app.modals.close()
  })

  $modal.find('#saveSettingsBtn').on('click', () => {
    saveSettings($modal, app)
  })

  $modal.find('#networkTabBtn').on('click', () => {
    switchTab($modal, 'network')
  })

  $modal.find('#advancedTabBtn').on('click', () => {
    switchTab($modal, 'advanced')
  })

  $modal.find('#appearanceTabBtn').on('click', () => {
    switchTab($modal, 'appearance')
  })

  $modal.find('#pluginsTabBtn').on('click', () => {
    switchTab($modal, 'plugins')
  })

  $modal.find('#generateUuidBtn').on('click', () => {
    const uuid = generateUuid()
    $modal.find('#customUuid').val(uuid)
  })
}

/**
 * Switch between settings tabs
 * @param {JQuery<HTMLElement>} $modal - The modal element
 * @param {string} tabName - The tab to show ('network' or 'advanced')
 */
const switchTab = ($modal, tabName) => {
  const tabs = ['network', 'advanced', 'appearance', 'plugins']
  tabs.forEach(t => {
    $modal.find(`#${t}Tab`).addClass('hidden')
    $modal.find(`#${t}TabBtn`).removeClass('border-custom-pink text-custom-pink').addClass('border-transparent text-sidebar-text')
  })
  $modal.find(`#${tabName}Tab`).removeClass('hidden')
  $modal.find(`#${tabName}TabBtn`).removeClass('border-transparent text-sidebar-text').addClass('border-custom-pink text-custom-pink')
}

/**
 * Load settings into the form
 * @param {JQuery<HTMLElement>} $modal - The modal element
 * @param {Application} app - The application instance
 */
const loadSettings = ($modal, app) => {
  try {
    const settings = {}

    if (app.settings && typeof app.settings.getAll === 'function') {
      Object.assign(settings, app.settings.getAll())
    }

    $modal.find('#smartfoxServer').val(settings.smartfoxServer || 'lb-iss02-classic-prod.animaljam.com')
    $modal.find('#secureConnection').prop('checked', settings.secureConnection === true)
    $modal.find('#enableHttpLogging').prop('checked', settings.enableHttpLogging !== false)
    $modal.find('#discordPresence').prop('checked', settings.discordPresence !== false)
    $modal.find('#streamingMode').prop('checked', settings.streamingMode === true).trigger('change')
    $modal.find('#streamingAlias').val(settings.streamingAlias || 'Streamer')
    $modal.find('#saveLogs').prop('checked', settings.saveLogs === true).trigger('change')
    $modal.find('#sendRateLimit').val(settings.sendRateLimit !== undefined ? settings.sendRateLimit : 20)
  } catch (error) {
    showToast('Error loading settings', 'error')
  }
}

/**
 * Save settings from the form
 * @param {JQuery<HTMLElement>} $modal - The modal element
 * @param {Application} app - The application instance
 */
const saveSettings = ($modal, app) => {
  try {
    const settings = app.settings && typeof app.settings.getAll === 'function' ? app.settings.getAll() : {}

    settings.smartfoxServer = $modal.find('#smartfoxServer').val()
    settings.secureConnection = $modal.find('#secureConnection').prop('checked')
    settings.enableHttpLogging = $modal.find('#enableHttpLogging').prop('checked')

    const discordWas = settings.discordPresence !== false
    settings.discordPresence = $modal.find('#discordPresence').prop('checked')

    const alias = String($modal.find('#streamingAlias').val() || '').trim() || 'Streamer'
    if (!/^[A-Za-z0-9]{3,20}$/.test(alias)) {
      showToast('Display name must be 3-20 letters or numbers', 'error')
      return
    }
    settings.saveLogs = $modal.find('#saveLogs').prop('checked')

    const rateLimit = parseInt($modal.find('#sendRateLimit').val(), 10)
    settings.sendRateLimit = Number.isFinite(rateLimit) && rateLimit >= 0 ? Math.min(rateLimit, 200) : 20

    settings.streamingMode = $modal.find('#streamingMode').prop('checked')
    settings.streamingAlias = alias

    if (app.settings && typeof app.settings.setAll === 'function') {
      app.settings.setAll(settings)
    }

    // Tell the game client so its login screen hides the username too.
    if (app.streamingMode) app.streamingMode.writeClientFlag()

    if (discordWas !== settings.discordPresence && window.ipcRenderer) {
      window.ipcRenderer.send('toggle-discord-presence', settings.discordPresence)
    }

    const httpLoggingChanged = app.httpLoggingState !== settings.enableHttpLogging
    if (httpLoggingChanged) {
      app.httpLoggingState = settings.enableHttpLogging

      if (window.ipcRenderer) {
        window.ipcRenderer.send('toggle-http-logging', settings.enableHttpLogging)
      }
    }

    app.modals.close()
    showToast('Settings saved successfully')
  } catch (error) {
    showToast('Error saving settings', 'error')
  }
}

/**
 * Show a toast notification
 * @param {string} message - The message to show
 * @param {string} type - The type of notification (success, error, warning)
 */
const showToast = (message, type = 'success') => {
  const colors = {
    success: 'bg-highlight-green text-white',
    error: 'bg-error-red text-white',
    warning: 'bg-custom-blue text-white',
    info: 'bg-custom-blue text-white'
  }

  const toast = $(`<div class="fixed bottom-4 right-4 px-4 py-2 rounded shadow-lg z-50 ${colors[type]}">${message}</div>`)
  $('body').append(toast)

  setTimeout(() => {
    toast.fadeOut(300, function () { $(this).remove() })
  }, 3000)
}

/**
 * Generate a random UUID
 * @returns {string} The generated UUID
 */
const generateUuid = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}