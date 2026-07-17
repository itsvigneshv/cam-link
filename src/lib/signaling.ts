import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  addDoc,
  getDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb } from "./firebase";
import { log } from "./log";

export type RoomRole = "phone" | "desktop";

export interface RoomDoc {
  createdAt: number;
  status: "waiting" | "connecting" | "connected" | "ended";
  offer?: RTCSessionDescriptionInit | null;
  answer?: RTCSessionDescriptionInit | null;
  desktopLanIps?: string[];
}

function roomRef(roomId: string) {
  return doc(getDb(), "rooms", roomId);
}

export async function createRoom(roomId: string): Promise<void> {
  log.info("createRoom", roomId);
  await setDoc(roomRef(roomId), {
    createdAt: Date.now(),
    status: "waiting",
    offer: null,
    answer: null,
    desktopLanIps: [],
  } satisfies RoomDoc);
}

export async function getRoom(roomId: string): Promise<RoomDoc | null> {
  const snap = await getDoc(roomRef(roomId));
  if (!snap.exists()) {
    log.warn("getRoom: missing", roomId);
    return null;
  }
  const data = snap.data() as RoomDoc;
  log.debug("getRoom", {
    roomId,
    status: data.status,
    hasOffer: Boolean(data.offer),
    hasAnswer: Boolean(data.answer),
    desktopLanIps: data.desktopLanIps,
  });
  return data;
}

export async function setOffer(
  roomId: string,
  offer: RTCSessionDescriptionInit,
): Promise<void> {
  log.info("setOffer", {
    roomId,
    type: offer.type,
    sdpBytes: offer.sdp?.length ?? 0,
  });
  await updateDoc(roomRef(roomId), {
    offer,
    status: "connecting",
  });
}

export async function setAnswer(
  roomId: string,
  answer: RTCSessionDescriptionInit,
): Promise<void> {
  log.info("setAnswer", {
    roomId,
    type: answer.type,
    sdpBytes: answer.sdp?.length ?? 0,
  });
  await updateDoc(roomRef(roomId), {
    answer,
    status: "connecting",
  });
}

export async function setRoomStatus(
  roomId: string,
  status: RoomDoc["status"],
): Promise<void> {
  log.info("setRoomStatus", { roomId, status });
  await updateDoc(roomRef(roomId), { status });
}

export function watchRoom(
  roomId: string,
  onChange: (room: RoomDoc | null) => void,
): Unsubscribe {
  log.info("watchRoom subscribe", roomId);
  return onSnapshot(
    roomRef(roomId),
    (snap) => {
      const data = snap.exists() ? (snap.data() as RoomDoc) : null;
      log.debug("watchRoom snapshot", {
        roomId,
        exists: snap.exists(),
        status: data?.status,
        hasOffer: Boolean(data?.offer),
        hasAnswer: Boolean(data?.answer),
      });
      onChange(data);
    },
    (err) => {
      log.error("watchRoom error", err);
    },
  );
}

export async function addIceCandidate(
  roomId: string,
  role: RoomRole,
  candidate: RTCIceCandidateInit,
): Promise<void> {
  log.ice(`publish ${role} candidate`, candidate.candidate);
  const col = collection(getDb(), "rooms", roomId, `${role}Candidates`);
  await addDoc(col, {
    candidate: candidate.candidate ?? null,
    sdpMid: candidate.sdpMid ?? null,
    sdpMLineIndex: candidate.sdpMLineIndex ?? null,
    usernameFragment: candidate.usernameFragment ?? null,
  });
}

export function watchIceCandidates(
  roomId: string,
  role: RoomRole,
  onCandidate: (candidate: RTCIceCandidateInit) => void,
): Unsubscribe {
  log.info(`watchIceCandidates ${role}`, roomId);
  const col = collection(getDb(), "rooms", roomId, `${role}Candidates`);
  return onSnapshot(col, (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type !== "added") return;
      const data = change.doc.data() as RTCIceCandidateInit;
      log.ice(`remote ${role} candidate`, data.candidate);
      onCandidate(data);
    });
  });
}
