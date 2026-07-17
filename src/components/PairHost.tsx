"use client";

import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { isFirebaseConfigured } from "@/lib/firebase";
import { buildDesktopControlUrl, buildPhoneJoinUrl } from "@/lib/join";
import { generateRoomCode } from "@/lib/rooms";
import { createRoom, watchRoom, type RoomDoc } from "@/lib/signaling";

export function PairHost() {
  const [roomCode, setRoomCode] = useState("");
  const [room, setRoom] = useState<RoomDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configured] = useState(() => isFirebaseConfigured());

  const phoneUrl = useMemo(() => {
    if (typeof window === "undefined" || !roomCode) return "";
    return buildPhoneJoinUrl(window.location.origin, roomCode);
  }, [roomCode]);

  const desktopUrl = useMemo(() => {
    if (typeof window === "undefined" || !roomCode) return "";
    return buildDesktopControlUrl(window.location.origin, roomCode);
  }, [roomCode]);

  useEffect(() => {
    if (!configured) return;

    let unsub: (() => void) | undefined;
    const boot = async () => {
      try {
        const code = generateRoomCode(6);
        await createRoom(code);
        setRoomCode(code);
        unsub = watchRoom(code, setRoom);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create room",
        );
      }
    };
    void boot();
    return () => unsub?.();
  }, [configured]);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10">
      <header className="space-y-1">
        <p className="text-sm font-medium tracking-wide text-teal-700">
          Cam Link
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-stone-900">
          Pair your iPhone
        </h1>
        <p className="text-stone-600">
          Prefer the Windows bridge for Zoom/Meet. Phone and PC must be on the
          same Wi‑Fi or USB hotspot. Video stays on your LAN.
        </p>
      </header>

      <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950">
        <p className="font-medium">Local network required</p>
        <p className="mt-1 text-teal-900/80">
          Firebase only exchanges the room handshake. Camera video is
          peer-to-peer on your local network, not streamed to the internet.
        </p>
      </div>

      {!configured ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Firebase env vars are missing. Copy{" "}
          <code className="font-mono">.env.example</code> to{" "}
          <code className="font-mono">.env.local</code> and add your web app
          config.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {roomCode ? (
        <div className="flex flex-col items-center gap-5 rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
          <p className="font-mono text-4xl tracking-[0.35em] text-stone-900">
            {roomCode}
          </p>
          {phoneUrl ? (
            <div className="rounded-xl bg-white p-3">
              <QRCodeSVG value={phoneUrl} size={200} />
            </div>
          ) : null}
          <p className="text-center text-sm text-stone-600">
            Scan with the iPhone Camera app (open in Safari), or open{" "}
            <a
              href={phoneUrl}
              className="font-medium text-teal-700 underline-offset-2 hover:underline"
            >
              /phone#{roomCode}
            </a>
            . Photo / record controls:{" "}
            <a
              href={desktopUrl}
              className="font-medium text-teal-700 underline-offset-2 hover:underline"
            >
              /desktop#{roomCode}
            </a>
            .
          </p>
          <p className="text-sm text-stone-500">
            Room status:{" "}
            <span className="font-medium text-stone-800">
              {room?.status ?? "waiting"}
            </span>
          </p>
        </div>
      ) : (
        <p className="text-sm text-stone-500">Creating room…</p>
      )}

      <div className="rounded-2xl border border-stone-200 bg-stone-50 px-5 py-4 text-sm text-stone-700">
        <p className="font-medium text-stone-900">For Zoom / Google Meet</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Install OBS Studio (Virtual Camera).</li>
          <li>
            Run <code className="font-mono">python bridge/main.py</code> on
            Windows.
          </li>
          <li>Scan the QR printed by the bridge (or use this page).</li>
          <li>Select &quot;OBS Virtual Camera&quot; in your meeting app.</li>
        </ol>
      </div>
    </div>
  );
}
