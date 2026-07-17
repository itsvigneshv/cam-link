"use client";

import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { isFirebaseConfigured } from "@/lib/firebase";
import { buildPhoneJoinUrl, readRoomFromLocation } from "@/lib/join";
import { log } from "@/lib/log";
import { normalizeRoomCode } from "@/lib/rooms";
import { sendCaptureCommand } from "@/lib/commands";
import { getRoom, watchRoom, type RoomDoc } from "@/lib/signaling";

export function DesktopControls() {
  const [roomCode, setRoomCode] = useState("");
  const [room, setRoom] = useState<RoomDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [configured] = useState(() => isFirebaseConfigured());

  useEffect(() => {
    const code = readRoomFromLocation(
      new URLSearchParams(window.location.search),
      window.location.hash,
    );
    if (code) {
      setRoomCode(code);
      setJoined(true);
    }
  }, []);

  useEffect(() => {
    if (!joined || !roomCode || !configured) return;
    const id = normalizeRoomCode(roomCode);
    log.info("desktop controls watching room", id);
    return watchRoom(id, setRoom);
  }, [joined, roomCode, configured]);

  const phoneUrl = useMemo(() => {
    if (typeof window === "undefined" || !roomCode) return "";
    return buildPhoneJoinUrl(window.location.origin, roomCode);
  }, [roomCode]);

  const recording = room?.phoneCaptureState === "recording";
  const live = room?.status === "connected" || room?.status === "connecting";

  const join = async () => {
    setError(null);
    const id = normalizeRoomCode(roomCode);
    if (id.length < 4) {
      setError("Enter the room code from the Windows bridge.");
      return;
    }
    const existing = await getRoom(id);
    if (!existing) {
      setError("Room not found. Start the bridge first, then join here.");
      return;
    }
    window.location.hash = id;
    setJoined(true);
  };

  const run = async (type: "take_photo" | "record_start" | "record_stop") => {
    setError(null);
    setBusy(type);
    try {
      await sendCaptureCommand(normalizeRoomCode(roomCode), type);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Command failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10">
      <header className="space-y-1">
        <p className="text-sm font-medium tracking-wide text-teal-700">
          Cam Link
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-stone-900">
          Desktop controls
        </h1>
        <p className="text-stone-600">
          Capture photo or record video. Files are saved on the iPhone (Safari
          download / Files), not on this PC.
        </p>
      </header>

      {!configured ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Firebase config missing. Rebuild with env vars from `.env.example`.
        </p>
      ) : null}

      {!joined ? (
        <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-6">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-stone-700">Room code</span>
            <input
              value={roomCode}
              onChange={(e) => setRoomCode(normalizeRoomCode(e.target.value))}
              placeholder="ABC123"
              maxLength={8}
              className="w-full rounded-xl border border-stone-300 px-4 py-3 font-mono text-lg tracking-[0.2em] outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
            />
          </label>
          <button
            type="button"
            onClick={() => void join()}
            className="w-full rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Open controls
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-stone-200 bg-white p-6">
            <p className="font-mono text-4xl tracking-[0.35em] text-stone-900">
              {normalizeRoomCode(roomCode)}
            </p>
            {phoneUrl ? (
              <div className="rounded-xl bg-white p-2">
                <QRCodeSVG value={phoneUrl} size={160} />
              </div>
            ) : null}
            <p className="text-center text-sm text-stone-600">
              Room status:{" "}
              <span className="font-medium text-stone-900">
                {room?.status ?? "…"}
              </span>
              {" · "}
              Phone capture:{" "}
              <span className="font-medium text-stone-900">
                {room?.phoneCaptureState ?? "idle"}
              </span>
            </p>
            {room?.phoneCaptureMessage ? (
              <p className="text-center text-sm text-stone-500">
                {room.phoneCaptureMessage}
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              disabled={Boolean(busy) || !live}
              onClick={() => void run("take_photo")}
              className="rounded-xl bg-stone-900 px-4 py-4 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-40"
            >
              {busy === "take_photo" ? "Sending…" : "Capture photo"}
            </button>
            <button
              type="button"
              disabled={Boolean(busy) || !live || recording}
              onClick={() => void run("record_start")}
              className="rounded-xl bg-teal-700 px-4 py-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-40"
            >
              {busy === "record_start" ? "Sending…" : "Start recording"}
            </button>
            <button
              type="button"
              disabled={Boolean(busy) || !recording}
              onClick={() => void run("record_stop")}
              className="rounded-xl border border-red-300 bg-red-50 px-4 py-4 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:opacity-40"
            >
              {busy === "record_stop" ? "Sending…" : "Stop & save"}
            </button>
          </div>

          <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
            <p className="font-medium text-stone-900">Where files go</p>
            <p className="mt-1">
              Photos and videos are written on the <strong>iPhone</strong> via
              Safari (Downloads / Files). Keep the phone tab open while
              recording.
            </p>
            {!live ? (
              <p className="mt-2 text-amber-800">
                Waiting for the phone to connect before controls unlock.
              </p>
            ) : null}
          </div>
        </>
      )}

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}
