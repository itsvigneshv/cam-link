# Cam Link

Use an **iPhone (Safari)** as a Windows webcam for Zoom / Google Meet — **no iOS app**.

| Layer | What |
| --- | --- |
| Web UI | https://camlink.web.app (Firebase Hosting) |
| Signaling | Cloud Firestore |
| Video | WebRTC peer-to-peer on your Wi‑Fi / USB hotspot |
| Virtual webcam | Python bridge → OBS Virtual Camera |

## Quick start on another Windows PC (Python only)

You do **not** need Node.js to use Cam Link day to day. The site is already deployed.

1. Install [Python 3.11+](https://www.python.org/downloads/) and enable **Add to PATH**
2. Install [OBS Studio](https://obsproject.com/) once (provides Virtual Camera)
3. Clone this repo:

```bat
git clone https://github.com/itsvigneshv/cam-link.git
cd cam-link
```

4. Double-click **`run-bridge.bat`** (or `bridge\run.bat`)
5. On iPhone Safari, scan the QR / open the printed `https://camlink.web.app/phone#CODE` link
6. Tap to start the camera → Allow
7. In Zoom/Meet, select **OBS Virtual Camera**

`run.bat` auto-creates `.env` from `bridge/.env.example` and installs dependencies into `bridge/.venv`.

### Requirements checklist

- Phone and PC on the **same Wi‑Fi** (or iPhone USB Personal Hotspot)
- Avoid guest Wi‑Fi, AP/client isolation, and VPN
- Keep the Safari tab in the foreground while streaming

## What works / what does not

| Works | Does not |
| --- | --- |
| Safari camera → desktop via WebRTC | True USB UVC webcam with no iOS app |
| Zoom/Meet via OBS Virtual Camera | Browser-only system webcam |
| 5 GHz Wi‑Fi or USB hotspot | Continuity Camera on Windows |

## Develop / redeploy the web UI (optional)

Needs Node.js 20+:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Deploy:

```bash
npm run build
firebase deploy --only hosting --project cam-link-89c6c
```

Hosting site id: `camlink` → https://camlink.web.app

## Project layout

```
bridge/              Windows Python bridge (aiortc → pyvirtualcam)
  run.bat            One-click start for end users
  requirements.txt
  .env.example       Firebase + hosted URL defaults
src/                 Next.js phone + pair UI
firestore.rules      Signaling security rules
firebase.json        Hosting + Firestore config
run-bridge.bat       Root shortcut to bridge/run.bat
```

## Debug

- Phone Safari console: filter `[CamLink]`
- Bridge terminal: lines prefixed `[CamLink bridge]`

## License

Private / personal use unless otherwise noted.
