/*
 * Um Milhão de Finos
 * A browser-only WhatsApp beer ledger. The import pipeline intentionally lives
 * in this file so the counting contract can be audited without a server.
 */

const TARGET_BEERS = 1_000_000;
const MAPPINGS_STORAGE_KEY = "um-milhao-de-finos-name-mappings";
const APP_STATE_STORAGE_KEY = "um-milhao-de-finos-app-state-v1";
const REPOSITORY_CHAT_FILE = "WhatsApp Chat with Um Milhão de Finos.txt";
const REPOSITORY_CONTACTS_FILE = "contacts.csv";
const numberFormat = new Intl.NumberFormat("en-US");
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const shortDateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
});

const dom = {
  overviewMount: document.getElementById("overviewMount"),
  dailyMount: document.getElementById("dailyMount"),
  participantsMount: document.getElementById("participantsMount"),
  importsStatus: document.getElementById("importsStatus"),
  detailMount: document.getElementById("detailMount"),
  mapperDialog: document.getElementById("mapperDialog"),
  mapperMount: document.getElementById("mapperMount"),
  toast: document.getElementById("toast"),
  sidebar: document.getElementById("sidebar"),
  chatFileInput: document.getElementById("chatFileInput"),
  contactsFileInput: document.getElementById("contactsFileInput"),
};

const appState = {
  mode: "demo",
  currentView: "overview",
  records: [],
  participants: [],
  contacts: [],
  contactsRestored: false,
  chatMessages: [],
  stats: {
    rawPhotoCount: 0,
    dedupedCount: 0,
    duplicateCount: 0,
    manualTotal: null,
  },
  importMeta: {
    chatFileName: "Demo snapshot",
    contactsFileName: null,
    importedAt: null,
  },
  manualMappings: loadMappings(),
  selectedDay: null,
  selectedParticipant: null,
  detailPage: 1,
  participantSort: "count",
  participantSearch: "",
  justImported: false,
};

const avatarClasses = ["", "avatar-rust", "avatar-green", "avatar-dark"];

