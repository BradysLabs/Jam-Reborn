const Application = require('./application')
const { ipcRenderer } = require('electron')

const application = new Application()

/**
 * The app's default accent color (Tailwind highlight-green).
 */
const DEFAULT_ACCENT = '#38b000'

/**
 * Applies an accent color across the app by overriding the highlight-green
 * utility classes. Called on load and live when the user picks a color.
 * @param {string} accent - A CSS color (e.g. '#38b000').
 */
const applyTheme = (accent) => {
  const color = accent || DEFAULT_ACCENT
  let style = document.getElementById('jam-theme')
  if (!style) {
    style = document.createElement('style')
    style.id = 'jam-theme'
    document.head.appendChild(style)
  }
  style.textContent = `
    :root { --jam-accent: ${color}; }
    .text-highlight-green, .hover\\:text-highlight-green:hover { color: var(--jam-accent) !important; }
    .bg-highlight-green { background-color: var(--jam-accent) !important; }
    .bg-highlight-green\\/90, .hover\\:bg-highlight-green\\/90:hover { background-color: color-mix(in srgb, var(--jam-accent) 90%, transparent) !important; }
    .bg-highlight-green\\/10 { background-color: color-mix(in srgb, var(--jam-accent) 10%, transparent) !important; }
    .bg-highlight-green\\/5 { background-color: color-mix(in srgb, var(--jam-accent) 5%, transparent) !important; }
    .border-highlight-green { border-color: var(--jam-accent) !important; }
  `
}

// Expose so the Settings modal can preview a color live.
window.jamApplyTheme = applyTheme

/**
 * Full theme presets: background layers + text, kept readable as a set.
 */
const THEMES = [
  { name: 'Dark', colors: { primaryBg: '#181A20', secondaryBg: '#1C1E26', tertiaryBg: '#3A3D4D', sidebarBg: '#1C1E26', sidebarBorder: '#3A3D4D', sidebarHover: '#2C2E34', textPrimary: '#C3C3C3', sidebarText: '#C3C3C3' } },
  { name: 'Midnight', colors: { primaryBg: '#0f1220', secondaryBg: '#151a2e', tertiaryBg: '#2a3350', sidebarBg: '#121628', sidebarBorder: '#2a3350', sidebarHover: '#1d2540', textPrimary: '#c7d0e0', sidebarText: '#c7d0e0' } },
  { name: 'Slate', colors: { primaryBg: '#1e2126', secondaryBg: '#24282f', tertiaryBg: '#3b414c', sidebarBg: '#22262d', sidebarBorder: '#3b414c', sidebarHover: '#2c313a', textPrimary: '#cbd2da', sidebarText: '#cbd2da' } },
  { name: 'Void', colors: { primaryBg: '#0a0a0c', secondaryBg: '#121214', tertiaryBg: '#2a2a30', sidebarBg: '#0e0e11', sidebarBorder: '#26262c', sidebarHover: '#1a1a1f', textPrimary: '#d0d0d5', sidebarText: '#d0d0d5' } },
  { name: 'Light', colors: { primaryBg: '#f4f5f7', secondaryBg: '#ffffff', tertiaryBg: '#e2e5ea', sidebarBg: '#ffffff', sidebarBorder: '#d5d9e0', sidebarHover: '#eceef2', textPrimary: '#2a2d34', sidebarText: '#3a3d44' } }
]

/**
 * Applies a background/text theme by overriding the background + text classes.
 * @param {string} themeName - A theme name from THEMES.
 */
const applyBackgroundTheme = (themeName) => {
  const theme = THEMES.find(t => t.name === themeName) || THEMES[0]
  const c = theme.colors
  let style = document.getElementById('jam-bg-theme')
  if (!style) {
    style = document.createElement('style')
    style.id = 'jam-bg-theme'
    document.head.appendChild(style)
  }
  style.textContent = `
    :root {
      --jam-primary-bg: ${c.primaryBg}; --jam-secondary-bg: ${c.secondaryBg};
      --jam-tertiary-bg: ${c.tertiaryBg}; --jam-sidebar-bg: ${c.sidebarBg};
      --jam-sidebar-border: ${c.sidebarBorder}; --jam-sidebar-hover: ${c.sidebarHover};
      --jam-text-primary: ${c.textPrimary}; --jam-sidebar-text: ${c.sidebarText};
    }
    body { background-color: var(--jam-primary-bg) !important; color: var(--jam-sidebar-text) !important; }
    .bg-primary-bg { background-color: var(--jam-primary-bg) !important; }
    .bg-primary-bg\\/10 { background-color: color-mix(in srgb, var(--jam-primary-bg) 10%, transparent) !important; }
    .bg-secondary-bg { background-color: var(--jam-secondary-bg) !important; }
    .bg-secondary-bg\\/95 { background-color: color-mix(in srgb, var(--jam-secondary-bg) 95%, transparent) !important; }
    .bg-sidebar-bg { background-color: var(--jam-sidebar-bg) !important; }
    .bg-sidebar-hover { background-color: var(--jam-sidebar-hover) !important; }
    .bg-sidebar-hover\\/70 { background-color: color-mix(in srgb, var(--jam-sidebar-hover) 70%, transparent) !important; }
    .bg-tertiary-bg { background-color: var(--jam-tertiary-bg) !important; }
    .bg-tertiary-bg\\/10 { background-color: color-mix(in srgb, var(--jam-tertiary-bg) 10%, transparent) !important; }
    .bg-tertiary-bg\\/20 { background-color: color-mix(in srgb, var(--jam-tertiary-bg) 20%, transparent) !important; }
    .bg-tertiary-bg\\/30 { background-color: color-mix(in srgb, var(--jam-tertiary-bg) 30%, transparent) !important; }
    .bg-tertiary-bg\\/50 { background-color: color-mix(in srgb, var(--jam-tertiary-bg) 50%, transparent) !important; }
    .bg-tertiary-bg\\/70 { background-color: color-mix(in srgb, var(--jam-tertiary-bg) 70%, transparent) !important; }
    .bg-sidebar-border\\/20 { background-color: color-mix(in srgb, var(--jam-sidebar-border) 20%, transparent) !important; }
    .bg-text-primary\\/10 { background-color: color-mix(in srgb, var(--jam-text-primary) 10%, transparent) !important; }
    .text-text-primary { color: var(--jam-text-primary) !important; }
    .text-sidebar-text { color: var(--jam-sidebar-text) !important; }
    .text-sidebar-text\\/70 { color: color-mix(in srgb, var(--jam-sidebar-text) 70%, transparent) !important; }
    .placeholder-text-primary::placeholder { color: var(--jam-text-primary) !important; }
    .border-sidebar-border { border-color: var(--jam-sidebar-border) !important; }
    .border-sidebar-border\\/10 { border-color: color-mix(in srgb, var(--jam-sidebar-border) 10%, transparent) !important; }
    .border-sidebar-border\\/30 { border-color: color-mix(in srgb, var(--jam-sidebar-border) 30%, transparent) !important; }
    .border-sidebar-border\\/50 { border-color: color-mix(in srgb, var(--jam-sidebar-border) 50%, transparent) !important; }
    .border-tertiary-bg { border-color: var(--jam-tertiary-bg) !important; }
    .border-primary-bg { border-color: var(--jam-primary-bg) !important; }
  `
}

