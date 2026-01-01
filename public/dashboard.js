// ==================== Smart Locker Dashboard Script ====================

// ==================== SOCKET.IO REAL-TIME CONNECTION ====================
let socket = null;

function initSocketIO() {
    // Connect to Socket.IO server
    socket = io({
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });

    socket.on('connect', () => {
        console.log('✅ Connected to real-time server');
        showToast('Terhubung ke server real-time', 'success');
    });

    socket.on('disconnect', () => {
        console.log('❌ Disconnected from real-time server');
    });

    socket.on('connected', (data) => {
        console.log('📡 Server message:', data.message);
    });

    // Listen for locker updates
    socket.on('locker:update', (data) => {
        console.log('🔄 Real-time locker update:', data);
        handleLockerUpdate(data);
    });

    // Listen for stats updates
    socket.on('stats:update', (data) => {
        console.log('📊 Real-time stats update:', data);
        updateStats();
    });
}

// Handle real-time locker updates
function handleLockerUpdate(data) {
    const { lockerId, status, userId, action } = data;

    // Find and update the locker in our local data
    const locker = lockers.find(l => l.id === lockerId);
    if (locker) {
        const currentUser = getUserData();

        if (status === 'occupied' && userId === currentUser?.id) {
            locker.status = 'yours';
        } else {
            locker.status = status;
        }
        locker.userId = userId;

        // Re-render lockers and update stats
        renderLockers();
        updateStats();

        // Show notification for other users' actions
        if (userId !== currentUser?.id) {
            if (action === 'release') {
                showToast(`Locker #${lockerId} tersedia kembali`, 'info');
            } else if (status === 'occupied') {
                showToast(`Locker #${lockerId} sedang digunakan`, 'info');
            }
        }
    } else {
        // Locker not in cache, refresh all data
        initLockers();
    }
}

// ==================== USER DATA FUNCTIONS ====================

// Get user data from session/localStorage
function getUserData() {
    const sessionUser = sessionStorage.getItem('user');
    const localUser = localStorage.getItem('user');

    if (sessionUser) {
        return JSON.parse(sessionUser);
    } else if (localUser) {
        return JSON.parse(localUser);
    }
    return null;
}

// Check if user is logged in
function checkAuth() {
    const user = getUserData();
    if (!user) {
        // Redirect to login if not authenticated
        window.location.href = 'index.html';
        return null;
    }
    return user;
}

// Initialize user info display
function initUserInfo() {
    const user = checkAuth();
    if (!user) return;

    // Update all user name displays
    const welcomeName = document.getElementById('welcomeUserName');
    const navUserName = document.getElementById('navUserName');
    const sidebarUserName = document.getElementById('sidebarUserName');
    const sidebarUserNim = document.getElementById('sidebarUserNim');

    if (welcomeName) welcomeName.textContent = user.name || 'User';
    if (navUserName) navUserName.textContent = user.name || 'User';
    if (sidebarUserName) sidebarUserName.textContent = user.name || 'User';
    if (sidebarUserNim) sidebarUserNim.textContent = `NIM: ${user.nim || '-'}`;
}

