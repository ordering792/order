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
| `backend` | `IMAGEKIT_PUBLIC_KEY` | **required** — မရှိရင် server boot မဖြစ်ပါ (`src/config/env.js`) |
| `backend` | `IMAGEKIT_PRIVATE_KEY` | **required** — server အတွင်းပဲ၊ frontend မှာ ဘယ်တော့မှ မထည့်ပါနဲ့ |
| `backend` | `IMAGEKIT_URL_ENDPOINT` | **required** — `https://ik.imagekit.io/YOUR_ID` |
| `frontend` | `NEXT_PUBLIC_API_URL` | `https://api.example.com/api` |
| `admin` | `NEXT_PUBLIC_API_URL` | `https://api.example.com/api` |

> `NEXT_PUBLIC_*` တွေက `next build` မှာ **inline ဖြစ်သွားတာ** မို့ runtime env နဲ့ မပြောင်းနိုင်ပါ။ Docker (Railway) path မှာ build ခါ `--build-arg` (Railway မှာ build variable) အဖြစ် ထည့်ရပါမယ် — `frontend/Dockerfile` နဲ့ `admin/Dockerfile` မှာ မထည့်ရင် build **fail** လုပ်အောင် သတ်ထားတယ် (`localhost:5000` ပဲ bake ဖြစ်ပြီး browser မှာ silent fail ဖြစ်တဲ့အတွက်ပါ)။ Vercel path မှာတော့ Project → Settings → Environment Variables ထဲမှာ **build မစခင်** ထည့်ပါ — အောက်မှာ အဆင့် 3 ကို ကြည့်ပါ။

## Deployment — Render (backend) + Vercel (frontend / admin)

Railway မှာ new account ဖွင့်လို့ မရတဲ့အခါ ဒီနည်းကို သုံးမယ်။
Backend ကို Render **Web Service** (Node runtime — Docker မလိုဘူး)၊ frontend နှစ်ခုကို Vercel **project ၂ ခု** ခွဲတင်မယ်။
Repo root မှာ `render.yaml` (Blueprint) ထည့်ပြီးသား။

### 1. Vercel — project ၂ ခု အရင်ဖန်တီး (deploy မလုပ်ရသေးဘူး)

Vercel dashboard → **Add New → Project** → repo import:

| Project | Root Directory | Framework |
| --- | --- | --- |
| user app | `frontend/` | Next.js (auto-detect) |
| admin app | `admin/` | Next.js (auto-detect) |

Project name သတ်မှတ်လိုက်တာနဲ့ **Settings → Domains** မှာ `<name>.vercel.app` domain ရပြီးသားဖြစ်မယ် —
deploy မစခင်ပဲ domain ၂ ခုကို မှတ်ထားလိုက်ပါ (နောက်အဆင့်က `CLIENT_ORIGIN` အတွက် လိုမယ်)။ ဒီအဆင့်မှာ deploy button မနှိပ်ပဲနဲ့။

`output: "standalone"` ကို next config ထဲက ဖယ်စရာ မလိုပါ — Vercel က ကိုယ်ပိုင် build pipeline သုံးလို့ ဒီ setting က ထိခိုက်စရာမရှိဘူး၊ Docker/local path အတွက် ထားထားလို့ ရတယ်။

### 2. Render — backend deploy

Render dashboard → **New → Blueprint** → repo ရွေး → `render.yaml` အတိုင်း service ဆောက်မယ်။
`sync: false` သတ်ထားတဲ့ variables တွေကို deploy ခါနီး prompt တက်လာမယ်:

