const COMMAND_WORDS = [
  'base64',
  'cat',
  'cd',
  'chmod',
  'chown',
  'curl',
  'dirb',
  'dirsearch',
  'enum4linux',
  'export',
  'ffuf',
  'find',
  'ftp',
  'gobuster',
  'grep',
  'hashcat',
  'hydra',
  'id',
  'ifconfig',
  'john',
  'ls',
  'msfconsole',
  'msfvenom',
  'nc',
  'netcat',
  'nikto',
  'nmap',
  'openssl',
  'ping',
  'pwd',
  'python',
  'python3',
  'rlwrap',
  'scp',
  'smbclient',
  'sqlmap',
  'ssh',
  'stty',
  'sudo',
  'tar',
  'telnet',
  'traceroute',
  'unzip',
  'wget',
  'whoami',
]

const UI_NOISE = new Set([
  'about',
  'access machines',
  'add to favorites',
  'all tasks complete',
  'answer',
  'answered',
  'back to room',
  'bookmark',
  'change theme',
  'close',
  'complete',
  'completed',
  'copy',
  'copied',
  'deploy',
  'download task files',
  'feedback',
  'hint',
  'join room',
  'loading',
  'login',
  'next task',
  'overview',
  'previous task',
  'reset progress',
  'show hint',
  'start machine',
  'submit',
  'subscribe',
  'task complete',
  'terminate',
  'view hint',
  'view site',
])

const TECH_TERMS = [
  ['nmap', 'N map'],
  ['ffuf', 'F fuzz'],
  ['gobuster', 'go buster'],
  ['dirb', 'D I R B'],
  ['dirsearch', 'dir search'],
  ['enum4linux', 'enum four Linux'],
  ['smbclient', 'S M B client'],
  ['msfconsole', 'M S F console'],
  ['msfvenom', 'M S F venom'],
  ['sqlmap', 'S Q L map'],
  ['nikto', 'nick toe'],
  ['hydra', 'high dra'],
  ['hashcat', 'hash cat'],
  ['john', 'John'],
  ['sudo', 'soo doo'],
  ['chmod', 'change mode'],
  ['chown', 'change owner'],
  ['scp', 'S C P'],
  ['ssh', 'S S H'],
  ['ftp', 'F T P'],
  ['smb', 'S M B'],
  ['dns', 'D N S'],
  ['http', 'H T T P'],
  ['https', 'H T T P S'],
  ['tcp', 'T C P'],
  ['udp', 'U D P'],
  ['vpn', 'V P N'],
  ['osint', 'O SINT'],
  ['cve', 'C V E'],
  ['xss', 'X S S'],
  ['csrf', 'C S R F'],
  ['lfi', 'L F I'],
  ['rfi', 'R F I'],
  ['sqli', 'S Q L injection'],
]

const COMMAND_RE = new RegExp(`^(?:${COMMAND_WORDS.join('|')})(?:\\s|$)`, 'i')

