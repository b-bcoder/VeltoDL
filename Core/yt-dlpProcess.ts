import { join } from 'node:path'
import type { DownloadSettings } from '../src/shared/types'

export function buildYtDlpArgs(
  url: string,
  directory: string,
  settings: DownloadSettings
): string[] {
  const outputTemplate = join(directory, '%(title).200B [%(id)s].%(ext)s')
  const args = [
    '--no-playlist',
    '--newline',
    '--progress',
    '--no-warnings',
    '-o',
    outputTemplate
  ]

  if (settings.mode === 'audio') {
    args.push('-f', 'bestaudio')
    if (settings.audioQuality === 'compact') {
      args.push('-S', '+abr')
    } else {
      args.push('-S', 'abr')
    }
  } else if (settings.mode === 'video') {
    const format = settings.videoQuality === 'best'
      ? 'bestvideo'
      : `bestvideo[height<=${settings.videoQuality}]`
    args.push('-f', format)
  } else {
    const format = settings.videoQuality === 'best'
      ? 'best'
      : `best[height<=${settings.videoQuality}]`
    args.push('-f', format)
  }

  args.push('--', url)
  return args
}

