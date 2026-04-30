# Deploy TradingVerse to VPS — Complete Step-by-Step Guide

> **Time required:** About 1–1.5 hours  
> **Your VPS IP:** `65.20.81.173` (Vultr, Mumbai)  
> **Your domain:** `tradingverse.in`  
> **Your Mac:** You'll run some commands from your Mac, and some on the VPS

---

## VPS Current Status (checked 28 Apr 2026)

| | Status |
|---|---|
| OS | Ubuntu 24.04 LTS ✓ |
| CPU | 1 vCPU @ 3GHz ✓ |
| RAM | 955MB total, ~526MB available ✓ |
| Swap | 2.3GB already set up ✓ |
| Disk | 15GB free ✓ |
| Node.js | v20.20.2 already installed ✓ |
| Nginx | NOT installed — we install it below |

**Already running on VPS:**
- `kite-worker` — your Kite order worker (healthy, leave it alone)
- `kite-ws-bridge` — Kite WebSocket bridge (leave it alone)

---

## What We Are Doing

Right now your app runs on Vercel (paused/suspended). We are moving it to run directly on your own Vultr server. After this guide your app will be at `https://tradingverse.in` — same URL, but served from your VPS. Vercel will not be needed.

---

## Before You Start

You will need:
- Your Mac (where the code lives)
- Terminal app on your Mac (press Cmd+Space, type Terminal, press Enter)
- Your VPS SSH access (you already use this for kite-worker)
- Your Vultr account login at `https://my.vultr.com`
- Your domain DNS login for `tradingverse.in` (wherever it is registered — Namecheap, GoDaddy, Cloudflare, etc.)

---

## PART 1 — Copy Your Environment File to the VPS

Your app needs a file called `.env.local` that contains all your secret keys (Kite, Redis, etc.). It already exists on your Mac. We copy it to the VPS first.

### Step 1 — Open Terminal on your Mac

Press **Cmd + Space**, type **Terminal**, press Enter.

### Step 2 — Copy the .env.local file to VPS

Type this command exactly (one line), then press Enter:

```
scp /Volumes/Work/projects/tradingverse/.env.local root@65.20.81.173:/root/tradingverse-env
```

> **What this does:** Copies your `.env.local` from your Mac to the VPS as a temporary file.

If it asks **"Are you sure you want to continue connecting?"** — type `yes` and press Enter.

If it asks for a password, type your VPS root password and press Enter (characters won't show — that's normal).

---

## PART 2 — Log Into Your VPS

### Step 3 — SSH into the VPS

In the same Terminal window, type:

```
ssh root@65.20.81.173
```

Press Enter. Enter password if asked.

You should now see a prompt that looks like `root@vultr:~#` — you are now typing ON the VPS.

> **Important:** Every command from this point forward is typed on the VPS (in this SSH window), unless I specifically say "on your Mac."

---

## PART 3 — Set Up the App Directory

Node.js is already installed (v20.20.2). Swap is already set up. Skip straight to cloning the code.

### Step 4 — Create the app directory

```
mkdir -p /var/www/tradingverse
```

### Step 5 — Clone the code from GitHub

```
cd /var/www
git clone https://github.com/bhatiaaman/tradingverse.git tradingverse
```

> If it says "already exists and is not empty" — run this instead:
> ```
> cd /var/www/tradingverse && git pull origin master
> ```

### Step 6 — Move into the app folder

```
cd /var/www/tradingverse
```

Your prompt will now show `root@vultr:/var/www/tradingverse#`

### Step 7 — Copy your environment file into the app

```
cp /root/tradingverse-env /var/www/tradingverse/.env.local
```

### Step 8 — Verify the file is there

```
ls -la .env.local
```

You should see a file listed. If you see "No such file or directory" — redo Step 2 and Step 7.

### Step 9 — Fix the app URL in the env file

The env file currently has `NEXT_PUBLIC_APP_URL=http://localhost:3000` which is wrong for production. Fix it:

```
sed -i 's|NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=https://tradingverse.in|' /var/www/tradingverse/.env.local
```

Verify it changed:

```
grep NEXT_PUBLIC_APP_URL /var/www/tradingverse/.env.local
```

You should see: `NEXT_PUBLIC_APP_URL=https://tradingverse.in` ✓

---

## PART 4 — Build and Start the App

### Step 10 — Install dependencies

```
npm install
```

> Takes 2–5 minutes. Many lines will scroll past — that's normal.

### Step 11 — Build the app

Because RAM is tight (1GB VPS), always use this memory-safe build command:

```
NODE_OPTIONS="--max-old-space-size=1536" npm run build
```

