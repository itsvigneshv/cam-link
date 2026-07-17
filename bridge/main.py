"""
Cam Link Windows bridge.

Creates a Firestore room, waits for the iPhone Safari offer, answers with
aiortc, and pushes frames into OBS Virtual Camera via pyvirtualcam.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import secrets
import socket
import sys
import time
from pathlib import Path

import aiohttp
import numpy as np
from aiortc import (
    RTCConfiguration,
    RTCIceCandidate,
    RTCIceServer,
    RTCPeerConnection,
    RTCSessionDescription,
)
from dotenv import load_dotenv

from firestore_rest import FirestoreRest

try:
    import pyvirtualcam
except ImportError:  # pragma: no cover
    pyvirtualcam = None  # type: ignore

try:
    import qrcode
except ImportError:  # pragma: no cover
    qrcode = None  # type: ignore

ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

logging.basicConfig(
    level=logging.INFO,
    format="[CamLink bridge] %(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("camlink")


def generate_room_code(length: int = 6) -> str:
    return "".join(secrets.choice(ROOM_ALPHABET) for _ in range(length))


def local_ipv4_addresses() -> list[str]:
    ips: set[str] = set()
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith("127."):
                ips.add(ip)
    except OSError:
        pass
    try:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        probe.connect(("8.8.8.8", 80))
        ips.add(probe.getsockname()[0])
        probe.close()
    except OSError:
        pass
    return sorted(ips)


def load_config() -> tuple[str, str, str]:
    root = Path(__file__).resolve().parent
    load_dotenv(root / ".env")
    load_dotenv(root.parent / ".env.local")
    load_dotenv(root.parent / ".env")

    api_key = os.getenv("FIREBASE_API_KEY") or os.getenv(
        "NEXT_PUBLIC_FIREBASE_API_KEY"
    )
    project_id = os.getenv("FIREBASE_PROJECT_ID") or os.getenv(
        "NEXT_PUBLIC_FIREBASE_PROJECT_ID"
    )
    web_origin = (
        os.getenv("PHONECAM_WEB_ORIGIN")
        or os.getenv("CAM_LINK_WEB_ORIGIN")
        or "https://camlink.web.app"
    )

    if not api_key or not project_id:
        print(
            "Missing FIREBASE_API_KEY / FIREBASE_PROJECT_ID.\n"
            "Copy .env.example values into bridge/.env or ../.env.local",
            file=sys.stderr,
        )
        sys.exit(1)
    return api_key, project_id, web_origin.rstrip("/")


def print_pairing(web_origin: str, room_id: str, lan_ips: list[str]) -> None:
    url = f"{web_origin.rstrip('/')}/phone#{room_id}"
    print("\n=== Cam Link bridge ===")
    print(f"Room code : {room_id}")
    print(f"LAN IPs   : {', '.join(lan_ips) if lan_ips else '(none detected)'}")
    print("Mode      : local WebRTC (video stays on your LAN)")
    print(f"Open on iPhone Safari:\n  {url}\n")
    if qrcode is not None:
        qr = qrcode.QRCode(border=1)
        qr.add_data(url)
        qr.make(fit=True)
        qr.print_ascii(invert=True)
    print("Waiting for phone offer… (Ctrl+C to quit)\n")


def parse_ice_candidate(data: dict) -> RTCIceCandidate | None:
    from aiortc.sdp import candidate_from_sdp

    candidate = data.get("candidate")
    if not candidate:
        return None
    line = candidate
    if line.startswith("candidate:"):
        line = line[len("candidate:") :]
    try:
        ice = candidate_from_sdp(line)
        ice.sdpMid = data.get("sdpMid")
        ice.sdpMLineIndex = data.get("sdpMLineIndex")
        return ice
    except Exception as exc:  # noqa: BLE001
        log.warning("Could not parse ICE candidate %r: %s", candidate, exc)
        return None


async def wait_ice_complete(pc: RTCPeerConnection, timeout: float = 4.0) -> None:
    if pc.iceGatheringState == "complete":
        return
    done = asyncio.Event()

    @pc.on("icegatheringstatechange")
    def on_state() -> None:
        log.info("ICE gathering state: %s", pc.iceGatheringState)
        if pc.iceGatheringState == "complete":
            done.set()

    try:
        await asyncio.wait_for(done.wait(), timeout=timeout)
    except asyncio.TimeoutError:
        log.warning("ICE gathering timeout — continuing with current candidates")


async def run_bridge(
    web_origin: str,
    room_id: str | None,
    fps: int,
) -> None:
    api_key, project_id, origin = load_config()
    if web_origin:
        origin = web_origin.rstrip("/")
    room = room_id or generate_room_code(6)
    lan_ips = local_ipv4_addresses()

    fs = FirestoreRest(api_key, project_id)
    print_pairing(origin, room, lan_ips)

    if pyvirtualcam is None:
        print("pyvirtualcam is not installed.", file=sys.stderr)
        sys.exit(1)

    config = RTCConfiguration(
        iceServers=[
            RTCIceServer(urls=["stun:stun.l.google.com:19302"]),
            RTCIceServer(urls=["stun:stun1.l.google.com:19302"]),
        ]
    )

    async with aiohttp.ClientSession() as session:
        await fs.set_room(
            session,
            room,
            {
                "createdAt": int(time.time() * 1000),
                "status": "waiting",
                "offer": None,
                "answer": None,
                "desktopLanIps": lan_ips,
            },
        )
        log.info("Room %s created; desktopLanIps=%s", room, lan_ips)

        room_doc = await fs.poll_until(
            session, room, lambda r: bool(r.get("offer")), timeout_s=600
        )
        offer = room_doc["offer"]
        log.info(
            "Offer received type=%s sdp_bytes=%s",
            offer.get("type"),
            len(offer.get("sdp") or ""),
        )
        if offer.get("sdp"):
            for line in offer["sdp"].splitlines()[:15]:
                log.info("OFFER %s", line)

        pc = RTCPeerConnection(configuration=config)
        cam_holder: dict[str, pyvirtualcam.Camera | None] = {"cam": None}
        stop = asyncio.Event()
        seen_phone_candidates: set[str] = set()

        @pc.on("track")
        def on_track(track):  # type: ignore[no-untyped-def]
            log.info("Track received: kind=%s id=%s", track.kind, track.id)
            if track.kind != "video":
                return

            async def pump() -> None:
                try:
                    while True:
                        frame = await track.recv()
                        img = frame.to_ndarray(format="rgb24")
                        if img.dtype != np.uint8:
                            img = img.astype(np.uint8)
                        h, w = img.shape[:2]
                        if cam_holder["cam"] is None:
                            cam_holder["cam"] = pyvirtualcam.Camera(
                                width=w,
                                height=h,
                                fps=fps,
                                print_fps=True,
                            )
                            log.info(
                                "Virtual camera open: %sx%s @ %sfps device=%s",
                                w,
                                h,
                                fps,
                                cam_holder["cam"].device,
                            )
                        cam = cam_holder["cam"]
                        assert cam is not None
                        if (w, h) != (cam.width, cam.height):
                            resized = np.zeros(
                                (cam.height, cam.width, 3), dtype=np.uint8
                            )
                            hh = min(h, cam.height)
                            ww = min(w, cam.width)
                            resized[:hh, :ww] = img[:hh, :ww]
                            img = resized
                        cam.send(img)
                        cam.sleep_until_next_frame()
                except Exception as exc:  # noqa: BLE001
                    log.error("Video pump stopped: %s", exc)
                    stop.set()

            asyncio.ensure_future(pump())

        @pc.on("connectionstatechange")
        async def on_state() -> None:
            log.info("Peer connectionState=%s", pc.connectionState)
            if pc.connectionState in {"failed", "closed"}:
                stop.set()
            if pc.connectionState == "connected":
                await fs.update_room(
                    session, room, {"status": "connected"}, ["status"]
                )

        @pc.on("iceconnectionstatechange")
        async def on_ice_state() -> None:
            log.info("ICE connectionState=%s", pc.iceConnectionState)

        @pc.on("icegatheringstatechange")
        async def on_gather() -> None:
            log.info("ICE gatheringState=%s", pc.iceGatheringState)

        await pc.setRemoteDescription(
            RTCSessionDescription(sdp=offer["sdp"], type=offer["type"])
        )
        log.info("Remote offer applied; creating answer…")
        answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        await wait_ice_complete(pc, timeout=4.0)

        local = pc.localDescription
        assert local is not None
        log.info("Answer SDP bytes=%s", len(local.sdp or ""))
        for line in (local.sdp or "").splitlines()[:15]:
            log.info("ANSWER %s", line)

        await fs.update_room(
            session,
            room,
            {
                "answer": {"type": local.type, "sdp": local.sdp},
                "status": "connecting",
                "desktopLanIps": lan_ips,
            },
            ["answer", "status", "desktopLanIps"],
        )
        log.info("Answer written to Firestore")

        async def ice_loop() -> None:
            while not stop.is_set():
                try:
                    candidates = await fs.list_candidates(session, room, "phone")
                    for doc_id, data in candidates:
                        if doc_id in seen_phone_candidates:
                            continue
                        seen_phone_candidates.add(doc_id)
                        log.info("Phone ICE doc %s: %s", doc_id, data)
                        ice = parse_ice_candidate(data)
                        if ice is None:
                            continue
                        try:
                            await pc.addIceCandidate(ice)
                            log.info("Added phone ICE candidate")
                        except Exception as exc:  # noqa: BLE001
                            log.warning("addIceCandidate failed: %s", exc)
                except Exception as exc:  # noqa: BLE001
                    log.warning("ICE poll error: %s", exc)
                await asyncio.sleep(0.5)

        # Publish desktop candidates gathered into local SDP is enough for
        # non-trickle; also try event-based trickle when available.
        @pc.on("icecandidate")
        async def on_ice(candidate):  # type: ignore[no-untyped-def]
            if candidate is None:
                log.info("Desktop ICE null candidate (gathering done)")
                return
            payload = {
                "candidate": getattr(candidate, "candidate", None)
                or getattr(candidate, "sdp", None)
                or str(candidate),
                "sdpMid": getattr(candidate, "sdpMid", None),
                "sdpMLineIndex": getattr(candidate, "sdpMLineIndex", None),
            }
            log.info("Publishing desktop ICE: %s", payload)
            try:
                await fs.add_candidate(session, room, "desktop", payload)
            except Exception as exc:  # noqa: BLE001
                log.warning("Failed to publish desktop ICE: %s", exc)

        ice_task = asyncio.create_task(ice_loop())
        print(
            'Select "OBS Virtual Camera" (or the pyvirtualcam device) in Zoom/Meet.'
        )
        print("Watch this console for [CamLink bridge] ICE / connection logs.\n")

        try:
            await stop.wait()
        except asyncio.CancelledError:
            pass
        finally:
            ice_task.cancel()
            await pc.close()
            if cam_holder["cam"] is not None:
                cam_holder["cam"].close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Cam Link Windows bridge")
    parser.add_argument("--room", help="Use an existing room code")
    parser.add_argument(
        "--web-origin",
        default="",
        help="Public web origin (https://camlink.web.app)",
    )
    parser.add_argument("--fps", type=int, default=30)
    args = parser.parse_args()

    try:
        asyncio.run(
            run_bridge(
                web_origin=args.web_origin,
                room_id=args.room,
                fps=args.fps,
            )
        )
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