| Variable | ထည့်ရမယ့် တန်ဖိုး |
| --- | --- |
| `MONGODB_URI` | Atlas connection string — password URL-encode + **DB name အဆုံးသတ်ပါရမယ်** (ဥပမာ `...mongodb.net/order_management`) |
| `CLIENT_ORIGIN` | အဆင့် 1 က Vercel domain ၂ ခု comma ခွဲ — `https://<frontend>.vercel.app,https://<admin>.vercel.app` |
| `IMAGEKIT_PUBLIC_KEY` / `IMAGEKIT_PRIVATE_KEY` / `IMAGEKIT_URL_ENDPOINT` | ImageKit credentials |
| `JWT_SECRET` | Blueprint က random generate လုပ်ပေးမယ် — ကိုယ့် secret သုံးချင်ရင် 64-char random နဲ့ အစားထိုးလို့ ရတယ် |

Deploy ပြီးရင် URL ရမယ် — `https://<service>.onrender.com`။ စစ်ကြည့်ပါ:

```bash
curl https://<service>.onrender.com/api/health
```

### 3. Vercel — env variables ထည့်ပြီး deploy

Vercel project ၂ ခုလုံးမှာ **Settings → Environment Variables** (Environment = Production):

```
NEXT_PUBLIC_API_URL=https://<service>.onrender.com/api
NEXT_PUBLIC_SOCKET_URL=https://<service>.onrender.com
```

`NEXT_PUBLIC_*` တွေက build-time inline ဖြစ်လို့ **build မစခင်** ထည့်ရမယ် — နောက်မှ ထည့်ခဲ့ပြီးသားဆိုရင်
**Deployments → နောက်ဆုံး deploy → ⋯ → Redeploy** (Use existing Build Cache **မနှိပ်ပဲ** OFF ထားပါ) ပြန်နှိပ်ရမယ်၊ မလို့လျှင် `localhost:5000` ပဲ bake ဖြစ်နေမယ်။

### 4. အလုပ်လုပ်စစ်ကြည့်ရန်

- user app မှာ login → balance + home page
- admin app မှာ login → order plan page (deposit badge + Generate orders)
- support chat ဖွင့်ပြီး message ပို့ → live ပြန်ရောက်မယ် (socket)

### 5. DB migration နဲ့ admin ဖန်တီး (ရှိပြီးသား DB ဆိုရင်)

Render free plan မှာ Shell မရှိလို့ scripts တွေကို ကိုယ်ကွန်ပျူတာကနေ တိုက်ရိုက် run ပါ:

```bash
cd backend
# migration အကုန် လိုက်ဦးစားပေးအစဉ်အတိုင်း run (ထပ်run ချင်း safe)
MONGODB_URI="mongodb+srv://.../order_management" npm run migrate
# ဘာကျန်လဲ အရင်ကြည့်ချင်ရင် (DB ဘာမှမပြောင်းဘူး)
MONGODB_URI="mongodb+srv://.../order_management" npm run migrate -- --status
# DB အသစ်လုံးဝဆိုရင် ပထမ admin:
MONGODB_URI="mongodb+srv://.../order_management" node scripts/create-admin.js --phone 09xxxxxxxxx
```

`npm run migrate` က `scripts/migrate.js` runner — `migrate-task-status.js` → `migrate-task-index.js` → `migrate-orderplan-index.js` အစဉ်အတိုင်း run ပြီး၊ ဖြစ်ပြီးသား နာမည်တွေကို Mongo collection `schemamigrations` မှာ မှတ်ထားလို့ နောက်တစ်ခါ run တော့ skip ဖြစ်မယ် (အစိတ်အပိုင်းတစ်ခု fail ရင် ရပ်တန့်မယ်၊ မှတ်တမ်း မတင်ဘူး)။ အသေးစိတ်က အောက်က "DB migrations" section။

### 6. Render သတိထားစရာတွေ

