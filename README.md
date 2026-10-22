# Order Management Platform

သုံးပိုင်းကနေ ဖွဲ့စည်းပါတယ် — နှစ် frontend ကို **သီးသန့် hosting service** တွေမှာ သီးသန့် deploy လုပ်နိုင်ပါတယ်။

```
order/
├── backend/    Express + MongoDB (Atlas) API + Socket.IO  → :5000
├── frontend/   User app (Next.js)                          → :3000
└── admin/      Admin / Owner panel (Next.js)              → :3001
```

## Features

**User app (`frontend/`)** — home, deposit (screenshot proof), withdraw, orders (order progress + commission), profile, invite, support, grab, 9 languages (EN/ES/PT/AR/HI/JA/TH/KO/ZH)

**Admin app (`admin/`)** — dashboard, users (role/status), products (6 fields + bulk import), transactions (deposit/withdraw approve), order plans (+ lucky orders with auto product), support chat, announcements, owners, payout wallet (address + QR)

**Backend (`backend/`)** — JWT auth (user / owner / admin), owner-scoped access, order plan generation, wallet ledger + referral bonus, Socket.IO support chat

## Local development

```bash
# 1. backend
cd backend
npm install
cp .env.example .env        # MONGODB_URI, JWT_SECRET ဖြည့်ပါ
npm run dev                  # :5000

# 2. user app
cd frontend
npm install
cp .env.example .env.local   # NEXT_PUBLIC_API_URL
npm run dev                  # :3000

# 3. admin app
cd admin
npm install
cp .env.example .env.local
set PORT=3001 && npm run dev  # :3001
```

## Environment variables

| App | Variable | ပြောင်းလိုတာ |
| --- | --- | --- |
| `backend` | `MONGODB_URI` | Atlas connection string (password ကို URL-encode လုပ်ပါ) |
| `backend` | `JWT_SECRET` | 32+ စာလုံး random — `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `backend` | `JWT_EXPIRES_IN` | token သက်တမံခ (default `1d`) |
| `backend` | `CLIENT_ORIGIN` | **နှစ် frontend origin ကို comma နဲ့ သတ်မှတ်ပါ** — `https://admin.example.com,https://app.example.com` |
| `backend` | `DEFAULT_INVITATION_CODE` | master invite code (default `MASTER2024`) |
| `backend` | `PORT` | default `5000` |
| `frontend` | `NEXT_PUBLIC_API_URL` | `https://api.example.com/api` |
| `admin` | `NEXT_PUBLIC_API_URL` | `https://api.example.com/api` |

## Deployment

1. **Backend** (Railway / Render / Fly / VPS): root = `backend/`, build = `npm ci`, start = `npm start`
   - env: `MONGODB_URI`, `JWT_SECRET`, `CLIENT_ORIGIN` (နှစ် frontend origin), `DEFAULT_INVITATION_CODE`
2. **User app** (Vercel / Netlify): root = `frontend/`, env: `NEXT_PUBLIC_API_URL`
3. **Admin app** (Vercel / Netlify — သီးသန့် project): root = `admin/`, env: `NEXT_PUBLIC_API_URL`
   - admin app ကို public deploy မလုပ်ဘူး — admin/owner login ပဲ ဝင်ခွင့်ရမယ် (backend က authorize လုပ်တာမို့ client-side hide သာ မလုံလောက်)

### Admin access

```bash
cd backend
node scripts/create-admin.js --phone 09xxxxxxxxx
# password မပေးရင် random ဖန်တီးပြီး တစ်ခါတည်းပဲ ပြသမယ်
```

### Health check

```bash
curl http://localhost:5000/api/health
```

## Tests

```bash
cd backend
npm test          # 215 tests (jest + in-memory MongoDB)
```

## Security notes

- `.env` files က git မှာ **track မလုပ်**ထားပါတယ် — `.env.example` တွေပဲ သိမ်းထားတယ်
- `JWT_SECRET` က placeholder ဆိုရင် server မစတင်ပါ (fail fast) — `src/config/env.js`
- Transaction approve က atomic claim လုပ်တာကြောင့် double-credit မဖြစ်နိုင်ပါ
- Socket.IO conversation join မှာ ownership check ရှိပါတယ်
