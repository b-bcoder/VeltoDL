import { app } from 'electron'
import { access, mkdir, stat, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'
import { dialog, type BrowserWindow } from 'electron'
import type {
  AppState,
  DownloadProgress,
  DownloadSettings,
  JobResult,
  ValidationResult
} from '../src/shared/types'
import { validateSettings } from './DownloadOptionsProcess'
import { DownloadProcess } from './DownloadProcess'
import { validateUrls } from './UrlInputProcess'

const defaultSettings: DownloadSettings = {
  mode: 'both',
  videoQuality: 'best',
  audioQuality: 'best'
}

type EventCallbacks = {
  onState: (state: AppState) => void
  onProgress: (progress: DownloadProgress) => void
  onComplete: (result: JobResult) => void
}

function timestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}-${pad(date.getMinutes())}`
}

function reportText(
  results: JobResult['results'],
  urls: ValidationResult[],
  directory: string,
  settings: DownloadSettings,
  startedAt: Date,
  endedAt: Date
): string {
  const successful = results.filter((result) => result.status === 'success')
  const failed = results.filter((result) => result.status === 'failed')
  const cancelled = results.filter((result) => result.status === 'cancelled')
  const status = failed.length || cancelled.length ? 'Fault' : 'Succes'
  const lines = [
    `Result: ${status}`,
    `Started: ${startedAt.toLocaleString()}`,
    `Finished: ${endedAt.toLocaleString()}`,
    `Download location: ${directory}`,
    `Options: ${settings.mode}; video quality ${settings.videoQuality}; audio quality ${settings.audioQuality}`,
    `Successful: ${successful.length}`,
    `Failed: ${failed.length}`,
    `Cancelled: ${cancelled.length}`,
    '',
    'URLs:'
  ]

  for (const url of urls) {
    const result = results.find((entry) => entry.url === url.url)
    const title = url.title || result?.title
    lines.push(`- ${title ? `${title} — ` : ''}${url.url}: ${result?.status ?? 'not processed'}${result?.error ? ` — ${result.error}` : ''}`)
  }
  return `${lines.join('\r\n')}\r\n`
}

export class LocalProcessor {
  private downloadDirectory: string | null = null
  private settings = defaultSettings
  private validation: ValidationResult[] = []
  private validatedInput: string | null = null
  private busy = false
  private activeDownload: DownloadProcess | null = null

  constructor(private readonly events: EventCallbacks) {}

  getState(): AppState {
    return {
      downloadDirectory: this.downloadDirectory,
      settings: this.settings,
      validation: this.validation,
      busy: this.busy
    }
  }

  private publishState(): void {
    this.events.onState(this.getState())
  }

  async chooseFolder(parent: BrowserWindow): Promise<AppState> {
    if (this.busy) return this.getState()
    const result = await dialog.showOpenDialog(parent, {
      title: 'Choose download folder',
      properties: ['openDirectory', 'createDirectory']
    })
    if (!result.canceled && result.filePaths[0]) {
      await this.assertWritableDirectory(result.filePaths[0])
      this.downloadDirectory = result.filePaths[0]
      this.publishState()
    }
    return this.getState()
  }

  async validate(input: string): Promise<ValidationResult[]> {
    if (this.busy) throw new Error('Wait for the current download to finish before validating URLs.')
    this.validatedInput = input
    this.validation = await validateUrls(input)
    this.publishState()
    return this.validation
  }

  setSettings(value: unknown): AppState {
    if (this.busy) throw new Error('Download options cannot be changed during an active download.')
    this.settings = validateSettings(value)
    this.publishState()
    return this.getState()
  }

  async start(input: string, value: unknown): Promise<void> {
    if (this.busy) throw new Error('A download is already running.')
    if (input !== this.validatedInput) {
      throw new Error('Check the current URLs before starting the download.')
    }
    const settings = validateSettings(value)
    if (!this.downloadDirectory) {
      throw new Error('Choose a download folder before starting.')
    }
    await this.assertWritableDirectory(this.downloadDirectory)
    const validUrls = this.validation.filter((result) => result.valid)
    if (validUrls.length === 0) {
      throw new Error('Check at least one supported URL before starting.')
    }

    this.settings = settings
    this.busy = true
    this.publishState()
    const startedAt = new Date()
    const process = new DownloadProcess()
    this.activeDownload = process
    try {
      const downloadedResults = await process.run(
        validUrls,
        this.downloadDirectory,
        settings,
        (progress) => this.events.onProgress(progress)
      )
      const results = this.validation.map((item) => item.valid
        ? downloadedResults.find((result) => result.url === item.url) ?? {
          url: item.url,
          title: item.title,
          status: 'failed' as const,
          error: 'The URL was not processed.'
        }
        : {
          url: item.url,
          title: item.title,
          status: 'failed' as const,
          error: item.message ?? 'The URL could not be validated.'
        })
      const endedAt = new Date()
      const report = await this.writeReport(
        results,
        this.validation,
        this.downloadDirectory,
        settings,
        startedAt,
        endedAt
      )
      this.events.onComplete(report)
    } finally {
      this.activeDownload = null
      this.busy = false
      this.publishState()
    }
  }

  cancel(): void {
    this.activeDownload?.cancel()
  }

  private async assertWritableDirectory(directory: string): Promise<void> {
    try {
      const details = await stat(directory)
      if (!details.isDirectory()) {
        throw new Error('The selected download location is not a folder.')
      }
      await access(directory, constants.W_OK)
    } catch (error) {
      if (error instanceof Error && error.message === 'The selected download location is not a folder.') {
        throw error
      }
      throw new Error('The selected download folder is unavailable or not writable. Choose another folder.')
    }
  }

  private async writeReport(
    results: JobResult['results'],
    urls: ValidationResult[],
    directory: string,
    settings: DownloadSettings,
    startedAt: Date,
    endedAt: Date
  ): Promise<JobResult> {
    const logsDirectory = join(app.getPath('documents'), 'VDownloader_Logs')
    try {
      await mkdir(logsDirectory, { recursive: true })
      const hasFault = results.some((result) => result.status !== 'success')
      const prefix = hasFault ? 'Fault' : 'Succes'
      const base = `${prefix} ${timestamp(endedAt)}`
      const body = reportText(results, urls, directory, settings, startedAt, endedAt)
      let suffix = 0

      while (true) {
        const filename = `${base}${suffix ? ` (${suffix})` : ''}.txt`
        const reportPath = join(logsDirectory, filename)
        try {
          await writeFile(reportPath, body, { encoding: 'utf8', flag: 'wx' })
          return { results, reportPath }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
          suffix += 1
        }
      }
    } catch (error) {
      console.error('Could not save the VDownloader report.', error)
      return {
        results,
        reportPath: null,
        reportError: 'The download finished, but the report could not be saved in Documents\\VDownloader_Logs. Check folder permissions and available disk space.'
      }
    }
  }
}
