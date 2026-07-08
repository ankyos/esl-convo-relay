# Firebase Setup for Convo Relay

One-time setup (~10 min). Firebase's console can be slow — do one step, wait, then the next.

**You only need Realtime Database** — no Storage, no billing upgrade.

---

## Why skip Storage?

Firebase **Storage requires the Blaze plan** (pay-as-you-go) for most new projects, even if you stay within free limits. This app **does not use Storage**. Recordings are saved directly in Realtime Database as audio data — works on the **free Spark plan**.

---

## 1. Create project

1. Open [console.firebase.google.com](https://console.firebase.google.com)
2. **Add project** → name it e.g. `convo-relay`
3. Disable Google Analytics (optional, faster) → **Create project**

## 2. Register a web app

1. Project overview → **Web** icon `</>`
2. App nickname: `convo-relay-web`
3. **Register app**
4. Copy the `firebaseConfig` object → paste into `js/config.js`

You only need these fields (storageBucket is optional):

```js
export const firebaseConfig = {
  apiKey: 'AIza...',
  authDomain: 'convo-relay-xxxxx.firebaseapp.com',
  databaseURL: 'https://convo-relay-xxxxx-default-rtdb.firebaseio.com',
  projectId: 'convo-relay-xxxxx',
  messagingSenderId: '123456789',
  appId: '1:123456789:web:abc123',
};
```

> Client-side Firebase keys are **not secret** — security comes from Database rules.

## 3. Realtime Database (only step you need)

1. Build → **Realtime Database** → **Create Database**
2. Region: closest to you (e.g. `asia-southeast1` or `us-central1`)
3. Start in **locked mode**
4. **Rules** tab → paste all of [`database.rules.json`](./database.rules.json) → **Publish**

Direct link:  
`https://console.firebase.google.com/project/YOUR_PROJECT_ID/database/YOUR_PROJECT_ID-default-rtdb/rules`

## 4. Update your app

Edit `js/config.js`, then push:

```bash
git add js/config.js
git commit -m "Add Firebase config for classroom sync"
git push
```

Wait ~1 minute for GitHub Pages to redeploy.

## 5. Test

1. Open **https://ankyos.github.io/esl-convo-relay/** on two devices (or two browser tabs)
2. Teacher → **Create Session**
3. Other tab → enter code + group name → **Join**
4. Group should appear on teacher panel
5. Record a short test — playback should work on both devices

---

## What the Database rules protect

| Rule | What it does |
|------|----------------|
| Root denied | Nothing outside `sessions/` |
| Session ID format | Only 6-character codes like `ABC123` |
| Session create | Must start in `lobby` with valid timestamp |
| Session update | Cannot change `code` or `createdAt` |
| Group join | Valid name, `joined` status only |
| Audio URLs | Must be `data:audio/...` or `https://`, max ~3 MB each |
| Unknown fields | Rejected |

Full rules: [`firebase-rules/database.rules.json`](./database.rules.json)

---

## Free plan limits (fine for ~40 students)

| Resource | Free limit | Classroom use |
|----------|------------|---------------|
| Realtime Database storage | 1 GB | ~10 groups × 2 recordings ≈ 30 MB/session |
| Download bandwidth | 10 GB/month | OK for 40 students if you delete after class |
| Per recording | ~1 MB in DB | 48 kbps audio, 2 minutes |

**Recommended:** 8–10 groups (4 students per iPad). Delete `sessions` node after each class.

**After class:** delete the `sessions` node in Firebase console → Data tab.

---

## Optional: Firebase Storage (Blaze plan)

Only if you later upgrade to Blaze (billing account linked — still free at small scale):

1. Upgrade project to Blaze in Firebase console
2. Enable Storage
3. Use rules in [`storage.rules`](./storage.rules)

The app currently stores audio in the Database; no code change needed unless you want to optimize for very large deployments.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Permission denied` | Rules not published, or wrong `databaseURL` in config |
| `Permission denied` on recording | Re-publish updated rules (audio fields allow `data:audio/`) |
| Demo mode still showing | `apiKey` still says `YOUR_API_KEY` in config.js |
| Storage "no access" | **Skip Storage** — you don't need it |
| Console very slow | One tab at a time; use direct Rules link above |

## Honest limitation (no login)

Anyone with your database URL could read active sessions or guess a 6-letter code. Fine for classroom use; delete `sessions` after class.
