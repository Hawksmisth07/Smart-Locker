# Smart Locker System

Sistem manajemen loker pintar berbasis IoT yang terintegrasi dengan aplikasi web. Proyek ini menggabungkan perangkat keras (RFID, Keypad, LCD, Solenoid) dengan antarmuka web modern untuk pengelolaan dan pemantauan loker secara real-time.

## 🌟 Fitur Utama

- **Akses Berbasis RFID**: Pengguna dapat membuka loker menggunakan kartu RFID yang terdaftar.
- **Autentikasi Dua Faktor (2FA)**: Mendukung verifikasi OTP melalui Keypad fisik untuk keamanan tambahan saat pendaftaran kartu.
- **Dashboard Web**: Antarmuka web yang responsif untuk pengguna melihat status loker dan riwayat penggunaan.
- **Panel Admin**: Fitur lengkap untuk manajemen pengguna, pemantauan status loker, dan log aktivitas.
- **Notifikasi Real-time**: Pembaharuan status loker secara langsung di web menggunakan Socket.IO.
- **Display Interaktif**: Layar LCD 16x2 yang menampilkan status, animasi, dan instruksi kepada pengguna.

## 🛠️ Teknologi yang Digunakan

### Hardware / Kontroller
- **Bahasa**: Python 3
- **Komponen**:
  - Raspberry Pi / SBC lainnya
  - PN532 NFC/RFID Controller (SPI)
  - LCD 16x2 (I2C)
  - Keypad Matrix 4x4
  - Solenoid Lock (dikontrol via Relay/MOSFET)

### Web Application
- **Backend**: Node.js, Express.js
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Database**: MySQL / MariaDB
- **Caching & State**: Redis
- **Komunikasi Real-time**: Socket.IO

## 📋 Prasyarat

Sebelum menjalankan proyek ini, pastikan Anda telah menginstal:

1.  **Node.js** (v14 atau lebih baru)
2.  **Python 3.x**
3.  **MySQL / MariaDB Server**
4.  **Redis Server**

## 🚀 Instalasi & Konfigurasi

1.  **Clone Repository**
    ```bash
    git clone <repository-url>
    cd smart-loker
    ```

2.  **Install Dependencies Web Server**
    ```bash
    npm install
    ```

3.  **Install Dependencies Python**
    Pastikan Anda memiliki pip terinstal, lalu jalankan:
    ```bash
    pip install -r requirements.txt
    # Atau install manual library yang dibutuhkan:
    # pip install mysql-connector-python redis requests adafruit-circuitpython-pn532 adafruit-circuitpython-charlcd smbus2 python-dotenv RPi.GPIO
    ```
    *(Catatan: Sesuaikan library Python dengan environment hardware Anda)*

4.  **Konfigurasi Database**
    - Buat database baru bernama `smart_loker`.
    - Import skema database (jika ada file .sql) atau biarkan aplikasi men-generate tabel yang diperlukan (cek `setup-db.js` atau dokumentasi terkait).

5.  **Konfigurasi Environment Variable**
    Buat file `.env` di root direktori project dan sesuaikan konfigurasi berikut:
    ```env
    # Database Config
    DB_HOST=127.0.0.1
    DB_USER=smartloker
    DB_PASSWORD=password_mu
    DB_NAME=smart_loker
    DB_PORT=3306

    # Redis Config
    REDIS_HOST=127.0.0.1
    REDIS_PORT=6379

    # Server Config
    PORT=3000
    SERVER_URL=http://localhost:3000
    
    # JWT Secret
    JWT_SECRET=rahasia_anda_disini
    ```

## 🖥️ Cara Menjalankan

### 1. Menjalankan Web Server
```bash
npm start
# Atau untuk mode development:
# npm run dev
```
Server akan berjalan di `http://localhost:3000` (atau port yang Anda tentukan).

### 2. Menjalankan Hardware Controller
Buka terminal baru dan jalankan script Python:
```bash
python main.py
```
Script ini akan menginisialisasi hardware (LCD, RFID, Keypad) dan mulai mendengarkan interaksi pengguna.

## 📂 Struktur Proyek

- `server.js`: Entry point untuk web server Node.js.
- `main.py`: Script utama pengendali hardware (Python).
- `public/`: File statis frontend (HTML, CSS, JS).
- `config/`: Konfigurasi koneksi database.
- `routes/`: Definisi rute API (jika dipisah).

## 🤝 Kontribusi

Silakan buat *Pull Request* atau *Issue* jika Anda menemukan bug atau ingin menambahkan fitur baru.

---
Dikembangkan untuk Sistem Smart Loker Polinema.
