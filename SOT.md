# MedReady — Source of Truth (SOT)

This is the canonical reference for data model, business rules, and
terminology. If implementation code and this document ever disagree, **this
document wins** — fix the code, or raise the discrepancy before proceeding.

---

## 1. Identifiers & Privacy Rules

- **Case ID** — generated, e.g. `MR-0248`. Primary human-facing identifier
  everywhere in the UI.
- **AN** — stored, but masked in all routine views: `AN 69•••4438`. Never
  render a fully unmasked AN outside a deliberate, permission-gated view.
- **Patient name / HN** — never stored, never displayed. MVP boundary.
- **Room / bed** — stored and shown plainly, e.g. `ห้อง 305 / เตียง 1`.
- **Medication data** (name, quantity, direction) and **clinical data**
  (diagnosis, notes) — never stored, never collected, anywhere.
- System is **pseudonymized**, not anonymous — never describe it as fully
  anonymous in UI copy or docs, since AN + room/bed remain identifiable
  operational data.

---

## 2. Roles & Permissions

| Role | Thai | Can | Cannot |
|---|---|---|---|
| WARD | เจ้าหน้าที่ Ward | Submit case; view own ward's cases; monitor progress; view READY cases; receive notifications; view timeline | Change pharmacy workflow state |
| PHARMACY | เจ้าหน้าที่ห้องยาผู้ป่วยใน | View incoming cases; advance state (start → ready → basket received → dispensed); manage issue flags; view analytics | — |
| SUPER_ADMIN | — | Approve/deactivate accounts; assign role + ward scope; configure SLA thresholds; view login audit | Not part of patient workflow |

**Rules:**
- Role and ward scope are resolved **server-side** from the Users/Allowlist
  sheet — never trust a client-supplied role.
- Every server function re-checks permission independently of what the
  client UI shows or hides.
- A WARD user only sees/acts on cases within their assigned ward scope.
- Unauthorized nav items/actions are **omitted**, never shown disabled.

---

## 3. Authentication

- Sign-in method: **Google Sign-In** only. No username/password, no
  self-registration, no guest access.
- Successful Google auth is necessary but not sufficient — the signed-in
  email must exist in the **Users/Allowlist** sheet and be marked active.
- Session/role resolution happens on every privileged call, not just at
  login.

---

## 4. Ward Submission (Send Patient)

Fields collected — **nothing else**:

| Field | Notes |
|---|---|
| AN | required |
| Room / Bed | required |
| Appointment status | enum: `นัดหมายแล้ว` \| `ไม่มีนัด` |

Primary action: **ส่งให้ห้องยา** → creates a case in state `SUBMITTED`.

---

## 5. State Machine

Strictly sequential. No generic status field, no arbitrary jumps, no
backward transitions. Enforce this server-side unconditionally.

```
SUBMITTED → IN_PROGRESS → READY → BASKET_RECEIVED → DISPENSED
```

| # | State | Thai | Progress | Timestamp | Trigger / Actor |
|---|---|---|---|---|---|
| 1 | SUBMITTED | รอห้องยาดำเนินการ | 10% | `submittedAt` | Ward submits |
| 2 | IN_PROGRESS | กำลังเตรียมยา | 45% | `startedAt` | Pharmacy: "เริ่มดำเนินงาน" |
| 3 | READY | พร้อมจ่าย | 75% | `readyAt` | Pharmacy: "ตรวจสอบแล้ว • พร้อมจ่าย" |
| 4 | BASKET_RECEIVED | รอจ่ายยา | 85% | `basketReceivedAt` | Pharmacy: "รับตะกร้ายากลับบ้าน" |
| 5 | DISPENSED | จ่ายยาแล้ว | 100% | `dispensedAt` | Pharmacy: "จ่ายยาแล้ว" |

State 3 (READY) is the most important moment in the product — this is the
signal that "ส่งผู้ป่วยหรือญาติมารับยาได้", and must trigger the Ward
notification (§8).

State 4 (BASKET_RECEIVED) is when the **patient's real wait-time clock**
starts (§6).

Every transition writes a Timeline/Audit Log row: `{caseId, event, actor,
timestamp, fromState, toState}`.

---

## 6. Time Metrics (formulas)