window.jamThemes = THEMES
window.jamApplyBackgroundTheme = applyBackgroundTheme

/**
 * Initialize the application with better error handling and performance tracking
 */
const initializeApp = async () => {
  window.ipcRenderer = ipcRenderer

  application.consoleMessage({
    message: 'Starting Jam Reborn...',
    type: 'wait'
  })

  try {
    await application.instantiate()

    try { applyTheme(application.settings.get('accentColor', DEFAULT_ACCENT)) } catch (_) { applyTheme(DEFAULT_ACCENT) }
    try { applyBackgroundTheme(application.settings.get('themeName', 'Dark')) } catch (_) { applyBackgroundTheme('Dark') }

    application.attachNetworkingEvents()

    ipcRenderer.send('check-for-updates')
  } catch (error) {
    application.consoleMessage({
      message: `Error during initialization: ${error.message}`,
      type: 'error'
    })

    application.consoleMessage({
      message: 'Attempting to continue with limited functionality...',
      type: 'warn'
    })
  }
}

/**
 * Set up IPC communication events between renderer and main process
 */
const setupIpcEvents = () => {
  ipcRenderer
    .on('message', (sender, args) => application.consoleMessage({ ...args }))
    .on('update-available', () => {
      application.consoleMessage({
        message: 'An update is available! You\'ll be notified when it\'s ready to install.',
        type: 'notify'
      })
    })
    .on('update-downloaded', () => {
      application.consoleMessage({
        message: 'Update downloaded! Restart the application to apply the update.',
        type: 'celebrate'
      })
    })
    .on('update-error', (sender, error) => {
      application.consoleMessage({
        message: `Update error: ${error}`,
        type: 'error'
      })
    })
}

/**
 * Monitor and update connection status with more professional styling
 */
const updateConnectionStatus = (isConnected) => {
  const $statusIndicator = $('#connection-status')
  const $statusDot = $statusIndicator.find('span:first-child')
  const $statusText = $statusIndicator.find('span:last-child')

  if (isConnected) {
    $statusIndicator
      .removeClass('text-gray-400')
      .addClass('text-highlight-green')
    $statusDot
      .removeClass('bg-error-red pulse-animation')
      .addClass('bg-highlight-green pulse-green')
    $statusText.text('Connected')
  } else {
    $statusIndicator
      .removeClass('text-highlight-green')
      .addClass('text-gray-400')
    $statusDot
      .removeClass('bg-highlight-green pulse-green')
      .addClass('bg-error-red pulse-animation')
    $statusText.text('Disconnected')
  }
}

const updateTimestamp = () => {
  const now = new Date()
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  $('#timestamp-display').text(`${hours}:${minutes}:${seconds}`)
}

/**
 * Set up application event listeners for component communication
 */
const setupAppEvents = () => {
  application
    .on('ready', () => {
      application.activateAutoComplete()

      setTimeout(() => {
        application.consoleMessage({
          message: 'Welcome to Jam Reborn! Type a command or use the sidebar to get started.',
          type: 'notify'
        })
      }, 500)

      setInterval(updateTimestamp, 1000)
      updateTimestamp()
    })
    .on('refresh:plugins', () => {
      application.refreshAutoComplete()
      application.attachNetworkingEvents()
    })
    .on('connection:change', (isConnected) => {
      updateConnectionStatus(isConnected)
    })
}

console.log = (message) => {
  const formattedMessage = typeof message === 'object'
    ? JSON.stringify(message, null, 2)
    : message

  application.consoleMessage({
    message: formattedMessage,
    type: 'logger'
  })
}

initializeApp()
setupIpcEvents()
setupAppEvents()

window.jam = {
  application,
  dispatch: application.dispatch,
  settings: application.settings,
  server: application.server
}