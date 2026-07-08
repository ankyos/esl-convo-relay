# Firebase Setup for Convo Relay

One-time setup (~10 min). Firebase's console can be slow — do one step, wait, then the next.

## 1. Create project

1. Open [console.firebase.google.com](https://console.firebase.google.com)
2. **Add project** → name it e.g. `convo-relay`
3. Disable Google Analytics (optional, keeps setup faster) → **Create project**

## 2. Register a web app

1. Project overview → **Web** icon `</>`
2. App nickname: `convo-relay-web`
3. **Register app**
4. Copy the `firebaseConfig` object — you'll paste it into `js/config.js`

Example:

```js
export const firebaseConfig = {
  apiKey: 'AIza...',
  authDomain: 'convo-relay-xxxxx.firebaseapp.com',
  databaseURL: 'https://convo-relay-xxxxx-default-rtdb.firebaseio.com',
  projectId: 'convo-relay-xxxxx',
  storageBucket: 'convo-relay-xxxxx.firebasestorage.app',
  messagingSenderId: '123456789',
  appId: '1:123456789:web:abc123',
};
```

> Client-side Firebase keys are **not secret** — security comes from these rules, not hiding the key.

## 3. Realtime Database

1. Build → **Realtime Database** → **Create Database**
2. Choose region closest to Japan (e.g. `asia-southeast1` if listed, otherwise `us-central1`)
3. Start in **locked mode** (not test mode)
4. Open **Rules** tab → paste contents of [`database.rules.json`](./database.rules.json) → **Publish**

Direct link pattern:  
`https://console.firebase.google.com/project/YOUR_PROJECT_ID/database/YOUR_PROJECT_ID-default-rtdb/rules`

## 4. Storage

1. Build → **Storage** → **Get started**
2. Start in **production mode**
3. Open **Rules** tab → paste contents of [`storage.rules`](./storage.rules) → **Publish**

## 5. Update your app

Edit `js/config.js` with your credentials, then:

```bash
git add js/config.js
git commit -m "Add Firebase config for classroom sync"
git push
```

Wait ~1 minute for GitHub Pages to redeploy.

## 6. Test

1. Open **https://ankyos.github.io/esl-convo-relay/** on two devices (or two browser tabs)
2. Teacher → **Create Session**
3. Student tab → enter code + group name → **Join**
4. Both should see the group appear on the teacher panel

---

## What the rules protect

| Rule | What it does |
|------|----------------|
| Root denied | Nothing outside `sessions/` is readable/writable |
| Session ID format | Only 6-character codes like `ABC123` |
| Session create | Must start in `lobby` phase with valid timestamp |
| Session update | Cannot change `code` or `createdAt` after creation |
| Group create | Valid name + `joined` status only |
| Group update | Cannot rename group after joining |
| Field validation | Language, topic, review values must match app enums |
| Unknown fields | Rejected (`$other: false`) |
| Storage path | Only `sessions/{code}/{group}/recording-*.mp4` etc. |
| Storage size | Max 15 MB per file |
| Storage type | Audio only |

## Honest limitation (no login)

This app has **no user accounts**. Rules validate **data shape**, but anyone who discovers your database URL could still read active sessions or join with a guessed 6-letter code.

For a high school classroom this is usually fine. To harden further later:

- Add **Firebase Anonymous Auth** (one code change)
- Enable **Firebase App Check** to block non-app clients
- Short session codes + delete sessions after class in Firebase console

## After class — clean up

Firebase console → Realtime Database → **Data** → delete `sessions` node  
Storage → delete `sessions/` folder

Or leave them — free tier is generous for occasional classroom use.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Permission denied` on join | Rules not published, or wrong `databaseURL` in config |
| Upload fails | Check Storage rules published; file must be audio |
| Console very slow | Use direct rule links above; avoid leaving multiple Firebase tabs open |
| Demo mode still showing | `apiKey` still says `YOUR_API_KEY` in config.js |
