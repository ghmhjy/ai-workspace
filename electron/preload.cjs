const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('localAI', {
  loadState: () => ipcRenderer.invoke('state-load'),
  saveState: (state) => ipcRenderer.invoke('state-save', state),
  getSystemContext: () => ipcRenderer.invoke('system-context'),
  copyText: (text) => ipcRenderer.invoke('clipboard-write', text),
  searchWeb: (query) => ipcRenderer.invoke('web-search', query),
  openWebPage: (url) => ipcRenderer.invoke('web-open', url),
  openInBrowser: (url) => ipcRenderer.invoke('web-open-window', url),
  chooseGraftFolder: () => ipcRenderer.invoke('graft-choose-folder'),
  buildGraft: (root) => ipcRenderer.invoke('graft-build', root),
  askGraft: (query, root) => ipcRenderer.invoke('graft-ask', query, root),
  chooseAttachments: () => ipcRenderer.invoke('choose-attachments'),
  exportConversationPdf: (payload) => ipcRenderer.invoke('export-conversation-pdf', payload),
  openPdfFile: (filePath) => ipcRenderer.invoke('open-pdf-file', filePath),
  listFolderFiles: (root) => ipcRenderer.invoke('list-folder-files', root),
  readTextFile: (root, relativePath) => ipcRenderer.invoke('read-text-file', root, relativePath),
  applyRenamePlan: (root, plan) => ipcRenderer.invoke('apply-rename-plan', root, plan),
  undoRenamePlan: () => ipcRenderer.invoke('undo-rename-plan'),
  applyFilePlan: (root, plan) => ipcRenderer.invoke('apply-file-plan', root, plan),
  undoFilePlan: () => ipcRenderer.invoke('undo-file-plan'),
  getAppVersion: () => ipcRenderer.invoke('app-version'),
  getUpdateDefaultPath: () => ipcRenderer.invoke('update-default-path'),
  chooseUpdateFolder: () => ipcRenderer.invoke('update-choose-folder'),
  checkForUpdate: (feedPath) => ipcRenderer.invoke('update-check', feedPath),
  installUpdate: (feedPath, installerPath) => ipcRenderer.invoke('update-install', feedPath, installerPath)
  ,checkGitHubUpdate: () => ipcRenderer.invoke('github-update-check')
  ,downloadGitHubUpdate: () => ipcRenderer.invoke('github-update-download')
  ,installGitHubUpdate: () => ipcRenderer.invoke('github-update-install')
  ,onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_event, status) => callback(status))
})
