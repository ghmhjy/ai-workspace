import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Archive, ArrowDown, ArrowRight, ArrowUp, ArrowUpRight, AudioLines, Bot, Check, ChevronDown, CircleHelp, Clipboard, Globe,
  Code2, Copy, FileCode2, FileDown, FileText, Folder, FolderOpen, FolderPlus, Gauge, GitBranch, Hash, Image as ImageIcon, Library,
  Link2, Menu, MessageSquare, MoreHorizontal, Paperclip, Plus, RefreshCw,
  Search, Send, Settings2, Sparkles, SlidersHorizontal, SquareTerminal, Trash2, MapPin, Moon, Sun,
  Wifi, X, Zap
} from 'lucide-react'
import './styles.css'

const starterChats = [
  { id: 1, title: 'Welcome to Local / AI', preview: 'A private space for your thoughts', time: 'Now', active: true },
  { id: 2, title: 'Project notes · Q3', preview: 'Summarize the meeting notes...', time: 'Yesterday' },
  { id: 3, title: 'Refactor the auth flow', preview: 'Here is a clean approach...', time: 'Mon' },
  { id: 4, title: 'Weekend reading list', preview: 'Three papers worth a look', time: 'Sun' }
]

const seedMessages = [
  { role: 'assistant', text: 'Welcome to your private AI workspace.\n\nI run entirely on your machine, so your conversations stay yours. What would you like to work on?', time: '10:42 AM' },
  { role: 'user', text: 'Give me a simple way to keep project notes organized.', time: '10:43 AM' },
  { role: 'assistant', text: 'A lightweight system that works well is a three-layer note structure:', time: '10:43 AM', bullets: ['Inbox — quick thoughts and raw ideas', 'Projects — notes grouped by active outcome', 'Library — durable references you want to keep'] , code: 'notes/\n├── inbox/\n├── projects/\n│   └── project-name/\n└── library/'}
]

