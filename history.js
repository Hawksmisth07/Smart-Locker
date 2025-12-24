// ==================== Smart Locker History Script ====================
// Handles history filtering, searching, and export functionality

// ==================== SOCKET.IO REAL-TIME CONNECTION ====================
let historySocket = null;

function initHistorySocketIO() {
    // Connect to Socket.IO server
    historySocket = io({
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });

    historySocket.on('connect', () => {
        console.log('✅ History page connected to real-time server');
    });

    historySocket.on('disconnect', () => {
        console.log('❌ History page disconnected from real-time server');
    });

    // Listen for new history entries
    historySocket.on('history:new', (data) => {
        console.log('📜 New history entry:', data);
        // Reload history data
        filterHistory(currentFilter);
        showToast('Riwayat baru ditambahkan', 'info');
    });
}

// ==================== DATA VARIABLES ====================

// History data - loaded from API
let historyData = [];

let currentFilter = 'all';
let searchQuery = '';

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

// Fetch history from API
async function loadHistoryFromAPI(filter = 'all') {
    const user = getUserData();
    if (!user) {
        showToast('Silakan login terlebih dahulu', 'error');
        window.location.href = 'index.html';
        return;
    }

    const historyList = document.getElementById('historyList') || document.querySelector('.history-list');
    if (historyList) {
        historyList.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> Memuat riwayat...</div>';
    }

    try {
        const filterParam = filter !== 'all' ? `&filter=${filter}` : '';
        const response = await fetch(`/api/user/history?userId=${user.id}${filterParam}`);
        const data = await response.json();

        if (data.success) {
            // Convert date strings to Date objects
            historyData = data.history.map(item => ({
                ...item,
                date: new Date(item.date)
            }));
            return historyData;
        } else {
            console.error('Failed to load history:', data.message);
            showToast('Gagal memuat riwayat', 'error');
            return [];
        }
    } catch (error) {
        console.error('Error fetching history:', error);
        showToast('Gagal memuat riwayat', 'error');
        return [];
    }
}

// ==================== Filter Functions ====================

async function filterHistory(filter) {
    currentFilter = filter;

    // Fetch data from API with filter
    await loadHistoryFromAPI(filter);

    let filtered = [...historyData];

    // Apply search filter if exists
    if (searchQuery) {
        filtered = filtered.filter(item =>
            item.lockerId.toString().includes(searchQuery) ||
            formatDate(item.date).toLowerCase().includes(searchQuery.toLowerCase())
        );
    }

    renderHistory(filtered);
    updateStats(filtered);

    // Announce to screen readers
    if (typeof A11y !== 'undefined') {
        A11y.announce(`Menampilkan ${filtered.length} riwayat`);
    }
}

function searchHistory(query) {
    searchQuery = query.toLowerCase();

    // Filter locally from already loaded data
    let filtered = [...historyData];

    if (searchQuery) {
        filtered = filtered.filter(item =>
            item.lockerId.toString().includes(searchQuery) ||
            formatDate(item.date).toLowerCase().includes(searchQuery.toLowerCase())
        );
    }

    renderHistory(filtered);
    updateStats(filtered);
}

// ==================== Render Functions ====================

function renderHistory(data) {
    const historyList = document.getElementById('historyList') || document.querySelector('.history-list');
    if (!historyList) return;

    if (data.length === 0) {
        historyList.innerHTML = '';
        const emptyState = createEmptyState();
        historyList.appendChild(emptyState);
        return;
    }

    // Group by date
    const grouped = groupByDate(data);

    let html = '';
    for (const [dateLabel, items] of Object.entries(grouped)) {
        html += `
            <div class="date-group">
                <div class="date-label"><i class="fas fa-calendar-day" aria-hidden="true"></i> ${dateLabel}</div>
                ${items.map(item => renderHistoryCard(item)).join('')}
            </div>
        `;
    }

    historyList.innerHTML = html;
}

function renderHistoryCard(item) {
    return `
        <div class="history-card" role="article" aria-label="Penggunaan loker ${item.lockerId}">
            <div class="locker-badge">${item.lockerId}</div>
            <div class="history-info">
                <div class="history-title">Locker #${item.lockerId}</div>
                <div class="history-time">
                    <i class="fas fa-clock" aria-hidden="true"></i> 
                    ${item.startTime} - ${item.endTime} WIB
                </div>
            </div>
            <div class="history-meta">
                <span class="duration">${formatDuration(item.duration)}</span>
                <span class="status ${item.status}" aria-label="Status: selesai">
                    <i class="fas fa-check" aria-hidden="true"></i>
                </span>
            </div>
        </div>
    `;
}

