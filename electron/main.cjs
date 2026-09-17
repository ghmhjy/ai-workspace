const { app, BrowserWindow, clipboard, dialog, ipcMain, session, shell } = require('electron')
const { autoUpdater } = require('electron-updater')
const { existsSync } = require('node:fs')
const fs = require('node:fs/promises')
const { spawn } = require('node:child_process')
const { execFile } = require('node:child_process')
const http = require('node:http')
const path = require('node:path')

const isDev = process.env.LOCAL_AI_DEV === '1'
let stateWriteQueue = Promise.resolve()
let mainWindow = null
let lastRenameOperation = null
let lastFileOperation = null

function stateFilePath() {
  return path.join(app.getPath('userData'), 'local-ai-state.json')
}

function defaultUpdateFeedPath() {
  return path.join(app.getPath('documents'), 'Codex', '2026-09-16', 'ai-ornith', 'outputs', 'release')
}

function versionParts(value) {
  const match = String(value || '').match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/)
  return match ? match.slice(1, 4).map(Number) : [0, 0, 0]
}

function compareVersions(left, right) {
  const a = versionParts(left); const b = versionParts(right)
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] - b[index]
  return 0
}

async function checkForUpdate(feedPath) {
  const root = path.resolve(String(feedPath || defaultUpdateFeedPath()))
  if (!existsSync(root)) return { currentVersion: app.getVersion(), available: false, feedPath: root, reason: 'Update feed folder was not found.' }
  const entries = await fs.readdir(root, { withFileTypes: true })
  const candidates = entries
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const match = entry.name.match(/^(?:Forge AI|Local AI) Setup (\d+\.\d+\.\d+)(?:-[^.]*)?\.exe$/i)
      return match ? { version: match[1], installerPath: path.join(root, entry.name), name: entry.name } : null
    })
    .filter(Boolean)
    .sort((left, right) => compareVersions(right.version, left.version))
  const latest = candidates[0]
  return { currentVersion: app.getVersion(), available: Boolean(latest && compareVersions(latest.version, app.getVersion()) > 0), feedPath: root, ...(latest || {}) }
}

function isSafeUpdateInstaller(root, installerPath) {
  const base = path.resolve(root)
  const target = path.resolve(installerPath)
  const relative = path.relative(base, target)
  return path.extname(target).toLowerCase() === '.exe' && !relative.startsWith('..') && !path.isAbsolute(relative) && /^(?:Forge AI|Local AI) Setup \d+\.\d+\.\d+(?:-[^.]*)?\.exe$/i.test(path.basename(target))
}

function installUpdate(feedPath, installerPath) {
  const root = path.resolve(String(feedPath || defaultUpdateFeedPath()))
  const target = path.resolve(String(installerPath || ''))
  if (!isSafeUpdateInstaller(root, target) || !existsSync(target)) throw new Error('The selected update installer is invalid or unavailable')
  const child = spawn(target, ['/S'], { detached: true, windowsHide: true, stdio: 'ignore' })
  child.unref()
  setTimeout(() => app.quit(), 700)
  return { started: true, version: target.match(/(?:Forge AI|Local AI) Setup (\d+\.\d+\.\d+)/i)?.[1] || null }
}

function sendUpdateStatus(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-status', payload)
}

async function checkGitHubUpdate() {
  if (!app.isPackaged) return { available: false, currentVersion: app.getVersion(), reason: 'GitHub updates are available in the installed application.' }
  const result = await autoUpdater.checkForUpdates()
  const info = result?.updateInfo
  return { available: Boolean(info && compareVersions(info.version, app.getVersion()) > 0), currentVersion: app.getVersion(), version: info?.version || null, releaseName: info?.releaseName || null }
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.on('checking-for-update', () => sendUpdateStatus({ type: 'checking' }))
  autoUpdater.on('update-available', (info) => sendUpdateStatus({ type: 'available', version: info.version, releaseName: info.releaseName || '' }))
  autoUpdater.on('update-not-available', (info) => sendUpdateStatus({ type: 'current', version: info.version || app.getVersion() }))
  autoUpdater.on('download-progress', (progress) => sendUpdateStatus({ type: 'progress', percent: progress.percent, bytesPerSecond: progress.bytesPerSecond, transferred: progress.transferred, total: progress.total }))
  autoUpdater.on('update-downloaded', (info) => sendUpdateStatus({ type: 'downloaded', version: info.version }))
  autoUpdater.on('error', (error) => sendUpdateStatus({ type: 'error', message: error instanceof Error ? error.message : String(error) }))
  if (app.isPackaged) setTimeout(() => { checkGitHubUpdate().catch((error) => sendUpdateStatus({ type: 'error', message: error instanceof Error ? error.message : String(error) })) }, 5000)
}

