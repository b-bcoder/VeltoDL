import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type {
  DownloadItemResult,
  DownloadProgress,
  ValidationResult
} from '../src/shared/types'
import { getYtDlpPath } from '../src/main/ytDlpProcess'
import { buildYtDlpArgs } from './yt-dlpProcess'
import type { DownloadSettings } from '../src/shared/types'

function parseEta(value: string): number | null {
  const match = value.match(/(?:(\d+):)?(\d{1,2}):(\d{1,2})/)
  if (!match) return null
  return Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3])
}

function safeError(stderr: string): string {
  if (/ffmpeg.*(?:not found|not installed|not available)/i.test(stderr)) {
    return 'This source needs FFmpeg to merge or convert streams, but FFmpeg is not available.'
  }
  if (/timed?\s*out|network|connection|urlopen error|temporary failure/i.test(stderr)) {
    return 'A network error interrupted this download. Check your connection and try again.'
  }
  if (/requested format is not available|format is not available/i.test(stderr)) {
    return 'The selected format is not available for this media.'
  }
  if (/private video|sign in|login required|http error 403/i.test(stderr)) {
    return 'The source requires access that is not available to the downloader.'
  }
  return 'The download failed. The media may be unavailable or no longer supported.'
}

export class DownloadProcess {
  private currentChild: ChildProcessWithoutNullStreams | null = null
  private cancelled = false

  cancel(): void {
    this.cancelled = true
    this.currentChild?.kill()
  }

  async run(
    urls: ValidationResult[],
    directory: string,
    settings: DownloadSettings,
    onProgress: (progress: DownloadProgress) => void
  ): Promise<DownloadItemResult[]> {
    this.cancelled = false
    const results: DownloadItemResult[] = []

    for (const item of urls) {
      if (this.cancelled) {
        results.push({ url: item.url, title: item.title, status: 'cancelled' })
        continue
      }

      onProgress({
        url: item.url,
        title: item.title,
        percent: 0,
        speed: null,
        etaSeconds: null,
        status: 'starting'
      })
      const result = await this.downloadOne(item, directory, settings, onProgress)
      results.push(result)
    }
    return results
  }

  private downloadOne(
    item: ValidationResult,
    directory: string,
    settings: DownloadSettings,
    onProgress: (progress: DownloadProgress) => void
  ): Promise<DownloadItemResult> {
    return new Promise((resolve) => {
      const child = spawn(getYtDlpPath(), buildYtDlpArgs(item.url, directory, settings), {
        windowsHide: true
      })
      this.currentChild = child
      let stderr = ''
      let pendingStdout = ''
      let pendingStderr = ''
      let settled = false

      const finish = (result: DownloadItemResult) => {
        if (settled) return
        settled = true
        this.currentChild = null
        resolve(result)
      }

      const processOutput = (chunk: string, stream: 'stdout' | 'stderr') => {
        const pending = stream === 'stdout' ? pendingStdout : pendingStderr
        const combined = pending + chunk
        const lines = combined.split(/\r?\n/)
        const remainder = lines.pop() ?? ''
        if (stream === 'stdout') pendingStdout = remainder
        else pendingStderr = remainder
        for (const line of lines) {
          const progressMatch = line.match(
            /\[download\]\s+([\d.]+)%.*?(?:\bat\s+(\S+))?.*?(?:\bETA\s+(\S+))?/i
          )
          if (!progressMatch) continue
          onProgress({
            url: item.url,
            title: item.title,
            percent: Number(progressMatch[1]),
            speed: progressMatch[2] ?? null,
            etaSeconds: progressMatch[3] ? parseEta(progressMatch[3]) : null,
            status: 'downloading'
          })
        }
      }

      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => processOutput(chunk, 'stdout'))
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (chunk: string) => {
        stderr = (stderr + chunk).slice(-16_384)
        processOutput(chunk, 'stderr')
      })
      child.once('error', () => {
        finish({
          url: item.url,
          title: item.title,
          status: 'failed',
          error: 'yt-dlp could not be started. Please restart the application.'
        })
      })
      child.once('close', (code) => {
        if (this.cancelled) {
          onProgress({
            url: item.url,
            title: item.title,
            percent: null,
            speed: null,
            etaSeconds: null,
            status: 'cancelled'
          })
          finish({ url: item.url, title: item.title, status: 'cancelled' })
        } else if (code === 0) {
          onProgress({
            url: item.url,
            title: item.title,
            percent: 100,
            speed: null,
            etaSeconds: 0,
            status: 'finished'
          })
          finish({ url: item.url, title: item.title, status: 'success' })
        } else {
          const error = safeError(stderr)
          onProgress({
            url: item.url,
            title: item.title,
            percent: null,
            speed: null,
            etaSeconds: null,
            status: 'failed',
            error
          })
          finish({ url: item.url, title: item.title, status: 'failed', error })
        }
      })
    })
  }
}
