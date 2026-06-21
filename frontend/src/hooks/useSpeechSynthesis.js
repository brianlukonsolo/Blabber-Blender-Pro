import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Wrapper around the browser Web Speech API.
 *
 * The hook deliberately guards every utterance with a run id. Browsers can fire
 * delayed "end" or "error" events after cancel(), and chunked playback must not
 * let those stale events advance the queue.
 */
export function useSpeechSynthesis() {
  const supported =
    typeof window !== 'undefined' && 'speechSynthesis' in window

  const [voices, setVoices] = useState([])
  const [status, setStatus] = useState('idle') // idle | speaking | paused
  const [boundary, setBoundary] = useState(null)
  const [error, setError] = useState(null)

  const keepAliveRef = useRef(null)
  const startWatchdogRef = useRef(null)
  const runIdRef = useRef(0)

  useEffect(() => {
    if (!supported) return

    const synth = window.speechSynthesis
    const load = () => {
      const list = synth.getVoices()
      if (list.length) setVoices(list)
    }

    load()
    synth.addEventListener('voiceschanged', load)
    const interval = setInterval(load, 250)
    const stop = setTimeout(() => clearInterval(interval), 3000)

    return () => {
      synth.removeEventListener('voiceschanged', load)
      clearInterval(interval)
      clearTimeout(stop)
    }
  }, [supported])

  const clearKeepAlive = useCallback(() => {
    if (keepAliveRef.current) {
      clearInterval(keepAliveRef.current)
      keepAliveRef.current = null
    }
  }, [])

  const clearStartWatchdog = useCallback(() => {
    if (startWatchdogRef.current) {
      clearTimeout(startWatchdogRef.current)
      startWatchdogRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!supported) return
    return () => {
      runIdRef.current += 1
      clearKeepAlive()
      clearStartWatchdog()
      window.speechSynthesis.cancel()
    }
  }, [supported, clearKeepAlive, clearStartWatchdog])

  const speak = useCallback(
    (
      text,
      { voice, rate = 1, pitch = 1, volume = 1, onStart, onEnd } = {},
    ) => {
      if (!supported || !String(text).trim()) return

      const synth = window.speechSynthesis
      const runId = runIdRef.current + 1
      runIdRef.current = runId

      clearKeepAlive()
      clearStartWatchdog()
      synth.cancel()
      setError(null)
      setBoundary(null)

      const utterance = new SpeechSynthesisUtterance(text)
      if (voice) utterance.voice = voice
      utterance.rate = rate
      utterance.pitch = pitch
      utterance.volume = volume
      if (voice?.lang) utterance.lang = voice.lang

      const started = { ok: false }

      const finish = (reason) => {
        if (runId !== runIdRef.current) return
        clearStartWatchdog()
        clearKeepAlive()
        setStatus('idle')
        setBoundary(null)
        if (typeof onEnd === 'function') onEnd({ reason })
      }

      utterance.onstart = () => {
        if (runId !== runIdRef.current) return
        started.ok = true
        clearStartWatchdog()
        setStatus('speaking')
        if (typeof onStart === 'function') onStart()
      }
      utterance.onresume = () => {
        if (runId === runIdRef.current) setStatus('speaking')
      }
      utterance.onpause = () => {
        if (runId === runIdRef.current) setStatus('paused')
      }
      utterance.onend = () => finish('completed')
      utterance.onerror = (event) => {
        if (runId !== runIdRef.current) return
        const code = event.error || 'unknown'
        if (!['interrupted', 'canceled'].includes(code)) {
          const online = voice && voice.localService === false
          setError(
            online
              ? `"${voice.name}" is an online voice and your browser blocked it (${code}). Pick an offline voice instead.`
              : `Speech failed (${code}). Try a different voice.`,
          )
          finish('error')
          return
        }
        finish('canceled')
      }
      utterance.onboundary = (event) => {
        if (runId !== runIdRef.current) return
        if (event.name === 'word' || event.name === undefined) {
          setBoundary({
            charIndex: event.charIndex,
            charLength: event.charLength || 0,
          })
        }
      }

      synth.speak(utterance)
      setStatus('speaking')

      startWatchdogRef.current = setTimeout(() => {
        if (runId !== runIdRef.current) return
        if (!started.ok && !synth.speaking) {
          const online = voice && voice.localService === false
          setError(
            online
              ? `"${voice.name}" did not produce audio. Microsoft's online voices are often blocked from web apps; choose an offline voice.`
              : `No audio from "${voice ? voice.name : 'the selected voice'}". Try another voice, or check your system output device.`,
          )
          finish('error')
        }
      }, 2200)

      // Chrome can stop long passages unless speech is nudged periodically.
      keepAliveRef.current = setInterval(() => {
        if (runId !== runIdRef.current) return
        if (synth.speaking && !synth.paused) {
          synth.pause()
          synth.resume()
        }
      }, 10000)
    },
    [supported, clearKeepAlive, clearStartWatchdog],
  )

  const pause = useCallback(() => {
    if (!supported) return
    window.speechSynthesis.pause()
    setStatus('paused')
  }, [supported])

  const resume = useCallback(() => {
    if (!supported) return
    window.speechSynthesis.resume()
    setStatus('speaking')
  }, [supported])

  const cancel = useCallback(() => {
    if (!supported) return
    runIdRef.current += 1
    clearKeepAlive()
    clearStartWatchdog()
    window.speechSynthesis.cancel()
    setStatus('idle')
    setBoundary(null)
  }, [supported, clearKeepAlive, clearStartWatchdog])

  const clearError = useCallback(() => setError(null), [])

  return {
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
  }
}
