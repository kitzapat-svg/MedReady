**ผลประเมินการ login ด้วยอีเมลที่อนุญาตของ MedReady — 4 ตุลาคม 2026**

อ้างอิง source ณ commit [`9b9efe9`](https://github.com/kitzapat-svg/MedReady/commit/9b9efe983fc1479ae140497065a8a5e4c14d34ac) ลิงก์หลักฐานในรายงานชี้ไปยัง source รุ่นที่ตรวจ เพื่อใช้พัฒนาต่อและตรวจสอบย้อนหลังได้จากเครื่องอื่น

ระบบมีพื้นฐานที่เหมาะสม: ใช้ Google เป็นผู้ยืนยันตัวตน และตรวจรายชื่อ/บทบาท/หอผู้ป่วยบนเซิร์ฟเวอร์ แต่ความปลอดภัยและความน่าเชื่อถือยังขึ้นกับเส้นทางเรียกฟังก์ชัน การตั้งค่า deployment และสิทธิ์เข้าถึง Google Sheets มากเกินไป ข้อเสนอคือแก้จุดบกพร่องปัจจุบันก่อน แล้วเลือกโครงสร้างการยืนยันตัวตนให้ตรงกับประเภทบัญชีของบุคลากร

ตรวจ source ปัจจุบันใน src ครบ 17 ไฟล์และเอกสารประกอบที่เกี่ยวข้องด้วย codex-security:security-scan มีการตรวจอิสระด้านโค้ด สถาปัตยกรรม และวงจร login ไม่ได้เรียก production, อ่าน Users จริง, ตรวจ Google ACL, รันชุดทดสอบที่แก้ข้อมูล หรือแก้ source ข้อสรุปเกี่ยวกับ deployment จริงจึงมีเงื่อนไขชัดเจน การใช้งาน token สำหรับการตรวจครั้งนี้ไม่มีค่าที่วัดได้จากเครื่องมือ

**กลไกปัจจุบันทำงานดังนี้:** ปุ่ม login เรียก apiGetCurrentUser ผ่าน google.script.run; getCurrentUser อ่าน Session.getActiveUser().getEmail(), แปลงเป็นตัวพิมพ์เล็กและ trim แล้วเทียบกับแถวแรกที่ตรงใน Users ถ้ามีแถว Active=TRUE จะคืน role/wardScope และสถานะ AUTHORIZED หากไม่พบตัวตน/รายชื่อ/บัญชีเปิดใช้งาน จะคืน UNAUTHENTICATED, ACCESS_DENIED หรือ ACCOUNT_DEACTIVATED ตามลำดับ API ที่ใช้ requireAuthorization จะอ่านข้อมูลนี้ใหม่ทุกครั้ง แหล่งอ้างอิง: [Auth.js](https://github.com/kitzapat-svg/MedReady/blob/9b9efe983fc1479ae140497065a8a5e4c14d34ac/src/Auth.js#L10), [scripts.html](https://github.com/kitzapat-svg/MedReady/blob/9b9efe983fc1479ae140497065a8a5e4c14d34ac/src/scripts.html#L66)

localStorage medready_logged_in เป็นเพียงตัวช่วยเลือกหน้าหลัง refresh ไม่มี token ของแอปและไม่สามารถทำให้ผ่าน guard ที่ตรวจ Google identity บนเซิร์ฟเวอร์ได้ ข้อดีคือไม่รับ email/role จาก browser มาเป็นหลักฐานตัวตน และการปิดบัญชีมีผลต่อ request ใหม่ที่ผ่าน guard ทันทีที่อ่าน Users ใหม่ หน้าจออย่างเดียวจึงไม่ได้เป็นตัวบังคับสิทธิ์

**ความเสี่ยงที่ควรแก้ก่อนขยายการใช้งาน:**

| ลำดับงาน | สิ่งที่พบจากโค้ด | ผลกระทบและเงื่อนไข | แนวแก้ |
|---|---|---|---|
| เร่งด่วน | roomBed ที่ WARD กรอกถูกเก็บโดย trim แล้วแสดงด้วย innerHTML ใน dashboard, Board, timeline และ notifications | HTML ที่แฝง event handler อาจรันในหน้าของ PHARMACY/SUPER_ADMIN และเรียก API ด้วยสิทธิ์ผู้ดูหน้า; ไม่ต้องมีสิทธิ์แก้ Users ของผู้โจมตีเอง | ใช้ textContent/DOM API และ addEventListener; ตรวจทุกจุดที่รับค่าจากผู้ใช้/ฐานข้อมูล รวมถึง IPD |
| เร่งด่วน | helpers เช่น seedTestData, logTimelineEvent, getCaseTimeline, archiveCompletedCases และ maintenance เป็น public top-level ไม่มี guard ของตนเอง | ข้าม allowlist/role ของ wrapper ได้เมื่อ platform และ Google permissions อนุญาต; หาก deploy แบบเจ้าของทำงานแทนผู้ใช้ ผลเสียรุนแรงขึ้น | private helpers ด้วยชื่อท้าย _, เก็บ public API ให้น้อยและมี guard, ตัด seed/tests ออกจาก production |
| เร่งด่วน | archive case detail ไม่ตรวจ Ward หลังอ่าน Cases_Archive | ผู้ใช้ WARD เรียก case ID ของ Ward อื่นผ่านแอปได้เมื่ออ่านชีตได้ | ตรวจ policy เดียวกันหลังโหลดเคสจากทุกแหล่ง และก่อนคืน timeline/flags |
| เร่งด่วน | IPD ไม่มีผลลัพธ์ของ Ward ตัวเองแล้วคืนทุก Ward; ใช้ substring และยอมผ่าน ward ว่าง | ข้อมูลข้าม Ward ถูกส่งกลับผ่านแอป | คืน [] เมื่อไม่มีรายการที่มีสิทธิ์, ใช้ ward ID ตรงกันและ mapping ที่ชัดเจน |
| เร่งด่วน | doPost/apiSyncIpdOrders รับ orders แล้ว clear/replace IPD_Orders โดยไม่พิสูจน์ผู้ส่ง | การเขียนสำเร็จขึ้นกับ deployment/Google ACL; รูปแบบเจ้าของรันแทนเปิดความเสี่ยงเพิ่ม | แยก service authentication จาก login บุคลากร, ตรวจ replay/ขนาด/schema ก่อนเขียน และใช้ staging |

หลักฐาน: [Cases input](https://github.com/kitzapat-svg/MedReady/blob/9b9efe983fc1479ae140497065a8a5e4c14d34ac/src/Cases.js#L20), [Dashboard HTML](https://github.com/kitzapat-svg/MedReady/blob/9b9efe983fc1479ae140497065a8a5e4c14d34ac/src/scripts.html#L854), [Seeder](https://github.com/kitzapat-svg/MedReady/blob/9b9efe983fc1479ae140497065a8a5e4c14d34ac/src/Seeder.js#L6), [Timeline](https://github.com/kitzapat-svg/MedReady/blob/9b9efe983fc1479ae140497065a8a5e4c14d34ac/src/Timeline.js#L9), [Archive detail](https://github.com/kitzapat-svg/MedReady/blob/9b9efe983fc1479ae140497065a8a5e4c14d34ac/src/Cases.js#L380), [IPD fallback](https://github.com/kitzapat-svg/MedReady/blob/9b9efe983fc1479ae140497065a8a5e4c14d34ac/src/Cases.js#L570), [HTTP import](https://github.com/kitzapat-svg/MedReady/blob/9b9efe983fc1479ae140497065a8a5e4c14d34ac/src/Code.js#L361)

Google ระบุว่าฟังก์ชัน top-level ที่ไม่ใช่ private สามารถเรียกผ่าน google.script.run และชื่อที่ลงท้าย _ เรียกจาก client ไม่ได้ การไม่มีปุ่มใน UI จึงไม่ปิดการเรียกฟังก์ชันเหล่านั้น [Apps Script communication](https://developers.google.com/apps-script/guides/html/communication)

ขอบเขตสำคัญ: manifest ปัจจุบันเป็น USER_ACCESSING/ANYONE ดังนั้น request ทำงานด้วย Google permissions ของผู้เรียก ไม่ได้พิสูจน์ว่าคนนอกเขียนฐานข้อมูลด้วยสิทธิ์เจ้าของได้ คนที่มีสิทธิ์ editor ทั้งชีตอยู่แล้วมีอำนาจแก้ข้อมูลโดยตรงด้วย ส่วนการรันสคริปต์แฝงในหน้าของผู้ดูที่มีสิทธิ์สูงกว่าเป็นการข้ามขอบเขตตัวตนจริง ควรแก้ทันที [manifest](https://github.com/kitzapat-svg/MedReady/blob/9b9efe983fc1479ae140497065a8a5e4c14d34ac/src/appsscript.json#L6)

**ปัญหาของประสบการณ์ login และความเสถียร:**

1. UNAUTHENTICATED ถูกพาไปหน้าไม่มีสิทธิ์: server คืน active:false แต่ client ตรวจ !res.active ก่อนตรวจสถานะ จึงไม่ถึง AccountChooser ที่เตรียมไว้ ควรแยกสถานะอย่างชัดเจนก่อนพิจารณา active [scripts.html](https://github.com/kitzapat-svg/MedReady/blob/9b9efe983fc1479ae140497065a8a5e4c14d34ac/src/scripts.html#L85)
2. ปุ่มสลับบัญชีเรียกการตรวจ identity เดิมอีกครั้ง จึงอาจกลับเข้า account เดิมแทนการเลือกบัญชีใหม่ ควรแยก action login/retry/switch account และทดสอบหลายบัญชีบน browser จริง [Account modal](https://github.com/kitzapat-svg/MedReady/blob/9b9efe983fc1479ae140497065a8a5e4c14d34ac/src/views.html#L1384)
3. ข้อผิดพลาด network/Sheets ถูกแสดงเป็นไม่มีสิทธิ์ ควรมีระบบตอบกลับสม่ำเสมอ เช่น UNAUTHENTICATED, NOT_ALLOWLISTED, ACCOUNT_DISABLED, FORBIDDEN, AUTH_CONFIG_ERROR และ SERVICE_UNAVAILABLE ให้ผู้ใช้เห็นการแก้ไขที่ตรงเหตุ
4. หลังเพิกถอนสิทธิ์ request ที่มี guard ถูกปฏิเสธ แต่ refreshData/loadNotifications มองเฉพาะ success แล้วเก็บข้อมูลเก่าและ poll ต่อ ควรหยุด timer, ล้างข้อมูล/DOM/drawers และยกเลิกผลตอบกลับเก่าที่กำลังรอเมื่อสูญเสียสิทธิ์ ส่วนปัญหา network ชั่วคราวต้องแสดงข้อมูลล้าสมัยและเวลาที่อัปเดตล่าสุด [polling](https://github.com/kitzapat-svg/MedReady/blob/9b9efe983fc1479ae140497065a8a5e4c14d34ac/src/scripts.html#L327)
5. Last Login ถูกเขียนทุก getCurrentUser รวมถึง guard ของ Cases และ Notifications ประมาณ 8 ครั้ง/นาที/แท็บที่ poll ทุก 15 วินาที หรือราว 480 ครั้ง/ชั่วโมง ก่อนรวม API อื่น ค่านี้จึงเป็น Last Activity และอาจเขียนผิดแถวเมื่อชนกับการลบแถว Users ควรแยกการอ่านสิทธิ์ออกจากการบันทึก login และ throttle lastSeen ด้วยตัวตนที่คงที่ [Auth timestamp](https://github.com/kitzapat-svg/MedReady/blob/9b9efe983fc1479ae140497065a8a5e4c14d34ac/src/Auth.js#L106)
6. getSpreadsheet fallback จากฐานที่ตั้งค่าไว้ไป property/active spreadsheet/ค้นตามชื่อ/สร้างใหม่ อาจพาไปคนละฐานเมื่อเกิด permission error ภายใต้ USER_ACCESSING การมองเห็น Drive ยังต่างกันตามคน ต้องใช้ production database ID เดียว และหยุดพร้อม error ถ้าเปิดไม่ได้; การสร้างฐานและ seed admin ต้องเป็นขั้นตอนติดตั้งเฉพาะ [Config](https://github.com/kitzapat-svg/MedReady/blob/9b9efe983fc1479ae140497065a8a5e4c14d34ac/src/Config.js#L120)
7. apiSaveUser ป้องกัน self-disable แต่ยังให้ admin คนสุดท้ายลด role ตัวเองได้ และสอง admin อาจปิดกันระหว่าง request ที่ผ่าน guard ก่อน lock ควรอ่านสิทธิ์ actor ซ้ำและตรวจว่าผลการแก้ยังมี active SUPER_ADMIN อย่างน้อยหนึ่งคนภายใน lock เดียว [Admin](https://github.com/kitzapat-svg/MedReady/blob/9b9efe983fc1479ae140497065a8a5e4c14d34ac/src/Admin.js#L102)

การใช้ getEffectiveUser เป็น fallback สำหรับ login ผู้เข้าเว็บไม่เหมาะ เพราะใน owner execution มันอาจคืนเจ้าของระบบ Google ยังระบุว่า getActiveUser().getEmail() อาจว่างใน execute-as-me และข้อยกเว้นโดยทั่วไปเกี่ยวกับผู้ใช้ Workspace โดเมนเดียวกัน Scope userinfo.email เพียงอย่างเดียวจึงไม่รับประกัน email ทุกบัญชี [Google Session](https://developers.google.com/apps-script/reference/base/session)

**ข้อมูลสิทธิ์ควรยืดหยุ่นขึ้นอย่างไร:** ปัจจุบันหนึ่ง email มีหนึ่ง role และ wardScope เป็นชื่อ Ward เดียวหรือ ALL การค้นหาใช้แถวแรกที่ตรง ไม่มีการปฏิเสธ email ซ้ำ/role ใน Users ที่ผิด schema; ward ว่างถูกแทนด้วยตึกพิเศษ และ active ที่ส่งเป็น string 'false' ผ่าน apiSaveUser กลายเป็น true ได้ ต้องตรวจ schema ทั้งตอนบันทึกและอ่านสิทธิ์

รูปแบบที่เสนอเป็นการออกแบบใหม่ ไม่ใช่ schema ที่มีแล้ว:

| ข้อมูล | จุดประสงค์ |
|---|---|
| userId และ providerSubject | ตัวตนคงที่; สำหรับ OIDC ใช้ Google sub |
| emailNormalized | lookup/invite และการสื่อสาร, มี uniqueness ที่ชัดเจน |
| status: PENDING/ACTIVE/DISABLED/EXPIRED | วงจรอนุมัติและเพิกถอนที่ชัดเจน |
| role assignments + wardIds[] | รองรับหลาย Ward ตามงาน; ไม่ต้องใช้ ALL เพื่อหลีกเลี่ยงข้อจำกัดหนึ่ง Ward |
| expiresAt, approvedBy, updatedAt, revision | สิทธิ์ชั่วคราว, หลักฐานอนุมัติ, ตรวจการเปลี่ยนพร้อมกัน |
| sessions/login events และ audit log แยก | login, lastSeen และการแก้สิทธิ์มีความหมายตรวจสอบได้ |

เริ่มจาก schema ง่ายที่รองรับ role เดียวและหลาย Ward ก่อนถ้ายังไม่มีความต้องการหลาย role ใช้ ward ID คงที่แทนชื่อ; การเปลี่ยนชื่อ Ward ไม่ควรต้องแก้สิทธิ์หรือประวัติเคสตามชื่อ การลบ Ward ไม่ควรโยกผู้ใช้ไป Ward ใหม่โดยอัตโนมัติอย่างที่ apiDeleteWard ทำอยู่ ต้องมีการมอบสิทธิ์ใหม่ที่ชัดเจน [Ward deletion](https://github.com/kitzapat-svg/MedReady/blob/9b9efe983fc1479ae140497065a8a5e4c14d34ac/src/Admin.js#L423)

เมื่อใช้ OIDC ให้พิสูจน์ token ฝั่ง server ด้วย signature, aud, iss และ exp; ตรวจ email_verified และ hd ตามนโยบายองค์กร แล้วผูกบัญชีด้วย sub ที่คงที่ การอนุญาตทั้งโดเมนควรเป็นนโยบายรับสมัคร/เชิญ โดยยังต้องมีการอนุมัติ role/scope ก่อนเข้าถึงข้อมูล อย่าให้ suffix email กลายเป็นสิทธิ์ administrator [Google ID-token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)

**การเลือกโครงสร้าง login มีสองแนวทาง:**

| เงื่อนไขผู้ใช้งาน | แนวทางที่เหมาะ | สิ่งที่ต้องพิสูจน์ก่อนใช้ |
|---|---|---|
| ทุกคนอยู่ Google Workspace องค์กรเดียวกัน และต้องการปรับระบบเดิม | คง Apps Script, จำกัด audience ตามองค์กร; พิจารณา deployer execution เพื่อไม่ต้องเปิดชีตให้บุคลากร พร้อม allowlist/policy บนทุก API | ปิด public helper/import ที่ข้าม guard ก่อน, ทดสอบ active email บนบัญชีจริงทุกกลุ่ม, ชีตเข้าถึงเฉพาะ service/operator ที่จำเป็น |
| ใช้ Gmail ส่วนตัว หลายโดเมน หลาย Ward หรือมีข้อกำหนด session ชัดเจน | frontend/backend ที่รองรับ Google OIDC พร้อม session ของแอป และฐาน Users/permissions หลัง backend; Apps Script ใช้เฉพาะงานที่แยกขอบเขตแล้วได้ | ตรวจ token จริง, จัดการ session expiry/revoke/CSRF, เก็บฐานข้อมูลไม่ให้ผู้ใช้เข้าถึงตรง, ทดสอบ migration และ rollback |

Google อธิบายว่า execution as owner กับ execution as accessing user ใช้อำนาจต่างกัน [Apps Script Web Apps](https://developers.google.com/apps-script/guides/web) SETUP แนะนำ USER_DEPLOYING/DOMAIN แต่ source เป็น USER_ACCESSING/ANYONE และไม่มีหลักฐาน deployment จริง อย่าเปลี่ยน executeAs โดยลำพัง เพราะอาจขยายอำนาจให้ endpoint ที่ยังไม่มี guard

สำหรับ session ของแอปใหม่ ใช้ cookie HttpOnly/Secure พร้อม SameSite ที่ตรง flow; server กำหนด idle/absolute expiry, session ID rotation และ revoke เมื่อปิดบัญชี/เปลี่ยนสิทธิ์ โดยตรวจ role/scope จากแหล่งที่เชื่อถือได้ทุก request หรือใช้ policy revision ที่บังคับอัปเดตทันที ไม่เก็บ credential ระยะยาวใน localStorage การ logout ควร revoke session ของ MedReady และล้างข้อมูลหน้าแอป การ redirect Google-wide Logout ปัจจุบันอาจกระทบงาน Google อื่นในเครื่อง ควรแยกออกจากการ logout แอปตามนโยบายการใช้งานเครื่องร่วม

อย่าใช้ cache เป็นหลักฐานอนุญาตที่ stale ได้โดยไม่กำหนดระยะ revocation ที่ยอมรับ รองรับ cache miss/eviction ด้วยการอ่านแหล่งจริงและปฏิเสธเมื่อยืนยันสิทธิ์ไม่ได้; เริ่มจากลดงานอ่าน/เขียนซ้ำภายใน request ก่อนเพิ่ม cache ข้าม request ใช้ retry/backoff เฉพาะ transient failures และมี idempotency สำหรับคำสั่งที่อาจส่งซ้ำ

**ลำดับพัฒนาที่แนะนำ:**

1. ปิดช่อง XSS, public helpers, import ไม่มี sender proof และ cross-Ward fallback; ตรวจ deployment/Sheet ACL ให้ตรงกัน แก้ UNAUTHENTICATED ก่อน denial และเพิ่ม error codes กลาง
2. ทำ database binding คงที่, แยก read authorization/login/lastSeen, ล้างหน้าจอเมื่อ access loss, แก้ last-admin invariant, validate schema/duplicate email/type/ward ทุกจุด
3. เพิ่มหลาย Ward, สิทธิ์หมดอายุ/approval/audit ที่บันทึก actor และ before/after; กำหนด recovery สำหรับ admin lockout และบัญชีเจ้าของ deployment; ลด OAuth scope และแยก maintenance จาก ordinary requests เท่าที่สถาปัตยกรรมรองรับ
4. ถ้าต้องรองรับบัญชีต่างโดเมนหรือ session ชัดเจน ย้าย identity/session และ permissions หลัง backend โดยคง workflow ของ MedReady แล้ว migration เป็นขั้นพร้อมทดสอบและย้อนกลับได้

**เกณฑ์ยอมรับที่ใช้ตรวจงานจริง:**

- บัญชีไม่มี Google identity แสดง login; บัญชีไม่อยู่ในรายชื่อแสดงขอสิทธิ์; inactive แสดงระงับ; database outage แสดง unavailable พร้อม retry ที่เหมาะ
- บัญชี Google หลายบัญชีสลับแล้ว server ระบุตัวคนใหม่ถูกต้อง; refresh ไม่เปลี่ยนผู้ใช้จาก localStorage
- WARD A เข้าถึง Ward B ไม่ได้ทั้ง list/detail/archive/IPD/timeline/flags/direct helpers; zero authorized matches ต้องคืน zero
- ข้อความมีเครื่องหมาย quote/angle bracket แสดงเป็นข้อความในทุกหน้าและไม่รัน script; ปุ่มยังทำงานได้
- ปิดบัญชี/เปลี่ยน scope ขณะ tab เปิดมีผลกับ request ใหม่; UI ล้างข้อมูลทันทีที่ทราบว่าเสียสิทธิ์ และไม่รับ pending response ของตัวตนเก่า
- ทดสอบ role ผิด, email ซ้ำ, ward ว่าง/ไม่รู้จัก, active string ที่ผิด type และ last-admin concurrent changes บนฐานแยก
- production ไม่มี seeder/tests ที่ browser เรียกได้; ผู้ส่ง sync ที่ไม่ถูกต้อง/ส่งซ้ำไม่เปลี่ยนข้อมูล
- การอ่านข้อมูลไม่เขียน Last Login; configured DB ใช้ไม่ได้แล้วระบบหยุดโดยไม่ค้น/สร้างฐานใหม่
- วัดเวลาตรวจสิทธิ์และ error rate เพื่อกำหนดเป้าหมายการใช้งานจริง พร้อม log request ID/reason โดยไม่บันทึก token หรือข้อมูลผู้ป่วยเกินจำเป็น

ชุด Tests ปัจจุบันตรวจ auth เพียง status string และการมี bootstrap และมีการแก้ข้อมูลฐานจริง จึงยังไม่พิสูจน์เกณฑ์เหล่านี้ [Tests](https://github.com/kitzapat-svg/MedReady/blob/9b9efe983fc1479ae140497065a8a5e4c14d34ac/src/Tests.js#L90)

ประเด็นความน่าเชื่อถือเพิ่มเติม: rawAn ถูกส่งถึง browser โดยตรงและการ masking เป็นการแสดงผล ข้อความว่า “ระบบจะเข้ารหัส” ในหน้าส่งผู้ป่วยไม่สอดคล้องกับโค้ด ควรแก้คำอธิบายให้ตรงและทบทวนความจำเป็นของ rawAn ในแต่ละ API [Case response](https://github.com/kitzapat-svg/MedReady/blob/9b9efe983fc1479ae140497065a8a5e4c14d34ac/src/Cases.js#L325), [UI claim](https://github.com/kitzapat-svg/MedReady/blob/9b9efe983fc1479ae140497065a8a5e4c14d34ac/src/views.html#L359)
