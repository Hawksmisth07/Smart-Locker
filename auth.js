// API Base URL
const API_URL = '/api';

// State Management
let currentStep = 'email';
let userEmail = '';
let countdownInterval = null;
let resendCountdownInterval = null;

// DOM Elements
const steps = {
    email: document.getElementById('step-email'),
    otp: document.getElementById('step-otp'),
    reset: document.getElementById('step-reset'),
    success: document.getElementById('step-success')
};

// Forms
const emailForm = document.getElementById('email-form');
const otpForm = document.getElementById('otp-form');
const resetForm = document.getElementById('reset-form');

// Buttons
const sendOtpBtn = document.getElementById('send-otp-btn');
const verifyOtpBtn = document.getElementById('verify-otp-btn');
const resetPasswordBtn = document.getElementById('reset-password-btn');
const resendOtpBtn = document.getElementById('resend-otp-btn');

// OTP Inputs
const otpInputs = document.querySelectorAll('.otp-input');

// Password Toggle
const togglePasswordBtns = document.querySelectorAll('.toggle-password');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    setupOTPInputs();
    setupPasswordToggles();
});

// Setup Event Listeners
function setupEventListeners() {
    emailForm.addEventListener('submit', handleEmailSubmit);
    otpForm.addEventListener('submit', handleOTPSubmit);
    resetForm.addEventListener('submit', handleResetSubmit);
    resendOtpBtn.addEventListener('click', handleResendOTP);
}

// Setup OTP Inputs
function setupOTPInputs() {
    otpInputs.forEach((input, index) => {
        // Auto-focus next input
        input.addEventListener('input', (e) => {
            const value = e.target.value;

            // Only allow numbers
            if (!/^\d*$/.test(value)) {
                e.target.value = '';
                return;
            }

            // Move to next input
            if (value && index < otpInputs.length - 1) {
                otpInputs[index + 1].focus();
            }
        });

        // Handle backspace
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value && index > 0) {
                otpInputs[index - 1].focus();
            }
        });

        // Handle paste
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pastedData = e.clipboardData.getData('text').replace(/\D/g, '');

            for (let i = 0; i < pastedData.length && index + i < otpInputs.length; i++) {
                otpInputs[index + i].value = pastedData[i];
            }

            // Focus last filled input
            const lastIndex = Math.min(index + pastedData.length - 1, otpInputs.length - 1);
            otpInputs[lastIndex].focus();
        });
    });
}

// Setup Password Toggles
function setupPasswordToggles() {
    togglePasswordBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            const input = document.getElementById(targetId);
            const eyeIcon = btn.querySelector('.eye-icon');
            const eyeOffIcon = btn.querySelector('.eye-off-icon');

            if (input.type === 'password') {
                input.type = 'text';
                eyeIcon.classList.add('hidden');
                eyeOffIcon.classList.remove('hidden');
            } else {
                input.type = 'password';
                eyeIcon.classList.remove('hidden');
                eyeOffIcon.classList.add('hidden');
            }
        });
    });
}

// Navigate to Step
function navigateToStep(step) {
    Object.keys(steps).forEach(key => {
        steps[key].classList.remove('active');
    });
    steps[step].classList.add('active');
    currentStep = step;
}

// Show Notification
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    const messageEl = document.getElementById('notification-message');

    messageEl.textContent = message;
    notification.className = `notification ${type} show`;

    setTimeout(() => {
        notification.classList.remove('show');
    }, 5000);
}

// Set Button Loading State
function setButtonLoading(button, loading) {
    if (loading) {
        button.classList.add('loading');
        button.disabled = true;
    } else {
        button.classList.remove('loading');
        button.disabled = false;
    }
}

