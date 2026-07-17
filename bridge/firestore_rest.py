"""Minimal Firestore REST client using the Firebase web API key."""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any, Callable, Optional

import aiohttp


class FirestoreRest:
    def __init__(self, api_key: str, project_id: str) -> None:
        self.api_key = api_key
        self.project_id = project_id
        self._base = (
            f"https://firestore.googleapis.com/v1/projects/{project_id}"
            "/databases/(default)/documents"
        )

    def _params(self, extra: Optional[list[tuple[str, str]]] = None) -> list[tuple[str, str]]:
        params: list[tuple[str, str]] = [("key", self.api_key)]
        if extra:
            params.extend(extra)
        return params

    async def set_room(
        self, session: aiohttp.ClientSession, room_id: str, fields: dict[str, Any]
    ) -> None:
        body = {"fields": to_firestore_fields(fields)}
        url = f"{self._base}/rooms/{room_id}"
        async with session.patch(
            url,
            params=self._params([("currentDocument.exists", "false")]),
            json=body,
        ) as resp:
            if resp.status >= 400:
                async with session.patch(
                    url, params=self._params(), json=body
                ) as resp2:
                    if resp2.status >= 400:
                        raise RuntimeError(await resp2.text())

    async def update_room(
        self,
        session: aiohttp.ClientSession,
        room_id: str,
        fields: dict[str, Any],
        field_paths: list[str],
    ) -> None:
        body = {"fields": to_firestore_fields(fields)}
        params = self._params([("updateMask.fieldPaths", p) for p in field_paths])
        url = f"{self._base}/rooms/{room_id}"
        async with session.patch(url, params=params, json=body) as resp:
            if resp.status >= 400:
                raise RuntimeError(await resp.text())

    async def get_room(
        self, session: aiohttp.ClientSession, room_id: str
    ) -> Optional[dict[str, Any]]:
        url = f"{self._base}/rooms/{room_id}"
        async with session.get(url, params=self._params()) as resp:
            if resp.status == 404:
                return None
            data = await resp.json()
            if resp.status >= 400:
                raise RuntimeError(data)
            return from_firestore_fields(data.get("fields", {}))

    async def add_candidate(
        self,
        session: aiohttp.ClientSession,
        room_id: str,
        role: str,
        candidate: dict[str, Any],
    ) -> None:
        url = f"{self._base}/rooms/{room_id}/{role}Candidates"
        body = {"fields": to_firestore_fields(candidate)}
        async with session.post(url, params=self._params(), json=body) as resp:
            if resp.status >= 400:
                raise RuntimeError(await resp.text())

    async def list_candidates(
        self, session: aiohttp.ClientSession, room_id: str, role: str
    ) -> list[tuple[str, dict[str, Any]]]:
        url = f"{self._base}/rooms/{room_id}/{role}Candidates"
        async with session.get(url, params=self._params()) as resp:
            if resp.status == 404:
                return []
            data = await resp.json()
            if resp.status >= 400:
                raise RuntimeError(data)
            out: list[tuple[str, dict[str, Any]]] = []
            for doc in data.get("documents", []):
                name = doc["name"].rsplit("/", 1)[-1]
                out.append((name, from_firestore_fields(doc.get("fields", {}))))
            return out

    async def poll_until(
        self,
        session: aiohttp.ClientSession,
        room_id: str,
        predicate: Callable[[dict[str, Any]], bool],
        timeout_s: float = 300.0,
        interval_s: float = 0.5,
    ) -> dict[str, Any]:
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            room = await self.get_room(session, room_id)
            if room and predicate(room):
                return room
            await asyncio.sleep(interval_s)
        raise TimeoutError(f"Timed out waiting on room {room_id}")


def to_firestore_value(value: Any) -> dict[str, Any]:
    if value is None:
        return {"nullValue": None}
    if isinstance(value, bool):
        return {"booleanValue": value}
    if isinstance(value, int):
        return {"integerValue": str(value)}
    if isinstance(value, float):
        return {"doubleValue": value}
    if isinstance(value, str):
        return {"stringValue": value}
    if isinstance(value, list):
        return {"arrayValue": {"values": [to_firestore_value(v) for v in value]}}
    if isinstance(value, dict):
        return {"mapValue": {"fields": to_firestore_fields(value)}}
    return {"stringValue": json.dumps(value)}


def to_firestore_fields(data: dict[str, Any]) -> dict[str, Any]:
    return {k: to_firestore_value(v) for k, v in data.items()}


def from_firestore_value(value: dict[str, Any]) -> Any:
    if "nullValue" in value:
        return None
    if "booleanValue" in value:
        return value["booleanValue"]
    if "integerValue" in value:
        return int(value["integerValue"])
    if "doubleValue" in value:
        return float(value["doubleValue"])
    if "stringValue" in value:
        return value["stringValue"]
    if "arrayValue" in value:
        return [
            from_firestore_value(v) for v in value["arrayValue"].get("values", [])
        ]
    if "mapValue" in value:
        return from_firestore_fields(value["mapValue"].get("fields", {}))
    return None


def from_firestore_fields(fields: dict[str, Any]) -> dict[str, Any]:
    return {k: from_firestore_value(v) for k, v in fields.items()}
