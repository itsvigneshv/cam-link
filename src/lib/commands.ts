import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb } from "./firebase";
import { log } from "./log";

export type CaptureCommandType =
  | "take_photo"
  | "record_start"
  | "record_stop";

export interface CaptureCommand {
  id?: string;
  type: CaptureCommandType;
  createdAt: number;
  from: "desktop";
}

export type PhoneCaptureState = "idle" | "recording" | "saving" | "error";

export async function sendCaptureCommand(
  roomId: string,
  type: CaptureCommandType,
): Promise<void> {
  log.info("sendCaptureCommand", { roomId, type });
  await addDoc(collection(getDb(), "rooms", roomId, "commands"), {
    type,
    createdAt: Date.now(),
    from: "desktop",
  } satisfies Omit<CaptureCommand, "id">);
}

export function watchCaptureCommands(
  roomId: string,
  onCommand: (command: CaptureCommand) => void,
): Unsubscribe {
  log.info("watchCaptureCommands", roomId);
  const col = collection(getDb(), "rooms", roomId, "commands");
  return onSnapshot(col, (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type !== "added") return;
      const data = change.doc.data() as Omit<CaptureCommand, "id">;
      onCommand({ ...data, id: change.doc.id });
    });
  });
}

export async function setPhoneCaptureStatus(
  roomId: string,
  phoneCaptureState: PhoneCaptureState,
  phoneCaptureMessage = "",
): Promise<void> {
  log.info("setPhoneCaptureStatus", {
    roomId,
    phoneCaptureState,
    phoneCaptureMessage,
  });
  await updateDoc(doc(getDb(), "rooms", roomId), {
    phoneCaptureState,
    phoneCaptureMessage,
    phoneCaptureUpdatedAt: Date.now(),
  });
}