function createEmptyState() {
    const div = document.createElement('div');
    div.className = 'empty-state';
    div.innerHTML = `
        <div class="empty-state-icon">
            <i class="fas fa-history" aria-hidden="true"></i>
        </div>
        <h3 class="empty-state-title">Tidak Ada Riwayat</h3>
        <p class="empty-state-text">Belum ada riwayat penggunaan loker untuk periode yang dipilih.</p>
        <button class="empty-state-action" onclick="filterHistory('all')">
            Lihat Semua Riwayat
        </button>
    `;
    return div;
}

function groupByDate(data) {
    const groups = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today.getTime() - 86400000);

    data.forEach(item => {
        const itemDate = new Date(item.date);
        itemDate.setHours(0, 0, 0, 0);

        let label;
        if (itemDate.getTime() === today.getTime()) {
            label = 'Hari Ini';
        } else if (itemDate.getTime() === yesterday.getTime()) {
            label = 'Kemarin';
        } else {
            label = formatDate(item.date);
        }

        if (!groups[label]) {
            groups[label] = [];
        }
        groups[label].push(item);
    });

    return groups;
}

// ==================== Stats Functions ====================

function updateStats(data) {
    const totalUsage = data.length;
    const totalMinutes = data.reduce((sum, item) => sum + item.duration, 0);
    const totalHours = Math.round(totalMinutes / 60);

    // Count unique days
    const uniqueDays = new Set(data.map(item => formatDate(item.date))).size;

    // Calculate average
    const avgHoursPerDay = uniqueDays > 0 ? (totalMinutes / 60 / uniqueDays).toFixed(1) : 0;

    // Update DOM
    const stats = document.querySelectorAll('.stat-value');
    if (stats.length >= 4) {
        stats[0].textContent = totalUsage;
        stats[1].textContent = totalHours;
        stats[2].textContent = uniqueDays;
        stats[3].textContent = avgHoursPerDay;
    }

    // Update chart
    updateChart(data);
}

function updateChart(data) {
    const chartContainer = document.querySelector('.chart-bars');
    if (!chartContainer) return;

    // Get the last 7 days
    const days = [];
    const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    const dayData = new Array(7).fill(0);

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Create array of last 7 days (from 6 days ago to today)
    for (let i = 6; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        days.push({
            date: date,
            label: dayNames[date.getDay()],
            index: 6 - i
        });
    }

    // Calculate usage for each day
    data.forEach(item => {
        const itemDate = new Date(item.date);
        itemDate.setHours(0, 0, 0, 0);

        days.forEach((day, index) => {
            if (itemDate.getTime() === day.date.getTime()) {
                dayData[index] += item.duration / 60; // Convert to hours
            }
        });
    });

    // Find max for scaling
    const maxHours = Math.max(...dayData, 1);

    // Rebuild chart bars
    chartContainer.innerHTML = days.map((day, index) => {
        const percentage = (dayData[index] / maxHours) * 100;
        const height = Math.max(percentage, 5);
        const value = dayData[index].toFixed(1);

        return `
            <div class="chart-bar">
                <div class="bar-fill" style="height: ${height}%;">
                    <span class="bar-value">${value}</span>
                </div>
                <span class="bar-label">${day.label}</span>
            </div>
        `;
    }).join('');
}

// ==================== Export Functions ====================

