import type { VideoDownloaderApi } from './shared/types'

declare global {
  interface Window {
    videoDownloader: VideoDownloaderApi
  }
}

export {}
