# MedReady — Implementation Handoff

**Status:** Approved product spec, ready for implementation in Google Antigravity.
**Design source of truth:** The approved Google Stitch design (screens / DESIGN.md /
screenshots). Do not reinterpret or redesign the UX from this document —
this document is functional/technical context, not a visual spec. If the
approved design conflicts with something technical below, or something
below is not achievable in Apps Script/HtmlService, stop and flag it rather
than silently deviating from either.

---

## 1. Product Summary

MedReady is an internal hospital web app connecting inpatient **Ward** staff
and **IPD Pharmacy** staff around discharge medication readiness. Initial
rollout: special/private ward, architected to extend to more wards later.

Tagline: "รู้เมื่อยาเสร็จ ลดเวลารอ เชื่อม Ward กับ Pharmacy"

Core question the product answers: **"ยากลับบ้านของผู้ป่วยรายนี้พร้อมหรือยัง?"**

MedReady is communication + workflow status + timestamps + waiting-time
analytics **only**. It is not a HIS, EMR, e-prescribing, medication
administration, or inventory system, and does not replace HOSxP. Never
store or display medication name, quantity, direction, diagnosis, or
clinical notes.

---

## 2. Technology Constraints (hard requirements)

- Google Apps Script Web App (`doGet` serving an HtmlService template)
- Google Sheets as the database
- Google Drive if/when file storage is needed
- HTML + CSS + vanilla JavaScript, calling the backend via `google.script.run`
- **Do NOT use:** React, Next.js, Firebase, Supabase, PWA features, service
  workers, or a Web App Manifest.

---

## 3. Privacy / Data Model Rules

- Do **not** store patient name or HN.
- Store AN, but mask it in any UI-facing list (e.g. `AN 69•••4438`) — never
  render a fully unmasked AN outside a deliberate, permission-gated view.
- Every case gets a generated **Case ID** (e.g. `MR-0248`) as the primary
  human-facing identifier.
- No medication fields anywhere in the schema.

---

## 4. Authentication & Authorization

- **Sign in with Google** is the only login path — no username/password, no
  self-registration, no guest mode.
- Maintain a **Gmail allowlist** (Sheet-backed) of authorized, active
  accounts. Successful Google auth alone does not grant access — the email
  must be on the allowlist and active.
- Resolve **role** (WARD / PHARMACY / SUPER_ADMIN) and **ward scope**
  server-side from the allowlist. Never trust a client-supplied role.
- Every server-side function re-validates permission (role + ward scope)
  independently of what the client UI shows.

### Roles

| Role | Can | Cannot |
|---|---|---|
| **WARD** (เจ้าหน้าที่ Ward) | Submit case (AN, room/bed, appointment status), monitor pharmacy progress, view READY cases, receive in-app notifications, view timeline | Advance pharmacy workflow state |
| **PHARMACY** (เจ้าหน้าที่ห้องยาผู้ป่วยใน) | View incoming cases, start processing, mark checked/ready, record basket arrival, mark dispensed, monitor SLA, manage issue flags, view analytics | — |
| **SUPER_ADMIN** (optional) | Approve Google accounts, assign role/ward scope, configure SLA thresholds, review login audit | Not part of the normal patient workflow |

---

## 5. State Machine (enforce server-side, exactly)

Strictly sequential — reject any skip or backward transition:

```
SUBMITTED → IN_PROGRESS → READY → BASKET_RECEIVED → DISPENSED
```

| State | Thai label | Progress | Timestamp field | Trigger |
|---|---|---|---|---|
| SUBMITTED | รอห้องยาดำเนินการ | 10% | `submittedAt` | Ward submits case |
| IN_PROGRESS | กำลังเตรียมยา | 45% | `startedAt` | Pharmacy: "เริ่มดำเนินงาน" |
| READY | พร้อมจ่าย | 75% | `readyAt` | Pharmacy: "ตรวจสอบแล้ว • พร้อมจ่าย" |
| BASKET_RECEIVED | รอจ่ายยา | 85% | `basketReceivedAt` | Pharmacy: "รับตะกร้ายากลับบ้าน" |
| DISPENSED | จ่ายยาแล้ว | 100% | `dispensedAt` | Pharmacy: "จ่ายยาแล้ว" |

Every transition is also a Timeline/Audit Log entry (actor, from-state,
to-state, timestamp).

---

## 6. Sheets Schema (implement via an idempotent `setupSystem()`, same
pattern as the med-error-record-app project)

