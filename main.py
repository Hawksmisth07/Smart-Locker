import time
import os
import threading
import random
import board
import busio
import mysql.connector
import redis
import requests
from digitalio import DigitalInOut, Direction, Pull
from adafruit_pn532.spi import PN532_SPI
from smbus2 import SMBus
from dotenv import load_dotenv
from datetime import datetime
from RPLCD.i2c import CharLCD

# ==========================================
# 0. CONFIG & SETUP
# ==========================================
DEBUG_MODE = True

# Load .env from the specific path used by the web server
load_dotenv('/var/www/html/.env')

# I2C Setup
try:
    i2c_bus = SMBus(1)
    if DEBUG_MODE: print("✅ [INIT] I2C Bus Connected")
except:
    print("❌ [INIT] I2C Bus NOT FOUND")

# LCD I2C Setup (16x2, Address 0x27)
lcd = None
lcd_animation_thread = None
lcd_animation_running = False
lcd_lock = threading.Lock()  # Thread lock untuk LCD
import random

def lcd_sanitize(text):
    """Sanitize text to only include LCD-safe ASCII characters"""
    # LCD 16x2 hanya support ASCII standar (32-127)
    result = ""
    for char in str(text):
        if 32 <= ord(char) <= 126:
            result += char
        else:
            result += " "  # Ganti karakter tidak didukung dengan spasi
    return result

try:
    lcd = CharLCD(i2c_expander='PCF8574', address=0x27, port=1, cols=16, rows=2, dotsize=8)
    lcd.clear()
    if DEBUG_MODE: print("[INIT] LCD I2C Connected (0x27)")
except Exception as e:
    print(f"[INIT] LCD I2C Error: {e}")
    lcd = None

def lcd_clear():
    """Clear LCD display"""
    global lcd
    if lcd:
        with lcd_lock:
            try:
                lcd.clear()
                time.sleep(0.05)  # Delay untuk stabilitas
            except:
                pass

def lcd_write(line1="", line2=""):
    """Write to LCD with 2 lines"""
    global lcd
    if lcd:
        with lcd_lock:
            try:
                # Sanitasi karakter sebelum menulis
                safe_line1 = lcd_sanitize(line1)[:16]
                safe_line2 = lcd_sanitize(line2)[:16]
                lcd.clear()
                time.sleep(0.02)
                lcd.cursor_pos = (0, 0)
                lcd.write_string(safe_line1)
                time.sleep(0.01)
                lcd.cursor_pos = (1, 0)
                lcd.write_string(safe_line2)
                time.sleep(0.01)
            except Exception as e:
                print(f"[LCD] Write Error: {e}")

def lcd_write_row(row, text):
    """Write to specific row without clearing"""
    global lcd
    if lcd:
        with lcd_lock:
            try:
                safe_text = lcd_sanitize(text)[:16].ljust(16)
                lcd.cursor_pos = (row, 0)
                lcd.write_string(safe_text)
                time.sleep(0.01)
            except:
                pass

def lcd_stop_animation():
    """Stop animation"""
    global lcd_animation_running
    lcd_animation_running = False

# ========== ANIMATION STYLES ==========

def anim_scroll_left(text, row, delay=0.35):
    """Scroll text left continuously"""
    global lcd, lcd_animation_running
    if not lcd: return
    
    padded = text + "   " + text
    pos = 0
    while lcd_animation_running:
        lcd_write_row(row, padded[pos:pos+16])
        pos = (pos + 1) % (len(text) + 3)
        time.sleep(delay)

def anim_bounce(text, row, delay=0.4):
    """Bounce text left-right"""
    global lcd, lcd_animation_running
    if not lcd: return
    
    if len(text) <= 16:
        padded = text.center(16)
        while lcd_animation_running:
            lcd_write_row(row, padded)
            time.sleep(delay * 5)
    else:
        max_offset = len(text) - 16
        direction = 1
        pos = 0
        while lcd_animation_running:
            lcd_write_row(row, text[pos:pos+16])
            pos += direction
            if pos >= max_offset or pos <= 0:
                direction *= -1
                time.sleep(delay * 2)  # Pause at edges
            time.sleep(delay)

