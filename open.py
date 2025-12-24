#!/usr/bin/env python3
"""
open.py - Script untuk membuka semua loker
Mengirim command 1 dan 2 ke semua alamat slave I2C
"""

import time
from smbus2 import SMBus

# Alamat slave I2C
SLAVE_ADDRESSES = [0x08, 0x09, 0x0A, 0x0B, 0x0C]

# Commands untuk membuka loker
CMD_OPEN_A = 1  # Membuka loker A (atas)
CMD_OPEN_B = 2  # Membuka loker B (bawah)

def open_all_lockers():
    """Membuka semua loker dengan mengirim command 1 dan 2 ke semua slave"""
    try:
        i2c_bus = SMBus(1)
        print("✅ I2C Bus Connected")
        print("=" * 50)
        print("🔓 MEMBUKA SEMUA LOKER...")
        print("=" * 50)
        
        for addr in SLAVE_ADDRESSES:
            try:
                # Kirim command 1 untuk membuka loker A
                i2c_bus.write_byte(addr, CMD_OPEN_A)
                print(f"✅ Sent CMD {CMD_OPEN_A} to Slave {hex(addr)} - Loker A terbuka")
                time.sleep(2)  # Delay 2 detik untuk setiap loker
                
                # Kirim command 2 untuk membuka loker B
                i2c_bus.write_byte(addr, CMD_OPEN_B)
                print(f"✅ Sent CMD {CMD_OPEN_B} to Slave {hex(addr)} - Loker B terbuka")
                time.sleep(2)  # Delay 2 detik untuk setiap loker
                
            except Exception as e:
                print(f"❌ Error pada Slave {hex(addr)}: {e}")
        
        print("=" * 50)
        print("🎉 SEMUA LOKER SUDAH DIBUKA!")
        print("=" * 50)
        
        i2c_bus.close()
        
    except Exception as e:
        print(f"❌ I2C Bus Error: {e}")

if __name__ == "__main__":
    print("\n" + "=" * 50)
    print("   SMART LOKER - OPEN ALL LOCKERS")
    print("=" * 50 + "\n")
    
    open_all_lockers()
