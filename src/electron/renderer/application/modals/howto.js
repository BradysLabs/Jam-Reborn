/**
 * How To guide modal.
 *
 * Lists every plugin in the plugins folder and shows a guide for each one.
 * Guides come from the plugin's own README.md (rendered as markdown). Plugins
 * without a README get a guide generated from their plugin.json.
 */
const fs = require('fs')
const path = require('path')
const { marked } = require('marked')

exports.name = 'howto'

/**
 * Resolves the plugins folder the same way the loader does.
 */
const pluginsDir = () => {
  if (process.platform === 'darwin') {
    return path.join(__dirname, '..', '..', '..', '..', '..', '..', '..', 'plugins')
  }
  return path.resolve('plugins')
}

const GETTING_STARTED = `# Welcome to Jam Reborn

Jam Reborn sits between Animal Jam Classic and the game server, so plugins can read and act on what the game sends. This guide explains how everything fits together.

## Launching the game
Click **Play** in the sidebar. Jam Reborn opens Animal Jam Classic connected through the proxy. The footer at the bottom shows **Connected** once you're in.

## Two kinds of plugins
- **Window plugins** open their own panel. Click them in the sidebar's **Plugins** list.
- **Command plugins** run in the background. Control them by typing their command in the box at the bottom of the app and pressing **Enter**. Start typing to see suggestions, and press **Tab** to autocomplete.

Each plugin's page in this guide tells you which kind it is and how to use it.

## Managing plugins
- **Add a plugin:** drop its folder into the \`plugins\` folder, then click **Reload Plugins** (the circular arrows next to "Plugins" in the sidebar).
- **Turn plugins on or off:** open **Settings → Plugins**. Changes apply after a reload.
- **Edit a plugin:** change its files, then Reload Plugins.

## Customizing
**Settings → Appearance** has full themes (Dark, Midnight, Slate, Void, Light) and accent colors.

## Learning how the game talks
Open **Packet Inspector** to watch traffic live with plain-English explanations. **Packet Replay** lets you save packets, see them explained, and test them.

## Play fair and stay safe
- Plugins that send packets can get an account kicked or banned if they send something the server doesn't expect. Only use plugins you trust.
- Never share your Animal Jam password with anyone, including anyone offering plugins or help.
`

/**
 * Reads every plugin folder: its plugin.json and README.md (if any).
 */
const readPlugins = () => {
  const dir = pluginsDir()
  let folders = []
  try {
    folders = fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory())
  } catch (_) {
    return []
  }

  return folders.map(folder => {
    const folderPath = path.join(dir, folder.name)
    let meta = {}
    try { meta = JSON.parse(fs.readFileSync(path.join(folderPath, 'plugin.json'), 'utf8')) } catch (_) {}

    let readme = null
    for (const file of ['README.md', 'readme.md', 'Readme.md']) {
      const p = path.join(folderPath, file)
      if (fs.existsSync(p)) {
        try { readme = fs.readFileSync(p, 'utf8') } catch (_) {}
        break
      }
    }

    return {
      folderPath,
      name: meta.name || folder.name,
      description: meta.description || '',
      author: meta.author || '',
      type: meta.type === 'ui' ? 'ui' : 'game',
      commands: Array.isArray(meta.commands) ? meta.commands : [],
      readme
    }
  }).sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Builds a guide for a plugin that has no README.
 */
const generatedGuide = (plugin) => {
  let md = `# ${plugin.name}\n\n${plugin.description || 'No description provided.'}\n\n## How to use\n`
  if (plugin.type === 'ui') {
    md += `Click **${plugin.name}** in the sidebar's **Plugins** list to open its window.\n`
  } else {
    md += 'This plugin runs in the background. Control it by typing its command in the box at the bottom of the app and pressing **Enter**.\n'
  }
  if (plugin.commands.length) {
    md += '\n## Commands\n\n| Command | What it does |\n|---|---|\n'
    plugin.commands.forEach(c => {
      md += `| \`${c.name}\` | ${(c.description || '').replace(/\|/g, '\\|')} |\n`
    })
  } else if (plugin.type === 'game') {
    md += '\nThis plugin doesn\'t list its commands. Start typing in the command box to see suggestions.\n'
  }
  md += '\n---\n*This guide was generated automatically. Add a `README.md` to the plugin\'s folder to write a custom guide.*\n'
  return md
}

/**
 * Lists every command currently registered with the app.
 */