async function exportToPDF() {
    // Show loading
    if (typeof LoadingManager !== 'undefined') {
        LoadingManager.showOverlay();
    }

    try {
        // Check if jsPDF is loaded
        if (typeof jspdf === 'undefined') {
            // Load jsPDF dynamically
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        }

        const { jsPDF } = jspdf;
        const doc = new jsPDF();

        // Title
        doc.setFontSize(20);
        doc.setTextColor(30, 60, 114);
        doc.text('Riwayat Penggunaan Smart Locker', 20, 20);

        // User info
        const user = JSON.parse(sessionStorage.getItem('user') || localStorage.getItem('user') || '{}');
        doc.setFontSize(12);
        doc.setTextColor(100);
        doc.text(`Nama: ${user.name || 'User'}`, 20, 35);
        doc.text(`NIM: ${user.nim || '-'}`, 20, 42);
        doc.text(`Tanggal Export: ${formatDate(new Date())}`, 20, 49);

        // Table header
        doc.setFillColor(30, 60, 114);
        doc.rect(20, 60, 170, 10, 'F');
        doc.setTextColor(255);
        doc.setFontSize(10);
        doc.text('No', 25, 67);
        doc.text('Loker', 45, 67);
        doc.text('Tanggal', 70, 67);
        doc.text('Waktu', 110, 67);
        doc.text('Durasi', 150, 67);

        // Table content
        doc.setTextColor(50);
        let y = 77;
        const filteredData = currentFilter === 'all' ? historyData :
            historyData.filter(item => {
                const now = new Date();
                if (currentFilter === 'week') {
                    return item.date >= new Date(now.getTime() - 7 * 86400000);
                } else if (currentFilter === 'month') {
                    return item.date >= new Date(now.getTime() - 30 * 86400000);
                }
                return true;
            });

        filteredData.forEach((item, index) => {
            if (y > 270) {
                doc.addPage();
                y = 20;
            }

            // Zebra striping
            if (index % 2 === 0) {
                doc.setFillColor(240, 240, 240);
                doc.rect(20, y - 5, 170, 8, 'F');
            }

            doc.text((index + 1).toString(), 25, y);
            doc.text(`#${item.lockerId}`, 45, y);
            doc.text(formatDate(item.date), 70, y);
            doc.text(`${item.startTime} - ${item.endTime}`, 110, y);
            doc.text(formatDuration(item.duration), 150, y);

            y += 10;
        });

        // Summary
        y += 10;
        doc.setFontSize(11);
        doc.setTextColor(30, 60, 114);
        doc.text(`Total Penggunaan: ${filteredData.length} kali`, 20, y);
        doc.text(`Total Durasi: ${Math.round(filteredData.reduce((sum, i) => sum + i.duration, 0) / 60)} jam`, 100, y);

        // Save
        doc.save(`Smart-Locker-History-${formatDate(new Date()).replace(/\s/g, '-')}.pdf`);

        // Show success toast
        if (typeof showToast === 'function') {
            showToast('PDF berhasil didownload!', 'success');
        }

    } catch (error) {
        console.error('Error exporting PDF:', error);
        if (typeof showToast === 'function') {
            showToast('Gagal mengexport PDF', 'error');
        }
    } finally {
        if (typeof LoadingManager !== 'undefined') {
            LoadingManager.hideOverlay();
        }
    }
}

async function exportToCSV() {
    try {
        const filteredData = currentFilter === 'all' ? historyData :
            historyData.filter(item => {
                const now = new Date();
                if (currentFilter === 'week') {
                    return item.date >= new Date(now.getTime() - 7 * 86400000);
                } else if (currentFilter === 'month') {
                    return item.date >= new Date(now.getTime() - 30 * 86400000);
                }
                return true;
            });

        // Create CSV content
        let csv = 'No,Loker,Tanggal,Waktu Mulai,Waktu Selesai,Durasi (menit),Status\n';

        filteredData.forEach((item, index) => {
            csv += `${index + 1},#${item.lockerId},"${formatDate(item.date)}",${item.startTime},${item.endTime},${item.duration},${item.status}\n`;
        });

        // Download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `Smart-Locker-History-${formatDate(new Date()).replace(/\s/g, '-')}.csv`;
        link.click();

        if (typeof showToast === 'function') {
            showToast('CSV berhasil didownload!', 'success');
        }

    } catch (error) {
        console.error('Error exporting CSV:', error);
        if (typeof showToast === 'function') {
            showToast('Gagal mengexport CSV', 'error');
        }
    }
}

// ==================== Helper Functions ====================

function formatDate(date) {
    return date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

function formatDuration(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours > 0) {
        return `${hours}j ${mins}m`;
    }
    return `${mins}m`;
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// Toast notification function if not defined globally
function showToast(message, type = 'info') {
    let container = document.getElementById('toastContainer');

    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}" aria-hidden="true"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3500);
}

// ==================== Initialize ====================

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Socket.IO for real-time updates
    initHistorySocketIO();

    // Initialize filter pills
    document.querySelectorAll('.filter-pill').forEach(pill => {
        pill.addEventListener('click', function () {
            document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
            this.classList.add('active');
            filterHistory(this.dataset.filter);
        });
    });

    // Initialize search if exists
    const searchInput = document.getElementById('historySearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchHistory(e.target.value);
        });
    }

    // Initialize export buttons
    const exportPdfBtn = document.getElementById('exportPdfBtn');
    if (exportPdfBtn) {
        exportPdfBtn.addEventListener('click', exportToPDF);
    }

    const exportCsvBtn = document.getElementById('exportCsvBtn');
    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', exportToCSV);
    }

    // Initial render
    filterHistory('all');

    // History page initialized successfully
});

// Make functions available globally
window.filterHistory = filterHistory;
window.exportToPDF = exportToPDF;
window.exportToCSV = exportToCSV;