function getSystemContext() {
  const now = new Date()
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  return {
    localDateTime: new Intl.DateTimeFormat('ko-KR', { dateStyle: 'full', timeStyle: 'long', timeZone }).format(now),
    weekday: new Intl.DateTimeFormat('ko-KR', { weekday: 'long', timeZone }).format(now),
    timeZone,
    isoTimestamp: now.toISOString(),
    locale: app.getLocale()
  }
}

function cleanSearchText(value) {
  return value.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()
}

async function searchDuckDuckGo(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  const response = await fetch(url, { headers: { 'User-Agent': 'Local-AI/0.1' } })
  if (!response.ok) throw new Error(`Search request failed (${response.status})`)
  const html = await response.text()
  const results = []
  const pattern = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
  for (const match of html.matchAll(pattern)) {
    if (results.length >= 5) break
    let resultUrl = match[1]
    if (resultUrl.startsWith('//')) resultUrl = `https:${resultUrl}`
    try {
      const parsed = new URL(resultUrl)
      const redirected = parsed.searchParams.get('uddg')
      if (redirected) resultUrl = redirected
    } catch {}
    results.push({ title: cleanSearchText(match[2]), url: resultUrl })
  }
  return results
}

function extractPageText(html) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const withoutNoise = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
  return {
    title: cleanSearchText(titleMatch?.[1] || ''),
    text: cleanSearchText(withoutNoise).slice(0, 12000)
  }
}

async function fetchWebPage(parsed) {
  const response = await fetch(parsed, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36', Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.8,ko;q=0.7' } })
  if (!response.ok) throw new Error(`Page request failed (${response.status})`)
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('text/html')) throw new Error('The result is not an HTML page')
  return { url: response.url, ...extractPageText(await response.text()) }
}

async function readPageWithBrowser(parsed) {
  const reader = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  try {
    await reader.loadURL(parsed.toString(), { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36' })
    const page = await reader.webContents.executeJavaScript(`({ title: document.title, text: document.body ? document.body.innerText : '' })`)
    const text = cleanSearchText(page.text || '').slice(0, 12000)
    if (text.length < 80) throw new Error('The browser page did not expose readable text')
    return { url: reader.webContents.getURL(), title: cleanSearchText(page.title || ''), text }
  } finally {
    if (!reader.isDestroyed()) reader.destroy()
  }
}

async function openWebPage(url) {
  const parsed = new URL(url)
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only web pages can be opened')
  try { return await fetchWebPage(parsed) } catch { return await readPageWithBrowser(parsed) }
}

function openBrowserWindow(url, parent) {
  const browserWindow = new BrowserWindow({
    width: 1060,
    height: 760,
    minWidth: 720,
    minHeight: 520,
    parent,
    title: 'Forge AI — Web viewer',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  browserWindow.webContents.setWindowOpenHandler(({ url: nextUrl }) => {
    try {
      const next = new URL(nextUrl)
      return ['http:', 'https:'].includes(next.protocol) ? { action: 'allow' } : { action: 'deny' }
    } catch { return { action: 'deny' } }
  })
  browserWindow.loadURL(url)
}

function graftCliPath() {
  return path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@nanonets', 'graft', 'dist', 'cli.js')
}

function nodeCliPath() {
  const candidates = [
    path.join(process.env.ProgramFiles || '', 'nodejs', 'node.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'node.exe')
  ]
  return candidates.find((candidate) => existsSync(candidate)) || process.execPath
}

function runGraft(args, root, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    if (!existsSync(root)) { reject(new Error('The selected Graft folder does not exist')); return }
    const cli = graftCliPath()
    if (!existsSync(cli)) { reject(new Error('Graft CLI was not found in the global npm installation')); return }
    const child = spawn(nodeCliPath(), [cli, ...args, root], { cwd: root, windowsHide: true })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error('Graft timed out')) }, timeoutMs)
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', (error) => { clearTimeout(timer); reject(error) })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) { reject(new Error(stderr.trim() || stdout.trim() || `Graft exited with code ${code}`)); return }
      resolve(stdout.trim())
    })
  })
}

