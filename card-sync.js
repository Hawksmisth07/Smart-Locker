// ==================== Card Sync Script ====================

// Check authentication
function checkAuth() {
    const sessionUser = sessionStorage.getItem('user');
    const localUser = localStorage.getItem('user');

    if (!sessionUser && !localUser) {
        window.location.href = 'index.html';
        return null;
    }

    return sessionUser ? JSON.parse(sessionUser) : JSON.parse(localUser);
}

// Toast notification
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3500);
}

// Variables
let isSyncing = false;
let countdownInterval = null;
let pollInterval = null;
let countdownValue = 30;
let initialCardUid = null; // Track initial card status to detect new pairing

// Initialize page
document.addEventListener('DOMContentLoaded', function () {
    const user = checkAuth();
    if (!user) return;

    loadCardStatus();
});

// Load user's card status
async function loadCardStatus() {
    const user = checkAuth();
    if (!user) return;

    try {
        const response = await fetch(`/api/user/card-status?userId=${user.id}`);
        const data = await response.json();

        if (data.success && data.hasCard) {
            initialCardUid = data.cardUid; // Store initial card status
            updateCardDisplay(true, data.cardUid);
        } else {
            initialCardUid = null; // No card registered
            updateCardDisplay(false);
        }
    } catch (error) {
        console.log('Could not fetch card status:', error);
        initialCardUid = null;
        updateCardDisplay(false);
    }
}

// Update card display
function updateCardDisplay(hasCard, cardUid = null) {
    const cardNumber = document.getElementById('cardNumber');
    const cardStatusBadge = document.getElementById('cardStatusBadge');
    const cardMessage = document.getElementById('cardMessage');
    const cardVisual = document.querySelector('.card-visual');

    if (hasCard && cardUid) {
        cardNumber.textContent = formatCardUid(cardUid);
        cardStatusBadge.className = 'status-badge registered';
        cardStatusBadge.innerHTML = '<i class="fas fa-check-circle"></i> Terdaftar';
        cardMessage.textContent = 'Kartu RFID Anda sudah terdaftar dan siap digunakan';
        cardVisual.style.opacity = '1';
    } else {
        cardNumber.textContent = 'BELUM TERDAFTAR';
        cardStatusBadge.className = 'status-badge not-registered';
        cardStatusBadge.innerHTML = '<i class="fas fa-times-circle"></i> Belum Terdaftar';
        cardMessage.textContent = 'Anda belum mendaftarkan kartu RFID';
        cardVisual.style.opacity = '0.7';
    }
}

// Format card UID for display
function formatCardUid(uid) {
    if (!uid) return 'XXXX-XXXX';
    // Format: XXXX-XXXX-XXXX
    const clean = uid.replace(/[^A-Fa-f0-9]/g, '').toUpperCase();
    return clean.match(/.{1,4}/g)?.join('-') || uid;
}

// Start synchronization
async function startSync() {
    if (isSyncing) return;

    const user = checkAuth();
    if (!user) return;

    isSyncing = true;
    countdownValue = 120; // Increased to 120s for OTP entry

    // Update UI
    const syncBtn = document.getElementById('syncBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const rfidReader = document.getElementById('rfidReader');
    const countdown = document.getElementById('countdown');
    const countdownNumber = document.getElementById('countdownNumber');
    const readerStatus = document.getElementById('readerStatus');
    const otpContainer = document.getElementById('otpContainer');
    const otpCode = document.getElementById('otpCode');

    syncBtn.disabled = true;
    syncBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Memulai...</span>';
    cancelBtn.style.display = 'flex';

    // Start sync request to backend
    try {
        const response = await fetch('/api/card/start-sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id })
        });

        const data = await response.json();

        if (data.success) {
            // Success!
            rfidReader.classList.add('scanning');
            countdown.style.display = 'flex';
            countdownNumber.textContent = countdownValue;
            readerStatus.querySelector('.status-text').textContent = 'Tempelkan kartu pada reader...';

            // Show OTP
            otpContainer.style.display = 'block';
            otpCode.textContent = data.otp;

            // Update steps
            updateSteps(2);

            // Start polling for card detection and OTP status
            pollInterval = setInterval(() => pollCardStatus(user.id), 1000);

            // Start countdown
            countdownInterval = setInterval(() => {
                countdownValue--;
                countdownNumber.textContent = countdownValue;

                if (countdownValue <= 0) {
                    cancelSync();
                    showToast('Waktu habis! Silakan coba lagi.', 'error');
                }
            }, 1000);

        } else {
            cancelSync();
            showToast(data.message || 'Gagal memulai sinkronisasi', 'error');
        }
    } catch (error) {
        console.log('Sync start error:', error);
        cancelSync();
        showToast('Terjadi kesalahan koneksi', 'error');
    }
}

