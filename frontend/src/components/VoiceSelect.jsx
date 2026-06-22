import { useMemo } from 'react'
import {
  describeLang,
  getVoiceBaseLanguage,
  getVoiceBucket,
  getVoiceDiagnostic,
  getVoiceKey,
  groupVoices,
  isKnownWorkingVoice,
} from '../utils/voices'

export default function VoiceSelect({
  voices,
  value,
  onChange,
  voiceLanguage,
  onVoiceLanguageChange,
  diagnostics = {},
  tooltip,
  languageTooltip,
}) {
  const languageOptions = useMemo(() => {
    const counts = new Map()
    for (const voice of voices) {
      const key = getVoiceBaseLanguage(voice)
      counts.set(key, (counts.get(key) || 0) + 1)
    }

    return [...counts.entries()]
      .map(([baseLang, count]) => ({
        count,
        lang: baseLang,
        label:
          baseLang === 'unknown' ? 'Unknown language' : describeLang(baseLang),
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [voices])

  const filtered = useMemo(
    () =>
      voices.filter(
        (voice) =>
          voiceLanguage === 'all' ||
          getVoiceBaseLanguage(voice) === voiceLanguage,
      ),
    [voiceLanguage, voices],
  )

  const groups = useMemo(() => groupVoices(filtered, diagnostics), [
    diagnostics,
    filtered,
  ])
  const bucketCounts = useMemo(
    () =>
      filtered.reduce(
        (counts, voice) => {
          counts[getVoiceBucket(voice, diagnostics)] += 1
          return counts
        },
        { confirmed: 0, failed: 0, likely: 0, untested: 0 },
      ),
    [diagnostics, filtered],
  )

  const getVisibleVoices = (nextLanguage) =>
    voices.filter(
      (voice) =>
        nextLanguage === 'all' ||
        getVoiceBaseLanguage(voice) === nextLanguage,
    )

  const keepVisibleVoiceSelected = (nextVoices) => {
    const currentVoiceStillVisible = nextVoices.some(
      (voice) => voice.voiceURI === value,
    )

    if (!currentVoiceStillVisible && nextVoices[0]) {
      onChange(nextVoices[0].voiceURI)
    }
  }

  const handleLanguageChange = (nextLanguage) => {
    onVoiceLanguageChange(nextLanguage)
    keepVisibleVoiceSelected(getVisibleVoices(nextLanguage))
  }

  const visibleVoiceSelected = filtered.some((voice) => voice.voiceURI === value)
  const selectValue = visibleVoiceSelected ? value || '' : ''

  return (
    <div className="field">
      <div className="field-header">
        <label htmlFor="voice" data-tooltip={tooltip}>
          Voice
        </label>
      </div>

      <div className="voice-language-field">
        <label htmlFor="voice-language" data-tooltip={languageTooltip}>
          Language
        </label>
        <div className="select-wrap compact-select">
          <select
            id="voice-language"
            value={voiceLanguage}
            onChange={(event) => handleLanguageChange(event.target.value)}
            disabled={!voices.length}
          >
            <option value="all">All languages ({voices.length})</option>
            {languageOptions.map((item) => (
              <option key={item.lang} value={item.lang}>
                {item.label} ({item.lang}-*, {item.count})
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="field-note">
        Showing {filtered.length} voices: {bucketCounts.confirmed} confirmed,{' '}
        {bucketCounts.likely} likely, {bucketCounts.untested} untested,{' '}
        {bucketCounts.failed} failed/timed out.
      </p>

      <div className="select-wrap">
        <select
          id="voice"
          value={selectValue}
          onChange={(event) => onChange(event.target.value)}
          disabled={!voices.length || !filtered.length}
        >
          {!voices.length && <option>Loading voices...</option>}
          {voices.length > 0 && !filtered.length && (
            <option>No voices match these filters</option>
          )}
          {groups.map((group) => (
            <optgroup
              key={group.label}
              label={`${group.label} (${group.voices.length})`}
            >
              {group.voices.map((voice) => (
                <VoiceOption
                  key={getVoiceKey(voice)}
                  voice={voice}
                  diagnostics={diagnostics}
                />
              ))}
            </optgroup>
          ))}
        </select>
      </div>
    </div>
  )
}

function VoiceOption({ voice, diagnostics }) {
  const diagnostic = getVoiceDiagnostic(voice, diagnostics)
  const status =
    diagnostic?.status === 'working'
      ? ' - confirmed'
      : diagnostic?.status === 'failed'
        ? ` - failed${diagnostic.reason ? `: ${diagnostic.reason}` : ''}`
        : diagnostic?.status === 'timeout'
          ? ' - timed out'
          : isKnownWorkingVoice(voice)
            ? ''
            : ' - untested'

  return (
    <option value={voice.voiceURI}>
      {voice.name}
      {voice.lang ? ` - ${describeLang(voice.lang)}` : ''}
      {voice.localService ? ' - offline' : ' - online'}
      {status}
    </option>
  )
}
