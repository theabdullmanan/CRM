# Ops CRM

A custom CRM (React + Firebase) that replaces the Google Sheets + Slack workflow for zip code management, client spend tracking and team tasks. Built from the November 10 requirements meeting.

## Features → requirements

| Area | What it does | Req. # |
|---|---|---|
| **Role-based access** | Roles: Admin, Manager, CSM, Operations, Data (CJ), Finance. Departments are a separate, editable list (from Sergio). First account to register becomes Admin; everyone else waits for approval. Enforced in the UI **and** in `firestore.rules` / `storage.rules`. | 4–6 |
| **Clients & sub-accounts** | Each client has any number of sub-accounts. Zips, contact sheets and counters are stored per sub-account, so multi-account clients never overwrite each other. | 9, 10 |
| **Zip submission (CSM)** | Paste zips in any format. Live pre-check highlights zips still in cooldown before you submit. On submit, each zip is checked in a **Firestore transaction** against a cooldown lock, so two people submitting the same zip at once can't both get through. Zips that are still in cooldown are saved as *Flagged*, with who used them and when they become eligible again. Managers can override a flag. | 8, 11, 12 |
| **Ops review queue** | Clean, cooldown-checked zips grouped by client › sub-account. Approve, reject (this releases the cooldown and notifies the CSM), copy or export the list, and send it to CJ. | 13 |
| **CJ data requests** | Everyone with the Data role is notified automatically. CJ drags contact sheets (CSV/XLSX) straight into the request (Firebase Storage) and the CRM counts CSV rows. Marking a request delivered updates the zips and the sub-account, then notifies Ops and the CSM. | 14–16 |
| **Revenue dashboard** | Real-time spend for today, the last 7 days, the last 30 days and lifetime, per client and in total. The $300 setup fee is stored as its own payment type and **excluded** from every figure. It also shows a daily trend chart, top clients, high-value tiers, and the actual average monthly spend per client next to the old $500–$1k estimate. You can record payments manually, import a CSV, or log one day's charges for every client from their daily rate (re-running it never double-counts). | 17–24 |
| **Map dashboard** | Embeds the existing map dashboard in an iframe. Paste its URL in Settings. | 25 |
| **Tasks** | Assign tasks with deadlines, a priority and a related client. Overdue alerts go to the assignee, the creator and admins. A Team progress view shows completion rate, overdue count and on-time rate per person. Admins and managers are notified when tasks are completed. | 26–29 |
| **Notifications** | Real-time bell with toasts, plus a full notifications page. | 15, 28, 29 |
| **Activity log** | Managers see a feed of key actions across departments on the dashboard. | — |

## Setup

1. **Create a Firebase project** at https://console.firebase.google.com
   - Authentication → enable **Email/Password**
   - **Firestore Database** → create (production mode)
   - **Storage** → create. New projects need the **Blaze (pay-as-you-go)** plan for Storage. Usage at this scale stays within the free quota.
   - Project settings → **Add web app** → copy the config
2. **Configure env**
   ```bash
   cp .env.example .env.local   # paste your Firebase web config values
   ```
3. **Deploy security rules & indexes**
   ```bash
   npm i -g firebase-tools
   firebase login
   cp .firebaserc.example .firebaserc   # set your project id
   npm run deploy:rules
   ```
4. **Run**
   ```bash
   npm install
   npm run dev
   ```
5. Register the first account (it becomes **Admin**). Go to **Settings** to add departments, set the map URL and optionally **Load demo data**. Then approve teammates under **Users & roles**.

Deploy to Firebase Hosting: `npm run deploy`.

## Data model (Firestore)

| Collection | Purpose |
|---|---|
| `users/{uid}` | name, email, role, department, active |
| `meta/bootstrap` | marks that the first admin exists |
| `settings/app` | cooldownDays (42), cooldownScope, setupFee, daily min/max, highValueMonthly, mapEmbedUrl |
| `departments` | department list |
| `clients` | client profile, daily rate, CSM, setup-fee flag |
| `subAccounts` | per client account; delivery counters |
| `zipSubmissions` | one doc per submitted zip; status `flagged → pending → approved → requested → fulfilled` (or `rejected` / `dismissed`) |
| `zipLocks/{scope}__{zip}` | cooldown lock with `expiresAt`, claimed transactionally |
| `dataRequests` | request to CJ: zips, files[], status |
| `payments` | `type`: `daily` / `adjustment` (count as spend) or `setup_fee` (excluded) |
| `tasks` | assignee, dueDate, priority, status, overdueNotified |
| `notifications` | per-user in-app notifications |
| `activity` | audit feed |

## Open questions for Sergio

- **Cooldown scope.** Should a zip be blocked for 6 weeks for the same **sub-account**, the same **client**, or **all clients**? The default is per sub-account. It can be changed in Settings with no code changes.
- **Departments list.** Add the list in Settings → Departments.
- **Payment source.** Is there a billing system (Stripe, GHL, etc.) to sync daily payments from automatically? Right now payments are entered manually, imported from CSV, or logged from each client's daily rate.
- **Map dashboard URL.** Which embed link should the CRM show?

## Notes

- Overdue alerts and notifications run in the browser (no Cloud Functions required, so it works on any plan). They fire when the assignee, or any admin/manager, has the CRM open. For fully server-side scheduling, a Cloud Function can be added later.
- Firestore offline persistence is on, so the app keeps working through short network drops.
