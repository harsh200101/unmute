# unmute frontend v2

Phase 0 scaffold. Vite + React 19 + Tailwind. See `../docs/v2-spec.md` for the full design.

## First-time setup

```bash
cd frontend-v2
npm install
cp .env.example .env
npm run dev
# → http://localhost:5173
```

The dev server proxies `/api/*` to `http://localhost:5001` (the backend-v2 server).
Adjust `VITE_API_URL` in `.env` if you run the backend somewhere else.

## What's here

- ✅ Vite-based React 19 app
- ✅ Tailwind configured
- ✅ React Router 7 with a landing page that pings `/readyz`
- ✅ Single axios client at `src/api/client.js`
- ✅ react-hot-toast for toasts

## What's NOT here

Pages, components, auth, agora call surface — all phases 1+. This scaffold
exists only so we have a working `npm run dev` end-to-end before we start
adding features.

## Layout (planned, see spec §4)

```
src/
├── main.jsx
├── App.jsx
├── api/                # axios client + endpoint funcs
├── auth/               # AuthContext, useAuth (phase 1)
├── pages/              # Landing, Login, MentorList, MeetingRoom, …
├── components/         # ui/, call/, booking/
├── hooks/
└── utils/              # paise formatting, tz helpers
```
