# MedReady — Roadmap

Work through these phases **in order**. Each phase has an exit checklist —
confirm it before starting the next phase. Don't skip ahead, and don't
build UI beyond what `UX.md` / the approved Stitch design specifies.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done

---

## Phase 0 — Architecture review
- [x] Confirm `PROJECT.md`, `SOT.md`, `UX.md` are read and understood
- [x] Confirm approved Stitch design assets are available (screens/
      `DESIGN.md`/screenshots) — if not yet approved, flag before proceeding
      past Phase 4
- [x] Confirm tech constraints from `SETUP.md` (Apps Script + Sheets only)

**Exit:** no open questions about data model, roles, or tech stack.

---

## Phase 1 — Project foundation
- [x] `clasp` project created/cloned, pushes successfully (`SETUP.md` §2–4)
- [x] `appsscript.json` manifest configured (webapp access, oauth scopes)
- [x] `setupSystem()` implemented: creates/verifies all sheets + headers
      idempotently (Cases, Timeline, Issue Flags, Users/Allowlist, Settings, Notifications)
- [x] Google Sheet created, ID stored in Script Properties (`SETUP.md` §6)

**Exit:** `setupSystem()` runs clean on an empty Sheet and is safe to re-run.

---

## Phase 2 — Authentication & authorization
- [x] Google Sign-In wired into `doGet`
- [x] Gmail allowlist check against Users/Allowlist sheet
- [x] Role + ward-scope resolution, server-side, on every privileged call
- [x] Access-denied and session-expired states implemented
- [x] At least one test account in the allowlist per role (WARD, PHARMACY,
      SUPER_ADMIN if used)

**Exit:** a non-allowlisted Google account is cleanly denied; an
allowlisted account resolves the correct role and ward scope.

---

## Phase 3 — Database / backend services
- [x] Case CRUD functions (create, read, list by ward/role)
- [x] State-transition functions enforcing the strict sequence in `SOT.md` §5
- [x] `LockService` around read-modify-write on Cases
- [x] Defined success/failure contract for every `google.script.run` call
- [x] Write-conflict detection returns a signal the client can render

**Exit:** two simulated simultaneous transitions on the same case don't
corrupt state; an out-of-order transition attempt is rejected.

---

## Phase 4 — Design system / UI shell
- [x] Approved Stitch design (or `UX.md` if design isn't finalized yet)
      implemented as the base layout: sidebar (desktop) / bottom nav
      (mobile), typography, color tokens, spacing
- [x] Role-based navigation rendering (items omitted, not disabled, per role)
- [x] Skeleton loading, empty, and error states scaffolded

**Exit:** shell renders correctly for each role, desktop and mobile, with
no screen-specific logic yet.

---

## Phase 5 — Ward workflow
- [x] Send Patient form (AN, room/bed, appointment status) → `SUBMITTED`
- [x] Ward Dashboard ("ใครพร้อมรับยาแล้ว?" hierarchy per `UX.md`)
- [x] Board read view for Ward role (ward-scoped)

**Exit:** a Ward user can submit a case and see it appear correctly scoped.

---

## Phase 6 — Pharmacy workflow
- [x] Pharmacy Dashboard ("ตอนนี้ต้องจัดการอะไร?" hierarchy per `UX.md`)
- [x] Board actions: start, mark ready, record basket, mark dispensed
- [x] Issue flags (structured, per `SOT.md` §9)

**Exit:** a case can be walked end-to-end SUBMITTED → DISPENSED by a
Pharmacy user, with correct timestamps recorded at each step.

---

## Phase 7 — Timeline & timers
- [x] Timeline component renders per-case event history (per `UX.md`)
- [x] Elapsed-time calculations (live, for open cases)
- [x] Completed-case summary (Preparation Lead Time, True Patient Waiting
      Time) per `SOT.md` §6

**Exit:** timeline and duration numbers match the formulas in `SOT.md` §6
exactly for a manually walked-through test case.

---

## Phase 8 — Notifications & SLA
- [x] Polling strategy implemented for Board/Dashboard freshness and
      READY notifications (interval chosen with Apps Script quotas in mind)
- [x] In-app notification (toast, unread badge, notification center) fires
      on transition to READY
- [x] SLA band calculation reads thresholds from Settings (not hardcoded)
- [x] SLA indicator is targeted/restrained per `UX.md`, never global

**Exit:** a case crossing into "ใกล้ SLA" / "เกิน SLA" updates its indicator
without a full-page reload beyond the normal poll interval.

---

## Phase 9 — Analytics
- [x] Pharmacy-facing analytics screen: Preparation Lead Time, True Patient
      Waiting Time, SLA breach rate, volume, etc.
- [x] Numbers reconcile against raw Cases/Timeline data for a sample period

**Exit:** analytics figures are verifiably correct against underlying data.

---

## Phase 10 — Admin
- [x] User Access screen: approve/deactivate accounts, assign role + ward
      scope
- [x] Settings screen: SLA threshold configuration
- [x] Login audit view

**Exit:** a SUPER_ADMIN can onboard a new user end-to-end and change an SLA
threshold that takes effect immediately.

---

## Phase 11 — Responsive / mobile refinement
- [x] Full pass against approved mobile design: bottom nav, cards, full-
      screen detail, sticky primary action, touch targets, no h-scroll
- [x] Verified on at least one real mobile viewport, not just devtools

**Exit:** every screen in the priority list (`UX.md`) is fully usable on
mobile, not just "not broken."

---

## Phase 12 — Security, concurrency, testing, cleanup
- [x] Re-verify every privileged server function checks role + ward scope
      independently of client input
- [x] Concurrency stress-check on state transitions (simultaneous actions)
- [x] Remove debug/test data and temporary allowlist entries
- [x] Final pass: no medication/diagnosis/clinical fields anywhere; AN
      masked everywhere it should be; patient name/HN nowhere

**Exit:** ready for real-world pilot on the special/private ward.

---

## Notes

- If any phase surfaces a conflict between `SOT.md`/`UX.md` and what's
  actually feasible in Apps Script/HtmlService, stop and flag it — don't
  silently resolve it by changing behavior or design.
- Update this file's checkboxes as phases complete so status is visible at
  a glance.