const commandsTable = (app) => {
  let entries = []
  try { entries = Array.from(app.dispatch.commands.values()) } catch (_) {}
  if (!entries.length) return ''
  entries.sort((a, b) => String(a.name).localeCompare(String(b.name)))
  let md = '\n## Commands available right now\n\n| Command | What it does |\n|---|---|\n'
  entries.forEach(c => {
    md += `| \`${c.name}\` | ${String(c.description || '').replace(/\|/g, '\\|')} |\n`
  })
  return md
}

/**
 * Strips anything executable from rendered README HTML.
 */
const sanitize = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/<(iframe|object|embed|style)[\s\S]*?(<\/\1>|>)/gi, '')
  .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"')

const escapeHtml = (str) => {
  const div = document.createElement('div')
  div.textContent = String(str == null ? '' : str)
  return div.innerHTML
}

/**
 * Render the How To modal.
 * @param {Application} app
 * @returns {JQuery<HTMLElement>}
 */
exports.render = function (app) {
  const plugins = readPlugins()
  let disabled = []
  try { disabled = app.settings.get('disabledPlugins', []) || [] } catch (_) {}

  const $modal = $(`
    <div class="flex items-center justify-center min-h-screen p-4">
      <div class="fixed inset-0 bg-black/50 transition-opacity" id="howtoBackdrop"></div>
      <div class="relative bg-secondary-bg rounded-lg shadow-xl max-w-3xl w-full flex flex-col" style="height: 80vh;">
        <div class="flex items-center justify-between p-4 border-b border-sidebar-border">
          <h3 class="text-lg font-semibold text-text-primary">
            <i class="fas fa-book-open text-highlight-green mr-2"></i>
            How To
          </h3>
          <button type="button" id="closeHowToBtn" class="text-sidebar-text hover:text-text-primary">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="flex flex-1 min-h-0">
          <div class="flex flex-col border-r border-sidebar-border" style="width: 220px; flex-shrink: 0;">
            <div class="p-3">
              <input id="howtoSearch" type="text" placeholder="Search guides..."
                class="bg-tertiary-bg text-text-primary placeholder-text-primary focus:outline-none rounded px-3 py-2 w-full text-sm">
            </div>
            <ul id="howtoList" class="flex-1 overflow-y-auto px-2 pb-3 space-y-1 text-sm"></ul>
          </div>
          <div id="howtoContent" class="flex-1 overflow-y-auto howto-md" style="padding: 22px 28px;"></div>
        </div>
      </div>
      <style>
        .howto-item { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 6px; cursor: pointer; color: var(--jam-sidebar-text, #C3C3C3); }
        .howto-item:hover { background: color-mix(in srgb, var(--jam-tertiary-bg, #3A3D4D) 50%, transparent); }
        .howto-item.active { background: color-mix(in srgb, var(--jam-accent, #38b000) 18%, transparent); color: var(--jam-text-primary, #fff); }
        .howto-item .hi-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .howto-item .hi-off { font-size: 10px; opacity: .6; }
        .howto-md { color: var(--jam-text-primary, #C3C3C3); font-size: 14px; line-height: 1.6; }
        .howto-md h1 { font-size: 22px; font-weight: 700; margin: 0 0 12px; }
        .howto-md h2 { font-size: 16px; font-weight: 700; margin: 22px 0 8px; }
        .howto-md h3 { font-size: 14px; font-weight: 700; margin: 18px 0 6px; }
        .howto-md p { margin: 0 0 10px; }
        .howto-md ul, .howto-md ol { margin: 0 0 12px; padding-left: 22px; }
        .howto-md ul { list-style: disc; } .howto-md ol { list-style: decimal; }
        .howto-md li { margin: 3px 0; }
        .howto-md a { color: var(--jam-accent, #38b000); text-decoration: underline; cursor: pointer; }
        .howto-md code { font-family: Consolas, "SF Mono", monospace; font-size: 12px; padding: 1px 5px; border-radius: 4px;
          background: color-mix(in srgb, var(--jam-tertiary-bg, #3A3D4D) 60%, transparent); }
        .howto-md pre { padding: 10px 12px; border-radius: 6px; overflow-x: auto; margin: 0 0 12px;
          background: color-mix(in srgb, var(--jam-tertiary-bg, #3A3D4D) 45%, transparent); }
        .howto-md pre code { padding: 0; background: none; }
        .howto-md table { border-collapse: collapse; width: 100%; margin: 0 0 12px; font-size: 13px; }
        .howto-md th, .howto-md td { text-align: left; padding: 6px 8px; border-bottom: 1px solid color-mix(in srgb, var(--jam-sidebar-border, #3A3D4D) 70%, transparent); }
        .howto-md th { font-weight: 700; }
        .howto-md hr { border: none; border-top: 1px solid color-mix(in srgb, var(--jam-sidebar-border, #3A3D4D) 70%, transparent); margin: 18px 0; }
        .howto-md img { max-width: 100%; border-radius: 6px; }
        .howto-md blockquote { border-left: 3px solid var(--jam-accent, #38b000); padding-left: 12px; opacity: .9; margin: 0 0 12px; }
        .howto-facts { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 18px; }
        .howto-chip { font-size: 12px; padding: 3px 9px; border-radius: 999px; background: color-mix(in srgb, var(--jam-tertiary-bg, #3A3D4D) 60%, transparent); }
        .howto-chip.warn { background: rgba(240, 180, 41, .18); color: #f0b429; }
        .howto-chip.accent { background: color-mix(in srgb, var(--jam-accent, #38b000) 20%, transparent); }
      </style>
    </div>
  `)

  const close = () => app.modals.close()
  $modal.find('#closeHowToBtn, #howtoBackdrop').on('click', close)

  const $list = $modal.find('#howtoList')
  const $content = $modal.find('#howtoContent')

  // Entries: Getting Started first, then every plugin.
  const entries = [{ id: 'start', name: 'Getting Started', icon: 'fa-rocket', start: true }]
    .concat(plugins.map((p, i) => ({ id: `p${i}`, name: p.name, icon: p.type === 'ui' ? 'fa-desktop' : 'fa-gamepad', plugin: p })))

  const renderEntry = (entry) => {
    let html = ''
    if (entry.start) {
      html = marked.parse(GETTING_STARTED + commandsTable(app), { gfm: true })
    } else {
      const p = entry.plugin
      const isOff = disabled.includes(p.name)
      const howToOpen = p.type === 'ui' ? 'Opens from the sidebar' : 'Runs from commands'
      let facts = '<div class="howto-facts">'
      facts += `<span class="howto-chip accent"><i class="fas ${entry.icon} mr-1"></i>${p.type === 'ui' ? 'Window plugin' : 'Command plugin'}</span>`
      facts += `<span class="howto-chip">${howToOpen}</span>`
      if (p.author) facts += `<span class="howto-chip"><i class="fas fa-user mr-1"></i>${escapeHtml(p.author)}</span>`
      if (isOff) facts += '<span class="howto-chip warn">Disabled: turn it on in Settings → Plugins</span>'
      facts += '</div>'
      const md = p.readme || generatedGuide(p)
      html = facts + marked.parse(md, { gfm: true })
    }

    $content.html(sanitize(html))
    $content.scrollTop(0)

    // Images with relative paths point into the plugin's folder.
    if (entry.plugin) {
      $content.find('img').each(function () {
        const src = $(this).attr('src') || ''
        if (src && !/^(https?:|file:|data:)/i.test(src)) {
          $(this).attr('src', 'file://' + path.join(entry.plugin.folderPath, src).replace(/\\/g, '/'))
        }
      })
    }

    // Links open in the user's browser instead of inside the app.
    $content.find('a').on('click', function (e) {
      const href = $(this).attr('href') || ''
      if (href.startsWith('#')) return
      e.preventDefault()
      if (/^https?:/i.test(href)) app.open(href)
    })
  }

  const select = (id) => {
    const entry = entries.find(e => e.id === id)
    if (!entry) return
    $list.find('.howto-item').removeClass('active')
    $list.find(`[data-id="${id}"]`).addClass('active')
    renderEntry(entry)
  }

  const renderList = (query = '') => {
    const q = query.toLowerCase().trim()
    $list.empty()
    entries
      .filter(e => !q || e.name.toLowerCase().includes(q) ||
        (e.plugin && (e.plugin.description.toLowerCase().includes(q) || (e.plugin.readme || '').toLowerCase().includes(q))))
      .forEach(e => {
        const isOff = e.plugin && disabled.includes(e.plugin.name)
        const $li = $(`<li class="howto-item" data-id="${e.id}"><i class="fas ${e.icon}" style="width:16px;text-align:center;opacity:.8"></i><span class="hi-name"></span>${isOff ? '<span class="hi-off">off</span>' : ''}</li>`)
        $li.find('.hi-name').text(e.name)
        $li.on('click', () => select(e.id))
        $list.append($li)
      })
    if (!$list.children().length) {
      $list.html('<li class="text-center text-gray-400 p-4">No matches</li>')
    }
  }

  $modal.find('#howtoSearch').on('input', function () {
    renderList($(this).val())
    const first = $list.find('.howto-item').first()
    if (first.length) select(first.data('id'))
  })

  renderList()
  select('start')
  return $modal
}

// Exposed for testing only.
exports._internals = { readPlugins, generatedGuide, sanitize, GETTING_STARTED }
