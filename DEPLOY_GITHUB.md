# POS System V2 - GitHub Setup Guide

## Quick Start Commands

### 1. Initialize and push to GitHub

```powershell
# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "feat: initial POS-V2 system with Netlify deployment config"

# Create GitHub repo and push (using GitHub CLI - recommended)
gh repo create POS-V2 --public --source=. --remote=origin --push

# OR manually create repo on github.com, then:
# git remote add origin https://github.com/armanaros/POS-V2.git
# git branch -M main
# git push -u origin main
```

### 2. Set up Netlify deployment

#### Option A: Automatic (via GitHub Actions)
1. Create a new site on Netlify (https://app.netlify.com)
2. Get your Netlify Site ID and Auth Token:
   - Site ID: Site settings → General → Site details
   - Auth Token: User settings → Applications → Personal access tokens
3. Add GitHub repository secrets:
   - Go to your GitHub repo → Settings → Secrets and variables → Actions
   - Add these secrets:
     - `NETLIFY_AUTH_TOKEN`: your Netlify auth token
     - `NETLIFY_SITE_ID`: your Netlify site ID  
     - `REACT_APP_API_URL`: your backend API URL (e.g., `https://api.mypos.example.com/api`)
4. Push to main branch - GitHub Actions will automatically deploy to Netlify

#### Option B: Connect GitHub to Netlify directly
1. In Netlify: New site from Git → GitHub → select POS-V2 repo
2. Build settings:
   - Build command: `npm run build`
   - Publish directory: `client/build`
3. Environment variables:
   - `REACT_APP_API_URL`: your backend API URL
4. Deploy - future pushes will auto-deploy

### 3. Deploy the backend server

The Express server needs separate hosting (Netlify only hosts static sites):

#### Render (recommended)
1. Connect your GitHub repo to Render
2. Create a Web Service with:
   - Build command: `npm install`
   - Start command: `npm run start:prod`
   - Environment variables: `NODE_ENV=production`, `DB_PATH=/opt/render/project/src/database/pos.db`

#### Docker deployment
```powershell
# Build image
docker build -t pos-v2 .

# Run container
docker run -p 5001:5001 -e NODE_ENV=production -e DB_PATH=/data/pos.db -v ./data:/data pos-v2
```

### 4. Test the deployment

After both client and server are deployed:
1. Update `REACT_APP_API_URL` in Netlify to point to your server
2. Visit your Netlify site URL
3. Test login with: username `admin`, password `admin123`

## Repository Structure

- `client/` - React frontend (deploys to Netlify)
- Root files - Express backend (deploy to Render/Heroku/VPS)
- `.github/workflows/deploy.yml` - Auto-deploy to Netlify
- `netlify.toml` - Netlify configuration
- `Dockerfile` - Container setup for server