const FAST_MODEL = 'qwen3.5:9b'
const PRECISION_MODEL = 'Ornith:latest'
const VISION_MODEL = 'qwen2.5vl:3b'
const precisionSignals = /(분석|비교|설계|디버그|버그|코드|보안|수학|법률|계약|계산|증명|근거|정확|복잡|긴 문서|심층|architecture|debug|security|legal|contract|math|prove|analy[sz]e|compare|design|refactor|review|research|deep|complex)/i
const webSearchIntentSignals = /(인터넷|웹|검색|찾아|최신|공식|자료|해결법|원인|research|search|look up|current|latest|source)/i
const pdfRequestSignals = /(pdf|피디에프)/i
const pdfActionSignals = /(저장|다운|download|export|만들|작성|변환|추출|해줘|해 줘)/i
const currentClockQuestion = /^(지금|현재|오늘 날짜|오늘이 무슨 요일|무슨 요일|몇 시|현재 시간|현재 시각|오늘 날짜가|다시 여기|현재 시스템).*(시간|시각|날짜|요일|위치|정보)|^(시간|시각|날짜|요일|위치).*(정보|알려|보여|몇 시)|what(?:'s| is) the (?:current )?(?:time|date|day)|current (?:time|date)|what day is it/i
const renameRequestSignals = /(?:파일명|파일 이름|이름|rename|filename).*(바꿔|변경|rename|정리)|(?:바꿔|변경|rename|이동).*(파일|폴더|파일명|이름|filename)/i
const fileWriteRequestSignals = /(파일|폴더|디렉토리|file|folder|directory).*(생성|만들|작성|수정|편집|쓰기|저장|복사|이동|삭제|지워|create|write|edit|modify|copy|move|delete)|(?:생성|만들|작성|수정|편집|쓰기|저장|복사|이동|삭제|지워|create|write|edit|modify|copy|move|delete).*(파일|폴더|디렉토리|file|folder|directory)/i
const explicitWindowsPath = /[A-Za-z]:\\(?:[^\\\s"]+\\)*[^\\\s".,!?)]*/i
const fileReadRequestSignals = /(파일|폴더|디렉토리|file|folder|directory).*(목록|리스트|개수|몇|형식|종류|안에|내용|읽|보여|확인|what|list|count|read)|(?:목록|리스트|개수|몇|형식|종류|내용|읽|보여|확인|what|list|count|read).*(파일|폴더|디렉토리|file|folder|directory)/i

function readStoredJson(key, fallback) {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

function normalizeMemory(value) {
  return {
    summary: typeof value?.summary === 'string' ? value.summary.slice(0, 6000) : '',
    facts: Array.isArray(value?.facts) ? value.facts.filter((fact) => typeof fact === 'string' && fact.trim()).map((fact) => fact.trim().slice(0, 500)).filter((fact, index, list) => list.indexOf(fact) === index).slice(0, 40) : []
  }
}

function deriveMemoryFromHistory(messagesByChat) {
  const allMessages = Object.values(messagesByChat || {}).flat().filter((message) => message?.role === 'user')
  const facts = []
  for (const message of allMessages) {
    const paths = message.text?.match(/[A-Za-z]:\\(?:[^\\\s"]+\\)*[^\\\s".,!?)]*/g) || []
    paths.forEach((path) => facts.push(`User referenced the local path ${path}.`))
    if (/(앞으로|다음부터|항상|선호|prefer|always)/i.test(message.text || '')) facts.push(`User preference: ${message.text.trim().slice(0, 420)}`)
  }
  return normalizeMemory({ summary: allMessages.length ? 'Conversation history is available locally; use saved facts when relevant.' : '', facts })
}

function Icon({ name, size = 16, strokeWidth = 1.8 }) {
  const icons = { Archive, ArrowDown, ArrowRight, ArrowUp, ArrowUpRight, AudioLines, Bot, Check, ChevronDown, CircleHelp, Clipboard, Code2, Copy, FileCode2, FileDown, FileText, Folder, FolderOpen, FolderPlus, Gauge, GitBranch, Globe, Hash, Image: ImageIcon, Library, Link2, MapPin, Menu, MessageSquare, Moon, MoreHorizontal, Paperclip, Plus, RefreshCw, Search, Send, Settings2, SlidersHorizontal, SquareTerminal, Sparkles, Sun, Trash2, Wifi, X, Zap }
  const Component = icons[name] || CircleHelp
  return <Component size={size} strokeWidth={strokeWidth} aria-hidden="true" />
}

function browserAttachmentType(file) {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'pdf'
  if (file.type.startsWith('audio/')) return 'audio'
  if (/\.(doc|docx|odt|rtf)$/i.test(file.name)) return 'document'
  return 'file'
}

function App() {
  const [chats, setChats] = useState(() => readStoredJson('local-ai-chats', starterChats))
  const [selectedChat, setSelectedChat] = useState(() => Number(localStorage.getItem('local-ai-selected-chat')) || 1)
  const [messagesByChat, setMessagesByChat] = useState(() => readStoredJson('local-ai-messages', { 1: seedMessages }))
  const [draft, setDraft] = useState('')
  const [models, setModels] = useState(['Ornith:latest'])
  const [model, setModel] = useState('Ornith:latest')
  const [endpoint, setEndpoint] = useState(() => {
    const stored = localStorage.getItem('local-ai-endpoint')
    return stored && !stored.includes('18782') ? stored : 'http://127.0.0.1:11434'
  })
  const [temperature, setTemperature] = useState(0.7)
  const [context, setContext] = useState(8192)
  const [connection, setConnection] = useState('idle')
  const [mode, setMode] = useState(() => localStorage.getItem('local-ai-mode') || 'auto')
  const [webSearchEnabled, setWebSearchEnabled] = useState(() => localStorage.getItem('local-ai-web-search') === 'true')
  const [graftRoot, setGraftRoot] = useState(() => localStorage.getItem('local-ai-graft-root') || '')
  const [graftEnabled, setGraftEnabled] = useState(() => localStorage.getItem('local-ai-graft-enabled') === 'true')
  const [graftStatus, setGraftStatus] = useState('idle')
  const [locationHint, setLocationHint] = useState(() => localStorage.getItem('local-ai-location-hint') || '')
  const [deviceLocation, setDeviceLocation] = useState(null)
  const [locationStatus, setLocationStatus] = useState('checking')
  const [fileToolsRoot, setFileToolsRoot] = useState(() => localStorage.getItem('local-ai-file-tools-root') || '')
  const [fileToolsEnabled, setFileToolsEnabled] = useState(() => localStorage.getItem('local-ai-file-tools-enabled') === 'true')
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const [systemContext, setSystemContext] = useState(null)
  const [memory, setMemory] = useState(() => {
    const stored = readStoredJson('local-ai-memory', null)
    return stored?.summary || stored?.facts?.length ? normalizeMemory(stored) : deriveMemoryFromHistory(messagesByChat)
  })
  const [showArchived, setShowArchived] = useState(false)
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false)
  const [draftAttachments, setDraftAttachments] = useState([])
  const [exportStatus, setExportStatus] = useState('')
  const [approvalRequest, setApprovalRequest] = useState(null)
  const [theme, setTheme] = useState(() => localStorage.getItem('local-ai-theme') || 'dark')
  const [updateFeedPath, setUpdateFeedPath] = useState(() => localStorage.getItem('local-ai-update-feed') || '')
  const [updateInfo, setUpdateInfo] = useState(null)
  const [updateStatus, setUpdateStatus] = useState('')
  const [appVersion, setAppVersion] = useState('')
  const [githubUpdateInfo, setGithubUpdateInfo] = useState(null)
  const [githubUpdateStatus, setGithubUpdateStatus] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [isNarrowViewport, setIsNarrowViewport] = useState(() => window.innerWidth <= 900)
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 900)
  const [showSettings, setShowSettings] = useState(false)
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [showRoutingMenu, setShowRoutingMenu] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [isVisionQuerying, setIsVisionQuerying] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isGraftQuerying, setIsGraftQuerying] = useState(false)
  const [isFileQuerying, setIsFileQuerying] = useState(false)
  const [isAtLatest, setIsAtLatest] = useState(true)
  const [storageReady, setStorageReady] = useState(() => !window.localAI?.loadState)
  const [search, setSearch] = useState('')
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [draggingChat, setDraggingChat] = useState(null)
  const textareaRef = useRef(null)
  const chatAreaRef = useRef(null)
  const messages = messagesByChat[selectedChat] || []

  const filteredChats = useMemo(() => chats.filter((chat) => `${chat.title} ${chat.preview}`.toLowerCase().includes(search.toLowerCase())), [chats, search])
  const visibleChats = useMemo(() => filteredChats.filter((chat) => Boolean(chat.archived) === showArchived), [filteredChats, showArchived])

  useEffect(() => {
    if (!window.localAI?.loadState) return
    let active = true
    window.localAI.loadState().then((saved) => {
      if (!active) return
      if (saved?.chats) setChats(saved.chats)
      if (saved?.messagesByChat) setMessagesByChat(saved.messagesByChat)
      if (saved?.selectedChat) {
        const restoredId = Number(saved.selectedChat)
        const restoredMessages = saved.messagesByChat?.[restoredId] || []
        const fallbackId = saved.chats?.find((chat) => (saved.messagesByChat?.[chat.id] || []).length > 0)?.id
        setSelectedChat(restoredMessages.length > 0 || !fallbackId ? restoredId : fallbackId)
      }
      if (saved?.endpoint) setEndpoint(saved.endpoint)
      if (saved?.mode) setMode(saved.mode)
      if (typeof saved?.webSearchEnabled === 'boolean') setWebSearchEnabled(saved.webSearchEnabled)
      if (saved?.graftRoot) setGraftRoot(saved.graftRoot)
      if (typeof saved?.graftEnabled === 'boolean') setGraftEnabled(saved.graftEnabled)
      if (typeof saved?.locationHint === 'string') setLocationHint(saved.locationHint)
      if (saved?.fileToolsRoot) setFileToolsRoot(saved.fileToolsRoot)
      if (typeof saved?.fileToolsEnabled === 'boolean') setFileToolsEnabled(saved.fileToolsEnabled)
      if (saved?.memory) setMemory(normalizeMemory(saved.memory))
      if (saved?.theme === 'light' || saved?.theme === 'dark') setTheme(saved.theme)
      if (saved?.updateFeedPath) setUpdateFeedPath(saved.updateFeedPath)
    }).catch(() => {}).finally(() => { if (active) setStorageReady(true) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!storageReady) return
    const state = { chats, selectedChat, messagesByChat, endpoint, mode, webSearchEnabled, graftRoot, graftEnabled, locationHint, fileToolsRoot, fileToolsEnabled, memory, theme, updateFeedPath }
    localStorage.setItem('local-ai-endpoint', endpoint)
    localStorage.setItem('local-ai-chats', JSON.stringify(chats))
    localStorage.setItem('local-ai-selected-chat', String(selectedChat))
    localStorage.setItem('local-ai-messages', JSON.stringify(messagesByChat))
    localStorage.setItem('local-ai-mode', mode)
    localStorage.setItem('local-ai-web-search', String(webSearchEnabled))
    localStorage.setItem('local-ai-graft-root', graftRoot)
    localStorage.setItem('local-ai-graft-enabled', String(graftEnabled))
    localStorage.setItem('local-ai-location-hint', locationHint)
    localStorage.setItem('local-ai-file-tools-root', fileToolsRoot)
    localStorage.setItem('local-ai-file-tools-enabled', String(fileToolsEnabled))
    localStorage.setItem('local-ai-memory', JSON.stringify(memory))
    localStorage.setItem('local-ai-theme', theme)
    localStorage.setItem('local-ai-update-feed', updateFeedPath)
    const saveResult = window.localAI?.saveState?.(state)
    saveResult?.catch(() => {})
  }, [storageReady, chats, selectedChat, messagesByChat, endpoint, mode, webSearchEnabled, graftRoot, graftEnabled, locationHint, fileToolsRoot, fileToolsEnabled, memory, theme, updateFeedPath])
  useEffect(() => {
    const refresh = async () => {
      const next = await window.localAI?.getSystemContext?.()
      if (next) { setSystemContext(next); setCurrentTime(new Date(next.isoTimestamp)) }
      else setCurrentTime(new Date())
    }
    refresh()
    const timer = window.setInterval(refresh, 1000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    const handleResize = () => {
      const narrow = window.innerWidth <= 900
      setIsNarrowViewport(narrow)
      setSidebarOpen(!narrow)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  useEffect(() => { requestDeviceLocation() }, [])
  useEffect(() => {
    if (updateFeedPath || !window.localAI?.getUpdateDefaultPath) return
    window.localAI.getUpdateDefaultPath().then((defaultPath) => { if (defaultPath) setUpdateFeedPath(defaultPath) }).catch(() => {})
  }, [updateFeedPath])
  useEffect(() => { window.localAI?.getAppVersion?.().then((version) => setAppVersion(version)).catch(() => {}) }, [])
  useEffect(() => {
    if (!window.localAI?.onUpdateStatus) return
    window.localAI.onUpdateStatus((status) => {
      if (status.type === 'checking') setGithubUpdateStatus('Checking GitHub for updates…')
      if (status.type === 'available') { const next = { available: true, version: status.version, releaseName: status.releaseName, downloaded: false, source: 'github' }; setGithubUpdateInfo(next); setUpdateInfo(next); setGithubUpdateStatus(`Version ${status.version} is available`); setUpdateStatus(`Version ${status.version} is available`) }
      if (status.type === 'current') { const next = { available: false, version: status.version, downloaded: false, source: 'github' }; setGithubUpdateInfo(next); setUpdateInfo(next); setGithubUpdateStatus(`Up to date (${status.version})`); setUpdateStatus(`Up to date (${status.version})`) }
      if (status.type === 'progress') setGithubUpdateStatus(`Downloading update… ${Math.round(status.percent || 0)}%`)
      if (status.type === 'downloaded') { setGithubUpdateInfo((current) => ({ ...(current || {}), available: true, version: status.version, downloaded: true, source: 'github' })); setUpdateInfo((current) => ({ ...(current || {}), available: true, version: status.version, downloaded: true, source: 'github' })); setGithubUpdateStatus(`Version ${status.version} is ready to install`); setUpdateStatus(`Version ${status.version} is ready to install`) }
      if (status.type === 'error') { setGithubUpdateStatus(`GitHub update failed: ${status.message}`); setUpdateStatus(`GitHub update failed: ${status.message}`) }
    })
  }, [])
  useEffect(() => {
    testConnection()
    const retry = window.setInterval(testConnection, 3000)
    return () => window.clearInterval(retry)
  }, [endpoint, mode])
  useEffect(() => {
    const area = chatAreaRef.current
    if (area && isAtLatest) area.scrollTo({ top: area.scrollHeight, behavior: 'smooth' })
  }, [messages.length, isTyping, isAtLatest])
  useEffect(() => {
    const handleShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        startNewChat()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  function handleChatScroll(event) {
    const area = event.currentTarget
    setIsAtLatest(area.scrollHeight - area.scrollTop - area.clientHeight < 48)
  }

  function scrollToLatest() {
    chatAreaRef.current?.scrollTo({ top: chatAreaRef.current.scrollHeight, behavior: 'smooth' })
    setIsAtLatest(true)
  }

  function startNewChat() {
    const next = { id: Date.now(), title: 'New conversation', preview: 'Start something new...', time: 'Now', active: true }
    setChats((items) => [next, ...items.map((item) => ({ ...item, active: false }))])
    setSelectedChat(next.id)
    setMessagesByChat((items) => ({ ...items, [next.id]: [] }))
    setDraft('')
    textareaRef.current?.focus()
  }

  function archiveChat(id) {
    setChats((items) => {
      const next = items.map((chat) => chat.id === id ? { ...chat, archived: !chat.archived, active: false } : chat)
      if (selectedChat === id) {
        const replacement = next.find((chat) => !chat.archived) || next.find((chat) => chat.id !== id)
        if (replacement) { setSelectedChat(replacement.id); replacement.active = true }
      }
      return next
    })
  }

  function deleteChat(id) {
    if (!window.confirm('Delete this conversation permanently?')) return
    setChats((items) => {
      const next = items.filter((chat) => chat.id !== id)
      if (selectedChat === id) {
        const replacement = next.find((chat) => !chat.archived) || next[0]
        setSelectedChat(replacement?.id || 1)
        if (replacement) replacement.active = true
      }
      return next
    })
    setMessagesByChat((items) => { const next = { ...items }; delete next[id]; return next })
  }

  function moveChat(dragId, targetId) {
    if (!dragId || dragId === targetId) return
    setChats((items) => {
      const next = [...items]
      const from = next.findIndex((chat) => chat.id === dragId)
      const to = next.findIndex((chat) => chat.id === targetId)
      if (from < 0 || to < 0) return items
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  function selectChat(id) {
    setSelectedChat(id)
    setChats((items) => items.map((item) => ({ ...item, active: item.id === id })))
  }

  function chooseModel(prompt, hasImage = false) {
    const ornith = models.find((item) => item.toLowerCase().startsWith('ornith')) || PRECISION_MODEL
    const fast = models.includes(FAST_MODEL) ? FAST_MODEL : ornith
    const vision = models.find((item) => /vision|vl|llava|gemma3/i.test(item))
    if (hasImage && vision) return vision
    if (mode === 'precision') return ornith
    if (mode === 'fast') return fast
    const complexRequest = prompt.length > 280 || prompt.split('\n').length > 3 || precisionSignals.test(prompt)
    return complexRequest ? ornith : fast
  }

  function selectMode(nextMode) {
    setMode(nextMode)
    setShowRoutingMenu(false)
    if (nextMode === 'fast' && models.includes(FAST_MODEL)) setModel(FAST_MODEL)
    if (nextMode === 'precision' && models.some((item) => item.toLowerCase().startsWith('ornith'))) setModel(models.find((item) => item.toLowerCase().startsWith('ornith')))
  }

  async function chooseGraftFolder() {
    const root = await window.localAI?.chooseGraftFolder?.()
    if (root) await activateSharedProjectFolder(root)
  }

  async function chooseFileToolsFolder() {
    const root = await window.localAI?.chooseGraftFolder?.()
    if (root) await activateSharedProjectFolder(root)
  }

  async function activateSharedProjectFolder(root) {
    setGraftRoot(root)
    setFileToolsRoot(root)
    setFileToolsEnabled(true)
    if (!window.localAI?.buildGraft) { setGraftStatus('ready'); return }
    setGraftStatus('building')
    try { await window.localAI.buildGraft(root); setGraftStatus('ready') } catch { setGraftStatus('error') }
  }

  function requestRenameApproval(index, plan, root) {
    setApprovalRequest({ index, plan, root })
  }

  async function executeRename(index, plan, root) {
    try {
      const result = await window.localAI?.applyRenamePlan?.(root, plan)
      if (!result) throw new Error('File operation bridge unavailable')
      setMessagesByChat((items) => ({ ...items, [selectedChat]: (items[selectedChat] || []).map((message, messageIndex) => messageIndex === index ? { ...message, text: `${message.text}\n\nRenamed ${result.applied} file(s).`, renamePlan: null, renameResult: result } : message) }))
    } catch (error) {
      setMessagesByChat((items) => ({ ...items, [selectedChat]: (items[selectedChat] || []).map((message, messageIndex) => messageIndex === index ? { ...message, text: `${message.text}\n\nRename failed: ${error instanceof Error ? error.message : 'Unknown error'}`, error: true } : message) }))
    }
  }

  function requestFileApproval(index, plan, root) {
    setApprovalRequest({ kind: 'file', index, plan, root })
  }

  async function executeFilePlan(index, plan, root) {
    try {
      const result = await window.localAI?.applyFilePlan?.(root, plan)
      if (!result) throw new Error('File operation bridge unavailable')
      setMessagesByChat((items) => ({ ...items, [selectedChat]: (items[selectedChat] || []).map((message, messageIndex) => messageIndex === index ? { ...message, text: `${message.text}\n\nCompleted ${result.applied} file operation(s).`, filePlan: null, fileResult: result } : message) }))
    } catch (error) {
      setMessagesByChat((items) => ({ ...items, [selectedChat]: (items[selectedChat] || []).map((message, messageIndex) => messageIndex === index ? { ...message, text: `${message.text}\n\nFile operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`, error: true } : message) }))
    }
  }

  async function undoRename(index) {
    try {
      await window.localAI?.undoRenamePlan?.()
      setMessagesByChat((items) => ({ ...items, [selectedChat]: (items[selectedChat] || []).map((message, messageIndex) => messageIndex === index ? { ...message, text: `${message.text}\n\nRename undone.`, renameResult: null } : message) }))
    } catch {}
  }

  async function undoFile(index) {
    try {
      await window.localAI?.undoFilePlan?.()
      setMessagesByChat((items) => ({ ...items, [selectedChat]: (items[selectedChat] || []).map((message, messageIndex) => messageIndex === index ? { ...message, text: `${message.text}\n\nFile operation undone.`, fileResult: null } : message) }))
    } catch {}
  }

  function cancelRename(index) {
    setMessagesByChat((items) => ({ ...items, [selectedChat]: (items[selectedChat] || []).map((message, messageIndex) => messageIndex === index ? { ...message, text: `${message.text}\n\nRename canceled.`, renamePlan: null } : message) }))
  }

  function cancelRenameApproval() {
    setApprovalRequest(null)
  }

  function clearMemory() {
    if (!window.confirm('Clear all saved long-term memory?')) return
    setMemory({ summary: '', facts: [] })
  }

  async function approveRename() {
    if (!approvalRequest) return
    const request = approvalRequest
    setApprovalRequest(null)
    if (request.kind === 'file') await executeFilePlan(request.index, request.plan, request.root)
    else await executeRename(request.index, request.plan, request.root)
  }

  function requestDeviceLocation() {
    if (!navigator.geolocation) { setLocationStatus('unavailable'); return }
    setLocationStatus('checking')
    navigator.geolocation.getCurrentPosition((position) => {
      setDeviceLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, capturedAt: new Date().toISOString() })
      setLocationStatus('ready')
    }, () => { setLocationStatus('unavailable') }, { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 })
  }

  async function buildGraftIndex() {
    if (!graftRoot || !window.localAI?.buildGraft) return
    setGraftStatus('building')
    try { await window.localAI.buildGraft(graftRoot); setGraftStatus('ready'); setGraftEnabled(true) } catch { setGraftStatus('error') }
  }

  async function chooseUpdateFolder() {
    const folder = await window.localAI?.chooseUpdateFolder?.()
    if (folder) { setUpdateFeedPath(folder); setUpdateInfo(null); setUpdateStatus('') }
  }

  async function checkForAppUpdate() {
    if (window.localAI?.checkGitHubUpdate) return checkGitHubForUpdate()
    if (!window.localAI?.checkForUpdate) return
    setUpdateStatus('Checking…')
    try {
      const result = await window.localAI.checkForUpdate(updateFeedPath)
      setUpdateInfo(result)
      setUpdateStatus(result.available ? `Version ${result.version} is ready` : `Up to date (${result.currentVersion})`)
    } catch (error) {
      setUpdateInfo(null)
      setUpdateStatus(error instanceof Error ? error.message : 'Update check failed')
    }
  }

  async function installAppUpdate() {
    if (updateInfo?.source === 'github') {
      if (!window.localAI?.downloadGitHubUpdate || !window.localAI?.installGitHubUpdate) return
      setUpdateStatus(`Downloading and installing ${updateInfo.version}…`)
      try { await window.localAI.downloadGitHubUpdate(); await window.localAI.installGitHubUpdate() } catch (error) { setUpdateStatus(error instanceof Error ? error.message : 'GitHub update installation failed') }
      return
    }
    if (!updateInfo?.available || !window.localAI?.installUpdate) return
    setUpdateStatus(`Installing ${updateInfo.version}…`)
    try { await window.localAI.installUpdate(updateInfo.feedPath, updateInfo.installerPath) } catch (error) { setUpdateStatus(error instanceof Error ? error.message : 'Update installation failed') }
  }

  async function checkGitHubForUpdate() {
    if (!window.localAI?.checkGitHubUpdate) return
    setGithubUpdateStatus('Checking GitHub for updates…')
    try {
      const result = await window.localAI.checkGitHubUpdate()
      const next = result ? { ...result, source: 'github', downloaded: false } : null
      setGithubUpdateInfo(next)
      setUpdateInfo(next)
      setUpdateStatus(result?.available ? `Version ${result.version} is available` : result?.reason || `Up to date (${result?.currentVersion || appVersion})`)
      if (!result?.available) setGithubUpdateStatus(result?.reason || `Up to date (${result?.currentVersion || appVersion})`)
    } catch (error) { setGithubUpdateInfo(null); setGithubUpdateStatus(error instanceof Error ? error.message : 'GitHub update check failed') }
  }

  async function downloadGitHubUpdate() {
    if (!githubUpdateInfo?.available || githubUpdateInfo.downloaded || !window.localAI?.downloadGitHubUpdate) return
    setGithubUpdateStatus(`Downloading ${githubUpdateInfo.version}…`)
    try { await window.localAI.downloadGitHubUpdate() } catch (error) { setGithubUpdateStatus(error instanceof Error ? error.message : 'GitHub update download failed') }
  }

  async function installGitHubUpdate() {
    if (!githubUpdateInfo?.downloaded || !window.localAI?.installGitHubUpdate) return
    setGithubUpdateStatus(`Installing ${githubUpdateInfo.version}…`)
    try { await window.localAI.installGitHubUpdate() } catch (error) { setGithubUpdateStatus(error instanceof Error ? error.message : 'GitHub update installation failed') }
  }

  async function addAttachments() {
    setShowAttachmentMenu(false)
    const picked = await window.localAI?.chooseAttachments?.() || []
    if (picked.length) setDraftAttachments((items) => [...items, ...picked].slice(0, 8))
  }

  function readBrowserFile(file) {
    return new Promise((resolve) => {
      const type = browserAttachmentType(file)
      if (type === 'image') {
        const reader = new FileReader()
        reader.onload = () => resolve({ name: file.name || 'Pasted image', type, size: file.size, dataUrl: String(reader.result || ''), text: '' })
        reader.onerror = () => resolve({ name: file.name || 'Pasted image', type, size: file.size, text: '' })
        reader.readAsDataURL(file)
      } else if (file.type.startsWith('text/') || /\.(txt|md|json|csv|html|xml|js|jsx|ts|tsx|py|css|scss|yaml|yml)$/i.test(file.name)) {
        const reader = new FileReader()
        reader.onload = () => resolve({ name: file.name, type, size: file.size, text: String(reader.result || '').slice(0, 12000) })
        reader.onerror = () => resolve({ name: file.name, type, size: file.size, text: '' })
        reader.readAsText(file)
      } else resolve({ name: file.name, type, size: file.size, text: '' })
    })
  }

  async function addBrowserFiles(fileList) {
    const files = Array.from(fileList || []).slice(0, 8)
    if (!files.length) return
    const picked = await Promise.all(files.map(readBrowserFile))
    setDraftAttachments((items) => [...items, ...picked].slice(0, 8))
  }

  function handlePaste(event) {
    const files = Array.from(event.clipboardData?.files || [])
    if (!files.length) return
    event.preventDefault()
    addBrowserFiles(files)
  }

  async function exportExchange(assistantIndex) {
    const assistant = messages[assistantIndex]
    const user = messages.slice(0, assistantIndex).reverse().find((message) => message.role === 'user')
    if (!assistant || !user || !window.localAI?.exportConversationPdf) return
    const title = chats.find((chat) => chat.id === selectedChat)?.title || 'Local AI exchange'
    const savedPath = await window.localAI.exportConversationPdf({ title: `${title} - exchange`, messages: [user, assistant] })
    if (savedPath) { setExportStatus('PDF saved'); window.setTimeout(() => setExportStatus(''), 2200) }
  }

  function exportLatestExchange() {
    const index = [...messages].map((message, index) => message.role === 'assistant' ? index : -1).filter((index) => index >= 0).pop()
    setShowAttachmentMenu(false)
    if (index !== undefined) exportExchange(index)
  }

  async function testConnection() {
    setConnection('checking')
    try {
      const response = await fetch(`${endpoint.replace(/\/$/, '')}/api/tags`)
      if (!response.ok) throw new Error('Connection failed')
      const data = await response.json()
      const names = data.models?.map((item) => item.name).filter(Boolean) || []
      const activeModels = names.filter((name) => name === FAST_MODEL || name.toLowerCase().startsWith('ornith'))
      const ornith = activeModels.find((name) => name.toLowerCase().startsWith('ornith'))
      setModels(names)
      setModel((current) => {
        if (mode === 'fast' && activeModels.includes(FAST_MODEL)) return FAST_MODEL
        if (mode === 'precision' && ornith) return ornith
        if (mode === 'auto' && activeModels.includes(FAST_MODEL)) return FAST_MODEL
        return activeModels.includes(current) ? current : ornith || activeModels[0] || PRECISION_MODEL
      })
      setConnection('connected')
    } catch { setConnection('offline') }
  }

  async function updateLongTermMemory(userMessage, assistantMessage, requestModel) {
    if (!window.localAI || !endpoint) return
    const exchange = `User: ${userMessage.text}\nAssistant: ${assistantMessage.text}`.slice(0, 9000)
    const existing = JSON.stringify(memory)
    try {
      const response = await fetch(`${endpoint.replace(/\/$/, '')}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: requestModel, stream: false, think: false, format: 'json', options: { temperature: 0.1, num_ctx: 4096, num_predict: 512 }, messages: [{ role: 'system', content: 'You are a local memory curator. Update durable user memory from the exchange. Return JSON only: {"summary":"short durable summary","facts":["durable fact or preference"]}. Keep only explicit, useful, long-lived preferences, project paths, decisions, and facts. Never store passwords, API keys, tokens, financial details, medical details, precise location, or temporary status. Preserve existing useful memory and remove duplicates. If nothing durable was learned, return the existing memory unchanged.' }, { role: 'user', content: `Existing memory:\n${existing}\n\nNew exchange:\n${exchange}` }] }) })
      if (!response.ok) return
      const data = await response.json()
      const raw = data.message?.content?.trim() || data.response?.trim() || '{}'
      setMemory(normalizeMemory({ ...memory, ...JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) }))
    } catch {}
  }

  async function sendMessage(event, options = {}) {
    event?.preventDefault()
    const isRegeneration = Number.isInteger(options.replaceAssistantIndex)
    const prompt = (options.prompt ?? draft).trim()
    if (!prompt || isTyping) return
    const attached = options.attachments ?? draftAttachments
    const imageAttachments = attached.filter((attachment) => attachment.type === 'image')
    const visionModel = models.find((item) => item.toLowerCase() === VISION_MODEL || /vision|vl|llava|gemma3/i.test(item))
    const requestModel = chooseModel(prompt, false)
    const pdfRequested = pdfRequestSignals.test(prompt) && pdfActionSignals.test(prompt)
    const historyMessages = isRegeneration ? messages.slice(0, options.replaceAssistantIndex) : messages
    const previousUserMessage = isRegeneration ? [...historyMessages].reverse().find((message) => message.role === 'user') : null
    if (isRegeneration && !previousUserMessage) return
    setCopyFailed(false)
    if (!isRegeneration) {
      setDraft('')
      setDraftAttachments([])
    }
    setModel(requestModel)
    const userMessage = previousUserMessage || { role: 'user', text: prompt, attachments: attached.map(({ name, type, size, dataUrl }) => ({ name, type, size, dataUrl })), time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }
    if (isRegeneration) setMessagesByChat((items) => ({ ...items, [selectedChat]: (items[selectedChat] || []).slice(0, options.replaceAssistantIndex) }))
    else setMessagesByChat((items) => ({ ...items, [selectedChat]: [...(items[selectedChat] || []), userMessage] }))
    if (!isRegeneration) setChats((items) => items.map((chat) => chat.id === selectedChat && chat.title === 'New conversation' ? { ...chat, title: prompt.slice(0, 32), preview: prompt.slice(0, 42), time: 'Now' } : chat))
    if (imageAttachments.length && !visionModel) {
      setMessagesByChat((items) => ({ ...items, [selectedChat]: [...(items[selectedChat] || []), { role: 'assistant', text: '현재 Ollama에 이미지 입력을 지원하는 비전 모델이 설치되어 있지 않습니다.\n\nOrnith:latest와 qwen3.5:9b는 텍스트 전용 모델이라 image.png의 픽셀 내용을 읽을 수 없습니다. 비전/VL 모델을 Ollama에 설치한 뒤 Settings에서 연결을 새로고침하면 이미지가 자동으로 해당 모델에 전달됩니다.', time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), error: true }] }))
      setConnection('connected')
      setIsTyping(false)
      return
    }
    const lastUserPath = [...historyMessages].reverse().find((message) => message.role === 'user' && explicitWindowsPath.test(message.text))?.text.match(explicitWindowsPath)
    const directPathMatch = prompt.match(explicitWindowsPath) || lastUserPath
    if (false && fileToolsEnabled && fileToolsRoot && directPathMatch && !fileWriteRequestSignals.test(prompt) && window.localAI?.listFolderFiles) {
      const requestedPath = directPathMatch[0].replace(/[.,!?]+$/, '').replace(/["')\]]+$/, '')
      const rootPrefix = fileToolsRoot.endsWith('\\') ? fileToolsRoot : `${fileToolsRoot}\\`
      const isWithinApprovedRoot = requestedPath.toLowerCase() === fileToolsRoot.toLowerCase() || requestedPath.toLowerCase().startsWith(rootPrefix.toLowerCase())
      setIsTyping(true)
      setIsFileQuerying(true)
      try {
        if (!isWithinApprovedRoot) throw new Error(`The requested path is outside the approved folder: ${fileToolsRoot}`)
        try {
          const files = await window.localAI.listFolderFiles(requestedPath)
          const fileText = files.length ? files.map((file) => `- ${file}`).join('\n') : '(The folder is empty.)'
          setMessagesByChat((items) => ({ ...items, [selectedChat]: [...(items[selectedChat] || []), { role: 'assistant', text: `확인했습니다.\n\n**${requestedPath}** 안의 파일 목록입니다:\n\n${fileText}\n\n이 목록은 Windows의 승인된 로컬 폴더에서 직접 읽었습니다.`, time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }] }))
        } catch {
          const relativePath = requestedPath.slice(fileToolsRoot.length).replace(/^\\+/, '').replaceAll('\\', '/')
          const file = await window.localAI.readTextFile(fileToolsRoot, relativePath)
          setMessagesByChat((items) => ({ ...items, [selectedChat]: [...(items[selectedChat] || []), { role: 'assistant', text: `확인했습니다. **${requestedPath}** 파일의 내용입니다:\n\n${file.text}`, time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }] }))
        }
        setConnection('connected')
      } catch (error) {
        setMessagesByChat((items) => ({ ...items, [selectedChat]: [...(items[selectedChat] || []), { role: 'assistant', text: `로컬 경로를 읽지 못했습니다.\n\n${error instanceof Error ? error.message : 'Unknown file access error'}`, time: 'Just now', error: true }] }))
      } finally { setIsFileQuerying(false); setIsTyping(false) }
      return
    }
    if (false && fileToolsEnabled && fileToolsRoot && fileReadRequestSignals.test(prompt) && !fileWriteRequestSignals.test(prompt) && window.localAI?.listFolderFiles) {
      setIsTyping(true)
      setIsFileQuerying(true)
      try {
        const files = await window.localAI.listFolderFiles(fileToolsRoot)
        const fileText = files.length ? files.map((file) => `- ${file}`).join('\n') : '(The folder is empty.)'
        setMessagesByChat((items) => ({ ...items, [selectedChat]: [...(items[selectedChat] || []), { role: 'assistant', text: `확인했습니다. 현재 승인된 폴더 **${fileToolsRoot}**의 파일 목록입니다:\n\n${fileText}\n\n총 ${files.length}개 파일입니다.`, time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }] }))
        setConnection('connected')
      } catch (error) {
        setMessagesByChat((items) => ({ ...items, [selectedChat]: [...(items[selectedChat] || []), { role: 'assistant', text: `승인된 폴더를 읽지 못했습니다.\n\n${error instanceof Error ? error.message : 'Unknown file access error'}`, time: 'Just now', error: true }] }))
      } finally { setIsFileQuerying(false); setIsTyping(false) }
      return
    }
    if (false && fileToolsEnabled && fileToolsRoot && renameRequestSignals.test(prompt) && window.localAI?.listFolderFiles && window.localAI?.applyRenamePlan) {
      setIsTyping(true)
      try {
        const files = await window.localAI.listFolderFiles(fileToolsRoot)
        if (!files.length) throw new Error('No files found in the selected folder')
        const plannerMessages = [
          { role: 'system', content: 'Create a safe file rename plan for the selected folder. Return JSON only in this exact shape: {"summary":"short Korean summary","renames":[{"from":"relative/path.ext","to":"relative/new-name.ext"}]}. Use only files from the provided list. Keep paths relative, never use .., never change directories, never overwrite, and never include more than 100 items. Do not execute anything.' },
          { role: 'user', content: `${prompt}\n\nFiles in selected folder:\n${files.slice(0, 500).join('\n')}` }
        ]
        const response = await fetch(`${endpoint.replace(/\/$/, '')}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: requestModel, stream: false, think: false, format: 'json', options: { temperature: 0.2, num_ctx: context, num_predict: 768 }, messages: plannerMessages }) })
        if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`)
        const data = await response.json()
        const rawPlan = data.message?.content?.trim() || data.response?.trim() || '{}'
        const plan = JSON.parse(rawPlan.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
        const renames = Array.isArray(plan.renames) ? plan.renames.map((item) => ({ from: String(item.from || ''), to: String(item.to || '') })).filter((item) => item.from && item.to).slice(0, 100) : []
        if (!renames.length) throw new Error('The model did not produce a valid rename plan')
        setMessagesByChat((items) => ({ ...items, [selectedChat]: [...(items[selectedChat] || []), { role: 'assistant', text: plan.summary || `Rename plan prepared for ${renames.length} file(s).`, renamePlan: renames, renameRoot: fileToolsRoot, time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }] }))
      } catch (error) {
        setMessagesByChat((items) => ({ ...items, [selectedChat]: [...(items[selectedChat] || []), { role: 'assistant', text: `Could not prepare a safe rename plan: ${error instanceof Error ? error.message : 'Unknown error'}`, time: 'Just now', error: true }] }))
      } finally { setIsTyping(false) }
      return
    }
    if (false && fileToolsEnabled && fileToolsRoot && fileWriteRequestSignals.test(prompt) && window.localAI?.listFolderFiles && window.localAI?.applyFilePlan) {
      setIsTyping(true)
      try {
        const files = await window.localAI.listFolderFiles(fileToolsRoot)
        const plannerMessages = [
          { role: 'system', content: 'Create a safe file operation plan for the selected folder. Return JSON only in this exact shape: {"summary":"short Korean summary","operations":[{"type":"rename|move|copy|write|mkdir|delete","from":"relative/path","to":"relative/path","path":"relative/path","content":"text for write"}]}. Use only files from the provided list for source paths. Keep every path relative, never use .., never access another folder, never overwrite an existing destination, and never include more than 100 operations. For delete, use the exact relative path. Do not execute anything.' },
          { role: 'user', content: `${prompt}\n\nFiles in selected folder:\n${files.slice(0, 500).join('\n')}` }
        ]
        const response = await fetch(`${endpoint.replace(/\/$/, '')}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: requestModel, stream: false, think: false, format: 'json', options: { temperature: 0.2, num_ctx: context, num_predict: 1024 }, messages: plannerMessages }) })
        if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`)
        const data = await response.json()
        const rawPlan = data.message?.content?.trim() || data.response?.trim() || '{}'
        const plan = JSON.parse(rawPlan.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
        const operations = Array.isArray(plan.operations) ? plan.operations.map((operation) => ({ type: String(operation.type || '').toLowerCase(), from: operation.from ? String(operation.from) : undefined, to: operation.to ? String(operation.to) : undefined, path: operation.path ? String(operation.path) : undefined, content: operation.content ? String(operation.content) : undefined })).filter((operation) => ['rename', 'move', 'copy', 'write', 'mkdir', 'delete'].includes(operation.type)).slice(0, 100) : []
        if (!operations.length) throw new Error('The model did not produce a valid file operation plan')
        setMessagesByChat((items) => ({ ...items, [selectedChat]: [...(items[selectedChat] || []), { role: 'assistant', text: plan.summary || `File operation plan prepared for ${operations.length} operation(s).`, filePlan: operations, fileRoot: fileToolsRoot, time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }] }))
      } catch (error) {
        setMessagesByChat((items) => ({ ...items, [selectedChat]: [...(items[selectedChat] || []), { role: 'assistant', text: `Could not prepare a safe file operation plan: ${error instanceof Error ? error.message : 'Unknown error'}`, time: 'Just now', error: true }] }))
      } finally { setIsTyping(false) }
      return
    }
    if (currentClockQuestion.test(prompt)) {
      setIsTyping(true)
      const runtime = await window.localAI?.getSystemContext?.()
      const clockNow = runtime?.isoTimestamp ? new Date(runtime.isoTimestamp) : new Date()
      const clockTimeZone = runtime?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown time zone'
      const clockDate = runtime?.localDateTime || new Intl.DateTimeFormat('ko-KR', { dateStyle: 'full', timeStyle: 'long', timeZone: clockTimeZone }).format(clockNow)
      const clockLocation = deviceLocation ? `\nWindows 위치 서비스: 위도 ${deviceLocation.latitude.toFixed(5)}, 경도 ${deviceLocation.longitude.toFixed(5)} (보고된 정확도 약 ${Math.round(deviceLocation.accuracy)}m)` : ''
      const clockAnswer = `컴퓨터의 현재 날짜와 시각은 **${clockDate}**입니다.\n시간대: ${clockTimeZone}\nUTC 기준 시각은 ${clockNow.toISOString()}이며, 위의 현지 시각과 다릅니다.${clockLocation}`
      setMessagesByChat((items) => ({ ...items, [selectedChat]: [...(items[selectedChat] || []), { role: 'assistant', text: clockAnswer, time: clockNow.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }] }))
      setConnection('connected')
      setIsTyping(false)
      return
    }
    setIsTyping(true)
    try {
      let visionText = ''
      if (imageAttachments.length) {
        const visionImages = imageAttachments.map((attachment) => String(attachment.dataUrl || '').replace(/^data:image\/[^;]+;base64,/, '')).filter(Boolean).slice(0, 4)
        if (!visionImages.length) throw new Error('The attached image data is unavailable. Please attach the image again.')
        setIsVisionQuerying(true)
        try {
          const visionResponse = await fetch(`${endpoint.replace(/\/$/, '')}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: visionModel, stream: false, think: false, options: { temperature: 0.1, num_ctx: Math.min(context, 8192), num_predict: 768 }, messages: [{ role: 'system', content: 'You are the vision analysis stage of a local research assistant. Read the attached image carefully. Extract all visible text exactly when legible, describe relevant diagrams/layouts/objects, separate observations from uncertainty, and return a concise structured report for another reasoning model. Do not invent missing text.' }, { role: 'user', content: prompt || 'Analyze this image.', images: visionImages }] }) })
          if (!visionResponse.ok) throw new Error(`Vision model returned HTTP ${visionResponse.status}`)
          const visionData = await visionResponse.json()
          visionText = visionData.message?.content?.trim() || visionData.response?.trim() || ''
          if (!visionText) throw new Error('The vision model returned an empty analysis.')
        } finally { setIsVisionQuerying(false) }
      }
      const fitRequestMessages = (items) => {
        const systemMessages = items.filter((item) => item.role === 'system')
        const recentMessages = items.filter((item) => item.role !== 'system').slice(-7)
        const mergedSystem = systemMessages.length ? [{ role: 'system', content: systemMessages.map((item) => item.content).filter(Boolean).join('\n\n') }] : []
        return [...mergedSystem, ...recentMessages].map((item) => {
          if (typeof item.content !== 'string' || item.content.length <= 3000) return item
          return { ...item, content: `…${item.content.slice(-3000)}` }
        })
      }
      const toTextChatMessage = (message) => ({ role: message.role, content: message.text })
      let requestMessages = fitRequestMessages([...historyMessages, userMessage].map(toTextChatMessage))
      const memoryText = [memory.summary && `Summary: ${memory.summary}`, ...memory.facts.map((fact) => `- ${fact}`)].filter(Boolean).join('\n')
      if (memoryText) requestMessages.unshift({ role: 'system', content: `Long-term local memory. Use only when relevant and do not mention this internal memory unless asked.\n${memoryText}` })
      if (fileToolsEnabled && fileToolsRoot && window.localAI?.listFolderFiles) {
        const pathMatch = prompt.match(explicitWindowsPath)
        if (pathMatch) {
          const requestedPath = pathMatch[0].replace(/[.,!?]+$/, '').replace(/["')\]]+$/, '')
          const rootPrefix = fileToolsRoot.endsWith('\\') ? fileToolsRoot : `${fileToolsRoot}\\`
          const isWithinApprovedRoot = requestedPath.toLowerCase() === fileToolsRoot.toLowerCase() || requestedPath.toLowerCase().startsWith(rootPrefix.toLowerCase())
          if (isWithinApprovedRoot) {
            try {
              const listed = await window.localAI.listFolderFiles(requestedPath)
              requestMessages.unshift({ role: 'system', content: `The application successfully accessed the requested local folder: ${requestedPath}. Its current contents are:\n${listed.length ? listed.map((file) => `- ${file}`).join('\n') : '(The folder is empty.)'}\nDo not claim that the application cannot access this folder.` })
            } catch {
              const relativePath = requestedPath.slice(fileToolsRoot.length).replace(/^\\+/, '').replaceAll('\\', '/')
              try {
                const file = await window.localAI?.readTextFile?.(fileToolsRoot, relativePath)
                if (file) requestMessages.unshift({ role: 'system', content: `The application successfully read the requested local file ${requestedPath}. Use this content in your answer and do not claim that local file access is unavailable.\n\n${file.text}` })
              } catch (error) {
                requestMessages.unshift({ role: 'system', content: `The application attempted to access ${requestedPath} inside the approved folder but could not read it. State the concrete access error instead of claiming that local file access is never available. Error: ${error instanceof Error ? error.message : 'unknown error'}` })
              }
            }
          } else requestMessages.unshift({ role: 'system', content: `The requested path ${requestedPath} is outside the approved file-operation folder ${fileToolsRoot}. Explain that the user must select an approved folder first.` })
        }
      }
      const attachmentText = attached.filter((attachment) => attachment.text).map((attachment) => `### ${attachment.name}\n${attachment.text}`).join('\n\n')
      if (attachmentText) requestMessages.unshift({ role: 'system', content: `The user attached these readable files. Use their contents as source material and cite the filenames when relevant.\n\n${attachmentText.slice(0, 12000)}` })
      if (visionText) requestMessages.unshift({ role: 'system', content: `Vision stage report for the attached image. Treat this as evidence, distinguish observations from uncertainty, and do not claim to have seen pixels directly.\n\n${visionText.slice(0, 12000)}` })
      const runtime = await window.localAI?.getSystemContext?.()
      const requestTime = runtime?.isoTimestamp ? new Date(runtime.isoTimestamp) : new Date()
      const timeZone = runtime?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown time zone'
      const deviceLocale = runtime?.locale || navigator.language || 'Unknown locale'
      const weekday = runtime?.weekday || new Intl.DateTimeFormat(deviceLocale, { weekday: 'long' }).format(requestTime)
      const locationContext = deviceLocation ? `Actual current reading from the Windows location service: latitude ${deviceLocation.latitude.toFixed(5)}, longitude ${deviceLocation.longitude.toFixed(5)}, reported accuracy approximately ${Math.round(deviceLocation.accuracy)} meters, captured ${deviceLocation.capturedAt}. Use these coordinates as the device location for this request. Do not claim that location access is unavailable; mention the reported accuracy when precision matters.` : locationHint.trim() || `Approximate region inferred from the device time zone: ${timeZone}. Exact location is unavailable.`
      const localClock = runtime?.localDateTime || requestTime.toLocaleString(deviceLocale, { dateStyle: 'full', timeStyle: 'long', timeZone })
      requestMessages.unshift({ role: 'system', content: `Authoritative computer clock and calendar captured at request time. LOCAL DATE/TIME: ${localClock}. LOCAL WEEKDAY: ${weekday}. LOCAL TIME ZONE: ${timeZone}. UTC TIMESTAMP (reference only, do not display as local time): ${requestTime.toISOString()}. CALENDAR: Gregorian. LOCATION: ${locationContext}. Treat the local date/time above as the answer for local-time questions. Never substitute the UTC timestamp for local time, and never infer a different weekday from memory.` })
      let sources = []; let data = null; let proposedFilePlan = []
      if (graftEnabled && graftRoot && window.localAI?.askGraft) {
        setIsGraftQuerying(true)
        try {
          const graftResult = await window.localAI.askGraft(prompt, graftRoot)
          const graftText = typeof graftResult === 'string' ? graftResult : graftResult?.text || JSON.stringify(graftResult)
          if (graftText) requestMessages.unshift({ role: 'system', content: `Relevant project context from Graft for the selected repository. Use exact file paths and line references when available. Do not invent code that is not present in this context.\n\n${graftText.slice(0, 12000)}` })
        } catch { setGraftStatus('error') }
        finally { setIsGraftQuerying(false) }
      }
      const shouldSearchWeb = webSearchEnabled || (imageAttachments.length > 0 && webSearchIntentSignals.test(prompt))
      const webTools = shouldSearchWeb ? [{ type: 'function', function: { name: 'web_search', description: 'Search the public web for current information.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } }, { type: 'function', function: { name: 'web_open', description: 'Open and read one public web result.', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } } }] : []
      const fileTools = fileToolsEnabled && fileToolsRoot ? [{ type: 'function', function: { name: 'file_list', description: 'List files inside the user-approved folder. Use this when the user asks what files or folders exist.', parameters: { type: 'object', properties: {}, additionalProperties: false } } }, { type: 'function', function: { name: 'file_read', description: 'Read one plain-text file inside the user-approved folder. Use a relative path only. Never use absolute paths or ..', parameters: { type: 'object', properties: { relative_path: { type: 'string' } }, required: ['relative_path'] } } }, { type: 'function', function: { name: 'file_propose_operations', description: 'Propose file creation, writing, editing, copying, moving, renaming, or deleting operations. This tool is planning-only and never changes files. Use it when the user requests a file change.', parameters: { type: 'object', properties: { operations: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', enum: ['rename', 'move', 'copy', 'write', 'mkdir', 'delete'] }, from: { type: 'string' }, to: { type: 'string' }, path: { type: 'string' }, content: { type: 'string' } }, required: ['type'] } } }, required: ['operations'] } } }] : []
      const availableTools = [...webTools, ...fileTools]
      for (let step = 0; step < (availableTools.length ? 3 : 1); step += 1) {
        if (step === 0 && availableTools.length) requestMessages.unshift({ role: 'system', content: `${webTools.length ? 'You have bounded web_search and web_open tools. When current information is requested, call web_search first, then web_open for the most relevant results. Use only returned page text, cite URLs, and state when a page could not be read. Never invent current facts.' : ''}${fileTools.length ? ' You also have bounded file_list and file_read tools for the user-approved folder. When the user asks about local files, call file_list or file_read instead of claiming that you cannot access the computer. These tools are read-only.' : ''}` })
        requestMessages = fitRequestMessages(requestMessages)
        const response = await fetch(`${endpoint.replace(/\/$/, '')}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: requestModel, stream: false, think: false, tools: availableTools, options: { temperature, num_ctx: context, num_predict: requestModel === FAST_MODEL ? 512 : 768 }, messages: requestMessages }) })
        if (!response.ok) {
          const detail = await response.text().catch(() => '')
          throw new Error(`Ollama returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ''}`)
        }
        data = await response.json(); const calls = data.message?.tool_calls || []
        if (!calls.length || !availableTools.length) break
        requestMessages.push(data.message); setIsSearching(Boolean(webTools.length)); setIsFileQuerying(Boolean(fileTools.length))
        for (const call of calls.slice(0, 3)) {
          const name = call.function?.name; const rawArgs = call.function?.arguments || {}
          const args = typeof rawArgs === 'string' ? (() => { try { return JSON.parse(rawArgs) } catch { return {} } })() : rawArgs
          if (name === 'web_search') { const found = await window.localAI?.searchWeb(String(args.query || prompt)) || []; sources.push(...found); requestMessages.push({ role: 'tool', content: JSON.stringify(found), name }) }
          else if (name === 'web_open') { try { const page = await window.localAI?.openWebPage(String(args.url || '')); if (page) { sources.push({ title: page.title, url: page.url }); requestMessages.push({ role: 'tool', content: JSON.stringify(page), name }) } } catch { requestMessages.push({ role: 'tool', content: JSON.stringify({ error: 'PAGE_UNREADABLE' }), name }) } }
          else if (name === 'file_list') { try { const files = await window.localAI?.listFolderFiles(fileToolsRoot) || []; requestMessages.push({ role: 'tool', content: JSON.stringify({ root: fileToolsRoot, files: files.slice(0, 500) }), name }) } catch { requestMessages.push({ role: 'tool', content: JSON.stringify({ error: 'FOLDER_UNREADABLE' }), name }) } }
          else if (name === 'file_read') { try { const file = await window.localAI?.readTextFile(fileToolsRoot, String(args.relative_path || '')); requestMessages.push({ role: 'tool', content: JSON.stringify(file), name }) } catch { requestMessages.push({ role: 'tool', content: JSON.stringify({ error: 'FILE_UNREADABLE' }), name }) } }
          else if (name === 'file_propose_operations') { proposedFilePlan = Array.isArray(args.operations) ? args.operations.filter((operation) => ['rename', 'move', 'copy', 'write', 'mkdir', 'delete'].includes(String(operation.type || '').toLowerCase())).map((operation) => ({ type: String(operation.type).toLowerCase(), from: operation.from ? String(operation.from) : undefined, to: operation.to ? String(operation.to) : undefined, path: operation.path ? String(operation.path) : undefined, content: operation.content ? String(operation.content) : undefined })).slice(0, 100) : []; requestMessages.push({ role: 'tool', content: JSON.stringify({ status: 'approval_required', operations: proposedFilePlan }), name }) }
        }
        setIsSearching(false); setIsFileQuerying(false)
      }
      const sourceFooter = sources.length ? `\n\nSources consulted: ${sources.map((source) => source.title).filter(Boolean).join(' · ')}` : ''
      const answer = data?.message?.content?.trim() || data?.response?.trim() || data?.message?.thinking?.trim() || 'The local model returned an empty response.'
      let finalAnswer = answer
      if (visionText && models.includes(FAST_MODEL)) {
        setIsVerifying(true)
        try {
          const verificationResponse = await fetch(`${endpoint.replace(/\/$/, '')}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: FAST_MODEL, stream: false, think: false, options: { temperature: 0.1, num_ctx: Math.min(context, 8192), num_predict: 768 }, messages: [{ role: 'system', content: 'You are the verification stage of a local research assistant. Review the draft answer against the original request, the vision report, and the listed web sources. Correct unsupported claims, preserve useful detail, and return only the final answer in the user language. Do not mention internal stages or pretend to see the image directly.' }, { role: 'user', content: `Original request:\n${prompt}\n\nVision report:\n${visionText.slice(0, 9000)}\n\nWeb/source context:\n${sources.map((source) => `${source.title} — ${source.url}`).join('\n').slice(0, 5000)}\n\nDraft answer:\n${answer.slice(0, 12000)}` }] }) })
          if (verificationResponse.ok) {
            const verificationData = await verificationResponse.json()
            const verified = verificationData.message?.content?.trim() || verificationData.response?.trim()
            if (verified) finalAnswer = verified
          }
        } finally { setIsVerifying(false) }
      }
      const assistantMessage = { role: 'assistant', text: `${finalAnswer}${sourceFooter}`, sources: sources.map(({ title, url }) => ({ title, url })), filePlan: proposedFilePlan, fileRoot: fileToolsRoot, time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }
      if (pdfRequested && window.localAI?.exportConversationPdf) {
        try {
          const title = chats.find((chat) => chat.id === selectedChat)?.title || 'Local AI exchange'
          assistantMessage.pdfPath = await window.localAI.exportConversationPdf({ title: `${title} - exchange`, messages: [userMessage, assistantMessage], autoSave: true })
        } catch {}
      }
      setMessagesByChat((items) => ({ ...items, [selectedChat]: [...(items[selectedChat] || []), assistantMessage] }))
      void updateLongTermMemory(userMessage, assistantMessage, requestModel)
      setConnection('connected')
    } catch (error) {
      setConnection('offline')
      const detail = error instanceof Error ? error.message : 'Unknown local model error'
      setMessagesByChat((items) => ({ ...items, [selectedChat]: [...(items[selectedChat] || []), { role: 'assistant', text: `Local AI request failed: ${detail}\n\nOllama may still be loading the model, or the request may have exceeded the available context. Try again after a moment.`, time: 'Just now', error: true }] }))
    } finally { setIsTyping(false) }
  }

  async function regenerateMessage(messageIndex) {
    if (isTyping) return
    const target = messages[messageIndex]
    if (!target || target.role !== 'assistant') return
    const previousUserMessage = [...messages.slice(0, messageIndex)].reverse().find((message) => message.role === 'user')
    if (!previousUserMessage?.text) return
    await sendMessage(undefined, { prompt: previousUserMessage.text, attachments: previousUserMessage.attachments || [], replaceAssistantIndex: messageIndex })
  }

  async function copyTextToClipboard(text) {
    try {
      if (window.localAI?.copyText) {
        await window.localAI.copyText(text)
        return true
      }
    } catch {}
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {}
    return false
  }

  async function copyLast() {
    const last = [...messages].reverse().find((message) => message.role === 'assistant')
    if (!last) return
    setCopyFailed(false)
    const success = await copyTextToClipboard(last.text)
    if (!success) {
      setCopyFailed(true)
      setTimeout(() => setCopyFailed(false), 2200)
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  const connectionLabel = connection === 'connected' ? 'Connected' : connection === 'checking' ? 'Checking…' : connection === 'offline' ? 'Offline' : 'Ready to connect'
  const displayTimeZone = systemContext?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown time zone'
  const displayWeekday = systemContext?.weekday || new Intl.DateTimeFormat(navigator.language || 'ko-KR', { weekday: 'long' }).format(currentTime)
  const approvalDescriptions = approvalRequest?.plan.map((operation) => formatFileOperation(operation)) || []
  const approvalAction = approvalRequest?.kind === 'file' ? 'Approve & apply' : 'Approve & rename'

  return (
    <div className={`app-shell theme-${theme} ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      <button type="button" className="mobile-sidebar-toggle" onClick={() => setSidebarOpen((open) => !open)} aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'} title={sidebarOpen ? 'Close navigation' : 'Open navigation'}><Icon name="Menu" size={21} /></button>
      {isNarrowViewport && sidebarOpen && <button type="button" className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" />}
      <aside className="sidebar ollama-sidebar">
        <div className="ollama-sidebar-top"><button className="icon-button subtle" aria-label="Menu" onClick={() => isNarrowViewport && setSidebarOpen(false)}><Icon name="Menu" size={20} /></button></div>
        <nav className="ollama-nav" aria-label="Local AI workspace">
          <button className="sidebar-new-chat" onClick={startNewChat} aria-label="Create new chat" title="Create new chat"><Icon name="Plus" /><span>New chat</span><kbd>Ctrl N</kbd></button>
          <button className="nav-item" onClick={() => setShowSettings(true)}><Icon name="Settings2" />Settings</button>
          <button className="nav-item theme-nav-item" onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme"><Icon name={theme === 'dark' ? 'Sun' : 'Moon'} />Theme: {theme === 'dark' ? 'Dark' : 'Light'}</button>
        </nav>
        <div className="conversation-section ollama-conversations"><div className="section-header"><span>{showArchived ? 'Archived' : 'Today'}</span><button type="button" className="archive-filter" onClick={() => setShowArchived((visible) => !visible)}>{showArchived ? 'Recent' : 'Archive'}</button></div><div className="chat-list">{visibleChats.map((chat) => <div key={chat.id} className={`chat-item-row ${draggingChat === chat.id ? 'dragging' : ''}`} draggable onDragStart={() => setDraggingChat(chat.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { moveChat(draggingChat, chat.id); setDraggingChat(null) }} onDragEnd={() => setDraggingChat(null)}><button className={`chat-item ${selectedChat === chat.id ? 'selected' : ''}`} onClick={() => selectChat(chat.id)}><span className="chat-copy"><strong>{chat.title}</strong><small>{chat.preview}</small></span></button><div className="chat-actions"><button type="button" onClick={() => archiveChat(chat.id)} aria-label={chat.archived ? 'Restore conversation' : 'Archive conversation'} title={chat.archived ? 'Restore' : 'Archive'}><Icon name="Archive" size={13} /></button><button type="button" onClick={() => deleteChat(chat.id)} aria-label="Delete conversation" title="Delete"><Icon name="Trash2" size={13} /></button></div></div>)}</div></div>
      </aside>

      <main className="main-panel">
        <header className="topbar"><div className="mobile-brand"><div className="brand-mark"><Icon name="Sparkles" size={15} /></div><span>Local <i>/</i> AI</span></div><div className="breadcrumb"><span>Conversations</span><span className="slash">/</span><strong>{chats.find((chat) => chat.id === selectedChat)?.title || 'New conversation'}</strong></div><div className="top-actions"><div className={`connection-mini ${connection}`}><span className="status-dot" />{connectionLabel}</div><button className="icon-button" aria-label="Help"><Icon name="CircleHelp" /></button><button className="icon-button" aria-label="More options"><Icon name="MoreHorizontal" /></button></div></header>
        <section ref={chatAreaRef} className="chat-area" onScroll={handleChatScroll}>
          <div className="chat-inner">
            {messages.length === 0 ? <div className="empty-state"><div className="empty-icon"><Icon name="Sparkles" size={21} /></div><h1>What’s on your mind?</h1><p>Private, local conversations. No cloud required.</p><div className="starter-grid"><button onClick={() => setDraft('Help me plan a focused workday')}><span><Icon name="Gauge" /></span>Plan my day<small>Turn a thought into a plan</small></button><button onClick={() => setDraft('Review this idea and suggest improvements')}><span><Icon name="Code2" /></span>Review an idea<small>Get a second perspective</small></button></div></div> : <><div className="date-divider"><span>Today</span></div>{messages.map((message, index) => <Message key={`${message.role}-${index}`} message={message} onCopy={copyLast} onCopyText={copyTextToClipboard} onRegenerate={() => regenerateMessage(index)} onExport={() => exportExchange(index)} onApplyRename={(plan, root) => requestRenameApproval(index, plan, root)} onApplyFile={(plan, root) => requestFileApproval(index, plan, root)} onCancelRename={() => cancelRename(index)} onUndoRename={() => undoRename(index)} onUndoFile={() => undoFile(index)} copied={copied && index === messages.length - 1} copyFailed={copyFailed && index === messages.length - 1} />)}{isTyping && <div className="message assistant"><div className="message-avatar"><Icon name="Sparkles" size={14} /></div><div className="message-content"><div className="typing"><span /><span /><span /></div><small className="model-note">{isVisionQuerying ? `Reading image with ${VISION_MODEL}…` : isGraftQuerying ? 'Reading project context…' : isFileQuerying ? 'Reading local files…' : isSearching ? 'Searching the web…' : isVerifying ? 'Checking the answer…' : `${model} is thinking locally`}</small></div></div>}</>}
          </div>
          {!isAtLatest && <button className="jump-latest" onClick={scrollToLatest}><Icon name="ArrowDown" size={14} />Latest</button>}
        </section>
        <form className="composer-wrap" onSubmit={sendMessage}><div className={`composer ollama-composer ${isDragOver ? 'drag-over' : ''}`} onDragEnter={(event) => { event.preventDefault(); setIsDragOver(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (event.currentTarget === event.target) setIsDragOver(false) }} onDrop={(event) => { event.preventDefault(); setIsDragOver(false); addBrowserFiles(event.dataTransfer.files) }}>{draftAttachments.length > 0 && <div className="attachment-chips">{draftAttachments.map((attachment, index) => <div className="attachment-chip" key={`${attachment.name}-${index}`}>{attachment.dataUrl && <img src={attachment.dataUrl} alt="" />}{!attachment.dataUrl && <Icon name={attachment.type === 'pdf' ? 'FileText' : attachment.type === 'audio' ? 'AudioLines' : attachment.type === 'image' ? 'Image' : 'Paperclip'} size={13} />}<span>{attachment.name}</span><button type="button" onClick={() => setDraftAttachments((items) => items.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${attachment.name}`}><Icon name="X" size={12} /></button></div>)}</div>}<textarea autoFocus ref={textareaRef} value={draft} onChange={(event) => setDraft(event.target.value)} onPaste={handlePaste} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(event) } }} placeholder={isDragOver ? 'Drop files to attach' : 'Send a message'} rows="1" /><div className="composer-bottom"><div className="composer-tools"><div className="composer-plus-wrap"><button type="button" className="composer-icon composer-plus" onClick={() => setShowAttachmentMenu((open) => !open)} aria-label="Attachments and more" aria-expanded={showAttachmentMenu}><Icon name="Plus" /></button>{showAttachmentMenu && <div className="plus-menu"><button type="button" onClick={addAttachments}><Icon name="Paperclip" size={14} /><span>Attach files<small>Images, PDF, documents, audio</small></span></button><button type="button" onClick={exportLatestExchange} disabled={!messages.some((message) => message.role === 'assistant')}><Icon name="FileDown" size={14} /><span>Export latest exchange<small>Question + answer as PDF</small></span></button></div>}</div><button type="button" className={`composer-icon file-tools-toggle ${fileToolsEnabled && fileToolsRoot ? 'active' : ''}`} onClick={() => fileToolsRoot ? setFileToolsEnabled((enabled) => !enabled) : setShowSettings(true)} aria-label="File tools" aria-pressed={fileToolsEnabled && Boolean(fileToolsRoot)}><Icon name="Folder" /></button><button type="button" className={`composer-icon graft-toggle ${graftEnabled && graftRoot ? 'active' : ''}`} onClick={() => graftRoot ? setGraftEnabled((enabled) => !enabled) : setShowSettings(true)} aria-label="Project context" aria-pressed={graftEnabled && Boolean(graftRoot)}><Icon name="Code2" /></button><button type="button" className={`composer-icon web-search-toggle ${webSearchEnabled ? 'active' : ''}`} onClick={() => setWebSearchEnabled((enabled) => !enabled)} aria-label="Web search" aria-pressed={webSearchEnabled}><Icon name="Globe" /></button><span className="local-only"><span className="status-dot" />{fileToolsEnabled && fileToolsRoot ? 'File tools' : graftEnabled && graftRoot ? webSearchEnabled ? 'Web + Graft' : 'Graft + local' : webSearchEnabled ? 'Web + local' : connection === 'connected' ? 'Connected' : 'Local'}</span>{exportStatus && <span className="export-status">{exportStatus}</span>}</div><div className="composer-send"><div className="model-select-wrap composer-model"><button type="button" className="model-select" onClick={() => setShowRoutingMenu(!showRoutingMenu)}><span>{mode === 'auto' ? 'Auto' : mode === 'fast' ? 'Fast' : 'Precision'}</span><small>{mode === 'auto' ? 'Fast / Precision' : model}</small><Icon name="ChevronDown" size={15} /></button>{showRoutingMenu && <div className="model-menu routing-menu"><button type="button" onClick={() => selectMode('auto')}><span><strong>Auto</strong><small>Choose by task</small></span>{mode === 'auto' && <Icon name="Check" size={13} />}</button><button type="button" onClick={() => selectMode('fast')}><span><strong>Fast</strong><small>qwen3.5:9b</small></span>{mode === 'fast' && <Icon name="Check" size={13} />}</button><button type="button" onClick={() => selectMode('precision')}><span><strong>Precision</strong><small>Ornith:latest</small></span>{mode === 'precision' && <Icon name="Check" size={13} />}</button></div>}</div><button className="send-button" type="submit" disabled={!draft.trim() || isTyping} aria-label="Send message"><Icon name="ArrowUp" size={17} strokeWidth={2.2} /></button></div></div></div></form>
      </main>

      <aside className="inspector"><div className="inspector-header"><div><span className="eyebrow">Workspace</span><h2>Local engine</h2></div><button className="icon-button"><Icon name="SlidersHorizontal" /></button></div><div className="engine-card"><div className="engine-top"><div className="engine-icon"><Icon name="SquareTerminal" size={18} /></div><div><strong>Ollama</strong><small>Local inference engine</small></div><div className={`engine-status ${connection}`}><span className="status-dot" /></div></div><div className="engine-url">{endpoint.replace(/^https?:\/\//, '')}</div><button className="test-button" onClick={testConnection} disabled={connection === 'checking'}><Icon name={connection === 'checking' ? 'RefreshCw' : 'Wifi'} size={15} />{connection === 'checking' ? 'Testing connection…' : 'Test connection'}</button></div><div className="inspector-block"><div className="block-heading"><span>Model</span><span className="muted">{models.length} available</span></div><div className="model-select-wrap"><button className="model-select" onClick={() => setShowModelMenu(!showModelMenu)}><span className="model-orb"><Icon name="Bot" size={14} /></span><span>{model}</span><Icon name="ChevronDown" size={15} /></button>{showModelMenu && <div className="model-menu">{models.map((item) => <button key={item} onClick={() => { setModel(item); setShowModelMenu(false) }}><span className={`model-orb ${item === model ? 'selected' : ''}`}><Icon name={item === model ? 'Check' : 'Bot'} size={13} /></span>{item}{item === model && <Icon name="Check" size={13} />}</button>)}</div>}</div></div><div className="inspector-block"><div className="block-heading"><span>Generation</span><button className="reset-button" onClick={() => { setTemperature(0.7); setContext(8192) }}>Reset</button></div><label className="range-label"><span>Temperature</span><strong>{temperature.toFixed(1)}</strong></label><input className="range" type="range" min="0" max="1.4" step="0.1" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} /><div className="range-hints"><span>Precise</span><span>Creative</span></div><label className="field-label"><span>Context window</span><select value={context} onChange={(event) => setContext(Number(event.target.value))}><option value="4096">4,096 tokens</option><option value="8192">8,192 tokens</option><option value="16384">16,384 tokens</option><option value="32768">32,768 tokens</option></select></label></div><div className="inspector-block details-block"><div className="block-heading"><span>Session details</span></div><div className="detail-row"><span><Icon name="Zap" size={14} />Runtime</span><strong>CPU · Metal</strong></div><div className="detail-row"><span><Icon name="Archive" size={14} />History</span><strong>Auto-saved</strong></div><div className="detail-row"><span><Icon name="GitBranch" size={14} />Privacy</span><strong className="green-text">On-device</strong></div></div><div className="inspector-help"><Icon name="CircleHelp" size={15} /><span>Need help connecting a model?<br /><button onClick={() => setShowSettings(true)}>Open setup guide →</button></span></div></aside>

      {showSettings && <div className="modal-backdrop" onClick={() => setShowSettings(false)}><div className="settings-modal" onClick={(event) => event.stopPropagation()}><div className="modal-header"><div><span className="eyebrow">Configuration</span><h2>Connection settings</h2></div><button className="icon-button" onClick={() => setShowSettings(false)}><Icon name="X" /></button></div><label className="modal-label">Ollama endpoint<input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="http://127.0.0.1:11434" /></label><div className="runtime-context-card"><span>Current device calendar</span><strong>{systemContext?.localDateTime || currentTime.toLocaleString()}</strong><small>{displayWeekday} · {displayTimeZone} · Gregorian calendar</small><span>Device location</span><strong className={locationStatus === 'ready' ? 'location-ready' : ''}>{locationStatus === 'ready' ? 'Read from Windows' : locationStatus === 'checking' ? 'Reading…' : 'Unavailable'}</strong><small>{deviceLocation ? `${deviceLocation.latitude.toFixed(5)}, ${deviceLocation.longitude.toFixed(5)} · ±${Math.round(deviceLocation.accuracy)}m` : 'Windows location permission or service is unavailable'}</small><button type="button" className="secondary-button location-button" onClick={requestDeviceLocation}><Icon name="MapPin" size={14} />Detect location</button></div><label className="modal-label location-label">Location hint (optional)<input value={locationHint} onChange={(event) => setLocationHint(event.target.value)} placeholder="e.g. Seoul, South Korea" /></label><p className="modal-copy">The exact clock, date, weekday, and time zone are captured automatically for every request. A detected location or location hint is kept on this device and sent only to the local model.</p><div className="graft-settings"><label className="modal-label">Shared project folder (Graft + file tools)<div className="graft-path-row"><input value={graftRoot} onChange={(event) => { setGraftRoot(event.target.value); setFileToolsRoot(event.target.value) }} placeholder="Choose a code project folder" /><button type="button" className="secondary-button" onClick={chooseGraftFolder}><Icon name="FolderOpen" size={14} />Browse</button></div></label><div className="graft-actions"><button type="button" className="secondary-button" disabled={!graftRoot || graftStatus === 'building'} onClick={buildGraftIndex}>{graftStatus === 'building' ? 'Building…' : 'Build Graft index'}</button><span className={`graft-status ${graftStatus}`}>{graftStatus === 'ready' ? 'Ready' : graftStatus === 'building' ? 'Building index…' : graftStatus === 'error' ? 'Needs attention' : 'Not configured'}</span></div><p className="modal-copy">Changing this folder updates both Graft and file tools. The new Graft index is built automatically after Browse.</p></div><div className="file-tools-settings"><p className="modal-copy">File tools are linked to the shared project folder. They can read and propose renames only inside it. Every rename requires a preview and your confirmation.</p></div><div className="update-settings"><div className="block-heading"><span>Software updates</span><span className="muted">Current {appVersion || 'installed version'}</span></div><label className="modal-label">Update feed folder<div className="graft-path-row"><input value={updateFeedPath} onChange={(event) => { setUpdateFeedPath(event.target.value); setUpdateInfo(null) }} placeholder="Folder containing Local AI Setup *.exe" /><button type="button" className="secondary-button" onClick={chooseUpdateFolder}><Icon name="FolderOpen" size={14} />Browse</button></div></label><div className="update-actions"><button type="button" className="secondary-button" onClick={checkForAppUpdate}>Check for updates</button>{updateInfo?.available && <button type="button" className="primary-button" onClick={installAppUpdate}>Install {updateInfo.version}</button>}</div>{updateStatus && <p className="update-status">{updateStatus}</p>}<p className="modal-copy">The installer upgrades the existing Local AI installation in place. The app closes briefly and reopens after the update.</p></div><p className="modal-copy">Local / AI uses Ollama’s local GPU runtime with the imported Ornith model. Keep Ollama running on this device, then test the connection to refresh the model status.</p><div className="setup-steps"><div><span>1</span><p><strong>Ollama runtime</strong><small>GPU acceleration enabled when available</small></p></div><div><span>2</span><p><strong>Ornith GGUF model</strong><small>Imported as Ornith:latest</small></p></div><div><span>3</span><p><strong>Test connection</strong><small>Refresh model status</small></p></div></div><div className="modal-actions"><button className="secondary-button" onClick={() => setShowSettings(false)}>Cancel</button><button className="primary-button" onClick={() => { setShowSettings(false); testConnection() }}><Icon name="Wifi" size={15} />Save & test</button></div></div></div>}
      {approvalRequest && <div className="modal-backdrop" onClick={cancelRenameApproval}><div className="approval-modal" onClick={(event) => event.stopPropagation()}><div className="modal-header"><div><span className="eyebrow">File permission</span><h2>Approve file changes?</h2></div><button className="icon-button" onClick={cancelRenameApproval}><Icon name="X" /></button></div><p className="modal-copy">The following {approvalRequest.kind === 'file' ? 'file operation' : 'rename operation'} will affect {approvalRequest.plan.length} item(s) inside:</p><div className="approval-path">{approvalRequest.root}</div><div className="rename-plan approval-plan">{approvalDescriptions.slice(0, 12).map((description, index) => <div className="rename-row" key={`${description}-${index}`}><span>{description}</span></div>)}{approvalDescriptions.length > 12 && <small>+ {approvalDescriptions.length - 12} more item(s)</small>}</div><div className="modal-actions"><button className="secondary-button" onClick={cancelRenameApproval}>Cancel</button><button className="primary-button" onClick={approveRename}><Icon name="Check" size={14} />{approvalAction}</button></div></div></div>}
    </div>
  )
}

