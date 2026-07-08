# Convo Relay — 会話リレー

A minimal ESL classroom activity for iPad. Students have casual 2-minute conversations, send recordings to another group for translation, then review the results together.

**Live on GitHub Pages** — static HTML/CSS/JS, no build step.

## Activity Flow

```
Join → Lobby → Record (2 min) → Wait → SEND (all at once)
  → Translate + Record → RETURN → Review (👍 / 👌 / 💪) → Done
```

| Phase | Symbol | What happens |
|-------|--------|--------------|
| Join | 👥 | Enter session code + group name |
| Lobby | ⏳ | Wait for teacher to start |
| Record | 🎤 | Random language (🇯🇵 or 🇺🇸) + topic scaffold, 2-min timer |
| Send | 📤 | Teacher unlocks → everyone presses SEND together |
| Translate | 🔄 | Hear partner's recording, translate, record |
| Return | ↩️ | Send translation back to original group |
| Review | ✅ | GOOD! / NOT BAD! / BEST TRY! |

### Topics (random)

- 🤠 Toy Story
- 🎤 Michael Jackson Movie
- 🎵 K-POP
- 🎮 V-Tubers

## Setup for GitHub Pages

### 1. Firebase (required for multiple iPads)

GitHub Pages is static — use **Firebase Realtime Database + Storage** (free tier) to sync sessions across devices.

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Realtime Database** (start in test mode for classroom use, or set rules below)
3. Enable **Storage**
4. Copy `js/config.example.js` → `js/config.js` and paste your credentials

**Database rules** (classroom-safe, open read/write — tighten for production):

```json
{
  "rules": {
    "sessions": {
      "$sessionId": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

**Storage rules**:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /sessions/{sessionId}/{allPaths=**} {
      allow read, write: if true;
    }
  }
}
```

### 2. Deploy to GitHub Pages

```bash
# Create repo and push
git init
git add .
git commit -m "Add Convo Relay ESL activity"
git branch -M main
git remote add origin https://github.com/YOUR_USER/esl-convo-relay.git
git push -u origin main
```

In GitHub → **Settings → Pages → Source**: deploy from `main` branch, `/ (root)`.

Your app will be at: `https://YOUR_USER.github.io/esl-convo-relay/`

### 3. Classroom use

1. **Teacher** opens the site → **Create Session** → shares the 6-letter code on the board
2. **Students** on each iPad → enter code + group name → **Join**
3. Teacher waits for all groups (minimum 2) → **Start**
4. Each group gets random language + topic, records for 2 minutes
5. Teacher clicks **Open Send** when all groups are ready → everyone hits **SEND**
6. Groups translate partner recordings → **RETURN**
7. Original groups review → tap 👍 / 👌 / 💪

**Tip:** Tell students to keep iPads awake during wait phases (Wake Lock API is used when supported).

## iPad / Safari notes

- **Use Safari** on iPad (not Chrome) for best mic support
- **Mic check screen** appears before first recording — students tap, say "Hello", play back, confirm
- **Settings → Safari → Microphone → Allow** for your GitHub Pages URL
- Recordings use **audio/mp4** on iOS (Safari-native format)
- **Wake Lock** keeps screen on during wait phases (when Safari allows)
- Teacher **3…2…1 SEND** countdown syncs all iPads before the send button unlocks

## Demo mode (no Firebase)

Without `config.js` credentials, the app runs in **demo mode** — works in a single browser for testing the UI and flow, but won't sync across iPads.

## File structure

```
esl-convo-relay/
├── index.html          # Shell
├── css/style.css       # Metal + glass tactile UI
├── js/
│   ├── app.js          # Main orchestrator
│   ├── session.js      # Firebase sync + pairing logic
│   ├── audio.js        # MediaRecorder helpers
│   ├── topics.js       # Conversation scaffolds
│   ├── config.js       # Your Firebase keys (gitignored)
│   └── config.example.js
└── README.md
```

## Design notes

- **Tactile buttons** — raised bevel, press-down animation
- **Metal + glass** — dark brushed background, frosted panels
- **Symbol-first UI** — minimal Japanese + English labels
- **iPad-centered** — fixed aspect frame, large touch targets (56px+)
- **No accounts** — session code + group name only

## License

MIT — use freely in your classroom.