- **Free plan spin-down** — free web service က 15 မိနစ် traffic မရှိရင် ပိတ်သွားမယ်၊ နောက် request မှာ ~1 မိနစ် cold start စောင့်ရမယ်၊ ချိတ်ထားတဲ့ socket တွေလည်း ပြတ်မယ်။ Realtime (support chat / balance update) အမြဲရှင်ထားချင်ရင် **Starter plan ($7/လ)** သုံးပါ၊ ဒါမှမဟုတ် uptime monitor (ဥပမာ cron-job.org) နဲ့ `/api/health` ကို 5 မိနစ်တစ်ခါ ping ထားပါ။
- **Instance တစ်ခုတည်း** — Render dashboard မှာ instance count ကို 1 ကျော်မတိုးပါနဲ့ — Redis adapter မထည့်ရသေးသလို့ socket emit တွေ silently drop ဖြစ်မယ် (အောက်မှာ Socket.IO section)။
- **Vercel preview URLs** — PR တိုင်းရတဲ့ `<hash>.vercel.app` preview URL တွေက `CLIENT_ORIGIN` list မှာ မပါလို့ API ချိတ်လို့ မရပါမယ် — production domain တွေပဲ သုံးပါ။
- **Custom domain** — နောက်ပိုင်း custom domain ထည့်ခဲ့ရင် `CLIENT_ORIGIN` ကိုလည်း update လုပ်ပြီး backend ကို redeploy လုပ်ရမယ်။

## Deployment — Railway (Docker, သုံးservice လုံး) — အခြားရွေးချယ်စရာ

Service တိုင်း `Dockerfile` + `railway.json` ရှိပါတယ်။ Railway က `Dockerfile` ကို auto-detect လုပ်ပေမယ့် monorepo မှာ **root directory** ကို သတ်မှတ်ပေးရပါမယ်။

### 1. Project ဖွင့်ပြီး service ၃ ခု ထည့်ပါ

| Service | Root Directory | Build (Dockerfile) | Public |
| --- | --- | --- | --- |
| `backend` | `backend/` | `backend/Dockerfile` | ✅ Public networking |
| `frontend` | `frontend/` | `frontend/Dockerfile` | ✅ Public networking |
| `admin` | `admin/` | `admin/Dockerfile` | ✅ (login gate သာ — အောက်မှာ သတိ) |

Root Directory set ချင်မယ်ဆို service variable `RAILWAY_DOCKERFILE_PATH=backend/Dockerfile` လည်း သုံးလို့ရတယ်။

### 2. Deploy အစဉ် (domain တွေ interdepend ဖြစ်လို့ စဉ်အစဉ် အရေးကြီး)

```
a) backend ကို အရင် deploy → https://<backend>.up.railway.app ရမယ်
b) frontend/admin service တွေမှာ BUILD variable:
     NEXT_PUBLIC_API_URL=https://<backend>.up.railway.app/api
c) frontend/admin ကို deploy → domain ၂ ခု ရမယ်
d) backend service မှာ CLIENT_ORIGIN ကို အဲဒီ ၂ domain comma ခွဲ ထည့်ပြီး ပြန် deploy
     CLIENT_ORIGIN=https://<frontend>.up.railway.app,https://<admin>.up.railway.app
```
**d) မလုပ်ရင် CORS fail** — `CLIENT_ORIGIN` default က `http://localhost:3000` ဖြစ်နေလို့ browser request တွေ block ဖြစ်မယ်။

### 3. backend variables (Service → Variables)

```
MONGODB_URI          Atlas connection string (password URL-encode လုပ်ပါ)
JWT_SECRET           32+ စာလုံး — node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
JWT_EXPIRES_IN       1d
CLIENT_ORIGIN        အဆင့် (d) အတိုင်း ၂ ခု comma
DEFAULT_INVITATION_CODE
IMAGEKIT_PUBLIC_KEY
IMAGEKIT_PRIVATE_KEY
IMAGEKIT_URL_ENDPOINT
```
`PORT` ကို Railway ထည့်ပေးတယ် — container တွေက `0.0.0.0` မှာ နားထောင်အောင် သတ်ထားပြီး။