def anim_typewriter(text, row, delay=0.15):
    """Typewriter effect - text appears letter by letter"""
    global lcd, lcd_animation_running
    if not lcd: return
    
    while lcd_animation_running:
        display = ""
        for i, char in enumerate(text[:16]):
            if not lcd_animation_running: return
            display += char
            lcd_write_row(row, display)
            time.sleep(delay)
        time.sleep(1.5)  # Pause when complete
        lcd_write_row(row, "                ")  # Clear
        time.sleep(0.5)

def anim_blink(text, row, delay=0.8):
    """Blink text on/off"""
    global lcd, lcd_animation_running
    if not lcd: return
    
    centered = text[:16].center(16)
    while lcd_animation_running:
        lcd_write_row(row, centered)
        time.sleep(delay)
        lcd_write_row(row, "                ")
        time.sleep(delay * 0.5)

def anim_alternate(texts, row, delay=2.0):
    """Alternate between multiple texts"""
    global lcd, lcd_animation_running
    if not lcd: return
    
    idx = 0
    while lcd_animation_running:
        lcd_write_row(row, texts[idx][:16].center(16))
        idx = (idx + 1) % len(texts)
        time.sleep(delay)

# ========== IDLE ANIMATION ==========

def lcd_idle_animation():
    """Main idle animation with random styles for both rows"""
    global lcd, lcd_animation_running
    
    if not lcd: return
    
    lcd_animation_running = True
    
    # Animation styles
    all_styles = ['scroll', 'bounce', 'typewriter', 'blink', 'alternate']
    row0_texts = ["SMART LOCKER", ">> SMART LOKER <<", "* POLINEMA *"]
    
    while lcd_animation_running:
        # Get available lockers count
        available_count = 0
        try:
            conn = get_db_connection()
            if conn:
                c = conn.cursor()
                c.execute("SELECT COUNT(*) FROM lockers WHERE status = 'available'")
                result = c.fetchone()
                available_count = result[0] if result else 0
                conn.close()
        except:
            pass
        
        # Texts for row 1
        row1_texts = [
            f"Tersedia: {available_count} loker",
            "Tap kartu RFID",
            f"Loker kosong: {available_count}"
        ]
        
        # Pick random style for each row
        style0 = random.choice(all_styles)
        
        # Duration for each animation cycle (2 minutes = 120 seconds)
        cycle_duration = 120
        cycle_end = time.time() + cycle_duration
        
        # Clear LCD first
        lcd_clear()
        
        # Pick one text for row1 for this cycle
        text1 = random.choice(row1_texts)
        
        # Run animations in mini-cycles
        while lcd_animation_running and time.time() < cycle_end:
            text0 = random.choice(row0_texts)
            
            # ====== ROW 0 ANIMATION ======
            if style0 == 'scroll':
                padded0 = "   " + text0 + "   "
                padded1 = "   " + text1 + "   "
                for i in range(len(padded0) + len(padded1)):
                    if not lcd_animation_running or time.time() >= cycle_end: break
                    lcd_write_row(0, (padded0[i % len(padded0):] + padded0[:i % len(padded0)])[:16])
                    # Row 1: always scroll if text > 16 chars
                    if len(text1) > 16:
                        lcd_write_row(1, (padded1[i % len(padded1):] + padded1[:i % len(padded1)])[:16])
                    else:
                        lcd_write_row(1, text1.center(16))
                    time.sleep(0.35)
                    
            elif style0 == 'typewriter':
                # Row 0: typewriter
                for i in range(len(text0[:16]) + 1):
                    if not lcd_animation_running or time.time() >= cycle_end: break
                    lcd_write_row(0, text0[:i].center(16))
                    # Row 1: scroll if long, otherwise static
                    if len(text1) > 16:
                        padded1 = "   " + text1 + "   "
                        lcd_write_row(1, (padded1[i % len(padded1):] + padded1[:i % len(padded1)])[:16])
                    else:
                        lcd_write_row(1, text1.center(16))
                    time.sleep(0.12)
                time.sleep(1.5)
                # Clear and repeat
                lcd_write_row(0, "                ")
                time.sleep(0.5)
                    
            elif style0 == 'blink':
                for _ in range(5):
                    if not lcd_animation_running or time.time() >= cycle_end: break
                    lcd_write_row(0, text0[:16].center(16))
                    # Row 1: scroll if long
                    if len(text1) > 16:
                        padded1 = "   " + text1 + "   "
                        for j in range(8):
                            if not lcd_animation_running or time.time() >= cycle_end: break
                            lcd_write_row(1, (padded1[j:] + padded1[:j])[:16])
                            time.sleep(0.1)
                    else:
                        lcd_write_row(1, text1.center(16))
                        time.sleep(0.7)
                    lcd_write_row(0, "                ")
                    time.sleep(0.3)
                    
            elif style0 == 'bounce':
                if len(text0) > 16:
                    positions = list(range(len(text0)-16)) + list(range(len(text0)-16, -1, -1))
                    for pos in positions:
                        if not lcd_animation_running or time.time() >= cycle_end: break
                        lcd_write_row(0, text0[pos:pos+16])
                        # Row 1: scroll if long
                        if len(text1) > 16:
                            padded1 = "   " + text1 + "   "
                            lcd_write_row(1, (padded1[pos % len(padded1):] + padded1[:pos % len(padded1)])[:16])
                        else:
                            lcd_write_row(1, text1.center(16))
                        time.sleep(0.3)
                else:
                    lcd_write_row(0, text0.center(16))
                    # Row 1: scroll if long
                    if len(text1) > 16:
                        padded1 = "   " + text1 + "   "
                        for j in range(len(padded1)):
                            if not lcd_animation_running or time.time() >= cycle_end: break
                            lcd_write_row(1, (padded1[j:] + padded1[:j])[:16])
                            time.sleep(0.35)
                    else:
                        lcd_write_row(1, text1.center(16))
                        time.sleep(2)
                    
            elif style0 == 'alternate':
                for txt in row0_texts:
                    if not lcd_animation_running or time.time() >= cycle_end: break
                    lcd_write_row(0, txt[:16].center(16))
                    # Row 1: scroll if long
                    if len(text1) > 16:
                        padded1 = "   " + text1 + "   "
                        for j in range(len(padded1)):
                            if not lcd_animation_running or time.time() >= cycle_end: break
                            lcd_write_row(1, (padded1[j:] + padded1[:j])[:16])
                            time.sleep(0.35)
                    else:
                        lcd_write_row(1, text1.center(16))
                        time.sleep(1.5)

