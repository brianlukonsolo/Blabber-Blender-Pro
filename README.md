<p align="center">
  <img src="./logo/blabber_blender__pro_logo.png" alt="Blabber-Blender Pro logo" width="180" />
</p>

<h1 align="center">🗣️ Blabber-Blender Pro</h1>

<p align="center">
  <strong>A free, premium-feeling text-to-speech workspace for pasted technical labs, notes, and training material.</strong>
</p>

<p align="center">
  <img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=06130e" />
  <img alt="Vite" src="https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=white" />
  <img alt="Web Speech API" src="https://img.shields.io/badge/Web%20Speech%20API-Browser%20TTS-2F7D6D?style=for-the-badge" />
  <img alt="Docker" src="https://img.shields.io/badge/Docker-ready-2496ED?style=for-the-badge&logo=docker&logoColor=white" />
</p>

---

## ✨ What It Does

Blabber-Blender Pro turns pasted technical text into a structured listening
workflow. It is designed for lab walkthroughs, course notes, documentation, and
training content where normal text-to-speech struggles with tasks, commands,
ports, IP addresses, paths, flags, hashes, and code snippets.

Speech runs locally in your browser through `window.speechSynthesis`; the app
does not bundle voices or send your text to a speech server.

## 🌈 Feature Highlights

| Area | Features |
| --- | --- |
| 🧪 Lab Mode | Detects sections, questions, lists, commands, and code-like lines. |
| 🎛️ Chunked Playback | Read, pause, resume, stop, previous, next, and repeat chunks. |
| 🧹 Paste Cleanup | Removes common copied-page noise, duplicate labels, buttons, and UI clutter. |
| 🧠 Technical Speech | Improves pronunciation for IPs, URLs, paths, hashes, flags, and common tools. |
| 🗂️ Sections Tab | Browse parsed chunks, jump between sections, and track completed items. |
| 🎙️ Voice Picker | Shows every browser-reported voice with diagnostics-aware grouping. |
| 🩺 Voice Diagnostics | Test one voice or all voices; cache confirmed, failed, and timed-out results. |
| 🔐 Redaction | Optionally avoids speaking flags, tokens, passwords, and secrets aloud. |
| 💾 Resume State | Saves text, settings, selected voice, progress, and completed chunks locally. |
| ⌨️ Shortcuts | Use Space, S, N, P, R, `[`, and `]` when focus is outside an input. |

## 🗣️ Voice Diagnostics

The app can audibly test voices exposed by your browser and group them as:

- ✅ **Confirmed working**
- 🟢 **Likely working**
- 🟡 **Untested**
- 🔴 **Failed or timed out**

Diagnostics are based on Web Speech events such as `onstart`, `onend`,
`onerror`, and timeout behavior. This confirms browser playback behavior, but
it cannot prove your speakers or headphones were audible.

## 🚀 Quick Start

```bash
cd frontend
npm install
npm run dev
```

Open the local URL Vite prints, usually:

```text
http://127.0.0.1:5173/
```

## 🐳 Docker

From the project root:

```bash
docker compose up --build
```

Then open:

```text
http://localhost:8088
```

To stop the container:

```bash
docker compose down
```

## 🎧 Browser Voices

Available voices come from your browser and operating system.

- 🪟 **Microsoft Edge on Windows** usually exposes the richest Microsoft voice list.
- 🌐 **Chrome on Windows** usually exposes installed Windows voices plus Google voices.
- 🧩 **Firefox and other browsers** vary by platform and installed voice packs.

Some online voices can appear in the browser list but fail when used by web
apps. Use **Voice diagnostics** inside Blabber-Blender Pro to test what actually
works on your machine.

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Space` | Play, pause, or resume |
| `S` | Stop |
| `N` | Next chunk |
| `P` | Previous chunk |
| `R` | Repeat current chunk |
| `[` | Slow down |
| `]` | Speed up |

## 🧱 Project Structure

```text
.
├── docker-compose.yml
├── README.md
├── logo/
│   └── blabber_blender__pro_logo.png
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    ├── vite.config.js
    ├── index.html
    ├── public/
    │   └── speaker.svg
    └── src/
        ├── App.jsx
        ├── App.css
        ├── index.css
        ├── components/
        │   ├── Slider.jsx
        │   └── VoiceSelect.jsx
        ├── hooks/
        │   └── useSpeechSynthesis.js
        └── utils/
            ├── labText.js
            └── voices.js
```

## 🧪 Build Check

```bash
cd frontend
npm run build
npm audit
```

## 🏁 Status

Blabber-Blender Pro is optimized for local reading workflows: paste, clean,
chunk, listen, test voices, and move through dense material faster.
