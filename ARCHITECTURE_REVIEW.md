# MedReady — ผลตรวจโครงสร้างและแนวทางพัฒนาต่อ

วันที่ตรวจ: 10 กันยายน 2026

ข้อเสนอหลัก: คง Google Apps Script + Google Sheets + HTML/CSS/vanilla JavaScript แล้วลดงานอ่านเขียนซ้ำ ปรับการส่งข้อมูลและการวาดหน้าจอ ก่อนลดรอบ polling ไม่จำเป็นต้องย้าย framework หรือเพิ่มบริการรายเดือนเพื่อปรับความสวยและความลื่นไหลในระยะแรก

## ขอบเขตและหลักฐาน

- ตรวจ source ใน `src/`, เอกสารหลัก, design reference และ source ตัวซิงก์ใน `.ipd_sync/`
- ตรวจ syntax ผ่านด้วย Node.js: server JavaScript 12 ไฟล์ และ JavaScript ใน `scripts.html`
- ไม่ได้วัด latency จาก deployment จริง ไม่ได้ตรวจภาพหน้าจอจริงหรือทดสอบบนมือถือ และไม่ได้ทดสอบจำนวนผู้ใช้พร้อมกัน
- ไม่รัน `runAllTests()` กับฐานข้อมูลจริง เพราะชุดทดสอบเรียก `setupSystem()` และฟังก์ชันเกี่ยวกับ archive ซึ่งมีผลต่อข้อมูล/trigger
- เอกสารนี้เป็นข้อเสนอ ยังไม่ได้ปรับ production code หรือ deploy; checkboxes ใน ROADMAP เดิมไม่ถือเป็นหลักฐานว่าการทดสอบปัจจุบันผ่าน

## โครงสร้างปัจจุบัน

| ส่วน | ไฟล์ | ข้อสังเกต |
|---|---|---|
| Web entry / setup / automation | `src/Code.js` | รวมทั้งรับ request, สร้างระบบ และตั้ง trigger |
| สิทธิ์ | `src/Auth.js` | ตรวจ Google identity, allowlist, role และ ward ฝั่ง server |
| Workflow และ IPD | `src/Cases.js` — 697 บรรทัด | มี state machine, conflict check และ lock แต่รวมงาน sync กับงานเคส |
| Timeline / alerts | `src/Timeline.js`, `src/Notifications.js` | มี audit และ read/dismiss แยกต่อผู้ใช้ |
| รายงาน / archive | `src/Analytics.js` — 902 บรรทัด | การคำนวณรายงานกับงานย้ายข้อมูลอยู่ด้วยกัน |
| Client controller | `src/scripts.html` — 2,921 บรรทัด | รวม auth, navigation, data, render, analytics, admin และ notifications |
| หน้าจอ / style | `src/views.html` — 1,401 บรรทัด, `src/index.html`, `src/styles.html` | มี design tokens และ mobile layout แต่สีและ class ยังซ้ำหลายจุด |
| IPD bridge | `.ipd_sync/sync.py`, `sync_tray.ps1` | Python อ่าน intranet แล้วเขียน Sheets โดยตรง; เป็นอีกระบบหนึ่งนอก GAS |
| เอกสาร / design | SOT, UX, ROADMAP, Stitch | มีฐานที่ดี แต่เอกสารบางส่วนไม่ตรงกัน |

จุดแข็งที่ควรรักษา: state machine ฝั่ง server, การตรวจ ward, lock ตอนเปลี่ยนสถานะ, timestamp ฝั่ง server, notification read state ต่อคน, การแยกข้อมูล active/archive และ design reference ที่มีอยู่แล้ว

## สิ่งที่ควรแก้ตามความสำคัญ

### 1. แจ้งเตือนยังไม่ครบพฤติกรรม และอาจตกหล่นโดยไม่แสดงข้อผิดพลาด

หลักฐาน: `src/scripts.html:1121` โหลด notifications แล้วอัปเดต badge/list แต่ไม่มีการเทียบ notification ID ใหม่เพื่อเรียก toast ขณะรับข้อมูล ส่วน `src/Notifications.js:38` จับข้อผิดพลาดแล้วเขียน Logger โดยไม่ส่ง failure กลับให้ `apiTransitionCase()`

ผล: สถานะอาจเป็น READY สำเร็จ แต่ไม่มีรายการแจ้งเตือน และผู้ส่งยังเห็นผลสำเร็จ การลด polling อย่างเดียวไม่แก้ปัญหานี้

ข้อเสนอ:

