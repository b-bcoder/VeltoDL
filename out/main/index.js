"use strict";
const electron = require("electron");
const node_path = require("node:path");
const promises = require("node:fs/promises");
const node_fs = require("node:fs");
const node_child_process = require("node:child_process");
const node_module = require("node:module");
const node_url = require("node:url");
const modes = /* @__PURE__ */ new Set(["audio", "video", "both"]);
const videoQualities = /* @__PURE__ */ new Set(["best", "1080", "720", "480", "360"]);
const audioQualities = /* @__PURE__ */ new Set(["best", "compact"]);
function validateSettings(value) {
  if (!value || typeof value !== "object") {
    throw new Error("Choose valid download settings.");
  }
  const settings = value;
  if (!modes.has(String(settings.mode))) {
    throw new Error("Choose audio, video, or audio and video.");
  }
  if (!videoQualities.has(String(settings.videoQuality))) {
    throw new Error("Choose a supported video quality.");
  }
  if (!audioQualities.has(String(settings.audioQuality))) {
    throw new Error("Choose a supported audio quality.");
  }
  return {
    mode: settings.mode,
    videoQuality: settings.videoQuality,
    audioQuality: settings.audioQuality
  };
}
const require$1 = node_module.createRequire(require("url").pathToFileURL(__filename).href);
function getYtDlpPath() {
  const packageEntry = require$1.resolve("youtube-dl-exec");
  const packageRoot = node_path.resolve(node_path.dirname(packageEntry), "..");
  const binaryName = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  const packagedBinary = node_path.join(packageRoot, "bin", binaryName);
  if (!electron.app.isPackaged) {
    return packagedBinary;
  }
  const unpackedBinary = packagedBinary.replace(/app\.asar([\\/])/, "app.asar.unpacked$1");
  const executable = node_fs.existsSync(unpackedBinary) ? unpackedBinary : packagedBinary;
  return node_path.resolve(node_path.dirname(node_url.fileURLToPath(require("url").pathToFileURL(__filename).href)), executable);
}
function buildYtDlpArgs(url, directory, settings) {
  const outputTemplate = node_path.join(directory, "%(title).200B [%(id)s].%(ext)s");
  const args = [
    "--no-playlist",
    "--newline",
    "--progress",
    "--no-warnings",
    "-o",
    outputTemplate
  ];
  if (settings.mode === "audio") {
    args.push("-f", "bestaudio");
    if (settings.audioQuality === "compact") {
      args.push("-S", "+abr");
    } else {
      args.push("-S", "abr");
    }
  } else if (settings.mode === "video") {
    const format = settings.videoQuality === "best" ? "bestvideo" : `bestvideo[height<=${settings.videoQuality}]`;
    args.push("-f", format);
  } else {
    const format = settings.videoQuality === "best" ? "best" : `best[height<=${settings.videoQuality}]`;
    args.push("-f", format);
  }
  args.push("--", url);
  return args;
}
function parseEta(value) {
  const match = value.match(/(?:(\d+):)?(\d{1,2}):(\d{1,2})/);
  if (!match) return null;
  return Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}