// Format time
function formatTime(date) {
    return date.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

// Format date
function formatDate(date) {
    return date.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

// Update clock
function updateClock() {
    const now = new Date();
    const timeDisplay = document.getElementById('currentTime');
    const dateDisplay = document.getElementById('currentDate');

    if (timeDisplay) timeDisplay.textContent = formatTime(now);
    if (dateDisplay) dateDisplay.textContent = formatDate(now);
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

    // Remove after animation
    setTimeout(() => {
        toast.remove();
    }, 3500);
}

// Locker data (fetched from backend)
let lockers = [];
let userActiveLocker = null;

async function initLockers() {
    const user = getUserData();
    const grid = document.getElementById('lockerGrid');

    // Show loading state
    if (grid) {
        grid.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> Memuat data loker...</div>';
    }

    try {
        // Fetch lockers from API
        const response = await fetch('/api/lockers');
        const data = await response.json();

        if (data.success) {
            // Map API response to local format
            lockers = data.lockers.map(locker => ({
                id: locker.id,
                lockerCode: locker.lockerCode,
                status: locker.status,
                userId: locker.currentUserId,
                userName: locker.userName
            }));

            // Check if current user has an active locker
            if (user) {
                const myLocker = lockers.find(l => l.userId === user.id);
                if (myLocker) {
                    myLocker.status = 'yours';
                    userActiveLocker = {
                        lockerId: myLocker.id,
                        lockerCode: myLocker.lockerCode,
                        startTime: formatTime(new Date()),
                        startTimestamp: new Date().toISOString()
                    };
                }
            }

            // Also check localStorage for saved locker (for booking state)
            const savedLocker = localStorage.getItem('userActiveLocker');
            if (savedLocker && !userActiveLocker) {
                const lockerData = JSON.parse(savedLocker);
                userActiveLocker = lockerData;

                // Mark that locker as user's
                const locker = lockers.find(l => l.id === lockerData.lockerId);
                if (locker) {
                    locker.status = 'yours';
                    locker.userId = user?.id;
                }
            }
        } else {
            console.error('Failed to fetch lockers:', data.message);
            showToast('Gagal memuat data loker', 'error');
        }
    } catch (error) {
        console.error('Error fetching lockers:', error);
        showToast('Gagal memuat data loker', 'error');
    }

    renderLockers();
    updateStats();
    updateActiveLockerCard();
}


function renderLockers() {
    const grid = document.getElementById('lockerGrid');
    if (!grid) return;

    grid.innerHTML = '';

    lockers.forEach(locker => {
        const box = document.createElement('div');
        box.className = `locker-box ${locker.status === 'occupied' ? 'occupied' : ''} ${locker.status === 'yours' ? 'yours' : ''}`;

        box.innerHTML = `
            <div class="locker-number">${locker.id}</div>
            <div class="locker-status">${getStatusText(locker.status)}</div>
        `;

        if (locker.status === 'available') {
            box.onclick = () => showToast('Gunakan kartu RFID untuk menggunakan locker ini', 'info');
        } else if (locker.status === 'yours') {
            box.onclick = () => showToast('Ini adalah locker Anda saat ini', 'info');
        } else if (locker.status === 'occupied') {
            box.onclick = () => showToast('Locker sedang digunakan', 'info');
        }

        grid.appendChild(box);
    });
}

function getStatusText(status) {
    switch (status) {
        case 'available': return 'Tersedia';
        case 'occupied': return 'Terisi';
        case 'yours': return 'Milik Anda';
        default: return status;
    }
}

function updateStats() {
    const total = lockers.length;
    const available = lockers.filter(l => l.status === 'available').length;
    const occupied = lockers.filter(l => l.status === 'occupied' || l.status === 'yours').length;

    const totalEl = document.getElementById('totalCount');
    const availableEl = document.getElementById('availableCount');
    const occupiedEl = document.getElementById('occupiedCount');

    if (totalEl) totalEl.textContent = total;
    if (availableEl) availableEl.textContent = available;
    if (occupiedEl) occupiedEl.textContent = occupied;
}

function updateActiveLockerCard() {
    const card = document.getElementById('activeLockerCard');
    if (!card) return;

    if (userActiveLocker) {
        card.style.display = 'block';

        document.getElementById('activeLockerNumber').textContent = userActiveLocker.lockerId;
        document.getElementById('startTime').textContent = userActiveLocker.startTime;
        document.getElementById('duration').textContent = calculateDuration(userActiveLocker.startTimestamp);
    } else {
        card.style.display = 'none';
    }
}

function calculateDuration(startTimestamp) {
    const start = new Date(startTimestamp);
    const now = new Date();
    const diff = now - start;

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
        return `${hours} jam ${minutes} menit`;
    }
    return `${minutes} menit`;
}


async function releaseLocker() {
    if (!userActiveLocker) return;

    const user = getUserData();
    if (!user) {
        showToast('Anda harus login terlebih dahulu', 'error');
        return;
    }

    try {
        // Call API to release locker in database
        const response = await fetch('/api/lockers/release', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                lockerId: userActiveLocker.lockerId,
                userId: user.id
            })
        });

        const data = await response.json();

        if (!data.success) {
            showToast(data.message || 'Gagal mengembalikan locker', 'error');
            return;
        }

        // Update local locker status
        const locker = lockers.find(l => l.id === userActiveLocker.lockerId);
        if (locker) {
            locker.status = 'available';
            locker.userId = null;
        }

        // Clear active locker
        localStorage.removeItem('userActiveLocker');
        userActiveLocker = null;

        // Update UI
        renderLockers();
        updateStats();
        updateActiveLockerCard();

        showToast('Locker berhasil dikembalikan!', 'success');

    } catch (error) {
        console.error('Error releasing locker:', error);
        showToast('Terjadi kesalahan saat mengembalikan locker', 'error');
    }
}

