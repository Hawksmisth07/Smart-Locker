// Admin Dashboard JavaScript - Enhanced Version

// ==================== SOCKET.IO REAL-TIME CONNECTION ====================
let adminSocket = null;

function initAdminSocketIO() {
    // Connect to Socket.IO server
    adminSocket = io({
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });

    adminSocket.on('connect', () => {
        console.log('✅ Admin connected to real-time server');
    });

    adminSocket.on('disconnect', () => {
        console.log('❌ Admin disconnected from real-time server');
    });

    // Listen for locker updates
    adminSocket.on('locker:update', (data) => {
        console.log('🔄 Real-time locker update:', data);
        // Refresh locker management grid
        initLockerManagement();
        loadLockerMiniGrid();
        loadDashboardStatistics();
    });

    // Listen for new activity
    adminSocket.on('activity:new', (data) => {
        console.log('📊 New activity:', data);
        loadRecentActivity();
    });

    // Listen for stats updates
    adminSocket.on('stats:update', (data) => {
        console.log('📈 Stats update:', data);
        loadDashboardStatistics();
    });

    // Listen for user updates (new registration, admin add user)
    adminSocket.on('user:update', (data) => {
        console.log('👤 User update:', data);
        loadUsersTable();
        loadDashboardStatistics();
        loadNotificationsFromAPI();
        showToast(`Pengguna baru: ${data.name}`, 'info');
    });

    // Listen for overtime locker updates
    adminSocket.on('overtime:update', (data) => {
        console.log('⚠️ Overtime update:', data);
        loadOvertimeLockers();
        loadNotificationsFromAPI();
    });

    // Listen for transaction updates
    adminSocket.on('transaction:update', (data) => {
        console.log('💳 Transaction update:', data);
        loadTransactions();
    });

    // Listen for notification updates
    adminSocket.on('notification:update', (data) => {
        console.log('🔔 Notification update:', data);
        loadNotificationsFromAPI();
    });

    // Listen for server log updates
    adminSocket.on('serverlog:new', (data) => {
        console.log('📋 Server log:', data);
        // Only update if server logs page is visible
        const serverLogsPage = document.getElementById('serverLogsPage');
        if (serverLogsPage && serverLogsPage.classList.contains('active')) {
            loadServerLogs();
        }
    });
}

// ==================== PAGE INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', function () {
    // Initialize Socket.IO for real-time updates
    initAdminSocketIO();

    initSidebar();
    initNavigation();
    initNotifications();
    initCharts();
    initLockerManagement();
    initClock();
    initThemeToggle();
    initFullscreen();
    initProfileDropdown();
    initTableActions();
    initExportButtons();
    checkAdminSession();
    loadAccessHistory(); // Load access history on page load

    // Load new admin features
    loadUsersTable();
    loadTransactions();
    loadNotificationsFromAPI();
    loadRecentActivity();
    loadLockerMiniGrid();
    initAddUserForm();
    initAddLockerForm();
});

// ==================== ADMIN SESSION ====================
function checkAdminSession() {
    // Check if admin is logged in
    const isLoggedIn = localStorage.getItem('adminLoggedIn');
    const adminName = localStorage.getItem('adminName') || 'Administrator';

    if (isLoggedIn !== 'true') {
        // Redirect to admin login if not logged in
        window.location.href = 'admin-login.html';
    }

    // Update admin name in UI
    const adminNameElements = document.querySelectorAll('.admin-name, #adminName, #dropdownAdminName');
    adminNameElements.forEach(el => {
        if (el) el.textContent = adminName;
    });
}