function icon(name, className = "") {
  return `<svg class="icon ${className}" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value) {
  return value === null || value === undefined || Number.isNaN(value)
    ? "—"
    : numberFormat.format(value);
}

function normalizePhone(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeName(value) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stripWhatsAppFormatting(value) {
  // WhatsApp exports can contain directional marks and zero-width characters
  // around dates, senders, or attachment filenames (especially from iOS).
  return String(value ?? "").replace(/[\u200B-\u200D\u2060\uFEFF\u200E\u200F\u202A-\u202E]/g, "");
}

function isRawPhone(value) {
  const text = String(value ?? "").trim();
  const digits = normalizePhone(text);
  return digits.length >= 7 && /^[+\d\s().-]+$/.test(text);
}

function identifySender(rawSender) {
  const displayName = String(rawSender ?? "").trim();
  if (isRawPhone(displayName)) {
    const phone = normalizePhone(displayName);
    return {
      displayName,
      senderType: "phone",
      phone,
      senderKey: `phone:${phone}`,
    };
  }

  return {
    displayName,
    senderType: "name",
    phone: "",
    senderKey: `name:${normalizeName(displayName)}`,
  };
}

function parseTimestamp(dateText, timeText) {
  const parts = String(dateText).split("/").map(Number);
  const timeParts = String(timeText).replace(/\s+/g, " ").trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (parts.length !== 3 || !timeParts) return null;

  const [day, month, rawYear] = parts;
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  const hour = Number(timeParts[1]);
  const minute = Number(timeParts[2]);
  const second = Number(timeParts[3] || 0);
  const timestamp = new Date(year, month - 1, day, hour, minute, second);

  if (Number.isNaN(timestamp.getTime())) return null;
  return timestamp;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function dateKeyFromDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "unknown";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dailyBucketKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "unknown";
  const bucketDate = new Date(date);
  if (bucketDate.getHours() < 8) bucketDate.setDate(bucketDate.getDate() - 1);
  return dateKeyFromDate(bucketDate);
}

function dateFromDayKey(dayKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return null;
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(year, month - 1, day, 8, 0, 0);
}

function formatDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "Unknown date";
  return dateFormat.format(date);
}

function formatShortDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "Unknown";
  return shortDateFormat.format(date);
}

function formatTime(date, fallback = "—") {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return fallback;
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatBucketLabel(dayKey, compact = false) {
  const start = dateFromDayKey(dayKey);
  if (!start) return "Unknown window";
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  if (compact) return `${formatShortDate(start)} · 08:00`;
  return `${formatDate(start)} 08:00 → ${formatShortDate(end)} 08:00`;
}

function formatIdentitySubtitle(participant) {
  if (participant.matchStatus === "mapped") {
    return `linked · ${participant.member?.name || participant.mappedPhone}`;
  }
  if (participant.matchStatus === "matched") {
    return participant.member?.name || participant.phone || "phone matched";
  }
  if (participant.senderType === "phone") {
    return participant.phone || "phone sender";
  }
  return "name identified · needs a phone link";
}

function initials(name) {
  const clean = String(name ?? "?").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function avatarHtml(participant, index = 0, large = false) {
  const className = avatarClasses[index % avatarClasses.length];
  return `<span class="avatar ${className}${large ? " avatar-large" : ""}">${escapeHtml(initials(participant.displayName))}</span>`;
}

function statusHtml(participant) {
  if (participant.matchStatus === "matched") {
    return `<span class="status-tag status-matched">Phone matched</span>`;
  }
  if (participant.matchStatus === "mapped") {
    return `<span class="status-tag status-matched">Manually linked</span>`;
  }
  if (participant.matchStatus === "mapped-unknown") {
    return `<span class="status-tag status-phone">Phone saved · no roster row</span>`;
  }
  if (participant.matchStatus === "phone-unmatched") {
    return `<span class="status-tag status-phone">Phone not in CSV</span>`;
  }
  return `<span class="status-tag status-name">Name only · unmatched</span>`;
}

function loadMappings() {
  try {
    const saved = window.localStorage.getItem(MAPPINGS_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persistMappings() {
  try {
    window.localStorage.setItem(MAPPINGS_STORAGE_KEY, JSON.stringify(appState.manualMappings));
  } catch {
    // The app remains usable when storage is disabled; mappings simply last this session.
  }
}

function serializeRecord(record) {
  return {
    id: record.id,
    filename: record.filename,
    displayName: record.displayName,
    senderType: record.senderType,
    phone: record.phone,
    senderKey: record.senderKey,
    timestamp: record.timestamp instanceof Date && !Number.isNaN(record.timestamp.getTime()) ? record.timestamp.toISOString() : null,
    dateText: record.dateText,
    timeText: record.timeText,
    dayKey: record.dayKey,
    messageIndex: record.messageIndex,
  };
}

function persistAppState() {
  try {
    const snapshot = {
      version: 1,
      mode: appState.mode,
      contacts: appState.contacts,
      importMeta: {
        chatFileName: appState.importMeta.chatFileName,
        contactsFileName: appState.importMeta.contactsFileName,
        importedAt: appState.importMeta.importedAt instanceof Date && !Number.isNaN(appState.importMeta.importedAt.getTime())
          ? appState.importMeta.importedAt.toISOString()
          : null,
      },
      ledger: appState.mode === "imported"
        ? { records: appState.records.map(serializeRecord), stats: appState.stats }
        : null,
    };
    window.localStorage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Large exports can exceed a browser's quota. The in-memory import still works.
  }
}

function restoreAppState() {
  try {
    const raw = window.localStorage.getItem(APP_STATE_STORAGE_KEY);
    if (!raw) return false;
    const snapshot = JSON.parse(raw);
    if (!snapshot || snapshot.version !== 1) return false;

    if (Array.isArray(snapshot.contacts)) {
      appState.contacts = snapshot.contacts;
      appState.contactsRestored = true;
    }
    if (snapshot.importMeta && typeof snapshot.importMeta === "object") {
      appState.importMeta = {
        chatFileName: snapshot.importMeta.chatFileName || "Demo snapshot",
        contactsFileName: snapshot.importMeta.contactsFileName || null,
        importedAt: snapshot.importMeta.importedAt ? new Date(snapshot.importMeta.importedAt) : null,
      };
    }

    if (snapshot.mode !== "imported" || !snapshot.ledger || !Array.isArray(snapshot.ledger.records)) return false;
    appState.mode = "imported";
    appState.records = snapshot.ledger.records.map((record) => {
      const timestamp = record.timestamp ? new Date(record.timestamp) : null;
      return {
        ...record,
        timestamp,
        dayKey: record.dayKey || dailyBucketKey(timestamp),
      };
    });
    appState.stats = {
      rawPhotoCount: Number(snapshot.ledger.stats?.rawPhotoCount || 0),
      dedupedCount: Number(snapshot.ledger.stats?.dedupedCount || appState.records.length),
      duplicateCount: Number(snapshot.ledger.stats?.duplicateCount || 0),
      manualTotal: snapshot.ledger.stats?.manualTotal ?? null,
    };
    appState.chatMessages = [];
    return true;
  } catch {
    return false;
  }
}

function sameClockMinute(first, second) {
  if (!first || !second) return false;
  if (!(first.timestamp instanceof Date) || !(second.timestamp instanceof Date)) return false;
  return (
    first.timestamp.getFullYear() === second.timestamp.getFullYear() &&
    first.timestamp.getMonth() === second.timestamp.getMonth() &&
    first.timestamp.getDate() === second.timestamp.getDate() &&
    first.timestamp.getHours() === second.timestamp.getHours() &&
    first.timestamp.getMinutes() === second.timestamp.getMinutes()
  );
}

/**
 * Parse a WhatsApp export. A message header starts a record; lines without a
 * header are continuations of the preceding record (multiline messages are
 * common in exports). System records have no sender and are preserved for
 * ordering, but cannot produce beer records.
 */
function parseWhatsAppChat(text) {
  const lines = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(stripWhatsAppFormatting);
  const headerPattern = /^\s*(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)\s+-\s+(.*)$/;
  const messages = [];
  let current = null;

  const pushCurrent = () => {
    if (current) messages.push(current);
  };

  lines.forEach((line, index) => {
    const header = line.match(headerPattern);
    if (!header) {
      if (current && line !== "") {
        current.content += `\n${line}`;
      }
      return;
    }

    pushCurrent();
    const [, dateText, timeText, rest] = header;
    const senderMatch = rest.match(/^([^:]+):\s?(.*)$/s);
    const hasSender = Boolean(senderMatch);
    const sender = hasSender ? senderMatch[1].trim() : "";
    const content = hasSender ? senderMatch[2] : rest.trim();
    current = {
      index,
      dateText,
      timeText,
      timestamp: parseTimestamp(dateText, timeText),
      sender,
      hasSender,
      content,
    };
  });
  pushCurrent();

  const photoPattern = /^\s*(IMG-[\w-]+\.(?:jpg|jpeg|png))\s+\(file attached\)\s*$/i;
  const bareNumberPattern = /^\s*\d+\s*$/;
  let rawPhotoCount = 0;
  let duplicateCount = 0;
  let lastPhoto = null;
  const records = [];
  const manualTotals = [];

  messages.forEach((message, messageIndex) => {
    const contentLines = message.content
      .split("\n")
      .map(stripWhatsAppFormatting);
    const firstContentLine = contentLines.find((line) => line.trim() !== "") || "";

    // In a real export, a photo caption is often an un-timestamped
    // continuation line. Scan each line for the manual tally, but identify a
    // photo from the attachment line itself so captions cannot hide it.
    if (message.hasSender) {
      contentLines.forEach((line) => {
        const numericLine = line.trim();
        if (bareNumberPattern.test(numericLine)) manualTotals.push(Number(numericLine));
      });
    }

    const photoMatch = firstContentLine.match(photoPattern);
    if (!photoMatch || !message.hasSender || !message.sender.trim()) return;

    rawPhotoCount += 1;
    const sender = identifySender(message.sender);
    const photo = {
      id: `photo-${messageIndex}-${rawPhotoCount}`,
      filename: photoMatch[1],
      displayName: sender.displayName,
      senderType: sender.senderType,
      phone: sender.phone,
      senderKey: sender.senderKey,
      timestamp: message.timestamp,
      dateText: message.dateText,
      timeText: message.timeText,
      dayKey: dailyBucketKey(message.timestamp),
      messageIndex,
      duplicate: false,
    };

    // Compare against the immediately previous photo, not the previous line:
    // system notices and captions are allowed between photo records. If a
    // different sender has posted a photo, lastPhoto changes and no dedupe is
    // applied across that boundary.
    const isDuplicate = Boolean(
      lastPhoto &&
      lastPhoto.senderKey === photo.senderKey &&
      sameClockMinute(lastPhoto, photo),
    );

    if (isDuplicate) {
      duplicateCount += 1;
      photo.duplicate = true;
    } else {
      records.push(photo);
    }
    lastPhoto = photo;
  });

  return {
    messages,
    records,
    rawPhotoCount,
    duplicateCount,
    dedupedCount: records.length,
    manualTotal: manualTotals.length ? Math.max(...manualTotals) : null,
  };
}

function countDelimiter(line, delimiter) {
  let quoted = false;
  let count = 0;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && character === delimiter) {
      count += 1;
    }
  }
  return count;
}

function parseCsvRows(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = String(text ?? "").replace(/^\uFEFF/, "");

  const pushCell = () => {
    row.push(cell);
    cell = "";
  };
  const pushRow = () => {
    pushCell();
    if (row.some((value) => String(value).trim() !== "")) rows.push(row);
    row = [];
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === delimiter) {
      pushCell();
    } else if (character === "\n") {
      pushRow();
    } else if (character !== "\r") {
      cell += character;
    }
  }
  if (cell !== "" || row.length) pushRow();
  return rows;
}

function detectCsvDelimiter(text) {
  const lines = String(text ?? "").replace(/^\uFEFF/, "").split(/\r?\n/);
  const firstContentLine = lines.find((line) => line.trim() !== "") || "";
  const sepHeader = firstContentLine.match(/^\s*sep\s*=\s*(.)\s*$/i);
  if (sepHeader) return { delimiter: sepHeader[1], cleanedText: lines.slice(lines.indexOf(firstContentLine) + 1).join("\n") };

  const candidates = [",", ";", "\t"];
  const delimiter = candidates.sort((a, b) => countDelimiter(firstContentLine, b) - countDelimiter(firstContentLine, a))[0];
  return { delimiter, cleanedText: text };
}

function headerKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function splitContactPhoneValues(value) {
  return String(value ?? "")
    .split(/\s*:::\s*|\s*\|\s*|\s*,\s*/)
    .map((phone) => phone.trim())
    .filter(Boolean);
}

function parseContactsCsv(text) {
  const { delimiter, cleanedText } = detectCsvDelimiter(text);
  const rows = parseCsvRows(cleanedText, delimiter);
  if (!rows.length) return [];

  const headers = rows[0].map(headerKey);
  const phoneIndices = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => /phone|mobile|tel|telefone|number|numero|whatsapp/.test(header))
    .map(({ index }) => index);
  if (!phoneIndices.length) {
    const inferredPhoneIndex = inferPhoneIndex(rows.slice(1));
    if (inferredPhoneIndex >= 0) phoneIndices.push(inferredPhoneIndex);
  }

  const nameIndices = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => (
      /^(first|middle|last|full)? ?name$/.test(header) ||
      /^name surname$/.test(header) ||
      /surname|nome|apelido|contact/.test(header)
    ) && !/phonetic|organization|country|pais|file as/.test(header))
    .map(({ index }) => index);
  const fallbackNameIndex = nameIndices.length ? nameIndices[0] : 0;
  const countryIndex = headers.findIndex((header) => /country|pais/.test(header));

  const contacts = [];
  rows.slice(1).forEach((row, rowIndex) => {
    const phoneRaws = phoneIndices.flatMap((index) => splitContactPhoneValues(row[index]));
    const nameParts = (nameIndices.length ? nameIndices : [fallbackNameIndex])
      .map((index) => String(row[index] ?? "").trim())
      .filter(Boolean);
    const name = nameParts.join(" ");
    const country = countryIndex >= 0 ? String(row[countryIndex] ?? "").trim() : "";

    if (!name && !phoneRaws.length) return;
    if (!phoneRaws.length) {
      contacts.push({
        id: `contact-${rowIndex}`,
        name: name || "Contacto sem nome",
        phoneRaw: "",
        phone: "",
        country,
      });
      return;
    }

    phoneRaws.forEach((phoneRaw, phoneIndex) => {
      contacts.push({
        id: `contact-${rowIndex}-${phoneIndex}`,
        name: name || "Contacto sem nome",
        phoneRaw,
        phone: normalizePhone(phoneRaw),
        country,
      });
    });
  });

  const seenPhones = new Set();
  return contacts.filter((contact) => {
    if (!contact.phone) return true;
    if (seenPhones.has(contact.phone)) return false;
    seenPhones.add(contact.phone);
    return true;
  });
}

function inferPhoneIndex(rows) {
  if (!rows.length) return -1;
  const columnCount = Math.max(...rows.map((row) => row.length));
  for (let index = 0; index < columnCount; index += 1) {
    const numericValues = rows
      .map((row) => normalizePhone(row[index]))
      .filter((value) => value.length >= 7);
    if (numericValues.length >= Math.max(1, Math.floor(rows.length * 0.35))) return index;
  }
  return -1;
}

function buildDemoState() {
  const people = [
    { displayName: "+351 916 517 325", type: "phone", phone: "351916517325", count: 1184, member: "João Afonso" },
    { displayName: "+351 912 440 180", type: "phone", phone: "351912440180", count: 913, member: "Marta Sousa" },
    { displayName: "+351 934 661 204", type: "phone", phone: "351934661204", count: 687, member: "Miguel Costa" },
    { displayName: "João Afonso Álvares Ribeiro", type: "name", phone: "", count: 542, member: "" },
    { displayName: "Erik Juergens Juergens", type: "name", phone: "", count: 401, member: "" },
    { displayName: "+351 965 782 441", type: "phone", phone: "351965782441", count: 262, member: "Rui Almeida" },
    { displayName: "Bia — Biazinha", type: "name", phone: "", count: 184, member: "" },
  ];
  const contacts = people
    .filter((person) => person.type === "phone")
    .map((person, index) => ({
      id: `demo-contact-${index}`,
      name: person.member,
      phoneRaw: `+${person.phone}`,
      phone: person.phone,
      country: "Portugal",
    }));
  const records = [];
  let sequence = 0;
  const base = new Date(2026, 0, 5, 8, 12);

  people.forEach((person, personIndex) => {
    for (let index = 0; index < person.count; index += 1) {
      const timestamp = new Date(base);
      const dayOffset = (index * 3 + personIndex * 11) % 206;
      timestamp.setDate(base.getDate() + dayOffset);
      timestamp.setHours(8 + ((index * 7 + personIndex * 3) % 15), (index * 13 + personIndex * 5) % 60, 0, 0);
      const stamp = `${timestamp.getFullYear()}${pad(timestamp.getMonth() + 1)}${pad(timestamp.getDate())}`;
      const filename = `IMG-${stamp}-WA${String((sequence % 9999) + 1).padStart(4, "0")}.jpg`;
      const senderKey = person.type === "phone" ? `phone:${person.phone}` : `name:${normalizeName(person.displayName)}`;
      records.push({
        id: `demo-photo-${sequence}`,
        filename,
        displayName: person.displayName,
        senderType: person.type,
        phone: person.phone,
        senderKey,
        timestamp,
        dateText: `${pad(timestamp.getDate())}/${pad(timestamp.getMonth() + 1)}/${timestamp.getFullYear()}`,
        timeText: formatTime(timestamp),
        dayKey: dailyBucketKey(timestamp),
        messageIndex: sequence,
        duplicate: false,
      });
      sequence += 1;
    }
  });

  return {
    records,
    contacts,
    stats: {
      rawPhotoCount: 4781,
      dedupedCount: records.length,
      duplicateCount: 4781 - records.length,
      manualTotal: 4180,
    },
  };
}

function resolveParticipantMatch(participant, contactsByPhone) {
  if (participant.senderType === "phone") {
    const member = contactsByPhone.get(participant.phone);
    return {
      ...participant,
      member: member || null,
      matchStatus: member ? "matched" : "phone-unmatched",
      mappedPhone: "",
    };
  }

  const mappedPhone = normalizePhone(appState.manualMappings[participant.senderKey] || "");
  if (mappedPhone) {
    const member = contactsByPhone.get(mappedPhone);
    return {
      ...participant,
      member: member || null,
      mappedPhone,
      matchStatus: member ? "mapped" : "mapped-unknown",
    };
  }

  return {
    ...participant,
    member: null,
    mappedPhone: "",
    matchStatus: "name-only",
  };
}

function refreshDerived() {
  const contactsByPhone = new Map(appState.contacts.filter((contact) => contact.phone).map((contact) => [contact.phone, contact]));
  const grouped = new Map();

  appState.records.forEach((record) => {
    if (!grouped.has(record.senderKey)) {
      grouped.set(record.senderKey, {
        id: record.senderKey,
        senderKey: record.senderKey,
        displayName: record.displayName,
        senderType: record.senderType,
        phone: record.phone,
        records: [],
        count: 0,
      });
    }
    const participant = grouped.get(record.senderKey);
    participant.records.push(record);
    participant.count += 1;
  });

  appState.participants = Array.from(grouped.values())
    .map((participant) => resolveParticipantMatch(participant, contactsByPhone))
    .sort((first, second) => second.count - first.count || first.displayName.localeCompare(second.displayName));

  const dayKeys = [...new Set(appState.records.map((record) => record.dayKey).filter((key) => key !== "unknown"))].sort();
  if (!appState.selectedDay || !dayKeys.includes(appState.selectedDay)) {
    appState.selectedDay = dayKeys[dayKeys.length - 1] || null;
  }
  if (appState.selectedParticipant && !appState.participants.some((person) => person.id === appState.selectedParticipant)) {
    appState.selectedParticipant = null;
  }
}

function buildDemoMessages() {
  return [];
}

function getUnmatchedParticipants() {
  return appState.participants.filter((participant) => participant.matchStatus === "name-only");
}

function getParticipantById(id) {
  return appState.participants.find((participant) => participant.id === id) || null;
}

function getDayRows(dayKey) {
  return appState.participants
    .map((participant) => ({
      participant,
      count: participant.records.filter((record) => record.dayKey === dayKey).length,
    }))
    .filter((row) => row.count > 0)
    .sort((first, second) => second.count - first.count || first.participant.displayName.localeCompare(second.participant.displayName));
}

function emptyStateHtml(title, body, action = "pick-chat") {
  return `<div class="empty-state"><div><div class="empty-icon">${icon("beer")}</div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p><button class="button button-primary" data-action="${action}">${icon("upload")} Import a chat export</button></div></div>`;
}

function renderImportSummary() {
  if (!appState.justImported && appState.mode !== "imported") return "";
  const { rawPhotoCount, dedupedCount, manualTotal, duplicateCount } = appState.stats;
  const difference = manualTotal === null ? null : manualTotal - dedupedCount;
  const differenceLabel = difference === null ? "—" : `${difference > 0 ? "+" : ""}${formatNumber(difference)}`;
  const source = appState.importMeta.chatFileName || "WhatsApp export";
  return `
    <section class="import-summary" aria-label="Post-import summary">
      <div class="import-summary-header">
        <span class="import-summary-mark">${icon("check")}</span>
        <div>
          <h3>Fresh import processed</h3>
          <p>${escapeHtml(source)} · replace-and-recompute complete</p>
        </div>
      </div>
      <div class="import-summary-values">
        <div class="import-summary-metric"><span>Beers counted · photos</span><strong>${formatNumber(dedupedCount)}</strong></div>
        <div class="import-summary-metric"><span>Group's highest manual count</span><strong>${formatNumber(manualTotal)}</strong></div>
        <div class="import-summary-metric"><span>Difference</span><strong>${differenceLabel}</strong></div>
      </div>
      <div class="dedupe-audit-line">
        <span>${formatNumber(rawPhotoCount)} image files found</span><span>→</span><strong>${formatNumber(dedupedCount)} counted</strong><span>after removing</span><em>${formatNumber(duplicateCount)} same-minute duplicate record${duplicateCount === 1 ? "" : "s"}</em>
      </div>
    </section>`;
}

function renderOverview() {
  const total = appState.stats.dedupedCount;
  const progress = Math.min(100, (total / TARGET_BEERS) * 100);
  const topParticipants = appState.participants.slice(0, 6);
  const latestRecords = [...appState.records]
    .sort((first, second) => (second.timestamp?.getTime?.() || 0) - (first.timestamp?.getTime?.() || 0))
    .slice(0, 5);
  const maxCount = appState.participants[0]?.count || 1;
  const unmatched = getUnmatchedParticipants();

  if (!appState.records.length) {
    dom.overviewMount.innerHTML = `${renderImportSummary()}${emptyStateHtml("The ledger is thirsty.", "Import a full WhatsApp .txt export to turn image attachments into one auditable beer per submission.")}`;
    return;
  }

  const rankingRows = topParticipants
    .map((participant, index) => `
      <button class="rank-row" data-action="open-participant" data-id="${escapeHtml(participant.id)}">
        <span class="rank-number">${String(index + 1).padStart(2, "0")}</span>
        <span class="person-cell">${avatarHtml(participant, index)}<span class="person-copy"><span class="person-name">${escapeHtml(participant.displayName)}</span><span class="person-subline">${escapeHtml(formatIdentitySubtitle(participant))}</span></span></span>
        <span class="rank-bar"><span style="width:${Math.max(3, (participant.count / maxCount) * 100)}%"></span></span>
        <span class="rank-count">${formatNumber(participant.count)} <small>beers</small></span>
      </button>`)
    .join("");

  const auditRows = latestRecords.length
    ? latestRecords
        .map((record) => `
          <div class="audit-row">
            <span class="audit-beer-mark">${icon("beer")}</span>
            <span class="audit-copy"><strong>${escapeHtml(record.displayName)}</strong><span>${escapeHtml(record.filename)}</span></span>
            <span class="audit-time">${escapeHtml(formatTime(record.timestamp, record.timeText))}</span>
          </div>`)
        .join("")
    : `<div class="empty-state"><p>No photo records yet.</p></div>`;

  const sourceLabel = appState.mode === "demo" ? "Demo snapshot" : "Imported archive";
  const sourceDetail = appState.mode === "demo" ? "parser-ready sample data" : appState.importMeta.chatFileName;
  const unmatchedLabel = unmatched.length ? `${String(unmatched.length).padStart(2, "0")} name-only sender${unmatched.length === 1 ? "" : "s"}` : "All senders resolved";

  dom.overviewMount.innerHTML = `
    <div class="overview-meta-line">
      <span class="dataset-badge"><span class="status-pulse"></span><strong>${escapeHtml(sourceLabel)}</strong> · ${escapeHtml(sourceDetail || "full chat export")}</span>
      ${appState.justImported ? `<span class="fresh-import-label">Just recomputed · ${escapeHtml(formatDate(appState.importMeta.importedAt))}</span>` : `<span class="fresh-import-label">${escapeHtml(unmatchedLabel)}</span>`}
    </div>
    ${renderImportSummary()}
    <div class="hero-grid"${appState.justImported || appState.mode === "imported" ? " style=\"margin-top:17px\"" : ""}>
      <article class="hero-card">
        <div class="hero-card-topline"><span>All-time photo count</span>${icon("arrow-up-right")}</div>
        <div class="hero-number">${formatNumber(total)}<small>/ 1,000,000</small></div>
        <div class="hero-progress"><span style="width:${Math.max(0.42, progress)}%"></span></div>
        <div class="hero-card-footer"><span><strong>${progress.toFixed(2)}%</strong> of the way there</span><span>one image · one fin</span></div>
        <div class="hero-stamp">${icon("beer")}</div>
      </article>
      <div class="stat-stack">
        <article class="summary-card"><div class="summary-card-topline"><span>Image files found</span>${icon("file")}</div><div class="summary-card-value">${formatNumber(appState.stats.rawPhotoCount)}</div><div class="summary-card-foot">before duplicate check</div></article>
        <article class="summary-card"><div class="summary-card-topline"><span>Counted after dedupe</span>${icon("check")}</div><div class="summary-card-value">${formatNumber(appState.stats.dedupedCount)}</div><div class="summary-card-foot">authoritative total</div></article>
        <article class="summary-card"><div class="summary-card-topline"><span>Highest manual tally</span>${icon("sliders")}</div><div class="summary-card-value">${formatNumber(appState.stats.manualTotal)}</div><div class="summary-card-foot">sanity check only</div></article>
        <article class="summary-card"><div class="summary-card-topline"><span>Name-only senders</span>${icon("link")}</div><div class="summary-card-value">${String(unmatched.length).padStart(2, "0")}</div><div class="summary-card-foot">${unmatched.length ? "mapping needed" : "all linked"}</div></article>
      </div>
    </div>
    <div class="dashboard-lower">
      <section class="panel-card">
        <div class="section-card-header"><div><p class="eyebrow">Cumulative ranking</p><h2>Who is carrying the round?</h2></div><button class="view-all" data-action="navigate" data-view="participants">All participants ${icon("arrow-right")}</button></div>
        <div class="ranking-list">${rankingRows}</div>
      </section>
      <section class="panel-card audit-panel">
        <div class="section-card-header"><div><p class="eyebrow">Latest traceable records</p><h2>The last few fins</h2></div><button class="view-all" data-action="navigate" data-view="imports">Audit ${icon("arrow-up-right")}</button></div>
        <div class="audit-list">${auditRows}</div>
        <div class="audit-footer"><span>Deduped photo messages</span><strong>${formatNumber(appState.stats.dedupedCount)}</strong></div>
      </section>
    </div>`;
}

function renderDaily() {
  if (!appState.records.length) {
    dom.dailyMount.innerHTML = emptyStateHtml("No daily rounds yet.", "Import a chat export and the 08:00-to-08:00 buckets will build themselves.");
    return;
  }

  const dayKeys = [...new Set(appState.records.map((record) => record.dayKey).filter((key) => key !== "unknown"))].sort().reverse();
  const selectedDay = dayKeys.includes(appState.selectedDay) ? appState.selectedDay : dayKeys[0];
  appState.selectedDay = selectedDay;
  const rows = getDayRows(selectedDay);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const max = rows[0]?.count || 1;
  const options = dayKeys
    .map((dayKey) => `<option value="${dayKey}" ${dayKey === selectedDay ? "selected" : ""}>${escapeHtml(formatBucketLabel(dayKey))}</option>`)
    .join("");
  const chartRows = rows.slice(0, 8)
    .map((row, index) => `<div class="bar-row"><span class="bar-label">${escapeHtml(row.participant.displayName)}</span><span class="bar-track"><span style="width:${Math.max(4, (row.count / max) * 100)}%"></span></span><span class="bar-value">${formatNumber(row.count)}</span></div>`)
    .join("");
  const tableRows = rows
    .map((row, index) => `<tr class="clickable-row" data-action="open-participant" data-id="${escapeHtml(row.participant.id)}"><td class="table-rank">${String(index + 1).padStart(2, "0")}</td><td><button class="table-person-button" data-action="open-participant" data-id="${escapeHtml(row.participant.id)}">${avatarHtml(row.participant, index)}<span class="person-copy"><span class="person-name">${escapeHtml(row.participant.displayName)}</span><span class="person-subline">${escapeHtml(formatIdentitySubtitle(row.participant))}</span></span></button></td><td class="count-cell">${formatNumber(row.count)}</td><td>${statusHtml(row.participant)}</td></tr>`)
    .join("");

  dom.dailyMount.innerHTML = `
    <div class="daily-toolbar"><div><h2>${escapeHtml(formatBucketLabel(selectedDay))}</h2><p>The early hours before 08:00 stay with the previous day.</p></div><div class="select-wrap"><label for="daySelect">Choose a day bucket</label><select id="daySelect">${options}</select>${icon("chevron-down")}</div></div>
    <div class="day-window-card"><div class="window-copy">${icon("calendar")}<div><strong>One group day = 08:00 → next day 08:00</strong><span>${escapeHtml(formatBucketLabel(selectedDay, true))} is the selected window.</span></div></div><div class="day-total"><strong>${formatNumber(total)}</strong><span>beers in this window</span></div></div>
    <section class="day-chart-card"><div class="chart-heading"><h2>Round leaders</h2><span>Top ${Math.min(rows.length, 8)} of ${rows.length} active senders</span></div><div class="bar-chart">${chartRows || `<p class="page-description">No deduplicated photos landed in this bucket.</p>`}</div></section>
    <section class="table-card"><div class="section-card-header"><div><p class="eyebrow">Daily ranking</p><h2>Everyone in this window</h2></div><span class="table-eyebrow">${escapeHtml(formatBucketLabel(selectedDay))}</span></div><div class="table-scroll"><table><thead><tr><th>#</th><th>Participant</th><th>Beers</th><th>Identity</th></tr></thead><tbody>${tableRows || `<tr><td colspan="4"><div class="empty-state"><p>No beers in this day bucket.</p></div></td></tr>`}</tbody></table></div><div class="table-footer"><span>${formatNumber(rows.length)} active sender${rows.length === 1 ? "" : "s"}</span><span>Click a row for the full filename log</span></div></section>`;
}