> Takes **10–15 minutes** on this VPS (1 vCPU). Lots of text scrolls by — normal. Wait until the prompt returns.
>
> **If it fails with any "heap" or "memory" error:** Run this instead:
> ```
> NODE_OPTIONS="--max-old-space-size=1024" npm run build
> ```

### Step 12 — Start the app with PM2

PM2 is already installed on your VPS (it runs kite-worker). Start the Next.js app:

```
pm2 start npm --name "tradingverse" -- start
pm2 save
```

### Step 13 — Check the app is running

```
pm2 status
```

You should see `tradingverse` with status **online** in green. You will also see `kite-worker` and `kite-ws-bridge` — those are fine, leave them. ✓

### Step 14 — Quick sanity test

```
curl http://localhost:3000
```

If you see a bunch of HTML text → app is running on port 3000. ✓

---

## PART 5 — Set Up Nginx (Web Server)

Nginx receives traffic on ports 80 (HTTP) and 443 (HTTPS) and forwards it to your app on port 3000.

### Step 14 — Install Nginx

```
apt-get update && apt-get install -y nginx
```

### Step 15 — Create the Nginx config file

```
nano /etc/nginx/sites-available/tradingverse
```

A text editor opens. **Copy and paste the entire block below** into it:

```nginx
server {
    listen 80;
    server_name tradingverse.in www.tradingverse.in;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
```

After pasting:
- Press **Ctrl + X**
- Press **Y**
- Press **Enter**

### Step 16 — Enable the site and remove the default page

```
ln -s /etc/nginx/sites-available/tradingverse /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
```

### Step 17 — Test config and start Nginx

```
nginx -t
```

You must see: `syntax is ok` and `test is successful`. If you see errors, redo Step 15.

```
systemctl restart nginx
systemctl enable nginx
```

---

## PART 6 — Open Firewall Ports

### Step 18 — Open ports in the VPS firewall

```
ufw allow 22
ufw allow 80
ufw allow 443
ufw --force enable
```

### Step 19 — Check Vultr's cloud firewall (in browser)

1. Go to `https://my.vultr.com`
2. Click your server → **Firewall** tab
3. If a firewall group is attached — make sure ports **22, 80, 443** are in Inbound Rules
4. If no firewall group — nothing to do ✓

---

## PART 7 — Change DNS to Point to Your VPS (GoDaddy)

> This switches traffic from Vercel to your VPS. Do this before getting SSL.
>
> ⚠️ `bhatiaverse.com` is on a different registrar/Vercel — do NOT touch it. Only touch `tradingverse.in` here.

### Step 20 — Open GoDaddy DNS settings

1. Go to `https://www.godaddy.com` and sign in
2. Click your name (top right) → **My Products**
3. Scroll to find **tradingverse.in** → click the **DNS** button next to it
4. You are now on the DNS Management page for tradingverse.in

### Step 21 — Update the @ (root) A record

In the DNS records table, find the row where:
- **Type** = `A`
- **Name** = `@`

Click the **pencil icon** (Edit) on that row.

Change the **Value** field to:
```
65.20.81.173
```

Change **TTL** to `600 seconds` (or the lowest option available).

Click **Save**.

### Step 22 — Update the www A record

In the same DNS records table, find the row where:
- **Type** = `A`
- **Name** = `www`

Click the **pencil icon** on that row.

Change the **Value** field to:
```
65.20.81.173
```

Click **Save**.

> If there is no `www` row, click **Add New Record** and create:
> - Type: `A`, Name: `www`, Value: `65.20.81.173`, TTL: `600 seconds`

### Step 23 — Wait for DNS to propagate

Check progress at: `https://www.whatsmydns.net/#A/tradingverse.in`

When you see `65.20.81.173` in most results → DNS has propagated. This takes 5–30 minutes.

---

## PART 8 — Get Free SSL Certificate (HTTPS)

> Only run this AFTER Step 23 shows your VPS IP.

### Step 23 — Install Certbot

```
apt-get install -y certbot python3-certbot-nginx
```

### Step 24 — Get the certificate

```
certbot --nginx -d tradingverse.in -d www.tradingverse.in
```

Answer the prompts:
- **Email:** your email address
- **Terms:** type `A` → Enter
- **EFF share:** type `N` → Enter
- **Redirect:** type `2` → Enter ← important, choose this

Success message: `Congratulations! Your certificate and chain have been saved.` ✓

SSL auto-renews every 90 days — nothing more to do.

---

## PART 9 — Final Verification

### Step 25 — Open the site

Go to `https://tradingverse.in` in your browser.

- Padlock icon showing ✓
- App loads ✓
- Login works ✓
- Charts load ✓

### Step 26 — Check logs if anything looks wrong

```
pm2 logs tradingverse --lines 50
```