// Handle Email Submit
async function handleEmailSubmit(e) {
    e.preventDefault();

    const emailInput = document.getElementById('email');
    const email = emailInput.value.trim();

    if (!email) {
        showNotification('Silakan masukkan email', 'error');
        return;
    }

    setButtonLoading(sendOtpBtn, true);

    try {
        const response = await fetch(`${API_URL}/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const data = await response.json();

        if (data.success) {
            userEmail = email;
            document.getElementById('user-email').textContent = email;
            showNotification(data.message, 'success');
            navigateToStep('otp');
            startCountdown(data.expirySeconds || 60);
            startResendCountdown(data.expirySeconds || 60);
            otpInputs[0].focus();
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Gagal mengirim OTP. Pastikan server berjalan.', 'error');
    } finally {
        setButtonLoading(sendOtpBtn, false);
    }
}

// Start OTP Countdown Timer
function startCountdown(seconds) {
    let timeLeft = seconds;
    const countdownEl = document.getElementById('countdown');

    // Clear existing interval
    if (countdownInterval) clearInterval(countdownInterval);

    countdownInterval = setInterval(() => {
        timeLeft--;

        const minutes = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        countdownEl.textContent = `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        if (timeLeft <= 0) {
            clearInterval(countdownInterval);
            countdownEl.textContent = 'Kode OTP Kadaluarsa';
            countdownEl.style.color = 'var(--error-color)';
            showNotification('Kode OTP telah kadaluarsa. Silakan kirim ulang.', 'error');
        }
    }, 1000);
}

// Start Resend Countdown
function startResendCountdown(seconds) {
    let timeLeft = seconds;
    const resendCountdownEl = document.getElementById('resend-countdown');

    resendOtpBtn.disabled = true;

    // Clear existing interval
    if (resendCountdownInterval) clearInterval(resendCountdownInterval);

    resendCountdownInterval = setInterval(() => {
        timeLeft--;
        resendCountdownEl.textContent = timeLeft;

        if (timeLeft <= 0) {
            clearInterval(resendCountdownInterval);
            resendOtpBtn.disabled = false;
            resendOtpBtn.innerHTML = 'Kirim Ulang';
        }
    }, 1000);
}

// Handle OTP Submit
async function handleOTPSubmit(e) {
    e.preventDefault();

    const otp = Array.from(otpInputs).map(input => input.value).join('');

    if (otp.length !== 6) {
        showNotification('Silakan masukkan 6 digit kode OTP', 'error');
        return;
    }

    setButtonLoading(verifyOtpBtn, true);

    try {
        const response = await fetch(`${API_URL}/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: userEmail, otp })
        });

        const data = await response.json();

        if (data.success) {
            showNotification(data.message, 'success');
            clearInterval(countdownInterval);
            clearInterval(resendCountdownInterval);
            navigateToStep('reset');
            document.getElementById('new-password').focus();
        } else {
            showNotification(data.message, 'error');
            // Clear OTP inputs on error
            otpInputs.forEach(input => input.value = '');
            otpInputs[0].focus();
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Gagal memverifikasi OTP', 'error');
    } finally {
        setButtonLoading(verifyOtpBtn, false);
    }
}

// Handle Resend OTP
async function handleResendOTP() {
    setButtonLoading(resendOtpBtn, true);

    try {
        const response = await fetch(`${API_URL}/resend-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: userEmail })
        });

        const data = await response.json();

        if (data.success) {
            showNotification(data.message, 'success');
            // Reset countdown
            const countdownEl = document.getElementById('countdown');
            countdownEl.style.color = 'var(--primary-color)';
            startCountdown(data.expirySeconds || 60);
            startResendCountdown(data.expirySeconds || 60);
            // Clear OTP inputs
            otpInputs.forEach(input => input.value = '');
            otpInputs[0].focus();
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Gagal mengirim ulang OTP', 'error');
    } finally {
        setButtonLoading(resendOtpBtn, false);
    }
}

// Handle Reset Password Submit
async function handleResetSubmit(e) {
    e.preventDefault();

    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    // Validation
    if (newPassword.length < 8) {
        showNotification('Password minimal 8 karakter', 'error');
        return;
    }

    if (newPassword !== confirmPassword) {
        showNotification('Password tidak cocok', 'error');
        return;
    }

    setButtonLoading(resetPasswordBtn, true);

    try {
        const response = await fetch(`${API_URL}/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: userEmail,
                newPassword
            })
        });

        const data = await response.json();

        if (data.success) {
            showNotification(data.message, 'success');
            navigateToStep('success');
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Gagal mereset password', 'error');
    } finally {
        setButtonLoading(resetPasswordBtn, false);
    }
}
