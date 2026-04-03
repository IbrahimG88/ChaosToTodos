# ChaosToTodos

Paste your messy notes, brain dumps, or chaotic text — ChaosToTodos uses Claude AI to extract a clean, structured todo list grouped by day and category.

## Stack

- **Frontend**: React + Vite (deployed on Vercel)
- **Backend**: Node.js + Express (deployed on Railway)
- **AI**: Anthropic Claude (`claude-sonnet-4-20250514`)

---

## Local Development

### Prerequisites

- Node.js 18+
- An Anthropic API key ([get one here](https://console.anthropic.com/))

### 1. Clone and install dependencies

```bash
git clone <your-repo-url>
cd ChaosToTodos
npm run install:all
```

### 2. Configure environment variables

**Server:**
```bash
cp server/.env.example server/.env
# Edit server/.env and add your ANTHROPIC_API_KEY
```

**Client:**
```bash
cp client/.env.example client/.env
# VITE_API_URL=http://localhost:3001 is already set
```

### 3. Start both servers

```bash
npm run dev
```

This runs both the React dev server (port 5173) and the Express server (port 3001) concurrently.

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Deployment

### Backend → Railway

1. Go to [railway.app](https://railway.app) and create a new project
2. Connect your GitHub repo and select the **root directory** (or set the root to `/server`)
3. In Railway project settings:
   - **Root Directory**: `server`
   - **Start Command**: `node index.js` (already in `railway.json`)
   - **Health Check Path**: `/health`
4. Add environment variables in Railway dashboard:
   - `ANTHROPIC_API_KEY` → your Anthropic API key
   - `PORT` → Railway sets this automatically
5. Deploy. Copy your Railway public URL (e.g. `https://chaostotodos-server.up.railway.app`)

### Frontend → Vercel

1. Go to [vercel.com](https://vercel.com) and create a new project
2. Connect your GitHub repo
3. In Vercel project settings:
   - **Root Directory**: `client`
   - **Framework Preset**: Vite (auto-detected)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Add environment variables in Vercel dashboard:
   - `VITE_API_URL` → your Railway backend URL (e.g. `https://chaostotodos-server.up.railway.app`)
5. Deploy

> **Important:** The `VITE_API_URL` must NOT have a trailing slash.

---

## Project Structure

```
ChaosToTodos/
├── package.json          # Root: concurrently dev script
├── .gitignore
├── README.md
├── client/               # React + Vite frontend
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   ├── vercel.json
│   ├── .env.example
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       └── App.css
└── server/               # Express backend
    ├── package.json
    ├── index.js
    ├── railway.json
    ├── Procfile
    └── .env.example
```

## How It Works

1. User pastes or uploads chaotic text
2. Frontend sends the text to `POST /api/parse` on the Express backend
3. Backend calls the Anthropic API with a strict system prompt
4. Claude extracts todos as a JSON array with `task`, `day`, `importance`, and `category`
5. Frontend renders the todos as cards grouped by day, then by category
