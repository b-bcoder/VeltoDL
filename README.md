# VeltoDL

VeltoDL is a simple Windows app for saving audio and video from supported links. Paste in one or more URLs, choose what you want to download, and save it to a folder on your computer.

No command line or complicated setup is needed. Check your links before downloading, choose audio or video and the quality that suits you, then follow each download's progress in the app.

## Why use VeltoDL?

- **Straightforward to use:** add links, choose your options, and download from one place.
- **Download your way:** choose audio, video, or a combined stream, and set a maximum video resolution.
- **Handle multiple links:** check several URLs and process them in one job.
- **Choose where files go:** save downloads to a folder you select.
- **See what's happening:** track progress, speed, and estimated time, or cancel an active job.

Downloads are saved on your computer. The app connects to the relevant online sources to check links and retrieve media. Available formats depend on each source; combining separate audio and video streams or converting audio formats is not currently supported.

## Install

Download the latest **VeltoDL setup** from [GitHub Releases](https://github.com/b-bcoder/VeltoDL/releases/latest) and run the installer.

## For developers

Requires Node.js 20 or newer. Run `npm install` and then `npm run dev` to start the app locally. To build a Windows installer, run `npm run package:win`; it will be created in `release/`.

Video Downloader uses [yt-dlp](https://github.com/yt-dlp/yt-dlp). See [THIRD_PARTY_NOTICES.txt](./THIRD_PARTY_NOTICES.txt) for third-party notices.
