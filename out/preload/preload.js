"use strict";
const electron = require("electron");
const api = {
  getState: () => electron.ipcRenderer.invoke("app:get-state"),
  chooseFolder: () => electron.ipcRenderer.invoke("folder:choose"),
  validateUrls: (input) => electron.ipcRenderer.invoke("urls:validate", input),
  setSettings: (settings) => electron.ipcRenderer.invoke("settings:set", settings),
  startDownload: (input, settings) => electron.ipcRenderer.invoke("download:start", input, settings),
  cancelDownload: () => electron.ipcRenderer.invoke("download:cancel"),
  onState: (listener) => subscribe("app:state", listener),
  onProgress: (listener) => subscribe("download:progress", listener),
  onComplete: (listener) => subscribe("download:complete", listener)
};
function subscribe(channel, listener) {
  const wrapped = (_event, value) => listener(value);
  electron.ipcRenderer.on(channel, wrapped);
  return () => electron.ipcRenderer.removeListener(channel, wrapped);
}
electron.contextBridge.exposeInMainWorld("videoDownloader", api);
