# BazaarAI Frontend — deployable Vite project

This wraps the React app (`src/App.jsx`) into a real, standalone project
that Vercel (or any static host) can build and deploy — solving the
"Claude artifact can't make real network calls" limitation.

## Deploy to Vercel

1. Push this folder to a new GitHub repository (e.g. `BazaarAI-frontend`).
2. Go to vercel.com, sign up/log in with GitHub, click "Add New" → "Project".
3. Import the `BazaarAI-frontend` repo.
4. Vercel auto-detects Vite — leave the default build settings
   (Build Command: `npm run build`, Output Directory: `dist`).
5. Click Deploy. You'll get a public URL like `bazaarai.vercel.app`.

That's it — no environment variables needed here, since all your Angel
One credentials live only on the Render backend, never in this frontend.

## Local testing (optional)

```bash
npm install
npm run dev
```

Opens at http://localhost:5173 with real network access (no sandbox
restrictions), so this is also the fastest way to debug the WebSocket
connection before deploying.

## If /ws/ticks still shows offline after deploying

At that point it's no longer a Claude-artifact-sandbox issue — the
site will have genuine outbound network access. If it's still offline:
1. Open the deployed site, open browser DevTools → Console, look for
   the actual WebSocket error message.
2. Confirm the backend is awake (Render free tier sleeps after
   inactivity — visit `/health` first to wake it, then reload the site).
3. Confirm `/subscribe` was called successfully (Network tab) with your
   symbol list before expecting ticks to flow.