function sortParticipants(participants) {
  const sorted = [...participants];
  if (appState.participantSort === "name") {
    return sorted.sort((first, second) => first.displayName.localeCompare(second.displayName));
  }
  if (appState.participantSort === "status") {
    return sorted.sort((first, second) => first.matchStatus.localeCompare(second.matchStatus) || second.count - first.count);
  }
  return sorted.sort((first, second) => second.count - first.count || first.displayName.localeCompare(second.displayName));
}

function renderParticipantRows() {
  const query = normalizeName(appState.participantSearch);
  const participants = sortParticipants(appState.participants).filter((participant) => !query || normalizeName(`${participant.displayName} ${participant.phone} ${participant.member?.name || ""}`).includes(query));
  if (!participants.length) {
    return `<tr><td colspan="4"><div class="empty-state"><p>No participant matches “${escapeHtml(appState.participantSearch)}”.</p></div></td></tr>`;
  }
  return participants
    .map((participant, index) => `<tr class="clickable-row" data-action="open-participant" data-id="${escapeHtml(participant.id)}"><td class="table-rank">${String(index + 1).padStart(2, "0")}</td><td><button class="table-person-button" data-action="open-participant" data-id="${escapeHtml(participant.id)}">${avatarHtml(participant, index)}<span class="person-copy"><span class="person-name">${escapeHtml(participant.displayName)}</span><span class="person-subline">${escapeHtml(formatIdentitySubtitle(participant))}</span></span></button></td><td class="count-cell">${formatNumber(participant.count)}</td><td>${statusHtml(participant)}</td></tr>`)
    .join("");
}

