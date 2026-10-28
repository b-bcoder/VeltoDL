import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { LocalProcessor } from '../../Core/LocalProcessor'
import type {
  AppState,
  DownloadProgress,
  JobResult
} from '../shared/types'

let mainWindow: BrowserWindow | null = null

function send(channel: string, value: AppState | DownloadProgress | JobResult): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, value)
  }
}

const processor = new LocalProcessor({
  onState: (state) => send('app:state', state),
  onProgress: (progress) => send('download:progress', progress),
  onComplete: (result) => send('download:complete', result)
})

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 800,
    minWidth: 760,
    minHeight: 640,
    title: 'Video Downloader',
    backgroundColor: '#0c111b',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function registerHandlers(): void {
  ipcMain.handle('app:get-state', () => processor.getState())
  ipcMain.handle('folder:choose', (_event) => {
    if (!mainWindow) throw new Error('The application window is unavailable.')
    return processor.chooseFolder(mainWindow)
  })
  ipcMain.handle('urls:validate', (_event, input: unknown) => {
    if (typeof input !== 'string') throw new Error('Enter one or more URLs.')
    return processor.validate(input)
  })
  ipcMain.handle('settings:set', (_event, settings: unknown) =>
    processor.setSettings(settings)
  )
  ipcMain.handle('download:start', async (_event, input: unknown, settings: unknown) => {
    if (typeof input !== 'string') throw new Error('Check the current URLs before starting.')
    await processor.start(input, settings)
  })
  ipcMain.handle('download:cancel', () => processor.cancel())
}

app.whenReady().then(() => {
  registerHandlers()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => processor.cancel())