async function buildGraft(root) {
  return runGraft(['build', '--allow-partial'], root)
}

async function askGraft(query, root) {
  const output = await runGraft(['ask', '--json', '--source', '--limit', '8', query], root, 30000)
  try { return JSON.parse(output) } catch { return { text: output } }
}

function attachmentKind(filePath) {
  const extension = path.extname(filePath).toLowerCase()
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(extension)) return 'image'
  if (extension === '.pdf') return 'pdf'
  if (['.doc', '.docx', '.odt', '.rtf'].includes(extension)) return 'document'
  if (['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg'].includes(extension)) return 'audio'
  return 'file'
}

function isPlainTextFile(filePath) {
  return ['.txt', '.md', '.json', '.csv', '.html', '.xml', '.js', '.jsx', '.ts', '.tsx', '.py', '.css', '.scss', '.yaml', '.yml'].includes(path.extname(filePath).toLowerCase())
}

function imageMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase()
  return ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp' })[extension] || 'application/octet-stream'
}

function extractPdfText(filePath) {
  return new Promise((resolve) => {
    execFile('pdftotext', [filePath, '-'], { windowsHide: true, maxBuffer: 2 * 1024 * 1024 }, (error, stdout) => resolve(error ? '' : stdout.slice(0, 12000)))
  })
}

async function chooseAttachments() {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Supported files', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'json', 'csv', 'html', 'xml', 'js', 'jsx', 'ts', 'tsx', 'py', 'css', 'mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'] }]
  })
  if (result.canceled) return []
  return Promise.all(result.filePaths.map(async (filePath) => {
    const stat = await fs.stat(filePath)
    const kind = attachmentKind(filePath)
    let text = ''
    let dataUrl = ''
    if (kind === 'image' && stat.size <= 20 * 1024 * 1024) {
      dataUrl = `data:${imageMimeType(filePath)};base64,${(await fs.readFile(filePath)).toString('base64')}`
    }
    if (kind === 'pdf') text = await extractPdfText(filePath)
    else if (isPlainTextFile(filePath)) {
      try { text = (await fs.readFile(filePath, 'utf8')).slice(0, 12000) } catch {}
    }
    return { name: path.basename(filePath), type: kind, size: stat.size, readable: Boolean(text || dataUrl), dataUrl, text }
  }))
}

async function listFolderFiles(root) {
  const base = path.resolve(String(root || ''))
  if (!existsSync(base)) throw new Error('The selected file-operation folder does not exist')
  const ignored = new Set(['.git', 'node_modules', 'graft', 'dist', 'outputs', '$Recycle.Bin', 'System Volume Information', 'Windows', 'Program Files', 'Program Files (x86)', 'ProgramData', 'Recovery', 'PerfLogs', 'Config.Msi'])
  const files = []
  async function walk(current, depth) {
    if (depth > 5 || files.length >= 500) return
    let entries
    try { entries = await fs.readdir(current, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || ignored.has(entry.name)) continue
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) await walk(fullPath, depth + 1)
      else files.push(path.relative(base, fullPath).replaceAll(path.sep, '/'))
    }
  }
  await walk(base, 0)
  return files.sort()
}

async function readTextFile(root, relativePath) {
  const target = safeChildPath(path.resolve(String(root || '')), relativePath)
  const stat = await fs.stat(target)
  if (!stat.isFile()) throw new Error('The requested path is not a file')
  if (!isPlainTextFile(target)) throw new Error('Only plain-text files can be read by the local model')
  return { path: path.relative(path.resolve(root), target).replaceAll(path.sep, '/'), size: stat.size, text: (await fs.readFile(target, 'utf8')).slice(0, 12000) }
}

function safeChildPath(root, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath.trim() || path.isAbsolute(relativePath)) throw new Error('Rename paths must be relative to the selected folder')
  const base = path.resolve(root)
  const target = path.resolve(base, relativePath)
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) throw new Error('A rename path escaped the selected folder')
  return target
}