function renderParticipants() {
  if (!appState.records.length) {
    dom.participantsMount.innerHTML = emptyStateHtml("No roll call yet.", "Once a chat is imported, every sender with a counted image appears here.");
    return;
  }
  const unmatched = getUnmatchedParticipants().length;
  dom.participantsMount.innerHTML = `
    <div class="participants-toolbar"><div><h2>${formatNumber(appState.participants.length)} participant${appState.participants.length === 1 ? "" : "s"}</h2><p>${formatNumber(appState.stats.dedupedCount)} deduplicated photo submissions in the current archive.</p></div><div class="toolbar-tools"><div class="search-wrap"><label for="participantSearch">Find a sender</label>${icon("search")}<input id="participantSearch" type="search" value="${escapeHtml(appState.participantSearch)}" placeholder="Name or phone" /></div><div><label class="select-wrap-label" for="participantSort">Sort</label><select class="sort-select" id="participantSort"><option value="count" ${appState.participantSort === "count" ? "selected" : ""}>Most beers</option><option value="name" ${appState.participantSort === "name" ? "selected" : ""}>Name A–Z</option><option value="status" ${appState.participantSort === "status" ? "selected" : ""}>Identity status</option></select></div></div></div>
    <div class="contact-note">${icon("info")}<span><strong>${unmatched ? `${unmatched} saved display name${unmatched === 1 ? " remains" : "s remain"} unmatched.` : "Every sender is linked."}</strong> Phone numbers are normalized by digits only; saved contact names are never guessed. Use Resolve names to persist a manual link.</span></div>
    <section class="table-card"><div class="table-scroll"><table><thead><tr><th>#</th><th>Participant</th><th>Beers</th><th>Identity status</th></tr></thead><tbody id="participantsTableBody">${renderParticipantRows()}</tbody></table></div><div class="table-footer"><span>Sorted by ${appState.participantSort === "count" ? "beer count" : appState.participantSort === "name" ? "name" : "identity status"}</span><span>Click any sender to inspect submissions</span></div></section>`;
}

