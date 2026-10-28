export type DownloadMode = 'audio' | 'video' | 'both'
export type VideoQuality = 'best' | '1080' | '720' | '480' | '360'
export type AudioQuality = 'best' | 'compact'

export interface DownloadSettings {
  mode: DownloadMode
  videoQuality: VideoQuality
  audioQuality: AudioQuality
}

export type ValidationErrorCode =
  | 'invalid_url'
  | 'metadata'
  | 'rejected'
  | 'network'
  | 'unexpected'

export interface ValidationResult {
  url: string
  valid: boolean
  title?: string
  errorCode?: ValidationErrorCode
  message?: string
}

export interface AppState {
  downloadDirectory: string | null
  settings: DownloadSettings
  validation: ValidationResult[]
  busy: boolean
}

export interface DownloadProgress {
  url: string
  title?: string
  percent: number | null
  speed: string | null
  etaSeconds: number | null
  status: 'starting' | 'downloading' | 'finished' | 'failed' | 'cancelled'
  error?: string
}

export interface DownloadItemResult {
  url: string
  title?: string
  status: 'success' | 'failed' | 'cancelled'
  error?: string
}

export interface JobResult {
  results: DownloadItemResult[]
  reportPath: string | null
  reportError?: string
}

export interface VideoDownloaderApi {
  getState(): Promise<AppState>
  chooseFolder(): Promise<AppState>
  validateUrls(input: string): Promise<ValidationResult[]>
  setSettings(settings: DownloadSettings): Promise<AppState>
  startDownload(input: string, settings: DownloadSettings): Promise<void>
  cancelDownload(): Promise<void>
  onState(listener: (state: AppState) => void): () => void
  onProgress(listener: (progress: DownloadProgress) => void): () => void
  onComplete(listener: (result: JobResult) => void): () => void
}