async function applyRenamePlan(root, plan) {
  const base = path.resolve(String(root || ''))
  const renames = Array.isArray(plan) ? plan.slice(0, 100) : []
  if (!renames.length) throw new Error('The rename plan is empty')
  const prepared = renames.map((item) => ({ from: String(item.from || ''), to: String(item.to || '') }))
  const sourcePaths = prepared.map((item) => safeChildPath(base, item.from))
  const targetPaths = prepared.map((item) => safeChildPath(base, item.to))
  if (new Set(targetPaths).size !== targetPaths.length) throw new Error('The rename plan contains duplicate destinations')
  for (let index = 0; index < prepared.length; index += 1) {
    if (sourcePaths[index] === targetPaths[index]) throw new Error('The rename plan contains an unchanged filename')
    if (!existsSync(sourcePaths[index])) throw new Error(`Source file not found: ${prepared[index].from}`)
    if (existsSync(targetPaths[index])) throw new Error(`Destination already exists: ${prepared[index].to}`)
  }
  const applied = []
  try {
    for (let index = 0; index < prepared.length; index += 1) {
      await fs.rename(sourcePaths[index], targetPaths[index])
      applied.push(prepared[index])
    }
  } catch (error) {
    for (const item of applied.reverse()) {
      try { await fs.rename(safeChildPath(base, item.to), safeChildPath(base, item.from)) } catch {}
    }
    throw error
  }
  lastRenameOperation = { root: base, renames: prepared }
  return { applied: prepared.length, renames: prepared }
}

function fileOperationPath(root, value) {
  return safeChildPath(path.resolve(String(root || '')), value)
}

async function applyFilePlan(root, plan) {
  const base = path.resolve(String(root || ''))
  const operations = Array.isArray(plan) ? plan.slice(0, 100) : []
  if (!operations.length) throw new Error('The file operation plan is empty')
  const prepared = operations.map((operation) => ({ ...operation, type: String(operation.type || '').toLowerCase() }))
  const undo = []
  for (const operation of prepared) {
    if (!['rename', 'move', 'copy', 'write', 'mkdir', 'delete'].includes(operation.type)) throw new Error(`Unsupported file operation: ${operation.type}`)
    if (operation.type === 'rename' || operation.type === 'move' || operation.type === 'copy') {
      operation.fromPath = fileOperationPath(base, operation.from)
      operation.toPath = fileOperationPath(base, operation.to)
      if (!existsSync(operation.fromPath)) throw new Error(`Source not found: ${operation.from}`)
      if (existsSync(operation.toPath)) throw new Error(`Destination already exists: ${operation.to}`)
    } else {
      operation.targetPath = fileOperationPath(base, operation.path)
      if (operation.type === 'write' && String(operation.content || '').length > 1024 * 1024) throw new Error('A single text write is limited to 1 MB')
      if (operation.type === 'delete' && !existsSync(operation.targetPath)) throw new Error(`File not found: ${operation.path}`)
      if (operation.type === 'mkdir' && existsSync(operation.targetPath)) throw new Error(`Folder already exists: ${operation.path}`)
    }
  }
  try {
    for (const operation of prepared) {
      if (operation.type === 'rename' || operation.type === 'move') {
        await fs.mkdir(path.dirname(operation.toPath), { recursive: true })
        await fs.rename(operation.fromPath, operation.toPath)
        undo.unshift({ type: 'rename', fromPath: operation.toPath, toPath: operation.fromPath })
      } else if (operation.type === 'copy') {
        await fs.mkdir(path.dirname(operation.toPath), { recursive: true })
        await fs.copyFile(operation.fromPath, operation.toPath)
        undo.unshift({ type: 'delete', targetPath: operation.toPath })
      } else if (operation.type === 'mkdir') {
        await fs.mkdir(operation.targetPath, { recursive: true })
        undo.unshift({ type: 'delete', targetPath: operation.targetPath })
      } else if (operation.type === 'write') {
        let backup = null
        if (existsSync(operation.targetPath)) backup = await fs.readFile(operation.targetPath)
        await fs.mkdir(path.dirname(operation.targetPath), { recursive: true })
        await fs.writeFile(operation.targetPath, String(operation.content || ''), 'utf8')
        undo.unshift({ type: 'restore', targetPath: operation.targetPath, backup })
      } else if (operation.type === 'delete') {
        await shell.trashItem(operation.targetPath)
      }
    }
  } catch (error) {
    for (const item of undo) {
      try {
        if (item.type === 'rename') await fs.rename(item.fromPath, item.toPath)
        else if (item.type === 'delete' && existsSync(item.targetPath)) await fs.rm(item.targetPath, { recursive: true, force: true })
        else if (item.type === 'restore') {
          if (item.backup) await fs.writeFile(item.targetPath, item.backup)
          else if (existsSync(item.targetPath)) await fs.rm(item.targetPath, { force: true })
        }
      } catch {}
    }
    throw error
  }
  lastFileOperation = { root: base, undo }
  return { applied: prepared.length, operations: prepared.map(({ type, path: relativePath, from, to }) => ({ type, path: relativePath, from, to })) }
}