function safeError(stderr) {
  if (/ffmpeg.*(?:not found|not installed|not available)/i.test(stderr)) {
    return "This source needs FFmpeg to merge or convert streams, but FFmpeg is not available.";
  }
  if (/timed?\s*out|network|connection|urlopen error|temporary failure/i.test(stderr)) {
    return "A network error interrupted this download. Check your connection and try again.";
  }
  if (/requested format is not available|format is not available/i.test(stderr)) {
    return "The selected format is not available for this media.";
  }
  if (/private video|sign in|login required|http error 403/i.test(stderr)) {
    return "The source requires access that is not available to the downloader.";
  }
  return "The download failed. The media may be unavailable or no longer supported.";
}
class DownloadProcess {
  currentChild = null;
  cancelled = false;
  cancel() {
    this.cancelled = true;
    this.currentChild?.kill();
  }
  async run(urls, directory, settings, onProgress) {
    this.cancelled = false;
    const results = [];
    for (const item of urls) {
      if (this.cancelled) {
        results.push({ url: item.url, title: item.title, status: "cancelled" });
        continue;
      }
      onProgress({
        url: item.url,
        title: item.title,
        percent: 0,
        speed: null,
        etaSeconds: null,
        status: "starting"
      });
      const result = await this.downloadOne(item, directory, settings, onProgress);
      results.push(result);
    }
    return results;
  }
  downloadOne(item, directory, settings, onProgress) {
    return new Promise((resolve) => {
      const child = node_child_process.spawn(getYtDlpPath(), buildYtDlpArgs(item.url, directory, settings), {
        windowsHide: true
      });
      this.currentChild = child;
      let stderr = "";
      let pendingStdout = "";
      let pendingStderr = "";
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        this.currentChild = null;
        resolve(result);
      };
      const processOutput = (chunk, stream) => {
        const pending = stream === "stdout" ? pendingStdout : pendingStderr;
        const combined = pending + chunk;
        const lines = combined.split(/\r?\n/);
        const remainder = lines.pop() ?? "";
        if (stream === "stdout") pendingStdout = remainder;
        else pendingStderr = remainder;
        for (const line of lines) {
          const progressMatch = line.match(
            /\[download\]\s+([\d.]+)%.*?(?:\bat\s+(\S+))?.*?(?:\bETA\s+(\S+))?/i
          );
          if (!progressMatch) continue;
          onProgress({
            url: item.url,
            title: item.title,
            percent: Number(progressMatch[1]),
            speed: progressMatch[2] ?? null,
            etaSeconds: progressMatch[3] ? parseEta(progressMatch[3]) : null,
            status: "downloading"
          });
        }
      };
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => processOutput(chunk, "stdout"));
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        stderr = (stderr + chunk).slice(-16384);
        processOutput(chunk, "stderr");
      });
      child.once("error", () => {
        finish({
          url: item.url,
          title: item.title,
          status: "failed",
          error: "yt-dlp could not be started. Please restart the application."
        });
      });
      child.once("close", (code) => {
        if (this.cancelled) {
          onProgress({
            url: item.url,
            title: item.title,
            percent: null,
            speed: null,
            etaSeconds: null,
            status: "cancelled"
          });
          finish({ url: item.url, title: item.title, status: "cancelled" });
        } else if (code === 0) {
          onProgress({
            url: item.url,
            title: item.title,
            percent: 100,
            speed: null,
            etaSeconds: 0,
            status: "finished"
          });
          finish({ url: item.url, title: item.title, status: "success" });
        } else {
          const error = safeError(stderr);
          onProgress({
            url: item.url,
            title: item.title,
            percent: null,
            speed: null,
            etaSeconds: null,
            status: "failed",
            error
          });
          finish({ url: item.url, title: item.title, status: "failed", error });
        }
      });
    });
  }
}
const VALIDATION_TIMEOUT_MS = 45e3;
function classifyValidationError(stderr) {
  if (/timed?\s*out|connection|network|temporary failure|unable to connect|urlopen error|tls/i.test(stderr)) {
    return "network";
  }
  if (/unsupported url|no suitable extractor|not a valid url|unsupported url/i.test(stderr)) {
    return "rejected";
  }
  return "metadata";
}
function errorMessage(code, url) {
  switch (code) {
    case "network":
      return "There was a network error, please check your network connection and try again.";
    case "rejected":
      return `"${url}" couldn't be validated because yt-dlp refuses to download this URL`;
    case "metadata":
      return `"${url}" couldn't be validated because yt-dlp can't get the metadata of the URL`;
    case "invalid_url":
      return `"${url}" is not a valid HTTP or HTTPS URL.`;
    default:
      return "An unexpected error occurred. Please try again.";
  }
}
function parseUrls(input) {
  return [...new Set(input.split(/\r?\n/).map((value) => value.trim()).filter(Boolean))];
}
function validateUrlSyntax(url) {
  try {
    const parsed = new URL(url);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.hostname.length > 0 && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}
function validateWithYtDlp(url) {
  return new Promise((resolve) => {
    const child = node_child_process.spawn(
      getYtDlpPath(),
      ["--skip-download", "--no-playlist", "--no-warnings", "--no-progress", "--print", "%(title)s", "--", url],
      { windowsHide: true }
    );
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    const timeout = setTimeout(() => {
      child.kill();
      finish({
        url,
        valid: false,
        errorCode: "network",
        message: errorMessage("network", url)
      });
    }, VALIDATION_TIMEOUT_MS);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (data) => {
      stdout = (stdout + data).slice(-16384);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (data) => {
      stderr = (stderr + data).slice(-16384);
    });
    child.once("error", () => {
      finish({
        url,
        valid: false,
        errorCode: "unexpected",
        message: "yt-dlp could not be started. Please restart the application."
      });
    });
    child.once("close", (code) => {
      const title = stdout.trim().split(/\r?\n/).find(Boolean);
      if (code === 0 && title) {
        finish({ url, valid: true, title });
        return;
      }
      const errorCode = classifyValidationError(stderr);
      finish({ url, valid: false, errorCode, message: errorMessage(errorCode, url) });
    });
  });
}
async function validateUrls(input) {
  const urls = parseUrls(input);
  const results = new Array(urls.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < urls.length) {
      const index = nextIndex++;
      const url = urls[index];
      results[index] = validateUrlSyntax(url) ? await validateWithYtDlp(url) : {
        url,
        valid: false,
        errorCode: "invalid_url",
        message: errorMessage("invalid_url", url)
      };
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(3, urls.length) }, () => worker())
  );
  return results;
}
const defaultSettings = {
  mode: "both",
  videoQuality: "best",
  audioQuality: "best"
};
function timestamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}-${pad(date.getMinutes())}`;
}
function reportText(results, urls, directory, settings, startedAt, endedAt) {
  const successful = results.filter((result) => result.status === "success");
  const failed = results.filter((result) => result.status === "failed");
  const cancelled = results.filter((result) => result.status === "cancelled");
  const status = failed.length || cancelled.length ? "Fault" : "Succes";
  const lines = [
    `Result: ${status}`,
    `Started: ${startedAt.toLocaleString()}`,
    `Finished: ${endedAt.toLocaleString()}`,
    `Download location: ${directory}`,
    `Options: ${settings.mode}; video quality ${settings.videoQuality}; audio quality ${settings.audioQuality}`,
    `Successful: ${successful.length}`,
    `Failed: ${failed.length}`,
    `Cancelled: ${cancelled.length}`,
    "",
    "URLs:"
  ];
  for (const url of urls) {
    const result = results.find((entry) => entry.url === url.url);
    const title = url.title || result?.title;
    lines.push(`- ${title ? `${title} — ` : ""}${url.url}: ${result?.status ?? "not processed"}${result?.error ? ` — ${result.error}` : ""}`);
  }
  return `${lines.join("\r\n")}\r
