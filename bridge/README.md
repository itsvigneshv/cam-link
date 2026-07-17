# Cam Link — Windows bridge

Turns the iPhone Safari stream into a virtual webcam (OBS Virtual Camera / pyvirtualcam).

## Quick start (Python only)

The web UI is already hosted at **https://camlink.web.app**. On a Windows PC you only need:

1. [Python 3.11+](https://www.python.org/downloads/) (check **Add to PATH**)
2. [OBS Studio](https://obsproject.com/) once (for the Virtual Camera driver)
3. Double-click **`run.bat`** in this folder (or `run-bridge.bat` in the repo root)

`run.bat` will:

- copy `.env.example` → `.env` if needed
- create `.venv` and install `requirements.txt`
- start the bridge and print a QR / room URL

Then on the iPhone (Safari): open the URL, allow camera, keep the tab open.  
In Zoom/Meet: choose **OBS Virtual Camera**.

## Manual start

```bat
cd bridge
copy .env.example .env
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

## Same network

Phone and PC must share Wi‑Fi or USB Personal Hotspot. Video stays on your LAN; Firebase is only used for room signaling.
