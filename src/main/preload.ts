import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppState,
  DownloadProgress,
  DownloadSettings,
  JobResult,
  ValidationResult,
  VideoDownloaderApi
} from '../shared/types'

const api: VideoDownloaderApi = {
  getState: () => ipcRenderer.invoke('app:get-state') as Promise<AppState>,
  chooseFolder: () => ipcRenderer.invoke('folder:choose') as Promise<AppState>,
  validateUrls: (input) =>
    ipcRenderer.invoke('urls:validate', input) as Promise<ValidationResult[]>,
  setSettings: (settings: DownloadSettings) =>
    ipcRenderer.invoke('settings:set', settings) as Promise<AppState>,
  startDownload: (input, settings) =>
    ipcRenderer.invoke('download:start', input, settings) as Promise<void>,
  cancelDownload: () => ipcRenderer.invoke('download:cancel') as Promise<void>,
  onState: (listener) => subscribe('app:state', listener),
  onProgress: (listener) => subscribe('download:progress', listener),
  onComplete: (listener) => subscribe('download:complete', listener)
}

function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const wrapped = (_event: Electron.IpcRendererEvent, value: T) => listener(value)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

contextBridge.exposeInMainWorld('videoDownloader', api)