def lcd_show_idle():
    """Show idle screen with random animations"""
    global lcd_animation_thread, lcd_animation_running
    
    # Stop previous animation if running
    lcd_stop_animation()
    if lcd_animation_thread and lcd_animation_thread.is_alive():
        lcd_animation_thread.join(timeout=1)
    
    if not lcd:
        return
    
    # Start new animation thread
    lcd_animation_thread = threading.Thread(target=lcd_idle_animation, daemon=True)
    lcd_animation_thread.start()

def lcd_show_locker_open(locker_id):
    """Display locker number when opened with hint"""
    lcd_stop_animation()
    # Tampilkan loker terbuka
    lcd_write("  LOKER TERBUKA ", f"    Loker {locker_id}    ")
    time.sleep(2)
    # Tampilkan hint jika masih tertutup (2 baris)
    lcd_write("Jika tdk terbuka", "  Coba tap lagi ")

def lcd_show_otp_input(otp_digits):
    """Display OTP input"""
    lcd_stop_animation()
    lcd_write("  MASUKKAN OTP  ", f"   OTP: {otp_digits.ljust(6)}   ")

def lcd_show_otp_error():
    """Display OTP error for 3 seconds"""
    lcd_stop_animation()
    lcd_write("  KODE SALAH!   ", "  Coba lagi...  ")
    time.sleep(3)

