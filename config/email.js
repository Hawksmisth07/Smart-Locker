const nodemailer = require('nodemailer');
require('dotenv').config();

// Create Gmail SMTP transporter
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
    }
});

// Verify SMTP connection
async function verifyEmailConnection() {
    try {
        await transporter.verify();
        console.log('✅ Gmail SMTP connected successfully');
    } catch (error) {
        console.error('❌ Gmail SMTP connection failed:', error.message);
        console.log('⚠️  Please check your SMTP credentials in .env file');
    }
}

// Send OTP email with modern HTML template
async function sendOTPEmail(email, otp) {
    const mailOptions = {
        from: `"Password Reset" <${process.env.SMTP_FROM}>`,
        to: email,
        subject: 'Password Reset - OTP Code',
        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background: linear-gradient(135deg, #1E3C72 0%, #2A5298 100%);
            margin: 0;
            padding: 20px;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        .header {
            background: linear-gradient(135deg, #1E3C72 0%, #2A5298 100%);
            padding: 40px 20px;
            text-align: center;
            color: white;
        }
        .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 600;
        }
        .content {
            padding: 40px 30px;
        }
        .otp-box {
            background: linear-gradient(135deg, #1E3C72 0%, #36D1DC 100%);
            border-radius: 12px;
            padding: 30px;
            text-align: center;
            margin: 30px 0;
        }
        .otp-code {
            font-size: 48px;
            font-weight: 700;
            color: white;
            letter-spacing: 8px;
            margin: 0;
            font-family: 'Courier New', monospace;
        }
        .warning {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
            color: #856404;
        }
        .footer {
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 14px;
            border-top: 1px solid #eee;
        }
        p {
            margin: 10px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔐 Password Reset Request</h1>
        </div>
        <div class="content">
            <p>Hello,</p>
            <p>You requested to reset your password. Use the OTP code below to verify your identity:</p>
            
            <div class="otp-box">
                <p class="otp-code">${otp}</p>
            </div>
            
            <div class="warning">
                <strong>⚠️ Important:</strong> This OTP code will expire in <strong>1 minute</strong>. Please use it immediately.
            </div>
            
            <p>If you didn't request this password reset, please ignore this email. Your password will remain unchanged.</p>
        </div>
        <div class="footer">
            <p>This is an automated message, please do not reply.</p>
            <p>&copy; 2025 Smart Locker System</p>
        </div>
    </div>
</body>
</html>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('📧 Email sent successfully:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Email sending failed:', error.message);
        throw error;
    }
}

// Send Report Email to Admin
async function sendReportEmail(reportData) {
    const { type, email, message, reportId } = reportData;

    const typeLabels = {
        'bug': '🐛 Bug / Error',
        'login': '🔐 Masalah Login',
        'register': '📝 Masalah Registrasi',
        'locker': '🔒 Masalah Locker',
        'suggestion': '💡 Saran / Feedback',
        'other': '📋 Lainnya'
    };

    const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_FROM;

    if (!adminEmail) {
        console.log('⚠️ No admin email configured, skipping report notification');
        return { success: false, message: 'No admin email configured' };
    }

    const mailOptions = {
        from: `"Smart Loker System" <${process.env.SMTP_FROM}>`,
        to: adminEmail,
        subject: `[LAPORAN #${reportId}] ${typeLabels[type] || type}`,
        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #1E3C72, #2A5298); padding: 30px; text-align: center; color: white; }
        .header h1 { margin: 0; font-size: 24px; }
        .header .badge { display: inline-block; background: rgba(255,255,255,0.2); padding: 8px 16px; border-radius: 20px; margin-top: 15px; font-size: 14px; }
        .content { padding: 30px; }
        .info-row { display: flex; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #eee; }
        .info-label { color: #666; width: 120px; font-weight: 600; }
        .info-value { color: #333; flex: 1; }
        .message-box { background: #f8f9fa; border-left: 4px solid #1E3C72; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0; }
        .message-box h3 { margin: 0 0 10px 0; color: #1E3C72; font-size: 14px; }
        .message-box p { margin: 0; color: #333; line-height: 1.6; white-space: pre-wrap; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; background: #f8f9fa; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📩 Laporan Baru Diterima</h1>
            <div class="badge">${typeLabels[type] || type}</div>
        </div>
        <div class="content">
            <div class="info-row">
                <div class="info-label">ID Laporan:</div>
                <div class="info-value"><strong>#${reportId}</strong></div>
            </div>
            <div class="info-row">
                <div class="info-label">Jenis:</div>
                <div class="info-value">${typeLabels[type] || type}</div>
            </div>
            <div class="info-row">
                <div class="info-label">Email Pelapor:</div>
                <div class="info-value">${email || '<em>Tidak disertakan</em>'}</div>
            </div>
            <div class="info-row">
                <div class="info-label">Waktu:</div>
                <div class="info-value">${new Date().toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' })}</div>
            </div>
            <div class="message-box">
                <h3>Pesan Laporan:</h3>
                <p>${message}</p>
            </div>
        </div>
        <div class="footer">
            <p>Email ini dikirim otomatis oleh Smart Loker System</p>
        </div>
    </div>
</body>
</html>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('📧 Report email sent to admin:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Report email sending failed:', error.message);
        // Don't throw - report is already saved to database
        return { success: false, error: error.message };
    }
}

// Send Locker Duration Warning Email
async function sendLockerWarningEmail(userData) {
    const { email, name, lockerId, durationHours, warningLevel, remainingHours } = userData;

    if (!email) {
        console.log('⚠️ No email provided for locker warning');
        return { success: false, message: 'No email provided' };
    }

    const warningColors = {
        'medium': { bg: '#fef3c7', border: '#f59e0b', text: '#92400e', icon: '⚠️' },
        'high': { bg: '#fed7aa', border: '#ea580c', text: '#9a3412', icon: '🔶' },
        'critical': { bg: '#fee2e2', border: '#ef4444', text: '#991b1b', icon: '🚨' }
    };

    const colors = warningColors[warningLevel] || warningColors['medium'];

    const mailOptions = {
        from: `"Smart Loker System" <${process.env.SMTP_FROM}>`,
        to: email,
        subject: `${colors.icon} Peringatan: Locker #${lockerId} sudah digunakan ${durationHours} jam`,
        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #1E3C72, #2A5298); padding: 30px; text-align: center; color: white; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { padding: 30px; }
        .warning-box { background: ${colors.bg}; border-left: 4px solid ${colors.border}; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0; }
        .warning-box h3 { margin: 0 0 10px 0; color: ${colors.text}; font-size: 18px; }
        .warning-box p { margin: 0; color: ${colors.text}; line-height: 1.6; }
        .info-box { background: #f0f9ff; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e0f2fe; }
        .info-row:last-child { border-bottom: none; }
        .info-label { color: #64748b; }
        .info-value { color: #1e3a8a; font-weight: 600; }
        .cta-btn { display: inline-block; background: linear-gradient(135deg, #1E3C72, #36D1DC); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 20px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; background: #f8f9fa; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔒 Peringatan Penggunaan Locker</h1>
        </div>
        <div class="content">
            <p>Halo <strong>${name || 'Pengguna'}</strong>,</p>
            
            <div class="warning-box">
                <h3>${colors.icon} Peringatan Durasi Penggunaan</h3>
                <p>Locker #${lockerId} Anda sudah digunakan selama <strong>${durationHours} jam</strong>. 
                ${remainingHours > 0 ? `Sisa waktu tersedia: <strong>${remainingHours} jam</strong>.` : 'Batas waktu maksimal sudah tercapai!'}</p>
            </div>
            
            <div class="info-box">
                <div class="info-row">
                    <span class="info-label">Nomor Locker:</span>
                    <span class="info-value">#${lockerId}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Durasi Penggunaan:</span>
                    <span class="info-value">${durationHours} jam</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Batas Maksimal:</span>
                    <span class="info-value">24 jam</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Sisa Waktu:</span>
                    <span class="info-value">${remainingHours > 0 ? remainingHours + ' jam' : 'Sudah habis'}</span>
                </div>
            </div>
            
            <p>Silakan kembalikan locker jika sudah selesai digunakan agar dapat digunakan oleh pengguna lain.</p>
            
            <center>
                <a href="${process.env.APP_URL || 'http://localhost:3000'}/dashboard.html" class="cta-btn">
                    Buka Dashboard
                </a>
            </center>
        </div>
        <div class="footer">
            <p>Email ini dikirim otomatis oleh Smart Loker System</p>
            <p>&copy; 2025 Smart Loker</p>
        </div>
    </div>
</body>
</html>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`📧 Locker warning email sent to ${email}:`, info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Locker warning email failed:', error.message);
        return { success: false, error: error.message };
    }
}

// Send 27-hour takeover warning email
async function sendTakeoverWarningEmail(userData) {
    const { email, name, lockerId, durationHours } = userData;

    if (!email) {
        console.log('⚠️ No email provided for takeover warning');
        return { success: false, message: 'No email provided' };
    }

    const mailOptions = {
        from: `"Smart Loker System" <${process.env.SMTP_FROM}>`,
        to: email,
        subject: `🚨 PERINGATAN: Barang di Locker #${lockerId} Akan Diambil Admin`,
        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #dc2626, #b91c1c); padding: 30px; text-align: center; color: white; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { padding: 30px; }
        .critical-box { background: #fee2e2; border-left: 4px solid #dc2626; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0; }
        .critical-box h3 { margin: 0 0 10px 0; color: #991b1b; font-size: 18px; }
        .critical-box p { margin: 0; color: #991b1b; line-height: 1.6; }
        .info-box { background: #fef2f2; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #fecaca; }
        .info-row:last-child { border-bottom: none; }
        .info-label { color: #991b1b; }
        .info-value { color: #7f1d1d; font-weight: 600; }
        .cta-btn { display: inline-block; background: linear-gradient(135deg, #dc2626, #b91c1c); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 20px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; background: #f8f9fa; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚨 PERINGATAN KRITIS</h1>
        </div>
        <div class="content">
            <p>Halo <strong>${name || 'Pengguna'}</strong>,</p>
            
            <div class="critical-box">
                <h3>⚠️ Barang Anda Akan Diambil Admin!</h3>
                <p>Locker #${lockerId} Anda sudah digunakan selama <strong>${durationHours} jam</strong>, 
                melebihi batas waktu maksimal 24 jam. Admin akan segera mengambil barang Anda dari locker.</p>
            </div>
            
            <div class="info-box">
                <div class="info-row">
                    <span class="info-label">Nomor Locker:</span>
                    <span class="info-value">#${lockerId}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Durasi Penggunaan:</span>
                    <span class="info-value">${durationHours} jam (melebihi batas)</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Status:</span>
                    <span class="info-value">Menunggu pengambilan admin</span>
                </div>
            </div>
            
            <p><strong>Untuk mengambil barang Anda kembali:</strong></p>
            <p>Silakan hubungi admin melalui dashboard atau datang langsung ke kantor admin.</p>
            
            <center>
                <a href="${process.env.APP_URL || 'http://localhost:3000'}/dashboard.html" class="cta-btn">
                    Hubungi Admin
                </a>
            </center>
        </div>
        <div class="footer">
            <p>Email ini dikirim otomatis oleh Smart Loker System</p>
            <p>&copy; 2025 Smart Loker</p>
        </div>
    </div>
</body>
</html>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`📧 Takeover warning email sent to ${email}:`, info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Takeover warning email failed:', error.message);
        return { success: false, error: error.message };
    }
}

// Send item confiscated email
async function sendItemConfiscatedEmail(userData) {
    const { email, name, lockerId, confiscatedAt, adminNote } = userData;

    if (!email) {
        console.log('⚠️ No email provided for confiscation notification');
        return { success: false, message: 'No email provided' };
    }

    const mailOptions = {
        from: `"Smart Loker System" <${process.env.SMTP_FROM}>`,
        to: email,
        subject: `📦 Barang Anda dari Locker #${lockerId} Telah Disita Admin`,
        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #7c3aed, #6d28d9); padding: 30px; text-align: center; color: white; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { padding: 30px; }
        .notice-box { background: #f3e8ff; border-left: 4px solid #7c3aed; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0; }
        .notice-box h3 { margin: 0 0 10px 0; color: #6d28d9; font-size: 18px; }
        .notice-box p { margin: 0; color: #6d28d9; line-height: 1.6; }
        .info-box { background: #faf5ff; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e9d5ff; }
        .info-row:last-child { border-bottom: none; }
        .info-label { color: #7c3aed; }
        .info-value { color: #581c87; font-weight: 600; }
        .steps-box { background: #f0fdf4; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .steps-box h4 { color: #166534; margin: 0 0 15px 0; }
        .steps-box ol { margin: 0; padding-left: 20px; color: #166534; }
        .steps-box li { margin-bottom: 10px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; background: #f8f9fa; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📦 Barang Telah Disita</h1>
        </div>
        <div class="content">
            <p>Halo <strong>${name || 'Pengguna'}</strong>,</p>
            
            <div class="notice-box">
                <h3>📦 Barang Anda Telah Diambil Admin</h3>
                <p>Barang dari Locker #${lockerId} Anda telah disita oleh admin karena penggunaan locker melebihi batas waktu maksimal.</p>
            </div>
            
            <div class="info-box">
                <div class="info-row">
                    <span class="info-label">Nomor Locker:</span>
                    <span class="info-value">#${lockerId}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Waktu Penyitaan:</span>
                    <span class="info-value">${confiscatedAt || new Date().toLocaleString('id-ID')}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Status:</span>
                    <span class="info-value">Barang disimpan oleh admin</span>
                </div>
                ${adminNote ? `
                <div class="info-row">
                    <span class="info-label">Catatan Admin:</span>
                    <span class="info-value">${adminNote}</span>
                </div>
                ` : ''}
            </div>
            
            <div class="steps-box">
                <h4>📋 Cara Mengambil Barang Anda:</h4>
                <ol>
                    <li>Hubungi admin melalui dashboard atau datang langsung</li>
                    <li>Tunjukkan identitas Anda (KTM/ID Card)</li>
                    <li>Admin akan menyerahkan barang Anda</li>
                </ol>
            </div>
            
            <p>Kami mohon maaf atas ketidaknyamanan ini. Harap perhatikan batas waktu penggunaan locker di masa mendatang.</p>
        </div>
        <div class="footer">
            <p>Email ini dikirim otomatis oleh Smart Loker System</p>
            <p>&copy; 2025 Smart Loker</p>
        </div>
    </div>
</body>
</html>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`📧 Item confiscated email sent to ${email}:`, info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Item confiscated email failed:', error.message);
        return { success: false, error: error.message };
    }
}

// Export all email-related functions
module.exports = {
    transporter,
    verifyEmailConnection,
    sendOTPEmail,
    sendReportEmail,
    sendLockerWarningEmail,
    sendTakeoverWarningEmail,
    sendItemConfiscatedEmail
};