function participantDailyTotals(participant) {
  const totals = new Map();
  participant.records.forEach((record) => {
    if (record.dayKey === "unknown") return;
    totals.set(record.dayKey, (totals.get(record.dayKey) || 0) + 1);
  });
  return [...totals.entries()].sort((first, second) => second[0].localeCompare(first[0])).map(([dayKey, count]) => ({ dayKey, count }));
}

function renderDetail() {
  const participant = getParticipantById(appState.selectedParticipant);
  if (!participant) {
    dom.detailMount.innerHTML = emptyStateHtml("Choose a participant.", "The detail view opens when you click a sender from a ranking.", "navigate");
    return;
  }

  const sortedRecords = [...participant.records].sort((first, second) => (second.timestamp?.getTime?.() || 0) - (first.timestamp?.getTime?.() || 0));
  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(sortedRecords.length / pageSize));
  appState.detailPage = Math.min(Math.max(1, appState.detailPage), totalPages);
  const start = (appState.detailPage - 1) * pageSize;
  const visibleRecords = sortedRecords.slice(start, start + pageSize);
  const dailyTotals = participantDailyTotals(participant);
  const contactDescription = participant.matchStatus === "name-only"
    ? "This saved chat display name cannot be safely auto-matched to the CSV."
    : participant.matchStatus === "phone-unmatched"
      ? "The chat number was normalized, but no equal digit string exists in the imported CSV."
      : participant.member
        ? `Linked contact: ${participant.member.name} · ${participant.member.phoneRaw}`
        : "This sender has a phone link saved for future imports.";
  const rows = visibleRecords
    .map((record) => `<tr><td>${escapeHtml(record.timestamp ? formatDate(record.timestamp) : record.dateText)}</td><td class="bucket-cell">${escapeHtml(record.timestamp ? formatTime(record.timestamp, record.timeText) : record.timeText)}</td><td class="filename-cell" title="${escapeHtml(record.filename)}">${escapeHtml(record.filename)}</td><td class="bucket-cell">${escapeHtml(formatBucketLabel(record.dayKey, true))}</td></tr>`)
    .join("");
  const dayRows = dailyTotals.slice(0, 10)
    .map(({ dayKey, count }) => `<div class="day-total-row"><div><p>${escapeHtml(formatBucketLabel(dayKey, true))}</p><span>08:00 → next day 08:00</span></div><strong>${formatNumber(count)}</strong></div>`)
    .join("");

  dom.detailMount.innerHTML = `
    <button class="detail-back" data-action="navigate" data-view="participants">${icon("chevron-left")} Back to participants</button>
    <div class="detail-heading"><div class="detail-person">${avatarHtml(participant, appState.participants.indexOf(participant), true)}<div><p class="eyebrow">Participant detail</p><h1 id="detail-title">${escapeHtml(participant.displayName)}</h1><p>${escapeHtml(formatIdentitySubtitle(participant))}</p>${statusHtml(participant)}</div></div><div class="detail-total"><span>Deduped beers</span><strong>${formatNumber(participant.count)}</strong></div></div>
    <div class="detail-grid">
      <section class="detail-log-card"><div class="detail-card-header"><div><h2>Original submissions</h2><p>Every row is one counted IMG attachment.</p></div><span class="mono-note">${formatNumber(participant.count)} total</span></div><div class="table-scroll"><table class="detail-log-table"><thead><tr><th>Date</th><th>Time</th><th>Original filename</th><th>08:00 bucket</th></tr></thead><tbody>${rows}</tbody></table></div><div class="pagination"><p>Showing ${formatNumber(start + 1)}–${formatNumber(Math.min(start + pageSize, sortedRecords.length))} of ${formatNumber(sortedRecords.length)}</p><div class="pagination-actions"><button class="icon-button" data-action="detail-page" data-page="${appState.detailPage - 1}" aria-label="Previous page" ${appState.detailPage <= 1 ? "disabled" : ""}>${icon("chevron-left")}</button><button class="icon-button" data-action="detail-page" data-page="${appState.detailPage + 1}" aria-label="Next page" ${appState.detailPage >= totalPages ? "disabled" : ""}>${icon("arrow-right")}</button></div></div></section>
      <aside><section class="detail-days-card"><div class="detail-card-header"><div><h2>Beers by day</h2><p>The same 08:00 boundary, per sender.</p></div></div><div class="detail-days-list">${dayRows || `<div class="empty-state"><p>No valid dated records.</p></div>`}</div>${dailyTotals.length > 10 ? `<div class="table-footer"><span>Showing 10 latest windows</span><span>${formatNumber(dailyTotals.length)} total</span></div>` : ""}</section><div class="detail-contact-card"><h3>${participant.matchStatus === "name-only" ? "Name identified, phone unmatched" : "Identity resolution"}</h3><p>${escapeHtml(contactDescription)}</p><button class="button button-outline" data-action="resolve-names">${icon("link")} ${participant.matchStatus === "name-only" ? "Resolve this name" : "Edit mappings"}</button></div></aside>
    </div>`;
}