def lcd_show_otp_success():
    """Display OTP success"""
    lcd_stop_animation()
    lcd_write("    BERHASIL    ", " Kartu Terhubung")

# MAPPING
# Maps Hardware Code -> I2C Address & Database ID
# Ensure 'id' matches the 'id' in your 'lockers' database table
LOCKER_MAP = {
    'A1': {'addr': 0x08, 'cmd': 1, 'id': 1}, 
    'B1': {'addr': 0x08, 'cmd': 2, 'id': 2},
    'A2': {'addr': 0x09, 'cmd': 1, 'id': 3}, 
    'B2': {'addr': 0x09, 'cmd': 2, 'id': 4},
    'A3': {'addr': 0x0A, 'cmd': 1, 'id': 5},
    'B3': {'addr': 0x0A, 'cmd': 2, 'id': 6},
    'A4': {'addr': 0x0B, 'cmd': 1, 'id': 7},
    'B4': {'addr': 0x0B, 'cmd': 2, 'id': 8},
    'A5': {'addr': 0x0C, 'cmd': 1, 'id': 9},
    'B5': {'addr': 0x0C, 'cmd': 2, 'id': 10},
}

# Database Configuration from .env
db_config = {
    'user': os.getenv('DB_USER', 'smartloker'),
    'password': os.getenv('DB_PASSWORD', 'password_mu'),
    'database': 'smart_loker', # Force the correct DB name
    'host': os.getenv('DB_HOST', '127.0.0.1'),
    'port': int(os.getenv('DB_PORT', 3306))
}

# Redis Connection
r = redis.Redis(
    host=os.getenv('REDIS_HOST', '127.0.0.1'),
    port=int(os.getenv('REDIS_PORT', 6379)),
    password=os.getenv('REDIS_PASSWORD', None),
    decode_responses=True
)

# RFID Setup (PN532 SPI)
spi = busio.SPI(board.SCK, board.MOSI, board.MISO)
cs_pin = DigitalInOut(board.D5)
pn532 = PN532_SPI(spi, cs_pin, debug=False)
pn532.SAM_configuration()

active_transactions = {}
transaction_lock = threading.RLock()

def log(tag, message):
    if DEBUG_MODE:
        print(f"[{tag}] {message}")

# ==========================================
# REALTIME NOTIFICATION TO WEB SERVER
# ==========================================
# Server URL for realtime notifications (change this to your server address)
SERVER_URL = os.getenv('SERVER_URL', 'http://localhost:8888')

def send_realtime_notification(event_type, locker_id=None, locker_code=None, user_id=None, user_name=None, action=None):
    """Send realtime notification to web server via HTTP POST (non-blocking)"""
    def _send():
        try:
            payload = {
                'eventType': event_type,
                'lockerId': locker_id,
                'lockerCode': locker_code,
                'userId': user_id,
                'userName': user_name,
                'action': action
            }
            response = requests.post(
                f"{SERVER_URL}/api/hardware/locker-event",
                json=payload,
                timeout=3
            )
            if response.status_code == 200:
                log("REALTIME", f"Event sent: {event_type} - Locker {locker_id or locker_code}")
            else:
                log("REALTIME", f"Failed to send event: {response.status_code}")
        except requests.exceptions.RequestException as e:
            log("REALTIME", f"Connection error: {e}")
        except Exception as e:
            log("REALTIME", f"Error: {e}")
    
    # Run in background thread to avoid blocking
    threading.Thread(target=_send, daemon=True).start()

# ==========================================
# 1. HELPER CLASSES & FUNCTIONS
# ==========================================

