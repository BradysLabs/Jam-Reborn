const path = require('path')
const os = require('os')
const { copyFile, rm, mkdir, cp, stat, readFile } = require('fs/promises')
const crypto = require('crypto')
const { existsSync } = require('fs')
const { spawn } = require('child_process')

/**
 * Animal Jam Classic base path
 * @constant
 */
const ANIMAL_JAM_CLASSIC_BASE_PATH = process.platform === 'win32'
  ? path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'aj-classic')
  : process.platform === 'darwin'
    ? path.join('/', 'Applications', 'AJ Classic.app', 'Contents')
    : undefined

/**
 * Custom Jam path
 * @constant
 */
const JAM_CLASSIC_BASE_PATH = process.platform === 'win32'
  ? path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'jam-classic')
  : process.platform === 'darwin'
    ? path.join('/', 'Applications', 'Jam Classic.app', 'Contents')
    : undefined

/**
 * Custom Jam cache path
 * @constant
 */
const JAM_CLASSIC_CACHE_PATH = process.platform === 'win32'
  ? path.join(os.homedir(), 'AppData', 'Roaming', 'Jam Classic', 'Cache')
  : process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support', 'Jam Classic', 'Cache')
    : undefined

/**
 * Custom asar file name for this platform
 * @constant
 */
const CUSTOM_ASAR_NAME = process.platform === 'win32'
  ? 'winapp.asar'
  : process.platform === 'darwin'
    ? 'osxapp.asar'
    : undefined

/**
 * Finds the bundled custom asar in both dev and installed builds
 * @returns {string|null}
 */
const findCustomAsar = () => {
  if (!CUSTOM_ASAR_NAME) return null
  const candidates = [
    process.resourcesPath && path.join(process.resourcesPath, 'assets', CUSTOM_ASAR_NAME),
    path.join(path.dirname(process.execPath), 'assets', CUSTOM_ASAR_NAME),
    path.resolve(__dirname, '..', '..', '..', '..', '..', 'assets', CUSTOM_ASAR_NAME)
  ].filter(Boolean)
  return candidates.find(candidate => existsSync(candidate)) || null
}

