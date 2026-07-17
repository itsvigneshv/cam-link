import { Suspense } from "react";
import { PhoneSender } from "@/components/PhoneSender";

export default function PhonePage() {
  return (
    <main className="flex-1">
      <Suspense
        fallback={
          <p className="px-4 py-8 text-sm text-stone-600">Loading…</p>
        }
      >
        <PhoneSender />
      </Suspense>
    </main>
  );
}