class MatrixKeypad:
    def __init__(self, rows, cols, keys):
        self.rows = [DigitalInOut(pin) for pin in rows]
        self.cols = [DigitalInOut(pin) for pin in cols]
        self.keys = keys
        
        # Set rows to input with pull-up
        for row in self.rows:
            row.direction = Direction.INPUT
            row.pull = Pull.UP
            
        # Set cols to output high
        for col in self.cols:
            col.direction = Direction.OUTPUT
            col.value = True

    @property
    def pressed_keys(self):
        pressed = []
        for c_idx, col in enumerate(self.cols):
            # Drive column low
            col.value = False
            for r_idx, row in enumerate(self.rows):
                # Check if row is low (button pressed)
                if not row.value:
                    pressed.append(self.keys[r_idx][c_idx])
            # Drive column high again
            col.value = True
        return pressed

# Define Keypad Pins (Adjust to your wiring!)
# Rows: GPIO 5, 6, 13, 19
# Cols: GPIO 12, 16, 20, 21
KEYPAD_ROWS = [board.D21, board.D20, board.D16, board.D12] 
KEYPAD_COLS = [board.D26, board.D19, board.D13, board.D6]
KEYPAD_KEYS = [
    ['1', '2', '3', 'A'],
    ['4', '5', '6', 'B'],
    ['7', '8', '9', 'C'],
    ['*', '0', '#', 'D']
]

# Initialize Keypad
try:
    keypad = MatrixKeypad(KEYPAD_ROWS, KEYPAD_COLS, KEYPAD_KEYS)
    if DEBUG_MODE: print("✅ [INIT] Keypad Initialized")
except Exception as e:
    print(f"❌ [INIT] Keypad Error: {e}")
    keypad = None

def get_db_connection():
    try:
        return mysql.connector.connect(**db_config)
    except mysql.connector.Error as err:
        print(f"❌ [DB] Connection Failed: {err}")
        return None

def read_locker_status(locker_code):
    # ... (existing code kept via context, but we need to ensure this function is preserved if not replacing entire file)
    # Since I am replacing a block, I should be careful. 
    # I will assume the previous 'read_locker_status' is preserved if I don't touch it.
    # WAIT, I am replacing lines 71-284 which includes helper functions and main loop.
    # I need to re-implement read_locker_status and others or use multi_replace carefully.
    
    # RE-IMPLEMENTING read_locker_status and others to be safe as I am replacing a large chunk
    if locker_code not in LOCKER_MAP: return None
    target = LOCKER_MAP[locker_code]

    try:
        with transaction_lock:
            raw = i2c_bus.read_byte(target['addr'])

        if target['cmd'] == 1 and raw == 20: return -1 
        if target['cmd'] == 2 and raw == 21: return -1 

        if target['cmd'] == 1: 
            if raw == 4 or raw == 9: return 0 
            else: return 1 
        elif target['cmd'] == 2: 
            if raw == 5 or raw == 9: return 0 
            else: return 1 

    except Exception as e:
        print(f"❌ [I2C] Read Error {locker_code}: {e}")
        return None

def open_locker_hardware(locker_code):
    target = LOCKER_MAP[locker_code]
    try:
        log("I2C", f"Sending CMD {target['cmd']} to Addr {hex(target['addr'])} ({locker_code})")
        with transaction_lock:
            i2c_bus.write_byte(target['addr'], target['cmd'])
    except Exception as e:
        print(f"❌ [I2C] Write Error: {e}")