module.exports = class Patcher {
  /**
   * Creates an instance of the Patcher class
   * @param {Settings} application The application that instantiated this patcher
   */
  constructor (application) {
    this._application = application
    this._animalJamProcess = null
  }

  /**
   * Starts Animal Jam Classic process
   * @returns {Promise<void>}
   */
  async killProcessAndPatch () {
    try {
      await this.ensureJamVersionExists()

      if (existsSync(JAM_CLASSIC_CACHE_PATH)) {
        await rm(JAM_CLASSIC_CACHE_PATH, { recursive: true })
        await mkdir(JAM_CLASSIC_CACHE_PATH, { recursive: true })
      }

      const exePath = process.platform === 'win32'
        ? path.join(JAM_CLASSIC_BASE_PATH, 'AJ Classic.exe')
        : process.platform === 'darwin'
          ? path.join(JAM_CLASSIC_BASE_PATH, 'MacOS', 'AJ Classic')
          : undefined

      await this._launch(exePath)
    } catch (error) {
      this._application.consoleMessage({
        message: `Failed to start Jam Classic: ${error.message}`,
        type: 'error'
      })
    }
  }

  /**
   * Starts the game without waiting for it to close. Only a real launch
   * failure (e.g. missing or blocked .exe) is reported - closing the game
   * normally is not an error.
   * @param {string} exePath
   * @returns {Promise<void>}
   * @private
   */
  _launch (exePath) {
    return new Promise((resolve, reject) => {
      const child = spawn(exePath, [], { detached: true, stdio: 'ignore' })

      child.once('error', reject)
      child.once('spawn', () => {
        child.removeListener('error', reject)
        child.on('error', () => {})
        child.unref()
        this._animalJamProcess = child
        resolve()
      })
    })
  }

  /**
   * Ensures that custom Jam version of Animal Jam exists
   * @returns {Promise<void>}
   */
  async ensureJamVersionExists () {
    try {
      if (!existsSync(JAM_CLASSIC_BASE_PATH)) {
        this._application.consoleMessage({
          message: 'Creating custom Jam Classic installation (this only happens once)...',
          type: 'wait'
        })

        if (!existsSync(ANIMAL_JAM_CLASSIC_BASE_PATH)) {
          throw new Error('Animal Jam Classic installation not found. Please install the original game first.')
        }

        const parentDir = path.dirname(JAM_CLASSIC_BASE_PATH)
        if (!existsSync(parentDir)) {
          await mkdir(parentDir, { recursive: true })
        }

        try {
          this._application.consoleMessage({
            message: 'Copying Animal Jam files to custom directory...',
            type: 'wait'
          })

          await mkdir(JAM_CLASSIC_BASE_PATH, { recursive: true })

          if (process.platform === 'win32') {
            const { exec } = require('child_process')
            await new Promise((resolve, reject) => {
              exec(`xcopy "${ANIMAL_JAM_CLASSIC_BASE_PATH}" "${JAM_CLASSIC_BASE_PATH}" /E /I /H /Y`,
                (error) => error ? reject(error) : resolve())
            })
          } else if (process.platform === 'darwin') {
            const { exec } = require('child_process')
            await new Promise((resolve, reject) => {
              exec(`cp -R "${ANIMAL_JAM_CLASSIC_BASE_PATH}/"* "${JAM_CLASSIC_BASE_PATH}/"`,
                (error) => error ? reject(error) : resolve())
            })
          } else {
            await cp(ANIMAL_JAM_CLASSIC_BASE_PATH, JAM_CLASSIC_BASE_PATH, {
              recursive: true,
              force: true,
              preserveTimestamps: true
            })
          }

          this._application.consoleMessage({
            message: 'Files copied successfully.',
            type: 'success'
          })
        } catch (copyError) {
          throw new Error(`Failed to copy files: ${copyError.message}`)
        }
      }

      if (!(await this.isPatched())) {
        await this.patchCustomInstallation()
        this._application.consoleMessage({
          message: 'Custom Jam Classic installation is ready.',
          type: 'success'
        })
      }
    } catch (error) {
      this._application.consoleMessage({
        message: `Failed to create Jam Classic: ${error.message}`,
        type: 'error'
      })
      throw error
    }
  }

  /**
   * Checks that the custom installation is using the bundled asar
   * @returns {Promise<boolean>}
   */
  async isPatched () {
    const asarPath = path.join(JAM_CLASSIC_BASE_PATH, 'resources', 'app.asar')
    process.noAsar = true
    try {
      const customAsarPath = findCustomAsar()
      if (!customAsarPath || !existsSync(asarPath)) return false
      const [installed, bundled] = await Promise.all([stat(asarPath), stat(customAsarPath)])
      if (installed.size !== bundled.size) return false

      // Same size isn't proof of the same file - compare contents too.
      const hash = async file => crypto.createHash('sha256').update(await readFile(file)).digest('hex')
      const [installedHash, bundledHash] = await Promise.all([hash(asarPath), hash(customAsarPath)])
      return installedHash === bundledHash
    } catch (_) {
      return false
    } finally {
      process.noAsar = false
    }
  }

  /**
   * Patches custom Jam installation with the modified asar
   * @returns {Promise<void>}
   */
  async patchCustomInstallation () {
    const resourcesDir = path.join(JAM_CLASSIC_BASE_PATH, 'resources')
    const asarPath = path.join(resourcesDir, 'app.asar')
    const asarUnpackedPath = path.join(resourcesDir, 'app.asar.unpacked')

    try {
      process.noAsar = true
      const customAsarPath = findCustomAsar()

      if (!existsSync(resourcesDir)) {
        await mkdir(resourcesDir, { recursive: true })
      }

      if (!customAsarPath) {
        throw new Error(`${CUSTOM_ASAR_NAME} not found in the Jam Reborn install folder`)
      }

      if (existsSync(asarPath)) {
        await rm(asarPath).catch(() => {})
      }
      if (existsSync(asarUnpackedPath)) {
        await rm(asarUnpackedPath, { recursive: true }).catch(() => {})
      }

      await copyFile(customAsarPath, asarPath)

      const exePath = process.platform === 'win32'
        ? path.join(JAM_CLASSIC_BASE_PATH, 'AJ Classic.exe')
        : process.platform === 'darwin'
          ? path.join(JAM_CLASSIC_BASE_PATH, 'MacOS', 'AJ Classic')
          : undefined

      if (!existsSync(exePath)) {
        throw new Error(`Executable not found at: ${exePath}`)
      }

      this._application.consoleMessage({
        message: 'Application successfully patched.',
        type: 'success'
      })
    } catch (error) {
      this._application.consoleMessage({
        message: `Failed to patch Jam Classic: ${error.message}`,
        type: 'error'
      })
      throw error
    } finally {
      process.noAsar = false
    }
  }
}