// Helper function to get auth headers for protected API calls
function getAuthHeaders() {
    const token = localStorage.getItem('adminToken');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

// Wrapper for authenticated fetch calls
async function authFetch(url, options = {}) {
    const token = localStorage.getItem('adminToken');
    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`
    };

    const response = await fetch(url, { ...options, headers });

    // If token expired or invalid, redirect to login
    if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminLoggedIn');
        window.location.href = 'admin-login.html';
        return null;
    }

    return response;
}

// ==================== REAL-TIME CLOCK ====================
function initClock() {
    const timeElement = document.getElementById('currentTime');
    const dateElement = document.getElementById('currentDate');

    function updateClock() {
        const now = new Date();

        if (timeElement) {
            timeElement.textContent = now.toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        }

        if (dateElement) {
            dateElement.textContent = now.toLocaleDateString('id-ID', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            });
        }
    }

    updateClock();
    setInterval(updateClock, 1000);
}

// ==================== THEME TOGGLE ====================
function initThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    const savedTheme = localStorage.getItem('adminTheme') || 'dark';

    // Apply saved theme
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        if (themeToggle) {
            themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
        }
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('light-theme');
            const isLight = document.body.classList.contains('light-theme');
            themeToggle.innerHTML = isLight ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
            localStorage.setItem('adminTheme', isLight ? 'light' : 'dark');
            showToast(isLight ? 'Mode terang diaktifkan' : 'Mode gelap diaktifkan', 'info');
        });
    }
}

// ==================== FULLSCREEN TOGGLE ====================
function initFullscreen() {
    const fullscreenToggle = document.getElementById('fullscreenToggle');

    if (fullscreenToggle) {
        fullscreenToggle.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().then(() => {
                    fullscreenToggle.innerHTML = '<i class="fas fa-compress"></i>';
                });
            } else {
                document.exitFullscreen().then(() => {
                    fullscreenToggle.innerHTML = '<i class="fas fa-expand"></i>';
                });
            }
        });
    }

    document.addEventListener('fullscreenchange', () => {
        if (fullscreenToggle) {
            fullscreenToggle.innerHTML = document.fullscreenElement
                ? '<i class="fas fa-compress"></i>'
                : '<i class="fas fa-expand"></i>';
        }
    });
}

// ==================== PROFILE DROPDOWN ====================
function initProfileDropdown() {
    const adminProfile = document.getElementById('adminProfile');
    const profileDropdown = document.getElementById('profileDropdown');

    if (adminProfile && profileDropdown) {
        adminProfile.addEventListener('click', (e) => {
            e.stopPropagation();
            profileDropdown.classList.toggle('show');
        });

        document.addEventListener('click', (e) => {
            if (!profileDropdown.contains(e.target) && !adminProfile.contains(e.target)) {
                profileDropdown.classList.remove('show');
            }
        });
    }
}

// ==================== SIDEBAR ====================
function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const menuToggle = document.getElementById('menuToggle');

    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
        });
    }

    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('show');
        });
    }

    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 992) {
            if (sidebar && menuToggle && !sidebar.contains(e.target) && !menuToggle.contains(e.target)) {
                sidebar.classList.remove('show');
            }
        }
    });

    if (localStorage.getItem('sidebarCollapsed') === 'true' && sidebar) {
        sidebar.classList.add('collapsed');
    }
}

// ==================== NAVIGATION ====================
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const pages = document.querySelectorAll('.page');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const pageName = item.dataset.page;
            navigateTo(pageName);
        });
    });

    if (window.location.hash) {
        const hash = window.location.hash.substring(1);
        navigateTo(hash);
    }
}

function navigateTo(pageName) {
    const navItems = document.querySelectorAll('.nav-item');
    const pages = document.querySelectorAll('.page');

    navItems.forEach(nav => nav.classList.remove('active'));
    const activeNav = document.querySelector(`[data-page="${pageName}"]`);
    if (activeNav) activeNav.classList.add('active');

    pages.forEach(page => {
        page.classList.remove('active');
        if (page.id === `${pageName}Page`) {
            page.classList.add('active');
        }
    });

    if (window.innerWidth <= 992) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.remove('show');
    }

    // Close profile dropdown
    const profileDropdown = document.getElementById('profileDropdown');
    if (profileDropdown) profileDropdown.classList.remove('show');

    // Load server logs when navigating to that page
    if (pageName === 'serverLogs' && typeof loadServerLogs === 'function') {
        loadServerLogs();
    }
}

// ==================== NOTIFICATIONS ====================
function initNotifications() {
    const notificationBtn = document.getElementById('notificationBtn');
    const notificationDropdown = document.getElementById('notificationDropdown');

    if (notificationBtn && notificationDropdown) {
        notificationBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            notificationDropdown.classList.toggle('show');
        });

        document.addEventListener('click', (e) => {
            if (!notificationDropdown.contains(e.target)) {
                notificationDropdown.classList.remove('show');
            }
        });
    }
}

function markAllRead() {
    const unreadItems = document.querySelectorAll('.notification-item.unread');
    unreadItems.forEach(item => item.classList.remove('unread'));

    const badge = document.querySelector('.notification-badge');
    if (badge) badge.style.display = 'none';

    showToast('Semua notifikasi telah ditandai dibaca', 'success');
}

// ==================== CHARTS ====================
let usageChartInstance = null;
let statusChartInstance = null;

async function initCharts() {
    await loadDashboardStatistics();
}

async function loadDashboardStatistics() {
    try {
        const response = await authFetch('/api/admin/statistics');
        if (!response) return;
        const result = await response.json();

        if (!result.success) {
            console.error('Failed to load statistics');
            return;
        }

        const data = result.data;

        // Update stat cards
        updateStatCards(data);

        // Initialize or update charts
        initUsageChart(data.chartData);
        initStatusChart(data.lockers);

    } catch (error) {
        console.error('Error loading statistics:', error);
    }
}

function updateStatCards(data) {
    // Update Total Locker
    const totalLockerEl = document.getElementById('adminTotalLocker');
    if (totalLockerEl) totalLockerEl.textContent = data.lockers.total;

    // Update Available
    const availableEl = document.getElementById('adminAvailable');
    if (availableEl) availableEl.textContent = data.lockers.available;

    // Update Occupied
    const occupiedEl = document.getElementById('adminOccupied');
    if (occupiedEl) occupiedEl.textContent = data.lockers.occupied;

    // Update Total Users
    const totalUsersEl = document.getElementById('adminTotalUsers');
    if (totalUsersEl) totalUsersEl.textContent = data.users.total;
}

function initUsageChart(chartData) {
    const ctx = document.getElementById('usageChart');
    if (!ctx) return;

    const labels = chartData.map(d => d.day);
    const bookings = chartData.map(d => d.bookings);
    const returns = chartData.map(d => d.returns);

    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(91, 134, 229, 0.5)');
    gradient.addColorStop(1, 'rgba(91, 134, 229, 0)');

    // Destroy existing chart if exists
    if (usageChartInstance) {
        usageChartInstance.destroy();
    }

    usageChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Peminjaman',
                data: bookings,
                fill: true,
                backgroundColor: gradient,
                borderColor: '#5B86E5',
                borderWidth: 3,
                tension: 0.4,
                pointBackgroundColor: '#5B86E5',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7
            }, {
                label: 'Pengembalian',
                data: returns,
                fill: false,
                borderColor: '#36D1DC',
                borderWidth: 3,
                tension: 0.4,
                pointBackgroundColor: '#36D1DC',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: { color: '#94a3b8', usePointStyle: true, padding: 20 }
                }
            },
            scales: {
                x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8' } },
                y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8' } }
            },
            interaction: { intersect: false, mode: 'index' }
        }
    });
}

function initStatusChart(lockerData) {
    const ctx = document.getElementById('statusChart');
    if (!ctx) return;

    // Destroy existing chart if exists
    if (statusChartInstance) {
        statusChartInstance.destroy();
    }

    statusChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['available', 'occupied', 'maintenance'],
            datasets: [{
                data: [lockerData.available || 0, lockerData.occupied || 0, lockerData.maintenance || 0],
                backgroundColor: ['#4ade80', '#f87171', '#fbbf24'],
                borderWidth: 0,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: { color: '#94a3b8', usePointStyle: true, padding: 20 }
                }
            }
        }
    });
}

// Auto-refresh statistics every 5 minutes
setInterval(loadDashboardStatistics, 5 * 60 * 1000);

// ==================== LOCKER MANAGEMENT ====================
async function initLockerManagement() {
    const lockerGrid = document.querySelector('.locker-management-grid');
    if (!lockerGrid) return;

    // Show loading state
    lockerGrid.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> Memuat data loker...</div>';

    try {
        const response = await fetch('/api/lockers');
        const data = await response.json();

        if (data.success) {
            const lockers = data.lockers.map(locker => ({
                id: locker.id,
                lockerCode: locker.lockerCode,
                status: locker.status,
                user: locker.userName || null,
                userNim: locker.userNim || null,
                lastUsed: locker.lastUpdated ? formatDate(new Date(locker.lastUpdated)) : '-'
            }));

            if (lockers.length === 0) {
                lockerGrid.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i> Tidak ada loker terdaftar</div>';
            } else {
                lockerGrid.innerHTML = lockers.map(locker => createLockerCard(locker)).join('');
            }

            // Update stats if elements exist
            updateLockerStats(lockers);
        } else {
            console.error('Failed to fetch lockers:', data.message);
            lockerGrid.innerHTML = '<div class="error-state"><i class="fas fa-exclamation-circle"></i> Gagal memuat data loker</div>';
        }
    } catch (error) {
        console.error('Error fetching lockers:', error);
        lockerGrid.innerHTML = '<div class="error-state"><i class="fas fa-exclamation-circle"></i> Gagal memuat data loker</div>';
    }
}

function updateLockerStats(lockers) {
    const total = lockers.length;
    const available = lockers.filter(l => l.status === 'available').length;
    const occupied = lockers.filter(l => l.status === 'occupied').length;
    const maintenance = lockers.filter(l => l.status === 'maintenance').length;

    // Update stat cards if they exist
    const totalEl = document.querySelector('[data-stat="total-lockers"]');
    const availableEl = document.querySelector('[data-stat="available-lockers"]');
    const occupiedEl = document.querySelector('[data-stat="occupied-lockers"]');

    if (totalEl) totalEl.textContent = total;
    if (availableEl) availableEl.textContent = available;
    if (occupiedEl) occupiedEl.textContent = occupied;
}

function formatDate(date) {
    return date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

function createLockerCard(locker) {
    const statusText = {
        'available': 'Tersedia',
        'occupied': 'Terpakai',
        'maintenance': 'Pemeliharaan'
    };

    return `
        <div class="locker-card ${locker.status}">
            <div class="locker-card-header">
                <div class="locker-number-badge">${locker.id}</div>
                <span class="locker-status-badge">${statusText[locker.status] || locker.status}</span>
            </div>
            <div class="locker-card-body">
                ${locker.user ? `
                <div class="locker-info-row">
                    <span>Pengguna</span>
                    <span>${locker.user}</span>
                </div>
                ` : ''}
                ${locker.userNim ? `
                <div class="locker-info-row">
                    <span>NIM</span>
                    <span>${locker.userNim}</span>
                </div>
                ` : ''}
                <div class="locker-info-row">
                    <span>Terakhir Update</span>
                    <span>${locker.lastUsed}</span>
                </div>
            </div>
            <div class="locker-card-footer">
                <button class="edit-btn" onclick="editLocker(${locker.id})">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button class="delete-btn" onclick="deleteLocker(${locker.id})">
                    <i class="fas fa-trash"></i> Hapus
                </button>
            </div>
        </div>
    `;
}


// ==================== TABLE ACTIONS ====================
function initTableActions() {
    // View user buttons
    document.querySelectorAll('.action-btn.view').forEach(btn => {
        btn.addEventListener('click', function () {
            const row = this.closest('tr');
            viewUser(row);
        });
    });

    // Edit user buttons
    document.querySelectorAll('.action-btn.edit').forEach(btn => {
        btn.addEventListener('click', function () {
            const row = this.closest('tr');
            editUser(row);
        });
    });

    // Delete user buttons
    document.querySelectorAll('.action-btn.delete').forEach(btn => {
        btn.addEventListener('click', function () {
            const row = this.closest('tr');
            deleteUser(row);
        });
    });
}

function viewUser(row) {
    if (!row) return;
    const cells = row.querySelectorAll('td');

    const modal = document.getElementById('viewUserModal');
    if (modal) {
        document.getElementById('viewUserName').textContent = cells[1]?.textContent?.trim() || '-';
        document.getElementById('viewUserNim').textContent = cells[2]?.textContent?.trim() || '-';
        document.getElementById('viewUserEmail').textContent = cells[3]?.textContent?.trim() || '-';
        document.getElementById('viewUserLocker').textContent = cells[4]?.textContent?.trim() || '-';
        document.getElementById('viewUserDate').textContent = cells[5]?.textContent?.trim() || '-';
        showModal('viewUserModal');
    } else {
        showToast('Detail pengguna: ' + (cells[1]?.textContent?.trim() || 'N/A'), 'info');
    }
}

function editUser(row) {
    showToast('Fitur edit pengguna sedang dalam pengembangan', 'info');
}

function deleteUser(row) {
    if (!row) return;
    const name = row.querySelector('td:nth-child(2)')?.textContent?.trim() || 'pengguna ini';

    if (confirm(`Apakah Anda yakin ingin menghapus ${name}?`)) {
        row.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => {
            row.remove();
            showToast('Pengguna berhasil dihapus', 'success');
        }, 300);
    }
}

// ==================== EXPORT BUTTONS ====================
function initExportButtons() {
    // Add click handlers to report buttons
    document.querySelectorAll('.report-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const reportType = this.closest('.report-card').querySelector('h3').textContent;
            generateReport(reportType);
        });
    });

    // Export button in transactions
    document.querySelectorAll('.secondary-btn').forEach(btn => {
        if (btn.textContent.includes('Export')) {
            btn.addEventListener('click', function () {
                showExportModal();
            });
        }
    });
}

// Generate report based on type
async function generateReport(reportType) {
    showToast(`Membuat laporan: ${reportType}...`, 'info');

    try {
        const response = await authFetch('/api/admin/statistics');
        if (!response) return;
        const result = await response.json();

        if (!result.success) {
            showToast('Gagal mengambil data laporan', 'error');
            return;
        }

        const data = result.data;
        let reportContent = '';
        const now = new Date().toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        // Build report based on type
        if (reportType.toLowerCase().includes('penggunaan') || reportType.toLowerCase().includes('usage')) {
            reportContent = `
LAPORAN PENGGUNAAN LOKER
========================
Tanggal: ${now}

Total Loker: ${data.lockers.total}
Tersedia: ${data.lockers.available}
Terpakai: ${data.lockers.occupied}
Pemeliharaan: ${data.lockers.maintenance || 0}

Total Pengguna: ${data.users.total}
            `;
        } else if (reportType.toLowerCase().includes('transaksi') || reportType.toLowerCase().includes('transaction')) {
            reportContent = `
LAPORAN TRANSAKSI
=================
Tanggal: ${now}

Data transaksi 7 hari terakhir:
${data.chartData.map(d => `${d.day}: Peminjaman ${d.bookings}, Pengembalian ${d.returns}`).join('\n')}
            `;
        } else {
            reportContent = `
LAPORAN ${reportType.toUpperCase()}
${'='.repeat(reportType.length + 9)}
Tanggal: ${now}

Total Loker: ${data.lockers.total}
Tersedia: ${data.lockers.available}
Terpakai: ${data.lockers.occupied}
Total Pengguna: ${data.users.total}
            `;
        }

        // Create downloadable file
        const blob = new Blob([reportContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `laporan_${reportType.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast(`Laporan ${reportType} berhasil dibuat!`, 'success');
    } catch (error) {
        console.error('Error generating report:', error);
        showToast('Gagal membuat laporan', 'error');
    }
}

// Show export modal for transactions
function showExportModal() {
    // Check if modal exists, create if not
    let modal = document.getElementById('exportModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'exportModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h3><i class="fas fa-file-export"></i> Export Data</h3>
                    <button class="close-btn" onclick="hideModal('exportModal')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body" style="padding: 20px;">
                    <p style="margin-bottom: 15px;">Pilih format export:</p>
                    <div style="display: flex; gap: 10px; flex-direction: column;">
                        <button class="primary-btn" onclick="exportTransactionsCSV()" style="padding: 12px;">
                            <i class="fas fa-file-csv"></i> Export CSV
                        </button>
                        <button class="secondary-btn" onclick="exportTransactionsPDF()" style="padding: 12px;">
                            <i class="fas fa-file-pdf"></i> Export PDF
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    showModal('exportModal');
}

// Export transactions to CSV
async function exportTransactionsCSV() {
    hideModal('exportModal');
    showToast('Mengexport data ke CSV...', 'info');

    try {
        const response = await authFetch('/api/admin/transactions?page=1&limit=1000');
        if (!response) return;
        const result = await response.json();

        if (!result.success) {
            showToast('Gagal mengambil data transaksi', 'error');
            return;
        }

        const transactions = result.data.transactions;

        // Build CSV
        let csv = 'ID,Loker,Pengguna,NIM,Tipe,Waktu\n';
        transactions.forEach(t => {
            csv += `${t.id},"${t.locker_id}","${t.user_name || '-'}","${t.nim || '-'}","${t.type}","${new Date(t.created_at).toLocaleString('id-ID')}"\n`;
        });

        // Download
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transaksi_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast('Data berhasil diexport ke CSV!', 'success');
    } catch (error) {
        console.error('Error exporting CSV:', error);
        showToast('Gagal export data', 'error');
    }
}

// Export transactions to PDF (simple text format)
async function exportTransactionsPDF() {
    hideModal('exportModal');
    showToast('Mengexport data ke PDF...', 'info');

    try {
        const response = await authFetch('/api/admin/transactions?page=1&limit=100');
        if (!response) return;
        const result = await response.json();

        if (!result.success) {
            showToast('Gagal mengambil data transaksi', 'error');
            return;
        }

        const transactions = result.data.transactions;

        // For now, create a printable HTML
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Laporan Transaksi</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    h1 { color: #333; border-bottom: 2px solid #5B86E5; padding-bottom: 10px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
                    th { background: #5B86E5; color: white; }
                    tr:nth-child(even) { background: #f9f9f9; }
                    .header-info { color: #666; margin-bottom: 20px; }
                </style>
            </head>
            <body>
                <h1>📊 Laporan Transaksi Smart Loker</h1>
                <p class="header-info">Dicetak pada: ${new Date().toLocaleString('id-ID')}</p>
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Loker</th>
                            <th>Pengguna</th>
                            <th>NIM</th>
                            <th>Tipe</th>
                            <th>Waktu</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${transactions.map(t => `
                            <tr>
                                <td>${t.id}</td>
                                <td>${t.locker_id}</td>
                                <td>${t.user_name || '-'}</td>
                                <td>${t.nim || '-'}</td>
                                <td>${t.type}</td>
                                <td>${new Date(t.created_at).toLocaleString('id-ID')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <script>window.print();</script>
            </body>
            </html>
        `);
        printWindow.document.close();

        showToast('Halaman print terbuka!', 'success');
    } catch (error) {
        console.error('Error exporting PDF:', error);
        showToast('Gagal export data', 'error');
    }
}

// Print report (keyboard shortcut Ctrl+P)
function printReport() {
    window.print();
}

// ==================== LOCKER MANAGEMENT ACTIONS ====================

// Edit locker - open modal to change status
async function editLocker(lockerId) {
    // Create edit modal if not exists
    let modal = document.getElementById('editLockerModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'editLockerModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h3><i class="fas fa-edit"></i> Edit Loker</h3>
                    <button class="close-btn" onclick="hideModal('editLockerModal')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body" style="padding: 20px;">
                    <input type="hidden" id="editLockerId">
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 500;">Status Loker</label>
                        <select id="editLockerStatus" class="form-control" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px;">
                            <option value="available">Tersedia</option>
                            <option value="occupied">Terpakai</option>
                            <option value="maintenance">Pemeliharaan</option>
                        </select>
                    </div>
                    <button class="primary-btn" onclick="saveLockerEdit()" style="width: 100%; padding: 12px;">
                        <i class="fas fa-save"></i> Simpan Perubahan
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Set locker ID and show modal
    document.getElementById('editLockerId').value = lockerId;
    showModal('editLockerModal');
    showToast(`Mengedit loker #${lockerId}`, 'info');
}

// Save locker edit
async function saveLockerEdit() {
    const lockerId = document.getElementById('editLockerId').value;
    const newStatus = document.getElementById('editLockerStatus').value;

    try {
        const response = await authFetch(`/api/admin/locker/${lockerId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status: newStatus })
        });

        if (!response) return;
        const result = await response.json();

        if (result.success) {
            showToast('Status loker berhasil diperbarui!', 'success');
            hideModal('editLockerModal');
            // Refresh locker grid
            initLockerManagement();
        } else {
            showToast(result.message || 'Gagal memperbarui loker', 'error');
        }
    } catch (error) {
        console.error('Error updating locker:', error);
        showToast('Gagal memperbarui loker', 'error');
    }
}

// Delete locker
async function deleteLocker(lockerId) {
    if (!confirm(`Apakah Anda yakin ingin menghapus loker #${lockerId}?`)) {
        return;
    }

    try {
        const response = await authFetch(`/api/admin/locker/${lockerId}`, {
            method: 'DELETE'
        });

        if (!response) return;
        const result = await response.json();

        if (result.success) {
            showToast(`Loker #${lockerId} berhasil dihapus!`, 'success');
            // Refresh locker grid
            initLockerManagement();
        } else {
            showToast(result.message || 'Gagal menghapus loker', 'error');
        }
    } catch (error) {
        console.error('Error deleting locker:', error);
        showToast('Gagal menghapus loker', 'error');
    }
}


function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = '';
    }
}

// Close modal when clicking overlay
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('show');
        document.body.style.overflow = '';
    }
});

// ==================== LOGOUT FUNCTIONS ====================
function confirmLogout() {
    const modal = document.getElementById('confirmLogoutModal');
    if (modal) {
        showModal('confirmLogoutModal');
    } else {
        if (confirm('Apakah Anda yakin ingin logout?')) {
            performLogout();
        }
    }
}

function performLogout() {
    localStorage.removeItem('adminLoggedIn');
    localStorage.removeItem('adminName');
    showToast('Logout berhasil. Mengalihkan...', 'success');

    setTimeout(() => {
        window.location.href = 'admin-login.html';
    }, 1000);
}

// ==================== PROFILE FUNCTIONS ====================
function saveProfile() {
    const name = document.getElementById('profileName')?.value;
    const email = document.getElementById('profileEmail')?.value;

    if (name) {
        localStorage.setItem('adminName', name);

        // Update UI
        document.querySelectorAll('.admin-name, #adminName, #dropdownAdminName').forEach(el => {
            if (el) el.textContent = name;
        });
    }

    hideModal('profileModal');
    showToast('Profil berhasil diperbarui', 'success');
}

// ==================== UTILITY FUNCTIONS ====================
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ==================== SEARCH FUNCTIONALITY ====================
document.querySelectorAll('.search-box input, .search-filter input').forEach(input => {
    input.addEventListener('input', debounce(function (e) {
        const query = e.target.value.toLowerCase();
        if (query.length > 0) {
            showToast(`Mencari: "${query}"`, 'info');
        }
    }, 500));
});

// ==================== KEYBOARD SHORTCUTS ====================
document.addEventListener('keydown', (e) => {
    // Escape to close modals
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.show').forEach(modal => {
            modal.classList.remove('show');
            document.body.style.overflow = '';
        });
    }

    // Ctrl+K for search
    if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector('.search-box input');
        if (searchInput) searchInput.focus();
    }

    // Ctrl+P for print
    if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        printReport();
    }
});

