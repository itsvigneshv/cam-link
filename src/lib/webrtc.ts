import { log } from "./log";

/** STUN helps form server-reflexive candidates; media still prefers direct LAN. */
export const DEFAULT_RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
  iceCandidatePoolSize: 4,
};

export async function getCameraStream(options: {
  facingMode: "user" | "environment";
  width: number;
  height: number;
  frameRate: number;
}): Promise<MediaStream> {
  log.info("getUserMedia request", options);
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: options.facingMode },
      width: { ideal: options.width },
      height: { ideal: options.height },
      frameRate: { ideal: options.frameRate },
    },
  });
  log.info(
    "getUserMedia ok",
    stream.getVideoTracks().map((t) => ({
      id: t.id,
      label: t.label,
      settings: t.getSettings(),
    })),
  );
  return stream;
}

export async function waitForIceGatheringComplete(
  pc: RTCPeerConnection,
  timeoutMs = 4000,
): Promise<"complete" | "timeout"> {
  if (pc.iceGatheringState === "complete") return "complete";

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      pc.removeEventListener("icegatheringstatechange", check);
      log.warn("ICE gathering timed out; sending SDP with candidates so far", {
        state: pc.iceGatheringState,
      });
      resolve("timeout");
    }, timeoutMs);

    const check = () => {
      log.ice("gathering state", pc.iceGatheringState);
      if (pc.iceGatheringState === "complete") {
        window.clearTimeout(timer);
        pc.removeEventListener("icegatheringstatechange", check);
        resolve("complete");
      }
    };
    pc.addEventListener("icegatheringstatechange", check);
  });
}

export function attachRtcDiagnostics(
  pc: RTCPeerConnection,
  label: string,
): () => void {
  const onConn = () => log.rtc(`${label} connectionState`, pc.connectionState);
  const onIce = () =>
    log.ice(`${label} iceConnectionState`, pc.iceConnectionState);
  const onSig = () => log.rtc(`${label} signalingState`, pc.signalingState);
  const onGather = () =>
    log.ice(`${label} iceGatheringState`, pc.iceGatheringState);
  const onCand = (event: RTCPeerConnectionIceEvent) => {
    if (!event.candidate) {
      log.ice(`${label} candidate gathering finished (null candidate)`);
      return;
    }
    log.ice(`${label} candidate`, {
      candidate: event.candidate.candidate,
      sdpMid: event.candidate.sdpMid,
      sdpMLineIndex: event.candidate.sdpMLineIndex,
      type: event.candidate.type,
      protocol: event.candidate.protocol,
      address: event.candidate.address,
    });
  };

  pc.addEventListener("connectionstatechange", onConn);
  pc.addEventListener("iceconnectionstatechange", onIce);
  pc.addEventListener("signalingstatechange", onSig);
  pc.addEventListener("icegatheringstatechange", onGather);
  pc.addEventListener("icecandidate", onCand);

  return () => {
    pc.removeEventListener("connectionstatechange", onConn);
    pc.removeEventListener("iceconnectionstatechange", onIce);
    pc.removeEventListener("signalingstatechange", onSig);
    pc.removeEventListener("icegatheringstatechange", onGather);
    pc.removeEventListener("icecandidate", onCand);
  };
}

export async function logSelectedCandidatePair(pc: RTCPeerConnection) {
  try {
    const stats = await pc.getStats();
    stats.forEach((report) => {
      if (report.type === "candidate-pair" && report.selected) {
        log.ice("selected candidate pair", report);
      }
      if (report.type === "transport" && "selectedCandidatePairId" in report) {
        log.ice("transport", {
          selectedCandidatePairId: report.selectedCandidatePairId,
          dtlsState: (report as { dtlsState?: string }).dtlsState,
        });
      }
    });
  } catch (err) {
    log.warn("getStats failed", err);
  }
}