// Poll for card status
async function pollCardStatus(userId) {
    try {
        const response = await fetch(`/api/card/sync-status?userId=${userId}`);
        const data = await response.json();

        if (data.success) {
            const readerStatus = document.getElementById('readerStatus');

            if (data.status === 'success') {
                // Final success
                onSyncSuccess(data.cardUid);
            } else if (data.status === 'card_exists') {
                // Card already registered to another user
                cancelSync();
                showToast('Kartu ini sudah terdaftar pada akun lain!', 'error');
            } else if (data.status === 'waiting_otp') {
                // Card detected, waiting for keypad entry
                updateSteps(3);
                readerStatus.querySelector('.status-text').textContent = 'Kartu Terdeteksi! Masukkan OTP di Keypad...';
                document.getElementById('rfidReader').classList.remove('scanning'); // Stop pulsing
                // Ensure Ring 3 (outermost) stays green or active to indicate connection
            } else if (data.status === 'expired') {
                cancelSync();
                showToast('Sesi sinkronisasi berakhir.', 'info');
            }
        }
    } catch (error) {
        console.log('Poll error:', error);
    }
}

// Sync success
function onSyncSuccess(cardUid) {
    isSyncing = false;
    clearInterval(countdownInterval);
    clearInterval(pollInterval);

    // Update steps
    updateSteps(4);

    // Reset UI
    resetSyncUI();

    // Update card display
    updateCardDisplay(true, cardUid);

    // Show success modal
    const modal = document.getElementById('successModal');
    const newCardUid = document.getElementById('newCardUid');

    newCardUid.textContent = 'UID: ' + formatCardUid(cardUid);
    modal.classList.add('show');

    showToast('Kartu berhasil didaftarkan!', 'success');
}

// Cancel sync
function cancelSync() {
    isSyncing = false;
    clearInterval(countdownInterval);
    clearInterval(pollInterval);

    resetSyncUI();
    updateSteps(0);

    showToast('Sinkronisasi dibatalkan', 'info');
}

// Reset sync UI
function resetSyncUI() {
    const syncBtn = document.getElementById('syncBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const rfidReader = document.getElementById('rfidReader');
    const countdown = document.getElementById('countdown');
    const readerStatus = document.getElementById('readerStatus');
    const otpContainer = document.getElementById('otpContainer');

    syncBtn.disabled = false;
    syncBtn.innerHTML = '<i class="fas fa-play"></i> <span>Mulai Sinkronisasi</span>';
    cancelBtn.style.display = 'none';

    rfidReader.classList.remove('scanning');
    countdown.style.display = 'none';
    readerStatus.querySelector('.status-text').textContent = 'Siap untuk sinkronisasi';
    otpContainer.style.display = 'none';
}

// Update steps indicator
function updateSteps(activeStep) {
    const steps = ['step1', 'step2', 'step3', 'step4'];

    steps.forEach((stepId, index) => {
        const step = document.getElementById(stepId);
        if (step) {
            step.classList.remove('active', 'done');

            if (index + 1 < activeStep) {
                step.classList.add('done');
            } else if (index + 1 === activeStep) {
                step.classList.add('active');
            }
        }
    });
}

// Close modal
function closeModal() {
    const modal = document.getElementById('successModal');
    modal.classList.remove('show');
}

// Close modal on overlay click
document.addEventListener('DOMContentLoaded', function () {
    const modal = document.getElementById('successModal');
    modal?.addEventListener('click', function (e) {
        if (e.target === this) {
            closeModal();
        }
    });
});