| Metric | Formula | Meaning |
|---|---|---|
| Prep time to start | `startedAt − submittedAt` | How long before pharmacy picked it up |
| Prep time to ready | `readyAt − startedAt` | How long active preparation took |
| **Preparation Lead Time** | `readyAt − submittedAt` | Total time from submission to ready |
| **True Patient Waiting Time** | `dispensedAt − basketReceivedAt` | **The most important patient-facing metric** — actual time the patient/family waited at the pharmacy counter |

All authoritative timestamps are written server-side at the moment of each
state transition — never client-estimated or backdated.

---

## 7. SLA

Configurable thresholds (stored in Settings sheet, not hardcoded), default:

| Elapsed time | Band | Thai |
|---|---|---|
| 0–30 min | Normal | ปกติ |
| 31–45 min | Approaching | ใกล้ SLA |
| >45 min | Breached | เกิน SLA |

"Elapsed time" for SLA purposes is measured from `submittedAt` to now (for
open cases) — confirm/lock this definition before Phase 8 if ambiguous
against a specific stage-level SLA instead of end-to-end.

SLA display must be targeted (badge/accent on the affected case), never a
global "everything is red" treatment. Never rely on color alone — pair
with a text label.

---

## 8. Notifications

- Trigger: case transitions to `READY`.
- Recipient: Ward (the submitting ward / ward scope of the case).
- Channel: in-app only — toast + unread badge + notification center. No
  web push (MedReady is not a PWA).
- Example content:
  ```
  ยาพร้อมจ่ายแล้ว
  MR-0248
  ห้อง 305 / เตียง 1
  ส่งผู้ป่วยหรือญาติมารับยาได้
  ```
- Read/unread state tracked per user (`Read By` JSON array).
- Dismissal/delete state tracked per user (`Dismissed By` JSON array).
- Database retention & cleanup: Automated daily purge of old notifications via `triggerDailyArchivingAndSummary()` at 23:55 to prevent sheet bloat (`NOTIFICATION_RETENTION_DAYS`, default: 1 day).
- Delivery mechanism: polling (no websockets in Apps Script) — see
  `ROADMAP.md` Phase 8 for interval/quota considerations.

---

## 9. Issue Flags

Structured, not free text. Pharmacy attaches one or more to a case:

- รอประสาน Ward
- รอแพทย์
- รอแก้ไขคำสั่ง
- อื่น ๆ

Each flag entry: `{caseId, flagType, actor, timestamp}`.

---

## 10. Data Model (Sheets)

| Sheet | Key columns |
|---|---|
| **Cases** | Case ID, AN, Room/Bed, Appointment Status, Ward Scope, Current State, `submittedAt`, `startedAt`, `readyAt`, `basketReceivedAt`, `dispensedAt`, SLA snapshot |
| **Timeline / Audit Log** | Case ID, Event, Actor, Timestamp, From State, To State |
| **Issue Flags** | Case ID, Flag Type, Actor, Timestamp |
| **Users / Allowlist** | Email, Role, Ward Scope, Active |
| **Settings** | SLA threshold(s) in minutes, other admin-configurable values |
| **Notifications** | Notification ID, Case ID, Recipient Ward, Recipient Email, Title, Message, Timestamp, `Read By`, `Dismissed By` |

`setupSystem()` creates/verifies all sheets and headers idempotently. See
`SETUP.md`.

---

## 11. Terminology Glossary (Thai ↔ concept)

| Thai | English concept |
|---|---|
| ส่งให้ห้องยา | Submit to pharmacy |
| รอห้องยาดำเนินการ | Awaiting pharmacy action (SUBMITTED) |
| กำลังเตรียมยา | Preparing medication (IN_PROGRESS) |
| พร้อมจ่าย | Ready to dispense (READY) |
| รอจ่ายยา | Awaiting dispensing (BASKET_RECEIVED) |
| จ่ายยาแล้ว | Dispensed (DISPENSED) |
| ปกติ / ใกล้ SLA / เกิน SLA | Normal / Approaching SLA / SLA breached |
| รอประสาน Ward / รอแพทย์ / รอแก้ไขคำสั่ง / อื่น ๆ | Issue flag types |
| ใครพร้อมรับยาแล้ว? | "Who's ready to pick up?" — Ward Dashboard framing |
| ตอนนี้ต้องจัดการอะไร? | "What needs handling right now?" — Pharmacy Dashboard framing |