function renderImportsStatus() {
  if (!appState.records.length && appState.mode !== "imported") {
    dom.importsStatus.innerHTML = `<div class="import-status-head"><div><h2>Nothing imported yet</h2><p>The demo snapshot is visible in the dashboard; your first .txt import will replace it.</p></div><span class="file-badge">${icon("file")} waiting</span></div><div class="import-status-grid"><div class="import-status-metric"><span>Image files</span><strong>—</strong></div><div class="import-status-metric"><span>Counted beers</span><strong>—</strong></div><div class="import-status-metric"><span>Contacts loaded</span><strong>${formatNumber(appState.contacts.length)}</strong></div></div>`;
    return;
  }
  const imported = appState.mode === "imported";
  dom.importsStatus.innerHTML = `<div class="import-status-head"><div><h2>${imported ? "Current ledger" : "Demo snapshot"}</h2><p>${escapeHtml(appState.importMeta.chatFileName || "No chat file")}${appState.importMeta.importedAt ? ` · processed ${escapeHtml(formatDate(appState.importMeta.importedAt))}` : ""}</p></div><span class="file-badge">${icon("check")} ${imported ? "processed" : "preview"}</span></div><div class="import-status-grid"><div class="import-status-metric"><span>Image files found</span><strong>${formatNumber(appState.stats.rawPhotoCount)}</strong></div><div class="import-status-metric"><span>Counted after dedupe</span><strong>${formatNumber(appState.stats.dedupedCount)}</strong></div><div class="import-status-metric"><span>Contacts loaded</span><strong>${formatNumber(appState.contacts.length)}</strong></div></div><div class="import-status-foot"><span class="status-pulse"></span><span>${imported ? "Saved locally in this browser. A fresh export will replace this ledger and recompute every ranking." : "This sample lets you explore the ledger before importing your own archive."}</span></div>`;
}

