# MedReady — Project Overview

**Tagline:** รู้เมื่อยาเสร็จ ลดเวลารอ เชื่อม Ward กับ Pharmacy

## What this is

MedReady is an internal hospital web app that connects **Ward** staff and
**IPD Pharmacy** staff around discharge medication readiness. It answers one
question fast: **"ยากลับบ้านของผู้ป่วยรายนี้พร้อมหรือยัง?"**

Initial rollout: special/private ward. Built to extend to more wards later.

## Why it exists

- Reduce phone calls between Ward and Pharmacy
- Tell Ward the moment discharge medication is ready
- Reduce patient waiting time
- Give Pharmacy a clear, prioritized work queue
- Collect timestamps systematically for operational analytics and audit

## What it is explicitly NOT

Not a HIS, EMR, e-prescribing, medication administration, or inventory
system. Not a replacement for HOSxP. It never stores or shows medication
name, quantity, direction, diagnosis, or clinical notes — that stays in the
hospital's existing system. MedReady is communication + workflow status +
timestamps + waiting-time analytics, nothing more.

## Users

| Role | Thai label | Summary |
|---|---|---|
| WARD | เจ้าหน้าที่ Ward | Submits cases, monitors pharmacy progress, sees READY cases, gets notified |
| PHARMACY | เจ้าหน้าที่ห้องยาผู้ป่วยใน | Runs the workflow: receives, prepares, checks, hands off, dispenses |
| SUPER_ADMIN (optional) | — | Approves accounts, sets roles/ward scope, configures SLA, reviews audit |

## Tech stack

Google Apps Script Web App + Google Sheets (database) + Google Drive (if
needed) + HTML/CSS/vanilla JS via `google.script.run`. No React, Next.js,
Firebase, Supabase, PWA, service worker, or manifest. See `SETUP.md` for
environment/clasp/GitHub/Sheets setup.

## Privacy stance

Data minimization + pseudonymization. No patient name, no HN in MVP. AN is
masked in normal views. Cases are identified primarily by a generated
**Case ID** (e.g. `MR-0248`). See `SOT.md` for the exact data model.

## Document map

This project is documented across five files — read them in this order:

1. **`PROJECT.md`** *(this file)* — what MedReady is, who it's for, why
2. **`SOT.md`** — Source of Truth: data model, state machine, formulas,
   terminology, business rules. If code and this file ever disagree, this
   file wins.
3. **`UX.md`** — the approved design language and screen inventory.
   Implementation must match this (and any attached Stitch screens/
   screenshots) as closely as Apps Script/HtmlService allows.
4. **`ROADMAP.md`** — the phased build plan, in order, with what "done"
   means for each phase.
5. **`SETUP.md`** — one-time environment setup: clasp, GitHub, Google
   Sheets.

## Ground rules for implementation

- Treat `SOT.md` as authoritative for anything data/logic-related, and the
  approved Stitch design + `UX.md` as authoritative for anything visual.
  Don't invent either — if something's missing or contradictory, flag it
  instead of guessing.
- Enforce the state machine and permissions **server-side**, always — the
  client UI is a convenience layer, not a security boundary.
- Work through `ROADMAP.md` in phase order and confirm each phase before
  starting the next.
