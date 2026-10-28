import type { DownloadSettings } from '../src/shared/types'

const modes = new Set(['audio', 'video', 'both'])
const videoQualities = new Set(['best', '1080', '720', '480', '360'])
const audioQualities = new Set(['best', 'compact'])

export function validateSettings(value: unknown): DownloadSettings {
  if (!value || typeof value !== 'object') {
    throw new Error('Choose valid download settings.')
  }

  const settings = value as Partial<DownloadSettings>
  if (!modes.has(String(settings.mode))) {
    throw new Error('Choose audio, video, or audio and video.')
  }
  if (!videoQualities.has(String(settings.videoQuality))) {
    throw new Error('Choose a supported video quality.')
  }
  if (!audioQualities.has(String(settings.audioQuality))) {
    throw new Error('Choose a supported audio quality.')
  }

  return {
    mode: settings.mode as DownloadSettings['mode'],
    videoQuality: settings.videoQuality as DownloadSettings['videoQuality'],
    audioQuality: settings.audioQuality as DownloadSettings['audioQuality']
  }
}