// ==================== TOAST NOTIFICATIONS ====================
function showToast(message, type = 'info') {
    // Create container if not exists
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        container.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
        `;
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
        success: 'fa-check-circle',
        error: 'fa-times-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };

    const colors = {
        success: '#4ade80',
        error: '#f87171',
        warning: '#fbbf24',
        info: '#5B86E5'
    };

    toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${message}</span>`;
    toast.style.cssText = `
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 15px 20px;
        background: ${colors[type] || colors.info};
        color: white;
        border-radius: 10px;
        box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
        animation: slideInRight 0.3s ease;
        font-size: 14px;
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Add animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOutRight {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
    }
`;
document.head.appendChild(style);

// ==================== ANIMATION ON SCROLL ====================
const observerOptions = { threshold: 0.1, rootMargin: '0px 0px -50px 0px' };

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

document.querySelectorAll('.stat-card, .chart-card, .activity-card, .quick-actions-card').forEach(card => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    card.style.transition = 'all 0.5s ease';
    observer.observe(card);
});

// ==================== ACCESS HISTORY ====================
let accessHistoryOffset = 0;
let accessHistoryTotal = 0;
const ACCESS_HISTORY_LIMIT = 20;

async function loadAccessHistory() {
    const tbody = document.getElementById('accessHistoryBody');
    const infoSpan = document.getElementById('accessHistoryInfo');
    const loadMoreBtn = document.getElementById('loadMoreBtn');

    if (!tbody) return;

    try {
        // Get admin token from localStorage
        const token = localStorage.getItem('adminToken');

        const response = await fetch(`/api/admin/access-history?limit=${ACCESS_HISTORY_LIMIT}&offset=0`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (data.success) {
            accessHistoryOffset = data.logs.length;
            accessHistoryTotal = data.total;

            // Update stats
            updateAccessStats(data.logs);

            // Render logs
            renderAccessLogs(data.logs, false);

            // Update info text
            if (infoSpan) {
                infoSpan.textContent = `Menampilkan ${data.logs.length} dari ${data.total} log`;
            }

            // Show/hide load more button
            if (loadMoreBtn) {
                loadMoreBtn.style.display = data.logs.length < data.total ? 'block' : 'none';
            }
        } else {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="empty-state-access">
                        <i class="fas fa-exclamation-circle"></i>
                        <p>${data.message || 'Gagal memuat riwayat akses'}</p>
                    </td>
                </tr>
            `;
        }
    } catch (error) {
        console.error('Error loading access history:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state-access">
                    <i class="fas fa-history"></i>
                    <p>Belum ada riwayat akses dalam 24 jam terakhir</p>
                </td>
            </tr>
        `;
    }
}

function updateAccessStats(logs) {
    const totalAccessEl = document.getElementById('totalAccess');
    const userLoginsEl = document.getElementById('userLogins');
    const adminLoginsEl = document.getElementById('adminLogins');

    if (totalAccessEl) {
        totalAccessEl.textContent = accessHistoryTotal;
    }

    // Count by type from current logs (for display)
    const userLogins = logs.filter(l => l.user_type === 'user' && l.action.toLowerCase().includes('login')).length;
    const adminLogins = logs.filter(l => l.user_type === 'admin' && l.action.toLowerCase().includes('login')).length;

    if (userLoginsEl) userLoginsEl.textContent = userLogins;
    if (adminLoginsEl) adminLoginsEl.textContent = adminLogins;
}

function renderAccessLogs(logs, append = false) {
    const tbody = document.getElementById('accessHistoryBody');
    if (!tbody) return;

    if (logs.length === 0 && !append) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state-access">
                    <i class="fas fa-history"></i>
                    <p>Belum ada riwayat akses dalam 24 jam terakhir</p>
                </td>
            </tr>
        `;
        return;
    }

    const rowsHtml = logs.map(log => {
        const time = new Date(log.created_at);
        const timeStr = time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const dateStr = time.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });

        const typeBadgeClass = log.user_type || 'guest';
        const typeBadgeText = {
            'user': 'User',
            'admin': 'Admin',
            'guest': 'Guest'
        }[log.user_type] || 'Guest';

        return `
            <tr>
                <td>
                    <div class="time-display">
                        <span class="time">${timeStr}</span>
                        <span class="date">${dateStr}</span>
                    </div>
                </td>
                <td>${log.user_name || 'Guest'}</td>
                <td><span class="type-badge ${typeBadgeClass}">${typeBadgeText}</span></td>
                <td>${log.action}</td>
                <td><code>${log.ip_address || '-'}</code></td>
            </tr>
        `;
    }).join('');

    if (append) {
        tbody.insertAdjacentHTML('beforeend', rowsHtml);
    } else {
        tbody.innerHTML = rowsHtml;
    }
}

async function loadMoreAccessLogs() {
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    const infoSpan = document.getElementById('accessHistoryInfo');

    if (loadMoreBtn) {
        loadMoreBtn.disabled = true;
        loadMoreBtn.textContent = 'Memuat...';
    }

    try {
        const token = localStorage.getItem('adminToken');

        const response = await fetch(`/api/admin/access-history?limit=${ACCESS_HISTORY_LIMIT}&offset=${accessHistoryOffset}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (data.success && data.logs.length > 0) {
            accessHistoryOffset += data.logs.length;
            renderAccessLogs(data.logs, true);

            if (infoSpan) {
                infoSpan.textContent = `Menampilkan ${accessHistoryOffset} dari ${data.total} log`;
            }

            if (loadMoreBtn) {
                loadMoreBtn.style.display = accessHistoryOffset < data.total ? 'block' : 'none';
            }
        }
    } catch (error) {
        console.error('Error loading more logs:', error);
        showToast('Gagal memuat data tambahan', 'error');
    } finally {
        if (loadMoreBtn) {
            loadMoreBtn.disabled = false;
            loadMoreBtn.textContent = 'Muat Lebih Banyak';
        }
    }
}

function formatRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'Baru saja';
    if (diffMins < 60) return `${diffMins} menit lalu`;
    if (diffHours < 24) return `${diffHours} jam lalu`;
    return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ==================== SERVER LOGS ====================
let autoRefreshInterval = null;

async function loadServerLogs() {
    const logBody = document.getElementById('serverLogBody');
    const logTotalCount = document.getElementById('logTotalCount');
    const logLastUpdate = document.getElementById('logLastUpdate');
    const typeFilter = document.getElementById('logTypeFilter')?.value || '';

    if (!logBody) return;

    try {
        const token = localStorage.getItem('adminToken');
        const url = `/api/admin/server-logs?limit=200${typeFilter ? '&type=' + typeFilter : ''}`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (data.success) {
            if (logTotalCount) logTotalCount.textContent = data.total;
            if (logLastUpdate) logLastUpdate.textContent = new Date().toLocaleTimeString('id-ID');

            renderServerLogs(data.logs);
        } else {
            logBody.innerHTML = `
                <div class="log-empty">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>${data.message || 'Gagal memuat log server'}</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading server logs:', error);
        logBody.innerHTML = `
            <div class="log-empty">
                <i class="fas fa-terminal"></i>
                <p>Tidak dapat terhubung ke server</p>
            </div>
        `;
    }
}

function renderServerLogs(logs) {
    const logBody = document.getElementById('serverLogBody');
    if (!logBody) return;

    if (logs.length === 0) {
        logBody.innerHTML = `
            <div class="log-empty">
                <i class="fas fa-terminal"></i>
                <p>Belum ada log server</p>
            </div>
        `;
        return;
    }

    const logsHtml = logs.map(log => {
        const time = new Date(log.timestamp);
        const timeStr = time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const messageClass = log.type === 'error' ? 'error' : (log.type === 'warn' ? 'warn' : '');

        return `
            <div class="log-entry">
                <span class="log-time">${timeStr}</span>
                <span class="log-type ${log.type}">${log.type}</span>
                <span class="log-message ${messageClass}">${escapeHtml(log.message)}</span>
            </div>
        `;
    }).join('');

    logBody.innerHTML = logsHtml;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function toggleAutoRefresh() {
    const checkbox = document.getElementById('autoRefreshLogs');

    if (checkbox && checkbox.checked) {
        // Start auto refresh every 5 seconds
        autoRefreshInterval = setInterval(() => {
            loadServerLogs();
        }, 5000);
        showToast('Auto refresh diaktifkan', 'info');
    } else {
        // Stop auto refresh
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
            autoRefreshInterval = null;
        }
        showToast('Auto refresh dinonaktifkan', 'info');
    }
}

async function clearServerLogs() {
    if (!confirm('Apakah Anda yakin ingin menghapus semua log server?')) {
        return;
    }

    try {
        const token = localStorage.getItem('adminToken');

        const response = await fetch('/api/admin/server-logs', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (data.success) {
            showToast('Log server berhasil dihapus', 'success');
            loadServerLogs();
        } else {
            showToast(data.message || 'Gagal menghapus log', 'error');
        }
    } catch (error) {
        console.error('Error clearing logs:', error);
        showToast('Terjadi kesalahan', 'error');
    }
}

// Admin Dashboard Enhanced - Ready

// ==================== OVERTIME LOCKERS ====================

let currentTakeoverData = null;

async function loadOvertimeLockers() {
    const listContainer = document.getElementById('overtimeLockersList');
    const countBadge = document.getElementById('overtimeCountBadge');

    if (!listContainer) return;

    try {
        const response = await authFetch('/api/admin/overtime-lockers');
        if (!response) return;
        const data = await response.json();

        if (!data.success) {
            listContainer.innerHTML = `<div style="text-align:center;padding:20px;color:#f87171;">Gagal memuat data</div>`;
            return;
        }

        if (countBadge) {
            countBadge.textContent = data.count;
            countBadge.style.display = data.count > 0 ? 'inline-block' : 'none';
        }

        if (data.lockers.length === 0) {
            listContainer.innerHTML = `
                <div style="text-align:center;padding:30px;color:#94a3b8;">
                    <i class="fas fa-check-circle" style="font-size:32px;margin-bottom:12px;color:#4ade80;display:block;"></i>
                    <p style="margin:0;font-size:14px;">Tidak ada locker overtime</p>
                </div>`;
            return;
        }

        listContainer.innerHTML = data.lockers.map(locker => {
            const h = locker.duration_hours || 0;
            return `
                <div class="overtime-locker-item" style="display:flex;align-items:center;justify-content:space-between;padding:15px;background:${h >= 27 ? 'rgba(239,68,68,0.1)' : 'rgba(251,191,36,0.1)'};border-radius:10px;margin-bottom:10px;border-left:3px solid ${h >= 27 ? '#ef4444' : '#fbbf24'};">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <div style="background:linear-gradient(135deg,#5B86E5,#36D1DC);color:white;padding:8px 12px;border-radius:8px;font-weight:700;">#${locker.locker_number}</div>
                        <div><div style="font-weight:600;color:#fff;">${locker.user_name || '-'}</div><div style="font-size:12px;color:#94a3b8;">${locker.user_nim || '-'}</div></div>
                    </div>
                    <div style="color:${h >= 27 ? '#ef4444' : '#fbbf24'};font-weight:600;"><i class="fas fa-clock"></i> ${locker.durationText}</div>
                    <div>
                        ${h >= 27 ? `<button onclick="openTakeoverModal(${locker.id},${locker.locker_number},'${locker.user_name}','${locker.user_nim}','${locker.durationText}')" style="background:linear-gradient(135deg,#ef4444,#dc2626);color:white;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-weight:600;"><i class="fas fa-box"></i> Ambil</button>`
                    : `<span style="color:#fbbf24;font-size:12px;">Menunggu 27 jam</span>`}
                    </div>
                </div>`;
        }).join('');

    } catch (error) {
        console.error('Error loading overtime lockers:', error);
    }
}

function openTakeoverModal(usageId, lockerId, userName, userNim, durationText) {
    currentTakeoverData = { usageId, lockerId, userName, userNim };
    document.getElementById('takeoverLockerId').textContent = '#' + lockerId;
    document.getElementById('takeoverUserName').textContent = userName || '-';
    document.getElementById('takeoverUserNim').textContent = userNim || '-';
    document.getElementById('takeoverDuration').textContent = durationText || '-';
    document.getElementById('takeoverNote').value = '';
    showModal('takeoverModal');
}

async function confirmTakeover() {
    if (!currentTakeoverData) return;
    const confirmBtn = document.getElementById('confirmTakeoverBtn');
    const adminNote = document.getElementById('takeoverNote').value.trim();

    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memproses...';

    try {
        const response = await authFetch('/api/admin/takeover-locker', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usageId: currentTakeoverData.usageId, adminNote: adminNote || null })
        });
        if (!response) return;
        const data = await response.json();

        if (data.success) {
            hideModal('takeoverModal');
            showToast(`Barang dari Locker #${currentTakeoverData.lockerId} berhasil disita`, 'success');
            loadOvertimeLockers();
            initLockerManagement();
        } else {
            showToast(data.message || 'Gagal menyita barang', 'error');
        }
    } catch (error) {
        showToast('Terjadi kesalahan', 'error');
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<i class="fas fa-box"></i> Sita Barang';
        currentTakeoverData = null;
    }
}

setTimeout(loadOvertimeLockers, 1000);
setInterval(loadOvertimeLockers, 5 * 60 * 1000);

// ==================== USERS TABLE ====================

let usersCurrentPage = 1;
let usersSearchQuery = '';

async function loadUsersTable(page = 1, search = '') {
    const tbody = document.getElementById('usersTableBody');
    const infoSpan = document.getElementById('usersTableInfo');
    const pagination = document.getElementById('usersPagination');

    if (!tbody) return;

    usersCurrentPage = page;
    usersSearchQuery = search;

    tbody.innerHTML = `
        <tr>
            <td colspan="7" style="text-align: center; padding: 40px; color: #94a3b8;">
                <i class="fas fa-spinner fa-spin" style="font-size: 24px;"></i>
                <p style="margin-top: 10px;">Memuat data pengguna...</p>
            </td>
        </tr>
    `;

    try {
        const searchParam = search ? `&search=${encodeURIComponent(search)}` : '';
        const response = await fetch(`/api/admin/users?page=${page}&limit=20${searchParam}`);
        const data = await response.json();

        if (data.success) {
            if (data.users.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="7" style="text-align: center; padding: 40px; color: #94a3b8;">
                            <i class="fas fa-users" style="font-size: 32px; margin-bottom: 12px; display: block;"></i>
                            <p style="margin: 0; font-size: 14px;">Belum ada pengguna terdaftar</p>
                        </td>
                    </tr>
                `;
            } else {
                tbody.innerHTML = data.users.map((user, index) => `
                    <tr>
                        <td>${user.id}</td>
                        <td>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=5B86E5&color=fff&size=32" 
                                     alt="${user.name}" 
                                     style="width: 32px; height: 32px; border-radius: 50%;">
                                <span>${user.name}</span>
                            </div>
                        </td>
                        <td>${user.nim}</td>
                        <td>${user.email}</td>
                        <td>
                            ${user.lockerId
                        ? `<span class="status-badge active">Locker #${user.lockerId}</span>`
                        : `<span class="status-badge inactive">-</span>`}
                        </td>
                        <td>${formatDateShort(user.createdAt)}</td>
                        <td>
                            <div class="action-buttons">
                                <button class="action-btn view" onclick="viewUserDetails(${user.id})" title="Lihat">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <button class="action-btn edit" onclick="editUserData(${user.id})" title="Edit">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="action-btn delete" onclick="deleteUserData(${user.id}, '${user.name}')" title="Hapus">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `).join('');
            }

            // Update info
            if (infoSpan) {
                const start = (data.pagination.page - 1) * data.pagination.limit + 1;
                const end = Math.min(start + data.users.length - 1, data.pagination.total);
                infoSpan.textContent = `Menampilkan ${start}-${end} dari ${data.pagination.total} pengguna`;
            }

            // Update pagination
            if (pagination) {
                renderPagination(pagination, data.pagination, 'loadUsersTable');
            }
        }
    } catch (error) {
        console.error('Error loading users:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px; color: #f87171;">
                    <i class="fas fa-exclamation-circle" style="font-size: 32px; margin-bottom: 12px;"></i>
                    <p>Gagal memuat data pengguna</p>
                </td>
            </tr>
        `;
    }
}

function formatDateShort(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function renderPagination(container, pagination, functionName) {
    const { page, totalPages } = pagination;
    let html = '';

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    // Previous button
    html += `<button class="pagination-btn" onclick="${functionName}(${page - 1})" ${page === 1 ? 'disabled' : ''}>
        <i class="fas fa-chevron-left"></i>
    </button>`;

    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) {
            html += `<button class="pagination-btn ${i === page ? 'active' : ''}" onclick="${functionName}(${i})">${i}</button>`;
        } else if (i === page - 2 || i === page + 2) {
            html += `<span class="pagination-dots">...</span>`;
        }
    }

    // Next button
    html += `<button class="pagination-btn" onclick="${functionName}(${page + 1})" ${page === totalPages ? 'disabled' : ''}>
        <i class="fas fa-chevron-right"></i>
    </button>`;

    container.innerHTML = html;
}

// ==================== TRANSACTIONS TABLE ====================

let transCurrentPage = 1;

async function loadTransactions(page = 1) {
    const tbody = document.getElementById('transactionsTableBody');
    if (!tbody) return;

    transCurrentPage = page;

    // Get filter values
    const typeFilter = document.querySelector('#transactionsPage .filter-select')?.value || '';
    const startDate = document.querySelectorAll('#transactionsPage .date-input')[0]?.value || '';
    const endDate = document.querySelectorAll('#transactionsPage .date-input')[1]?.value || '';

    tbody.innerHTML = `
        <tr>
            <td colspan="6" style="text-align: center; padding: 40px; color: #94a3b8;">
                <i class="fas fa-spinner fa-spin" style="font-size: 24px;"></i>
            </td>
        </tr>
    `;

    try {
        let url = `/api/admin/transactions?page=${page}&limit=20`;
        if (typeFilter) url += `&type=${typeFilter}`;
        if (startDate) url += `&startDate=${startDate}`;
        if (endDate) url += `&endDate=${endDate}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.success) {
            if (data.transactions.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align: center; padding: 40px; color: #94a3b8;">
                            <i class="fas fa-exchange-alt" style="font-size: 32px; margin-bottom: 12px; display: block;"></i>
                            <p style="margin: 0;">Belum ada transaksi</p>
                        </td>
                    </tr>
                `;
            } else {
                tbody.innerHTML = data.transactions.map(t => `
                    <tr>
                        <td>#${t.id}</td>
                        <td>
                            <div>${t.userName || '-'}</div>
                            <small style="color: #94a3b8;">${t.userNim || ''}</small>
                        </td>
                        <td>#${t.lockerId}</td>
                        <td>
                            <span class="type-badge ${t.type}">
                                ${t.type === 'pinjam' ? 'Peminjaman' : 'Pengembalian'}
                            </span>
                        </td>
                        <td>
                            <div>${formatDateTime(t.startTime)}</div>
                            ${t.endTime ? `<small style="color: #94a3b8;">s/d ${formatDateTime(t.endTime)}</small>` : ''}
                        </td>
                        <td>
                            <span class="status-badge ${t.status}">
                                ${t.status === 'completed' ? 'Selesai' : 'Aktif'}
                            </span>
                        </td>
                    </tr>
                `).join('');
            }
        }
    } catch (error) {
        console.error('Error loading transactions:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 40px; color: #f87171;">
                    Gagal memuat data transaksi
                </td>
            </tr>
        `;
    }
}

function formatDateTime(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// ==================== NOTIFICATIONS ====================

async function loadNotificationsFromAPI() {
    const dropdown = document.getElementById('notificationDropdown');
    const badge = document.querySelector('.notification-badge');
    if (!dropdown) return;

    try {
        const response = await authFetch('/api/admin/notifications');
        if (!response) return;
        const data = await response.json();

        if (data.success) {
            // Update badge
            if (badge) {
                badge.textContent = data.unreadCount;
                badge.style.display = data.unreadCount > 0 ? 'flex' : 'none';
            }

            // Update notification list
            const listContainer = dropdown.querySelector('.notification-list');
            if (listContainer && data.notifications.length > 0) {
                listContainer.innerHTML = data.notifications.map(n => `
                    <div class="notification-item ${n.read ? '' : 'unread'}">
                        <i class="fas ${n.icon} notification-icon ${n.iconClass || ''}"></i>
                        <div class="notification-content">
                            <p>${n.message}</p>
                            <span>${formatRelativeTime(n.time)}</span>
                        </div>
                    </div>
                `).join('');
            } else if (listContainer) {
                listContainer.innerHTML = `
                    <div style="text-align: center; padding: 20px; color: #94a3b8;">
                        <i class="fas fa-bell-slash" style="font-size: 24px; margin-bottom: 8px;"></i>
                        <p style="margin: 0; font-size: 12px;">Tidak ada notifikasi</p>
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}

// Refresh notifications every 2 minutes
setInterval(loadNotificationsFromAPI, 2 * 60 * 1000);

// ==================== RECENT ACTIVITY ====================

async function loadRecentActivity() {
    const activityList = document.getElementById('adminActivityList');
    if (!activityList) return;

    try {
        const response = await authFetch('/api/admin/activity');
        if (!response) return;
        const data = await response.json();

        if (data.success && data.activities.length > 0) {
            activityList.innerHTML = data.activities.map(a => `
                <div class="activity-item">
                    <div class="activity-icon ${a.actionType === 'return' ? 'return' : 'book'}">
                        <i class="fas ${a.actionType === 'return' ? 'fa-box-open' : 'fa-box'}"></i>
                    </div>
                    <div class="activity-details">
                        <p class="activity-text">${a.message}</p>
                        <span class="activity-time">${formatRelativeTime(a.time)}</span>
                    </div>
                </div>
            `).join('');
        } else {
            activityList.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 30px;">
                    <i class="fas fa-clock" style="font-size: 32px; color: #94a3b8; margin-bottom: 12px;"></i>
                    <p style="color: #64748b; font-size: 13px;">Belum ada aktivitas</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading activity:', error);
    }
}

// Refresh activity every 30 seconds
setInterval(loadRecentActivity, 30 * 1000);

// ==================== LOCKER MINI GRID ====================

async function loadLockerMiniGrid() {
    const grid = document.getElementById('adminLockerGrid');
    if (!grid) return;

    try {
        const response = await fetch('/api/lockers');
        const data = await response.json();

        if (data.success && data.lockers.length > 0) {
            grid.innerHTML = data.lockers.slice(0, 20).map(locker => `
                <div class="locker-mini ${locker.status}" title="Locker #${locker.id} - ${locker.status === 'available' ? 'Tersedia' : locker.status === 'occupied' ? 'Terpakai' : 'Maintenance'}">
                    ${locker.id}
                </div>
            `).join('');
        } else {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 20px; color: #94a3b8; font-size: 12px;">
                    <i class="fas fa-box" style="font-size: 24px; margin-bottom: 8px; display: block;"></i>
                    Belum ada locker terdaftar
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading locker grid:', error);
    }
}

// ==================== ADD USER FORM ====================

function initAddUserForm() {
    const form = document.getElementById('addUserForm');
    const modal = document.getElementById('addUserModal');
    if (!form || !modal) return;

    // Find save button
    const saveBtn = modal.querySelector('.modal-footer .primary-btn');
    if (saveBtn) {
        saveBtn.onclick = async function () {
            const inputs = form.querySelectorAll('input');
            const name = inputs[0]?.value?.trim();
            const nim = inputs[1]?.value?.trim();
            const email = inputs[2]?.value?.trim();
            const password = inputs[3]?.value;

            if (!name || !nim || !email || !password) {
                showToast('Semua field harus diisi', 'error');
                return;
            }

            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';

            try {
                const response = await fetch('/api/admin/add-user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, nim, email, password })
                });

                const data = await response.json();

                if (data.success) {
                    showToast('Pengguna berhasil ditambahkan', 'success');
                    hideModal('addUserModal');
                    form.reset();
                    loadUsersTable();
                    loadDashboardStatistics();
                } else {
                    showToast(data.message || 'Gagal menambah pengguna', 'error');
                }
            } catch (error) {
                showToast('Terjadi kesalahan', 'error');
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = 'Simpan';
            }
        };
    }
}

// ==================== ADD LOCKER FORM ====================

function initAddLockerForm() {
    const form = document.getElementById('addLockerForm');
    const modal = document.getElementById('addLockerModal');
    if (!form || !modal) return;

    // Add save button if missing
    let footer = modal.querySelector('.modal-footer');
    if (!footer) {
        footer = document.createElement('div');
        footer.className = 'modal-footer';
        footer.innerHTML = `
            <button class="secondary-btn" onclick="hideModal('addLockerModal')">Batal</button>
            <button class="primary-btn" id="saveLockerBtn">Simpan</button>
        `;
        modal.querySelector('.modal')?.appendChild(footer);
    }

    const saveBtn = footer.querySelector('.primary-btn') || document.getElementById('saveLockerBtn');
    if (saveBtn) {
        saveBtn.onclick = async function () {
            const inputs = form.querySelectorAll('input, select');
            const lockerCode = inputs[0]?.value?.trim();
            const location = inputs[1]?.value;
            const status = inputs[2]?.value || 'available';

            if (!lockerCode) {
                showToast('Nomor locker harus diisi', 'error');
                return;
            }

            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';

            try {
                const response = await fetch('/api/admin/add-locker', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lockerCode, location, status })
                });

                const data = await response.json();

                if (data.success) {
                    showToast('Locker berhasil ditambahkan', 'success');
                    hideModal('addLockerModal');
                    form.reset();
                    initLockerManagement();
                    loadLockerMiniGrid();
                    loadDashboardStatistics();
                } else {
                    showToast(data.message || 'Gagal menambah locker', 'error');
                }
            } catch (error) {
                showToast('Terjadi kesalahan', 'error');
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = 'Simpan';
            }
        };
    }
}