function formatFileOperation(operation) {
  if (operation.type === 'write') return `write ${operation.path || 'file'}`
  if (operation.type === 'mkdir') return `create folder ${operation.path || 'folder'}`
  if (operation.type === 'delete') return `delete ${operation.path || 'file'}`
  return `${operation.type || 'change'} ${operation.from || ''} → ${operation.to || ''}`
}

function Message({ message, onCopy, onCopyText, onRegenerate, onExport, onApplyRename, onApplyFile, onCancelRename, onUndoRename, onUndoFile, copied, copyFailed }) {
  return <article className={`message ${message.role} ${message.error ? 'error-message' : ''}`}><div className="message-avatar">{message.role === 'assistant' ? <Icon name="Sparkles" size={14} /> : 'A'}</div><div className="message-content"><div className="message-meta"><strong>{message.role === 'assistant' ? 'Local / AI' : 'You'}</strong><time>{message.time}</time>{message.role === 'assistant' && <span className="local-tag"><span className="status-dot" />local</span>}</div><div className="message-text">{message.attachments?.length > 0 && <div className="message-attachments">{message.attachments.map((attachment) => <span key={attachment.name}><Icon name={attachment.type === 'image' ? 'Image' : attachment.type === 'pdf' ? 'FileText' : attachment.type === 'audio' ? 'AudioLines' : 'Paperclip'} size={13} />{attachment.name}</span>)}</div>}{message.text.split('\n').map((line, index) => <React.Fragment key={index}>{line}{index < message.text.split('\n').length - 1 && <br />}</React.Fragment>)}{message.bullets && <ul>{message.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}{message.code && <div className="code-block"><div><span><Icon name="FileCode2" size={14} /> folder structure</span><button onClick={() => onCopyText?.(message.code)}><Icon name="Copy" size={14} /></button></div><pre>{message.code}</pre></div>}{message.sources?.length > 0 && <div className="source-list"><div className="source-heading"><Icon name="Globe" size={13} />Web sources</div>{message.sources.map((source) => <button key={source.url} className="source-link" onClick={() => window.localAI?.openInBrowser(source.url)} title={source.url}><span>{source.title}</span><Icon name="ArrowUpRight" size={13} /></button>)}</div>}{message.pdfPath && <button className="pdf-download" onClick={() => window.localAI?.openPdfFile(message.pdfPath)}><Icon name="FileDown" size={14} />PDF 다운로드</button>}{message.renamePlan?.length > 0 && <div className="rename-plan"><div className="rename-plan-heading"><Icon name="Folder" size={14} />Rename preview</div>{message.renamePlan.map((item) => <div className="rename-row" key={`${item.from}-${item.to}`}><span>{item.from}</span><Icon name="ArrowRight" size={13} /><strong>{item.to}</strong></div>)}<div className="rename-plan-actions"><button type="button" onClick={() => onApplyRename?.(message.renamePlan, message.renameRoot)}><Icon name="Check" size={13} />Request approval</button><button type="button" onClick={() => onCancelRename?.()}><Icon name="X" size={13} />Cancel</button></div></div>}{message.filePlan?.length > 0 && <div className="rename-plan"><div className="rename-plan-heading"><Icon name="Folder" size={14} />File operation preview</div>{message.filePlan.map((operation, index) => <div className="rename-row" key={`${operation.type}-${operation.path || operation.from || index}`}><span>{formatFileOperation(operation)}</span></div>)}<div className="rename-plan-actions"><button type="button" onClick={() => onApplyFile?.(message.filePlan, message.fileRoot)}><Icon name="Check" size={13} />Request approval</button><button type="button" onClick={() => onCancelRename?.()}><Icon name="X" size={13} />Cancel</button></div></div>}{message.renameResult && <div className="rename-result"><Icon name="Check" size={14} />Changed {message.renameResult.applied} file(s)<button type="button" onClick={onUndoRename}>Undo</button></div>}{message.fileResult && <div className="rename-result"><Icon name="Check" size={14} />Completed {message.fileResult.applied} file operation(s)<button type="button" onClick={onUndoFile}>Undo</button></div>}</div>{message.role === 'assistant' && <div className="message-actions"><button onClick={onCopy}><Icon name={copied ? 'Check' : 'Copy'} size={13} />{copied ? 'Copied' : copyFailed ? 'Copy failed' : 'Copy'}</button><button onClick={onExport}><Icon name="FileDown" size={13} />PDF</button><button onClick={onRegenerate}><Icon name="RefreshCw" size={13} />Regenerate</button></div>}</div></article>
}

createRoot(document.getElementById('root')).render(<App />)