Press **Ctrl + C** to exit log view.

---

## PART 10 — Deploy Script for Future Updates

Whenever you push new code to GitHub and want to update the VPS:

### Step 27 — Create the deploy script (one time)

```
nano /root/deploy.sh
```

Paste this:

```bash
#!/bin/bash
echo "=== Pulling latest code ==="
cd /var/www/tradingverse
git pull origin master

echo "=== Installing dependencies ==="
npm install

echo "=== Building app ==="
NODE_OPTIONS="--max-old-space-size=1536" npm run build

echo "=== Restarting app ==="
pm2 restart tradingverse

echo "=== Done ==="
pm2 status
```

Press **Ctrl + X**, **Y**, **Enter**.

```
chmod +x /root/deploy.sh
```

Future deployments: just run `/root/deploy.sh`

---

## Troubleshooting

**502 Bad Gateway** → Next.js isn't running. Run: `pm2 restart tradingverse` then `pm2 logs tradingverse --lines 30`

**Site won't load at all** → DNS hasn't propagated yet, or Nginx is down. Run: `systemctl restart nginx`

**Build fails with memory error** → Try: `NODE_OPTIONS="--max-old-space-size=1024" npm run build`

**Login doesn't work / blank errors** → Check env file: `cat /var/www/tradingverse/.env.local | grep -c "="` — should show ~22

**Certbot fails** → DNS hasn't pointed to your VPS yet. Wait for Step 23 to confirm your IP, then retry.

**kite-worker stopped** → `pm2 restart kite-worker`

---

## What Runs on VPS After This Guide

```
VPS (65.20.81.173, Mumbai)
├── Nginx (ports 80/443)     — handles HTTPS, forwards to app
├── tradingverse (port 3000) — your Next.js app (pm2)
├── kite-worker              — your Kite order worker (pm2, unchanged)
└── kite-ws-bridge           — Kite WebSocket bridge (pm2, unchanged)
```

Vercel is no longer needed.

---

## Scaling to 50 Users — What Needs to Change

The current 1GB/1vCPU VPS handles **1–5 users** comfortably. For 50 users, two things must change:

### 1. Upgrade the VPS (on Vultr, takes 10 minutes, zero code changes)

Go to Vultr → your server → **Resize** tab:

| Plan | vCPU | RAM | Cost | Users |
|------|------|-----|------|-------|
| Current | 1 | 1GB | ~$6/mo | 1–5 |
| **Recommended** | **2** | **4GB** | **~$24/mo** | **up to 50** |
| Future | 4 | 8GB | ~$48/mo | 50–200 |

Vultr resize is live — server reboots once (~2 min downtime), app restarts automatically via pm2.

### 2. Switch to WebSocket Architecture (code changes, ~1 week of work)

This is the bigger multiplier. Here is why it matters:

**Today (polling — current code):**
```
50 users × Third Eye every 30s = 100 heavy computations/min on the server
50 users × DOM every 15s      = 200 Redis reads/min on the server
```
The server does the same work 50 times over.

**After WebSocket:**
```
Third Eye runs once per 30s — result pushed to all 50 users simultaneously
DOM updates pushed to all 50 users from one Kite stream
```
The server does the work once regardless of how many users are connected.

**The WebSocket plan** (from earlier architecture discussion) moves these two heavy routes off polling entirely:
- `/api/third-eye/scan` — server runs this once, broadcasts to all subscribers
- `/api/dom/pressure` — server reads DOM once from Kite, pushes to all subscribers

**Result with both changes (4GB VPS + WebSocket):** 50 concurrent users is comfortable. The server computes Third Eye twice a minute, not 100 times. Memory usage stays flat regardless of user count growing.

### 3. One system setting to change after VPS resize

After upgrading to 2 vCPU, run these on the VPS to tune for more connections:

```bash
# Increase file descriptor limit (default 1024 is too low for 50 users)
echo "* soft nofile 65536" >> /etc/security/limits.conf
echo "* hard nofile 65536" >> /etc/security/limits.conf

# Run Next.js in cluster mode (uses both CPUs)
pm2 delete tradingverse
pm2 start npm --name "tradingverse" -i 2 -- start
pm2 save
```

The `-i 2` flag runs two Next.js instances (one per CPU core), doubling throughput.

### Summary: Path to 50 Users

| Step | Action | When |
|------|--------|------|
| 1 | Deploy on current VPS (this guide) | Now |
| 2 | Upgrade Vultr to 2vCPU/4GB | Before going public |
| 3 | WebSocket rearchitecture (DOM + Third Eye) | Same week as upgrade |
| 4 | Run pm2 cluster mode + raise file limits | After upgrade |

---

*Last updated: April 2026*