- แสดง toast สำหรับ READY event ใหม่ พร้อมปุ่มเปิดเคส; แยก “เคยแสดง toast” จาก “อ่านแล้ว”
- ตอนเปิดระบบ แสดง unread ที่ค้างในศูนย์แจ้งเตือนโดยไม่ยิง toast เก่าทั้งหมดซ้ำ
- เพิ่ม event ID ที่คงที่และกลไกตรวจเติม event ที่ขาด พร้อม retry แบบไม่สร้างรายการซ้ำ
- ใช้ Cases/ข้อมูล event ที่เก็บถาวรเป็นหลักฐานสำหรับกู้คืน ไม่ใช้ cache เป็นที่เก็บแจ้งเตือนเพียงแห่งเดียว
- แสดง sync error และเวลาสำเร็จล่าสุด รวม failure handler ของ notifications; retry การอ่านได้ แต่การ retry การเขียนต้องมี request ID ป้องกันทำซ้ำ
- เสียงเตือนเป็นตัวเลือกหลังผู้ใช้กดเปิดเสียง และต้องทดลองบน browser/HtmlService จริง

### 2. Polling มีงานซ้ำมากกว่าที่จำเป็น

หลักฐาน: `src/scripts.html:217` ตั้ง 15 วินาทีแบบตายตัว; `src/scripts.html:328` ใช้ setInterval; `refreshData()` เรียกทั้ง cases และ notifications; แต่ `src/Config.js:112` มี POLL_INTERVAL_SECONDS = 30 ซึ่งไม่ได้ใช้ในการเริ่ม polling นี้

`src/Auth.js:108` เขียน Last Login ทุกครั้งที่ getCurrentUser() ผ่านการอนุญาต จึงเกิดการเขียนจากการอ่านข้อมูลปกติด้วย ส่วน `apiListCases()` ยังอ่าน Settings, Cases และ Issue Flags และคำนวณรายการทั้งหมดในทุก poll

ข้อเสนอ:

- แยกการบันทึก login ออกจากการตรวจสิทธิ์ประจำ request โดยยังตรวจสิทธิ์ server ทุกครั้ง
- สร้าง API sync กลาง คืน cases ที่เปลี่ยน, notification ใหม่, serverTime และ cursor ใน request เดียว
- ให้อ่านข้อมูลสิทธิ์และตั้งค่าภายใน request เดียวเพียงครั้งเดียว; cache Settings พร้อม invalidation เมื่อ admin แก้ค่า
- cache ข้อมูลที่ผ่านการกรองโดยคำนึงถึง role, ward และผู้ใช้ โดยเฉพาะ read/dismiss state; ไม่รวมผลข้ามผู้ใช้
- ใช้ setTimeout หลัง request จบ ป้องกันคำขอซ้อน พร้อม jitter และ backoff เมื่อผิดพลาด
- หน้าเปิดใช้งานจริงเริ่มทดลองที่ 10 วินาที แล้วลดเป็น 5 วินาทีเมื่อวัดโหลดผ่าน; หน้าไม่ใช้งานลดเหลือ 30–60 วินาทีหรือหยุด และ sync ทันทีเมื่อกลับมา
- cursor ต้องรองรับ event เวลาเท่ากัน, archive/removal และการ reconnect; ถ้า cursor ใช้ไม่ได้ให้ full resync เป็นระยะ
- ถ้าจะดึงเฉพาะข้อมูลที่เปลี่ยน ต้องมีเส้นทางอ่านที่เบาขึ้นจริงด้วย ไม่ใช่ scan ทั้งชีตเหมือนเดิมแล้วเพียงลด response

