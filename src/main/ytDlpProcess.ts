import { app } from 'electron'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

export function getYtDlpPath(): string {
  const packageEntry = require.resolve('youtube-dl-exec')
  const packageRoot = resolve(dirname(packageEntry), '..')
  const binaryName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
  const packagedBinary = join(packageRoot, 'bin', binaryName)

  if (!app.isPackaged) {
    return packagedBinary
  }

  const unpackedBinary = packagedBinary.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')
  const executable = existsSync(unpackedBinary) ? unpackedBinary : packagedBinary
  return resolve(dirname(fileURLToPath(import.meta.url)), executable)
}

export function getFfmpegPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe')
  }

  const ffmpegPath = require('ffmpeg-static') as string | null
  if (!ffmpegPath) {
    throw new Error('The FFmpeg executable is not available for this platform.')
  }
  return ffmpegPath
}
