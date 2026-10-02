import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

import gspread
import requests
from google.oauth2.service_account import Credentials

# รองรับแสดงผลภาษาไทยใน Windows Console
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


# ===== ตั้งค่าเริ่มต้น =====
BASE_DIR = Path(__file__).resolve().parent
CONFIG_FILE = BASE_DIR / "config.json"
CREDENTIALS_FILE = BASE_DIR / "service_account.json"
STATUS_FILE = BASE_DIR / "sync_status.json"

DEFAULT_IPD_BASE_URL = "http://192.168.0.197:5000"
DEFAULT_SHEET_ID = "1-OOO_cdun4sTTP4Ug80OfWqJqvqnlkLg2C87zVw7OwE"
DEFAULT_WORKSHEET_NAME = "IPD_Orders"
DEFAULT_TARGET_WARDS = ["ตึกพิเศษ"]


def load_config():
    """โหลดการตั้งค่าจาก config.json (ถ้ามี) หรือคืนค่าเริ่มต้น"""
    config = {
        "ipd_base_url": DEFAULT_IPD_BASE_URL,
        "sheet_id": DEFAULT_SHEET_ID,
        "worksheet_name": DEFAULT_WORKSHEET_NAME,
        "target_wards": DEFAULT_TARGET_WARDS,
        "all_wards": False,
        "only_hme": True,
    }
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                user_config = json.load(f)
                config.update(user_config)
        except Exception as e:
            print(f"[คำเตือน] ไม่สามารถอ่าน {CONFIG_FILE.name}: {e}")
    else:
        # บันทึกไฟล์ config.json เริ่มต้น เพื่อให้ผู้ใช้งานแก้ไขได้ง่าย
        try:
            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(config, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    return config


def write_status(status, count=0, message="", wards=None):
    """Write status file for the Windows tray application and monitor tools."""
    payload = {
        "status": status,
        "count": count,
        "message": message,
        "wards": wards or [],
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    temp_file = STATUS_FILE.with_suffix(".tmp")
    temp_file.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    temp_file.replace(STATUS_FILE)


# ===== เชื่อมต่อ Google Sheets =====
def connect_sheet(sheet_id, worksheet_name):
    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
    ]
    creds = Credentials.from_service_account_file(CREDENTIALS_FILE, scopes=scopes)
    client = gspread.authorize(creds)
    sheet = client.open_by_key(sheet_id)

    try:
        worksheet = sheet.worksheet(worksheet_name)
    except gspread.WorksheetNotFound:
        worksheet = sheet.add_worksheet(title=worksheet_name, rows=1000, cols=10)

    return worksheet


# ===== ดึงข้อมูลจาก intranet =====
def fetch_orders(ipd_base_url, endpoint):
    response = requests.get(ipd_base_url + endpoint, timeout=5)
    response.raise_for_status()
    orders = response.json()
    if not isinstance(orders, list):
        raise ValueError(f"Unexpected response from {endpoint}")
    return orders


# ===== แปลง order array เป็น row (PDPA: ไม่เก็บชื่อ-สกุล) =====
def parse_order(order, order_type):
    return [
        order_type,
        order[0],  # AN
        order[6],  # หอผู้ป่วย/ตึก
        order[5],  # เลขเตียง
        order[1],  # วันที่
        order[2],  # เวลา
        order[4],  # ประเภทยา
        datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    ]


# ===== เขียนลง Sheet =====
def update_sheet(worksheet, rows):
    worksheet.clear()
    worksheet.append_row(
        [
            "ประเภท",
            "AN",
            "หอผู้ป่วย",
            "เตียง",
            "วันที่",
            "เวลา",
            "ประเภทยา",
            "อัปเดตล่าสุด",
        ]
    )

    if rows:
        worksheet.append_rows(rows, value_input_option="USER_ENTERED")


def is_ward_match(order_ward, target_wards, all_wards):
    if all_wards:
        return True
    if not target_wards:
        return True
    # ถ้าระบุ 'ALL' ใน list ถือว่าเลือกทุก ward
    if any(str(w).strip().upper() == "ALL" for w in target_wards):
        return True
    return order_ward in target_wards


def sync_once(target_wards=None, all_wards=False, only_hme=True, config=None):
    if config is None:
        config = load_config()

    ipd_base_url = config.get("ipd_base_url", DEFAULT_IPD_BASE_URL)
    sheet_id = config.get("sheet_id", DEFAULT_SHEET_ID)
    worksheet_name = config.get("worksheet_name", DEFAULT_WORKSHEET_NAME)

    worksheet = connect_sheet(sheet_id, worksheet_name)
    new_orders = fetch_orders(ipd_base_url, "/get_new_orders")
    accepted_orders = fetch_orders(ipd_base_url, "/get_accepted_orders")

    rows = []
    for order in new_orders:
        ward = str(order[6]).strip() if len(order) > 6 and order[6] else ""
        med_type = str(order[4]).strip().upper() if len(order) > 4 and order[4] else ""
        if is_ward_match(ward, target_wards, all_wards) and (not only_hme or med_type == "HME"):
            rows.append(parse_order(order, "ใบสั่งยาใหม่"))

    for order in accepted_orders:
        ward = str(order[6]).strip() if len(order) > 6 and order[6] else ""
        med_type = str(order[4]).strip().upper() if len(order) > 4 and order[4] else ""
        if is_ward_match(ward, target_wards, all_wards) and (not only_hme or med_type == "HME"):
            rows.append(parse_order(order, "รับคำสั่งแล้ว"))

    update_sheet(worksheet, rows)
    return len(rows)


def list_available_wards(ipd_base_url):
    """ตรวจสอบ Ward ที่มีใบสั่งยาอยู่ในระบบ Intranet ขณะนี้"""
    print(f"กำลังเชื่อมต่อไปยัง Intranet ({ipd_base_url})...")
    try:
        new_orders = fetch_orders(ipd_base_url, "/get_new_orders")
        accepted_orders = fetch_orders(ipd_base_url, "/get_accepted_orders")
    except Exception as e:
        print(f"เกิดข้อผิดพลาดในการดึงข้อมูลจาก Intranet: {e}")
        return

    ward_summary = {}
    for o in new_orders:
        ward = str(o[6]).strip() if len(o) > 6 and o[6] else "ไม่ระบุ"
        med = str(o[4]).strip().upper() if len(o) > 4 and o[4] else ""
        ward_summary.setdefault(ward, {"new_hme": 0, "new_other": 0, "acc_hme": 0, "acc_other": 0})
        if med == "HME":
            ward_summary[ward]["new_hme"] += 1
        else:
            ward_summary[ward]["new_other"] += 1

    for o in accepted_orders:
        ward = str(o[6]).strip() if len(o) > 6 and o[6] else "ไม่ระบุ"
        med = str(o[4]).strip().upper() if len(o) > 4 and o[4] else ""
        ward_summary.setdefault(ward, {"new_hme": 0, "new_other": 0, "acc_hme": 0, "acc_other": 0})
        if med == "HME":
            ward_summary[ward]["acc_hme"] += 1
        else:
            ward_summary[ward]["acc_other"] += 1

    print("\n--- รายชื่อ Ward ที่พบในระบบขณะนี้ ---")
    if not ward_summary:
        print("  ไม่พบรายการสั่งยาใด ๆ ใน Intranet ขณะนี้")
    else:
        for ward, stat in sorted(ward_summary.items()):
            total = stat["new_hme"] + stat["new_other"] + stat["acc_hme"] + stat["acc_other"]
            hme_total = stat["new_hme"] + stat["acc_hme"]
            print(f"- {ward:20} : {total} รายการ (ยากลับบ้าน HME: {hme_total} รายการ)")
    print("--------------------------------------\n")


def main():
    parser = argparse.ArgumentParser(
        description="IPD Orders Sync Service (Intranet -> MedReady Google Sheets)"
    )
    parser.add_argument(
        "-w",
        "--wards",
        type=str,
        help="ระบุ Ward ที่ต้องการ Sync เช่น --wards 'ตึกพิเศษ,ตึกชาย' หรือ --wards 'ALL'",
    )
    parser.add_argument(
        "-a",
        "--all-wards",
        action="store_true",
        help="Sync ข้อมูลของทุก Ward ทั้งหมด",
    )
    parser.add_argument(
        "--all-meds",
        action="store_true",
        help="Sync ทุกประเภทยา (โดยค่าเริ่มต้นจะ sync เฉพาะยากลับบ้าน HME)",
    )
    parser.add_argument(
        "--list-wards",
        action="store_true",
        help="แสดงรายชื่อ Ward และจำนวนรายการที่มีอยู่ใน Intranet ขณะนี้",
    )

    args = parser.parse_args()

    config = load_config()

    if args.list_wards:
        list_available_wards(config.get("ipd_base_url", DEFAULT_IPD_BASE_URL))
        return

    # ลำดับความสำคัญของ Ward: Argument ใน CLI > config.json
    all_wards = args.all_wards or config.get("all_wards", False)
    if args.wards:
        raw_wards = [w.strip() for w in args.wards.split(",") if w.strip()]
        if any(w.upper() == "ALL" for w in raw_wards):
            all_wards = True
            target_wards = []
        else:
            target_wards = raw_wards
    else:
        target_wards = config.get("target_wards", DEFAULT_TARGET_WARDS)

    only_hme = not args.all_meds if args.all_meds else config.get("only_hme", True)

    ward_desc = "ทุก Ward (ALL)" if all_wards else ", ".join(target_wards)
    print(f"กำลังเริ่ม Sync: Ward = [{ward_desc}], เฉพาะ HME = {only_hme}")

    write_status("syncing", message="Sync in progress", wards=target_wards if not all_wards else ["ALL"])
    try:
        count = sync_once(
            target_wards=target_wards,
            all_wards=all_wards,
            only_hme=only_hme,
            config=config,
        )
    except Exception as error:
        write_status("error", message=str(error), wards=target_wards if not all_wards else ["ALL"])
        print(f"เกิดข้อผิดพลาดในการ Sync: {error}")
        raise

    write_status("ok", count=count, message="Sync completed", wards=target_wards if not all_wards else ["ALL"])
    print(f"อัปเดต {count} รายการ สำเร็จ เวลา {datetime.now().strftime('%H:%M:%S')}")


if __name__ == "__main__":
    main()
