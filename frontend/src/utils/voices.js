// Helpers for working with Web Speech API voices. The browser and operating
// system provide the voice list; the app does not bundle voices.

export function describeLang(langTag) {
  if (!langTag) return 'Unknown'
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'language' })
    const region = langTag.includes('-') ? langTag.split('-')[1] : null
    const base = dn.of(langTag) || dn.of(langTag.split('-')[0]) || langTag

    if (region) {
      try {
        const rn = new Intl.DisplayNames(['en'], { type: 'region' })
        const regionName = rn.of(region.toUpperCase())
        if (regionName && !base.includes(regionName)) {
          return `${base.split(' (')[0]} (${regionName})`
        }
      } catch {
        // Keep the language label we already have.
      }
    }

    return base
  } catch {
    return langTag
  }
}

export function isMicrosoftVoice(voice) {
  return /microsoft/i.test(voice.name) || /microsoft/i.test(voice.voiceURI || '')
}

export function isKnownWorkingVoice(voice) {
  // Edge can list Microsoft online "Natural" voices that do not produce audio
  // from third-party pages. These are still shown in the picker, but they are
  // grouped below voices that are known to work through Web Speech.
  return !(voice.localService === false && isMicrosoftVoice(voice))
}

export function getVoiceKey(voice) {
  return [
    voice.voiceURI || '',
    voice.name || '',
    voice.lang || '',
    voice.localService ? 'local' : 'remote',
  ].join('|')
}

export function getVoiceBaseLanguage(voice) {
  return (voice.lang || 'unknown').split('-')[0].toLowerCase() || 'unknown'
}

export function getVoiceDiagnostic(voice, diagnostics = {}) {
  return diagnostics[getVoiceKey(voice)] || null
}

export function getVoiceBucket(voice, diagnostics = {}) {
  const diagnostic = getVoiceDiagnostic(voice, diagnostics)

  if (diagnostic?.status === 'working') return 'confirmed'
  if (diagnostic?.status === 'failed' || diagnostic?.status === 'timeout') {
    return 'failed'
  }
  if (isKnownWorkingVoice(voice)) return 'likely'
  return 'untested'
}

export function groupVoices(voices, diagnostics = {}) {
  const confirmed = []
  const likely = []
  const untested = []
  const failed = []

  for (const voice of voices) {
    const bucket = getVoiceBucket(voice, diagnostics)
    if (bucket === 'confirmed') confirmed.push(voice)
    else if (bucket === 'failed') failed.push(voice)
    else if (bucket === 'likely') likely.push(voice)
    else untested.push(voice)
  }

  const groups = []

  if (confirmed.length) {
    confirmed.sort(sortVoiceReliably)
    groups.push({
      label: 'Confirmed working',
      reliability: 'confirmed',
      voices: confirmed,
    })
  }

  if (likely.length) {
    likely.sort(sortVoiceReliably)
    groups.push({
      label: 'Likely working',
      reliability: 'likely',
      voices: likely,
    })
  }

  if (untested.length) {
    untested.sort(sortVoiceReliably)
    groups.push({
      label: 'Untested',
      reliability: 'untested',
      voices: untested,
    })
  }

  if (failed.length) {
    failed.sort(sortVoiceReliably)
    groups.push({
      label: 'Failed or timed out',
      reliability: 'failed',
      voices: failed,
    })
  }

  return groups
}

function sortVoiceReliably(a, b) {
  const ae = isEnglishVoice(a)
  const be = isEnglishVoice(b)
  if (ae !== be) return ae ? -1 : 1

  const am = isMicrosoftVoice(a)
  const bm = isMicrosoftVoice(b)
  if (am !== bm) return am ? -1 : 1

  const langCmp = (a.lang || '').localeCompare(b.lang || '')
  if (langCmp !== 0) return langCmp

  return a.name.localeCompare(b.name)
}

function isEnglishVoice(voice) {
  return /^en(-|$)/i.test(voice.lang || '')
}