> ⚠️ ImageKit key ၃ ခု **မရှိရင် backend crash loop** ဝင်မယ် (`src/config/env.js` က fail-fast လုပ်လို့)။ Deploy မတိုင်မီ ထည့်ထားရမယ်။

### 4. Admin account ဖန်တီးရန်

Railway service → **Deploy → View Details → Attach / Exec container** ထဲမှာ:

```bash
node scripts/create-admin.js --phone 09xxxxxxxxx
# password မပေးရင် random ဖန်တီးပြီး တစ်ခါတည်းပဲ ပြသမယ် (ခopy လုပ်ထားပါ)
```
`scripts/` ကို image ထဲ COPY လုပ်ထားလို့ exec မှာ တိုက်ရိုက်ရတယ်။

### 5. DB migration (DB အသစ်မဟုတ်ရင် လုပ်ရမယ်)

Schema ပြောင်းတဲ့အခါ Mongoose က index အသစ် တင်ပေမယ့် **အဟောင်းကို မဖျက်ဘူး** — ရှိပြီးသား DB ဆို round ၂ generate/create က E11000 နဲ့ fail ဖြစ်တယ် (API က `409 This database still has the legacy unique index...` နဲ့ ရှင်းရှင်းလင်းလင်း ငြင်းတယ် — 500 stack dump မထွက်တော့ဘူး)။ Exec container ထဲမှာ runner တစ်ခါတည်း run ပါ:

```bash
npm run migrate            # အကုန် (အစဉ်လိုက်)
npm run migrate -- --status # ဘာကျန်လဲ ကြည့်ရုံ၊ DB မပြောင်းဘူး
```

Runner က `scripts/migrate.js` — အစိတ်အပိုင်းတစ်ခုချင်းစီ (`migrate-task-status.js`၊ `migrate-task-index.js`၊ `migrate-orderplan-index.js`) ကို idempotent လုပ်ထားလို့ ပြန်run ချင်း safe ပါ။ အသေးစိတ်က အထက်က Render section နဲ့ အောက်က "DB migrations" section။

**Task** — unique index က `(userId, orderNumber)` ကနေ `(userId, orderPlanId, orderNumber)` ပြောင်းလိုက်တယ်၊ plan အသစ် (round ၂) မှာ orderNumber ၁ ပြန်ထပ်လို့ E11000 ဖြစ်နေလို့။

```
E11000 duplicate key error collection: <db>.tasks index: userId_1_orderNumber_1
```

**OrderPlan** — အရင် schema က `userId` ကို **unique** တင်ထားခဲ့တယ်၊ round ၂ ကို ခွင့်ပြုဖို့ ပြောင်းလိုက်ပေမယ့် အဟောင်း index က ကျန်နေတယ်။ Admin panel မှာ plan ထပ်ဖန်တီးရင် "Internal server error" + terminal ထဲ:

```
E11000 duplicate key error collection: <db>.orderplans index: userId_1
```

**Task status** — `migrate-task-status.js` က legacy `status: "pending"` rows တွေကို `available` ပြောင်းပေးတယ် (`updateMany` — ထပ်run လည်း 0 modified နဲ့ ငြိမ်တယ်)။ Code က `AVAILABLE_STATUSES = ["available", "pending"]` (`src/controllers/grabController.js:70`) နဲ့ ခဏ compat ထားထားလို့ မrun ရင်လည်း order page မပျက်ဘူး — ဒါပေမယ့် prod DB မှာ migration confirm ပြီးမှ `"pending"` ကို ထုတ်ချမယ်၊ ဒါကြောင့် ထုတ်မချခင် **မသွားဖျက်နဲ့**။

**Order round base (deposit / balance)** — generate လုပ်တဲ့အခါ base နှစ်မျိုး ရှိတယ် (`src/services/orderGenerationService.js`):