`;
}
class LocalProcessor {
  constructor(events) {
    this.events = events;
  }
  downloadDirectory = null;
  settings = defaultSettings;
  validation = [];
  validatedInput = null;
  busy = false;
  activeDownload = null;
  getState() {
    return {
      downloadDirectory: this.downloadDirectory,
      settings: this.settings,
      validation: this.validation,
      busy: this.busy
    };
  }
  publishState() {
    this.events.onState(this.getState());
  }
  async chooseFolder(parent) {
    if (this.busy) return this.getState();
    const result = await electron.dialog.showOpenDialog(parent, {
      title: "Choose download folder",
      properties: ["openDirectory", "createDirectory"]
    });
    if (!result.canceled && result.filePaths[0]) {
      await this.assertWritableDirectory(result.filePaths[0]);
      this.downloadDirectory = result.filePaths[0];
      this.publishState();
    }
    return this.getState();
  }
  async validate(input) {
    if (this.busy) throw new Error("Wait for the current download to finish before validating URLs.");
    this.validatedInput = input;
    this.validation = await validateUrls(input);
    this.publishState();
    return this.validation;
  }
  setSettings(value) {
    if (this.busy) throw new Error("Download options cannot be changed during an active download.");
    this.settings = validateSettings(value);
    this.publishState();
    return this.getState();
  }
  async start(input, value) {
    if (this.busy) throw new Error("A download is already running.");
    if (input !== this.validatedInput) {
      throw new Error("Check the current URLs before starting the download.");
    }
    const settings = validateSettings(value);
    if (!this.downloadDirectory) {
      throw new Error("Choose a download folder before starting.");
    }
    await this.assertWritableDirectory(this.downloadDirectory);
    const validUrls = this.validation.filter((result) => result.valid);
    if (validUrls.length === 0) {
      throw new Error("Check at least one supported URL before starting.");
    }
    this.settings = settings;
    this.busy = true;
    this.publishState();
    const startedAt = /* @__PURE__ */ new Date();
    const process2 = new DownloadProcess();
    this.activeDownload = process2;
    try {
      const downloadedResults = await process2.run(
        validUrls,
        this.downloadDirectory,
        settings,
        (progress) => this.events.onProgress(progress)
      );
      const results = this.validation.map((item) => item.valid ? downloadedResults.find((result) => result.url === item.url) ?? {
        url: item.url,
        title: item.title,
        status: "failed",
        error: "The URL was not processed."
      } : {
        url: item.url,
        title: item.title,
        status: "failed",
        error: item.message ?? "The URL could not be validated."
      });
      const endedAt = /* @__PURE__ */ new Date();
      const report = await this.writeReport(
        results,
        this.validation,
        this.downloadDirectory,
        settings,
        startedAt,
        endedAt
      );
      this.events.onComplete(report);
    } finally {
      this.activeDownload = null;
      this.busy = false;
      this.publishState();
    }
  }
  cancel() {
    this.activeDownload?.cancel();
  }
  async assertWritableDirectory(directory) {
    try {
      const details = await promises.stat(directory);
      if (!details.isDirectory()) {
        throw new Error("The selected download location is not a folder.");
      }
      await promises.access(directory, node_fs.constants.W_OK);
    } catch (error) {
      if (error instanceof Error && error.message === "The selected download location is not a folder.") {
        throw error;
      }
      throw new Error("The selected download folder is unavailable or not writable. Choose another folder.");
    }
  }
  async writeReport(results, urls, directory, settings, startedAt, endedAt) {
    const logsDirectory = node_path.join(electron.app.getPath("documents"), "VDownloader_Logs");
    try {
      await promises.mkdir(logsDirectory, { recursive: true });
      const hasFault = results.some((result) => result.status !== "success");
      const prefix = hasFault ? "Fault" : "Succes";
      const base = `${prefix} ${timestamp(endedAt)}`;
      const body = reportText(results, urls, directory, settings, startedAt, endedAt);
      let suffix = 0;
      while (true) {
        const filename = `${base}${suffix ? ` (${suffix})` : ""}.txt`;
        const reportPath = node_path.join(logsDirectory, filename);
        try {
          await promises.writeFile(reportPath, body, { encoding: "utf8", flag: "wx" });
          return { results, reportPath };
        } catch (error) {
          if (error.code !== "EEXIST") throw error;
          suffix += 1;
        }
      }
    } catch (error) {
      console.error("Could not save the VDownloader report.", error);
      return {
        results,
        reportPath: null,
        reportError: "The download finished, but the report could not be saved in Documents\\VDownloader_Logs. Check folder permissions and available disk space."
      };
    }
  }
}
let mainWindow = null;
function send(channel, value) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, value);
  }
}
const processor = new LocalProcessor({
  onState: (state) => send("app:state", state),
  onProgress: (progress) => send("download:progress", progress),
  onComplete: (result) => send("download:complete", result)
});
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1040,
    height: 800,
    minWidth: 760,
    minHeight: 640,
    title: "Video Downloader",
    backgroundColor: "#0c111b",
    webPreferences: {
      preload: node_path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(node_path.join(__dirname, "../renderer/index.html"));
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
function registerHandlers() {
  electron.ipcMain.handle("app:get-state", () => processor.getState());
  electron.ipcMain.handle("folder:choose", (_event) => {
    if (!mainWindow) throw new Error("The application window is unavailable.");
    return processor.chooseFolder(mainWindow);
  });
  electron.ipcMain.handle("urls:validate", (_event, input) => {
    if (typeof input !== "string") throw new Error("Enter one or more URLs.");
    return processor.validate(input);
  });
  electron.ipcMain.handle(
    "settings:set",
    (_event, settings) => processor.setSettings(settings)
  );
  electron.ipcMain.handle("download:start", async (_event, input, settings) => {
    if (typeof input !== "string") throw new Error("Check the current URLs before starting.");
    await processor.start(input, settings);
  });
  electron.ipcMain.handle("download:cancel", () => processor.cancel());
}
electron.app.whenReady().then(() => {
  registerHandlers();
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
electron.app.on("before-quit", () => processor.cancel());
