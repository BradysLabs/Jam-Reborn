/**
 * Plugin Hub modal.
 *
 * A searchable grid of every loaded plugin, grouped by category. Star a
 * plugin to pin it to the sidebar; click a window plugin to open it.
 *
 * Plugins can set these optional fields in plugin.json:
 *   "category": "Tools"            (defaults to "Other")
 *   "icon": "fa-magnifying-glass"   (any Font Awesome 5 solid icon)
 */

exports.name = 'plugins'

const CATEGORY_ORDER = ['Tools', 'Explore', 'Customize', 'Gameplay', 'Other']

const escapeHtml = (str) => String(str || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

/**
 * Loaded plugins as plain objects for the hub.
 * @param {Application} app
 */
const listPlugins = (app) => {
  const result = []
  for (const { configuration } of app.dispatch.plugins.values()) {
    result.push({
      name: configuration.name,
      description: configuration.description || '',
      author: configuration.author || 'Unknown',
      type: configuration.type,
      category: exports.categoryOf(configuration),
      icon: exports.iconOf(configuration)
    })
  }
  return result.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * A plugin's category from plugin.json, or "Other".
 */
exports.categoryOf = (configuration) => {
  const category = typeof configuration.category === 'string' ? configuration.category.trim() : ''
  return category || 'Other'
}

/**
 * A plugin's Font Awesome icon from plugin.json, or one based on its type.
 */
exports.iconOf = (configuration) => {
  const icon = typeof configuration.icon === 'string' ? configuration.icon.trim() : ''
  if (/^fa-[a-z0-9-]+$/.test(icon)) return icon
  return configuration.type === 'ui' ? 'fa-desktop' : 'fa-gamepad'
}

exports.render = function (app) {
  const plugins = listPlugins(app)
  const categories = [...new Set(plugins.map(p => p.category))]
    .sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a)
      const ib = CATEGORY_ORDER.indexOf(b)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b)
    })

  const state = {
    query: '',
    category: app.favoritePlugins().length ? 'Favorites' : 'All'
  }

  const $modal = $(`
    <div class="flex items-center justify-center min-h-screen p-4">
      <div class="fixed inset-0 bg-black/50 transition-opacity" id="hubBackdrop"></div>
      <div class="relative bg-secondary-bg rounded-lg shadow-xl max-w-4xl w-full flex flex-col" style="height: 80vh;">
        <div class="flex items-center justify-between p-4 border-b border-sidebar-border">
          <h3 class="text-lg font-semibold text-text-primary">
            <i class="fas fa-th-large text-highlight-green mr-2"></i>
            Plugins
            <span class="text-xs font-normal text-gray-400 ml-2">${plugins.length} installed</span>
          </h3>
          <button type="button" id="closeHubBtn" class="text-sidebar-text hover:text-text-primary">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div class="px-4 pt-4 space-y-3">
          <div class="relative">
            <i class="fas fa-search absolute text-gray-400 text-sm" style="left: 12px; top: 50%; transform: translateY(-50%);"></i>
            <input id="hubSearch" type="text" placeholder="Search plugins..." autocomplete="off"
              class="bg-tertiary-bg text-text-primary focus:outline-none rounded pr-3 py-2 w-full text-sm" style="padding-left: 34px;">
          </div>
          <div id="hubChips" class="flex flex-wrap gap-2"></div>
        </div>

        <div id="hubPending" class="hub-pending" style="display:none;"></div>

        <div id="hubGrid" class="hub-grid"></div>

        <div class="px-4 py-2 border-t border-sidebar-border text-xs text-gray-400 flex items-center justify-between">
          <span><i class="fas fa-star text-amber-400 mr-1"></i>Star a plugin to pin it to the sidebar.</span>
          <a href="#" id="hubManage" class="hover:text-text-primary">Turn plugins on/off in Settings</a>
        </div>
      </div>

      <style>
        .hub-chip { font-size: 12px; padding: 4px 11px; border-radius: 999px; cursor: pointer; border: 1px solid transparent;
          color: var(--jam-sidebar-text, #C3C3C3);
          background: color-mix(in srgb, var(--jam-tertiary-bg, #3A3D4D) 55%, transparent); }
        .hub-chip:hover { color: var(--jam-text-primary, #fff); }
        .hub-chip.active { color: var(--jam-text-primary, #fff);
          background: color-mix(in srgb, var(--jam-accent, #38b000) 22%, transparent);
          border-color: color-mix(in srgb, var(--jam-accent, #38b000) 55%, transparent); }
        .hub-chip .hub-count { opacity: .6; margin-left: 4px; }
        .hub-grid { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 16px;
          display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          grid-auto-rows: min-content; align-content: start; gap: 12px; }
        .hub-card { position: relative; display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 8px;
          height: auto; box-sizing: border-box;
          border: 1px solid color-mix(in srgb, var(--jam-sidebar-border, #3A3D4D) 70%, transparent);
          background: color-mix(in srgb, var(--jam-tertiary-bg, #3A3D4D) 25%, transparent);
          transition: background .15s, border-color .15s, transform .15s; }
        .hub-card.openable { cursor: pointer; }
        .hub-card.openable:hover { transform: translateY(-1px);
          background: color-mix(in srgb, var(--jam-tertiary-bg, #3A3D4D) 50%, transparent);
          border-color: color-mix(in srgb, var(--jam-accent, #38b000) 45%, transparent); }
        .hub-card.kb-focus { border-color: var(--jam-accent, #38b000); }
        .hub-head { display: flex; align-items: center; gap: 10px; min-width: 0; padding-right: 22px; }
        .hub-icon { width: 34px; height: 34px; border-radius: 8px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 15px; }
        .hub-icon.ui { color: var(--jam-accent, #38b000); background: color-mix(in srgb, var(--jam-accent, #38b000) 14%, transparent); }
        .hub-icon.game { color: #f0b429; background: rgba(240, 180, 41, .12); }
        .hub-title { min-width: 0; flex: 1; }
        .hub-name { font-weight: 600; font-size: 14px; line-height: 1.25; color: var(--jam-text-primary, #fff);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .hub-meta { font-size: 11px; line-height: 1.3; color: #9ca3af; margin-top: 2px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .hub-desc { font-size: 12px; color: #9ca3af; line-height: 1.4; margin: 0;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .hub-tag { align-self: flex-start; font-size: 10px; line-height: 1.4; padding: 1px 7px; border-radius: 999px;
          color: #f0b429; background: rgba(240, 180, 41, .12); }
        .hub-star { position: absolute; top: 10px; right: 10px; padding: 3px; border-radius: 4px; color: #6b7280; cursor: pointer; line-height: 1; }
        .hub-star:hover { color: #fbbf24; }
        .hub-star.on { color: #fbbf24; }
        .hub-pending { margin: 12px 16px 0; padding: 12px; border-radius: 8px;
          border: 1px solid rgba(240, 180, 41, .45); background: rgba(240, 180, 41, .08); }
        .hub-pending-title { font-size: 13px; font-weight: 600; color: #f0b429; margin-bottom: 4px; }
        .hub-pending-note { font-size: 12px; color: #9ca3af; margin-bottom: 10px; line-height: 1.4; }
        .hub-pending-row { display: flex; align-items: center; gap: 10px; padding: 8px 0;
          border-top: 1px solid rgba(240, 180, 41, .2); }
        .hub-pending-row .hub-title { flex: 1; min-width: 0; }
        .hub-btn { font-size: 12px; padding: 5px 12px; border-radius: 6px; cursor: pointer; border: 1px solid transparent; flex-shrink: 0; }
        .hub-btn.approve { color: #fff; background: var(--jam-accent, #38b000); }
        .hub-btn.approve:hover { filter: brightness(1.1); }
        .hub-btn.reject { color: var(--jam-sidebar-text, #C3C3C3); border-color: color-mix(in srgb, var(--jam-sidebar-border, #3A3D4D) 90%, transparent); }
        .hub-btn.reject:hover { color: var(--jam-text-primary, #fff); }
        .hub-empty { grid-column: 1 / -1; text-align: center; color: #9ca3af; padding: 40px 0; font-size: 13px; }
      </style>
    </div>
  `)

  const $grid = $modal.find('#hubGrid')
  const $chips = $modal.find('#hubChips')
  const $search = $modal.find('#hubSearch')
  let shown = []
  let kbIndex = -1

  const close = () => app.modals.close()
  $modal.find('#closeHubBtn, #hubBackdrop').on('click', close)
  $modal.find('#hubManage').on('click', (e) => {
    e.preventDefault()
    app.modals.close(true)
    app.openSettings()
  })

  const matches = (plugin) => {
    const favorites = app.favoritePlugins()
    if (state.category === 'Favorites' && !favorites.includes(plugin.name)) return false
    if (state.category !== 'All' && state.category !== 'Favorites' && plugin.category !== state.category) return false
    if (!state.query) return true
    const q = state.query.toLowerCase()
    return [plugin.name, plugin.description, plugin.author, plugin.category]
      .some(text => text.toLowerCase().includes(q))
  }

  const renderChips = () => {
    const favorites = app.favoritePlugins()
    const counts = { All: plugins.length, Favorites: plugins.filter(p => favorites.includes(p.name)).length }
    categories.forEach(c => { counts[c] = plugins.filter(p => p.category === c).length })

    $chips.empty()
    ;['All', 'Favorites', ...categories].forEach(name => {
      const icon = name === 'Favorites' ? '<i class="fas fa-star text-amber-400 mr-1"></i>' : ''
      $('<button>', { type: 'button', class: `hub-chip ${state.category === name ? 'active' : ''}` })
        .html(`${icon}${escapeHtml(name)}<span class="hub-count">${counts[name]}</span>`)
        .on('click', () => {
          state.category = name
          renderChips()
          renderGrid()
        })
        .appendTo($chips)
    })
  }

  const openPlugin = (plugin) => {
    if (plugin.type !== 'ui') return
    app.modals.close()
    app.dispatch.open(plugin.name)
  }

  const renderGrid = () => {
    const favorites = app.favoritePlugins()
    shown = plugins.filter(matches)
    kbIndex = state.query && shown.length ? 0 : -1
    $grid.empty()

    if (!shown.length) {
      const message = state.category === 'Favorites' && !state.query
        ? 'No favorites yet. Star a plugin under All to pin it here and in the sidebar.'
        : 'No plugins match your search.'
      $grid.append(`<div class="hub-empty"><i class="fas fa-puzzle-piece text-lg opacity-50 mb-2 block"></i>${message}</div>`)
      return
    }

    shown.forEach((plugin, index) => {
      const isFavorite = favorites.includes(plugin.name)
      const $card = $(`
        <div class="hub-card ${plugin.type === 'ui' ? 'openable' : ''} ${index === kbIndex ? 'kb-focus' : ''}"
          title="${plugin.type === 'ui' ? 'Click to open' : 'Runs in the background - see How To for its commands'}">
          <div class="hub-head">
            <div class="hub-icon ${plugin.type === 'ui' ? 'ui' : 'game'}"><i class="fas ${plugin.icon}"></i></div>
            <div class="hub-title">
              <div class="hub-name">${escapeHtml(plugin.name)}</div>
              <div class="hub-meta">${escapeHtml(plugin.author)} &middot; ${escapeHtml(plugin.category)}</div>
            </div>
          </div>
          <p class="hub-desc">${escapeHtml(plugin.description || 'No description.')}</p>
          ${plugin.type === 'ui' ? '' : '<span class="hub-tag"><i class="fas fa-cog mr-1"></i>Runs in background</span>'}
          <span class="hub-star ${isFavorite ? 'on' : ''}" title="${isFavorite ? 'Unpin from sidebar' : 'Pin to sidebar'}">
            <i class="${isFavorite ? 'fas' : 'far'} fa-star"></i>
          </span>
        </div>
      `)

      $card.find('.hub-star').on('click', (e) => {
        e.stopPropagation()
        app.toggleFavoritePlugin(plugin.name)
        renderChips()
        renderGrid()
      })
      $card.on('click', () => openPlugin(plugin))
      $grid.append($card)
    })
  }

  const renderPending = () => {
    const $pending = $modal.find('#hubPending')
    const waiting = [...app.dispatch.pendingPlugins.values()].map(p => p.configuration)
    if (!waiting.length) {
      $pending.hide().empty()
      return
    }

    $pending.empty().show().append(`
      <div class="hub-pending-title"><i class="fas fa-shield-alt mr-1"></i>${waiting.length === 1 ? 'A new plugin needs' : `${waiting.length} new plugins need`} your approval</div>
      <div class="hub-pending-note">These didn't come with Jam Reborn. Plugins can do anything Jam can, including sending packets for your account,
        so only enable ones you got from someone you trust.</div>
    `)

    waiting.forEach(configuration => {
      const $row = $(`
        <div class="hub-pending-row">
          <div class="hub-icon ${configuration.type === 'ui' ? 'ui' : 'game'}"><i class="fas ${exports.iconOf(configuration)}"></i></div>
          <div class="hub-title">
            <div class="hub-name">${escapeHtml(configuration.name)}</div>
            <div class="hub-meta">by ${escapeHtml(configuration.author || 'unknown')} &middot; ${escapeHtml(configuration.description || 'No description.')}</div>
          </div>
          <button type="button" class="hub-btn reject">Keep off</button>
          <button type="button" class="hub-btn approve">Enable</button>
        </div>
      `)
      $row.find('.approve').on('click', async () => {
        $row.find('button').prop('disabled', true)
        await app.dispatch.approvePlugin(configuration.name)
        app.modals.close(true)
        app.openPluginHub()
      })
      $row.find('.reject').on('click', async () => {
        await app.dispatch.rejectPlugin(configuration.name)
        renderPending()
      })
      $pending.append($row)
    })
  }

  $search.on('input', () => {
    state.query = $search.val().trim()
    if (state.query && state.category === 'Favorites') {
      // Searching should look through everything, not just favorites.
      state.category = 'All'
      renderChips()
    }
    renderGrid()
  })

  // Up/Down move through results, Enter opens the highlighted one.
  $search.on('keydown', (e) => {
    if (!shown.length) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      kbIndex = Math.min(shown.length - 1, Math.max(0, (kbIndex < 0 ? -1 : kbIndex) + step))
      $grid.children('.hub-card').removeClass('kb-focus').eq(kbIndex).addClass('kb-focus')[0]
        .scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter' && kbIndex >= 0) {
      e.preventDefault()
      openPlugin(shown[kbIndex])
    }
  })

  renderPending()
  renderChips()
  renderGrid()
  setTimeout(() => $search.trigger('focus'), 80)

  return $modal
}

exports.close = function () {}
