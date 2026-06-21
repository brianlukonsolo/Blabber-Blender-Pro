import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  ClipboardPaste,
  Eraser,
  Pause,
  Play,
  Repeat2,
  Scissors,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
  Wand2,
} from 'lucide-react'
import { useSpeechSynthesis } from './hooks/useSpeechSynthesis'
import VoiceSelect from './components/VoiceSelect'
import Slider from './components/Slider'
import { getVoiceDiagnostic, getVoiceKey, isKnownWorkingVoice } from './utils/voices'
import {
  cleanLabText,
  getChunkTypeLabel,
  parseLabChunks,
  prepareSpeechText,
  simpleTextHash,
} from './utils/labText'
import './App.css'

const DEFAULTS = { rate: 1, pitch: 1, volume: 1 }
const DEFAULT_VOICE_NAME = 'Zira'
const STORAGE_KEY = 'text-reader-lab-settings-v1'
const VOICE_DIAGNOSTICS_KEY = 'yapper-voice-diagnostics-v1'

const SAMPLE_TEXT = `Task 1 Introduction

In this room we will enumerate a target, find open services, and answer the task questions.

Run an initial scan:
nmap -sC -sV -oN scans/initial 10.10.10.5

What web server is running on port 80?

Task 2 Web Enumeration

Use gobuster to search for hidden directories.
gobuster dir -u http://10.10.10.5 -w /usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt
`

const PRESETS = {
  normal: {
    label: 'Normal',
    rate: 1,
    pitch: 1,
    splitCommands: false,
    skipCodeBlocks: false,
    slowCommands: false,
    spellTechnical: false,
  },
  technical: {
    label: 'Technical',
    rate: 0.95,
    pitch: 1,
    splitCommands: true,
    skipCodeBlocks: false,
    slowCommands: true,
    spellTechnical: true,
  },
  commands: {
    label: 'Commands',
    rate: 0.82,
    pitch: 0.95,
    splitCommands: true,
    skipCodeBlocks: false,
    slowCommands: true,
    spellTechnical: true,
  },
  skim: {
    label: 'Fast skim',
    rate: 1.45,
    pitch: 1,
    splitCommands: false,
    skipCodeBlocks: true,
    slowCommands: false,
    spellTechnical: true,
  },
}

