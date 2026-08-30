# MedReady

> **รู้เมื่อยาเสร็จ ลดเวลารอ เชื่อม Ward กับ Pharmacy**

MedReady is an internal hospital web application that connects **Ward** staff and **IPD Pharmacy** staff around discharge medication readiness. It provides real-time visibility into medication preparation status, reduces phone calls, shortens patient waiting times, and captures operational timestamps for workflow analytics.

---

## 🚀 Key Features

- **Real-time Status Tracking**: Ward & Pharmacy boards tracking cases across the entire lifecycle (`SUBMITTED` ➔ `RECEIVED` ➔ `PREPARING` ➔ `CHECKED` ➔ `READY` ➔ `DISPENSED`).
- **Role-Based Access Control**: Tailored dashboards for `WARD`, `PHARMACY`, and `SUPER_ADMIN`.
- **Privacy by Design**: Data minimization & pseudonymization (Case IDs, masked AN, no sensitive patient/clinical diagnosis stored).
- **SLA & Analytics**: Tracking turnaround time (TAT), bottlenecks, and target SLA thresholds.
- **Lightweight Architecture**: Built on Google Apps Script (GAS) + Google Sheets as database + Vanilla JS & Tailwind CSS/modern styling via Google Apps Script HtmlService.

---

## 📁 Project Structure

```text
MedReady/
├── src/                               # Google Apps Script Source Files
│   ├── Code.js                        # Entry point, routing, doGet/doPost
│   ├── Auth.js                        # Authentication & session handling
│   ├── Cases.js                       # Case workflow & state machine
│   ├── Timeline.js                    # Audit trail & timeline events
│   ├── Notifications.js               # Alerts & notifications
│   ├── Analytics.js                   # Metrics & reporting
│   ├── Admin.js                       # User & configuration management
│   ├── Config.js                      # App settings & sheets schemas
│   ├── Sla.js                         # SLA calculation & monitoring
│   ├── Seeder.js                      # Database seeding & demo data
│   ├── Tests.js                       # Automated unit tests
│   ├── Utils.js                       # Helper functions
│   ├── appsscript.json                # Apps Script manifest
│   ├── index.html                     # Main SPA HTML structure
│   ├── views.html                     # View templates & modals
│   ├── styles.html                    # Stylesheets & CSS
│   └── scripts.html                   # Client-side JavaScript
├── stitch_medready_design_system/     # Design system specs & UI mockups
├── PROJECT.md                         # Project overview & philosophy
├── SOT.md                             # Source of Truth: Data model & business rules
├── UX.md                              # UX guidelines & screen inventory
├── ROADMAP.md                         # Phased implementation roadmap
├── SETUP.md                           # Deployment & Clasp setup guide
└── HANDOFF.md                         # Developer handoff guide
```

---

## 🛠️ Setup & Deployment

Refer to [`SETUP.md`](SETUP.md) for full instructions on setting up Google Sheets, clasp, and deploying the Google Apps Script Web App.

---

## 📄 Documentation

- [Project Overview (`PROJECT.md`)](PROJECT.md)
- [Source of Truth & Data Model (`SOT.md`)](SOT.md)
- [Design Language & UX Specifications (`UX.md`)](UX.md)
- [Development Roadmap (`ROADMAP.md`)](ROADMAP.md)
- [Handoff Guide (`HANDOFF.md`)](HANDOFF.md)
