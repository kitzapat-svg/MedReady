# MedReady — UX / Design Reference

This is a condensed implementation reference for the approved MedReady
design. It is **not** a substitute for the actual approved Stitch screens/
`DESIGN.md`/screenshots — when those exist, they are the visual source of
truth and this file should agree with them. Use this file when the Stitch
assets don't cover a specific detail, and update it once real screens are
approved.

---

## Quality bar & character

Benchmark: top-tier consumer tech restraint and clarity (Apple.com as a
*quality* reference only — never copy its literal layout, fonts, or
branding). Character: premium, calm, human, modern, clinical-but-warm,
trustworthy, efficient, highly readable, confident. The UI should reduce
operational stress, not add visual noise.

**Avoid:** generic Bootstrap/admin-template look, "Sheets with CSS," cheap
SaaS UI, old-style hospital HIS, government-system look, card-heavy
dashboards, neon UI, excessive gradients/glassmorphism, childish healthcare
styling, decorative graphics for their own sake.

---

## Visual system

- **Palette:** very light neutral background, white surfaces, near-black
  primary text, muted secondary text, one refined blue/teal accent.
  Semantic color only where meaningful — calm green (READY), amber
  (approaching SLA), controlled red (SLA breached/error). Never the sole
  signal — always paired with text/label.
- **Typography:** Thai-friendly typeface. Real weight given to numbers,
  time, status labels, Case IDs. Large numerals used strategically for
  waiting time, case counts, performance metrics — never shrink important
  numbers to fit.
- **Motion:** subtle and purposeful only — drawer open/close, new case
  appearing, status transitions, progress advancing, toast entry, filter
  transitions. Fast, natural, quiet. Never flashy.
- **Layout:** desktop-first, 1366–1920px, left sidebar nav. Mobile is
  intentionally designed, not shrunk: bottom nav, cards instead of table
  rows, full-screen detail instead of a drawer, sticky primary action,
  44px+ touch targets, no horizontal scroll.

---

## Signature components

### Milestone / progress component
Not a plain progress bar. Compact form for list/board rows, expanded form
for detail screens:

```
ส่งแล้ว → กำลังเตรียม → พร้อมจ่าย → รับตะกร้า → จ่ายยา
 (10%)     (45%)         (75%)        (85%)      (100%)
```

### MedReady Board — "operational list/table hybrid"
Explicitly **not** a Kanban board, not a raw spreadsheet, not a generic
admin table. Each row communicates, grouped intelligently (not spread
across many narrow columns): Case ID, masked AN, room/bed, appointment
status, status, progress, elapsed time, SLA state, next action.

### Case Detail / Timeline
- Desktop: right-side drawer/panel, Board stays visible behind it.
- Mobile: full-screen.
- Shows: Case ID, masked AN, room/bed, appointment, status, progress,
  timeline, elapsed duration, contextual next action.
- Timeline is a signature component, not a raw audit table:

```
14:02  Ward ส่งข้อมูล
6 นาที
14:08  ห้องยาเริ่มดำเนินงาน
24 นาที
14:32  พร้อมจ่าย
13 นาที
14:45  รับตะกร้า
11 นาที
14:56  จ่ายยาแล้ว
```

Completed cases prominently summarize both headline durations:
`30 นาที — เตรียมยาพร้อมจ่าย` and `11 นาที — เวลารอรับยาจริง`.

### Notification
Toast + unread badge + notification center. Example toast content:

```
ยาพร้อมจ่ายแล้ว
MR-0248
ห้อง 305 / เตียง 1
ส่งผู้ป่วยหรือญาติมารับยาได้
```

---

## Screens (priority build order)

| # | Screen | Primary question / purpose |
|---|---|---|
| 1 | Login (+ access-denied, session-expired, verifying states) | Gate entry |
| 2 | Ward Dashboard | "ใครพร้อมรับยาแล้ว?" — prioritize READY, then in-prep, then newly submitted. One strong primary metric + secondary metrics + case list, not equal-weight KPI cards. |
| 3 | Pharmacy Dashboard | "ตอนนี้ต้องจัดการอะไร?" — prioritize newly submitted, longest-waiting, approaching-SLA, basket-received/awaiting dispense, stale READY. |
| 4 | MedReady Board | Core operational workspace (see component notes above) |
| 5 | Case Detail / Timeline | Drawer (desktop) / full-screen (mobile) |
| 6 | Send Patient | Ward submission form (§4 in SOT.md) |
| 7 | Notification Center | List of past/unread notifications |
| 8 | Analytics | Pharmacy-facing KPIs (Preparation Lead Time, True Patient Waiting Time, SLA breach rate, etc.) |
| 9 | User Access (admin) | Approve accounts, assign role/ward scope, activate/deactivate |
| 10 | Settings (admin) | SLA threshold configuration |

---

## Role-based navigation

| Role | Nav items |
|---|---|
| WARD | Dashboard, ส่งผู้ป่วย, MedReady Board, การแจ้งเตือน |
| PHARMACY | Dashboard, MedReady Board, Analytics |
| SUPER_ADMIN | + User Access, Settings |

Unauthorized items are omitted entirely — never shown disabled.

---

## System / edge states to implement for every relevant screen

- Skeleton loading state
- Success toast
- Empty state (per screen — e.g. "no cases yet today")
- Access denied
- Session expired
- Write conflict — inline message, never `alert()`:
  ```
  รายการนี้ถูกอัปเดตโดยผู้ใช้อื่นแล้ว
  ระบบได้โหลดข้อมูลล่าสุดให้แล้ว
  ```

---

## Explicit non-goals for this file

Do not use this document to invent new screens, flows, or components
beyond what's listed here and in the approved Stitch design. If a gap shows
up during implementation, flag it rather than freelancing the UX.