// Help Modal
function openHelpModal() {
    const modal = document.getElementById('helpModal');
    modal.classList.add('active');
}

function closeHelpModal() {
    const modal = document.getElementById('helpModal');
    modal.classList.remove('active');
}

// Logout function
function logout() {
    // Clear user data
    sessionStorage.removeItem('user');
    localStorage.removeItem('user');
    localStorage.removeItem('userActiveLocker');

    showToast('Logout berhasil!', 'success');

    setTimeout(() => {
        window.location.href = 'index.html';
    }, 1000);
}

// Sidebar toggle
function initSidebar() {
    const threeDotsMenu = document.getElementById('threeDotsMenu');
    const sidebarPopup = document.getElementById('sidebarPopup');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const sidebarClose = document.getElementById('sidebarClose');

    function openSidebar() {
        sidebarPopup.classList.add('active');
        sidebarOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeSidebar() {
        sidebarPopup.classList.remove('active');
        sidebarOverlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    if (threeDotsMenu) threeDotsMenu.addEventListener('click', openSidebar);
    if (sidebarClose) sidebarClose.addEventListener('click', closeSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);
}

// User dropdown toggle
function initUserDropdown() {
    const userMenu = document.getElementById('userMenu');
    const userDropdown = document.getElementById('userDropdown');

    if (userMenu && userDropdown) {
        userMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            userMenu.classList.toggle('active');
            userDropdown.classList.toggle('active');
        });

        document.addEventListener('click', () => {
            userMenu.classList.remove('active');
            userDropdown.classList.remove('active');
        });
    }
}

// Initialize everything on DOM ready
document.addEventListener('DOMContentLoaded', function () {
    // Check authentication first
    const user = checkAuth();
    if (!user) return;

    // Initialize user info
    initUserInfo();

    // Initialize Socket.IO for real-time updates
    initSocketIO();

    // Start clock
    updateClock();
    setInterval(updateClock, 1000);

    // Initialize lockers
    initLockers();

    // Initialize sidebar
    initSidebar();

    // Initialize user dropdown
    initUserDropdown();

    // Event listeners for modals
    const releaseBtnEl = document.getElementById('releaseBtn');
    const helpBtn = document.getElementById('helpBtn');
    const closeHelpModalBtn = document.getElementById('closeHelpModal');
    const closeHelpBtn = document.getElementById('closeHelpBtn');

    if (releaseBtnEl) releaseBtnEl.addEventListener('click', releaseLocker);
    if (helpBtn) helpBtn.addEventListener('click', openHelpModal);
    if (closeHelpModalBtn) closeHelpModalBtn.addEventListener('click', closeHelpModal);
    if (closeHelpBtn) closeHelpBtn.addEventListener('click', closeHelpModal);

    // Logout buttons
    const logoutBtn = document.getElementById('logoutBtn');
    const logoutBtnDesktop = document.getElementById('logoutBtnDesktop');

    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }

    if (logoutBtnDesktop) {
        logoutBtnDesktop.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }

    // Close modals on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeHelpModal();
        }
    });

    document.getElementById('helpModal')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) {
            closeHelpModal();
        }
    });

    // Update duration every minute
    setInterval(() => {
        if (userActiveLocker) {
            document.getElementById('duration').textContent = calculateDuration(userActiveLocker.startTimestamp);
        }
    }, 60000);

    // Initialize locker duration warning system
    initLockerWarningSystem();

    console.log('✅ Smart Locker Dashboard initialized');
});

// ==================== Locker Duration Warning System ====================

let warningAcknowledged = false;
let lastWarningLevel = 'none';

async function checkLockerDuration() {
    const user = getUserData();
    if (!user) return;

    try {
        const response = await fetch(`/api/lockers/check-duration?userId=${user.id}`);
        const data = await response.json();

        if (!data.success || !data.hasActiveLocker) {
            return;
        }

        // Update active locker card with warning badge if needed
        updateWarningBadge(data);

        // Show warning modal if needed and not already acknowledged for this level
        if (data.warningLevel !== 'none' &&
            (data.warningLevel !== lastWarningLevel || !warningAcknowledged)) {
            lastWarningLevel = data.warningLevel;
            showLockerWarningModal(data);
        }

    } catch (error) {
        console.error('Error checking locker duration:', error);
    }
}

