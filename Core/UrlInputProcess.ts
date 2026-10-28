import { spawn } from 'node:child_process'
import type { ValidationErrorCode, ValidationResult } from '../src/shared/types'
import { getYtDlpPath } from '../src/main/ytDlpProcess'

const VALIDATION_TIMEOUT_MS = 45_000

function classifyValidationError(stderr: string): ValidationErrorCode {
  if (/timed?\s*out|connection|network|temporary failure|unable to connect|urlopen error|tls/i.test(stderr)) {
    return 'network'
  }
  if (/unsupported url|no suitable extractor|not a valid url|unsupported url/i.test(stderr)) {
    return 'rejected'
  }
  return 'metadata'
}

function errorMessage(code: ValidationErrorCode, url: string): string {
  switch (code) {
    case 'network':
      return 'There was a network error, please check your network connection and try again.'
    case 'rejected':
      return `"${url}" couldn't be validated because yt-dlp refuses to download this URL`
    case 'metadata':
      return `"${url}" couldn't be validated because yt-dlp can't get the metadata of the URL`
    case 'invalid_url':
      return `"${url}" is not a valid HTTP or HTTPS URL.`
    default:
      return 'An unexpected error occurred. Please try again.'
  }
}

export function parseUrls(input: string): string[] {
  return [...new Set(input.split(/\r?\n/).map((value) => value.trim()).filter(Boolean))]
}

export function validateUrlSyntax(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.hostname.length > 0 &&
      !parsed.username &&
      !parsed.password
  } catch {
    return false
  }
}

function validateWithYtDlp(url: string): Promise<ValidationResult> {
  return new Promise((resolve) => {
    const child = spawn(
      getYtDlpPath(),
      ['--skip-download', '--no-playlist', '--no-warnings', '--no-progress', '--print', '%(title)s', '--', url],
      { windowsHide: true }
    )
    let stdout = ''
    let stderr = ''
    let settled = false

    const finish = (result: ValidationResult) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(result)
    }

    const timeout = setTimeout(() => {
      child.kill()
      finish({
        url,
        valid: false,
        errorCode: 'network',
        message: errorMessage('network', url)
      })
    }, VALIDATION_TIMEOUT_MS)

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (data: string) => {
      stdout = (stdout + data).slice(-16_384)
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (data: string) => {
      stderr = (stderr + data).slice(-16_384)
    })
    child.once('error', () => {
      finish({
        url,
        valid: false,
        errorCode: 'unexpected',
        message: 'yt-dlp could not be started. Please restart the application.'
      })
    })
    child.once('close', (code) => {
      const title = stdout.trim().split(/\r?\n/).find(Boolean)
      if (code === 0 && title) {
        finish({ url, valid: true, title })
        return
      }
      const errorCode = classifyValidationError(stderr)
      finish({ url, valid: false, errorCode, message: errorMessage(errorCode, url) })
    })
  })
}

export async function validateUrls(input: string): Promise<ValidationResult[]> {
  const urls = parseUrls(input)
  const results = new Array<ValidationResult>(urls.length)
  let nextIndex = 0

  const worker = async () => {
    while (nextIndex < urls.length) {
      const index = nextIndex++
      const url = urls[index]
      results[index] = validateUrlSyntax(url)
        ? await validateWithYtDlp(url)
        : {
          url,
          valid: false,
          errorCode: 'invalid_url',
          message: errorMessage('invalid_url', url)
        }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(3, urls.length) }, () => worker())
  )
  return results
}
