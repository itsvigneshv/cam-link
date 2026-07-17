import { log } from "./log";

function stamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** Trigger a file download / save sheet on the phone. */
export function saveBlobToDevice(blob: Blob, filename: string) {
  log.info("saveBlobToDevice", { filename, type: blob.type, bytes: blob.size });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 2000);
}

export async function capturePhotoFromVideo(
  video: HTMLVideoElement,
): Promise<void> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) {
    throw new Error("Camera frame not ready yet");
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  ctx.drawImage(video, 0, 0, w, h);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not encode photo"))),
      "image/jpeg",
      0.92,
    );
  });

  saveBlobToDevice(blob, `camlink-${stamp()}.jpg`);
}

function pickRecorderMime(): string | undefined {
  const types = [
    "video/mp4",
    "video/mp4;codecs=avc1",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  if (typeof MediaRecorder === "undefined") return undefined;
  return types.find((t) => MediaRecorder.isTypeSupported(t));
}

export function createPhoneRecorder(stream: MediaStream): {
  recorder: MediaRecorder;
  mimeType: string;
} {
  const mimeType = pickRecorderMime();
  if (!mimeType) {
    throw new Error("This Safari/iOS build cannot record video in the browser");
  }
  log.info("createPhoneRecorder", { mimeType });
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 4_000_000,
  });
  return { recorder, mimeType };
}

export function extensionForMime(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("webm")) return "webm";
  return "video";
}