function updateWarningBadge(data) {
    const activeLockerCard = document.getElementById('activeLockerCard');
    if (!activeLockerCard || activeLockerCard.style.display === 'none') return;

    // Remove existing warning badge
    const existingBadge = activeLockerCard.querySelector('.duration-warning-badge');
    if (existingBadge) existingBadge.remove();

    if (data.warningLevel !== 'none') {
        const header = activeLockerCard.querySelector('.active-locker-header');
        const badge = document.createElement('span');
        badge.className = `duration-warning-badge ${data.warningLevel}`;

        const icons = {
            'medium': 'fa-exclamation-circle',
            'high': 'fa-exclamation-triangle',
            'critical': 'fa-times-circle'
        };

        const texts = {
            'medium': `${data.durationHours}h`,
            'high': `${data.durationHours}h`,
            'critical': 'SEGERA!'
        };

        badge.innerHTML = `<i class="fas ${icons[data.warningLevel]}"></i> ${texts[data.warningLevel]}`;
        header.appendChild(badge);
    }
}

function showLockerWarningModal(data) {
    const modal = document.getElementById('lockerWarningModal');
    const iconBig = document.getElementById('warningIconBig');
    const title = document.getElementById('warningTitle');
    const message = document.getElementById('warningMessage');
    const duration = document.getElementById('warningDuration');
    const remaining = document.getElementById('warningRemaining');
    const progressBar = document.getElementById('warningProgressBar');
    const header = modal.querySelector('.warning-header');

    // Set warning level styling
    iconBig.className = `warning-icon-big ${data.warningLevel}`;

    // Update header for critical
    if (data.warningLevel === 'critical') {
        header.classList.add('critical');
    } else {
        header.classList.remove('critical');
    }

    // Set titles based on level
    const titles = {
        'medium': 'Penggunaan Locker Tinggi',
        'high': 'Peringatan Durasi!',
        'critical': '⚠️ PERINGATAN KRITIS!'
    };
    title.textContent = titles[data.warningLevel] || 'Peringatan';

    // Set message
    message.textContent = data.warningMessage;

    // Set stats
    duration.textContent = data.durationText;
    const remainingHours = Math.floor(data.remainingMinutes / 60);
    const remainingMins = data.remainingMinutes % 60;
    remaining.textContent = data.remainingMinutes > 0
        ? `${remainingHours}j ${remainingMins}m`
        : 'Habis!';

    if (data.warningLevel === 'critical') {
        remaining.classList.add('critical');
    } else {
        remaining.classList.remove('critical');
    }

    // Set progress bar (percentage of 24 hours used)
    const percentage = Math.min((data.durationMinutes / (24 * 60)) * 100, 100);
    progressBar.style.width = `${percentage}%`;

    // Show modal
    modal.classList.add('active');
}

function closeLockerWarningModal() {
    const modal = document.getElementById('lockerWarningModal');
    modal.classList.remove('active');
    warningAcknowledged = true;
}

function initLockerWarningSystem() {
    // Check on page load after a short delay
    setTimeout(() => {
        checkLockerDuration();
    }, 2000);

    // Check every 5 minutes
    setInterval(() => {
        checkLockerDuration();
    }, 5 * 60 * 1000);

    // Event listeners for warning modal
    const closeWarningModalBtn = document.getElementById('closeWarningModal');
    const continueUsingBtn = document.getElementById('continueUsingBtn');
    const releaseFromWarningBtn = document.getElementById('releaseFromWarningBtn');

    if (closeWarningModalBtn) {
        closeWarningModalBtn.addEventListener('click', closeLockerWarningModal);
    }

    if (continueUsingBtn) {
        continueUsingBtn.addEventListener('click', () => {
            closeLockerWarningModal();
            showToast('Anda dapat melanjutkan menggunakan locker', 'info');
        });
    }

    if (releaseFromWarningBtn) {
        releaseFromWarningBtn.addEventListener('click', async () => {
            closeLockerWarningModal();
            await releaseLocker();
        });
    }

    // Close on overlay click
    document.getElementById('lockerWarningModal')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) {
            closeLockerWarningModal();
        }
    });

    // Close on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const warningModal = document.getElementById('lockerWarningModal');
            if (warningModal?.classList.contains('active')) {
                closeLockerWarningModal();
            }
        }
    });

    console.log('⏰ Locker warning system initialized');
}

