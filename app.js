/*
 * Um Milhão de Finos
 * A browser-only WhatsApp beer ledger. The import pipeline intentionally lives
 * in this file so the counting contract can be audited without a server.
 */

const TARGET_BEERS = 1_000_000;
const MAPPINGS_STORAGE_KEY = "um-milhao-de-finos-name-mappings";
const APP_STATE_STORAGE_KEY = "um-milhao-de-finos-app-state-v1";
const REVIEW_DECISIONS_STORAGE_KEY = "um-milhao-de-finos-review-decisions-v1";
const REVIEW_DECISIONS_MIGRATION_KEY = "um-milhao-de-finos-review-decisions-filename-duplicates-v1";
const REPOSITORY_CHAT_FILE = "WhatsApp Chat with Um Milhão de Finos.txt";
const REPOSITORY_CONTACTS_FILE = "contacts.csv";
const REPOSITORY_REVIEW_FILE = "review-decisions.json";
const MEDIA_BASE_URL = document.querySelector?.('meta[name="media-base-url"]')?.content || "";
const PRIVATE_ADMIN = document.documentElement.dataset.siteMode === "admin";
const REVIEW_PAGE_SIZE = 48;
const KNOWN_NAME_PHONE_MAPPINGS = Object.freeze({
  "erik juergens": "14406820268",
  "francisco castro": "351938808797",
  "diego armes": "351939351355",
  "diogo amorim silva": "351911932288",
  "bernardo ferro": "351912103090",
  "justin young us phone us phone": "16144990702",
  "miguel araujo": "351932666125",
  "dominguinhos": "351938574212",
  "ricardo almeida": "351916225165",
});
// This participant appears as a phone sender early in the export and as a
// named sender later. Canonicalize both forms before counting or deduplicating.
const MERGED_NAME_PHONE_MAPPINGS = Object.freeze({
  "joao mendonca volkanov": "351910466263",
  "gui carrington": "351913946554",
});
const PUBLIC_NAME_ALIASES = Object.freeze({
  "joao mendonca volkanov": "VOLKANOV",
  "gui carrington": "Guiceps",
});
const PUBLIC_PHONE_NICKNAMES = Object.freeze({
  "351913946554": "Guiceps",
  "913946554": "Guiceps",
  "14406820268": "The American",
  "4406820268": "The American",
  "351912487086": "Andreblcosta",
  "912487086": "Andreblcosta",
  "351912643624": "Nikita Mazepin",
  "912643624": "Nikita Mazepin",
  "351938063574": "Eduardo Piggy",
  "938063574": "Eduardo Piggy",
  "351938176279": "Max Malte",
  "938176279": "Max Malte",
  "351916517325": "Pogacar",
  "916517325": "Pogacar",
  "351938808797": "Kim Jong Fino",
  "938808797": "Kim Jong Fino",
  "351967251443": "568mlHandicap",
  "967251443": "568mlHandicap",
  "351934342019": "Zé Concertos",
  "934342019": "Zé Concertos",
  "351914324122": "Anonymous",
  "914324122": "Anonymous",
  "351967687218": "Cinco Dois",
  "967687218": "Cinco Dois",
  "351919288999": "Soares",
  "919288999": "Soares",
  "351912193758": "Benito Mussolfino",
  "912193758": "Benito Mussolfino",
  "351934390747": "Sombra",
  "934390747": "Sombra",
  "351910189568": "Zé dos Cães",
  "910189568": "Zé dos Cães",
  "351916225165": "Tropa",
  "916225165": "Tropa",
  "351919680759": "3.14",
  "919680759": "3.14",
  "351934852373": "Reis",
  "934852373": "Reis",
  "351915062360": "Saapedra",
  "915062360": "Saapedra",
  "351912930140": "Barrote",
  "912930140": "Barrote",
  "351933276040": "MWENE",
  "933276040": "MWENE",
  "16144990702": "The Other American",
  "6144990702": "The Other American",
  "351916257209": "Duque de Paus",
  "916257209": "Duque de Paus",
  "351962039522": "Provador de Cerveja",
  "962039522": "Provador de Cerveja",
  "351939960405": "D. Zeferino",
  "939960405": "D. Zeferino",
  "351911824704": "Mike Lime",
  "911824704": "Mike Lime",
  "351966734115": "Bastos",
  "966734115": "Bastos",
  "351910466263": "VOLKANOV",
  "910466263": "VOLKANOV",
  "351916688304": "WildChild",
  "916688304": "WildChild",
  "351964326187": "O Mestre",
  "964326187": "O Mestre",
  "351968958207": "CRaúl7 do fino",
  "968958207": "CRaúl7 do fino",
  "351967125526": "Vicente",
  "967125526": "Vicente",
  "351933861174": "Padrinho",
  "933861174": "Padrinho",
  "351911131245": "Martin Garrix",
  "911131245": "Martin Garrix",
  "351918805404": "Requinte",
  "918805404": "Requinte",
  "351963950525": "Bêbado de Elite",
  "963950525": "Bêbado de Elite",
  "351918314047": "Xau Laura",
  "918314047": "Xau Laura",
  "351916856965": "Nutri Pires",
  "916856965": "Nutri Pires",
  "351924036496": "William",
  "924036496": "William",
  "351916502812": "Eu é mais vinho",
  "916502812": "Eu é mais vinho",
});
const PHONE_COUNTRY_CODES = Object.freeze([
  "971", "420", "355", "353", "352", "351", "244", "258", "55", "54", "44", "43", "41", "39", "34", "1",
]);
const EXCLUDED_PHONE_NUMBERS = new Set(["351917944881"]);
const EXCLUDED_MEDIA_FILENAMES = new Set([
  "img-20260731-wa0601.jpg",
  "img-20260730-wa0687.jpg",
]);
const STALE_FILENAME_DUPLICATE_DECISION_IDS = Object.freeze([
  "photo-2222-737",
  "photo-2693-1001",
  "photo-3044-1176",
  "photo-4618-1942",
  "photo-4996-2121",
]);
const numberFormat = new Intl.NumberFormat("pt-PT");
const dateFormat = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const shortDateFormat = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  month: "short",
});
const dateTimeFormat = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dom = {
  overviewMount: document.getElementById("overviewMount"),
  statsMount: document.getElementById("statsMount"),
  dailyMount: document.getElementById("dailyMount"),
  weeklyMount: document.getElementById("weeklyMount"),
  participantsMount: document.getElementById("participantsMount"),
  reviewMount: document.getElementById("reviewMount"),
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
  currentView: PRIVATE_ADMIN ? "audit" : "overview",
  records: [],
  photoCandidates: [],
  participants: [],
  contacts: [],
  contactsRestored: false,
  chatMessages: [],
  latestDataTimestamp: null,
  stats: {
    rawPhotoCount: 0,
    rawImageCount: 0,
    rawVideoCount: 0,
    omittedMediaCount: 0,
    dedupedCount: 0,
    duplicateCount: 0,
    pendingDuplicateCount: 0,
  },
  importMeta: {
    chatFileName: "Demonstração",
    contactsFileName: null,
    importedAt: null,
  },
  manualMappings: loadMappings(),
  reviewDecisions: loadReviewDecisions(),
  selectedDay: null,
  selectedWeek: null,
  reviewPage: 1,
  reviewFilter: PRIVATE_ADMIN ? "duplicates" : "pending",
  reviewSearch: "",
  selectedParticipant: null,
  detailPage: 1,
  participantSort: "count",
  participantSearch: "",
  justImported: false,
};

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

function formatPercent(value) {
  return Number(value).toFixed(2).replace(".", ",");
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

function canonicalizeSender(sender) {
  if (sender.senderType !== "name") return sender;
  const phone = MERGED_NAME_PHONE_MAPPINGS[normalizeName(sender.displayName)] || "";
  if (!phone) return sender;
  return {
    ...sender,
    senderType: "phone",
    phone,
    senderKey: `phone:${phone}`,
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
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "Data desconhecida";
  return dateFormat.format(date);
}

function formatShortDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "Desconhecido";
  return shortDateFormat.format(date);
}

function formatDateTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "Desconhecido";
  return dateTimeFormat.format(date);
}

