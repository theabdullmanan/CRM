# Senders Leaderboard: n8n setup

n8n catches the GoHighLevel webhook for every lead sent and records it in Firestore with **one atomic
commit**. No Cloud Functions are involved, so the project stays on the free Spark plan.

```
GHL webhook ─▶ Code node (compute keys + commit body) ─▶ HTTP Request (Firestore commit) ─▶ IF 409 → duplicate, ignore
```

Each lead does two things in the same commit. Both happen, or neither does:

| Write | Document | What it does |
|---|---|---|
| 1 | `leadSendEvents/{leadId}` | Creates the event. Precondition `exists: false`, so a webhook retry for the same lead fails the whole commit and nothing is counted twice. `sentAt` is the server's `REQUEST_TIME`. |
| 2 | `leadDailyCounts/{businessDayKey}` | `counts.{senderKey}` +1 (`increment`), `last.{senderKey}` = `REQUEST_TIME`, plus `day` and `names.{senderKey}` (the GHL name, so admins can see unmatched names). Created automatically on the first lead of the day. |

## 1. Credential (Google Service Account)

1. In Google Cloud Console → IAM → Service accounts, create a service account (or reuse the one n8n uses for `dashboard/latest`).
2. Give it the role **Cloud Datastore User** (`roles/datastore.user`). Nothing broader is needed.
3. Create a JSON key for it.
4. In n8n, add a **Google Service Account API** credential:
   - Service Account Email and Private Key from the JSON key
   - Turn on **"Set up for use in HTTP Request node"**
   - **Scopes:** `https://www.googleapis.com/auth/datastore`

Service-account writes bypass Firestore security rules, which is why the rules block every browser
from writing `leadSendEvents` and `leadDailyCounts`. Only n8n can add leads.

## 2. Code node ("Build lead commit")

Mode: **Run Once for All Items**. Adjust the `body…` paths in `fieldsOf` to the fields your GHL webhook
actually sends (open one execution to check).

**Only contacts tagged `lead` are counted.** The match ignores case and spaces, so `Lead` and
` LEAD ` count, but `leads` or `cold lead` don't. Any contact without the tag is dropped here:
nothing is written to Firestore and nothing reaches the leaderboard. The contact's tags are also
saved on its `leadSendEvents` document, so you can check why a lead was counted.

If the tag is often added *after* the contact is created, trigger the GHL workflow on
**Contact Tag → Added → `lead`**. The `leadId` precondition still stops a contact from being counted twice.

