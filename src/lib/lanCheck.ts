import { log } from "./log";

export type LanCheckStep =
  | "idle"
  | "online"
  | "gathering"
  | "lan-ready"
  | "lan-weak"
  | "offline"
  | "error";

export interface LanCheckResult {
  ok: boolean;
  step: LanCheckStep;
  online: boolean;
  hostCandidates: string[];
  detail: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Verify the browser can gather local (LAN) ICE host candidates.
 * This does not send video anywhere; it only proves a local network stack is available.
 */
export async function checkLocalNetwork(
  onStep?: (step: LanCheckStep, detail: string) => void,
): Promise<LanCheckResult> {
  const report = (step: LanCheckStep, detail: string) => {
    log.info(`LAN check: ${step}`, detail);
    onStep?.(step, detail);
  };

  if (typeof navigator === "undefined") {
    return {
      ok: false,
      step: "error",
      online: false,
      hostCandidates: [],
      detail: "Not running in a browser",
    };
  }

  if (!navigator.onLine) {
    report("offline", "Device reports offline");
    return {
      ok: false,
      step: "offline",
      online: false,
      hostCandidates: [],
      detail: "Turn on Wi‑Fi or USB Personal Hotspot, then retry.",
    };
  }

  report("online", "Browser reports online; probing local ICE hosts");
  await sleep(400);

  if (!window.RTCPeerConnection) {
    report("error", "WebRTC not supported");
    return {
      ok: false,
      step: "error",
      online: true,
      hostCandidates: [],
      detail: "This browser does not support WebRTC. Use Safari on iPhone.",
    };
  }

  report("gathering", "Gathering local network addresses…");

  const hostCandidates: string[] = [];
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  try {
    pc.createDataChannel("camlink-lan-check");
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await new Promise<void>((resolve) => {
      const done = () => resolve();
      const timer = window.setTimeout(done, 2500);
      pc.onicecandidate = (event) => {
        if (!event.candidate) {
          window.clearTimeout(timer);
          done();
          return;
        }
        const c = event.candidate.candidate;
        log.ice("lan-check candidate", c);
        if (c.includes(" typ host")) {
          hostCandidates.push(c);
        }
      };
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === "complete") {
          window.clearTimeout(timer);
          done();
        }
      };
    });
  } catch (err) {
    log.error("LAN ICE probe failed", err);
    report("error", "ICE probe failed");
    return {
      ok: false,
      step: "error",
      online: true,
      hostCandidates: [],
      detail: err instanceof Error ? err.message : "Local network probe failed",
    };
  } finally {
    pc.close();
  }

  const unique = [...new Set(hostCandidates)];
  if (unique.length === 0) {
    report(
      "lan-weak",
      "No host candidates yet; connection may still work via STUN, but same Wi‑Fi is required",
    );
    return {
      ok: true,
      step: "lan-weak",
      online: true,
      hostCandidates: unique,
      detail:
        "Could not see a clear LAN address. Stay on the same Wi‑Fi as your PC (disable VPN / AP isolation).",
    };
  }

  report("lan-ready", `Found ${unique.length} local candidate(s)`);
  return {
    ok: true,
    step: "lan-ready",
    online: true,
    hostCandidates: unique,
    detail: "Local network looks ready. Video stays on your LAN, not uploaded to the internet.",
  };
}