async function undoFilePlan() {
  if (!lastFileOperation) throw new Error('There is no file operation to undo')
  for (const item of lastFileOperation.undo) {
    if (item.type === 'rename') await fs.rename(item.fromPath, item.toPath)
    else if (item.type === 'delete' && existsSync(item.targetPath)) await fs.rm(item.targetPath, { recursive: true, force: true })
    else if (item.type === 'restore') {
      if (item.backup) await fs.writeFile(item.targetPath, item.backup)
      else if (existsSync(item.targetPath)) await fs.rm(item.targetPath, { force: true })
    }
  }
  lastFileOperation = null
  return true
}

async function undoRenamePlan() {
  if (!lastRenameOperation) throw new Error('There is no rename operation to undo')
  const { root, renames } = lastRenameOperation
  const reversed = renames.map((item) => ({ from: item.to, to: item.from }))
  const result = await applyRenamePlan(root, reversed)
  lastRenameOperation = null
  return result
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]))
}

async function exportConversationPdf(event, payload) {
  const owner = BrowserWindow.fromWebContents(event.sender)
  const title = String(payload?.title || 'Forge AI conversation').slice(0, 120)
  const messages = Array.isArray(payload?.messages) ? payload.messages : []
  const body = messages.map((message) => `<article><div class="meta"><strong>${escapeHtml(message.role === 'user' ? 'You' : 'Forge AI')}</strong><span>${escapeHtml(message.time)}</span></div><div class="text">${escapeHtml(message.text).replace(/\n/g, '<br>')}</div>${(message.attachments || []).map((attachment) => `<div class="attachment">Attached: ${escapeHtml(attachment.name)}</div>`).join('')}</article>`).join('')
  const exportWindow = new BrowserWindow({ show: false, parent: owner || undefined, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
  try {
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:18mm}body{font-family:Arial,"Malgun Gothic",sans-serif;color:#202426}h1{font-size:22px;margin:0 0 7px}small{color:#687276}.meta{display:flex;gap:10px;align-items:baseline;margin-bottom:7px}.meta span{color:#7a8588;font-size:11px}.text{font-size:13px;line-height:1.7;white-space:normal}.attachment{margin-top:7px;padding:6px 8px;border:1px solid #ccd5d2;border-radius:5px;color:#48655a;font-size:11px}article{padding:0 0 18px;margin:0 0 18px;border-bottom:1px solid #dce3e0}article:last-child{border-bottom:0}</style></head><body><h1>${escapeHtml(title)}</h1><small>Exported from Forge AI</small><hr>${body}</body></html>`
    await exportWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const pdf = await exportWindow.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 } })
    const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_')
    let filePath
    if (payload?.autoSave) filePath = path.join(app.getPath('downloads'), `${safeTitle}-${Date.now()}.pdf`)
    else {
      const save = await dialog.showSaveDialog(owner || exportWindow, { title: 'Export conversation as PDF', defaultPath: `${safeTitle}.pdf`, filters: [{ name: 'PDF document', extensions: ['pdf'] }] })
      if (save.canceled || !save.filePath) return null
      filePath = save.filePath
    }
    await fs.writeFile(filePath, pdf)
    return filePath
  } finally {
    if (!exportWindow.isDestroyed()) exportWindow.destroy()
  }
}
function isOllamaRunning() {
  return new Promise((resolve) => {
    const request = http.get('http://127.0.0.1:11434/api/tags', (response) => {
      response.resume()
      resolve(response.statusCode >= 200 && response.statusCode < 300)
    })
    request.setTimeout(450, () => { request.destroy(); resolve(false) })
    request.on('error', () => resolve(false))
  })
}

