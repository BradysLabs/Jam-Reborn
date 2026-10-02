const { urlencoded, json } = require('body-parser')
const express = require('express')

/**
 * Routes
 */
const { router: ApiRouter, httpLogger } = require('./routes')
const passthrough = require('./passthrough')

/**
 * Express instance
 */
const app = express()

/**
 * Jammer Central (masterpiece submissions and the art gallery).
 * The game is loaded from this local server, and Jammer Central only accepts
 * uploads from games loaded from Animal Jam's content server, so the game is
 * pointed here and requests are forwarded to the real Jammer Central unchanged.
 */
app.use('/jammercentral', passthrough({
  target: 'https://jammercentral.animaljam.com/game/',
  headers: { Referer: 'https://desktop.animaljam.com/gameClient/game/index.html' },
  onRequest: ({ method, url }) => {
    httpLogger.emit('request', { id: `jc_${Date.now()}`, path: url, method, headers: {}, timestamp: Date.now(), type: 'jammercentral' })
  }
}))

/**
 * Middleware
 */
app.use(urlencoded({ extended: true }))
app.use(json())

/**
 * Routers
 */
app.use('/', ApiRouter)

/**
 * Handle IPC messages from main process
 *
 */
process.on('message', message => {
  if (message.type === 'start-http-logging') {
    httpLogger.on('request', (data) => {
      const { controller } = require('./controllers/FilesController')
      if (controller && controller.isLoggingEnabled()) {
        process.send({
          type: 'http-logger',
          data: {
            event: 'request',
            ...data
          }
        })
      }
    })

    httpLogger.on('response', (data) => {
      const { controller } = require('./controllers/FilesController')
      if (controller && controller.isLoggingEnabled()) {
        process.send({
          type: 'http-logger',
          data: {
            event: 'response',
            ...data
          }
        })
      }
    })

    httpLogger.on('modified', (data) => {
      const { controller } = require('./controllers/FilesController')
      if (controller && controller.isLoggingEnabled()) {
        process.send({
          type: 'http-logger',
          data: {
            event: 'modified',
            ...data
          }
        })
      }
    })

    httpLogger.on('logging-state-changed', (data) => {
      process.send({
        type: 'http-logger',
        data: {
          event: 'logging-state-changed',
          ...data
        }
      })
    })
  }

  if (message.type === 'toggle-http-logging') {
    const { controller } = require('./controllers/FilesController')
    if (controller && typeof controller.setLoggingEnabled === 'function') {
      controller.setLoggingEnabled(message.enabled)

      process.send({
        type: 'http-logger',
        data: {
          event: 'logging-state-changed',
          enabled: message.enabled
        }
      })
    }
  }

  if (message.type === 'override-response') {
    const { controller } = require('./controllers/FilesController')
    if (controller && typeof controller.overrideResponse === 'function') {
      controller.overrideResponse(message.requestId, message.filePath)
    }
  }
})

/**
 * Express listen
 */
app.listen(8080)

/**
 * Export HTTP logger for use in the renderer
 */
module.exports = { app, httpLogger }