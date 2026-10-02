const http = require('http')
const https = require('https')

const SKIP_HEADERS = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'keep-alive', 'origin', 'referer', 'cookie'])

/**
 * Forwards requests to another server unchanged and streams the reply back.
 * Mount it on a path: app.use('/prefix', passthrough({ target: 'https://host/base/' })).
 * @param {Object} options
 * @param {string} options.target - Base URL the mounted path maps to.
 * @param {Object} [options.headers] - Extra headers to send upstream.
 * @param {Function} [options.onRequest] - Called with request info for logging.
 * @returns {Function} Express middleware
 */
module.exports = function passthrough ({ target, headers = {}, onRequest } = {}) {
  const base = target.replace(/\/+$/, '')

  return (request, response) => {
    const url = new URL(base + (request.url.startsWith('/') ? request.url : '/' + request.url))
    const outgoing = { ...headers }
    for (const [key, value] of Object.entries(request.headers)) {
      if (!SKIP_HEADERS.has(key.toLowerCase())) outgoing[key] = value
    }
    if (request.headers['content-length']) outgoing['content-length'] = request.headers['content-length']
    outgoing.host = url.host

    if (onRequest) {
      try { onRequest({ method: request.method, url: url.href }) } catch (_) {}
    }

    const transport = url.protocol === 'http:' ? http : https
    const upstream = transport.request(url, { method: request.method, headers: outgoing }, upstreamResponse => {
      response.statusCode = upstreamResponse.statusCode
      for (const [key, value] of Object.entries(upstreamResponse.headers)) {
        if (key !== 'transfer-encoding' && key !== 'connection') response.setHeader(key, value)
      }
      upstreamResponse.pipe(response)
    })

    upstream.on('error', error => {
      if (!response.headersSent) {
        response.statusCode = 502
        response.end(`Request failed: ${error.message}`)
      } else {
        response.end()
      }
    })

    request.pipe(upstream)
  }
}