Google แนะนำลด service calls, batch reads/writes และใช้ cache ในงานที่เหมาะสม: [Apps Script best practices](https://developers.google.com/apps-script/guides/support/best-practices)

### 3. การอ่านรายการอาจไปทำงาน archive และชนกับการเขียน

หลักฐาน: `src/Cases.js:225` เป็นต้นไปตรวจเคสเก่าแล้วเรียก `archiveCompletedCases()` จาก API อ่านข้อมูล ขณะที่ `src/Analytics.js:527` ตัว archive ไม่มี lock ของตัวเอง และมี clear/rewrite ชีต ทั้งนี้เส้นทาง `apiRunDailyArchiving()` มี lock แต่เส้นทางอ่าน cases ไม่ได้ครอบด้วย lock เดียวกัน

ผล: การ refresh อาจช้าเป็นครั้งคราว และมีความเสี่ยงจากการย้ายข้อมูลพร้อมการเปลี่ยนสถานะ ต้องพิสูจน์ด้วยการทดสอบ concurrency ในฐานทดสอบ

ข้อเสนอ: ย้าย archive ออกจากเส้นทางอ่าน ให้มี maintenance entry point ที่ใช้ lock เดียวกับผู้เขียนเคส ออกแบบ retry/resume และตรวจการย้ายซ้ำด้วย Case ID/Log ID ก่อนล้างต้นทาง ทดสอบกรณีล้มเหลวระหว่างแต่ละขั้นด้วย

### 4. การเปลี่ยน DOM ทั้งรายการทำให้ปรับความลื่นไหลได้อีก

หลักฐาน: `src/scripts.html:959` และ `:980` เขียน innerHTML ให้ทั้ง table/mobile list เมื่อ render; dashboard ใช้แนวทางเดียวกัน

ข้อเสนอ: เก็บข้อมูลตาม Case ID และ updatedAt แล้วปรับเฉพาะแถวที่เปลี่ยน รักษา focus, scroll, filter และ drawer; หลัง mutation สำเร็จให้ server ส่งข้อมูลเคสล่าสุดกลับมาเพื่ออัปเดตทันที ไม่ต้องรอ full reload

เวลารอที่แสดงบนหน้าจอควรเดินจาก timestamp + server clock offset โดยไม่เรียก server ทุกวินาที ส่วน timestamp และการตัดสินสถานะยังยึด server

### 5. งาน IPD มีความหน่วงและความเสี่ยงอีกชุดหนึ่ง

หลักฐาน: `.ipd_sync/sync_tray.ps1:116` และ `:125` ตั้งเวลารอบถัดไปเพิ่ม 60 วินาที; `.ipd_sync/sync.py` เรียก clear → append header → append rows ทุกครั้ง และหน้า send-patient โหลด IPD เมื่อเข้าหน้าหรือสั่ง refresh ไม่ได้โหลดตาม polling cases ปกติ

ต้องแยกการวัด:

- READY alert: ห้องยากด READY → GAS เขียน notification → Ward poll พบ
- IPD freshness: intranet เปลี่ยน → Python sync → IPD_Orders → หน้า send-patient โหลด

ข้อเสนอ: แสดง last successful sync ที่หน้าเว็บ, ไม่เขียนซ้ำเมื่อข้อมูลธุรกิจไม่เปลี่ยน, เขียนเป็น batch พร้อมล้างเฉพาะแถวท้ายที่เกิน หรือใช้ snapshot staging/switch เพื่อไม่ให้ผู้อ่านเห็นช่วงข้อมูลว่าง และทดลองรอบ 15–30 วินาทีหลังลดงานเขียนและตรวจภาระ intranet

ตัว bridge ต้องมี dependency lock, config example, วิธีติดตั้ง/เริ่มอัตโนมัติ และ recovery guide ปัจจุบัน `.gitignore` ตัด `.ipd_sync/` ทั้งโฟลเดอร์ จึงไม่มี source bridge ใน Git ควรย้าย source ที่ไม่ใช่ความลับไป `integrations/ipd/` และคง credential/status/log ไว้นอก Git

### 6. มีความคลาดเคลื่อนระหว่างเอกสารกับข้อมูล/สูตรในโค้ด

- README/ROADMAP บางส่วนระบุ RECEIVED/PREPARING/CHECKED แต่ SOT และ state machine จริงใช้ SUBMITTED → IN_PROGRESS → READY → BASKET_RECEIVED → DISPENSED
- `src/Cases.js:325` ส่ง rawAn กลับใน list response แม้ UI ใช้ maskedAn และ client ใช้ rawAn ค้นหา: ควรแยกการค้นหา AN เต็มเป็น server API ที่ตรวจสิทธิ์ และส่งเฉพาะผลจำเป็นกลับ แทนส่ง AN เต็มทุกเคส
- `src/Cases.js:297` ส่ง breakConfig เข้า patient waiting calculation และ default เปิดหักเวลาพัก แต่ SOT นิยาม True Patient Waiting Time เป็นเวลาจริง dispensedAt − basketReceivedAt: ต้องตกลงนิยามให้ตรง แนะนำแยกเวลาจริงกับเวลาหลังหักพักเป็นคนละ metric
- `src/Code.js:292` ตั้ง nearMinute(55) จึงไม่ใช่เวลาที่รับประกันตรง 23:55; ควรประมวลผล “วันที่ปิดครบแล้ว” หลังเที่ยงคืนและตามเก็บวันที่ตกค้างโดยอิง Asia/Bangkok ไม่ใช้วันขณะรันอย่างเดียว

Google ระบุ nearMinute คลาดเคลื่อนได้ ±15 นาที: [ClockTriggerBuilder](https://developers.google.com/apps-script/reference/script/clock-trigger-builder#nearMinute(Integer))

## แนวทางหน้าตาที่สวยขึ้นและอ่านเร็วขึ้น

ยึด UX.md และ Stitch เดิมเป็นฐาน ตรวจเทียบภาพจริงก่อนสรุป visual defects

1. **Typography:** ใช้ฟอนต์ที่มี glyph ไทยชัดเจน ทดสอบตัวเลือกบนเครื่อง Ward; เพิ่มข้อความปฏิบัติงานหลักเป็นประมาณ 14–16px แทน text-xs/10px ที่พบหลายจุด ตัวเลขเวลาใช้ tabular numbers
2. **ลำดับความสำคัญ:** Ward เน้น “พร้อมรับยาแล้ว” ห้องยาเน้นงานถัดไปและเคสรอนาน ลด KPI ที่แย่งความสนใจเท่ากัน
3. **ส่วนประกอบร่วม:** รวม token สี/spacing/radius และสร้าง status badge, case row/card, action button, toast และ skeleton ที่ใช้ซ้ำ ปรับหนึ่งจุดได้ทุกหน้า
4. **Motion:** เปลี่ยนเฉพาะแถวที่อัปเดต ใช้ opacity/transform ช่วงสั้นประมาณ 150–200ms และรองรับ prefers-reduced-motion
5. **Mobile/accessibility:** ปุ่มอย่างน้อย 44px, primary action อยู่ตำแหน่งคงที่, focus ring/keyboard/drawer focus และอนุญาต zoom; index.html กับ doGet ปัจจุบันตั้ง user-scalable=no
6. **สถานะระบบ:** แสดง “อัปเดตล่าสุด”, “กำลังเชื่อมต่อใหม่” และ “ข้อมูลอาจเก่า” โดยไม่บดบังงานหลัก
7. **CSS สำหรับใช้งานจริง:** compile Tailwind ล่วงหน้าแล้ว include CSS ที่สร้างเสร็จใน HtmlService แทน browser CDN; เริ่มด้วย version ที่เข้ากับงานเดิม ตรวจ dynamic classes/safelist ก่อนเปลี่ยน และ commit lockfile สำหรับ build ที่ทำซ้ำได้

Tailwind ระบุว่า Play CDN ใช้เพื่อการพัฒนา ไม่ได้ออกแบบสำหรับ production: [Tailwind Play CDN](https://tailwindcss.com/docs/installation/play-cdn)

## โครงสร้างเป้าหมายที่ดูแลรักษาง่าย

ไม่ต้องเพิ่ม frontend framework เริ่มด้วย HTML partial หลายไฟล์ที่ include ตามลำดับชัดเจน:

```text
src/
  Code.js                    # entry points
  Auth.js                    # identity / authorization
  Cases.js                   # case use cases / workflow
  CaseRepository.js          # Sheets access + column mapping
  Sync.js                    # incremental sync API
  Notifications.js           # durable event delivery / read state
  Analytics.js               # metrics / reports
  Maintenance.js             # archive / summary / retention
  Ipd.js                     # IPD query / validation
  client-api.html            # RPC wrapper / standard error handling
  client-store.html          # state, versions, cursor
  client-sync.html           # scheduling / reconnect
  client-notifications.html
  client-board.html
  client-admin.html
  views-*.html
  styles.html
integrations/ipd/            # source only; secrets kept outside Git
tests/                      # pure logic + integration fixtures
scripts/                    # local build / validation
docs/                       # deployment / recovery / data dictionary
```

เป็นโครงสร้างเสนอ ยังไม่ได้สร้างไฟล์เหล่านี้ แยกทีละ module และรักษา API contract เดิมในระหว่างย้าย เพิ่ม column mapping กลางแทนเลข index กระจายหลายไฟล์ และแยก helper ภายในออกจาก public RPC ด้วย naming/visibility ที่เหมาะกับ Apps Script พร้อมตรวจสิทธิ์ที่ entry point

## ความเร็วและเงื่อนไขไม่มีค่าบริการเพิ่ม

เป้าหมายเบื้องต้น: READY แสดงที่ Ward ภายใน 5–10 วินาทีเป็นส่วนใหญ่ขณะเปิดหน้าใช้งาน เป็นเป้าหมายทดลอง ไม่ใช่ผลทดสอบหรือคำรับประกันจาก GAS หากต้องรับประกันต่ำกว่า 1 วินาทีหรือแจ้งเตือนเมื่อปิดหน้า/ล็อกมือถือ สถาปัตยกรรม in-app polling ปัจจุบันไม่ตอบโจทย์นั้น ต้องออกแบบช่องทางใหม่แยกต่างหาก

ตัวอย่างประมาณจำนวน RPC เมื่อมี 20 แท็บ เปิด 8 ชั่วโมง และไม่มีคำขอข้ามรอบ:

| แบบ | RPC โดยประมาณ/วัน |
|---|---:|
| ปัจจุบัน 2 API ทุก 15 วินาที | 76,800 |
| รวม 1 API ทุก 10 วินาที | 57,600 |
| รวม 1 API ทุก 5 วินาที | 115,200 |

สูตร = แท็บ × ชั่วโมง × 3,600 ÷ รอบวินาที × API ต่อรอบ ตัวเลขนี้ไม่ใช่ Google quota และไม่รวม bootstrap/mutations; RPC ลดลงไม่ได้แปลว่างาน Sheets ลดลงโดยอัตโนมัติ ถ้า request ใหม่ยังทำงานเดิมทั้งหมด

GAS มีข้อจำกัดเวลารัน 6 นาที/ครั้ง, executions พร้อมกัน 30 ต่อผู้ใช้ และ 1,000 ต่อ script; ต้องดูบัญชีที่รันจริงและวัดการใช้งาน ไม่เทียบจำนวน RPC กับ quota URL Fetch เพราะ google.script.run ไม่ใช่ UrlFetchApp โดยตรง ดู [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas)

สำหรับ Python/gspread ต้องคุม Sheets API แยก: quota อ่านและเขียนแต่ละประเภท 300 requests/นาที/project และ 60 requests/นาที/user/project ตามเอกสารที่ตรวจ; service account นับเป็นผู้ใช้หนึ่งราย Standard use ไม่มีค่า API เพิ่ม แต่เอกสารระบุแผนคิดเงินส่วนเกินโควตาภายหลังในปี 2026 จึงควรจำกัดโหลด ไม่เปิด paid overage/ขยาย billing และตรวจ policy ก่อนขยายระบบ ดู [Sheets API usage limits and pricing](https://developers.google.com/workspace/sheets/api/limits)

ข้อเสนอระยะแรกไม่เพิ่ม hosting/database/SMS subscription ใช้ทรัพยากรและบัญชีที่มีอยู่ ทั้งนี้ “ไม่มีค่าบริการใหม่” ไม่รวมค่าเครื่อง sync, ไฟฟ้า, อินเทอร์เน็ต และเวลาผู้ดูแลที่มีอยู่แล้ว และไม่ใช่การรับประกันราคาแพลตฟอร์มตลอดไป

## ลำดับพัฒนาและเกณฑ์รับงาน

| ระยะ | งานหลัก | เกณฑ์รับงาน |
|---|---|---|
| A — correctness / baseline | วัดเวลา, แก้ notification ตกหล่น, แยก Last Login, archive lock, ตกลงนิยามเวลารอ | READY สำเร็จมี event ที่ตรวจสอบ/กู้คืนได้; ทดสอบแจ้งเตือนซ้ำ/หายและ concurrent archive บนฐานทดสอบ |
| B — ความเร็ว | รวม sync, ลด Sheets reads/writes, adaptive polling, update เฉพาะแถว, mutation response | วัด p50/p95 RPC และ READY-to-visible ด้วยโหลดเท่าก่อนแก้; ไม่มี toast ซ้ำ/การเปลี่ยนข้าม ward; focus/scroll คงอยู่ |
| C — UI / maintainability | typography, shared components, mobile, precompiled CSS, แยก module, เก็บ source IPD | เทียบ Stitch และทดลอง Ward/Pharmacy จริง; keyboard/zoom/mobile ผ่าน; build ทำซ้ำได้และย้อน deployment ได้ |
| D — ขยายจำนวน Ward | ปรับ bridge, summary/archive แบ่งช่วง, ตรวจ quota/retention, ทดลองภาระสูงสุดที่คาด | ระบุจำนวนแท็บและข้อมูลที่รองรับจากผลวัดจริง มี backoff/recovery และไม่เปิดบริการเสียเงิน |

ชุดทดสอบที่ควรมี: state transitions, ward scoping, duplicate READY/retry, notification read/dismiss ต่อคน, break-time metric, เคสข้ามเที่ยงคืน, archive ล้มเหลวกลางทาง, tab กลับจาก background และ network หลุด ข้อมูลทดสอบต้องแยกจากชีตใช้งานจริง

สิ่งที่ต้องเก็บจาก pilot เพื่อปรับเป้าหมาย: จำนวนแท็บพร้อมกันช่วงพีก, จำนวนเคสต่อวัน, p95 ของ API, READY-to-visible, อัตรา error, ขนาด Cases/Timeline/archive และเวลาซิงก์ IPD สำเร็จล่าสุด
