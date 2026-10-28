import { useEffect, useMemo, useState } from 'react'
import type {
  AppState,
  DownloadProgress,
  DownloadSettings,
  JobResult,
  ValidationResult
} from '../src/shared/types'

const initialState: AppState = {
  downloadDirectory: null,
  settings: { mode: 'both', videoQuality: 'best', audioQuality: 'best' },
  validation: [],
  busy: false
}

function formatEta(seconds: number | null): string {
  if (seconds === null) return 'Estimating…'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

function validationMessage(result: ValidationResult): string {
  if (result.message) return result.message
  return result.valid ? 'Ready to download' : 'An unexpected error occurred. Please try again.'
}

export default function UI() {
  const [appState, setAppState] = useState(initialState)
  const [urlInput, setUrlInput] = useState('')
  const [settings, setSettings] = useState(initialState.settings)
  const [progress, setProgress] = useState<DownloadProgress[]>([])
  const [notice, setNotice] = useState('')
  const [checking, setChecking] = useState(false)
  const [lastResult, setLastResult] = useState<JobResult | null>(null)

  useEffect(() => {
    let mounted = true
    void window.videoDownloader.getState().then((state) => {
      if (mounted) {
        setAppState(state)
        setSettings(state.settings)
      }
    }).catch((error: unknown) => {
      if (mounted) setNotice(error instanceof Error ? error.message : 'Could not load application state.')
    })

    const unsubscribeState = window.videoDownloader.onState(setAppState)
    const unsubscribeProgress = window.videoDownloader.onProgress((update) => {
      setProgress((current) => [
        ...current.filter((item) => item.url !== update.url),
        update
      ])
    })
    const unsubscribeComplete = window.videoDownloader.onComplete((result) => {
      setLastResult(result)
      const successful = result.results.filter((item) => item.status === 'success').length
      const failed = result.results.filter((item) => item.status === 'failed').length
      const cancelled = result.results.filter((item) => item.status === 'cancelled').length
      const summary = `${successful} successful, ${failed} failed, ${cancelled} cancelled.`
      setNotice(result.reportError ?? `${summary}${result.reportPath ? ` Report saved to ${result.reportPath}` : ''}`)
    })
    return () => {
      mounted = false
      unsubscribeState()
      unsubscribeProgress()
      unsubscribeComplete()
    }
  }, [])

  const validCount = useMemo(
    () => appState.validation.filter((result) => result.valid).length,
    [appState.validation]
  )
  const hasCurrentValidation = appState.validation.length > 0 && urlInput.trim().length > 0
  const canDownload = Boolean(
    appState.downloadDirectory &&
    hasCurrentValidation &&
    validCount > 0 &&
    !appState.busy &&
    !checking
  )

  const chooseFolder = async () => {
    setNotice('')
    try {
      const state = await window.videoDownloader.chooseFolder()
      setAppState(state)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not select that folder.')
    }
  }

  const checkUrls = async () => {
    setChecking(true)
    setNotice('')
    setLastResult(null)
    setProgress([])
    try {
      if (!urlInput.trim()) {
        throw new Error('Enter at least one URL.')
      }
      const results = await window.videoDownloader.validateUrls(urlInput)
      if (results.length === 0) throw new Error('Enter at least one URL.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not validate the URLs.')
    } finally {
      setChecking(false)
    }
  }

  const updateSettings = async (next: DownloadSettings) => {
    setSettings(next)
    try {
      const state = await window.videoDownloader.setSettings(next)
      setAppState(state)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not save these options.')
    }
  }

  const startDownload = async () => {
    setNotice('')
    setProgress([])
    setLastResult(null)
    try {
      await window.videoDownloader.startDownload(urlInput, settings)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not start the download.')
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">V</div>
        <div>
          <p className="eyebrow">PERSONAL MEDIA TOOL</p>
          <h1>Video Downloader</h1>
        </div>
        <span className={`engine-status ${appState.busy ? 'active' : ''}`}>
          <span className="status-dot" />
          {appState.busy ? 'Working' : 'Ready'}
        </span>
      </header>

      <section className="intro">
        <div>
          <p className="eyebrow">DOWNLOAD WORKSPACE</p>
          <h2>Bring your media<br /><span>within reach.</span></h2>
        </div>
        <p className="intro-copy">
          Add one link per line. We will check each URL before anything is downloaded.
        </p>
      </section>

      {notice && (
        <div className="notice" role="status">
          <span>{notice}</span>
          <button className="dismiss-button" aria-label="Dismiss message" onClick={() => setNotice('')}>×</button>
        </div>
      )}

      <div className="workspace-grid">
        <section className="card url-card">
          <div className="card-heading">
            <div className="step-number">01</div>
            <div>
              <p className="eyebrow">SOURCE</p>
              <h3>Paste your links</h3>
            </div>
          </div>
          <label className="field-label" htmlFor="url-input">Video or audio URLs</label>
          <textarea
            id="url-input"
            className="url-input"
            placeholder={'https://example.com/video\nhttps://example.com/another-video'}
            value={urlInput}
            disabled={appState.busy}
            onChange={(event) => {
              setUrlInput(event.target.value)
              setAppState((current) => ({ ...current, validation: [] }))
              setLastResult(null)
            }}
          />
          <div className="url-footer">
            <span className="helper-text">HTTP and HTTPS links · one URL per line</span>
            <button className="button button-secondary" disabled={checking || appState.busy} onClick={() => void checkUrls()}>
              {checking ? <><span className="spinner" /> Checking</> : 'Check links'}
            </button>
          </div>
          {appState.validation.length > 0 && (
            <ul className="validation-list">
              {appState.validation.map((item) => (
                <li className={item.valid ? 'validation-item valid' : 'validation-item invalid'} key={item.url}>
                  <span className="validation-icon">{item.valid ? '✓' : '!'}</span>
                  <span className="validation-copy">
                    <strong>{item.title || item.url}</strong>
                    <small>{validationMessage(item)}</small>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card options-card">
          <div className="card-heading">
            <div className="step-number">02</div>
            <div>
              <p className="eyebrow">PREFERENCES</p>
              <h3>Choose your format</h3>
            </div>
          </div>

          <fieldset disabled={!appState.downloadDirectory || appState.busy} className="options-fieldset">
            <legend className="field-label">Download type</legend>
            <div className="mode-options">
              {([
                ['both', 'Video + audio', 'Combined stream'],
                ['video', 'Video only', 'Picture, no sound'],
                ['audio', 'Audio only', 'Best available audio']
              ] as const).map(([mode, label, detail]) => (
                <button
                  type="button"
                  className={`mode-option ${settings.mode === mode ? 'selected' : ''}`}
                  key={mode}
                  onClick={() => void updateSettings({ ...settings, mode })}
                >
                  <span className="radio-indicator" />
                  <span><strong>{label}</strong><small>{detail}</small></span>
                </button>
              ))}
            </div>

            {settings.mode !== 'audio' ? (
              <label className="select-label">
                <span className="field-label">Maximum video resolution</span>
                <select
                  value={settings.videoQuality}
                  onChange={(event) => void updateSettings({
                    ...settings,
                    videoQuality: event.target.value as DownloadSettings['videoQuality']
                  })}
                >
                  <option value="best">Best available</option>
                  <option value="1080">Up to 1080p</option>
                  <option value="720">Up to 720p</option>
                  <option value="480">Up to 480p</option>
                  <option value="360">Up to 360p</option>
                </select>
              </label>
            ) : (
              <label className="select-label">
                <span className="field-label">Audio quality</span>
                <select
                  value={settings.audioQuality}
                  onChange={(event) => void updateSettings({
                    ...settings,
                    audioQuality: event.target.value as DownloadSettings['audioQuality']
                  })}
                >
                  <option value="best">Best available</option>
                  <option value="compact">Compact (lower bitrate)</option>
                </select>
              </label>
            )}
          </fieldset>

          {!appState.downloadDirectory && (
            <p className="disabled-hint">Choose an output folder to unlock download options.</p>
          )}
          <p className="quality-note">
            Downloads use formats provided by the source. Combining separate streams or converting audio may require FFmpeg.
          </p>
        </section>
      </div>

      <section className="card destination-card">
        <div className="card-heading compact-heading">
          <div className="step-number">03</div>
          <div>
            <p className="eyebrow">DESTINATION</p>
            <h3>Save to your device</h3>
          </div>
        </div>
        <div className="destination-row">
          <div className="folder-icon" aria-hidden="true">▰</div>
          <div className="destination-copy">
            <strong>{appState.downloadDirectory ? 'Output folder' : 'No folder selected'}</strong>
            <span title={appState.downloadDirectory ?? undefined}>
              {appState.downloadDirectory ?? 'Choose a folder for your downloads'}
            </span>
          </div>
          <button className="button button-secondary" disabled={appState.busy} onClick={() => void chooseFolder()}>
            {appState.downloadDirectory ? 'Change folder' : 'Choose folder'}
          </button>
        </div>
      </section>

      {(progress.length > 0 || lastResult) && (
        <section className="card progress-card">
          <div className="card-heading compact-heading">
            <div className="step-number">04</div>
            <div>
              <p className="eyebrow">DOWNLOAD STATUS</p>
              <h3>{appState.busy ? 'Downloading your media' : 'Latest download'}</h3>
            </div>
          </div>
          <div className="progress-list">
            {progress.map((item) => {
              const result = lastResult?.results.find((entry) => entry.url === item.url)
              const percent = item.percent === null ? 0 : item.percent
              return (
                <div className="progress-item" key={item.url}>
                  <div className="progress-title-row">
                    <strong>{item.title || item.url}</strong>
                    <span className={`progress-state ${item.status}`}>{result?.status ?? item.status}</span>
                  </div>
                  <div className="progress-track"><span style={{ width: `${percent}%` }} /></div>
                  <div className="progress-meta">
                    <span>{item.percent === null ? 'Progress unavailable' : `${percent.toFixed(1)}%`}</span>
                    <span>{item.speed ?? '—'}</span>
                    <span>ETA {formatEta(item.etaSeconds)}</span>
                  </div>
                  {item.error && <p className="progress-error">{item.error}</p>}
                </div>
              )
            })}
          </div>
        </section>
      )}

      <footer className="action-bar">
        <div className="action-summary">
          <span className={`summary-dot ${canDownload ? 'ready' : ''}`} />
          <span>
            {appState.busy
              ? 'Your downloads are being processed'
              : appState.downloadDirectory
                ? `${validCount} checked link${validCount === 1 ? '' : 's'} ready`
                : 'Choose a folder to get started'}
          </span>
        </div>
        {appState.busy ? (
          <button className="button button-danger" onClick={() => void window.videoDownloader.cancelDownload()}>
            Cancel downloads
          </button>
        ) : (
          <button className="button button-primary" disabled={!canDownload} onClick={() => void startDownload()}>
            Download {validCount > 0 ? `${validCount} item${validCount === 1 ? '' : 's'}` : ''}
            <span aria-hidden="true">→</span>
          </button>
        )}
      </footer>
    </main>
  )
}