export function simpleTextHash(text) {
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

export function cleanLabText(input) {
  const lines = String(input || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .split('\n')

  const cleaned = []
  let lastNonBlank = ''

  for (const line of lines) {
    const trimmed = line.replace(/[ \t]+$/g, '').replace(/\t/g, '    ')
    const compact = trimmed.trim().replace(/\s+/g, ' ')
    const lower = compact.toLowerCase()

    if (!compact) {
      if (cleaned.length && cleaned[cleaned.length - 1] !== '') cleaned.push('')
      continue
    }

    if (UI_NOISE.has(lower)) continue
    if (/^(correct|incorrect|try again)$/i.test(compact)) continue
    if (/^\d+% complete$/i.test(compact)) continue
    if (/^completed\s+\d+\s+of\s+\d+$/i.test(compact)) continue
    if (/^(room|task)\s+progress$/i.test(compact)) continue

    // Browser copy often duplicates short labels around buttons.
    if (compact === lastNonBlank && compact.length < 80) continue

    cleaned.push(trimmed)
    lastNonBlank = compact
  }

  return cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function parseLabChunks(text, { labMode = true, splitCommands = true } = {}) {
  const source = String(text || '')
  if (!source.trim()) return []

  const lines = getLinesWithOffsets(source)
  const chunks = []
  let buffer = []
  let bufferType = null
  let section = ''
  let inFence = false

  const flush = () => {
    if (!buffer.length) return
    chunks.push(makeChunk(buffer, bufferType || 'prose', section, chunks.length))
    buffer = []
    bufferType = null
  }

  const pushSingle = (line, type) => {
    chunks.push(makeChunk([line], type, section, chunks.length))
  }

  for (const line of lines) {
    const trimmed = line.text.trim()

    if (!trimmed) {
      flush()
      continue
    }

    if (/^```/.test(trimmed)) {
      if (inFence) {
        inFence = false
        flush()
      } else {
        flush()
        inFence = true
      }
      continue
    }

    const type = labMode
      ? classifyLabLine(trimmed, inFence)
      : classifyPlainLine(trimmed)

    if (type === 'heading') {
      flush()
      pushSingle(line, type)
      section = cleanHeading(trimmed)
      continue
    }

    if (type === 'question') {
      flush()
      pushSingle(line, type)
      continue
    }

    if ((type === 'command' || type === 'code') && splitCommands) {
      flush()
      pushSingle(line, type)
      continue
    }

    if (bufferType && bufferType !== type) {
      flush()
    }

    bufferType = type
    buffer.push(line)
  }

  flush()
  return chunks.map((chunk, index) => ({
    ...chunk,
    index,
    title: getChunkTitle(chunk, index),
  }))
}

export function prepareSpeechText(
  input,
  {
    chunkType = 'prose',
    labMode = true,
    profile = 'technical',
    redactSecrets = false,
    spellTechnical = true,
  } = {},
) {
  let text = String(input || '').trim()
  if (!text) return ''

  if (redactSecrets) text = redactSensitiveText(text)

  if (!labMode && profile === 'normal' && !spellTechnical) {
    return normalizeSpeechWhitespace(text)
  }

  if (chunkType === 'command' || chunkType === 'code' || profile === 'commands') {
    text = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `Command: ${line}`)
      .join('. ')
  }

  if (spellTechnical) {
    text = expandTechnicalText(text)
  }

  if (profile === 'skim') {
    text = text.replace(/\b(for example|for instance|please note that)\b/gi, '')
  }

  return normalizeSpeechWhitespace(text)
}

export function getChunkTypeLabel(type) {
  return (
    {
      code: 'Code',
      command: 'Command',
      heading: 'Section',
      list: 'List',
      prose: 'Text',
      question: 'Question',
    }[type] || 'Text'
  )
}

function getLinesWithOffsets(text) {
  const rawLines = text.split('\n')
  let offset = 0

  return rawLines.map((raw, index) => {
    const start = offset
    const end = start + raw.length
    offset = end + 1
    return {
      index,
      raw,
      text: raw.replace(/[ \t]+$/g, ''),
      start,
      end,
    }
  })
}

function makeChunk(lines, type, section, order) {
  const start = lines[0].start
  const end = lines[lines.length - 1].end
  const text = lines.map((line) => line.text).join('\n').trim()

  return {
    id: `${type}-${start}-${end}-${simpleTextHash(text).slice(0, 6)}`,
    index: order,
    type,
    section,
    text,
    start,
    end,
    wordCount: text ? text.split(/\s+/).length : 0,
  }
}

function classifyPlainLine(line) {
  if (isHeading(line)) return 'heading'
  if (isQuestion(line)) return 'question'
  return 'prose'
}

function classifyLabLine(line, inFence) {
  if (inFence) return 'code'
  if (isHeading(line)) return 'heading'
  if (isQuestion(line)) return 'question'
  if (isCommand(line)) return 'command'
  if (isListItem(line)) return 'list'
  if (looksLikeCode(line)) return 'code'
  return 'prose'
}

function isHeading(line) {
  if (/^#{1,6}\s+\S/.test(line)) return true
  if (/^task\s+\d+(\s|[:.)-]|$)/i.test(line)) return true
  if (/^(room|section|introduction|overview|enumeration|exploitation|privilege escalation|questions?|answers?|summary)\b/i.test(line)) {
    return line.length <= 90
  }
  return /^[A-Z][A-Za-z0-9 /&:()'-]{2,70}$/.test(line) && !/[.!?]$/.test(line)
}

function isQuestion(line) {
  return /\?$/.test(line) || /^(what|which|who|where|when|why|how)\b/i.test(line)
}

function isListItem(line) {
  return /^([-*+]|\d+[.)])\s+\S/.test(line)
}

function isCommand(line) {
  if (/^(\$|#|>)\s+\S/.test(line)) return true
  if (/^PS\s+[A-Z]:\\/i.test(line)) return true
  if (/^[A-Z]:\\/.test(line)) return true
  if (COMMAND_RE.test(line)) return true
  return false
}

function looksLikeCode(line) {
  if (/^https?:\/\//i.test(line)) return true
  if (/^(GET|POST|PUT|DELETE|HEAD|OPTIONS)\s+\//.test(line)) return true
  if (/^\{.*\}$/.test(line) || /^\[.*\]$/.test(line)) return true
  if (/(--?[A-Za-z][\w-]*\s+){2,}/.test(line)) return true
  if (/\/[A-Za-z0-9._-]+\/[A-Za-z0-9._/-]+/.test(line)) return true
  if (/[;&|]{2}/.test(line)) return true
  return false
}

function cleanHeading(line) {
  return line.replace(/^#{1,6}\s+/, '').trim()
}

function getChunkTitle(chunk, index) {
  if (chunk.type === 'heading') return cleanHeading(chunk.text)
  const prefix = getChunkTypeLabel(chunk.type)
  if (chunk.section) return `${prefix} in ${chunk.section}`
  return `${prefix} ${index + 1}`
}

function expandTechnicalText(input) {
  let text = input

  text = text.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, (match) =>
    match.split('.').join(' dot '),
  )

  text = text.replace(/\b([A-Fa-f0-9]{32,})\b/g, (match) => {
    const preview = match.slice(0, 8).split('').join(' ')
    return `${match.length} character hex hash starting ${preview}`
  })

  text = text.replace(/\b[A-Z]{2,8}\{[^}]+\}/g, (match) =>
    match.replace(/[{}_-]/g, ' '),
  )

  text = text.replace(/https?:\/\/[^\s)]+/gi, (match) =>
    spellSymbols(match)
      .replace(/\bhttps\b/i, 'H T T P S')
      .replace(/\bhttp\b/i, 'H T T P'),
  )

  text = text.replace(/(?:^|\s)(\/[A-Za-z0-9._~/-]+)/g, (match, path) =>
    `${match.startsWith(' ') ? ' ' : ''}${spellSymbols(path)}`,
  )

  text = text.replace(/\b[A-Z]:\\[^\s]+/g, (match) => spellSymbols(match))

  text = text.replace(/(^|\s)(--?[A-Za-z][A-Za-z0-9-]*)/g, (match, lead, flag) =>
    `${lead}${spellFlag(flag)}`,
  )

  for (const [term, spoken] of TECH_TERMS) {
    text = text.replace(new RegExp(`\\b${escapeRegExp(term)}\\b`, 'gi'), spoken)
  }

  return text
}

function spellSymbols(value) {
  return value
    .replace(/\\/g, ' backslash ')
    .replace(/\//g, ' slash ')
    .replace(/\./g, ' dot ')
    .replace(/:/g, ' colon ')
    .replace(/-/g, ' dash ')
    .replace(/_/g, ' underscore ')
    .replace(/=/g, ' equals ')
    .replace(/\?/g, ' question mark ')
    .replace(/&/g, ' ampersand ')
    .replace(/%/g, ' percent ')
}

function spellFlag(flag) {
  const dashCount = flag.startsWith('--') ? 2 : 1
  const body = flag.slice(dashCount)
  const dashText = dashCount === 2 ? 'dash dash' : 'dash'
  if (/^[A-Za-z]{1,3}$/.test(body)) {
    return `${dashText} ${body.split('').join(' ')}`
  }
  return `${dashText} ${body.replace(/-/g, ' dash ')}`
}

function redactSensitiveText(input) {
  return input
    .replace(/\b[A-Z]{2,8}\{[^}]+\}/g, 'flag redacted')
    .replace(/\bflag\{[^}]+\}/gi, 'flag redacted')
    .replace(
      /\b(password|passwd|pass|secret|token|api[_-]?key)\s*[:=]\s*("[^"]+"|'[^']+'|\S+)/gi,
      '$1 redacted',
    )
}

function normalizeSpeechWhitespace(input) {
  return input.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '. ').replace(/\n/g, '. ')
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
