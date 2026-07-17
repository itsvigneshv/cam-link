import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-10 px-6 py-16">
      <div className="space-y-4">
        <p className="text-sm font-semibold tracking-[0.2em] uppercase text-teal-800">
          Cam Link
        </p>
        <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">
          Your iPhone camera, as a Windows webcam
        </h1>
        <p className="max-w-lg text-lg text-stone-600">
          No App Store install. Open Safari on the phone, pair with a short
          room code, and use OBS Virtual Camera in Zoom or Google Meet.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/pair"
          className="rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800"
        >
          Create pair room
        </Link>
        <Link
          href="/phone"
          className="rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-900 hover:bg-stone-50"
        >
          Open phone camera
        </Link>
      </div>

      <ul className="grid gap-3 text-sm text-stone-700 sm:grid-cols-3">
        <li className="rounded-2xl border border-stone-200/80 bg-white/70 px-4 py-3">
          <p className="font-medium text-stone-900">Safari only</p>
          <p className="mt-1 text-stone-600">Open the camera in the browser. No install.</p>
        </li>
        <li className="rounded-2xl border border-stone-200/80 bg-white/70 px-4 py-3">
          <p className="font-medium text-stone-900">Private stream</p>
          <p className="mt-1 text-stone-600">Video stays on your network, phone to PC.</p>
        </li>
        <li className="rounded-2xl border border-stone-200/80 bg-white/70 px-4 py-3">
          <p className="font-medium text-stone-900">Meeting ready</p>
          <p className="mt-1 text-stone-600">Appears as OBS Virtual Camera in Zoom or Meet.</p>
        </li>
      </ul>
    </main>
  );
}
