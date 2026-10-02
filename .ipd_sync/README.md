# IPD Orders Sync Service

โปรแกรมซิงก์ข้อมูลใบสั่งยา IPD จาก Intranet (Hospital HIS) ไปยัง Google Sheets (`MedReady Database` ชีต `IPD_Orders`)

## ข้อกำหนดเบื้องต้น (Prerequisites)
1. Python 3.8+
2. ติดตั้งแพ็กเกจที่จำเป็น:
   ```bash
   pip install requests gspread google-auth
   ```
3. นำไฟล์ Google Service Account Key วางไว้ที่นี่โดยตั้งชื่อว่า:
   `service_account.json` (ดูตัวอย่างใน `service_account.example.json`)
   * อย่าลืมแชร์สิทธิ์ Edit บน Google Sheet ให้กับ client_email ของ Service Account

## การตั้งค่า (config.json)
ไฟล์ `config.json` ใช้กำหนดค่าการทำงาน:
```json
{
  "ipd_base_url": "http://192.168.0.197:5000",
  "sheet_id": "1-OOO_cdun4sTTP4Ug80OfWqJqvqnlkLg2C87zVw7OwE",
  "worksheet_name": "IPD_Orders",
  "target_wards": ["ตึกพิเศษ"],
  "all_wards": false,
  "only_hme": true
}
```
- `target_wards`: รายชื่อ Ward ที่ต้องการ Sync เช่น `["ตึกพิเศษ", "ตึกชาย"]`
- `all_wards`: ตั้งเป็น `true` เพื่อ Sync ทุก Ward ทั้งหมด
- `only_hme`: ตั้งเป็น `true` เพื่อดึงเฉพาะยากลับบ้าน (HME)

## วิธีการรัน
1. **ดูรายชื่อ Ward ที่มีรายการค้างอยู่ในระบบขณะนี้**:
   ```bash
   python sync.py --list-wards
   ```

2. **Sync ทันทีตามค่าคอนฟิก**:
   ```bash
   python sync.py
   ```

3. **Sync แบบระบุ Ward ผ่านคำสั่ง**:
   ```bash
   python sync.py --wards "ตึกชาย,ตึกพิเศษ"
   # หรือทุก Ward
   python sync.py --all-wards
   ```

4. **รันแบบ Background System Tray บน Windows**:
   - ดับเบิลคลิก `start_sync.bat` (จะเปิดไอคอน System Tray อยู่มุมขวาล่าง ซิงก์อัตโนมัติทุก 60 วินาที)