```js
const LEAD_TAG = 'lead'; // same as LEAD_TAG in src/lib/leaderboard.js

// ---- map these to your GHL webhook payload ----
function fieldsOf(body) {
  return {
    leadId:     String(body.contact_id ?? body.id ?? '').trim(),
    senderName: String(body.sender_name ?? body.user?.name ?? '').trim(),
    locationId: String(body.location?.id ?? body.location_id ?? ''),
    rawTags:    body.tags ?? body.contact?.tags ?? [],   // array, or "a, b, c" string
  };
}
// ------------------------------------------------

const tagsOf = (raw) => (Array.isArray(raw) ? raw : String(raw || '').split(','))
  .map((t) => String(t).trim().toLowerCase()).filter(Boolean);

const PROJECT = 'whitestone-media-llc';
const DB = `projects/${PROJECT}/databases/(default)/documents`;
const TZ = 'America/Chicago';

// Same rules as src/lib/businessDay.js: Mon–Fri start 8:00, Sat 9:00 (Central);
// Sunday and anything before the start hour belong to the previous business day.
const startHourFor = (dow) => (dow === 0 ? null : dow === 6 ? 9 : 8);
const dowOf = ([y, m, d]) => new Date(Date.UTC(y, m, d)).getUTCDay();
const shift = ([y, m, d], n) => { const t = new Date(Date.UTC(y, m, d + n)); return [t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()]; };
function businessDayKey(at = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(at).map((x) => [x.type, x.value]));
  let date = [+p.year, +p.month - 1, +p.day];
  const h = startHourFor(dowOf(date));
  if (h === null || +p.hour * 60 + +p.minute < h * 60) {
    do date = shift(date, -1); while (startHourFor(dowOf(date)) === null);
  }
  return `${date[0]}-${String(date[1] + 1).padStart(2, '0')}-${String(date[2]).padStart(2, '0')}`;
}

// Same as senderKeyOf in src/lib/leaderboard.js: case-insensitive, trimmed, safe field name.
function senderKeyOf(name) {
  const slug = String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `s_${slug || 'unknown'}`;
}

const str = (v) => ({ stringValue: String(v) });

const out = [];
for (const item of $input.all()) {
const { leadId, senderName, locationId, rawTags } = fieldsOf(item.json.body || {});
const tags = tagsOf(rawTags);
if (!tags.includes(LEAD_TAG)) continue;             // not tagged "lead" → not counted

if (!leadId) throw new Error('No lead/contact ID in the webhook payload');
const docId = leadId.replace(/\//g, '_');           // document IDs can't contain "/"
const day = businessDayKey(new Date());
const senderKey = senderKeyOf(senderName);

const body = {
  writes: [
    {
      update: {
        name: `${DB}/leadSendEvents/${docId}`,
        fields: {
          leadId: str(leadId),
          senderName: str(senderName),
          senderKey: str(senderKey),
          locationId: str(locationId),
          day: str(day),
          tags: { arrayValue: { values: tags.map(str) } },
        },
      },
      updateTransforms: [{ fieldPath: 'sentAt', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: false },   // retry of the same lead → whole commit fails, nothing counted
    },
    {
      update: {
        name: `${DB}/leadDailyCounts/${day}`,
        fields: {
          day: str(day),
          names: { mapValue: { fields: { [senderKey]: str(senderName || 'Unknown sender') } } },
        },
      },
      updateMask: { fieldPaths: ['day', `names.${senderKey}`] },
      updateTransforms: [
        { fieldPath: `counts.${senderKey}`, increment: { integerValue: '1' } },
        { fieldPath: `last.${senderKey}`, setToServerValue: 'REQUEST_TIME' },
      ],
    },
  ],
};

out.push({ json: { leadId, senderName, senderKey, day, tags, body } });
}
return out;   // empty when no contact was tagged "lead" → the HTTP node doesn't run
```

## 3. HTTP Request node ("Firestore commit")

| Setting | Value |
|---|---|
| Method | `POST` |
| URL | `https://firestore.googleapis.com/v1/projects/whitestone-media-llc/databases/(default)/documents:commit` |
| Authentication | Predefined Credential Type → **Google Service Account API** (the credential above) |
| Send Body | JSON → `{{ JSON.stringify($json.body) }}` |
| Settings → On Error | **Continue (using error output)** |
| Options → Retry | Keep n8n's retry on for 5xx / network errors. Retries are safe: the precondition stops double counts. |

**Responses**
- `200`: the lead was counted.
- `409 ALREADY_EXISTS`: this lead ID was already recorded (a GHL retry). Nothing was changed. Treat it as success.
- Anything else (`401`/`403` = credential or IAM role, `400` = payload): send yourself an alert.

Add an **IF** node on the error output: `{{ $json.error?.status ?? $json.error?.code }}` equals `409`/`ALREADY_EXISTS` → do nothing; otherwise → alert.

## 4. Checking it works

1. Send one test lead **tagged `lead`** in GHL. Within a few seconds `leadSendEvents/{leadId}` exists and
   `leadDailyCounts/{today}.counts.s_<name>` is `1`. The leaderboard updates live.
2. Re-run the same execution in n8n: you get `409`, and the count stays `1`.
3. Send a contact **without** the `lead` tag: the Code node outputs no items, and nothing changes in Firestore.
4. If the sender's GHL name isn't linked to a CRM user yet, it appears under
   **Leaderboard → Settings → Unmatched senders**. Link it and the leads count immediately.

## Indexes

None needed. The app only runs single-field range queries (`day >= startKey`) on `leadDailyCounts`
and `leadAdjustments`, which Firestore indexes automatically.
