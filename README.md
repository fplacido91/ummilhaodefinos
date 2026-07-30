# Um Milhão de Finos

A browser-only ledger for the WhatsApp beer counter game: one **deduplicated IMG photo message equals one beer**, attributed to the sender of that message.

## Run it

No build step or server is required. Open `index.html` in a modern browser, or serve this folder with any static-file server. The dashboard starts with a clearly labelled demo snapshot so the views are explorable before a real export is selected.

Use **Import chat .txt** (or the Import centre) to select a full WhatsApp export. Use **Contacts CSV** to optionally load the roster. Imports happen locally in the browser; the files are not uploaded anywhere. The latest imported ledger, contact roster, and manual mappings are saved in this browser’s local storage so they survive closing and reopening the same site origin.

## Import contract

The implementation in `app.js` deliberately handles the WhatsApp export edge cases that affect the count:

- Date/time headers are parsed from `DD/MM/YYYY, HH:MM - ...`; continuation lines are attached to the preceding message, so multiline messages do not become senders.
- A beer candidate must match `IMG-[\\w-]+.(jpg|jpeg|png) (file attached)` case-insensitively. Sticker (`STK-`, `.webp`), audio (`.opus`), video (`VID-*`), and other attachment records are ignored.
- WhatsApp can write a photo caption (including a running number) as an un-timestamped continuation line immediately below the attachment line. The parser checks the attachment line itself, so a caption cannot hide a photo; standalone numeric continuation lines are still eligible for the manual-tally sanity check.
- System messages do not have a sender and cannot count, but they remain in message order. Deduplication compares consecutive **photo records**, allowing system notices or captions between them.
- When the same sender posts consecutive photo records in the same calendar date and clock minute, the later records are treated as the same phone/export artifact. A different sender breaks the chain; a later minute also breaks it.
- The dashboard exposes image files before dedupe, counted records after dedupe, and the duplicate difference on every import.
- Bare numeric messages are scanned only for the highest manual group tally. They never affect beer attribution or ranking.
- Daily buckets are calculated from 08:00 to the next day at 08:00. A photo before 08:00 belongs to the previous bucket.
- Raw phone senders are matched to CSV phones by stripping every non-digit character from both values. Saved chat display names are never guessed against CSV names; they are shown as `Name only · unmatched` until manually linked.
- Manual display-name → phone mappings are stored in browser local storage and reused after future full re-imports.
- A new chat file replaces the current parsed records and recomputes all rankings; it is not appended to the old dataset.

## Views

- **Overview** — cumulative total, progress to 1,000,000, post-import sanity check, cumulative leaders, and recent traceable filenames.
- **Daily window** — selectable 08:00-to-08:00 ranking and bar chart.
- **Participants** — searchable/sortable sender list with phone/name identity status.
- **Participant detail** — paginated full beer log with date, time, original filename, bucket, and per-day totals.
- **Import centre** — chat/CSV drop zones and a visible parser rule checklist.

The page also exposes `window.UmMilhaoDeFinos.parseWhatsAppChat` and `.parseContactsCsv` for quick browser-console fixture checks.