- `depositTransactionId` ပေးရင် (Admin UI က free deposit ရှိတဲ့အခါ) — အရင်အတိုင်း deposit အပေါ် တွက်မယ် (order တစ်ခုချင်း product က deposit ရဲ့ 80–100%)။
- မပေးရင် (free deposit မရှိတဲ့ round ၂၊ ၃ …) — အရင် **deposit လုပ်ဖူးတဲ့** user ဆို user ရဲ့ လက်ရှိ **balance** အပြည်အပြည်ကို base ထားမယ် (order တစ်ခုချင်း product က balance ရဲ့ 80–100%)။ deposit အသစ် မလိုဘူး — plan မှာ `initialDepositTxId = null` နဲ့ `currentBase = balance` မှတ်တယ်။
- **Lucky order** က completion မှာ deposit transaction အစစ်ကို claim ဆက်လုပ်မယ် — generate ကို balance base နဲ့ လုပ်နိုင်ပေမယ့် lucky order ရောက်တဲ့အခါ user က `requiredDeposit` နဲ့ တိတိကျကျ တူတဲ့ deposit ထည့်ထားရမယ် (မထည့်ရင် completion မှာ error တက်မယ်)။ Lucky band က base (deposit သို့ balance) + အရင် lucky `requiredDeposit` တွေ ပေါင်းပြီး တွက်တယ်။

### 6. Socket.IO သတိထားရန်

Railway websocket support လုပ်တယ်၊ ဒါပေမယ့် **backend service တစ်ခုတည်း** သာထားပါ — Redis adapter မထည့်ရသေးသလို့ instance ၂ ခုဆို B က REST request ထဲက emit က A socket ကို silently drop ဖြစ်မယ် (`src/socket/index.js`)။ Support chat + realtime balance update အလုပ်လုပ်ဖို့ single instance မဖြစ်မနေ။

Admin app ကလည်း socket ချိတ်ပြီး order plan page မှာ deposit status + plan status ကို live update လုပ်ပါတယ် (role = `admin` သာ "admins" room ထဲဝင်တယ် — owner တွေက 15 စက္ကန့် polling နဲ့ update ဖြစ်ပါတယ်)။

### 7. Health check

```bash
curl https://<backend>.up.railway.app/api/health
```
`railway.json` မှာ `healthcheckPath` သတ်ပြီးသား (`/api/health`, frontend/admin တွေ `/`)။

### Local Docker နဲ့ စမ်းရန်

```bash
docker compose up --build
# frontend :3000   admin :3001   backend :5000
```
Compose ထဲမှာ MongoDB ကို **single-node replica set** (`--replSet rs0` + auto `rs.initiate`) အဖြစ် တင်ပေးထားတယ် — withdraw approve/order complete တွေ `session.withTransaction` သုံးလို့ standalone mongod ဆို fail ဖြစ်လို့ပါ။ Atlas သုံးချင်ရင် `backend` service ရဲ့ `MONGODB_URI` ကို comment ဖွင့် override လုပ်ပါ။

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

## DB migrations

Index/schema ပြောင်းတိုင်း ရှိပြီးသား DB အတွက် one-off script လိုတယ် (Mongoose က index အသစ်တင်ပေမယ့် အဟောင်းကို မဖျက်ဘူး)။ Script တစ်ခုချင်း manual run မလုပ်တော့ဘဲ runner သုံးပါ:

```bash
cd backend
npm run migrate              # pending တွေကို အစဉ်လိုက် run + မှတ်တမ်းတင်
npm run migrate -- --status   # applied/pending စာရင်းပဲ ပြမယ် (DB မပြောင်းဘူး)
```

ဘယ်လိုအလုပ်လုပ်လဲ (`scripts/migrate.js`):

