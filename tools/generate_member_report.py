#!/usr/bin/env python3
"""Generate a current-member beer and join-date report.

The report joins the current WhatsApp member list to the canonical chat log.
It counts only media accepted by the same duplicate/review rules as the site,
records the last accepted beer, and extracts join events from WhatsApp system
messages when the member can be matched by phone or unique name.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import unicodedata
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

HEADER_RE = re.compile(
    r"^\s*(\d{1,2}/\d{1,2}/\d{2,4}),\s*"
    r"(\d{1,2}:\d{2}(?::\d{2})?)\s+-\s+(.*)$"
)
MEDIA_RE = re.compile(
    r"^\s*((?:IMG|VID)-[\w-]+\.(?:jpg|jpeg|png|gif|mp4|3gp|mov))\s+"
    r"\(file attached\)\s*$",
    re.IGNORECASE,
)
REMOVED_MEDIA_RE = re.compile(r"^\s*\[(image|video) removed\]\s*$", re.IGNORECASE)
PHONE_RE = re.compile(r"(?<!\w)\+\s*[0-9][0-9\s().-]{5,}[0-9]")
JOIN_RE = re.compile(r"^(.+?)\s+joined(?: using a group link)?\.?$", re.IGNORECASE)
ADDED_RE = re.compile(r"\s+added\s+", re.IGNORECASE)

EXCLUDED_PHONE_NUMBERS = {"351917944881"}
EXCLUDED_MEDIA_FILENAMES = {
    "img-20260731-wa0601.jpg",
    "img-20260730-wa0687.jpg",
}
STALE_DECISION_IDS = {
    "photo-2222-737",
    "photo-2693-1001",
    "photo-3044-1176",
    "photo-4618-1942",
    "photo-4996-2121",
}
KNOWN_NAME_PHONE_MAPPINGS = {
    "erik juergens": "14406820268",
    "francisco castro": "351938808797",
    "diego armes": "351939351355",
    "diogo amorim silva": "351911932288",
    "bernardo ferro": "351912103090",
    "justin young us phone us phone": "16144990702",
    "miguel araujo": "351932666125",
    "dominguinhos": "351938574212",
    "ricardo almeida": "351916225165",
}
MERGED_NAME_PHONE_MAPPINGS = {
    "joao mendonca volkanov": "351910466263",
    "alex milhao finos": "351963950525",
}


def strip_formatting(value: str) -> str:
    return re.sub(r"[\u200B-\u200D\u2060\uFEFF\u200E\u200F\u202A-\u202E]", "", value)


def normalize_phone(value: str) -> str:
    return re.sub(r"\D", "", str(value or ""))


def normalize_name(value: str) -> str:
    value = unicodedata.normalize("NFKD", strip_formatting(str(value or "")).strip())
    value = "".join(char for char in value if not unicodedata.combining(char))
    value = value.lower().replace("~", " ")
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def parse_timestamp(date_text: str, time_text: str) -> datetime:
    day, month, raw_year = (int(part) for part in date_text.split("/"))
    year = raw_year + 2000 if raw_year < 100 else raw_year
    parts = [int(part) for part in time_text.split(":")]
    parts += [0] * (3 - len(parts))
    return datetime(year, month, day, *parts[:3])


def read_chat(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8-sig").replace("\r\n", "\n").replace("\r", "\n")
    messages: list[dict] = []
    current: dict | None = None
    for line in text.split("\n"):
        line = strip_formatting(line)
        match = HEADER_RE.match(line)
        if match:
            if current is not None:
                messages.append(current)
            date_text, time_text, rest = match.groups()
            sender_match = re.match(r"^([^:]+):\s?(.*)$", rest, re.DOTALL)
            current = {
                "timestamp": parse_timestamp(date_text, time_text),
                "sender": sender_match.group(1).strip() if sender_match else "",
                "has_sender": bool(sender_match),
                "content": sender_match.group(2) if sender_match else rest.strip(),
            }
        elif current is not None and line != "":
            current["content"] += f"\n{line}"
    if current is not None:
        messages.append(current)
    if not messages:
        raise ValueError(f"No WhatsApp messages found in {path}")
    return messages


def identify_sender(raw_sender: str) -> dict:
    display_name = raw_sender.strip()
    phone = normalize_phone(display_name)
    if len(phone) >= 7 and re.fullmatch(r"[+\d\s().-]+", display_name):
        return {
            "display_name": display_name,
            "sender_type": "phone",
            "phone": phone,
            "sender_key": f"phone:{phone}",
        }
    name_key = normalize_name(display_name)
    mapped_phone = MERGED_NAME_PHONE_MAPPINGS.get(name_key, "")
    return {
        "display_name": display_name,
        "sender_type": "phone" if mapped_phone else "name",
        "phone": mapped_phone,
        "sender_key": f"phone:{mapped_phone}" if mapped_phone else f"name:{name_key}",
    }


def daily_day_key(timestamp: datetime) -> str:
    if timestamp.hour < 8:
        timestamp -= timedelta(days=1)
    return timestamp.date().isoformat()


def parse_media(messages: list[dict]) -> tuple[list[dict], list[dict]]:
    image_sequence = 0
    video_sequence = 0
    filename_owners: dict[str, dict] = {}
    last_media_by_sender: dict[str, dict] = {}
    media_records: list[dict] = []

    for message_index, message in enumerate(messages):
        content_lines = [strip_formatting(line) for line in message["content"].split("\n")]
        first_content_line = next((line for line in content_lines if line.strip()), "")
        if re.fullmatch(r"\s*<Media omitted>\s*", first_content_line, re.IGNORECASE):
            continue
        removed_match = REMOVED_MEDIA_RE.match(first_content_line)
        if removed_match:
            if removed_match.group(1).lower() == "video":
                video_sequence += 1
            else:
                image_sequence += 1
            last_media_by_sender.clear()
            continue

        media_match = MEDIA_RE.match(first_content_line)
        if not media_match or not message["has_sender"] or not message["sender"]:
            continue
        sender = identify_sender(message["sender"])
        filename = media_match.group(1)
        media_type = "video" if filename.upper().startswith("VID-") else "image"
        if media_type == "video":
            video_sequence += 1
            media_sequence = video_sequence
        else:
            image_sequence += 1
            media_sequence = image_sequence

        if (
            sender["sender_type"] == "phone"
            and sender["phone"] in EXCLUDED_PHONE_NUMBERS
        ) or filename.lower() in EXCLUDED_MEDIA_FILENAMES:
            last_media_by_sender.clear()
            continue

        filename_owner = filename_owners.get(filename.lower())
        previous = last_media_by_sender.get(sender["sender_key"])
        elapsed = (
            (message["timestamp"] - previous["timestamp"]).total_seconds()
            if previous
            else None
        )
        is_duplicate = bool(filename_owner) or (
            elapsed is not None and 0 <= elapsed <= 120
        )
        record = {
            "id": f"{'video' if media_type == 'video' else 'photo'}-{message_index}-{media_sequence}",
            "filename": filename,
            "media_type": media_type,
            "display_name": sender["display_name"],
            "sender_type": sender["sender_type"],
            "phone": sender["phone"],
            "sender_key": sender["sender_key"],
            "timestamp": message["timestamp"],
            "duplicate_candidate": is_duplicate,
            "day_key": daily_day_key(message["timestamp"]),
        }
        media_records.append(record)
        if filename_owner is None:
            filename_owners[filename.lower()] = record
        last_media_by_sender[sender["sender_key"]] = record

    return media_records, apply_review_decisions(media_records)


def apply_review_decisions(media_records: list[dict]) -> list[dict]:
    decisions_path = Path("review-decisions.json")
    decisions_payload = json.loads(decisions_path.read_text(encoding="utf-8"))
    decisions = dict(decisions_payload.get("decisions", decisions_payload))
    for decision_id in STALE_DECISION_IDS:
        decisions.pop(decision_id, None)

    current_ids_by_message = {
        ("video" if record["media_type"] == "video" else "photo", int(record["id"].split("-")[1])): record["id"]
        for record in media_records
    }
    migrated: dict[str, str] = {}
    for decision_id, decision in decisions.items():
        match = re.match(r"^(photo|video)-(\d+)-\d+$", decision_id)
        if not match:
            migrated[decision_id] = decision
            continue
        current_id = current_ids_by_message.get((match.group(1), int(match.group(2))))
        if not current_id or current_id == decision_id:
            migrated[decision_id] = decision
        elif current_id not in migrated:
            migrated[current_id] = decision

    accepted = []
    for record in media_records:
        decision = migrated.get(record["id"])
        excluded_as_duplicate = record["duplicate_candidate"] and decision not in ("beer", "non-beer")
        if not excluded_as_duplicate and decision not in ("non-beer", "duplicate"):
            accepted.append(record)
    return accepted


def read_members(path: Path) -> list[dict]:
    raw_lines = path.read_text(encoding="utf-8-sig").replace("\r\n", "\n").splitlines()
    lines = [line for line in raw_lines if line.strip() and not line.strip().lower().startswith("sep=")]
    if not lines:
        raise ValueError(f"No member rows found in {path}")
    rows = list(csv.reader(lines, delimiter=";"))
    headers = [normalize_name(value) for value in rows[0]]
    name_index = next((index for index, header in enumerate(headers) if "name" in header or "surname" in header), 1)
    phone_index = next((index for index, header in enumerate(headers) if "phone" in header or "number" in header or "telefone" in header), 2)
    members = []
    seen = set()
    for row in rows[1:]:
        if len(row) <= phone_index:
            continue
        phone = normalize_phone(row[phone_index])
        if not phone or phone in seen:
            continue
        seen.add(phone)
        name = row[name_index].strip() if len(row) > name_index else ""
        members.append({"name": name, "phone": phone})
    if not members:
        raise ValueError(f"No members with phone numbers found in {path}")
    return members


def clean_event_target(value: str) -> str:
    value = strip_formatting(value).strip()
    return re.sub(r"^[~\s]+", "", value).strip()


def resolve_target(target: str, name_to_phones: dict[str, list[str]]) -> tuple[list[str], str]:
    target = clean_event_target(target)
    phone_matches = [normalize_phone(match.group(0)) for match in PHONE_RE.finditer(target)]
    if phone_matches:
        return list(dict.fromkeys(phone_matches)), "confirmed_join_event"
    key = normalize_name(target)
    phones = name_to_phones.get(key, [])
    if len(phones) == 1:
        return phones, "confirmed_join_event"
    if len(phones) > 1:
        return [], "ambiguous_name"
    return [], "not_found"


def extract_join_events(messages: list[dict], members: list[dict]) -> tuple[dict[str, list[tuple[datetime, str]]], set[str]]:
    name_to_phones: dict[str, list[str]] = defaultdict(list)
    for member in members:
        key = normalize_name(member["name"])
        if key and member["phone"] not in name_to_phones[key]:
            name_to_phones[key].append(member["phone"])

    events: dict[str, list[tuple[datetime, str]]] = defaultdict(list)
    ambiguous_names: set[str] = set()
    known_names = sorted(name_to_phones, key=len, reverse=True)

    def add_target(target: str, timestamp: datetime) -> None:
        phones, confidence = resolve_target(target, name_to_phones)
        if phones:
            for phone in phones:
                events[phone].append((timestamp, confidence))
        elif confidence == "ambiguous_name":
            ambiguous_names.add(normalize_name(target))

    for message in messages:
        if message["has_sender"]:
            continue
        content = clean_event_target(message["content"])
        joined = JOIN_RE.match(content)
        if joined:
            add_target(joined.group(1), message["timestamp"])
            continue
        added = ADDED_RE.search(content)
        if not added:
            continue
        suffix = content[added.end():]
        # Direct phone targets are unambiguous and cover the common export form.
        for phone_match in PHONE_RE.finditer(suffix):
            add_target(phone_match.group(0), message["timestamp"])
        normalized_suffix = normalize_name(suffix)
        occupied: list[tuple[int, int]] = []
        for name_key in known_names:
            if not name_key or len(name_key) < 2:
                continue
            match = re.search(rf"(?<![a-z0-9]){re.escape(name_key)}(?![a-z0-9])", normalized_suffix)
            if not match:
                continue
            span = match.span()
            if any(span[0] < end and start < span[1] for start, end in occupied):
                continue
            occupied.append(span)
            phones = name_to_phones[name_key]
            if len(phones) == 1:
                events[phones[0]].append((message["timestamp"], "confirmed_join_event"))
            else:
                ambiguous_names.add(name_key)
    return events, ambiguous_names


def phone_for_record(record: dict, members_by_name: dict[str, list[str]]) -> str:
    if record["phone"]:
        return record["phone"]
    name_key = normalize_name(record["display_name"])
    mapped = KNOWN_NAME_PHONE_MAPPINGS.get(name_key) or MERGED_NAME_PHONE_MAPPINGS.get(name_key)
    if mapped:
        return mapped
    phones = members_by_name.get(name_key, [])
    return phones[0] if len(phones) == 1 else ""


def format_date(timestamp: datetime | None) -> str:
    return timestamp.strftime("%d/%m/%Y") if timestamp else ""


def format_time(timestamp: datetime | None) -> str:
    return timestamp.strftime("%H:%M") if timestamp else ""


def write_report(
    output: Path,
    members: list[dict],
    raw_records: list[dict],
    accepted_records: list[dict],
    join_events: dict[str, list[tuple[datetime, str]]],
    ambiguous_names: set[str],
    max_beers: int | None,
) -> int:
    members_by_name: dict[str, list[str]] = defaultdict(list)
    for member in members:
        key = normalize_name(member["name"])
        if key and member["phone"] not in members_by_name[key]:
            members_by_name[key].append(member["phone"])

    raw_by_phone: dict[str, int] = defaultdict(int)
    accepted_by_phone: dict[str, list[dict]] = defaultdict(list)
    for record in raw_records:
        phone = phone_for_record(record, members_by_name)
        if phone:
            raw_by_phone[phone] += 1
    for record in accepted_records:
        phone = phone_for_record(record, members_by_name)
        if phone:
            accepted_by_phone[phone].append(record)

    report_at = max(record["timestamp"] for record in raw_records + accepted_records)
    recent_cutoff = (report_at - timedelta(days=1)).date()
    rows = []
    for member in members:
        phone = member["phone"]
        beers = sorted(accepted_by_phone.get(phone, []), key=lambda record: record["timestamp"])
        if max_beers is not None and len(beers) > max_beers:
            continue
        last_beer = beers[-1] if beers else None
        event_list = sorted(join_events.get(phone, []), key=lambda event: event[0])
        first_join_at = event_list[0][0] if event_list else None
        join_at = event_list[-1][0] if event_list else None
        join_source = event_list[-1][1] if event_list else "unknown"
        if not join_at and normalize_name(member["name"]) in ambiguous_names:
            join_source = "ambiguous_name"
        if join_at and join_at.date() >= recent_cutoff:
            recent_status = "SIM — não remover automaticamente"
        elif join_source in {"unknown", "ambiguous_name"}:
            recent_status = "REVER — entrada desconhecida"
        else:
            recent_status = "não"
        rows.append({
            "nome_membro": member["name"],
            "telefone": member["phone"],
            "finos_contados": len(beers),
            "media_img_vid_brutos": raw_by_phone.get(phone, 0),
            "data_ultimo_fino": format_date(last_beer["timestamp"] if last_beer else None),
            "hora_ultimo_fino": format_time(last_beer["timestamp"] if last_beer else None),
            "ultimo_ficheiro": last_beer["filename"] if last_beer else "",
            "data_primeira_entrada": format_date(first_join_at),
            "hora_primeira_entrada": format_time(first_join_at),
            "data_ultima_entrada": format_date(join_at),
            "hora_ultima_entrada": format_time(join_at),
            "origem_ultima_entrada": join_source,
            "entrada_recente": recent_status,
        })

    rows.sort(key=lambda row: (
        int(row["finos_contados"]),
        row["data_ultimo_fino"] or "0000/00/00",
        row["nome_membro"].casefold(),
        row["telefone"],
    ))
    output.parent.mkdir(parents=True, exist_ok=True)
    fields = list(rows[0]) if rows else [
        "nome_membro", "telefone", "finos_contados", "media_img_vid_brutos",
        "data_ultimo_fino", "hora_ultimo_fino", "ultimo_ficheiro",
        "data_primeira_entrada", "hora_primeira_entrada",
        "data_ultima_entrada", "hora_ultima_entrada",
        "origem_ultima_entrada", "entrada_recente",
    ]
    with output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("members", type=Path, help="current WhatsApp member-list CSV")
    parser.add_argument("-o", "--output", type=Path, default=Path("people-to-delete.csv"))
    parser.add_argument(
        "--max-beers",
        type=int,
        default=3,
        help="include members up to this count; use -1 for all current members (default: 3)",
    )
    parser.add_argument("--chat", type=Path, default=Path("WhatsApp Chat with Um Milhão de Finos.txt"))
    args = parser.parse_args()

    members = read_members(args.members)
    messages = read_chat(args.chat)
    raw_records, accepted_records = parse_media(messages)
    join_events, ambiguous_names = extract_join_events(messages, members)
    max_beers = None if args.max_beers < 0 else args.max_beers
    count = write_report(
        args.output,
        members,
        raw_records,
        accepted_records,
        join_events,
        ambiguous_names,
        max_beers,
    )
    print(
        f"Read {len(members)} current members; counted {len(accepted_records)} beers; "
        f"wrote {count} rows to {args.output}"
    )


if __name__ == "__main__":
    main()
