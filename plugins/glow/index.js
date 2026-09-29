
module.exports = function ({ dispatch, application }) {
  const DEFAULT_MS = 600
  const MIN_MS = 200 // don't let the loop spam faster than this
 
  let interval = null
 
  /**
   * Toggle the glow loop. Optional first argument sets the speed in ms.
   */
  const handleGlowCommand = async ({ parameters }) => {
    if (interval) return clear()
 
    const room = await dispatch.getState('room')
    if (!room) {
      return application.consoleMessage({
        message: 'You must be in a room to use this plugin.',
        type: 'error'
      })
    }
 
    let speed = DEFAULT_MS
    if (parameters[0] !== undefined) {
      const parsed = parseInt(parameters[0], 10)
      if (!Number.isNaN(parsed)) speed = Math.max(parsed, MIN_MS)
    }
 
    interval = dispatch.setInterval(glow, speed)
    dispatch.serverMessage('Glow enabled. Only other players will see your glow. Type glow again to stop.')
  }
 
  /**
   * Sends one glow packet, re-reading the room each time so it keeps
   * working after you change rooms.
   */
  const glow = async () => {
    const room = await dispatch.getState('room')
    if (!room) return // between rooms / loading — skip this tick
 
    const color = dispatch.random(1019311667, 4294967295)
    dispatch.sendRemoteMessage(`<msg t="sys"><body action="pubMsg" r="${room}"><txt><![CDATA[${color}%8]]></txt></body></msg>`)
  }
 
  /**
   * Stops the glow loop.
   */
  const clear = () => {
    if (interval) dispatch.clearInterval(interval)
    interval = null
    dispatch.serverMessage('Glow disabled.')
  }
 
  dispatch.onCommand({
    name: 'glow',
    description: 'Changes your avatar color glow randomly.',
    callback: handleGlowCommand
  })
}