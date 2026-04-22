# Dev알람

Next.js client for the Dev알람 backend API.

## Run

```bash
npm install
npm run dev
```

The app proxies `/backend/*` to `BACKEND_BASE_URL/*`.

```bash
BACKEND_BASE_URL=http://localhost:8083
```

## Firebase FCM

Fill these public Firebase web config values in `.env.local`, then restart the
dev server.

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
NEXT_PUBLIC_FIREBASE_VAPID_KEY=
```