// ==================== USER ACTIONS ====================

function viewUserDetails(userId) {
    showToast(`Melihat detail user ID: ${userId}`, 'info');
    // Can be extended to show a modal with full details
}

function editUserData(userId) {
    showToast('Fitur edit pengguna sedang dalam pengembangan', 'info');
}

async function deleteUserData(userId, userName) {
    if (!confirm(`Apakah Anda yakin ingin menghapus pengguna "${userName}"?`)) {
        return;
    }

    showToast('Fitur hapus pengguna sedang dalam pengembangan', 'info');
}

// Auto-refresh data when navigating to pages
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function () {
        const page = this.dataset.page;
        if (page === 'users') {
            setTimeout(() => loadUsersTable(), 100);
        } else if (page === 'transactions') {
            setTimeout(() => loadTransactions(), 100);
        }
    });
});

// Initialize filter event listeners for transactions
document.addEventListener('DOMContentLoaded', function () {
    const transTypeFilter = document.querySelector('#transactionsPage .filter-select');
    const transDateInputs = document.querySelectorAll('#transactionsPage .date-input');

    if (transTypeFilter) {
        transTypeFilter.addEventListener('change', () => loadTransactions(1));
    }

    transDateInputs.forEach(input => {
        input.addEventListener('change', () => loadTransactions(1));
    });
});
