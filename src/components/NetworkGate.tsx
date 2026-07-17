"use client";

import { useEffect, useState } from "react";
import {
  checkLocalNetwork,
  type LanCheckResult,
  type LanCheckStep,
} from "@/lib/lanCheck";

const STEP_LABELS: Record<LanCheckStep, string> = {
  idle: "Starting…",
  online: "Internet reachability (for signaling only)…",
  gathering: "Checking local Wi‑Fi / LAN addresses…",
  "lan-ready": "Local network ready",
  "lan-weak": "Local network uncertain; same Wi‑Fi still required",
  offline: "Device is offline",
  error: "Network check failed",
};

export function NetworkGate({
  onReady,
}: {
  onReady: (result: LanCheckResult) => void;
}) {
  const [step, setStep] = useState<LanCheckStep>("idle");
  const [detail, setDetail] = useState("Preparing local network check…");
  const [result, setResult] = useState<LanCheckResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const check = await checkLocalNetwork((next, message) => {
        if (cancelled) return;
        setStep(next);
        setDetail(message);
      });
      if (cancelled) return;
      setResult(check);
      if (check.ok) {
        window.setTimeout(() => onReady(check), 650);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onReady]);

  const progress =
    step === "idle"
      ? 10
      : step === "online"
        ? 35
        : step === "gathering"
          ? 70
          : step === "lan-ready" || step === "lan-weak"
            ? 100
            : 40;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#f3f1ec] px-6">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <p className="text-xs font-semibold tracking-[0.22em] uppercase text-teal-800">
            Cam Link
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
            Checking local network
          </h1>
          <p className="text-sm text-stone-600">
            Video goes phone → PC on your Wi‑Fi or USB hotspot. It is not
            broadcast to the public internet.
          </p>
        </div>

        <div className="overflow-hidden rounded-full bg-stone-200">
          <div
            className="h-2 rounded-full bg-teal-600 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-4">
          <span
            className={`mt-0.5 inline-block h-5 w-5 shrink-0 rounded-full border-2 border-teal-700 border-t-transparent ${
              step === "lan-ready" || step === "lan-weak" || step === "error" || step === "offline"
                ? "animate-none border-teal-700"
                : "animate-spin"
            }`}
            aria-hidden
          />
          <div className="space-y-1">
            <p className="text-sm font-medium text-stone-900">
              {STEP_LABELS[step]}
            </p>
            <p className="text-sm text-stone-600">{detail}</p>
          </div>
        </div>

        <ul className="space-y-2 text-sm text-stone-600">
          <li className="flex gap-2">
            <span className="text-teal-700">1.</span>
            Phone and PC on the same Wi‑Fi (or USB hotspot)
          </li>
          <li className="flex gap-2">
            <span className="text-teal-700">2.</span>
            Avoid guest Wi‑Fi / “AP isolation” / VPN
          </li>
          <li className="flex gap-2">
            <span className="text-teal-700">3.</span>
            Signaling uses Firebase; video stays peer-to-peer on LAN
          </li>
        </ul>

        {result && !result.ok ? (
          <button
            type="button"
            className="w-full rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white"
            onClick={() => window.location.reload()}
          >
            Retry network check
          </button>
        ) : null}
      </div>
    </div>
  );
}