- **Cases** — Case ID, AN (mask at render time), room/bed, appointment
  status, ward scope, current state, `submittedAt`, `startedAt`, `readyAt`,
  `basketReceivedAt`, `dispensedAt`, current SLA snapshot
- **Timeline / Audit Log** — case ID, event, actor, timestamp
- **Issue Flags** — case ID, flag type, actor, timestamp
- **Users / Allowlist** — email, role, ward scope, active flag
- **Settings** — SLA threshold minutes, other admin-configurable values

`setupSystem()` should create/verify all sheets, headers, and (if used)
Drive folders idempotently.

---

## 7. Concurrency & Reliability

- Use `LockService` around any read-modify-write on the Cases sheet,
  especially state transitions, to prevent race conditions from
  simultaneous Ward/Pharmacy actions.
- On write conflict, return a clear conflict signal so the client can show
  the approved message ("รายการนี้ถูกอัปเดตโดยผู้ใช้อื่นแล้ว
  ระบบได้โหลดข้อมูลล่าสุดให้แล้ว") — never a raw error or `alert()`.
- Every `google.script.run` call has a defined success/failure contract the
  client renders against the approved empty/loading/error states.

---

## 8. SLA & Time Metrics

- SLA bands are **configurable** (default 0–30 min ปกติ, 31–45 min ใกล้ SLA,
  >45 min เกิน SLA) — read from Settings, never hardcode 30/45 as literals.
- **Preparation Lead Time** = `readyAt − submittedAt` (also expose the two
  sub-components: `startedAt − submittedAt` and `readyAt − startedAt`)
- **True Patient Waiting Time** = `dispensedAt − basketReceivedAt` — the
  most important patient-facing metric; surface it on case detail,
  completed-case summary, and analytics.

---

## 9. Live Updates & Notifications

- No websockets in Apps Script — implement **polling** for Board/Dashboard
  views and the in-app READY notification, balancing freshness against
  Apps Script quota limits.
- Track notification read/unread state per user.
- Not a PWA — no web push, no install prompt, no offline/service-worker
  behavior.

---

## 10. Role-Based Navigation

| Role | Nav items |
|---|---|
| WARD | Dashboard, ส่งผู้ป่วย, MedReady Board, การแจ้งเตือน |
| PHARMACY | Dashboard, MedReady Board, Analytics |
| SUPER_ADMIN | (adds) User Access, Settings |

Never render an unauthorized nav item, even disabled — omit it, and
re-check permission server-side regardless of what the client requests.

---

## 11. Responsive Implementation

Implement the approved design's responsive behavior faithfully — don't
approximate with pure CSS shrinking:

- Left sidebar (desktop, 1366–1920px) → bottom navigation (mobile)
- Board/table → patient cards
- Right-side detail drawer → full-screen detail
- Primary pharmacy action may become sticky on mobile
- 44px+ touch targets, no horizontal scroll

---

## 12. Implementation Phases (verify each before moving to the next)

- **Phase 0** — Architecture review against this document and the approved design
- **Phase 1** — Project foundation and `setupSystem()` (sheets, headers, folders)
- **Phase 2** — Google authentication, Gmail allowlist, role/ward-scope resolution, server-side authorization checks
- **Phase 3** — Database/backend services (CRUD + state-transition functions, `LockService`, error contracts)
- **Phase 4** — Implement the approved design system / UI shell (use Stitch screens/DESIGN.md as source of truth — do not invent a generic dashboard)
- **Phase 5** — Ward workflow (Send Patient, Ward Dashboard, Board read view)
- **Phase 6** — Pharmacy workflow (state transitions, issue flags, Pharmacy Dashboard, Board actions)
- **Phase 7** — Timeline component and elapsed-time/duration calculations
- **Phase 8** — Notifications (toast, unread badge, notification center) and SLA calculation/display
- **Phase 9** — Analytics screen (Preparation Lead Time, True Patient Waiting Time, SLA breach rates, etc.)
- **Phase 10** — Admin (User Access, Settings/SLA config, login audit)
- **Phase 11** — Responsive/mobile refinement pass against the approved mobile design
- **Phase 12** — Security review, concurrency stress-check, testing, cleanup

---

## 13. Critical Rule

Never invent your own UI if Stitch design assets are available — implement
what was approved. If something in the approved design is technically
infeasible in Apps Script/HtmlService, stop, explain the limitation, and
propose the smallest deviation needed rather than silently redesigning the
screen.

---

## 14. Deliverable

A working Google Apps Script Web App implementing all phases above, backed
by the Sheets schema in §6, visually matching the approved MedReady design
as closely as Apps Script/HtmlService allows.