function formatTime(date, fallback = "—") {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return fallback;
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatBucketLabel(dayKey, compact = false) {
  const start = dateFromDayKey(dayKey);
  if (!start) return "Período desconhecido";
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  if (compact) return `${formatShortDate(start)} · 08:00`;
  return `${formatDate(start)} 08:00 → ${formatShortDate(end)} 08:00`;
}

function participantPhone(participant) {
  return normalizePhone(participant.phone || participant.mappedPhone || participant.member?.phone || "");
}

function localPhoneNumber(value) {
  const phone = normalizePhone(value);
  const countryCode = PHONE_COUNTRY_CODES.find((code) => phone.startsWith(code) && phone.length - code.length >= 7);
  return countryCode ? phone.slice(countryCode.length) : phone;
}

function publicParticipantName(participant) {
  const phone = participantPhone(participant);
  if (!phone) return PUBLIC_NAME_ALIASES[normalizeName(participant.displayName)] || "Telefone em falta";
  return PUBLIC_PHONE_NICKNAMES[phone] || localPhoneNumber(phone);
}

function formatIdentitySubtitle(participant) {
  if (participant.matchStatus === "mapped") {
    return `associado · ${participant.member?.name || localPhoneNumber(participant.mappedPhone)}`;
  }
  if (participant.matchStatus === "matched") {
    return participant.member?.name || localPhoneNumber(participant.phone) || "telefone associado";
  }
  if (participant.senderType === "phone") {
    return localPhoneNumber(participant.phone) || "remetente com telefone";
  }
  return "nome identificado · falta associar telefone";
}

function statusHtml(participant) {
  if (!PRIVATE_ADMIN) return "";
  if (participant.matchStatus === "matched") {
    return `<span class="status-tag status-matched">Telefone associado</span>`;
  }
  if (participant.matchStatus === "mapped") {
    return `<span class="status-tag status-matched">Associação manual</span>`;
  }
  if (participant.matchStatus === "mapped-unknown") {
    return `<span class="status-tag status-phone">Telefone guardado · sem contacto</span>`;
  }
  if (participant.matchStatus === "phone-unmatched") {
    return `<span class="status-tag status-phone">Telefone ausente no CSV</span>`;
  }
  return `<span class="status-tag status-name">Apenas nome · pendente</span>`;
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

function loadReviewDecisions() {
  try {
    const saved = window.localStorage.getItem(REVIEW_DECISIONS_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : {};
    return parsed && typeof parsed === "object" ? (parsed.decisions || parsed) : {};
  } catch {
    return {};
  }
}

function persistReviewDecisions() {
  try {
    window.localStorage.setItem(REVIEW_DECISIONS_STORAGE_KEY, JSON.stringify(appState.reviewDecisions));
  } catch {
    // Review decisions remain available for this session if storage is disabled.
  }
}

function migrateFilenameDuplicateDecisions() {
  try {
    if (window.localStorage.getItem(REVIEW_DECISIONS_MIGRATION_KEY)) return;
    STALE_FILENAME_DUPLICATE_DECISION_IDS.forEach((id) => delete appState.reviewDecisions[id]);
    persistReviewDecisions();
    window.localStorage.setItem(REVIEW_DECISIONS_MIGRATION_KEY, "1");
  } catch {
    STALE_FILENAME_DUPLICATE_DECISION_IDS.forEach((id) => delete appState.reviewDecisions[id]);
  }
}

function migrateReviewDecisionsToCurrentRecords() {
  if (!appState.photoCandidates.length || !Object.keys(appState.reviewDecisions).length) return false;

  const currentIdsByMessage = new Map(
    appState.photoCandidates.map((record) => [`${record.mediaType}:${record.messageIndex}`, record.id]),
  );
  const migrated = {};
  let changed = false;

  Object.entries(appState.reviewDecisions).forEach(([id, decision]) => {
    const match = id.match(/^(photo|video)-(\d+)-\d+$/);
    if (!match) {
      migrated[id] = decision;
      return;
    }

    const mediaType = match[1] === "video" ? "video" : "image";
    const currentId = currentIdsByMessage.get(`${mediaType}:${match[2]}`);
    if (!currentId || currentId === id) {
      migrated[id] = decision;
      return;
    }

    if (!(currentId in migrated)) migrated[currentId] = decision;
    changed = true;
  });

  if (changed) appState.reviewDecisions = migrated;
  return changed;
}

function applyReviewDecisions() {
  if (!appState.photoCandidates.length) return;
  if (migrateReviewDecisionsToCurrentRecords()) persistReviewDecisions();

  const accepted = [];
  const duplicateCount = appState.photoCandidates.filter((candidate) => candidate.duplicateCandidate).length;
  let pendingDuplicateCount = 0;
  let nonBeerCount = 0;
  let reviewedCount = 0;

  appState.photoCandidates.forEach((candidate) => {
    const decision = appState.reviewDecisions[candidate.id] || null;
    const record = { ...candidate, reviewDecision: decision };
    if (decision) reviewedCount += 1;
    if (decision === "non-beer") nonBeerCount += 1;

    const excludeAsDuplicate = candidate.duplicateCandidate && decision !== "beer" && decision !== "non-beer";
    if (excludeAsDuplicate) pendingDuplicateCount += 1;
    if (!excludeAsDuplicate && decision !== "non-beer" && decision !== "duplicate") accepted.push(record);
  });

  appState.records = accepted;
  appState.stats.rawPhotoCount = appState.photoCandidates.length;
  appState.stats.dedupedCount = accepted.length;
  appState.stats.duplicateCount = duplicateCount;
  appState.stats.pendingDuplicateCount = pendingDuplicateCount;
  appState.stats.nonBeerCount = nonBeerCount;
  appState.stats.reviewedCount = reviewedCount;
  appState.stats.pendingReviewCount = appState.photoCandidates.length - reviewedCount;
}

function serializeRecord(record) {
  return {
    id: record.id,
    filename: record.filename,
    mediaType: record.mediaType || "image",
    displayName: record.displayName,
    senderType: record.senderType,
    phone: record.phone,
    senderKey: record.senderKey,
    timestamp: record.timestamp instanceof Date && !Number.isNaN(record.timestamp.getTime()) ? record.timestamp.toISOString() : null,
    dateText: record.dateText,
    timeText: record.timeText,
    dayKey: record.dayKey,
    messageIndex: record.messageIndex,
    duplicateCandidate: Boolean(record.duplicateCandidate),
    duplicateGroupId: record.duplicateGroupId || null,
    duplicateReason: record.duplicateReason || null,
    reviewDecision: record.reviewDecision || null,
  };
}

function persistAppState() {
  try {
    const isRepositorySource = appState.importMeta.chatFileName === REPOSITORY_CHAT_FILE;
    const snapshot = {
      version: 2,
      mode: appState.mode,
      contacts: appState.contacts,
      importMeta: {
        chatFileName: appState.importMeta.chatFileName,
        contactsFileName: appState.importMeta.contactsFileName,
        importedAt: appState.importMeta.importedAt instanceof Date && !Number.isNaN(appState.importMeta.importedAt.getTime())
          ? appState.importMeta.importedAt.toISOString()
          : null,
      },
      // The repository export is fetched on every load; serializing thousands
      // of media records here only duplicates the canonical source and blocks
      // the main thread with a large localStorage write.
      ledger: appState.mode === "imported" && !isRepositorySource
        ? {
            records: appState.records.map(serializeRecord),
            photoCandidates: appState.photoCandidates.map(serializeRecord),
            stats: appState.stats,
          }
        : null,
    };
    window.localStorage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Large manual imports can exceed the browser's quota. The in-memory import still works.
  }
}

function restoreAppState() {
  try {
    const raw = window.localStorage.getItem(APP_STATE_STORAGE_KEY);
    if (!raw) return false;
    const snapshot = JSON.parse(raw);
    if (!snapshot || ![1, 2].includes(snapshot.version)) return false;
    if (snapshot.importMeta?.chatFileName === REPOSITORY_CHAT_FILE) {
      window.localStorage.removeItem(APP_STATE_STORAGE_KEY);
      return false;
    }

    if (Array.isArray(snapshot.contacts)) {
      appState.contacts = snapshot.contacts;
      appState.contactsRestored = true;
    }
    if (snapshot.importMeta && typeof snapshot.importMeta === "object") {
      appState.importMeta = {
        chatFileName: snapshot.importMeta.chatFileName || "Demonstração",
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
    appState.photoCandidates = (snapshot.ledger.photoCandidates || snapshot.ledger.records).map((record) => {
      const timestamp = record.timestamp ? new Date(record.timestamp) : null;
      return {
        ...record,
        timestamp,
        dayKey: record.dayKey || dailyBucketKey(timestamp),
      };
    });
    appState.stats = {
      rawPhotoCount: Number(snapshot.ledger.stats?.rawPhotoCount || 0),
      rawImageCount: Number(snapshot.ledger.stats?.rawImageCount || snapshot.ledger.stats?.rawPhotoCount || 0),
      rawVideoCount: Number(snapshot.ledger.stats?.rawVideoCount || 0),
      omittedMediaCount: Number(snapshot.ledger.stats?.omittedMediaCount || 0),
      dedupedCount: Number(snapshot.ledger.stats?.dedupedCount || appState.records.length),
      duplicateCount: Number(snapshot.ledger.stats?.duplicateCount || 0),
      pendingDuplicateCount: Number(snapshot.ledger.stats?.pendingDuplicateCount || snapshot.ledger.stats?.duplicateCount || 0),
      nonBeerCount: Number(snapshot.ledger.stats?.nonBeerCount || 0),
      reviewedCount: Number(snapshot.ledger.stats?.reviewedCount || 0),
      pendingReviewCount: Number(snapshot.ledger.stats?.pendingReviewCount || 0),
    };
    applyReviewDecisions();
    appState.chatMessages = [];
    return true;
  } catch {
    return false;
  }
}

function withinDuplicateWindow(first, second) {
  if (!first || !second) return false;
  if (!(first.timestamp instanceof Date) || !(second.timestamp instanceof Date)) return false;
  const elapsed = second.timestamp.getTime() - first.timestamp.getTime();
  return elapsed >= 0 && elapsed <= 2 * 60 * 1000;
}

/**
 * Parse a WhatsApp export. A message header starts a record; lines without a
 * header are continuations of the preceding record (multiline messages are
 * common in exports). System records have no sender and are preserved for
 * ordering, but cannot produce media records.
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

  const mediaPattern = /^\s*((?:IMG|VID)-[\w-]+\.(?:jpg|jpeg|png|gif|mp4|3gp|mov))\s+\(file attached\)\s*$/i;
  const removedMediaPattern = /^\s*\[(image|video) removed\]\s*$/i;
  let rawMediaCount = 0;
  let rawImageCount = 0;
  let rawVideoCount = 0;
  let omittedMediaCount = 0;
  let imageSequence = 0;
  let videoSequence = 0;
  let duplicateCount = 0;
  const records = [];
  const mediaRecords = [];
  const filenameOwners = new Map();
  const lastMediaBySender = new Map();

  messages.forEach((message, messageIndex) => {
    const contentLines = message.content
      .split("\n")
      .map(stripWhatsAppFormatting);
    const firstContentLine = contentLines.find((line) => line.trim() !== "") || "";
    if (/^\s*<Media omitted>\s*$/i.test(firstContentLine)) {
      omittedMediaCount += 1;
      return;
    }
    const removedMediaMatch = firstContentLine.match(removedMediaPattern);
    if (removedMediaMatch) {
      if (removedMediaMatch[1].toLowerCase() === "video") videoSequence += 1;
      else imageSequence += 1;
      lastMediaBySender.clear();
      return;
    }

    const mediaMatch = firstContentLine.match(mediaPattern);
    if (!mediaMatch || !message.hasSender || !message.sender.trim()) return;

    const sender = canonicalizeSender(identifySender(message.sender));
    const filename = mediaMatch[1];
    const mediaType = filename.toUpperCase().startsWith("VID-") ? "video" : "image";
    const mediaSequence = mediaType === "video" ? (videoSequence += 1) : (imageSequence += 1);
    if (
      (sender.senderType === "phone" && EXCLUDED_PHONE_NUMBERS.has(sender.phone)) ||
      EXCLUDED_MEDIA_FILENAMES.has(filename.toLowerCase())
    ) {
      lastMediaBySender.clear();
      return;
    }

    rawMediaCount += 1;
    if (mediaType === "video") rawVideoCount += 1;
    else rawImageCount += 1;
    const media = {
      id: `${mediaType === "video" ? "video" : "photo"}-${messageIndex}-${mediaSequence}`,
      filename,
      mediaType,
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
      duplicateCandidate: false,
      duplicateGroupId: null,
      duplicateReason: null,
    };

    const filenameKey = media.filename.toLowerCase();
    const filenameOwner = filenameOwners.get(filenameKey) || null;
    const previousSenderMedia = lastMediaBySender.get(media.senderKey) || null;
    const isTimeDuplicate = Boolean(
      previousSenderMedia &&
      withinDuplicateWindow(previousSenderMedia, media),
    );
    const isFilenameDuplicate = Boolean(filenameOwner);
    const isDuplicate = isTimeDuplicate || isFilenameDuplicate;
    media.duplicateCandidate = isDuplicate;
    media.duplicateReason = isTimeDuplicate && isFilenameDuplicate
      ? "within-two-minutes-and-same-filename"
      : isFilenameDuplicate
        ? "same-filename"
        : isTimeDuplicate
          ? "within-two-minutes"
          : null;
    if (isDuplicate) {
      const duplicateSource = filenameOwner || previousSenderMedia;
      const duplicateGroupId = duplicateSource.duplicateGroupId || `duplicate-group-${duplicateSource.id}`;
      duplicateSource.duplicateGroupId = duplicateGroupId;
      media.duplicateGroupId = duplicateGroupId;
    }
    if (!filenameOwner) filenameOwners.set(filenameKey, media);
    mediaRecords.push(media);

    if (isDuplicate) {
      duplicateCount += 1;
      media.duplicate = true;
    } else {
      records.push(media);
    }
    lastMediaBySender.set(media.senderKey, media);
  });

  return {
    messages,
    latestTimestamp: messages.at(-1)?.timestamp || null,
    records,
    photoRecords: mediaRecords,
    rawPhotoCount: rawMediaCount,
    rawImageCount,
    rawVideoCount,
    omittedMediaCount,
    duplicateCount,
    dedupedCount: records.length,
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
    .filter(({ header }) => /phone|mobile|tel|telefone|number|numero|whatsapp/.test(header) && !/label/.test(header))
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
      rawImageCount: 4781,
      rawVideoCount: 0,
      omittedMediaCount: 0,
      dedupedCount: records.length,
      duplicateCount: 4781 - records.length,
    },
  };
}

function resolveParticipantMatch(participant, contactsByPhone, contactsByName) {
  if (participant.senderType === "phone") {
    const member = contactsByPhone.get(participant.phone);
    return {
      ...participant,
      member: member || null,
      matchStatus: member ? "matched" : "phone-unmatched",
      mappedPhone: "",
    };
  }

  const nameKey = normalizeName(participant.displayName);
  const manualPhone = normalizePhone(appState.manualMappings[participant.senderKey] || KNOWN_NAME_PHONE_MAPPINGS[nameKey] || "");
  const contactMatches = contactsByName.get(nameKey) || [];
  const autoPhone = contactMatches.length === 1 ? contactMatches[0] : "";
  const mappedPhone = manualPhone || autoPhone;
  if (mappedPhone) {
    const member = contactsByPhone.get(mappedPhone);
    return {
      ...participant,
      member: member || null,
      phone: mappedPhone,
      mappedPhone,
      matchStatus: member ? (manualPhone ? "mapped" : "matched") : "mapped-unknown",
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
  const contactsWithPhones = appState.contacts.filter((contact) => contact.phone);
  const contactsByPhone = new Map(contactsWithPhones.map((contact) => [contact.phone, contact]));
  const contactsByName = new Map();
  contactsWithPhones.forEach((contact) => {
    const key = normalizeName(contact.name);
    if (!key) return;
    const phones = contactsByName.get(key) || [];
    if (!phones.includes(contact.phone)) phones.push(contact.phone);
    contactsByName.set(key, phones);
  });
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
    .map((participant) => resolveParticipantMatch(participant, contactsByPhone, contactsByName))
    .sort((first, second) => second.count - first.count || first.displayName.localeCompare(second.displayName));

  const dayKeys = [...new Set(appState.records.map((record) => record.dayKey).filter((key) => key !== "unknown"))].sort();
  if (!appState.selectedDay || !dayKeys.includes(appState.selectedDay)) {
    appState.selectedDay = dayKeys[dayKeys.length - 1] || null;
  }
  const weekKeys = getWeeklyPeriodKeys();
  const defaultWeekKey = weekKeys.length > 1 ? weekKeys.at(-2) : weekKeys.at(-1) || null;
  if (!appState.selectedWeek || !weekKeys.includes(appState.selectedWeek)) {
    appState.selectedWeek = defaultWeekKey;
  }
  if (appState.selectedParticipant && !appState.participants.some((person) => person.id === appState.selectedParticipant)) {
    appState.selectedParticipant = null;
  }
  streakAnalyticsCache = null;
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
    .sort((first, second) => second.count - first.count || publicParticipantName(first.participant).localeCompare(publicParticipantName(second.participant)));
}

function getDailyWinners(dayKey = getLatestDayKey(), limit = 10) {
  if (!dayKey) return [];
  return getDayRows(dayKey).slice(0, limit);
}

function getDailyWinnerRankings(limit = 10) {
  const winnerTotals = new Map();
  getDailyTotalRows().forEach(({ dayKey }) => {
    const rows = getDayRows(dayKey);
    const winningCount = rows[0]?.count || 0;
    rows
      .filter((row) => row.count === winningCount)
      .forEach(({ participant, count }) => {
        const current = winnerTotals.get(participant.id) || {
          participant,
          wins: 0,
          winningFinos: 0,
          lastWinDayKey: null,
        };
        current.wins += 1;
        current.winningFinos += count;
        current.lastWinDayKey = dayKey;
        winnerTotals.set(participant.id, current);
      });
  });

  return [...winnerTotals.values()]
    .sort((first, second) => (
      second.wins - first.wins ||
      second.winningFinos - first.winningFinos ||
      second.lastWinDayKey.localeCompare(first.lastWinDayKey) ||
      publicParticipantName(first.participant).localeCompare(publicParticipantName(second.participant))
    ))
    .slice(0, limit);
}

function getLatestWeekKey() {
  const latestDayKey = getLatestDayKey();
  return latestDayKey ? weekStartKey(latestDayKey) : null;
}

function getWeeklyPeriodKeys() {
  const weekKeys = new Set();
  appState.records.forEach((record) => {
    const dayKey = record.dayKey && record.dayKey !== "unknown" ? record.dayKey : dailyBucketKey(record.timestamp);
    const weekKey = weekStartKey(dayKey);
    if (weekKey !== "unknown") weekKeys.add(weekKey);
  });
  return [...weekKeys].sort();
}

function getParticipantWeekTotalsMap(participant) {
  const totals = new Map();
  participant.records.forEach((record) => {
    const dayKey = record.dayKey && record.dayKey !== "unknown" ? record.dayKey : dailyBucketKey(record.timestamp);
    const weekKey = weekStartKey(dayKey);
    if (weekKey === "unknown") return;
    totals.set(weekKey, (totals.get(weekKey) || 0) + 1);
  });
  return totals;
}

function getWeekRows(weekKey) {
  if (!weekKey || weekKey === "unknown") return [];
  return appState.participants
    .map((participant) => ({
      participant,
      weekKey,
      count: getParticipantWeekTotalsMap(participant).get(weekKey) || 0,
    }))
    .filter((row) => row.count > 0)
    .sort((first, second) => second.count - first.count || publicParticipantName(first.participant).localeCompare(publicParticipantName(second.participant)));
}

function getWeeklyWinners(weekKey = getLatestWeekKey(), limit = 10) {
  return getWeekRows(weekKey).slice(0, limit);
}

function shiftDayKey(dayKey, amount) {
  const date = dateFromDayKey(dayKey);
  if (!date) return null;
  date.setDate(date.getDate() + amount);
  return dateKeyFromDate(date);
}

function getLatestDataTimestamp() {
  const timestamps = [
    appState.latestDataTimestamp,
    ...appState.records.map((record) => record.timestamp),
  ].filter((timestamp) => timestamp instanceof Date && !Number.isNaN(timestamp.getTime()));
  return timestamps.reduce((latest, timestamp) => (!latest || timestamp > latest ? timestamp : latest), null);
}

function getDailyTotalRows() {
  const totals = new Map();
  appState.records.forEach((record) => {
    if (record.dayKey === "unknown") return;
    totals.set(record.dayKey, (totals.get(record.dayKey) || 0) + 1);
  });
  return [...totals.entries()]
    .map(([dayKey, count]) => ({ dayKey, count }))
    .sort((first, second) => first.dayKey.localeCompare(second.dayKey));
}

function getWeeklyTotalRows() {
  const totals = new Map();
  appState.records.forEach((record) => {
    const dayKey = record.dayKey && record.dayKey !== "unknown" ? record.dayKey : dailyBucketKey(record.timestamp);
    const weekKey = weekStartKey(dayKey);
    if (weekKey === "unknown") return;
    totals.set(weekKey, (totals.get(weekKey) || 0) + 1);
  });

  const rows = [...totals.entries()]
    .map(([weekKey, count]) => ({ weekKey, count }))
    .sort((first, second) => first.weekKey.localeCompare(second.weekKey));

  // The export starts part-way through its first weekly period. Start the
  // chart at the first complete Monday 08:00 → Monday 08:00 week.
  return rows.slice(1);
}

function getLatestDayKey() {
  const latestRecordDayKey = getDailyTotalRows().at(-1)?.dayKey || null;
  if (latestRecordDayKey) return latestRecordDayKey;
  const latestTimestamp = getLatestDataTimestamp();
  return latestTimestamp ? dailyBucketKey(latestTimestamp) : null;
}

const GLOBAL_WEEKDAY_LABELS = Object.freeze(["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]);
const GLOBAL_TIME_RANGES = Object.freeze([
  { label: "08–12", start: 8, end: 12 },
  { label: "12–18", start: 12, end: 18 },
  { label: "18–00", start: 18, end: 24 },
  { label: "00–08", start: 0, end: 8 },
]);

function weekStartKey(dayKey) {
  const date = dateFromDayKey(dayKey);
  if (!date) return "unknown";
  const mondayIndex = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayIndex);
  return dateKeyFromDate(date);
}

function formatWeekLabel(weekKey) {
  const start = dateFromDayKey(weekKey);
  if (!start) return "Semana desconhecida";
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return `${formatShortDate(start)} → ${formatShortDate(end)}`;
}

function formatWeekPeriodLabel(weekKey) {
  const start = dateFromDayKey(weekKey);
  if (!start) return "Semana desconhecida";
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return `${formatDate(start)} 08:00 → ${formatDate(end)} 08:00`;
}

function getGlobalStats() {
  const records = appState.records.filter((record) => record.timestamp instanceof Date && !Number.isNaN(record.timestamp.getTime()));
  if (!records.length) return null;

  const dayCounts = new Map();
  const dayParticipants = new Map();
  const weekCounts = new Map();
  const weekParticipants = new Map();
  const hourTotals = Array.from({ length: 24 }, () => 0);
  const heatmap = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  const timeOfDayTotals = GLOBAL_TIME_RANGES.map((range) => ({ ...range, count: 0 }));
  const participantKeys = new Set();

  records.forEach((record) => {
    const dayKey = record.dayKey && record.dayKey !== "unknown" ? record.dayKey : dailyBucketKey(record.timestamp);
    if (dayKey === "unknown") return;
    const dayDate = dateFromDayKey(dayKey);
    const weekdayIndex = dayDate ? (dayDate.getDay() + 6) % 7 : -1;
    const hour = record.timestamp.getHours();
    const participantKey = record.senderKey || record.displayName;
    const weekKey = weekStartKey(dayKey);

    dayCounts.set(dayKey, (dayCounts.get(dayKey) || 0) + 1);
    if (!dayParticipants.has(dayKey)) dayParticipants.set(dayKey, new Set());
    dayParticipants.get(dayKey).add(participantKey);
    participantKeys.add(participantKey);
    hourTotals[hour] += 1;
    if (weekdayIndex >= 0) heatmap[weekdayIndex][hour] += 1;
    const timeRange = timeOfDayTotals.find((range) => hour >= range.start && hour < range.end);
    if (timeRange) timeRange.count += 1;
    weekCounts.set(weekKey, (weekCounts.get(weekKey) || 0) + 1);
    if (!weekParticipants.has(weekKey)) weekParticipants.set(weekKey, new Set());
    weekParticipants.get(weekKey).add(participantKey);
  });

  const activeDayKeys = [...dayCounts.keys()].sort();
  if (!activeDayKeys.length) return null;
  const firstDayKey = activeDayKeys[0];
  const latestDayKey = activeDayKeys.at(-1);
  const firstDate = dateFromDayKey(firstDayKey);
  const latestDate = dateFromDayKey(latestDayKey);
  const daySeries = [];
  const cursor = new Date(firstDate);
  while (cursor <= latestDate) {
    const dayKey = dateKeyFromDate(cursor);
    daySeries.push({ dayKey, count: dayCounts.get(dayKey) || 0, participants: dayParticipants.get(dayKey)?.size || 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  const firstWeekKey = weekStartKey(firstDayKey);
  const latestWeekKey = weekStartKey(latestDayKey);
  const weeklySeries = [];
  const weekCursor = dateFromDayKey(firstWeekKey);
  const latestWeekDate = dateFromDayKey(latestWeekKey);
  while (weekCursor <= latestWeekDate) {
    const weekKey = dateKeyFromDate(weekCursor);
    weeklySeries.push({
      weekKey,
      count: weekCounts.get(weekKey) || 0,
      participants: weekParticipants.get(weekKey)?.size || 0,
    });
    weekCursor.setDate(weekCursor.getDate() + 7);
  }

  const completedPeriods = daySeries.filter((row) => row.dayKey < latestDayKey);
  const projectionPeriods = (completedPeriods.length ? completedPeriods : daySeries).slice(-7);
  const projectionTotal = projectionPeriods.reduce((sum, row) => sum + row.count, 0);
  const projectionRate = projectionPeriods.length ? projectionTotal / projectionPeriods.length : 0;
  const latestTimestamp = records.reduce((latest, record) => !latest || record.timestamp > latest ? record.timestamp : latest, null);
  const total = records.length;
  const remaining = Math.max(0, TARGET_BEERS - total);
  const daysToTarget = remaining && projectionRate ? remaining / projectionRate : 0;
  const projectedDate = remaining && daysToTarget && latestTimestamp
    ? new Date(latestTimestamp.getTime() + daysToTarget * 24 * 60 * 60 * 1000)
    : null;
  const recentKeys = new Set(projectionPeriods.map((row) => row.dayKey));
  const recentCounts = new Map();
  records.forEach((record) => {
    const dayKey = record.dayKey && record.dayKey !== "unknown" ? record.dayKey : dailyBucketKey(record.timestamp);
    if (!recentKeys.has(dayKey)) return;
    recentCounts.set(record.senderKey || record.displayName, (recentCounts.get(record.senderKey || record.displayName) || 0) + 1);
  });
  const participantsByKey = new Map(appState.participants.map((participant) => [participant.senderKey, participant]));
  const recentLeaderboard = [...recentCounts.entries()]
    .map(([senderKey, count]) => ({ participant: participantsByKey.get(senderKey), count }))
    .filter((row) => row.participant)
    .sort((first, second) => second.count - first.count || publicParticipantName(first.participant).localeCompare(publicParticipantName(second.participant)))
    .slice(0, 5);

  const orderedRecords = [...records].sort((first, second) => first.timestamp - second.timestamp);
  let burstStart = 0;
  let maxBurst = { count: 0, start: orderedRecords[0].timestamp, end: orderedRecords[0].timestamp };
  orderedRecords.forEach((record, index) => {
    while (record.timestamp.getTime() - orderedRecords[burstStart].timestamp.getTime() > 60 * 60 * 1000) burstStart += 1;
    const count = index - burstStart + 1;
    if (count > maxBurst.count) maxBurst = { count, start: orderedRecords[burstStart].timestamp, end: record.timestamp };
  });

  const sessions = [];
  let session = [];
  orderedRecords.forEach((record) => {
    const previous = session.at(-1);
    const samePeriod = previous && previous.dayKey === record.dayKey;
    const closeEnough = previous && record.timestamp.getTime() - previous.timestamp.getTime() <= 90 * 60 * 1000;
    if (session.length && (!samePeriod || !closeEnough)) {
      sessions.push(session);
      session = [];
    }
    session.push(record);
  });
  if (session.length) sessions.push(session);
  const largestSessionRecords = sessions.sort((first, second) => second.length - first.length)[0] || [];
  const largestSession = largestSessionRecords.length
    ? { count: largestSessionRecords.length, start: largestSessionRecords[0].timestamp, end: largestSessionRecords.at(-1).timestamp }
    : null;

  const weekdayTotals = heatmap.map((hours) => hours.reduce((sum, count) => sum + count, 0));
  const peakHourCount = Math.max(...hourTotals);
  const peakHour = hourTotals.indexOf(peakHourCount);
  const peakWeekdayCount = Math.max(...weekdayTotals);
  const peakWeekday = weekdayTotals.indexOf(peakWeekdayCount);
  const peakDay = [...daySeries].sort((first, second) => second.count - first.count || second.dayKey.localeCompare(first.dayKey))[0];
  const peakWeek = [...weeklySeries].sort((first, second) => second.count - first.count || second.weekKey.localeCompare(first.weekKey))[0];
  const recentWeekRows = weeklySeries.slice(-4);
  const recentWeekAverage = recentWeekRows.reduce((sum, row) => sum + row.count, 0) / Math.max(recentWeekRows.length, 1);
  const activeDayCount = daySeries.filter((row) => row.count > 0).length;
  const totalActiveParticipants = daySeries.reduce((sum, row) => sum + row.participants, 0);
  const weekendTotal = weekdayTotals[5] + weekdayTotals[6];

  let longestActiveRun = 0;
  let activeRun = 0;
  let previousDayKey = null;
  daySeries.forEach((row) => {
    activeRun = row.count > 0 && previousDayKey && shiftDayKey(previousDayKey, 1) === row.dayKey ? activeRun + 1 : row.count > 0 ? 1 : 0;
    longestActiveRun = Math.max(longestActiveRun, activeRun);
    previousDayKey = row.dayKey;
  });

  return {
    total,
    records,
    firstDayKey,
    latestDayKey,
    latestTimestamp,
    daySeries,
    weeklySeries,
    heatmap,
    hourTotals,
    weekdayTotals,
    timeOfDayTotals,
    activeDayCount,
    spanDays: daySeries.length,
    uniqueParticipants: participantKeys.size,
    averageDaily: total / Math.max(daySeries.length, 1),
    averageActiveParticipants: totalActiveParticipants / Math.max(daySeries.length, 1),
    weekendTotal,
    projectionPeriods,
    projectionRate,
    remaining,
    daysToTarget,
    projectedDate,
    recentLeaderboard,
    peakHour,
    peakHourCount,
    peakWeekday,
    peakWeekdayCount,
    peakDay,
    peakWeek,
    recentWeekAverage,
    maxBurst,
    largestSession,
    longestActiveRun,
    allTimeLeaderboard: appState.participants.slice(0, 5).map((participant) => ({ participant, count: participant.count })),
    dataQuality: {
      omittedMediaCount: appState.stats.omittedMediaCount || 0,
      duplicateCount: appState.stats.duplicateCount || 0,
      pendingDuplicateCount: appState.stats.pendingDuplicateCount || 0,
    },
  };
}

function getParticipantDayTotalsMap(participant) {
  const totals = new Map();
  participant.records.forEach((record) => {
    if (record.dayKey === "unknown") return;
    totals.set(record.dayKey, (totals.get(record.dayKey) || 0) + 1);
  });
  return totals;
}

function getConsecutiveDays(dayTotals, startDayKey) {
  let key = startDayKey;
  let count = 0;
  while (key && (dayTotals.get(key) || 0) > 0) {
    count += 1;
    key = shiftDayKey(key, -1);
  }
  return count;
}

function getAllTimeStreak(dayTotals) {
  const days = [...dayTotals.keys()].sort();
  let best = 0;
  let run = 0;
  let previous = null;

  days.forEach((dayKey) => {
    run = previous && shiftDayKey(previous, 1) === dayKey ? run + 1 : 1;
    best = Math.max(best, run);
    previous = dayKey;
  });

  return best;
}

function getParticipantStreak(participant, latestDayKey = getLatestDayKey()) {
  const dayTotals = getParticipantDayTotalsMap(participant);
  if (!latestDayKey) {
    return { status: "none", value: 0, allTime: 0 };
  }

  const currentCount = dayTotals.get(latestDayKey) || 0;
  const allTime = getAllTimeStreak(dayTotals);
  if (currentCount > 0) {
    return { status: "active", value: getConsecutiveDays(dayTotals, latestDayKey), allTime };
  }

  const previousDayKey = shiftDayKey(latestDayKey, -1);
  const previousCount = dayTotals.get(previousDayKey) || 0;
  if (previousCount > 0) {
    return { status: "risk", value: getConsecutiveDays(dayTotals, previousDayKey), allTime };
  }

  let gap = 0;
  let key = latestDayKey;
  while (key && (dayTotals.get(key) || 0) === 0) {
    gap += 1;
    key = shiftDayKey(key, -1);
  }

  return { status: dayTotals.size ? "negative" : "none", value: dayTotals.size ? -gap : 0, allTime };
}

function buildParticipantInsight(participant, latestDayKey) {
  const dayTotals = getParticipantDayTotalsMap(participant);
  const bestDay = [...dayTotals.entries()]
    .map(([dayKey, count]) => ({ dayKey, count }))
    .sort((first, second) => second.count - first.count || second.dayKey.localeCompare(first.dayKey))[0] || null;
  const currentStreak = getParticipantStreak(participant, latestDayKey);
  return { currentStreak, allTimeStreak: currentStreak.allTime, bestDay };
}

function getParticipantInsights(latestDayKey = getLatestDayKey()) {
  if (streakAnalyticsCache && streakAnalyticsCache.participants === appState.participants && streakAnalyticsCache.latestDayKey === latestDayKey) {
    return streakAnalyticsCache.insights;
  }
  const insights = new Map(appState.participants.map((participant) => [participant.id, buildParticipantInsight(participant, latestDayKey)]));
  streakAnalyticsCache = { participants: appState.participants, latestDayKey, insights };
  return insights;
}

function getParticipantInsight(participant, latestDayKey = getLatestDayKey()) {
  return getParticipantInsights(latestDayKey).get(participant.id) || buildParticipantInsight(participant, latestDayKey);
}

function getStreakRankings(latestDayKey = getLatestDayKey()) {
  return appState.participants
    .map((participant) => ({ participant, ...getParticipantInsight(participant, latestDayKey) }))
    .sort((first, second) => (
      second.currentStreak.value - first.currentStreak.value ||
      second.allTimeStreak - first.allTimeStreak ||
      publicParticipantName(first.participant).localeCompare(publicParticipantName(second.participant))
    ));
}

function getAllTimeStreakRankings() {
  const insights = getParticipantInsights();
  return appState.participants
    .map((participant) => ({ participant, ...insights.get(participant.id) }))
    .sort((first, second) => second.allTimeStreak - first.allTimeStreak || second.participant.count - first.participant.count || publicParticipantName(first.participant).localeCompare(publicParticipantName(second.participant)));
}

function getDailyHighscores(limit = 10) {
  const rows = [];
  appState.participants.forEach((participant) => {
    getParticipantDayTotalsMap(participant).forEach((count, dayKey) => rows.push({ participant, dayKey, count }));
  });
  return rows
    .sort((first, second) => second.count - first.count || second.dayKey.localeCompare(first.dayKey) || publicParticipantName(first.participant).localeCompare(publicParticipantName(second.participant)))
    .slice(0, limit);
}

function getWeeklyHighscores(limit = 10) {
  const rows = [];
  appState.participants.forEach((participant) => {
    getParticipantWeekTotalsMap(participant).forEach((count, weekKey) => rows.push({ participant, weekKey, count }));
  });
  return rows
    .sort((first, second) => second.count - first.count || second.weekKey.localeCompare(first.weekKey) || publicParticipantName(first.participant).localeCompare(publicParticipantName(second.participant)))
    .slice(0, limit);
}

function streakLabel(status) {
  if (status === "active") return "ativo";
  if (status === "risk") return "em risco";
  if (status === "negative") return "negativo";
  return "sem registo";
}

function streakValue(streak) {
  if (!streak || streak.status === "none") return "—";
  const sign = streak.value > 0 ? "+" : "−";
  return `${sign}${formatNumber(Math.abs(streak.value))}`;
}

function streakValueHtml(streak) {
  return `<span class="streak-value streak-${escapeHtml(streak.status)}"><strong>${escapeHtml(streakValue(streak))}</strong><small>${escapeHtml(streakLabel(streak.status))}</small></span>`;
}

function renderDailyTotalsChart(rows) {
  if (!rows.length) return `<div class="chart-empty">Ainda não há dados diários suficientes para desenhar o ritmo do arquivo.</div>`;

  const width = 1000;
  const height = 300;
  const left = 52;
  const right = 22;
  const top = 20;
  const bottom = 48;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const max = Math.max(...rows.map((row) => row.count), 1);
  const x = (index) => left + (rows.length === 1 ? chartWidth / 2 : (index / (rows.length - 1)) * chartWidth);
  const y = (count) => top + chartHeight - (count / max) * chartHeight;
  const points = rows.map((row, index) => `${x(index).toFixed(2)},${y(row.count).toFixed(2)}`);
  const areaPath = `M ${x(0).toFixed(2)} ${top + chartHeight} L ${points.join(" L ")} L ${x(rows.length - 1).toFixed(2)} ${top + chartHeight} Z`;
  const tickCount = 4;
  const grid = Array.from({ length: tickCount + 1 }, (_, index) => {
    const value = Math.round(max * (1 - index / tickCount));
    const lineY = y(value).toFixed(2);
    return `<line class="history-grid-line" x1="${left}" y1="${lineY}" x2="${width - right}" y2="${lineY}"></line><text class="history-axis-label" x="${left - 10}" y="${Number(lineY) + 3}" text-anchor="end">${escapeHtml(formatNumber(value))}</text>`;
  }).join("");
  const labelCount = Math.min(rows.length, 6);
  const labelIndexes = [...new Set(Array.from({ length: labelCount }, (_, index) => Math.round(index * (rows.length - 1) / Math.max(labelCount - 1, 1))))];
  const labels = labelIndexes.map((index) => `<text class="history-x-label" x="${x(index).toFixed(2)}" y="${height - 16}" text-anchor="middle">${escapeHtml(formatShortDate(dateFromDayKey(rows[index].dayKey)))}</text>`).join("");
  const dots = rows.map((row, index) => `<circle class="history-point" cx="${x(index).toFixed(2)}" cy="${y(row.count).toFixed(2)}" r="${rows.length > 70 ? 2.2 : 3.5}"><title>${escapeHtml(formatBucketLabel(row.dayKey))}: ${escapeHtml(formatNumber(row.count))} finos</title></circle>`).join("");

  return `<div class="history-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="history-chart-title history-chart-description"><title id="history-chart-title">Total diário de finos</title><desc id="history-chart-description">Evolução do total de finos por período de 08:00 a 08:00.</desc>${grid}<path class="history-area" d="${areaPath}"></path><polyline class="history-line" points="${points.join(" ")}"></polyline>${dots}${labels}</svg></div>`;
}

function renderWeeklyTotalsChart(rows) {
  if (!rows.length) return `<div class="chart-empty">Ainda não há semanas completas suficientes para desenhar o ritmo semanal.</div>`;

  const width = 1000;
  const height = 300;
  const left = 52;
  const right = 22;
  const top = 20;
  const bottom = 48;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const max = Math.max(...rows.map((row) => row.count), 1);
  const x = (index) => left + (rows.length === 1 ? chartWidth / 2 : (index / (rows.length - 1)) * chartWidth);
  const y = (count) => top + chartHeight - (count / max) * chartHeight;
  const points = rows.map((row, index) => `${x(index).toFixed(2)},${y(row.count).toFixed(2)}`);
  const areaPath = `M ${x(0).toFixed(2)} ${top + chartHeight} L ${points.join(" L ")} L ${x(rows.length - 1).toFixed(2)} ${top + chartHeight} Z`;
  const tickCount = 4;
  const grid = Array.from({ length: tickCount + 1 }, (_, index) => {
    const value = Math.round(max * (1 - index / tickCount));
    const lineY = y(value).toFixed(2);
    return `<line class="history-grid-line" x1="${left}" y1="${lineY}" x2="${width - right}" y2="${lineY}"></line><text class="history-axis-label" x="${left - 10}" y="${Number(lineY) + 3}" text-anchor="end">${escapeHtml(formatNumber(value))}</text>`;
  }).join("");
  const labelCount = Math.min(rows.length, 6);
  const labelIndexes = [...new Set(Array.from({ length: labelCount }, (_, index) => Math.round(index * (rows.length - 1) / Math.max(labelCount - 1, 1))))];
  const labels = labelIndexes.map((index) => `<text class="history-x-label" x="${x(index).toFixed(2)}" y="${height - 16}" text-anchor="middle">${escapeHtml(formatShortDate(dateFromDayKey(rows[index].weekKey)))}</text>`).join("");
  const dots = rows.map((row, index) => `<circle class="history-point" cx="${x(index).toFixed(2)}" cy="${y(row.count).toFixed(2)}" r="${rows.length > 18 ? 2.2 : 3.5}"><title>${escapeHtml(formatWeekPeriodLabel(row.weekKey))}: ${escapeHtml(formatNumber(row.count))} finos</title></circle>`).join("");

  return `<div class="history-chart weekly-history-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="weekly-history-chart-title weekly-history-chart-description"><title id="weekly-history-chart-title">Total semanal de finos</title><desc id="weekly-history-chart-description">Evolução do total de finos por semana, de segunda-feira às 08:00 até à segunda-feira seguinte às 08:00.</desc>${grid}<path class="history-area" d="${areaPath}"></path><polyline class="history-line" points="${points.join(" ")}"></polyline>${dots}${labels}</svg></div>`;
}

function statHeatLevel(value, maximum, levels = 5) {
  if (!value || !maximum) return 0;
  return Math.min(levels, Math.max(1, Math.ceil((value / maximum) * levels)));
}

function renderGlobalHeatmap(stats) {
  const maximum = Math.max(...stats.heatmap.flat(), 1);
  const hours = Array.from({ length: 24 }, (_, hour) => `<span>${hour % 4 === 0 ? pad(hour) : ""}</span>`).join("");
  const rows = stats.heatmap.map((hourCounts, weekdayIndex) => `
    <div class="global-heatmap-row">
      <span class="global-heatmap-day">${GLOBAL_WEEKDAY_LABELS[weekdayIndex]}</span>
      <div class="global-heatmap-cells">
        ${hourCounts.map((count, hour) => `<span class="global-heat-cell heat-level-${statHeatLevel(count, maximum)}" title="${escapeHtml(`${GLOBAL_WEEKDAY_LABELS[weekdayIndex]} · ${pad(hour)}:00 · ${formatNumber(count)} finos`)}" aria-label="${escapeHtml(`${GLOBAL_WEEKDAY_LABELS[weekdayIndex]} às ${pad(hour)}:00: ${formatNumber(count)} finos`)}"></span>`).join("")}
      </div>
    </div>`).join("");
  return `<div class="global-heatmap"><div class="global-heatmap-hours"><span></span><div>${hours}</div></div>${rows}<div class="global-heatmap-legend"><span>menos</span><i class="heat-level-1"></i><i class="heat-level-2"></i><i class="heat-level-3"></i><i class="heat-level-4"></i><i class="heat-level-5"></i><span>mais</span></div></div>`;
}

function renderGlobalHourChart(stats) {
  const maximum = Math.max(...stats.hourTotals, 1);
  return `<div class="stats-hour-bars">${stats.hourTotals.map((count, hour) => `<div class="stats-hour-column" title="${escapeHtml(`${pad(hour)}:00 · ${formatNumber(count)} finos`)}"><span class="stats-hour-count">${formatNumber(count)}</span><div class="stats-hour-track"><span style="height:${Math.max(count ? 5 : 0, (count / maximum) * 100)}%"></span></div><small>${pad(hour)}</small></div>`).join("")}</div>`;
}

function renderGlobalTimeOfDay(stats) {
  const total = stats.timeOfDayTotals.reduce((sum, range) => sum + range.count, 0) || 1;
  const colors = ["amber", "rust", "night", "lime"];
  const rows = stats.timeOfDayTotals.map((range, index) => `<div class="stats-period-row"><div class="stats-period-label"><span class="stats-period-dot stats-period-${colors[index]}"></span><span>${range.label}</span><strong>${formatNumber(range.count)}</strong></div><div class="stats-period-track"><span class="stats-period-${colors[index]}" style="width:${(range.count / total) * 100}%"></span></div><small>${formatPercent((range.count / total) * 100)}%</small></div>`).join("");
  return `<div class="stats-period-list">${rows}</div>`;
}

function renderGlobalWeeklyChart(stats) {
  const maximum = Math.max(...stats.weeklySeries.map((row) => row.count), 1);
  return `<div class="stats-weekly-list">${stats.weeklySeries.map((row) => `<div class="stats-week-row"><div class="stats-week-label"><span>${escapeHtml(formatWeekLabel(row.weekKey))}</span><strong>${formatNumber(row.count)}</strong></div><div class="stats-week-track"><span style="width:${Math.max(row.count ? 4 : 0, (row.count / maximum) * 100)}%"></span></div><small>${formatNumber(row.participants)} ativos</small></div>`).join("")}</div>`;
}

function renderGlobalCalendar(stats) {
  const maximum = Math.max(...stats.daySeries.map((row) => row.count), 1);
  const firstDate = dateFromDayKey(stats.firstDayKey);
  const leadingCells = firstDate ? (firstDate.getDay() + 6) % 7 : 0;
  const blanks = Array.from({ length: leadingCells }, () => `<span class="stats-calendar-blank"></span>`).join("");
  const cells = stats.daySeries.map((row) => {
    const date = dateFromDayKey(row.dayKey);
    const weekday = date ? GLOBAL_WEEKDAY_LABELS[(date.getDay() + 6) % 7] : "";
    return `<span class="stats-calendar-cell heat-level-${statHeatLevel(row.count, maximum)}" title="${escapeHtml(`${formatBucketLabel(row.dayKey)} · ${formatNumber(row.count)} finos`)}" aria-label="${escapeHtml(`${weekday}, ${formatShortDate(date)}: ${formatNumber(row.count)} finos`)}"><b>${date ? date.getDate() : ""}</b><small>${row.count ? formatNumber(row.count) : "·"}</small></span>`;
  }).join("");
  return `<div class="stats-calendar-weekdays">${GLOBAL_WEEKDAY_LABELS.map((label) => `<span>${label}</span>`).join("")}</div><div class="stats-calendar-grid">${blanks}${cells}</div>`;
}

function renderGlobalLeaderboard(rows) {
  if (!rows.length) return `<p class="stats-empty-note">Ainda não há participantes suficientes para comparar.</p>`;
  return `<div class="stats-leaderboard">${rows.map(({ participant, count }, index) => `<div class="stats-leader-row"><span class="stats-leader-rank">${String(index + 1).padStart(2, "0")}</span><span class="stats-leader-name">${escapeHtml(publicParticipantName(participant))}</span><strong>${formatNumber(count)}</strong></div>`).join("")}</div>`;
}

function renderStats() {
  if (!dom.statsMount) return;
  if (!appState.records.length) {
    dom.statsMount.innerHTML = emptyStateHtml("Ainda não há padrões para ler.", "Importe uma exportação do WhatsApp para transformar o arquivo num mapa de ritmo, picos e projeções.");
    return;
  }

  const stats = getGlobalStats();
  if (!stats) {
    dom.statsMount.innerHTML = emptyStateHtml("O arquivo está sem datas válidas.", "Não há registros datados suficientes para desenhar estatísticas globais.");
    return;
  }
  const progress = Math.min(100, (stats.total / TARGET_BEERS) * 100);
  const projectionDate = stats.remaining ? (stats.projectedDate ? formatDate(stats.projectedDate) : "sem projeção") : "milhão alcançado";
  const projectionBasis = `${formatNumber(stats.projectionRate)} finos / período · média dos últimos ${formatNumber(stats.projectionPeriods.length)} períodos`;
  const peakDayLabel = stats.peakDay ? formatBucketLabel(stats.peakDay.dayKey, true) : "—";
  const peakWeekLabel = stats.peakWeek ? formatWeekLabel(stats.peakWeek.weekKey) : "—";
  const maxBurstLabel = stats.maxBurst ? `${formatTime(stats.maxBurst.start)}–${formatTime(stats.maxBurst.end)}` : "—";
  const largestSessionLabel = stats.largestSession ? `${formatTime(stats.largestSession.start)}–${formatTime(stats.largestSession.end)}` : "—";
  const dataQuality = stats.dataQuality;

  dom.statsMount.innerHTML = `
    <div class="stats-meta-line"><span class="dataset-badge"><span class="status-pulse"></span><strong>${escapeHtml(formatBucketLabel(stats.latestDayKey, true))}</strong> · ${formatNumber(stats.spanDays)} dias no arquivo</span><span class="stats-meta-note">Atualizado até ${escapeHtml(formatDateTime(stats.latestTimestamp))}</span></div>
    <section class="stats-projection-card">
      <div class="stats-projection-copy"><p class="eyebrow">Projeção até ao milhão</p><h2>${stats.remaining ? "O próximo marco tem data." : "O marco já foi alcançado."}</h2><div class="stats-projection-date">${escapeHtml(projectionDate)}</div><p>${stats.remaining ? `Ao ritmo recente, faltam cerca de ${formatNumber(Math.ceil(stats.daysToTarget))} dias.` : "O arquivo já passou a meta de 1 000 000 de finos."} <strong>${escapeHtml(projectionBasis)}</strong></p></div>
      <div class="stats-projection-side"><div class="stats-projection-label"><span>Progresso atual</span><strong>${formatPercent(progress)}%</strong></div><div class="stats-projection-track"><span style="width:${Math.max(progress, stats.total ? 0.8 : 0)}%"></span></div><div class="stats-projection-numbers"><span>${formatNumber(stats.total)} contados</span><span>${formatNumber(stats.remaining)} em falta</span></div></div>
    </section>
    <div class="stats-kpi-grid">
      <article class="stats-kpi-card"><span>Média por dia</span><strong>${formatNumber(stats.averageDaily)}</strong><small>inclui dias sem atividade</small></article>
      <article class="stats-kpi-card stats-kpi-card-lime"><span>Dias ativos</span><strong>${formatNumber(stats.activeDayCount)}</strong><small>de ${formatNumber(stats.spanDays)} no calendário</small></article>
      <article class="stats-kpi-card stats-kpi-card-rust"><span>Participantes únicos</span><strong>${formatNumber(stats.uniqueParticipants)}</strong><small>remetentes com fino contado</small></article>
      <article class="stats-kpi-card"><span>Melhor período</span><strong>${formatNumber(stats.peakDay?.count || 0)}</strong><small>${escapeHtml(peakDayLabel)}</small></article>
      <article class="stats-kpi-card stats-kpi-card-dark"><span>Maior semana</span><strong>${formatNumber(stats.peakWeek?.count || 0)}</strong><small>${escapeHtml(peakWeekLabel)}</small></article>
      <article class="stats-kpi-card stats-kpi-card-lime"><span>Streak do arquivo</span><strong>${formatNumber(stats.longestActiveRun)}</strong><small>dias ativos consecutivos</small></article>
    </div>
    <div class="stats-grid stats-grid-wide-first">
      <section class="panel-card stats-panel stats-heatmap-panel"><div class="section-card-header"><div><p class="eyebrow">Quando acontece</p><h2>O mapa do ritmo</h2></div><span class="table-eyebrow">dia do período × hora</span></div><div class="stats-panel-body">${renderGlobalHeatmap(stats)}<p class="stats-method-note">As horas seguem a hora real do envio; o dia da semana segue o período das 08:00 às 08:00.</p></div></section>
      <section class="panel-card stats-panel"><div class="section-card-header"><div><p class="eyebrow">Distribuição horária</p><h2>Quando se bebe?</h2></div><span class="table-eyebrow">24 horas</span></div><div class="stats-panel-body stats-time-body">${renderGlobalHourChart(stats)}${renderGlobalTimeOfDay(stats)}<div class="stats-weekday-summary"><div><span>Dia mais forte</span><strong>${GLOBAL_WEEKDAY_LABELS[stats.peakWeekday]}</strong><small>${formatNumber(stats.peakWeekdayCount)} finos</small></div><div><span>Fim de semana</span><strong>${formatNumber(stats.weekendTotal)}</strong><small>${formatPercent((stats.weekendTotal / Math.max(stats.total, 1)) * 100)}% do arquivo</small></div></div></div></section>
    </div>
    <div class="stats-grid">
      <section class="panel-card stats-panel"><div class="section-card-header"><div><p class="eyebrow">Tendência</p><h2>Finos por semana</h2></div><span class="table-eyebrow">média recente · ${formatNumber(stats.recentWeekAverage)}</span></div><div class="stats-panel-body">${renderGlobalWeeklyChart(stats)}<p class="stats-method-note">Cada barra soma de segunda-feira 08:00 à segunda-feira seguinte 08:00. A semana atual pode estar incompleta.</p></div></section>
      <section class="panel-card stats-panel"><div class="section-card-header"><div><p class="eyebrow">Calendário</p><h2>O arquivo em dias</h2></div><span class="table-eyebrow">${formatNumber(stats.activeDayCount)} dias ativos</span></div><div class="stats-panel-body">${renderGlobalCalendar(stats)}<p class="stats-method-note">Mais escuro significa mais finos no período. Células vazias são dias sem registo.</p></div></section>
    </div>
    <div class="stats-grid">
      <section class="panel-card stats-panel"><div class="section-card-header"><div><p class="eyebrow">Quem aparece</p><h2>Todo o tempo · último ritmo</h2></div><span class="table-eyebrow">top 5</span></div><div class="stats-leaderboards"><div><p class="stats-subheading">Acumulado</p>${renderGlobalLeaderboard(stats.allTimeLeaderboard)}</div><div><p class="stats-subheading">Últimos períodos</p>${renderGlobalLeaderboard(stats.recentLeaderboard)}</div></div><div class="stats-panel-foot">${formatNumber(stats.averageActiveParticipants)} participantes ativos por dia, em média.</div></section>
      <section class="panel-card stats-panel"><div class="section-card-header"><div><p class="eyebrow">Recordes globais</p><h2>Picos que ficam</h2></div><span class="table-eyebrow">arquivo completo</span></div><div class="stats-record-list"><div><span>Hora mais forte</span><strong>${pad(stats.peakHour)}:00 · ${formatNumber(stats.peakHourCount)}</strong></div><div><span>Maior rajada · 60 min</span><strong>${formatNumber(stats.maxBurst.count)} finos</strong><small>${escapeHtml(maxBurstLabel)}</small></div><div><span>Maior sessão</span><strong>${formatNumber(stats.largestSession?.count || 0)} finos</strong><small>${escapeHtml(largestSessionLabel)} · intervalos até 90 min</small></div><div><span>Ritmo médio recente</span><strong>${formatNumber(stats.projectionRate)} / dia</strong><small>base usada na projeção</small></div></div></section>
    </div>
    <section class="stats-data-card"><div><p class="eyebrow">Nota de auditoria</p><h2>O que ainda falta no arquivo</h2><p>${formatNumber(dataQuality.omittedMediaCount)} media omitido${dataQuality.omittedMediaCount === 1 ? "" : "s"} não entra${dataQuality.omittedMediaCount === 1 ? "" : "m"} no total. Há ainda ${formatNumber(dataQuality.pendingDuplicateCount)} candidato${dataQuality.pendingDuplicateCount === 1 ? "" : "s"} a duplicado pendente${dataQuality.pendingDuplicateCount === 1 ? "" : "s"}; os números acima contam apenas o registo auditado por defeito.</p></div><div class="stats-data-count"><strong>${formatNumber(dataQuality.duplicateCount)}</strong><span>candidatos duplicados encontrados</span></div></section>`;
}

function emptyStateHtml(title, body, action = "pick-chat") {
  return `<div class="empty-state"><div><div class="empty-icon">${icon("beer")}</div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p><button class="button button-primary" data-action="${action}">${icon("upload")} Importar uma exportação do chat</button></div></div>`;
}

function renderImportSummary() {
  if (!appState.justImported && appState.mode !== "imported") return "";
  const { rawPhotoCount, rawImageCount = 0, rawVideoCount = 0, dedupedCount, duplicateCount, pendingDuplicateCount = 0, nonBeerCount = 0, pendingReviewCount = 0 } = appState.stats;
  const source = appState.importMeta.chatFileName || "Exportação do WhatsApp";
  return `
    <section class="import-summary" aria-label="Resumo após importação">
      <div class="import-summary-header">
        <span class="import-summary-mark">${icon("check")}</span>
        <div>
          <h3>Importação concluída · auditoria em curso</h3>
          <p>${escapeHtml(source)} · substituição e recálculo concluídos</p>
        </div>
      </div>
      <div class="import-summary-values">
        <div class="import-summary-metric"><span>Finos contados · media</span><strong>${formatNumber(dedupedCount)}</strong></div>
        <div class="import-summary-metric"><span>Media encontrados</span><strong>${formatNumber(rawPhotoCount)}</strong></div>
        <div class="import-summary-metric"><span>Candidatos duplicados</span><strong>${formatNumber(duplicateCount)}</strong></div>
      </div>
      <div class="dedupe-audit-line">
        <span>${formatNumber(rawImageCount)} imagens + ${formatNumber(rawVideoCount)} vídeos encontrados</span><span>→</span><strong>${formatNumber(dedupedCount)} contados por defeito</strong><span>após remover</span><em>${formatNumber(duplicateCount)} candidato${duplicateCount === 1 ? "" : "s"} automático${duplicateCount === 1 ? "" : "s"} a duplicado</em>${pendingDuplicateCount ? `<span>· ${formatNumber(pendingDuplicateCount)} pendentes</span>` : ""}${nonBeerCount ? `<span>· ${formatNumber(nonBeerCount)} não fino${nonBeerCount === 1 ? "" : "s"} excluído${nonBeerCount === 1 ? "" : "s"}</span>` : ""}${pendingReviewCount ? `<span>· ${formatNumber(pendingReviewCount)} por confirmar</span>` : ""}
      </div>
    </section>`;
}

function renderOverview() {
  if (!dom.overviewMount) return;
  const total = appState.stats.dedupedCount;
  const progress = Math.min(100, (total / TARGET_BEERS) * 100);
  const totalRanking = appState.participants.slice(0, 10).map((participant) => ({ participant, count: participant.count }));
  const dailyRows = getDailyTotalRows();
  const weeklyRows = getWeeklyTotalRows();
  const dayKeys = dailyRows.map((row) => row.dayKey);
  const latestDayKey = getLatestDayKey();
  const latestDayRows = latestDayKey ? getDayRows(latestDayKey) : [];
  const latestDayTotal = latestDayRows.reduce((sum, row) => sum + row.count, 0);
  const dailyWinnerRankings = getDailyWinnerRankings();
  const dailyHighscores = getDailyHighscores();
  const latestWeekKey = getLatestWeekKey();
  const weeklyWinners = getWeeklyWinners(latestWeekKey);
  const currentStreaks = getStreakRankings(latestDayKey).slice(0, 10);
  const allTimeStreaks = getAllTimeStreakRankings().slice(0, 10);
  const maxTotalCount = totalRanking[0]?.count || 1;
  const dailyPeriodLabel = latestDayKey ? formatBucketLabel(latestDayKey, true) : "sem período datado";
  const weeklyPeriodLabel = latestWeekKey ? formatWeekPeriodLabel(latestWeekKey) : "sem semana datada";
  if (!appState.records.length) {
    dom.overviewMount.innerHTML = `${renderImportSummary()}${emptyStateHtml("O registo está com sede.", "Importe uma exportação completa do WhatsApp para transformar imagens e vídeos num fino auditável por envio.")}`;
    return;
  }

  const rankingRowsHtml = (rows, maxCount) => rows.length
    ? rows
        .map(({ participant, count }, index) => `
          <button class="rank-row" data-action="open-participant" data-id="${escapeHtml(participant.id)}" title="Abrir detalhe de ${escapeHtml(publicParticipantName(participant))}">
            <span class="rank-number">${String(index + 1).padStart(2, "0")}</span>
            <span class="person-cell"><span class="person-copy"><span class="person-name">${escapeHtml(publicParticipantName(participant))}</span></span></span>
            <span class="rank-bar"><span style="width:${Math.max(3, (count / maxCount) * 100)}%"></span></span>
            <span class="rank-count">${formatNumber(count)} <small>finos</small></span>
          </button>`)
        .join("")
    : `<div class="ranking-empty">Não há finos contados neste período.</div>`;

  const scoreRowsHtml = (rows, kind) => rows.length
    ? rows.map((row, index) => {
      const currentStreak = row.currentStreak;
      const isWinnerRanking = kind === "daily" || kind === "weekly";
      const isDailyWinnerRanking = kind === "daily-wins";
      const value = isDailyWinnerRanking
        ? formatNumber(row.wins)
        : isWinnerRanking
          ? formatNumber(row.count)
          : kind === "current"
            ? streakValue(currentStreak)
            : `+${formatNumber(row.allTimeStreak)}`;
      const detail = kind === "daily-wins"
        ? `Média de finos das vitórias: ${formatNumber(row.winningFinos / row.wins)}`
        : kind === "daily"
          ? formatDate(dateFromDayKey(row.dayKey))
          : kind === "weekly"
            ? formatWeekLabel(row.weekKey)
            : kind === "current"
              ? streakLabel(currentStreak)
              : "melhor sequência";
      const valueClass = kind === "current" ? ` streak-${currentStreak.status}` : "";
      const suffix = isDailyWinnerRanking ? "vitórias" : isWinnerRanking ? "finos" : "dias";
      return `<button class="score-row" data-action="open-participant" data-id="${escapeHtml(row.participant.id)}" title="Abrir detalhe de ${escapeHtml(publicParticipantName(row.participant))}"><span class="score-rank">${String(index + 1).padStart(2, "0")}</span><span class="score-person"><strong>${escapeHtml(publicParticipantName(row.participant))}</strong><small>${escapeHtml(detail)}</small></span><span class="score-number${valueClass}"><strong>${escapeHtml(value)}</strong><small>${suffix}</small></span></button>`;
    }).join("")
    : `<div class="ranking-empty">${kind === "current" || kind === "all-time" ? "Ainda não há sequências para comparar." : kind === "daily-wins" ? "Ainda não há períodos diários para comparar." : "Não há finos contados neste período."}</div>`;

  const sourceLabel = appState.mode === "demo" ? "Demonstração" : "Arquivo do grupo";
  const sourceDetail = appState.mode === "demo" ? "dados de exemplo" : "classificação pública atualizada";
  const publicMeta = `${formatNumber(appState.participants.length)} participantes · ${formatNumber(dayKeys.length)} períodos diários`;
  const latestDataTimestamp = appState.mode === "imported" ? getLatestDataTimestamp() : null;
  const refreshedLabel = latestDataTimestamp ? formatDateTime(latestDataTimestamp) : "—";

  dom.overviewMount.innerHTML = `
    <div class="overview-meta-line">
      <span class="dataset-badge"><span class="status-pulse"></span><strong>${escapeHtml(sourceLabel)}</strong> · ${escapeHtml(sourceDetail || "exportação completa do chat")}</span>
      <span class="overview-meta-right"><span class="fresh-import-label">${escapeHtml(publicMeta)}</span><span class="overview-refresh"><small>Última atualização</small><strong>${escapeHtml(refreshedLabel)}</strong></span></span>
    </div>
    <div class="hero-grid"${appState.justImported || appState.mode === "imported" ? " style=\"margin-top:17px\"" : ""}>
      <article class="hero-card">
        <div class="hero-card-topline"><span>Total de finos</span>${icon("arrow-up-right")}</div>
        <div class="hero-number">${formatNumber(total)}<small>/ 1,000,000</small></div>
        <div class="hero-progress"><span style="width:${Math.max(0.42, progress)}%"></span></div>
        <div class="hero-card-footer"><span><strong>${formatPercent(progress)}%</strong> do caminho percorrido</span><span>${escapeHtml(dailyPeriodLabel)}</span></div>
        <div class="hero-stamp">${icon("beer")}</div>
      </article>
      <div class="stat-stack">
        <article class="summary-card"><div class="summary-card-topline"><span>Finos no arquivo</span>${icon("check")}</div><div class="summary-card-value">${formatNumber(total)}</div><div class="summary-card-foot">contagem atual</div></article>
        <article class="summary-card"><div class="summary-card-topline"><span>Último período</span>${icon("calendar")}</div><div class="summary-card-value">${formatNumber(latestDayTotal)}</div><div class="summary-card-foot">${escapeHtml(dailyPeriodLabel)}</div></article>
        <article class="summary-card"><div class="summary-card-topline"><span>Participantes</span>${icon("users")}</div><div class="summary-card-value">${formatNumber(appState.participants.length)}</div><div class="summary-card-foot">classificação total</div></article>
        <article class="summary-card"><div class="summary-card-topline"><span>Períodos diários</span>${icon("calendar")}</div><div class="summary-card-value">${formatNumber(dayKeys.length)}</div><div class="summary-card-foot">08:00 → 08:00</div></article>
      </div>
    </div>
    <section class="panel-card history-panel">
      <div class="section-card-header"><div><p class="eyebrow">Ritmo do arquivo</p><h2>Total diário de finos</h2></div><span class="table-eyebrow">${escapeHtml(formatBucketLabel(latestDayKey || "unknown"))}</span></div>
      ${renderDailyTotalsChart(dailyRows)}
    </section>
    <section class="panel-card history-panel weekly-history-panel">
      <div class="section-card-header"><div><p class="eyebrow">Ritmo semanal</p><h2>Total semanal de finos</h2></div><span class="table-eyebrow">segunda 08:00 → segunda 08:00</span></div>
      ${renderWeeklyTotalsChart(weeklyRows)}
      <div class="panel-note">A primeira semana parcial foi omitida. A semana mais recente pode ainda estar em curso.</div>
    </section>
    <div class="dashboard-lower dashboard-highlights">
      <section class="panel-card ranking-panel">
        <div class="section-card-header"><div><p class="eyebrow">Classificação acumulada</p><h2>Ranking total · top 10</h2></div><button class="view-all" data-action="navigate" data-view="participants">Todos os participantes ${icon("arrow-right")}</button></div>
        <div class="ranking-list">${rankingRowsHtml(totalRanking, maxTotalCount)}</div>
      </section>
      <section class="panel-card ranking-panel">
        <div class="section-card-header"><div><p class="eyebrow">Recordes de um período</p><h2>Daily highscores · top 10</h2></div><span class="table-eyebrow">08:00 → 08:00</span></div>
        <div class="score-list">${scoreRowsHtml(dailyHighscores, "daily")}</div>
      </section>
      <section class="panel-card ranking-panel">
        <div class="section-card-header"><div><p class="eyebrow">Primeiros lugares acumulados</p><h2>Top 10 Daily winners</h2></div><span class="table-eyebrow">1.º · 08:00 → 08:00</span></div>
        <div class="score-list">${scoreRowsHtml(dailyWinnerRankings, "daily-wins")}</div>
        <div class="panel-note">Conta quantos períodos diários cada participante ganhou. Em caso de empate, todos os primeiros lugares contam.</div>
      </section>
      <section class="panel-card ranking-panel">
        <div class="section-card-header"><div><p class="eyebrow">Classificação semanal</p><h2>Winners of the week</h2></div><span class="table-eyebrow">segunda 08:00 → segunda 08:00</span></div>
        <div class="score-list">${scoreRowsHtml(weeklyWinners, "weekly")}</div>
        <div class="panel-note">Período atual: ${escapeHtml(weeklyPeriodLabel)}.</div>
      </section>
      <section class="panel-card ranking-panel">
        <div class="section-card-header"><div><p class="eyebrow">A sequência mais recente</p><h2>Streak atual · top 10</h2></div><span class="table-eyebrow">${escapeHtml(dailyPeriodLabel)}</span></div>
        <div class="score-list">${scoreRowsHtml(currentStreaks, "current")}</div>
        <div class="panel-note"><span class="streak-legend-dot streak-legend-active"></span> verde ativo · <span class="streak-legend-dot streak-legend-risk"></span> amarelo em risco · <span class="streak-legend-dot streak-legend-negative"></span> vermelho parado</div>
      </section>
      <section class="panel-card ranking-panel">
        <div class="section-card-header"><div><p class="eyebrow">O melhor de sempre</p><h2>Streak highscores · all time</h2></div><span class="table-eyebrow">dias consecutivos</span></div>
        <div class="score-list">${scoreRowsHtml(allTimeStreaks, "all-time")}</div>
      </section>
    </div>`;
}

function renderDaily() {
  if (!dom.dailyMount) return;
  if (!appState.records.length) {
    dom.dailyMount.innerHTML = emptyStateHtml("Ainda não há contagens diárias.", "Importe um chat e os períodos das 08:00 às 08:00 serão criados automaticamente.");
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
    .map((row) => `<div class="bar-row"><span class="bar-label">${escapeHtml(publicParticipantName(row.participant))}</span><span class="bar-track"><span style="width:${Math.max(4, (row.count / max) * 100)}%"></span></span><span class="bar-value">${formatNumber(row.count)}</span></div>`)
    .join("");
  const tableRows = rows
    .map((row, index) => `<tr class="clickable-row" data-action="open-participant" data-id="${escapeHtml(row.participant.id)}"><td class="table-rank">${String(index + 1).padStart(2, "0")}</td><td><button class="table-person-button" data-action="open-participant" data-id="${escapeHtml(row.participant.id)}"><span class="person-copy"><span class="person-name">${escapeHtml(publicParticipantName(row.participant))}</span>${PRIVATE_ADMIN ? `<span class="person-subline">${escapeHtml(formatIdentitySubtitle(row.participant))}</span>` : ""}</span></button></td><td class="count-cell">${formatNumber(row.count)}</td>${PRIVATE_ADMIN ? `<td>${statusHtml(row.participant)}</td>` : ""}</tr>`)
    .join("");

  dom.dailyMount.innerHTML = `
    <div class="daily-toolbar"><div><h2>${escapeHtml(formatBucketLabel(selectedDay))}</h2><p>As horas antes das 08:00 pertencem ao dia anterior.</p></div><div class="select-wrap"><label for="daySelect">Escolha um período diário</label><select id="daySelect">${options}</select>${icon("chevron-down")}</div></div>
    <div class="day-window-card"><div class="window-copy">${icon("calendar")}<div><strong>Um dia do grupo = 08:00 → 08:00 do dia seguinte</strong><span>${escapeHtml(formatBucketLabel(selectedDay, true))} é o período selecionado.</span></div></div><div class="day-total"><strong>${formatNumber(total)}</strong><span>finos neste período</span></div></div>
    <section class="day-chart-card"><div class="chart-heading"><h2>Líderes do período</h2><span>Os ${Math.min(rows.length, 8)} principais de ${rows.length} remetentes ativos</span></div><div class="bar-chart">${chartRows || `<p class="page-description">Não há finos neste período.</p>`}</div></section>
    <section class="table-card"><div class="section-card-header"><div><p class="eyebrow">Classificação diária</p><h2>Todos neste período</h2></div><span class="table-eyebrow">${escapeHtml(formatBucketLabel(selectedDay))}</span></div><div class="table-scroll"><table><thead><tr><th>#</th><th>Participante</th><th>Finos</th>${PRIVATE_ADMIN ? "<th>Identidade</th>" : ""}</tr></thead><tbody>${tableRows || `<tr><td colspan="${PRIVATE_ADMIN ? 4 : 3}"><div class="empty-state"><p>Não há finos neste período.</p></div></td></tr>`}</tbody></table></div><div class="table-footer"><span>${formatNumber(rows.length)} remetente ativo${rows.length === 1 ? "" : "s"}</span><span>Abra uma linha para ver o registo completo de ficheiros</span></div></section>`;
}

function renderWeekly() {
  if (!dom.weeklyMount) return;
  if (!appState.records.length) {
    dom.weeklyMount.innerHTML = emptyStateHtml("Ainda não há contagens semanais.", "Importe um chat e as semanas de segunda-feira às 08:00 serão criadas automaticamente.");
    return;
  }

  const weekKeys = getWeeklyPeriodKeys().sort().reverse();
  if (!weekKeys.length) {
    dom.weeklyMount.innerHTML = emptyStateHtml("O arquivo não tem semanas datadas.", "Não há registos datados suficientes para desenhar uma classificação semanal.");
    return;
  }

  const selectedWeek = weekKeys.includes(appState.selectedWeek) ? appState.selectedWeek : weekKeys[0];
  appState.selectedWeek = selectedWeek;
  const rows = getWeekRows(selectedWeek);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const max = rows[0]?.count || 1;
  const options = weekKeys
    .map((weekKey) => `<option value="${weekKey}" ${weekKey === selectedWeek ? "selected" : ""}>${escapeHtml(formatWeekPeriodLabel(weekKey))}</option>`)
    .join("");
  const chartRows = rows.slice(0, 8)
    .map((row) => `<div class="bar-row"><span class="bar-label">${escapeHtml(publicParticipantName(row.participant))}</span><span class="bar-track"><span style="width:${Math.max(4, (row.count / max) * 100)}%"></span></span><span class="bar-value">${formatNumber(row.count)}</span></div>`)
    .join("");
  const tableRows = rows
    .map((row, index) => `<tr class="clickable-row" data-action="open-participant" data-id="${escapeHtml(row.participant.id)}"><td class="table-rank">${String(index + 1).padStart(2, "0")}</td><td><button class="table-person-button" data-action="open-participant" data-id="${escapeHtml(row.participant.id)}"><span class="person-copy"><span class="person-name">${escapeHtml(publicParticipantName(row.participant))}</span>${PRIVATE_ADMIN ? `<span class="person-subline">${escapeHtml(formatIdentitySubtitle(row.participant))}</span>` : ""}</span></button></td><td class="count-cell">${formatNumber(row.count)}</td>${PRIVATE_ADMIN ? `<td>${statusHtml(row.participant)}</td>` : ""}</tr>`)
    .join("");

  dom.weeklyMount.innerHTML = `
    <div class="daily-toolbar"><div><h2>${escapeHtml(formatWeekPeriodLabel(selectedWeek))}</h2><p>As semanas começam à segunda-feira às 08:00 e terminam na segunda seguinte às 08:00.</p></div><div class="select-wrap"><label for="weekSelect">Escolha uma semana</label><select id="weekSelect">${options}</select>${icon("chevron-down")}</div></div>
    <div class="day-window-card"><div class="window-copy">${icon("calendar")}<div><strong>Uma semana do grupo = segunda 08:00 → segunda 08:00</strong><span>${escapeHtml(formatWeekPeriodLabel(selectedWeek))} é o período selecionado.</span></div></div><div class="day-total"><strong>${formatNumber(total)}</strong><span>finos nesta semana</span></div></div>
    <section class="day-chart-card"><div class="chart-heading"><h2>Líderes da semana</h2><span>Os ${Math.min(rows.length, 8)} principais de ${rows.length} remetentes ativos</span></div><div class="bar-chart">${chartRows || `<p class="page-description">Não há finos nesta semana.</p>`}</div></section>
    <section class="table-card"><div class="section-card-header"><div><p class="eyebrow">Classificação semanal</p><h2>Todos nesta semana</h2></div><span class="table-eyebrow">${escapeHtml(formatWeekPeriodLabel(selectedWeek))}</span></div><div class="table-scroll"><table><thead><tr><th>#</th><th>Participante</th><th>Finos</th>${PRIVATE_ADMIN ? "<th>Identidade</th>" : ""}</tr></thead><tbody>${tableRows || `<tr><td colspan="${PRIVATE_ADMIN ? 4 : 3}"><div class="empty-state"><p>Não há finos nesta semana.</p></div></td></tr>`}</tbody></table></div><div class="table-footer"><span>${formatNumber(rows.length)} remetente ativo${rows.length === 1 ? "" : "s"}</span><span>Abra uma linha para ver o registo completo de ficheiros</span></div></section>`;
}

function sortParticipants(participants) {
  const sorted = [...participants];
  if (appState.participantSort === "name") {
    return sorted.sort((first, second) => publicParticipantName(first).localeCompare(publicParticipantName(second)));
  }
  if (appState.participantSort === "status") {
    return sorted.sort((first, second) => first.matchStatus.localeCompare(second.matchStatus) || second.count - first.count);
  }
  return sorted.sort((first, second) => second.count - first.count || publicParticipantName(first).localeCompare(publicParticipantName(second)));
}

function renderParticipantRows() {
  const query = normalizeName(appState.participantSearch);
  const rankById = new Map(appState.participants.map((participant, index) => [participant.id, index + 1]));
  const insights = getParticipantInsights();
  const participants = sortParticipants(appState.participants).filter((participant) => {
    const name = publicParticipantName(participant);
    const searchText = PRIVATE_ADMIN
      ? `${participant.displayName} ${participant.phone} ${participant.member?.name || ""}`
      : `${name} ${participantPhone(participant)}`;
    return !query || normalizeName(searchText).includes(query);
  });
  if (!participants.length) {
    return `<tr><td colspan="${PRIVATE_ADMIN ? 6 : 5}"><div class="empty-state"><p>Nenhum participante corresponde a “${escapeHtml(appState.participantSearch)}”.</p></div></td></tr>`;
  }
  return participants
    .map((participant, index) => {
      const name = publicParticipantName(participant);
      const insight = insights.get(participant.id);
      const identity = PRIVATE_ADMIN ? `<span class="person-subline">${escapeHtml(formatIdentitySubtitle(participant))}</span>` : "";
      return `<tr class="clickable-row" data-action="open-participant" data-id="${escapeHtml(participant.id)}"><td class="table-rank">${String(rankById.get(participant.id) || index + 1).padStart(2, "0")}</td><td><button class="table-person-button" data-action="open-participant" data-id="${escapeHtml(participant.id)}"><span class="person-copy"><span class="person-name">${escapeHtml(name)}</span>${identity}</span></button></td><td class="count-cell">${formatNumber(participant.count)}</td><td class="streak-cell">${streakValueHtml(insight.currentStreak)}</td><td class="streak-cell"><span class="alltime-streak"><strong>+${formatNumber(insight.allTimeStreak)}</strong><small>dias</small></span></td>${PRIVATE_ADMIN ? `<td>${statusHtml(participant)}</td>` : ""}</tr>`;
    })
    .join("");
}

function renderParticipants() {
  if (!dom.participantsMount) return;
  if (!appState.records.length) {
    dom.participantsMount.innerHTML = emptyStateHtml("Ainda não há lista de participantes.", "Depois de importar um chat, todos os remetentes com media contado aparecem aqui.");
    return;
  }
  const identityHeader = PRIVATE_ADMIN ? "<th>Estado da identidade</th>" : "";
  const statusOption = PRIVATE_ADMIN ? `<option value="status" ${appState.participantSort === "status" ? "selected" : ""}>Estado da identidade</option>` : "";
  const sortLabel = appState.participantSort === "count" ? "número de finos" : appState.participantSort === "name" ? "telefone" : "estado da identidade";
  const latestDayKey = getLatestDayKey();
  dom.participantsMount.innerHTML = `
    <div class="participants-toolbar"><div><h2>${formatNumber(appState.participants.length)} participante${appState.participants.length === 1 ? "" : "s"}</h2><p>${formatNumber(appState.stats.dedupedCount)} finos registados · streak atual calculado até ${escapeHtml(latestDayKey ? formatBucketLabel(latestDayKey, true) : "ao último dado")}</p></div><div class="toolbar-tools"><div class="search-wrap"><label for="participantSearch">Encontrar o seu registo</label>${icon("search")}<input id="participantSearch" type="search" value="${escapeHtml(appState.participantSearch)}" placeholder="Procurar telefone" /></div><div><label class="select-wrap-label" for="participantSort">Ordenar</label><select class="sort-select" id="participantSort"><option value="count" ${appState.participantSort === "count" ? "selected" : ""}>Mais finos</option><option value="name" ${appState.participantSort === "name" ? "selected" : ""}>Telefone A–Z</option>${statusOption}</select></div></div></div>
    <section class="table-card"><div class="table-scroll"><table><thead><tr><th>#</th><th>Participante</th><th>Finos</th><th>Streak atual</th><th>Melhor streak</th>${identityHeader}</tr></thead><tbody id="participantsTableBody">${renderParticipantRows()}</tbody></table></div><div class="table-footer"><span>Ordenado por ${sortLabel}</span><span>Verde ativo · amarelo em risco · vermelho negativo</span></div></section>`;
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
  if (!dom.detailMount) return;
  const participant = getParticipantById(appState.selectedParticipant);
  if (!participant) {
    dom.detailMount.innerHTML = emptyStateHtml("Escolha um participante.", "O detalhe abre quando clicar num remetente de uma classificação.", "navigate");
    return;
  }
  const insight = getParticipantInsight(participant);

  const sortedRecords = [...participant.records].sort((first, second) => (second.timestamp?.getTime?.() || 0) - (first.timestamp?.getTime?.() || 0));
  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(sortedRecords.length / pageSize));
  appState.detailPage = Math.min(Math.max(1, appState.detailPage), totalPages);
  const start = (appState.detailPage - 1) * pageSize;
  const visibleRecords = sortedRecords.slice(start, start + pageSize);
  const dailyTotals = participantDailyTotals(participant);
  const contactDescription = PRIVATE_ADMIN && (participant.matchStatus === "name-only"
    ? "Este nome guardado do chat não pode ser associado automaticamente ao CSV com segurança."
    : participant.matchStatus === "phone-unmatched"
      ? "O número do chat foi normalizado, mas não existe uma sequência de dígitos igual no CSV importado."
      : participant.member
        ? `Contacto associado: ${participant.member.name} · ${localPhoneNumber(participant.member.phone)}`
        : "Este remetente tem uma associação telefónica guardada para futuras importações.");
  const rows = visibleRecords
    .map((record) => `<tr><td class="thumbnail-cell"><a href="${escapeHtml(mediaUrl(record.filename))}" target="_blank" rel="noreferrer" title="Abrir ${escapeHtml(record.filename)}">${record.mediaType === "video" ? `<video class="detail-thumbnail" src="${escapeHtml(mediaUrl(record.filename))}" muted preload="metadata" aria-label="${escapeHtml(record.filename)}"></video>` : `<img class="detail-thumbnail" src="${escapeHtml(mediaUrl(record.filename))}" alt="${escapeHtml(record.filename)}" loading="lazy" decoding="async" />`}</a></td><td>${escapeHtml(record.timestamp ? formatDate(record.timestamp) : record.dateText)}</td><td class="bucket-cell">${escapeHtml(record.timestamp ? formatTime(record.timestamp, record.timeText) : record.timeText)}</td><td class="filename-cell" title="${escapeHtml(record.filename)}">${escapeHtml(record.filename)}</td><td class="bucket-cell">${escapeHtml(formatBucketLabel(record.dayKey, true))}</td></tr>`)
    .join("");
  const dayRows = dailyTotals.slice(0, 10)
    .map(({ dayKey, count }) => `<div class="day-total-row"><div><p>${escapeHtml(formatBucketLabel(dayKey, true))}</p><span>08:00 → next day 08:00</span></div><strong>${formatNumber(count)}</strong></div>`)
    .join("");

  dom.detailMount.innerHTML = `
    <button class="detail-back" data-action="navigate" data-view="participants">${icon("chevron-left")} Voltar aos participantes</button>
    <div class="detail-heading"><div class="detail-person"><div><p class="eyebrow">Detalhe do participante</p><h1 id="detail-title">${escapeHtml(publicParticipantName(participant))}</h1>${PRIVATE_ADMIN ? `<p>${escapeHtml(formatIdentitySubtitle(participant))}</p>${statusHtml(participant)}` : ""}</div></div><div class="detail-total"><span>Finos</span><strong>${formatNumber(participant.count)}</strong></div></div>
    <div class="detail-streak-strip">
      <div class="detail-streak-card"><span>Streak atual</span>${streakValueHtml(insight.currentStreak)}<small>até ${escapeHtml(getLatestDayKey() ? formatBucketLabel(getLatestDayKey(), true) : "ao último dado")}</small></div>
      <div class="detail-streak-card"><span>Melhor streak</span><strong class="detail-streak-number">+${formatNumber(insight.allTimeStreak)}</strong><small>dias consecutivos no arquivo</small></div>
      <div class="detail-streak-card"><span>Melhor dia</span><strong class="detail-streak-number">${formatNumber(insight.bestDay?.count || 0)}</strong><small>${escapeHtml(insight.bestDay ? formatBucketLabel(insight.bestDay.dayKey, true) : "sem período")}</small></div>
    </div>
    <div class="detail-grid">
      <section class="detail-log-card"><div class="detail-card-header"><div><h2>Envios originais</h2><p>Cada linha corresponde a um ficheiro de media contado.</p></div><span class="mono-note">${formatNumber(participant.count)} total</span></div><div class="table-scroll"><table class="detail-log-table"><thead><tr><th>Media</th><th>Data</th><th>Hora</th><th>Nome original</th><th>Período das 08:00</th></tr></thead><tbody>${rows}</tbody></table></div><div class="pagination"><p>A mostrar ${formatNumber(start + 1)}–${formatNumber(Math.min(start + pageSize, sortedRecords.length))} de ${formatNumber(sortedRecords.length)}</p><div class="pagination-actions"><button class="icon-button" data-action="detail-page" data-page="${appState.detailPage - 1}" aria-label="Página anterior" ${appState.detailPage <= 1 ? "disabled" : ""}>${icon("chevron-left")}</button><button class="icon-button" data-action="detail-page" data-page="${appState.detailPage + 1}" aria-label="Página seguinte" ${appState.detailPage >= totalPages ? "disabled" : ""}>${icon("arrow-right")}</button></div></div></section>
      <aside><section class="detail-days-card"><div class="detail-card-header"><div><h2>Finos por dia</h2><p>O mesmo limite das 08:00, por remetente.</p></div></div><div class="detail-days-list">${dayRows || `<div class="empty-state"><p>Não há registos datados válidos.</p></div>`}</div>${dailyTotals.length > 10 ? `<div class="table-footer"><span>A mostrar os 10 períodos mais recentes</span><span>${formatNumber(dailyTotals.length)} no total</span></div>` : ""}</section>${PRIVATE_ADMIN ? `<div class="detail-contact-card"><h3>${participant.matchStatus === "name-only" ? "Nome identificado, telefone pendente" : "Resolução de identidade"}</h3><p>${escapeHtml(contactDescription)}</p></div>` : ""}</aside>
    </div>`;
}

function mediaUrl(filename) {
  const encodedFilename = encodeURIComponent(filename);
  if (!MEDIA_BASE_URL) return encodedFilename;
  return `${MEDIA_BASE_URL.replace(/\/+$/, "")}/${encodedFilename}`;
}

function reviewDecisionLabel(decision) {
  if (decision === "beer") return "Contar como fino";
  if (decision === "non-beer") return "Não é fino";
  if (decision === "duplicate") return "Duplicado";
  return "Por confirmar";
}

function isPendingDuplicateCandidate(record) {
  return Boolean(record.duplicateCandidate) && !appState.reviewDecisions[record.id];
}

function getDuplicateGroups() {
  const groups = new Map();
  appState.photoCandidates.forEach((record) => {
    if (!record.duplicateGroupId) return;
    if (!groups.has(record.duplicateGroupId)) groups.set(record.duplicateGroupId, []);
    groups.get(record.duplicateGroupId).push(record);
  });
  return groups;
}

function getFilteredReviewCandidates() {
  const query = normalizeName(appState.reviewSearch);
  return appState.photoCandidates.filter((record) => {
    const decision = appState.reviewDecisions[record.id] || null;
    const matchesQuery = !query || normalizeName(`${record.filename} ${record.displayName} ${record.phone}`).includes(query);
    if (!matchesQuery) return false;
    if (decision === "duplicate" || decision === "non-beer") return false;
    if (appState.reviewFilter === "pending") return !decision;
    if (appState.reviewFilter === "duplicates") return Boolean(record.duplicateGroupId || record.duplicateCandidate);
    if (appState.reviewFilter === "duplicate") return decision === "duplicate";
    if (appState.reviewFilter === "reviewed") return Boolean(decision);
    if (appState.reviewFilter === "beer") return decision === "beer";
    if (appState.reviewFilter === "non-beer") return decision === "non-beer";
    return true;
  });
}

function getCurrentReviewPageRecords() {
  const filtered = getFilteredReviewCandidates();
  const start = (appState.reviewPage - 1) * REVIEW_PAGE_SIZE;
  return filtered.slice(start, start + REVIEW_PAGE_SIZE);
}

function collectReviewMedia() {
  return new Map(
    [...dom.reviewMount.querySelectorAll(".review-card[data-id]")]
      .map((card) => [card.dataset.id, card.querySelector("img, video")])
      .filter(([, media]) => media),
  );
}

function hydrateReviewMedia(previousMedia) {
  reviewMediaObserver?.disconnect();
  reviewMediaObserver = null;
  const grid = dom.reviewMount.querySelector(".review-grid");
  if (!grid) return;

  const deferredMedia = [];
  grid.querySelectorAll(".review-card[data-id]").forEach((card) => {
    const media = card.querySelector("img, video");
    const previousMediaElement = previousMedia.get(card.dataset.id);
    if (!media) return;
    if (previousMediaElement) {
      media.replaceWith(previousMediaElement);
      return;
    }
    if (media.dataset.src) deferredMedia.push(media);
  });

  const activate = (media, observer) => {
    if (!media.dataset.src) return;
    media.src = media.dataset.src;
    media.removeAttribute("data-src");
    observer?.unobserve(media);
    if (media.tagName === "VIDEO") media.load();
  };

  if (typeof window.IntersectionObserver !== "function") {
    deferredMedia.forEach((media) => activate(media, null));
    return;
  }

  const observer = new window.IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) activate(entry.target, observer);
    });
  }, { rootMargin: "240px" });
  reviewMediaObserver = observer;
  deferredMedia.forEach((media) => observer.observe(media));
}

function renderReview() {
  if (!appState.photoCandidates.length) {
    dom.reviewMount.innerHTML = emptyStateHtml("Ainda não há media para auditar.", "Os ficheiros de media do repositório aparecem aqui depois de o chat ser carregado.");
    return;
  }

  const previousMedia = collectReviewMedia();
  const filtered = getFilteredReviewCandidates();
  const totalPages = Math.max(1, Math.ceil(filtered.length / REVIEW_PAGE_SIZE));
  appState.reviewPage = Math.min(Math.max(1, appState.reviewPage), totalPages);
  const start = (appState.reviewPage - 1) * REVIEW_PAGE_SIZE;
  const visible = filtered.slice(start, start + REVIEW_PAGE_SIZE);
  const pendingVisible = visible.filter((record) => !appState.reviewDecisions[record.id]);
  const reviewed = appState.photoCandidates.filter((record) => appState.reviewDecisions[record.id]).length;
  const duplicates = appState.photoCandidates.filter(isPendingDuplicateCandidate).length;
  const confirmedDuplicates = appState.photoCandidates.filter((record) => appState.reviewDecisions[record.id] === "duplicate").length;
  const nonBeers = appState.photoCandidates.filter((record) => appState.reviewDecisions[record.id] === "non-beer").length;
  const duplicateGroups = getDuplicateGroups();

  const cards = visible.map((record) => {
    const decision = appState.reviewDecisions[record.id] || null;
    const groupMembers = record.duplicateGroupId ? duplicateGroups.get(record.duplicateGroupId) || [] : [];
    const duplicatePartner = groupMembers.find((member) => member.id !== record.id);
    const duplicateRole = record.duplicateCandidate
      ? record.duplicateReason === "same-filename"
        ? "Candidato a duplicado · nome de ficheiro repetido"
        : record.duplicateReason === "within-two-minutes-and-same-filename"
          ? "Candidato a duplicado · tempo e nome repetidos"
          : record.duplicateReason === "within-two-minutes"
            ? "Candidato a duplicado · dentro de dois minutos"
            : "Candidato a duplicado automático"
      : record.duplicateGroupId
        ? "Original de um par automático"
        : "";
    const partnerNote = duplicatePartner ? ` · par: ${duplicatePartner.filename}` : "";
    const defaultNote = duplicateRole ? `${duplicateRole}${partnerNote}` : "Incluído por defeito";
    const decisionNote = decision ? `Decisão guardada: ${reviewDecisionLabel(decision)}${partnerNote}` : defaultNote;
    const stateLabel = decision ? reviewDecisionLabel(decision) : duplicateRole || reviewDecisionLabel(null);
    const stateClass = decision === "beer" ? "review-state-beer" : decision === "non-beer" ? "review-state-non-beer" : decision === "duplicate" || record.duplicateGroupId || record.duplicateCandidate ? "review-state-duplicate" : "review-state-pending";
    const preview = record.mediaType === "video"
      ? `<video class="review-media" data-src="${escapeHtml(mediaUrl(record.filename))}" aria-label="Pré-visualização de ${escapeHtml(record.filename)}" controls preload="none"></video>`
      : `<img class="review-media" data-src="${escapeHtml(mediaUrl(record.filename))}" alt="Pré-visualização de ${escapeHtml(record.filename)}" loading="lazy" decoding="async" />`;
    return `<article class="review-card ${stateClass}" data-id="${escapeHtml(record.id)}">
      <div class="review-image-wrap">${preview}<span class="review-state">${escapeHtml(stateLabel)}</span></div>
      <div class="review-card-body"><div class="review-card-meta"><strong>${escapeHtml(record.filename)}</strong><span>${escapeHtml(record.dateText)} · ${escapeHtml(record.timeText)}</span></div><p>${escapeHtml(record.displayName)} · ${escapeHtml(decisionNote)}</p><div class="review-actions"><button class="review-action review-action-beer" data-action="review-decision" data-id="${escapeHtml(record.id)}" data-decision="beer">Fino</button><button class="review-action review-action-non-beer" data-action="review-decision" data-id="${escapeHtml(record.id)}" data-decision="non-beer">Não é fino</button><button class="review-action review-action-duplicate" data-action="review-decision" data-id="${escapeHtml(record.id)}" data-decision="duplicate">Duplicado</button>${decision ? `<button class="review-clear" data-action="review-decision" data-id="${escapeHtml(record.id)}" data-decision="">Limpar</button>` : ""}</div></div>
    </article>`;
  }).join("");

  dom.reviewMount.innerHTML = `<div class="review-summary"><div><span>Finos contados</span><strong>${formatNumber(appState.stats.dedupedCount)}</strong></div><div><span>Media pendente</span><strong>${formatNumber(appState.photoCandidates.length - reviewed)}</strong></div><div><span>Candidatos a duplicado</span><strong>${formatNumber(duplicates)}</strong></div><div><span>Duplicados confirmados</span><strong>${formatNumber(confirmedDuplicates)}</strong></div><div><span>Excluídas como não fino</span><strong>${formatNumber(nonBeers)}</strong></div></div><div class="review-toolbar"><div><h2>Fila de auditoria</h2><p>Modo rápido: pode marcar os ficheiros desta página como finos antes de avançar. Os ficheiros já vistos não são recarregados.</p></div><div class="review-tools"><div class="search-wrap"><label for="reviewSearch">Procurar ficheiro ou remetente</label>${icon("search")}<input id="reviewSearch" type="search" value="${escapeHtml(appState.reviewSearch)}" placeholder="IMG-/VID-... ou nome" /></div><select class="sort-select" id="reviewFilter" aria-label="Filtrar auditoria"><option value="pending" ${appState.reviewFilter === "pending" ? "selected" : ""}>Pendentes</option><option value="duplicates" ${appState.reviewFilter === "duplicates" ? "selected" : ""}>Pares candidatos a duplicado</option><option value="duplicate" ${appState.reviewFilter === "duplicate" ? "selected" : ""}>Marcadas como duplicado</option><option value="reviewed" ${appState.reviewFilter === "reviewed" ? "selected" : ""}>Com decisão</option><option value="beer" ${appState.reviewFilter === "beer" ? "selected" : ""}>Marcadas como fino</option><option value="non-beer" ${appState.reviewFilter === "non-beer" ? "selected" : ""}>Marcadas como não fino</option><option value="all" ${appState.reviewFilter === "all" ? "selected" : ""}>Todas</option></select><button class="button button-primary review-bulk-button" data-action="review-bulk-beer" title="Marcar o media pendente desta página como fino" ${pendingVisible.length ? "" : "disabled"}>${icon("check")} Marcar media como finos</button><button class="button button-outline" data-action="export-review">${icon("file")} Exportar decisões</button></div></div><div class="review-grid">${cards || `<div class="empty-state"><p>Não há media neste filtro.</p></div>`}</div><div class="review-pagination"><p>A mostrar ${formatNumber(filtered.length ? start + 1 : 0)}–${formatNumber(Math.min(start + REVIEW_PAGE_SIZE, filtered.length))} de ${formatNumber(filtered.length)} ficheiros de media</p><div class="pagination-actions"><button class="icon-button" data-action="review-page" data-page="${appState.reviewPage - 1}" aria-label="Página anterior" ${appState.reviewPage <= 1 ? "disabled" : ""}>${icon("chevron-left")}</button><span>Página ${formatNumber(appState.reviewPage)} de ${formatNumber(totalPages)}</span><button class="icon-button" data-action="review-page" data-page="${appState.reviewPage + 1}" aria-label="Página seguinte" ${appState.reviewPage >= totalPages ? "disabled" : ""}>${icon("arrow-right")}</button></div></div>`;
  hydrateReviewMedia(previousMedia);
}

function renderImportsStatus() {
  if (!dom.importsStatus) return;
  if (!appState.records.length && appState.mode !== "imported") {
    dom.importsStatus.innerHTML = `<div class="import-status-head"><div><h2>Ainda não foi importado nada</h2><p>A demonstração está visível no painel; a sua primeira importação .txt irá substituí-la.</p></div><span class="file-badge">${icon("file")} a aguardar</span></div><div class="import-status-grid"><div class="import-status-metric"><span>Ficheiros de media</span><strong>—</strong></div><div class="import-status-metric"><span>Finos contados</span><strong>—</strong></div><div class="import-status-metric"><span>Contactos carregados</span><strong>${formatNumber(appState.contacts.length)}</strong></div></div>`;
    return;
  }
  const imported = appState.mode === "imported";
  dom.importsStatus.innerHTML = `<div class="import-status-head"><div><h2>${imported ? "Registo atual" : "Demonstração"}</h2><p>${escapeHtml(appState.importMeta.chatFileName || "Nenhum ficheiro de chat")}${appState.importMeta.importedAt ? ` · processado em ${escapeHtml(formatDate(appState.importMeta.importedAt))}` : ""}</p></div><span class="file-badge">${icon("check")} ${imported ? "processado" : "pré-visualização"}</span></div><div class="import-status-grid"><div class="import-status-metric"><span>Ficheiros de media encontrados</span><strong>${formatNumber(appState.stats.rawPhotoCount)}</strong></div><div class="import-status-metric"><span>Contados após deduplicação</span><strong>${formatNumber(appState.stats.dedupedCount)}</strong></div><div class="import-status-metric"><span>Contactos carregados</span><strong>${formatNumber(appState.contacts.length)}</strong></div></div><div class="import-status-foot"><span class="status-pulse"></span><span>${imported ? "Guardado localmente neste navegador. Uma nova exportação substitui este registo e recalcula todas as classificações." : "Esta demonstração permite explorar o registo antes de importar o seu arquivo."}</span></div>`;
}

function renderTopbarAndSidebar() {
  const total = appState.stats.dedupedCount;
  const progress = Math.min(100, (total / TARGET_BEERS) * 100);
  const unmatchedCount = getUnmatchedParticipants().length;
  const navTotal = document.getElementById("navTotal");
  const navParticipants = document.getElementById("navParticipants");
  const navReview = document.getElementById("navReview");
  const sidebarTotal = document.getElementById("sidebarTotal");
  const sidebarProgress = document.getElementById("sidebarProgress");
  const sidebarPercent = document.getElementById("sidebarPercent");
  const sidebarStatus = document.getElementById("sidebarStatus");
  const topbarStatus = document.getElementById("topbarStatus");
  const unmatchedCountNode = document.getElementById("unmatchedCount");

  if (navTotal) navTotal.textContent = formatNumber(total);
  if (navParticipants) navParticipants.textContent = String(appState.participants.length).padStart(2, "0");
  if (navReview) navReview.textContent = appState.photoCandidates.length ? String(appState.photoCandidates.filter((record) => !appState.reviewDecisions[record.id]).length) : "—";
  if (sidebarTotal) sidebarTotal.textContent = formatNumber(total);
  if (sidebarProgress) sidebarProgress.style.width = `${Math.max(0.42, progress)}%`;
  if (sidebarPercent) sidebarPercent.textContent = `${formatPercent(progress)}%`;
  if (sidebarStatus) sidebarStatus.textContent = appState.mode === "imported"
    ? "Registo público atualizado"
    : "Demonstração carregada";
  if (topbarStatus) topbarStatus.textContent = appState.mode === "imported" ? `${formatNumber(total)} finos registados` : `Demonstração · ${formatNumber(total)} finos`;
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
  renderStats();
  renderDaily();
  renderWeekly();
  renderParticipants();
  if (appState.currentView === "audit") renderReview();
  renderImportsStatus();
  if (appState.currentView === "detail") renderDetail();
}

function navigate(view) {
  const allowed = PRIVATE_ADMIN ? ["overview", "stats", "daily", "weekly", "participants", "audit", "imports", "detail"] : ["overview", "stats", "daily", "weekly", "participants", "detail"];
  if (!allowed.includes(view)) view = PRIVATE_ADMIN ? "audit" : "overview";
  appState.currentView = view;
  if (view !== "detail") appState.selectedParticipant = view === "participants" ? appState.selectedParticipant : appState.selectedParticipant;
  dom.sidebar?.classList.remove("is-open");
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
    dom.mapperMount.innerHTML = `<div class="mapper-empty">Não há nomes guardados à espera de associação. Os remetentes com telefone são associados automaticamente pelos dígitos normalizados.</div>`;
    return;
  }
  const contactOptions = appState.contacts.filter((contact) => contact.phone).map((contact) => `<option value="${escapeHtml(contact.phone)}">${escapeHtml(contact.name)} · ${escapeHtml(localPhoneNumber(contact.phone))}</option>`).join("");
  dom.mapperMount.innerHTML = people.map((participant) => {
    const currentMapping = appState.manualMappings[participant.senderKey] || "";
    const matchingContact = appState.contacts.find((contact) => contact.phone === normalizePhone(currentMapping));
    return `<div class="mapping-row"><div class="mapping-person"><strong>${escapeHtml(participant.displayName)}</strong><span>${formatNumber(participant.count)} finos · ${participant.matchStatus === "name-only" ? "pendente" : "associação guardada"}</span></div><div class="mapping-control"><label for="map-${escapeHtml(participant.id)}">Associar a contacto</label><select id="map-${escapeHtml(participant.id)}" data-map-key="${escapeHtml(participant.senderKey)}"><option value="">Manter apenas como nome</option>${contactOptions}</select><input type="tel" value="${matchingContact ? "" : escapeHtml(currentMapping)}" data-map-phone="${escapeHtml(participant.senderKey)}" placeholder="Ou introduza os dígitos do telefone" /></div></div>`;
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
  showToast("Associações guardadas para futuras importações.");
}

let persistAppStateTimer = null;
let reviewMediaObserver = null;
let streakAnalyticsCache = null;

function schedulePersistAppState() {
  window.clearTimeout(persistAppStateTimer);
  persistAppStateTimer = window.setTimeout(() => {
    persistAppStateTimer = null;
    persistAppState();
  }, 300);
}

function finishReviewMutation(render = true) {
  applyReviewDecisions();
  refreshDerived();
  schedulePersistAppState();
  if (!render) return;

  if (appState.currentView === "audit") {
    renderTopbarAndSidebar();
    renderReview();
  } else {
    renderAll();
  }
}

function bulkSetReviewDecisions(ids, decision, { render = true } = {}) {
  ids.forEach((id) => {
    if (decision) appState.reviewDecisions[id] = decision;
    else delete appState.reviewDecisions[id];
  });
  persistReviewDecisions();
  finishReviewMutation(render);
}

function setReviewDecision(id, decision) {
  bulkSetReviewDecisions([id], decision);
}

function reviewConfirm(message) {
  return typeof window.confirm === "function" ? window.confirm(message) : true;
}

function markCurrentReviewPageAsBeer() {
  const targets = getCurrentReviewPageRecords().filter((record) => !appState.reviewDecisions[record.id]);
  if (!targets.length) {
    showToast("Não há ficheiros de media pendentes nesta página.");
    return;
  }

  const duplicateCount = targets.filter((record) => record.duplicateCandidate).length;
  const duplicateNote = duplicateCount
    ? `\n\nA seleção inclui ${duplicateCount} candidato${duplicateCount === 1 ? "" : "s"} a duplicado; marcá-lo${duplicateCount === 1 ? "" : "s"} como fino substitui a deduplicação automática.`
    : "";
  if (!reviewConfirm(`Marcar ${targets.length} ficheiros de media desta página como finos?${duplicateNote}`)) return;

  bulkSetReviewDecisions(targets.map((record) => record.id), "beer");
  showToast(`<strong>${formatNumber(targets.length)} ficheiros de media marcados como finos.</strong> A página foi preenchida com o próximo lote pendente.`);
}

function goToReviewPage(page) {
  const targetPage = Number(page) || 1;
  const currentPage = appState.reviewPage;
  if (targetPage > currentPage) {
    const targets = getCurrentReviewPageRecords().filter((record) => !appState.reviewDecisions[record.id]);
    if (targets.length) {
      const duplicateCount = targets.filter((record) => record.duplicateCandidate).length;
      const duplicateNote = duplicateCount
        ? `\n\nInclui ${duplicateCount} candidato${duplicateCount === 1 ? "" : "s"} a duplicado.`
        : "";
      const markAsBeer = reviewConfirm(`Esta página tem ${targets.length} ficheiros de media sem decisão. Quer marcá-los todos como finos antes de avançar?\n\nSim: marcar como fino e continuar.\nNão: avançar sem alterar.${duplicateNote}`);
      if (markAsBeer) {
        bulkSetReviewDecisions(targets.map((record) => record.id), "beer", { render: false });
        // Pending and duplicate queues refill the current page after removal;
        // other filters keep the normal next-page behaviour.
        appState.reviewPage = ["pending", "duplicates"].includes(appState.reviewFilter) ? currentPage : targetPage;
        renderTopbarAndSidebar();
        renderReview();
        showToast(`<strong>${formatNumber(targets.length)} ficheiros de media marcados como finos.</strong> A mostrar o próximo lote pendente.`);
        return;
      }
    }
  }

  appState.reviewPage = targetPage;
  renderReview();
}

function exportReviewDecisions() {
  const payload = JSON.stringify({ version: 1, decisions: appState.reviewDecisions }, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = REPOSITORY_REVIEW_FILE;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Decisões exportadas. Pode substituir o review-decisions.json no repositório.");
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
    appState.photoCandidates = parsed.photoRecords;
    appState.records = parsed.records;
    appState.latestDataTimestamp = parsed.latestTimestamp;
    appState.chatMessages = [];
    appState.stats = {
      rawPhotoCount: parsed.rawPhotoCount,
      rawImageCount: parsed.rawImageCount,
      rawVideoCount: parsed.rawVideoCount,
      omittedMediaCount: parsed.omittedMediaCount,
      dedupedCount: parsed.dedupedCount,
      duplicateCount: parsed.duplicateCount,
    };
    applyReviewDecisions();
    appState.importMeta.chatFileName = file.name;
    appState.importMeta.importedAt = new Date();
    appState.justImported = true;
    appState.selectedParticipant = null;
    appState.detailPage = 1;
    appState.selectedDay = null;
    appState.selectedWeek = null;
    refreshDerived();
    persistAppState();
    navigate("overview");
    showToast(`<strong>${formatNumber(appState.stats.dedupedCount)} finos contados.</strong> ${formatNumber(appState.stats.duplicateCount)} candidato${appState.stats.duplicateCount === 1 ? "" : "s"} a duplicado removido${appState.stats.duplicateCount === 1 ? "" : "s"}.`);
  } catch (error) {
    showToast("Não foi possível ler essa exportação. Confirme que é um ficheiro .txt UTF-8.");
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
    const [chatResponse, contactsResponse, reviewResponse] = await Promise.all([
      fetch(encodeURI(REPOSITORY_CHAT_FILE), { cache: "no-store" }),
      fetch(REPOSITORY_CONTACTS_FILE, { cache: "no-store" }),
      fetch(REPOSITORY_REVIEW_FILE, { cache: "no-store" }),
    ]);
    if (!chatResponse.ok) return;

    if (reviewResponse.ok) {
      const reviewPayload = await reviewResponse.json();
      const repositoryDecisions = reviewPayload?.decisions || reviewPayload;
      if (repositoryDecisions && typeof repositoryDecisions === "object") {
        appState.reviewDecisions = PRIVATE_ADMIN
          ? { ...repositoryDecisions, ...appState.reviewDecisions }
          : repositoryDecisions;
      }
    }
    migrateFilenameDuplicateDecisions();

    const chatText = await chatResponse.text();
    const parsed = parseWhatsAppChat(chatText);
    appState.mode = "imported";
    appState.photoCandidates = parsed.photoRecords;
    appState.records = parsed.records;
    appState.latestDataTimestamp = parsed.latestTimestamp;
    appState.chatMessages = [];
    appState.stats = {
      rawPhotoCount: parsed.rawPhotoCount,
      rawImageCount: parsed.rawImageCount,
      rawVideoCount: parsed.rawVideoCount,
      omittedMediaCount: parsed.omittedMediaCount,
      dedupedCount: parsed.dedupedCount,
      duplicateCount: parsed.duplicateCount,
    };
    applyReviewDecisions();
    appState.importMeta.chatFileName = REPOSITORY_CHAT_FILE;
    appState.importMeta.importedAt = new Date();
    appState.justImported = false;
    appState.selectedParticipant = null;
    appState.detailPage = 1;
    appState.selectedDay = null;
    appState.selectedWeek = null;

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
  } else if (action === "review-decision") {
    event.preventDefault();
    setReviewDecision(trigger.dataset.id, trigger.dataset.decision || null);
  } else if (action === "review-page") {
    event.preventDefault();
    if (trigger.disabled) return;
    goToReviewPage(trigger.dataset.page);
  } else if (action === "review-bulk-beer") {
    event.preventDefault();
    if (trigger.disabled) return;
    markCurrentReviewPageAsBeer();
  } else if (action === "export-review") {
    event.preventDefault();
    exportReviewDecisions();
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
  } else if (event.target.id === "weekSelect") {
    appState.selectedWeek = event.target.value;
    renderWeekly();
  } else if (event.target.id === "participantSort") {
    appState.participantSort = event.target.value;
    renderParticipants();
  } else if (event.target.id === "reviewFilter") {
    appState.reviewFilter = event.target.value;
    appState.reviewPage = 1;
    renderReview();
  }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "participantSearch") {
    appState.participantSearch = event.target.value;
    const body = document.getElementById("participantsTableBody");
    if (body) body.innerHTML = renderParticipantRows();
  } else if (event.target.id === "reviewSearch") {
    appState.reviewSearch = event.target.value;
    appState.reviewPage = 1;
    const caret = event.target.selectionStart;
    renderReview();
    const search = document.getElementById("reviewSearch");
    if (search) {
      search.focus();
      search.setSelectionRange(caret, caret);
    }
  }
});

dom.mapperDialog?.addEventListener("click", (event) => {
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
loadRepositorySources();

// Kept available for lightweight console/fixture checks without exposing any
// data outside the page.
window.UmMilhaoDeFinos = {
  parseWhatsAppChat,
  parseContactsCsv,
  normalizePhone,
  dailyBucketKey,
  weekStartKey,
  getDailyWinners,
  getDailyWinnerRankings,
  getWeeklyWinners,
  getWeeklyHighscores,
  exportReviewDecisions,
  get state() {
    return appState;
  },
};