function renderTopbarAndSidebar() {
  const total = appState.stats.dedupedCount;
  const progress = Math.min(100, (total / TARGET_BEERS) * 100);
  const unmatchedCount = getUnmatchedParticipants().length;
  const navTotal = document.getElementById("navTotal");
  const navParticipants = document.getElementById("navParticipants");
  const sidebarTotal = document.getElementById("sidebarTotal");
  const sidebarProgress = document.getElementById("sidebarProgress");
  const sidebarPercent = document.getElementById("sidebarPercent");
  const sidebarStatus = document.getElementById("sidebarStatus");
  const topbarStatus = document.getElementById("topbarStatus");
  const unmatchedCountNode = document.getElementById("unmatchedCount");

  if (navTotal) navTotal.textContent = formatNumber(total);
  if (navParticipants) navParticipants.textContent = String(appState.participants.length).padStart(2, "0");
  if (sidebarTotal) sidebarTotal.textContent = formatNumber(total);
  if (sidebarProgress) sidebarProgress.style.width = `${Math.max(0.42, progress)}%`;
  if (sidebarPercent) sidebarPercent.textContent = `${progress.toFixed(2)}%`;
  if (sidebarStatus) sidebarStatus.textContent = appState.mode === "imported"
    ? (appState.justImported ? "Fresh archive processed" : "Saved archive restored")
    : "Demo snapshot loaded";
  if (topbarStatus) topbarStatus.textContent = appState.mode === "imported" ? `Imported · ${formatNumber(total)} beers` : `Demo snapshot · ${formatNumber(total)} beers`;
  if (unmatchedCountNode) unmatchedCountNode.textContent = String(unmatchedCount).padStart(2, "0");
}

function renderViewState() {
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("is-active", view.id === `view-${appState.currentView}`);
  });
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.view === appState.currentView || (appState.currentView === "detail" && item.dataset.view === "participants"));
  });
}

function renderAll() {
  renderViewState();
  renderTopbarAndSidebar();
  renderOverview();
  renderDaily();
  renderParticipants();
  renderImportsStatus();
  if (appState.currentView === "detail") renderDetail();
}

function navigate(view) {
  const allowed = ["overview", "daily", "participants", "imports", "detail"];
  if (!allowed.includes(view)) view = "overview";
  appState.currentView = view;
  if (view !== "detail") appState.selectedParticipant = view === "participants" ? appState.selectedParticipant : appState.selectedParticipant;
  dom.sidebar.classList.remove("is-open");
  renderAll();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openParticipant(id) {
  const participant = getParticipantById(id);
  if (!participant) return;
  appState.selectedParticipant = participant.id;
  appState.detailPage = 1;
  appState.currentView = "detail";
  renderAll();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openMapper() {
  renderMapper();
  if (typeof dom.mapperDialog.showModal === "function") dom.mapperDialog.showModal();
  else dom.mapperDialog.setAttribute("open", "open");
}

function closeMapper() {
  if (typeof dom.mapperDialog.close === "function") dom.mapperDialog.close();
  else dom.mapperDialog.removeAttribute("open");
}

function renderMapper() {
  const people = appState.participants.filter((participant) => participant.senderType === "name");
  if (!people.length) {
    dom.mapperMount.innerHTML = `<div class="mapper-empty">No saved display names are waiting for a phone link. Phone-number senders are matched by normalized digits automatically.</div>`;
    return;
  }
  const contactOptions = appState.contacts.filter((contact) => contact.phone).map((contact) => `<option value="${escapeHtml(contact.phone)}">${escapeHtml(contact.name)} · ${escapeHtml(contact.phoneRaw || contact.phone)}</option>`).join("");
  dom.mapperMount.innerHTML = people.map((participant) => {
    const currentMapping = appState.manualMappings[participant.senderKey] || "";
    const matchingContact = appState.contacts.find((contact) => contact.phone === normalizePhone(currentMapping));
    return `<div class="mapping-row"><div class="mapping-person"><strong>${escapeHtml(participant.displayName)}</strong><span>${formatNumber(participant.count)} beers · ${participant.matchStatus === "name-only" ? "unmatched" : "mapping saved"}</span></div><div class="mapping-control"><label for="map-${escapeHtml(participant.id)}">Link to contact</label><select id="map-${escapeHtml(participant.id)}" data-map-key="${escapeHtml(participant.senderKey)}"><option value="">Leave as name-only</option>${contactOptions}</select><input type="tel" value="${matchingContact ? "" : escapeHtml(currentMapping)}" data-map-phone="${escapeHtml(participant.senderKey)}" placeholder="Or enter phone digits" /></div></div>`;
  }).join("");

  people.forEach((participant) => {
    const select = dom.mapperMount.querySelector(`select[data-map-key="${CSS.escape(participant.senderKey)}"]`);
    if (select) select.value = appState.manualMappings[participant.senderKey] || "";
  });
}

function saveMappings() {
  dom.mapperMount.querySelectorAll("[data-map-key]").forEach((select) => {
    const key = select.dataset.mapKey;
    const input = dom.mapperMount.querySelector(`[data-map-phone="${CSS.escape(key)}"]`);
    const value = normalizePhone(select.value || input?.value || "");
    if (value) appState.manualMappings[key] = value;
    else delete appState.manualMappings[key];
  });
  persistMappings();
  refreshDerived();
  closeMapper();
  renderAll();
  showToast("Name mappings saved for future imports.");
}

function showToast(message) {
  dom.toast.innerHTML = message;
  dom.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => dom.toast.classList.remove("is-visible"), 4200);
}

function handleFilePicker(kind) {
  const input = kind === "chat" ? dom.chatFileInput : dom.contactsFileInput;
  input?.click();
}

async function importChatFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = parseWhatsAppChat(text);
    // Demo contacts are illustrative only. Do not let them create false phone
    // matches when the first real chat is imported without a roster.
    if (appState.mode === "demo" && !appState.importMeta.contactsFileName) {
      appState.contacts = [];
    }
    appState.mode = "imported";
    appState.records = parsed.records;
    appState.chatMessages = parsed.messages;
    appState.stats = {
      rawPhotoCount: parsed.rawPhotoCount,
      dedupedCount: parsed.dedupedCount,
      duplicateCount: parsed.duplicateCount,
      manualTotal: parsed.manualTotal,
    };
    appState.importMeta.chatFileName = file.name;
    appState.importMeta.importedAt = new Date();
    appState.justImported = true;
    appState.selectedParticipant = null;
    appState.detailPage = 1;
    refreshDerived();
    persistAppState();
    navigate("overview");
    showToast(`<strong>${formatNumber(parsed.dedupedCount)} beers counted.</strong> ${formatNumber(parsed.duplicateCount)} same-minute duplicate record${parsed.duplicateCount === 1 ? "" : "s"} removed.`);
  } catch (error) {
    showToast("Could not read that chat export. Check that it is a UTF-8 .txt file.");
    console.error(error);
  }
}

