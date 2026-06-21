import { useMemo } from 'react'
import {
  describeLang,
  getVoiceBucket,
  getVoiceDiagnostic,
  getVoiceKey,
  groupVoices,
  isKnownWorkingVoice,
  isMicrosoftVoice,
} from '../utils/voices'

export default function VoiceSelect({
  voices,
  value,
  onChange,
  microsoftOnly,
  onToggleMicrosoftOnly,
  diagnostics = {},
  tooltip,
  microsoftOnlyTooltip,
}) {
  const filtered = useMemo(
    () => (microsoftOnly ? voices.filter(isMicrosoftVoice) : voices),
    [voices, microsoftOnly],
  )

  const groups = useMemo(() => groupVoices(filtered, diagnostics), [
    diagnostics,
    filtered,
  ])
  const microsoftCount = useMemo(
    () => voices.filter(isMicrosoftVoice).length,
    [voices],
  )
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

  return (
    <div className="field">
      <div className="field-header">
        <label htmlFor="voice" data-tooltip={tooltip}>
          Voice
        </label>
        <label className="toggle-row compact" data-tooltip={microsoftOnlyTooltip}>
          <input
            type="checkbox"
            checked={microsoftOnly}
            onChange={(event) => onToggleMicrosoftOnly(event.target.checked)}
          />
          <span>Microsoft only</span>
          <span className="muted">({microsoftCount})</span>
        </label>
      </div>
      <p className="field-note">
        {bucketCounts.confirmed} confirmed, {bucketCounts.likely} likely,{' '}
        {bucketCounts.untested} untested, {bucketCounts.failed} failed/timed out.
      </p>

      <div className="select-wrap">
        <select
          id="voice"
          value={value || ''}
          onChange={(event) => onChange(event.target.value)}
          disabled={!voices.length}
        >
          {!voices.length && <option>Loading voices...</option>}
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
