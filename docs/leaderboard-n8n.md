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

Mode: **Run Once for Each Item**. Adjust the three `$json.body…` paths to the fields your GHL webhook
actually sends (open one execution to check).

```js
// ---- map these to your GHL webhook payload ----
const leadId     = String($json.body.contact_id ?? $json.body.id ?? '').trim();
const senderName = String($json.body.sender_name ?? $json.body.user?.name ?? '').trim();
const locationId = String($json.body.location?.id ?? $json.body.location_id ?? '');
// ------------------------------------------------

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

if (!leadId) throw new Error('No lead/contact ID in the webhook payload');
const docId = leadId.replace(/\//g, '_');           // document IDs can't contain "/"
const day = businessDayKey(new Date());
const senderKey = senderKeyOf(senderName);
const str = (v) => ({ stringValue: String(v) });

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

return { json: { leadId, senderName, senderKey, day, body } };
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

1. Send one test lead in GHL. Within a few seconds `leadSendEvents/{leadId}` exists and
   `leadDailyCounts/{today}.counts.s_<name>` is `1`. The leaderboard updates live.
2. Re-run the same execution in n8n: you get `409`, and the count stays `1`.
3. If the sender's GHL name isn't linked to a CRM user yet, it appears under
   **Leaderboard → Settings → Unmatched senders**. Link it and the leads count immediately.

## Indexes

None needed. The app only runs single-field range queries (`day >= startKey`) on `leadDailyCounts`
and `leadAdjustments`, which Firestore indexes automatically.