async function importContactsFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    appState.contacts = parseContactsCsv(text);
    appState.importMeta.contactsFileName = file.name;
    refreshDerived();
    persistAppState();
    renderAll();
    showToast(`<strong>${formatNumber(appState.contacts.length)} contactos carregados.</strong> As correspondências por telefone foram recalculadas.`);
  } catch (error) {
    showToast("Não foi possível ler esse ficheiro de contactos. Tente CSV com vírgulas ou ponto e vírgula.");
    console.error(error);
  }
}

async function loadRepositorySources() {
  try {
    const [chatResponse, contactsResponse] = await Promise.all([
      fetch(encodeURI(REPOSITORY_CHAT_FILE), { cache: "no-store" }),
      fetch(REPOSITORY_CONTACTS_FILE, { cache: "no-store" }),
    ]);
    if (!chatResponse.ok) return;

    const chatText = await chatResponse.text();
    const parsed = parseWhatsAppChat(chatText);
    appState.mode = "imported";
    appState.records = parsed.records;
    appState.chatMessages = parsed.messages;
    appState.stats = {
      rawPhotoCount: parsed.rawPhotoCount,
      dedupedCount: parsed.dedupedCount,
      duplicateCount: parsed.duplicateCount,
      manualTotal: parsed.manualTotal,
    };
    appState.importMeta.chatFileName = REPOSITORY_CHAT_FILE;
    appState.importMeta.importedAt = new Date();
    appState.justImported = false;
    appState.selectedParticipant = null;
    appState.detailPage = 1;

    if (contactsResponse.ok) {
      appState.contacts = parseContactsCsv(await contactsResponse.text());
      appState.importMeta.contactsFileName = REPOSITORY_CONTACTS_FILE;
    }
    refreshDerived();
    persistAppState();
    renderAll();
  } catch {
    // Opening index.html directly can block fetch(); the demo or saved browser
    // state remains available. A local static server enables repository loading.
  }
}

function wireDropzone(id, kind) {
  const dropzone = document.getElementById(id);
  if (!dropzone) return;
  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add("is-dragging");
    });
  });
  ["dragleave", "drop"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove("is-dragging");
    });
  });
  dropzone.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (kind === "chat") importChatFile(file);
    else importContactsFile(file);
  });
  dropzone.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    handleFilePicker(kind);
  });
  dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleFilePicker(kind);
    }
  });
}

document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-action]");
  if (!trigger) return;
  const action = trigger.dataset.action;

  if (action === "navigate") {
    event.preventDefault();
    navigate(trigger.dataset.view || "overview");
  } else if (action === "pick-chat") {
    event.preventDefault();
    handleFilePicker("chat");
  } else if (action === "pick-contacts") {
    event.preventDefault();
    handleFilePicker("contacts");
  } else if (action === "resolve-names") {
    event.preventDefault();
    openMapper();
  } else if (action === "close-mapper") {
    event.preventDefault();
    closeMapper();
  } else if (action === "save-mappings") {
    event.preventDefault();
    saveMappings();
  } else if (action === "open-participant") {
    event.preventDefault();
    openParticipant(trigger.dataset.id);
  } else if (action === "detail-page") {
    event.preventDefault();
    if (trigger.disabled) return;
    appState.detailPage = Number(trigger.dataset.page) || 1;
    renderDetail();
  } else if (action === "toggle-sidebar") {
    event.preventDefault();
    dom.sidebar.classList.toggle("is-open");
  }
});

document.addEventListener("change", (event) => {
  if (event.target === dom.chatFileInput) {
    importChatFile(event.target.files?.[0]);
    event.target.value = "";
  } else if (event.target === dom.contactsFileInput) {
    importContactsFile(event.target.files?.[0]);
    event.target.value = "";
  } else if (event.target.id === "daySelect") {
    appState.selectedDay = event.target.value;
    renderDaily();
  } else if (event.target.id === "participantSort") {
    appState.participantSort = event.target.value;
    renderParticipants();
  }
});

document.addEventListener("input", (event) => {
  if (event.target.id !== "participantSearch") return;
  appState.participantSearch = event.target.value;
  const body = document.getElementById("participantsTableBody");
  if (body) body.innerHTML = renderParticipantRows();
});

dom.mapperDialog.addEventListener("click", (event) => {
  if (event.target === dom.mapperDialog) closeMapper();
});

wireDropzone("chatDropzone", "chat");
wireDropzone("contactsDropzone", "contacts");

const demo = buildDemoState();
const restoredLedger = restoreAppState();
if (!restoredLedger) {
  appState.records = demo.records;
  appState.contacts = appState.contactsRestored ? appState.contacts : demo.contacts;
  appState.stats = demo.stats;
  appState.chatMessages = buildDemoMessages();
}
refreshDerived();
renderAll();

// Kept available for lightweight console/fixture checks without exposing any
// data outside the page.
window.UmMilhaoDeFinos = {
  parseWhatsAppChat,
  parseContactsCsv,
  normalizePhone,
  dailyBucketKey,
  get state() {
    return appState;
  },
};
