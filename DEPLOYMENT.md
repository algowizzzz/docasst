# Deployment Guide

This guide covers deploying the Doc Review Assistant to Railway, Render, or Fly.io.

## 🚂 Railway (Easiest - Recommended)

### Prerequisites
- Railway account (sign up at [railway.app](https://railway.app))
- GitHub repository (optional, but recommended)

### Steps

1. **Install Railway CLI** (optional):
   ```bash
   npm i -g @railway/cli
   railway login
   ```

2. **Deploy via Dashboard**:
   - Go to [railway.app](https://railway.app)
   - Click "New Project"
   - Select "Deploy from GitHub repo" (or "Empty Project" and connect later)
   - Railway will auto-detect Python and build the app

3. **Set Environment Variables**:
   In Railway dashboard → Variables tab, add:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   SECRET_KEY=your-secret-key-here
   PORT=8000  # Railway sets this automatically, but you can override
   ```

4. **Build Command** (if not auto-detected):
   Railway will use the `Procfile` or you can set:
   ```
   cd editor && npm install && npm run build:editor && cd ..
   ```

5. **Start Command**:
   ```
   python app/server.py
   ```

6. **Add Persistent Volume** (for data storage):
   - In Railway dashboard → Settings → Volumes
   - Add volume: `/app/data` (mounts to `data/` directory)
   - This persists documents across deployments

7. **Deploy**: Railway will automatically deploy on git push (if connected to GitHub)

### Railway Notes
- ✅ Auto-detects Python projects
- ✅ Supports WebSockets (Socket.IO)
- ✅ Persistent volumes for file storage
- ✅ Free tier: $5 credit/month
- ✅ Automatic HTTPS

---

## 🎨 Render

### Prerequisites
- Render account (sign up at [render.com](https://render.com))

### Steps

1. **Create New Web Service**:
   - Go to Render dashboard
   - Click "New +" → "Web Service"
   - Connect your GitHub repository

2. **Configure Service**:
   - **Name**: `doc-review-assistant`
   - **Environment**: `Python 3`
   - **Build Command**: `cd editor && npm install && npm run build:editor && cd ..`
   - **Start Command**: `python app/server.py`
   - **Plan**: Starter ($7/month) or Free (with limitations)

3. **Set Environment Variables**:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   SECRET_KEY=your-secret-key-here
   PYTHON_VERSION=3.11.0
   ```

4. **Add Disk** (for persistent storage):
   - In service settings → "Disks"
   - Add disk: `/opt/render/project/src/data` (1GB minimum)
   - Mount point: `/app/data`

5. **Deploy**: Render will build and deploy automatically

### Render Notes
- ✅ Supports WebSockets
- ✅ Persistent disk storage
- ✅ Free tier available (with sleep after inactivity)
- ✅ Automatic HTTPS
- ⚠️ Free tier: spins down after 15min inactivity

---

## 🪂 Fly.io

### Prerequisites
- Fly.io account (sign up at [fly.io](https://fly.io))
- Fly CLI: `curl -L https://fly.io/install.sh | sh`

### Steps

1. **Login**:
   ```bash
   fly auth login
   ```

2. **Create App**:
   ```bash
   fly launch
   ```
   - Follow prompts (app name, region, etc.)
   - Don't deploy yet (we'll configure first)

3. **Configure `fly.toml`** (if not auto-generated):
   ```toml
   app = "your-app-name"
   primary_region = "iad"

   [build]

   [http_service]
     internal_port = 8000
     force_https = true
     auto_stop_machines = false
     auto_start_machines = true
     min_machines_running = 1

   [[vm]]
     memory_mb = 1024
   ```

4. **Set Secrets**:
   ```bash
   fly secrets set ANTHROPIC_API_KEY=sk-ant-...
   fly secrets set SECRET_KEY=your-secret-key-here
   ```

5. **Add Persistent Volume** (for data):
   ```bash
   fly volumes create data --size 10 --region iad
   ```

6. **Update Dockerfile** (if needed) to mount volume:
   ```dockerfile
   VOLUME ["/app/data"]
   ```

7. **Deploy**:
   ```bash
   fly deploy
   ```

### Fly.io Notes
- ✅ Supports WebSockets
- ✅ Persistent volumes
- ✅ Global edge network
- ✅ Free tier: 3 shared VMs, 3GB volumes
- ⚠️ More complex setup than Railway/Render

---

## Required Environment Variables

All platforms need these:

```bash
ANTHROPIC_API_KEY=sk-ant-...        # Required for AI features
SECRET_KEY=your-secret-key-here     # Required for Flask sessions
PORT=8000                            # Usually auto-set by platform
```

Optional:
```bash
DEBUG=false                          # Set to false in production
DATA_DIR=data/documents              # Default storage path
UPLOAD_DIR=data/uploads              # Upload directory
MAX_UPLOAD_SIZE=52428800            # 50MB default
```

## Post-Deployment

1. **Build Frontend** (if not done automatically):
   ```bash
   cd editor
   npm install
   npm run build:editor
   ```

2. **Verify**:
   - Visit your deployment URL
   - Login with: `admin` / `admin123`
   - Test document upload and processing

3. **Monitor Logs**:
   - Railway: Dashboard → Deployments → View logs
   - Render: Dashboard → Logs tab
   - Fly.io: `fly logs`

## Troubleshooting

### Port Issues
- Platforms set `PORT` automatically - don't hardcode it
- Server reads `PORT` env var (updated in `server.py`)

### Build Failures
- Ensure Node.js is available for frontend build
- Check that `editor/package.json` exists
- Verify build command runs successfully

### WebSocket Issues
- All platforms support WebSockets
- If issues occur, check CORS settings in `app/server.py`

### Storage Issues
- Use persistent volumes/disks for `data/` directory
- Without volumes, data is lost on redeploy

## Recommendation

**Start with Railway** - it's the easiest:
- Auto-detects everything
- Simple UI
- Good free tier
- Excellent documentation

Then try Render or Fly.io if you need different features or pricing.