- **အစဉ်** — `migrate-task-status` → `migrate-task-index` → `migrate-orderplan-index`။ Data ပြောင်းတဲ့ script ကို index sync အရင် run မယ်။
- **မှတ်တမ်း** — collection `schemamigrations` (`name` unique index) ထဲ `{ name, appliedAt }` ထည့်တယ်၊ run ပြီးသား name ကို skip တယ်။
- **fail ရပ်** — script တစ်ခု exit non-zero ဆို ရပ်တန့်တယ်၊ မှတ်တမ်း မတင်ဘူး၊ နောက်တွေ မrun ဘူး — ပြင်ပြီး ပြန်run လိုက်ရင် resume ဖြစ်မယ်။
- **idempotent** — runner မသိမီ ကိုယ်တိုင် run ပြီးသား DB အတွက် script တွေက `dropIndex` skip + `syncIndexes`/`updateMany` နဲ့ ထပ်run ချင်း ဘေးကင်းတယ်။
- **fresh DB** — collection မရှိသေးရင် index read က `ns does not exist` (code 26/27) တက်တယ်၊ `scripts/lib/schemaIndexes.js` ရဲ့ `currentIndexes()` ကို သုံးထားလို့ ကျော်ဖြတ်တယ်။

Migration အသစ်ထည့်ရင် — `scripts/` ထဲ idempotent script တစ်ခုရေးပြီး `migrate.js` ရဲ့ `MIGRATIONS` array မှာ နာမည်+ဖိုင်ကို အစဉ်လိုက် additive append ပါ (အရင် entry တွေကို မပျက်စီးစေနဲ့)။ Production DB (`order_management`) မှာ run ချိန် `MONGODB_URI` ကို ကိုယ်တိုင် explicit set လုပ်ပါ — မှားယွင်း DB ကို မထိစေဖို့။

## CI

`.github/workflows/ci.yml` — push / PR တိုင်း ၃ job parallel run:

| Job | အဆင့် |
| --- | --- |
| `backend` | `mongo:7` service (single-node replica set ကို step အလိုက် `rs.initiate`) + `npm run lint` (blocking) + `TEST_USE_ATLAS=1` နဲ့ `npm test` — `session.withTransaction` တွေအတွက် replica set မဖြစ်မနေ လို |
| `frontend` / `admin` | `npm ci` → `npx tsc --noEmit` → `npx jest --coverage=false` → `npm run lint` |

- **lint က non-blocking** (`continue-on-error`) — ပစ္စုပ္ပန် pre-existing errors frontend 8 / admin 13 ရှိနေလို့၊ သန့်စင်တဲ့ PR တွေမှာ အသစ်ထပ်မဖြစ်အောင် သတိထားရုံ။
- CI မှာ monorepo အပြည့် checkout ဖြစ်လို့ sibling app ရှိနေမယ် — `frontend` ⇄ `admin` byte-identical shared-file guard (`src/lib/__tests__/shared-files.test.ts`) အမှန်တကယ် compare ဖြစ်မယ်; sibling မတွေ့ရင် skip မဖြစ်ဘဲ test fail ဖြစ်အောင် ရေးထားတယ်။
- Playwright e2e က CI မှာ မပါ — backend + dev server တွေ live run တင်ရလို့။

## Tests

```bash
cd backend  && npm test    # 259 tests / 15 suites (jest + replica-set MongoDB)
cd frontend && npm test    # 107 tests / 8 suites
cd admin    && npm test    # 113 tests / 7 suites

# browser e2e (Playwright — service တွေ run တင်ထားရမယ်)
cd frontend && npm run test:e2e
cd admin    && npm run test:e2e
```

## Security notes

- `.env` files က git မှာ **track မလုပ်**ထားပါတယ် — `.env.example` တွေပဲ သိမ်းထားတယ်
- `JWT_SECRET` က placeholder ဆိုရင် server မစတင်ပါ (fail fast) — `src/config/env.js`
- Transaction approve က atomic claim လုပ်တာကြောင့် double-credit မဖြစ်နိုင်ပါ
- Socket.IO conversation join မှာ ownership check ရှိပါတယ်