async function ensureOllamaServer() {
  if (await isOllamaRunning()) return
  const candidates = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'),
    path.join(process.env.ProgramFiles || '', 'Ollama', 'ollama.exe')
  ].filter(Boolean)
  const ollamaPath = candidates.find((candidate) => existsSync(candidate))
  if (!ollamaPath) return
  const child = spawn(ollamaPath, ['serve'], { detached: true, windowsHide: true, stdio: 'ignore' })
  child.unref()
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: '#101315',
    title: 'Forge AI',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  mainWindow = window

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return
    const message = `Forge AI could not load its bundled interface.\n\n${errorDescription} (${errorCode})\n${validatedURL}`
    window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html><body style="margin:0;background:#101315;color:#eeeae1;font-family:system-ui;padding:48px;white-space:pre-wrap"><h2>Forge AI</h2><p>${message}</p></body></html>`)}`)
  })
  if (isDev) window.loadURL('http://127.0.0.1:5174/')
  else window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const url = webContents?.getURL?.() || ''
    callback(permission === 'geolocation' && (url.startsWith('file://') || url.startsWith('http://127.0.0.1:5174') || url.startsWith('http://127.0.0.1:5175')))
  })
  ipcMain.handle('state-load', async () => {
    try { return JSON.parse(await fs.readFile(stateFilePath(), 'utf8')) } catch { return null }
  })
  ipcMain.handle('state-save', async (_event, state) => {
    const serialized = JSON.stringify(state)
    const target = stateFilePath()
    const temporary = `${target}.tmp`
    stateWriteQueue = stateWriteQueue.catch(() => {}).then(async () => {
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(temporary, serialized, 'utf8')
      await fs.rename(temporary, target)
    })
    await stateWriteQueue
    return true
  })
  ipcMain.handle('update-default-path', () => defaultUpdateFeedPath())
  ipcMain.handle('update-choose-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle('update-check', async (_event, feedPath) => checkForUpdate(feedPath))
  ipcMain.handle('update-install', (_event, feedPath, installerPath) => installUpdate(feedPath, installerPath))
  ipcMain.handle('github-update-check', async () => checkGitHubUpdate())
  ipcMain.handle('github-update-download', async () => { await autoUpdater.downloadUpdate(); return true })
  ipcMain.handle('github-update-install', () => { autoUpdater.quitAndInstall(false, true); return true })
  ipcMain.handle('system-context', () => getSystemContext())
  ipcMain.handle('app-version', () => app.getVersion())
  ipcMain.handle('clipboard-write', (_event, text) => {
    clipboard.writeText(String(text || ''))
    return true
  })
  ipcMain.handle('web-search', async (_event, query) => searchDuckDuckGo(String(query || '').slice(0, 240)))
  ipcMain.handle('web-open', async (_event, url) => openWebPage(String(url || '')))
  ipcMain.handle('web-open-window', async (event, url) => {
    const parsed = new URL(String(url || ''))
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only web pages can be opened')
    openBrowserWindow(parsed.toString(), BrowserWindow.fromWebContents(event.sender))
    return true
  })
  ipcMain.handle('graft-choose-folder', async () => {
    const result = await require('electron').dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle('graft-build', async (_event, root) => buildGraft(String(root || '')))
  ipcMain.handle('graft-ask', async (_event, query, root) => askGraft(String(query || '').slice(0, 500), String(root || '')))
  ipcMain.handle('choose-attachments', async () => chooseAttachments())
  ipcMain.handle('export-conversation-pdf', async (event, payload) => exportConversationPdf(event, payload))
  ipcMain.handle('open-pdf-file', async (_event, filePath) => {
    const target = String(filePath || '')
    if (path.extname(target).toLowerCase() !== '.pdf' || !existsSync(target)) throw new Error('PDF file was not found')
    return shell.openPath(target)
  })
  ipcMain.handle('list-folder-files', async (_event, root) => listFolderFiles(root))
  ipcMain.handle('read-text-file', async (_event, root, relativePath) => readTextFile(root, relativePath))
  ipcMain.handle('apply-rename-plan', async (_event, root, plan) => applyRenamePlan(root, plan))
  ipcMain.handle('undo-rename-plan', async () => undoRenamePlan())
  ipcMain.handle('apply-file-plan', async (_event, root, plan) => applyFilePlan(root, plan))
  ipcMain.handle('undo-file-plan', async () => undoFilePlan())
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!details.url.startsWith('file://') && !details.url.startsWith('http://127.0.0.1:5174') && !details.url.startsWith('http://127.0.0.1:5175')) {
      callback({ responseHeaders: details.responseHeaders })
      return
    }
    callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': ["default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' http://127.0.0.1:11434"] } })
  })
  await ensureOllamaServer()
  createWindow()
  setupAutoUpdater()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
