"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { NetworkGate } from "@/components/NetworkGate";
import {
  capturePhotoFromVideo,
  createPhoneRecorder,
  extensionForMime,
  saveBlobToDevice,
} from "@/lib/capture";
import {
  setPhoneCaptureStatus,
  watchCaptureCommands,
  type CaptureCommand,
} from "@/lib/commands";
import { isFirebaseConfigured } from "@/lib/firebase";
import { readRoomFromLocation } from "@/lib/join";
import type { LanCheckResult } from "@/lib/lanCheck";
import { log } from "@/lib/log";
import { normalizeRoomCode } from "@/lib/rooms";
import {
  addIceCandidate,
  getRoom,
  setOffer,
  setRoomStatus,
  watchIceCandidates,
  watchRoom,
} from "@/lib/signaling";
import {
  DEFAULT_RTC_CONFIG,
  attachRtcDiagnostics,
  getCameraStream,
  logSelectedCandidatePair,
  waitForIceGatheringComplete,
} from "@/lib/webrtc";

type Status =
  | "idle"
  | "requesting-camera"
  | "connecting"
  | "live"
  | "error";

export function PhoneSender() {
  const searchParams = useSearchParams();
  const [roomCode, setRoomCode] = useState("");
  const [facingMode, setFacingMode] = useState<"user" | "environment">(
    "user",
  );
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [configured] = useState(() => isFirebaseConfigured());
  const [needsTap, setNeedsTap] = useState(false);
  const [lanReady, setLanReady] = useState(false);
  const [lanDetail, setLanDetail] = useState<string | null>(null);
  const [desktopLanIps, setDesktopLanIps] = useState<string[]>([]);
  const [recording, setRecording] = useState(false);
  const [captureNote, setCaptureNote] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const unsubscribersRef = useRef<Array<() => void>>([]);
  const answerAppliedRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordMimeRef = useRef("video/mp4");
  const handledCommandsRef = useRef<Set<string>>(new Set());
  const activeRoomRef = useRef("");

  const cleanup = useCallback(() => {
    log.info("cleanup peer/camera");
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    recorderRef.current = null;
    recordChunksRef.current = [];
    setRecording(false);
    unsubscribersRef.current.forEach((u) => u());
    unsubscribersRef.current = [];
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    answerAppliedRef.current = false;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  useEffect(() => {
    const code = readRoomFromLocation(
      searchParams,
      typeof window !== "undefined" ? window.location.hash : "",
    );
    log.info("phone page boot", {
      code,
      href: typeof window !== "undefined" ? window.location.href : "",
      configured,
    });
    if (code) {
      setRoomCode(code);
      setNeedsTap(true);
    }

    const onHash = () => {
      const fromHash = readRoomFromLocation(
        new URLSearchParams(),
        window.location.hash,
      );
      if (fromHash) {
        log.info("hashchange room", fromHash);
        setRoomCode(fromHash);
        setNeedsTap(true);
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [searchParams, configured]);

  const onLanReady = useCallback((result: LanCheckResult) => {
    setLanReady(true);
    setLanDetail(result.detail);
    log.info("LAN gate passed", result);
  }, []);

  const takePhoto = useCallback(async () => {
    const roomId = activeRoomRef.current;
    const video = videoRef.current;
    if (!video || !roomId) {
      throw new Error("Camera is not live yet");
    }
    await setPhoneCaptureStatus(roomId, "saving", "Saving photo on iPhone…");
    await capturePhotoFromVideo(video);
    setCaptureNote("Photo saved on this iPhone (Downloads / Files).");
    await setPhoneCaptureStatus(
      roomId,
      "idle",
      "Photo saved on iPhone",
    );
  }, []);

  const startRecording = useCallback(async () => {
    const roomId = activeRoomRef.current;
    const stream = streamRef.current;
    if (!stream || !roomId) throw new Error("Camera is not live yet");
    if (recorderRef.current && recorderRef.current.state === "recording") {
      return;
    }
    const { recorder, mimeType } = createPhoneRecorder(stream);
    recordMimeRef.current = mimeType;
    recordChunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordChunksRef.current.push(event.data);
    };
    recorder.onerror = (event) => {
      log.error("MediaRecorder error", event);
    };
    recorder.start(1000);
    recorderRef.current = recorder;
    setRecording(true);
    setCaptureNote("Recording on iPhone…");
    await setPhoneCaptureStatus(roomId, "recording", "Recording on iPhone…");
  }, []);

  const stopRecording = useCallback(async () => {
    const roomId = activeRoomRef.current;
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      throw new Error("Not recording");
    }
    await setPhoneCaptureStatus(roomId, "saving", "Saving video on iPhone…");

    const blob = await new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        const type = recordMimeRef.current || "video/mp4";
        resolve(new Blob(recordChunksRef.current, { type }));
      };
      recorder.onerror = () => reject(new Error("Recording failed"));
      recorder.stop();
    });

    recorderRef.current = null;
    recordChunksRef.current = [];
    setRecording(false);

    const ext = extensionForMime(blob.type || recordMimeRef.current);
    saveBlobToDevice(blob, `camlink-${Date.now()}.${ext}`);
    setCaptureNote("Video saved on this iPhone (Downloads / Files).");
    await setPhoneCaptureStatus(roomId, "idle", "Video saved on iPhone");
  }, []);

  const handleCommand = useCallback(
    async (command: CaptureCommand) => {
      if (command.id && handledCommandsRef.current.has(command.id)) return;
      if (command.id) handledCommandsRef.current.add(command.id);
      log.info("capture command", command);
      try {
        if (command.type === "take_photo") await takePhoto();
        if (command.type === "record_start") await startRecording();
        if (command.type === "record_stop") await stopRecording();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Capture command failed";
        log.error("capture command failed", err);
        setCaptureNote(message);
        const roomId = activeRoomRef.current;
        if (roomId) {
          void setPhoneCaptureStatus(roomId, "error", message);
        }
      }
    },
    [startRecording, stopRecording, takePhoto],
  );

  const applyAnswer = async (
    pc: RTCPeerConnection,
    answer: RTCSessionDescriptionInit,
  ) => {
    if (answerAppliedRef.current || pc.currentRemoteDescription) {
      log.debug("answer already applied — skip");
      return;
    }
    log.rtc("applying remote answer", {
      type: answer.type,
      sdpBytes: answer.sdp?.length ?? 0,
    });
    try {
      await pc.setRemoteDescription(answer);
      answerAppliedRef.current = true;
      log.rtc("remote answer applied", {
        signalingState: pc.signalingState,
        iceConnectionState: pc.iceConnectionState,
      });
    } catch (err) {
      log.error("setRemoteDescription(answer) failed", err);
      throw err;
    }
  };

  const start = async (nextFacing: "user" | "environment" = facingMode) => {
    setError(null);
    setNeedsTap(false);
    setCaptureNote(null);
    const roomId = normalizeRoomCode(roomCode);
    const facing = nextFacing;
    activeRoomRef.current = roomId;
    log.info("start() called", { roomId, facing, lanReady });

    if (!configured) {
      setError("Firebase is not configured.");
      setStatus("error");
      return;
    }
    if (roomId.length < 4) {
      setError("Enter the room code from your desktop bridge.");
      setStatus("error");
      return;
    }
    if (!lanReady) {
      setError("Wait for the local network check to finish.");
      setStatus("error");
      return;
    }

    cleanup();
    activeRoomRef.current = roomId;
    setStatus("requesting-camera");

    try {
      const room = await getRoom(roomId);
      if (!room) {
        throw new Error(
          "Room not found. Start the desktop bridge first, then scan again.",
        );
      }
      if (room.desktopLanIps?.length) {
        setDesktopLanIps(room.desktopLanIps);
        log.info("desktop LAN IPs from room", room.desktopLanIps);
      }

      const stream = await getCameraStream({
        facingMode: facing,
        width: 1280,
        height: 720,
        frameRate: 30,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch((err) => {
          log.warn("video.play() rejected", err);
        });
      }

      setStatus("connecting");
      const pc = new RTCPeerConnection(DEFAULT_RTC_CONFIG);
      pcRef.current = pc;
      unsubscribersRef.current.push(attachRtcDiagnostics(pc, "phone"));

      stream.getTracks().forEach((track) => {
        log.rtc("addTrack", { kind: track.kind, id: track.id });
        pc.addTrack(track, stream);
      });

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        void addIceCandidate(roomId, "phone", event.candidate.toJSON()).catch(
          (err) => log.error("failed to publish phone ICE", err),
        );
      };

      pc.onconnectionstatechange = () => {
        log.rtc("connectionState →", pc.connectionState);
        if (pc.connectionState === "connected") {
          setStatus("live");
          void setRoomStatus(roomId, "connected");
          void setPhoneCaptureStatus(roomId, "idle", "Ready for capture");
          void logSelectedCandidatePair(pc);
        }
        if (pc.connectionState === "failed") {
          void logSelectedCandidatePair(pc);
          setError(
            "Local peer connection failed. Phone and PC must share Wi‑Fi (no guest/AP isolation/VPN). See console logs for ICE details.",
          );
          setStatus("error");
        }
      };

      unsubscribersRef.current.push(
        watchIceCandidates(roomId, "desktop", async (candidate) => {
          try {
            await pc.addIceCandidate(candidate);
            log.ice("added desktop candidate ok");
          } catch (err) {
            log.warn("addIceCandidate(desktop) failed", err);
          }
        }),
      );

      unsubscribersRef.current.push(
        watchRoom(roomId, async (updated) => {
          if (updated?.desktopLanIps?.length) {
            setDesktopLanIps(updated.desktopLanIps);
          }
          if (!updated?.answer) return;
          try {
            await applyAnswer(pc, updated.answer);
          } catch (err) {
            setError(
              err instanceof Error
                ? err.message
                : "Failed to apply desktop answer",
            );
            setStatus("error");
          }
        }),
      );

      unsubscribersRef.current.push(
        watchCaptureCommands(roomId, (command) => {
          void handleCommand(command);
        }),
      );

      const poll = window.setInterval(() => {
        void (async () => {
          if (answerAppliedRef.current) {
            window.clearInterval(poll);
            return;
          }
          const latest = await getRoom(roomId);
          if (latest?.answer) {
            log.info("answer found via poll backup");
            try {
              await applyAnswer(pc, latest.answer);
            } catch (err) {
              log.error("poll applyAnswer failed", err);
            }
          }
        })();
      }, 800);
      unsubscribersRef.current.push(() => window.clearInterval(poll));

      const offer = await pc.createOffer({ offerToReceiveVideo: false });
      await pc.setLocalDescription(offer);
      const gatherResult = await waitForIceGatheringComplete(pc, 4000);
      log.ice("offer gather result", gatherResult);
      const local = pc.localDescription;
      if (!local?.sdp) throw new Error("Missing local offer SDP");
      await setOffer(roomId, { type: local.type, sdp: local.sdp });

      window.setTimeout(() => {
        if (
          pcRef.current === pc &&
          pc.connectionState !== "connected" &&
          pc.connectionState !== "closed"
        ) {
          log.error("connection watchdog fired", {
            connectionState: pc.connectionState,
            iceConnectionState: pc.iceConnectionState,
            signalingState: pc.signalingState,
            answerApplied: answerAppliedRef.current,
          });
          void logSelectedCandidatePair(pc);
          setError(
            "Still connecting after 20s. Confirm same Wi‑Fi as the PC, disable VPN, and check the browser console ([CamLink] logs).",
          );
          setStatus("error");
        }
      }, 20000);
    } catch (err) {
      cleanup();
      log.error("start() failed", err);
      const message =
        err instanceof Error ? err.message : "Failed to start camera stream";
      if (
        message.toLowerCase().includes("notallowed") ||
        message.toLowerCase().includes("permission") ||
        message.toLowerCase().includes("denied")
      ) {
        setNeedsTap(true);
        setError("Tap “Start camera” and allow access when Safari asks.");
      } else {
        setError(message);
      }
      setStatus("error");
    }
  };

  const flipCamera = () => {
    const next = facingMode === "user" ? "environment" : "user";
    setFacingMode(next);
    if (status === "live" || status === "connecting" || status === "error") {
      void start(next);
    }
  };

  if (!lanReady) {
    return <NetworkGate onReady={onLanReady} />;
  }

  return (
    <div className="relative mx-auto flex w-full max-w-lg flex-col gap-5 px-4 py-8">
      {needsTap && status !== "live" && status !== "connecting" ? (
        <button
          type="button"
          onClick={() => void start()}
          className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-stone-950/90 px-6 text-center"
        >
          <p className="text-sm font-medium tracking-wide text-teal-300">
            Cam Link
          </p>
          <p className="font-mono text-3xl tracking-[0.3em] text-white">
            {roomCode}
          </p>
          <p className="max-w-xs text-lg font-semibold text-white">
            Tap anywhere to start the camera
          </p>
          <p className="max-w-xs text-sm text-stone-300">
            Local network check passed. Video will stay on your LAN.
          </p>
        </button>
      ) : null}

      <header className="space-y-1">
        <p className="text-sm font-medium tracking-wide text-teal-700">
          Cam Link
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
          Use this phone as a webcam
        </h1>
        <p className="text-sm text-stone-600">
          Desktop can trigger photo / video capture. Files save on this iPhone.
        </p>
      </header>

      <div className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-950">
        <p className="font-medium">Local link mode</p>
        <p className="mt-0.5 text-teal-900/80">
          {lanDetail ??
            "Video is not uploaded to the internet. Only room signaling uses Firebase."}
        </p>
        {desktopLanIps.length ? (
          <p className="mt-1 font-mono text-xs text-teal-900/70">
            Desktop LAN: {desktopLanIps.join(", ")}
          </p>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl bg-stone-900 shadow-lg shadow-stone-900/10">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="aspect-[3/4] w-full object-cover"
        />
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-stone-700">Room code</span>
        <input
          value={roomCode}
          onChange={(e) => setRoomCode(normalizeRoomCode(e.target.value))}
          placeholder="ABC123"
          maxLength={8}
          className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 font-mono text-lg tracking-[0.2em] text-stone-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
          autoCapitalize="characters"
          autoCorrect="off"
        />
      </label>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => void start()}
          disabled={status === "requesting-camera" || status === "connecting"}
          className="flex-1 rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-50"
        >
          {status === "live"
            ? "Reconnect"
            : status === "requesting-camera" || status === "connecting"
              ? "Connecting…"
              : "Start camera"}
        </button>
        <button
          type="button"
          onClick={flipCamera}
          className="rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-medium text-stone-800 hover:bg-stone-50"
        >
          Flip
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          disabled={status !== "live"}
          onClick={() => void takePhoto().catch((e) => setCaptureNote(String(e)))}
          className="rounded-xl border border-stone-300 bg-white px-2 py-3 text-xs font-semibold text-stone-800 disabled:opacity-40"
        >
          Photo
        </button>
        <button
          type="button"
          disabled={status !== "live" || recording}
          onClick={() =>
            void startRecording().catch((e) => setCaptureNote(String(e)))
          }
          className="rounded-xl border border-stone-300 bg-white px-2 py-3 text-xs font-semibold text-stone-800 disabled:opacity-40"
        >
          Rec
        </button>
        <button
          type="button"
          disabled={!recording}
          onClick={() =>
            void stopRecording().catch((e) => setCaptureNote(String(e)))
          }
          className="rounded-xl border border-red-200 bg-red-50 px-2 py-3 text-xs font-semibold text-red-800 disabled:opacity-40"
        >
          Stop
        </button>
      </div>

      <p className="text-sm text-stone-600">
        Status:{" "}
        <span className="font-medium text-stone-900">
          {status === "idle" && "Ready"}
          {status === "requesting-camera" && "Requesting camera…"}
          {status === "connecting" && "Connecting to desktop on LAN…"}
          {status === "live" &&
            (recording
              ? "Live · recording on this iPhone"
              : "Live on local network. Keep this tab open.")}
          {status === "error" && "Error"}
        </span>
      </p>
      {captureNote ? (
        <p className="text-sm text-teal-800">{captureNote}</p>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}