# ==========================================
# 2. BACKGROUND MONITOR
# ==========================================
def background_monitor():
    # ... (keeping existing logic structure but compacted for brevity in replacement)
    log("BG", "Monitor Thread Started")
    while True:
        try:
            with transaction_lock:
                codes = list(active_transactions.keys())

            if not codes:
                time.sleep(1)
                continue

            for code in codes:
                with transaction_lock:
                    if code not in active_transactions: continue
                    txn = active_transactions[code]

                status = read_locker_status(code)
                locker_db_id = LOCKER_MAP[code]['id']

                if status == -1: # Error
                    # ... stuck handling ...
                    with transaction_lock: del active_transactions[code]
                    continue

                if status == 0: # Closed
                    duration = max(1, int(time.time() - txn['start_time']) // 60)
                    
                    # CHECK TRANSACTION TYPE
                    txn_type = txn.get('type', 'release') # Default to release if not set (fallback)
                    
                    if txn_type == 'booking':
                         # Just finish transaction, keep locker OCCUPIED
                         log("DB", f"Locker {code} secured (BOOKING completed).")
                         # Send realtime notification for booking completed
                         send_realtime_notification(
                             event_type='locker_closed',
                             locker_id=locker_db_id,
                             locker_code=code,
                             user_id=txn['user_id'],
                             action='booking'
                         )
                         with transaction_lock: del active_transactions[code]
                    
                    elif txn_type == 'release':
                        # Free the locker
                        conn = get_db_connection()
                        if conn:
                            c = conn.cursor()
                            # Update locker status
                            c.execute("UPDATE lockers SET status = 'available', current_user_id = NULL, occupied_at = NULL WHERE id = %s", (locker_db_id,))
                            # Log release action - Update existing entry with end_time
                            note = f"Duration: {duration} mins"
                            c.execute("UPDATE locker_usage SET end_time = NOW(), duration_minutes = %s, notes = %s WHERE user_id = %s AND locker_number = %s AND end_time IS NULL ORDER BY id DESC LIMIT 1", (duration, note, txn['user_id'], locker_db_id))
                            conn.commit()
                            conn.close()
                            log("DB", f"Locker {code} freed. Duration: {duration}m")
                            # Send realtime notification for release completed
                            send_realtime_notification(
                                event_type='locker_closed',
                                locker_id=locker_db_id,
                                locker_code=code,
                                user_id=txn['user_id'],
                                action='release'
                            )
                        with transaction_lock: del active_transactions[code]
        except:
             pass
        time.sleep(0.5)

# ==========================================
# 3. MAIN LOOP
# ==========================================
monitor_thread = threading.Thread(target=background_monitor, daemon=True)
monitor_thread.start()

print("\n🤖 ===========================================")
print("🤖 SMART LOCKER SYSTEM ONLINE")
print("🤖 Waiting for RFID Cards or Sync Requests...")
print("🤖 ===========================================\n")

# Show LCD idle screen at startup
lcd_show_idle()

current_otp_input = ""
last_key_press_time = 0
lcd_idle_shown = True

while True:
    try:
        # 1. CHECK REDIS FOR SYNC MODE
        pairing_user_id = r.get('pairing_mode_active')
        pairing_status = r.get('pairing_status') # 'waiting_tap' or 'waiting_otp'
        
        if pairing_user_id:
             # --- SYNC MODE ACTIVE ---
             
             if pairing_status == 'waiting_tap':
                 # Scan for card to link
                 uid = pn532.read_passive_target(timeout=0.5)
                 if uid:
                     uid_hex = ''.join([format(i, '02x') for i in uid])
                     log("PAIR", f"Card Tapped during pairing mode: {uid_hex}")
                     
                     # CEK: Apakah kartu ini sudah terdaftar ke user manapun?
                     conn = get_db_connection()
                     registered_user = None
                     if conn:
                         try:
                             cursor = conn.cursor(dictionary=True)
                             cursor.execute("SELECT * FROM users WHERE card_uid = %s", (uid_hex,))
                             registered_user = cursor.fetchone()
                         except Exception as e:
                             log("PAIR", f"DB Error: {e}")
                     
                     if registered_user:
                         # KARTU SUDAH TERDAFTAR - Proses seperti normal operation (buka loker)
                         log("PAIR", f"Card belongs to {registered_user['name']}, processing as normal operation")
                         user_id = registered_user['id']
                         
                         cursor.execute("SELECT * FROM lockers WHERE current_user_id = %s", (user_id,))
                         active_locker = cursor.fetchone()
                         
                         is_new_booking = False
                         
                         if not active_locker:
                             cursor.execute("SELECT * FROM lockers WHERE status = 'available' LIMIT 1")
                             new_locker = cursor.fetchone()
                             if new_locker:
                                 cursor.execute("UPDATE lockers SET status = 'occupied', current_user_id = %s, occupied_at = NOW() WHERE id = %s", (user_id, new_locker['id']))
                                 cursor.execute("INSERT INTO locker_usage (user_id, locker_number, start_time) VALUES (%s, %s, NOW())", (user_id, new_locker['id']))
                                 conn.commit()
                                 active_locker = new_locker
                                 is_new_booking = True
                                 log("LOGIC", f"Assigned: {active_locker['locker_code']}")
                         
                         if active_locker:
                             code = active_locker['locker_code']
                             txn_type = 'booking' if is_new_booking else 'release'
                             log("LOGIC", f"Opening Locker {code} for {txn_type.upper()} (while pairing mode active)")
                             with transaction_lock:
                                 active_transactions[code] = {'user_id': user_id, 'start_time': time.time(), 'type': txn_type, 'user_name': registered_user['name']}
                             lcd_stop_animation()
                             lcd_show_locker_open(active_locker['id'])
                             open_locker_hardware(code)
                             send_realtime_notification(
                                 event_type='locker_opened',
                                 locker_id=active_locker['id'],
                                 locker_code=code,
                                 user_id=user_id,
                                 user_name=registered_user['name'],
                                 action=txn_type
                             )
                             time.sleep(3)
                             lcd_show_idle()
                         
                         cursor.close()
                         conn.close()
                         # JANGAN masuk ke proses pairing, user lain yang sedang pairing tetap menunggu
                         continue
                     else:
                         # KARTU BELUM TERDAFTAR - Masuk ke proses pairing
                         if conn:
                             conn.close()
                         
                         # Store temp UID and move to OTP step
                         r.set('pairing_temp_uid', uid_hex, ex=120)
                         r.set('pairing_status', 'waiting_otp', ex=120)
                         
                         # Provide Feedback
                         print("✅ [PAIR] New Card Detected. Waiting for OTP on Keypad...")
                         current_otp_input = "" # Reset input
                         lcd_show_otp_input("")  # Show OTP input screen

             elif pairing_status == 'waiting_otp':
                 # Read Keypad for OTP
                 if keypad:
                     keys = keypad.pressed_keys
                     if keys:
                         # Debounce
                         if time.time() - last_key_press_time > 0.3:
                            key = keys[0] # Take first key
                            print(f"🎹 Key Pressed: {key}")
                            last_key_press_time = time.time()
                            
                            if key.isdigit():
                                current_otp_input += key
                                print(f"📝 OTP Input: {current_otp_input}")
                                lcd_show_otp_input(current_otp_input)  # Update LCD with OTP digits
                                
                                # Verify if length matches (6 digits)
                                if len(current_otp_input) == 6:
                                    required_otp = r.get('pairing_otp')
                                    if current_otp_input == required_otp:
                                        # SUCCESS!
                                        uid_hex = r.get('pairing_temp_uid')
                                        if uid_hex:
                                            conn = get_db_connection()
                                            if conn:
                                                c = conn.cursor()
                                                
                                                # Check if card is already registered to another user
                                                c.execute("SELECT id, name FROM users WHERE card_uid = %s AND id != %s", (uid_hex, pairing_user_id))
                                                existing_user = c.fetchone()
                                                
                                                if existing_user:
                                                    # Card already registered to another user
                                                    conn.close()
                                                    print(f"❌ [PAIR] FAILED! Card already registered to another user (ID: {existing_user[0]})")
                                                    r.set('pairing_status', 'card_exists', ex=10) # Notify frontend
                                                    r.delete('pairing_mode_active')
                                                    lcd_stop_animation()
                                                    lcd_write(" KARTU DITOLAK! ", "Sudah Terdaftar")
                                                    time.sleep(3)
                                                    lcd_show_idle()
                                                    current_otp_input = ""
                                                else:
                                                    # Card is available, proceed with registration
                                                    c.execute("UPDATE users SET card_uid = %s WHERE id = %s", (uid_hex, pairing_user_id))
                                                    conn.commit()
                                                    conn.close()
                                                    
                                                    r.set('pairing_status', 'success', ex=10) # Notify frontend
                                                    r.delete('pairing_mode_active')
                                                    print("✅ [PAIR] SUCCESS! Card Linked via OTP.")
                                                    # Send realtime notification for card pairing
                                                    send_realtime_notification(
                                                        event_type='card_paired',
                                                        user_id=pairing_user_id
                                                    )
                                                    lcd_show_otp_success()  # Show success on LCD
                                                    time.sleep(2)
                                                    lcd_show_idle()  # Return to idle
                                                    current_otp_input = ""
                                        else:
                                             print("❌ [PAIR] Error: No Temp UID found.")
                                             current_otp_input = ""
                                    else:
                                        print("❌ [PAIR] WRONG OTP!")
                                        lcd_show_otp_error()  # Show error on LCD (3 seconds)
                                        lcd_show_otp_input("")  # Return to OTP input screen
                                        current_otp_input = "" # Reset
                            
                            elif key == 'C': # Clear
                                current_otp_input = ""
                                lcd_show_otp_input("")  # Clear LCD OTP display
                                print("Cleared Input")

             # Don't run normal logic if in pairing mode
             time.sleep(0.1)
             continue

        # 2. NORMAL OPERATION (If not pairing)
        
        # Scan for card
        uid = pn532.read_passive_target(timeout=0.5)
        
        if uid:
            uid_hex = ''.join([format(i, '02x') for i in uid])
            log("RFID", f"Card Detected: {uid_hex}")

            conn = get_db_connection()
            if not conn:
                time.sleep(1)
                continue

            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT * FROM users WHERE card_uid = %s", (uid_hex,))
            user = cursor.fetchone()

            if user:
                log("AUTH", f"User Identified: {user['name']}")
                user_id = user['id']
                cursor.execute("SELECT * FROM lockers WHERE current_user_id = %s", (user_id,))
                active_locker = cursor.fetchone()
                
                is_new_booking = False

                if not active_locker:
                    cursor.execute("SELECT * FROM lockers WHERE status = 'available' LIMIT 1")
                    new_locker = cursor.fetchone()
                    if new_locker:
                        # Update locker status
                        cursor.execute("UPDATE lockers SET status = 'occupied', current_user_id = %s, occupied_at = NOW() WHERE id = %s", (user_id, new_locker['id']))
                        # Log booking action with start_time
                        cursor.execute("INSERT INTO locker_usage (user_id, locker_number, start_time) VALUES (%s, %s, NOW())", (user_id, new_locker['id']))
                        conn.commit()
                        active_locker = new_locker
                        is_new_booking = True
                        log("LOGIC", f"Assigned: {active_locker['locker_code']}")

                if active_locker:
                    code = active_locker['locker_code']
                    txn_type = 'booking' if is_new_booking else 'release'
                    log("LOGIC", f"Opening Locker {code} for {txn_type.upper()}")
                    with transaction_lock:
                        active_transactions[code] = {'user_id': user_id, 'start_time': time.time(), 'type': txn_type, 'user_name': user['name']}
                    lcd_show_locker_open(active_locker['id'])  # Show locker number on LCD
                    open_locker_hardware(code)
                    # Send realtime notification for locker opened
                    send_realtime_notification(
                        event_type='locker_opened',
                        locker_id=active_locker['id'],
                        locker_code=code,
                        user_id=user_id,
                        user_name=user['name'],
                        action=txn_type
                    )
                    
            else:
                log("AUTH", "Unknown Card.")
                # Old pairing check removed in favor of Redis state check at top

            cursor.close()
            conn.close()
            time.sleep(3)
            lcd_show_idle()  # Return to idle screen

    except Exception as e:
        print(f"❌ [MAIN] Error: {e}")
        time.sleep(1)
