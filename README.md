# Video Downloader

A Windows desktop app built with Electron, React, TypeScript, and yt-dlp.

## Run locally

1. Install Node.js 20 or newer.
2. Run `npm install`. The `youtube-dl-exec` install script downloads the latest yt-dlp Windows executable from the official yt-dlp GitHub release.
3. Run `npm run dev`.

## Build a Windows installer

Run `npm run package:win`. The installer is written to `release/`, and the yt-dlp executable is included with the app.

## Current format behavior

- **Audio only** downloads the best available audio stream in its original format. Compact mode prefers lower-bitrate source streams.
- **Video only** downloads a video-only stream up to the selected maximum resolution.
- **Video + audio** selects a single combined stream up to the selected maximum resolution.
- Merging separate audio/video streams and converting audio formats are not enabled in this first version; those operations require FFmpeg.

URL checks only read media metadata; they do not download media. Downloads are processed one URL at a time. If any URL fails or is cancelled, the app writes a `Fault` report; otherwise it writes a `Succes` report under `Documents\VDownloader_Logs`.

## Third-party software

This application bundles [yt-dlp](https://github.com/yt-dlp/yt-dlp), a separate media-downloading program. The yt-dlp project publishes its software under [The Unlicense](https://github.com/yt-dlp/yt-dlp/blob/master/LICENSE), the public-domain dedication and license text reproduced below. yt-dlp is not code written for this application.

The application also uses [`youtube-dl-exec`](https://github.com/microlinkhq/youtube-dl-exec), an MIT-licensed Node.js wrapper. Its license is available in `node_modules/youtube-dl-exec/LICENSE.md` after installing dependencies.

Because the installer downloads the latest yt-dlp release during dependency installation, the bundled yt-dlp version may change between builds. Check the applicable licenses and notices when preparing each release.