function loadSettings() {
  try {
    if (typeof localStorage === 'undefined') return {}
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
}

function loadVoiceDiagnostics() {
  try {
    if (typeof localStorage === 'undefined') return {}
    return JSON.parse(localStorage.getItem(VOICE_DIAGNOSTICS_KEY)) || {}
  } catch {
    return {}
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function clampIndex(index, length) {
  if (!length) return 0
  return Math.min(Math.max(index, 0), length - 1)
}

function isEditableTarget(target) {
  const tag = target?.tagName
  return (
    target?.isContentEditable ||
    tag === 'TEXTAREA' ||
    tag === 'INPUT' ||
    tag === 'SELECT'
  )
}

export default function App() {
  const saved = useMemo(loadSettings, [])
  const initialText = saved.text ?? ''
  const initialProgress =
    saved.progress?.textHash === simpleTextHash(initialText)
      ? saved.progress
      : {}

  const {
    supported,
    voices,
    status,
    boundary,
    error,
    clearError,
    speak,
    pause,
    resume,
    cancel,
  } = useSpeechSynthesis()

  const [text, setText] = useState(initialText)
  const [voiceURI, setVoiceURI] = useState(saved.voiceURI ?? '')
  const [rate, setRate] = useState(saved.rate ?? DEFAULTS.rate)
  const [pitch, setPitch] = useState(saved.pitch ?? DEFAULTS.pitch)
  const [volume, setVolume] = useState(saved.volume ?? DEFAULTS.volume)
  const [microsoftOnly, setMicrosoftOnly] = useState(
    saved.microsoftOnly ?? false,
  )
  const [labMode, setLabMode] = useState(saved.labMode ?? true)
  const [profile, setProfile] = useState(saved.profile ?? 'technical')
  const [splitCommands, setSplitCommands] = useState(
    saved.splitCommands ?? true,
  )
  const [skipCodeBlocks, setSkipCodeBlocks] = useState(
    saved.skipCodeBlocks ?? false,
  )
  const [slowCommands, setSlowCommands] = useState(
    saved.slowCommands ?? true,
  )
  const [spellTechnical, setSpellTechnical] = useState(
    saved.spellTechnical ?? true,
  )
  const [redactSecrets, setRedactSecrets] = useState(
    saved.redactSecrets ?? false,
  )
  const [autoAdvance, setAutoAdvance] = useState(saved.autoAdvance ?? true)
  const [activeChunkIndex, setActiveChunkIndex] = useState(
    initialProgress.activeChunkIndex ?? 0,
  )
  const [completedChunkIds, setCompletedChunkIds] = useState(
    initialProgress.completedChunkIds ?? [],
  )
  const [selection, setSelection] = useState({ start: 0, end: 0 })
  const [activeSnippet, setActiveSnippet] = useState(null)
  const [sideTab, setSideTab] = useState('playback')
  const [voiceDiagnostics, setVoiceDiagnostics] = useState(loadVoiceDiagnostics)
  const [diagnosticRun, setDiagnosticRun] = useState({
    current: '',
    running: false,
    tested: 0,
    total: 0,
  })

  const textareaRef = useRef(null)
  const autoAdvanceRef = useRef(autoAdvance)
  const playChunkRef = useRef(null)
  const diagnosticAbortRef = useRef(null)

  const chunks = useMemo(
    () => parseLabChunks(text, { labMode, splitCommands }),
    [text, labMode, splitCommands],
  )
  const textHash = useMemo(() => simpleTextHash(text), [text])
  const completedSet = useMemo(
    () => new Set(completedChunkIds),
    [completedChunkIds],
  )

  const selectedVoice = useMemo(
    () => voices.find((voice) => voice.voiceURI === voiceURI) || null,
    [voices, voiceURI],
  )
  const selectedVoiceDiagnostic = useMemo(
    () =>
      selectedVoice
        ? getVoiceDiagnostic(selectedVoice, voiceDiagnostics)
        : null,
    [selectedVoice, voiceDiagnostics],
  )

  const isSpeaking = status === 'speaking'
  const isPaused = status === 'paused'
  const isActive = isSpeaking || isPaused
  const activeChunk = chunks[activeChunkIndex] || null

  const selectedText = useMemo(() => {
    const start = Math.min(selection.start, selection.end)
    const end = Math.max(selection.start, selection.end)
    return text.slice(start, end)
  }, [selection, text])

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0
  const charCount = text.length
  const completedCount = chunks.filter((chunk) => completedSet.has(chunk.id))
    .length
  const progressPercent = chunks.length
    ? Math.round((completedCount / chunks.length) * 100)
    : 0

  useEffect(() => {
    autoAdvanceRef.current = autoAdvance
  }, [autoAdvance])

  useEffect(() => {
    try {
      localStorage.setItem(
        VOICE_DIAGNOSTICS_KEY,
        JSON.stringify(voiceDiagnostics),
      )
    } catch {
      // Ignore quota errors.
    }
  }, [voiceDiagnostics])

  useEffect(() => {
    if (!voices.length) return
    const stillThere = voices.some((voice) => voice.voiceURI === voiceURI)
    if (voiceURI && stillThere) return

    const nameRe = new RegExp(DEFAULT_VOICE_NAME, 'i')
    const offline = (voice) => voice.localService !== false
    const english = voices.filter((voice) => /^en(-|$)/i.test(voice.lang))
    const preferred =
      english.find((voice) => nameRe.test(voice.name) && offline(voice)) ||
      english.find((voice) => /microsoft/i.test(voice.name) && offline(voice)) ||
      english.find((voice) => offline(voice)) ||
      english.find((voice) => voice.default) ||
      english[0] ||
      voices.find((voice) => voice.default) ||
      voices[0]

    if (preferred) setVoiceURI(preferred.voiceURI)
  }, [voices, voiceURI])

  useEffect(() => {
    setActiveChunkIndex((index) => clampIndex(index, chunks.length))
    setCompletedChunkIds((ids) =>
      ids.filter((id) => chunks.some((chunk) => chunk.id === id)),
    )
  }, [chunks])

  useEffect(() => {
    const payload = {
      text,
      voiceURI,
      rate,
      pitch,
      volume,
      microsoftOnly,
      labMode,
      profile,
      splitCommands,
      skipCodeBlocks,
      slowCommands,
      spellTechnical,
      redactSecrets,
      autoAdvance,
      progress: {
        textHash,
        activeChunkIndex,
        completedChunkIds,
      },
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // Ignore quota errors.
    }
  }, [
    activeChunkIndex,
    autoAdvance,
    completedChunkIds,
    labMode,
    microsoftOnly,
    pitch,
    profile,
    rate,
    redactSecrets,
    skipCodeBlocks,
    slowCommands,
    spellTechnical,
    splitCommands,
    text,
    textHash,
    voiceURI,
    volume,
  ])

  const isPlayableChunk = useCallback(
    (chunk) => Boolean(chunk) && !(skipCodeBlocks && chunk.type === 'code'),
    [skipCodeBlocks],
  )

  const findPlayableFrom = useCallback(
    (index, direction, includeStart = false) => {
      if (!chunks.length) return null
      let cursor = includeStart ? index : index + direction

      while (cursor >= 0 && cursor < chunks.length) {
        if (isPlayableChunk(chunks[cursor])) return cursor
        cursor += direction
      }

      return null
    },
    [chunks, isPlayableChunk],
  )

  const getPlayableIndex = useCallback(
    (index) => {
      if (!chunks.length) return null
      const clamped = clampIndex(index, chunks.length)
      if (isPlayableChunk(chunks[clamped])) return clamped
      return (
        findPlayableFrom(clamped, 1, false) ??
        findPlayableFrom(clamped, -1, false)
      )
    },
    [chunks, findPlayableFrom, isPlayableChunk],
  )

  const markCompleted = useCallback((chunkId) => {
    setCompletedChunkIds((ids) =>
      ids.includes(chunkId) ? ids : [...ids, chunkId],
    )
  }, [])

  const getEffectiveRate = useCallback(
    (chunk) => {
      let nextRate = profile === 'skim' ? Math.max(rate, 1.35) : rate
      if (slowCommands && (chunk.type === 'command' || chunk.type === 'code')) {
        nextRate *= 0.78
      }
      return Math.min(2, Math.max(0.5, Number(nextRate.toFixed(2))))
    },
    [profile, rate, slowCommands],
  )

  const buildSpeechText = useCallback(
    (value, chunkType = 'prose') =>
      prepareSpeechText(value, {
        chunkType,
        labMode,
        profile,
        redactSecrets,
        spellTechnical,
      }),
    [labMode, profile, redactSecrets, spellTechnical],
  )

  const playChunk = useCallback(
    (requestedIndex = activeChunkIndex) => {
      const playableIndex = getPlayableIndex(requestedIndex)
      if (playableIndex == null) return

      const chunk = chunks[playableIndex]
      const speechText = buildSpeechText(chunk.text, chunk.type)
      if (!speechText) return

      setActiveSnippet(null)
      setActiveChunkIndex(playableIndex)
      speak(speechText, {
        voice: selectedVoice,
        rate: getEffectiveRate(chunk),
        pitch,
        volume,
        onEnd: ({ reason }) => {
          if (reason !== 'completed') return
          markCompleted(chunk.id)

          if (!autoAdvanceRef.current) return
          const nextIndex = findPlayableFrom(playableIndex, 1, false)
          if (nextIndex != null) {
            window.setTimeout(() => playChunkRef.current?.(nextIndex), 80)
          }
        },
      })
    },
    [
      activeChunkIndex,
      buildSpeechText,
      chunks,
      findPlayableFrom,
      getEffectiveRate,
      getPlayableIndex,
      markCompleted,
      pitch,
      selectedVoice,
      speak,
      volume,
    ],
  )

  useEffect(() => {
    playChunkRef.current = playChunk
  }, [playChunk])

  const updateSelection = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    setSelection({
      start: textarea.selectionStart ?? 0,
      end: textarea.selectionEnd ?? 0,
    })
  }, [])

  const handlePlayPause = useCallback(() => {
    if (isSpeaking) {
      pause()
      return
    }
    if (isPaused) {
      resume()
      return
    }
    playChunk(activeChunkIndex)
  }, [activeChunkIndex, isPaused, isSpeaking, pause, playChunk, resume])

  const handleStop = useCallback(() => {
    cancel()
    setActiveSnippet(null)
  }, [cancel])

  const handleNext = useCallback(() => {
    const next = findPlayableFrom(activeChunkIndex, 1, false)
    if (next == null) return
    if (isActive) playChunk(next)
    else setActiveChunkIndex(next)
  }, [activeChunkIndex, findPlayableFrom, isActive, playChunk])

  const handlePrevious = useCallback(() => {
    const previous = findPlayableFrom(activeChunkIndex, -1, false)
    if (previous == null) return
    if (isActive) playChunk(previous)
    else setActiveChunkIndex(previous)
  }, [activeChunkIndex, findPlayableFrom, isActive, playChunk])

  const handleRepeat = useCallback(() => {
    playChunk(activeChunkIndex)
  }, [activeChunkIndex, playChunk])

  const recordVoiceDiagnostic = useCallback((voice, result) => {
    setVoiceDiagnostics((previous) => ({
      ...previous,
      [getVoiceKey(voice)]: {
        lang: voice.lang,
        localService: voice.localService,
        name: voice.name,
        reason: result.reason || '',
        status: result.status,
        testedAt: new Date().toISOString(),
        voiceURI: voice.voiceURI,
      },
    }))
  }, [])

  const testVoice = useCallback(
    (voice, abort) => {
      if (!supported || !voice) {
        return Promise.resolve({ reason: 'unsupported', status: 'failed' })
      }

      return new Promise((resolve) => {
        const synth = window.speechSynthesis
        let settled = false
        let started = false
        let timer = null

        const finish = (status, reason = '') => {
          if (settled) return
          settled = true
          if (timer) window.clearTimeout(timer)
          if (status !== 'working') synth.cancel()
          resolve(abort?.stopped ? { status: 'canceled' } : { reason, status })
        }

        const utterance = new SpeechSynthesisUtterance(
          'Blabber-Blender Pro voice test.',
        )
        utterance.voice = voice
        utterance.lang = voice.lang || 'en-US'
        utterance.pitch = 1
        utterance.rate = 1
        utterance.volume = Math.max(0.35, Math.min(1, volume || 1))

        utterance.onstart = () => {
          started = true
        }
        utterance.onend = () => finish('working')
        utterance.onerror = (event) => {
          const code = event.error || 'error'
          if (['interrupted', 'canceled'].includes(code) || abort?.stopped) {
            finish('canceled')
            return
          }
          finish('failed', code)
        }

        timer = window.setTimeout(() => {
          finish(started ? 'working' : 'timeout', started ? 'started-no-end' : 'no-start')
        }, 3600)

        synth.cancel()
        window.setTimeout(() => {
          if (abort?.stopped) {
            finish('canceled')
            return
          }
          synth.speak(utterance)
        }, 80)
      })
    },
    [supported, volume],
  )

  const runVoiceDiagnostics = useCallback(
    async (targetVoices) => {
      const list = targetVoices.filter(Boolean)
      if (!supported || !list.length || diagnosticRun.running) return

      cancel()
      clearError()
      setActiveSnippet(null)

      const abort = { stopped: false }
      diagnosticAbortRef.current = abort
      setDiagnosticRun({
        current: '',
        running: true,
        tested: 0,
        total: list.length,
      })

      for (let index = 0; index < list.length; index += 1) {
        if (abort.stopped) break
        const voice = list[index]
        setDiagnosticRun({
          current: voice.name,
          running: true,
          tested: index,
          total: list.length,
        })

        const result = await testVoice(voice, abort)
        if (abort.stopped || result.status === 'canceled') break

        recordVoiceDiagnostic(voice, result)
        setDiagnosticRun({
          current: voice.name,
          running: true,
          tested: index + 1,
          total: list.length,
        })

        await delay(160)
      }

      window.speechSynthesis.cancel()
      diagnosticAbortRef.current = null
      setDiagnosticRun((run) => ({
        ...run,
        current: '',
        running: false,
      }))
    },
    [
      cancel,
      clearError,
      diagnosticRun.running,
      recordVoiceDiagnostic,
      supported,
      testVoice,
    ],
  )

  const handleTestSelectedVoice = useCallback(() => {
    if (selectedVoice) runVoiceDiagnostics([selectedVoice])
  }, [runVoiceDiagnostics, selectedVoice])

  const handleRunAllVoiceDiagnostics = useCallback(() => {
    runVoiceDiagnostics(voices)
  }, [runVoiceDiagnostics, voices])

  const handleStopVoiceDiagnostics = useCallback(() => {
    if (diagnosticAbortRef.current) {
      diagnosticAbortRef.current.stopped = true
    }
    if (supported) window.speechSynthesis.cancel()
    setDiagnosticRun((run) => ({
      ...run,
      current: '',
      running: false,
    }))
  }, [supported])

  const handleReadSelection = useCallback(() => {
    const start = Math.min(selection.start, selection.end)
    const end = Math.max(selection.start, selection.end)
    const value = text.slice(start, end).trim()
    if (!value) return

    setActiveSnippet({ range: { start, end }, label: 'Selection' })
    speak(buildSpeechText(value, 'prose'), {
      voice: selectedVoice,
      rate,
      pitch,
      volume,
      onEnd: () => setActiveSnippet(null),
    })
  }, [
    buildSpeechText,
    pitch,
    rate,
    selectedVoice,
    selection,
    speak,
    text,
    volume,
  ])

  const handleCleanPaste = useCallback(() => {
    const cleaned = cleanLabText(text)
    cancel()
    setText(cleaned)
    setActiveChunkIndex(0)
    setCompletedChunkIds([])
    setActiveSnippet(null)
  }, [cancel, text])

  const handleClear = useCallback(() => {
    cancel()
    setText('')
    setActiveChunkIndex(0)
    setCompletedChunkIds([])
    setActiveSnippet(null)
  }, [cancel])

  const handlePasteClipboard = useCallback(async () => {
    try {
      const clip = await navigator.clipboard.readText()
      if (clip) {
        cancel()
        setText(clip)
        setActiveChunkIndex(0)
        setCompletedChunkIds([])
        setActiveSnippet(null)
      }
    } catch {
      window.alert('Clipboard access was blocked by the browser.')
    }
  }, [cancel])

  const handlePreset = useCallback((key) => {
    const preset = PRESETS[key]
    if (!preset) return
    setProfile(key)
    setRate(preset.rate)
    setPitch(preset.pitch)
    setSplitCommands(preset.splitCommands)
    setSkipCodeBlocks(preset.skipCodeBlocks)
    setSlowCommands(preset.slowCommands)
    setSpellTechnical(preset.spellTechnical)
  }, [])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isEditableTarget(event.target)
      ) {
        return
      }

      if (event.code === 'Space') {
        event.preventDefault()
        handlePlayPause()
      } else if (event.key.toLowerCase() === 's') {
        event.preventDefault()
        handleStop()
      } else if (event.key.toLowerCase() === 'n') {
        event.preventDefault()
        handleNext()
      } else if (event.key.toLowerCase() === 'p') {
        event.preventDefault()
        handlePrevious()
      } else if (event.key.toLowerCase() === 'r') {
        event.preventDefault()
        handleRepeat()
      } else if (event.key === ']') {
        event.preventDefault()
        setRate((value) => Math.min(2, Number((value + 0.05).toFixed(2))))
      } else if (event.key === '[') {
        event.preventDefault()
        setRate((value) => Math.max(0.5, Number((value - 0.05).toFixed(2))))
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    handleNext,
    handlePlayPause,
    handlePrevious,
    handleRepeat,
    handleStop,
  ])

  const canWordHighlight =
    isActive &&
    activeChunk &&
    !activeSnippet &&
    profile === 'normal' &&
    !spellTechnical &&
    !redactSecrets

  const boundaryForText =
    canWordHighlight && boundary
      ? {
          charIndex: activeChunk.start + boundary.charIndex,
          charLength: boundary.charLength,
        }
      : null

  const activeRange =
    activeSnippet?.range ||
    (activeChunk ? { start: activeChunk.start, end: activeChunk.end } : null)

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            <Volume2 size={27} />
          </span>
          <div>
            <h1>Blabber-Blender Pro</h1>
            <p className="tagline">Lab speech workspace</p>
            <p className="tagline-sub">Chunked speech for pasted technical labs.</p>
          </div>
        </div>
        <StatusBadge supported={supported} status={status} />
      </header>

      {!supported && (
        <div className="banner error">
          Your browser does not support the Web Speech API. Use Microsoft Edge
          or Google Chrome.
        </div>
      )}

      {error && (
        <div className="banner error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="banner-close"
            aria-label="Dismiss"
            onClick={clearError}
          >
            x
          </button>
        </div>
      )}

      <section className="topbar" aria-label="Reader setup">
        <label className="toggle-row lab-toggle">
          <input
            type="checkbox"
            checked={labMode}
            onChange={(event) => {
              setLabMode(event.target.checked)
              setActiveChunkIndex(0)
              setCompletedChunkIds([])
            }}
          />
          <span>Lab mode</span>
        </label>

        <div className="preset-tabs" aria-label="Reading presets">
          {Object.entries(PRESETS).map(([key, preset]) => (
            <button
              key={key}
              type="button"
              className={profile === key ? 'active' : ''}
              onClick={() => handlePreset(key)}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="progress-summary">
          <span>
            {completedCount}/{chunks.length} chunks
          </span>
          <div className="progress-track" aria-hidden="true">
            <span style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      </section>

      <main className="workspace">
        <section className="panel editor-panel">
          <div className="panel-title">
            <div>
              <h2>Lab Text</h2>
              <p>{activeChunk ? activeChunk.title : 'Paste a lab into the editor'}</p>
            </div>
            <div className="counts">
              <span>{wordCount} words</span>
              <span>{charCount} chars</span>
            </div>
          </div>

          <HighlightedTextarea
            text={text}
            onChange={setText}
            boundary={boundaryForText}
            currentRange={activeRange}
            disabled={!supported}
            textareaRef={textareaRef}
            onSelectionChange={updateSelection}
          />

          <div className="editor-actions">
            <ActionButton
              icon={Wand2}
              label="Clean paste"
              onClick={handleCleanPaste}
              disabled={!text.trim()}
            />
            <ActionButton
              icon={ClipboardPaste}
              label="Paste"
              onClick={handlePasteClipboard}
            />
            <ActionButton
              icon={Scissors}
              label="Selection"
              onClick={handleReadSelection}
              disabled={!selectedText.trim()}
            />
            <ActionButton
              icon={Play}
              label="Sample"
              onClick={() => {
                cancel()
                setText(SAMPLE_TEXT)
                setActiveChunkIndex(0)
                setCompletedChunkIds([])
              }}
            />
            <ActionButton
              icon={Eraser}
              label="Clear"
              onClick={handleClear}
              disabled={!text}
            />
          </div>
        </section>

        <aside className="panel side-panel">
          <div className="side-tabs" role="tablist" aria-label="Reader panel">
            <button
              type="button"
              id="tab-playback"
              role="tab"
              aria-selected={sideTab === 'playback'}
              aria-controls="panel-playback"
              className={sideTab === 'playback' ? 'active' : ''}
              onClick={() => setSideTab('playback')}
            >
              Playback
            </button>
            <button
              type="button"
              id="tab-sections"
              role="tab"
              aria-selected={sideTab === 'sections'}
              aria-controls="panel-sections"
              className={sideTab === 'sections' ? 'active' : ''}
              onClick={() => setSideTab('sections')}
            >
              Sections
            </button>
          </div>

          <div className="side-tab-content">
            {sideTab === 'playback' ? (
              <section
                id="panel-playback"
                role="tabpanel"
                aria-labelledby="tab-playback"
                className="tab-pane playback-pane"
              >
                <div className="panel-title compact-title">
                  <div>
                    <h2>Playback</h2>
                    <p>
                      {activeSnippet?.label ||
                        (activeChunk
                          ? `${getChunkTypeLabel(activeChunk.type)} ${activeChunkIndex + 1}`
                          : 'No chunk selected')}
                    </p>
                  </div>
                </div>

                <div className="transport">
                  <IconButton
                    icon={SkipBack}
                    label="Previous chunk"
                    onClick={handlePrevious}
                    disabled={!chunks.length}
                  />
                  <IconButton
                    icon={isSpeaking ? Pause : Play}
                    label={isSpeaking ? 'Pause' : isPaused ? 'Resume' : 'Read'}
                    onClick={handlePlayPause}
                    disabled={!supported || !chunks.length}
                    primary
                  />
                  <IconButton
                    icon={Square}
                    label="Stop"
                    onClick={handleStop}
                    disabled={!isActive}
                    danger
                  />
                  <IconButton
                    icon={SkipForward}
                    label="Next chunk"
                    onClick={handleNext}
                    disabled={!chunks.length}
                  />
                  <IconButton
                    icon={Repeat2}
                    label="Repeat"
                    onClick={handleRepeat}
                    disabled={!chunks.length}
                  />
                </div>

                <div className="option-grid playback-options">
                  <Toggle
                    label="Auto advance"
                    checked={autoAdvance}
                    onChange={setAutoAdvance}
                  />
                  <Toggle
                    label="Split commands"
                    checked={splitCommands}
                    onChange={setSplitCommands}
                  />
                  <Toggle
                    label="Skip code blocks"
                    checked={skipCodeBlocks}
                    onChange={setSkipCodeBlocks}
                  />
                  <Toggle
                    label="Slow commands"
                    checked={slowCommands}
                    onChange={setSlowCommands}
                  />
                  <Toggle
                    label="Spell technical text"
                    checked={spellTechnical}
                    onChange={setSpellTechnical}
                  />
                  <Toggle
                    label="Redact secrets"
                    checked={redactSecrets}
                    onChange={setRedactSecrets}
                  />
                </div>

                <VoiceSelect
                  voices={voices}
                  value={voiceURI}
                  onChange={setVoiceURI}
                  microsoftOnly={microsoftOnly}
                  onToggleMicrosoftOnly={setMicrosoftOnly}
                  diagnostics={voiceDiagnostics}
                />

                <div className="diagnostics-panel">
                  <div className="diagnostics-header">
                    <div>
                      <h3>Voice diagnostics</h3>
                      <p>
                        Tests are audible and classify voices from Web Speech
                        events.
                      </p>
                    </div>
                  </div>
                  <div className="diagnostic-actions">
                    <ActionButton
                      icon={Play}
                      label="Test selected"
                      onClick={handleTestSelectedVoice}
                      disabled={
                        !supported || !selectedVoice || diagnosticRun.running
                      }
                    />
                    <ActionButton
                      icon={CheckCircle2}
                      label="Run all voices"
                      onClick={handleRunAllVoiceDiagnostics}
                      disabled={!supported || !voices.length || diagnosticRun.running}
                    />
                    {diagnosticRun.running && (
                      <ActionButton
                        icon={Square}
                        label="Stop test"
                        onClick={handleStopVoiceDiagnostics}
                      />
                    )}
                  </div>
                  <p className="diagnostic-status">
                    {diagnosticRun.running
                      ? `Testing ${diagnosticRun.tested}/${diagnosticRun.total}: ${diagnosticRun.current}`
                      : selectedVoiceDiagnostic
                        ? `Selected voice: ${describeDiagnostic(selectedVoiceDiagnostic)}`
                        : 'Selected voice has not been tested yet.'}
                  </p>
                </div>

                {selectedVoice && (
                  <div className="voice-meta">
                    <p>
                      {selectedVoice.lang}
                      {selectedVoice.localService ? ' - offline' : ' - online'}
                      {selectedVoice.default ? ' - system default' : ''}
                    </p>
                    {selectedVoiceDiagnostic && (
                      <p className={`diagnostic-result ${selectedVoiceDiagnostic.status}`}>
                        Diagnostic: {describeDiagnostic(selectedVoiceDiagnostic)}
                      </p>
                    )}
                    {selectedVoiceDiagnostic?.status !== 'working' &&
                      !isKnownWorkingVoice(selectedVoice) && (
                      <p className="voice-warning">
                        This voice is exposed by the browser but may be blocked from
                        web pages. It remains selectable so you can test it.
                      </p>
                    )}
                  </div>
                )}

                <div className="sliders">
                  <Slider
                    id="rate"
                    label="Speed"
                    min={0.5}
                    max={2}
                    step={0.05}
                    unit="x"
                    value={rate}
                    defaultValue={DEFAULTS.rate}
                    onChange={setRate}
                  />
                  <Slider
                    id="pitch"
                    label="Pitch"
                    min={0}
                    max={2}
                    step={0.05}
                    value={pitch}
                    defaultValue={DEFAULTS.pitch}
                    onChange={setPitch}
                  />
                  <Slider
                    id="volume"
                    label="Volume"
                    min={0}
                    max={1}
                    step={0.05}
                    value={volume}
                    defaultValue={DEFAULTS.volume}
                    onChange={setVolume}
                  />
                </div>
              </section>
            ) : (
              <section
                id="panel-sections"
                role="tabpanel"
                aria-labelledby="tab-sections"
                className="tab-pane sections-pane"
              >
                <div className="panel-title compact-title">
                  <div>
                    <h2>Sections</h2>
                    <p>{chunks.length ? `${chunks.length} parsed chunks` : 'No text yet'}</p>
                  </div>
                </div>

                <div className="chunk-list" role="listbox" aria-label="Parsed chunks">
                  {chunks.length ? (
                    chunks.map((chunk, index) => {
                      const active = index === activeChunkIndex && !activeSnippet
                      const completed = completedSet.has(chunk.id)
                      const playable = isPlayableChunk(chunk)

                      return (
                        <button
                          key={chunk.id}
                          type="button"
                          className={[
                            'chunk-item',
                            active ? 'active' : '',
                            completed ? 'done' : '',
                            playable ? '' : 'skipped',
                          ].join(' ')}
                          onClick={() => {
                            setActiveChunkIndex(index)
                            if (isActive) playChunk(index)
                          }}
                        >
                          <span className={`type-pill type-${chunk.type}`}>
                            {getChunkTypeLabel(chunk.type)}
                          </span>
                          <span className="chunk-copy">
                            <strong>{chunk.title}</strong>
                            <span>{getPreview(chunk.text)}</span>
                          </span>
                          <span className="chunk-meta">
                            {completed && <CheckCircle2 size={14} aria-hidden="true" />}
                            {chunk.wordCount}
                          </span>
                        </button>
                      )
                    })
                  ) : (
                    <div className="empty-state">Paste text to create chunks.</div>
                  )}
                </div>
              </section>
            )}
          </div>
        </aside>
      </main>

      <footer className="footer">
        Voices come from your browser and operating system. Edge usually exposes
        the most Microsoft voices.
      </footer>
    </div>
  )
}

function StatusBadge({ supported, status }) {
  if (!supported) return <span className="badge badge-off">Unsupported</span>
  const map = {
    idle: { label: 'Ready', cls: 'badge-idle' },
    paused: { label: 'Paused', cls: 'badge-paused' },
    speaking: { label: 'Speaking', cls: 'badge-live' },
  }
  const current = map[status] || map.idle
  return <span className={`badge ${current.cls}`}>{current.label}</span>
}

function ActionButton({ icon: Icon, label, ...props }) {
  return (
    <button type="button" className="action-btn" {...props}>
      <Icon size={16} aria-hidden="true" />
      <span>{label}</span>
    </button>
  )
}

function IconButton({ icon: Icon, label, primary, danger, ...props }) {
  return (
    <button
      type="button"
      className={[
        'transport-btn',
        primary ? 'primary' : '',
        danger ? 'danger' : '',
      ].join(' ')}
      title={label}
      aria-label={label}
      {...props}
    >
      <Icon size={19} aria-hidden="true" />
      <span>{label}</span>
    </button>
  )
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="toggle-row">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
}

function HighlightedTextarea({
  text,
  onChange,
  boundary,
  currentRange,
  disabled,
  textareaRef,
  onSelectionChange,
}) {
  const overlayRef = useRef(null)
  const localTextareaRef = useRef(null)
  const ref = textareaRef || localTextareaRef

  const syncScroll = useCallback(() => {
    if (overlayRef.current && ref.current) {
      overlayRef.current.scrollTop = ref.current.scrollTop
      overlayRef.current.scrollLeft = ref.current.scrollLeft
    }
  }, [ref])

  useEffect(() => {
    syncScroll()
  }, [syncScroll, text, currentRange])

  const segments = useMemo(
    () => buildOverlaySegments(text, currentRange, boundary),
    [boundary, currentRange, text],
  )

  return (
    <div className="textarea-wrap">
      <div ref={overlayRef} className="highlight-overlay" aria-hidden="true">
        {segments ? renderOverlaySegments(segments) : text}
        {' '}
      </div>
      <textarea
        ref={ref}
        className={segments ? 'transparent-text' : ''}
        value={text}
        disabled={disabled}
        spellCheck="false"
        onScroll={syncScroll}
        onSelect={onSelectionChange}
        onKeyUp={onSelectionChange}
        onMouseUp={onSelectionChange}
        onFocus={onSelectionChange}
        onChange={(event) => {
          onChange(event.target.value)
          window.requestAnimationFrame(onSelectionChange)
        }}
        placeholder="Paste lab text here..."
      />
    </div>
  )
}

function buildOverlaySegments(text, currentRange, boundary) {
  const length = text.length
  const range =
    currentRange &&
    currentRange.end > currentRange.start &&
    currentRange.start < length
      ? {
          start: Math.max(0, currentRange.start),
          end: Math.min(length, currentRange.end),
        }
      : null

  const word =
    boundary && boundary.charIndex != null
      ? {
          start: Math.max(0, boundary.charIndex),
          end: Math.min(
            length,
            boundary.charIndex + Math.max(boundary.charLength || 0, 1),
          ),
        }
      : null

  if (!range && !word) return null

  if (range) {
    const wordInside =
      word && word.start >= range.start && word.end <= range.end ? word : null

    return {
      mode: 'chunk',
      before: text.slice(0, range.start),
      chunkBefore: wordInside
        ? text.slice(range.start, wordInside.start)
        : text.slice(range.start, range.end),
      word: wordInside ? text.slice(wordInside.start, wordInside.end) : '',
      chunkAfter: wordInside ? text.slice(wordInside.end, range.end) : '',
      after: text.slice(range.end),
    }
  }

  return {
    mode: 'word',
    before: text.slice(0, word.start),
    word: text.slice(word.start, word.end),
    after: text.slice(word.end),
  }
}

function renderOverlaySegments(segments) {
  if (segments.mode === 'chunk') {
    return (
      <>
        {segments.before}
        <span className="chunk-highlight">
          {segments.chunkBefore}
          {segments.word && <mark>{segments.word}</mark>}
          {segments.chunkAfter}
        </span>
        {segments.after}
      </>
    )
  }

  return (
    <>
      {segments.before}
      <mark>{segments.word}</mark>
      {segments.after}
    </>
  )
}

function getPreview(value) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 120)
}

function describeDiagnostic(result) {
  if (!result) return 'Untested'

  if (result.status === 'working') {
    return result.reason === 'started-no-end'
      ? 'Working; started but did not send an end event'
      : 'Confirmed working'
  }

  if (result.status === 'timeout') return 'Timed out before playback started'

  if (result.status === 'failed') {
    return result.reason ? `Failed (${result.reason})` : 'Failed'
  }

  return 'Untested'
}
