// ==================== Smart Locker Theme Manager ====================
// Handles dark/light mode switching with smooth transitions

const ThemeManager = {
    // Current theme
    currentTheme: 'light',

    // Initialize theme on page load
    init() {
        // Check for saved preference
        const savedTheme = localStorage.getItem('smartLocker-theme');

        if (savedTheme) {
            this.currentTheme = savedTheme;
        } else {
            // Check system preference
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            this.currentTheme = prefersDark ? 'dark' : 'light';
        }

        // Apply theme without transition on initial load
        this.applyTheme(false);

        // Listen for system preference changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem('smartLocker-theme')) {
                this.currentTheme = e.matches ? 'dark' : 'light';
                this.applyTheme(true);
            }
        });

        // Sync with settings page toggle if available
        this.syncSettingsToggle();

        console.log(`🎨 Theme initialized: ${this.currentTheme}`);
    },

    // Apply the current theme
    applyTheme(withTransition = true) {
        const html = document.documentElement;

        if (!withTransition) {
            html.style.transition = 'none';
            setTimeout(() => {
                html.style.transition = '';
            }, 100);
        }

        if (this.currentTheme === 'dark') {
            html.setAttribute('data-theme', 'dark');
        } else {
            html.removeAttribute('data-theme');
        }

        // Update any toggle switches
        this.updateToggles();
    },

    // Toggle between light and dark
    toggle() {
        this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('smartLocker-theme', this.currentTheme);
        this.applyTheme(true);

        // Show toast notification if available
        if (typeof showToast === 'function') {
            showToast(
                this.currentTheme === 'dark' ? '🌙 Mode Gelap Aktif' : '☀️ Mode Terang Aktif',
                'success'
            );
        }

        console.log(`🎨 Theme switched to: ${this.currentTheme}`);
    },

    // Set specific theme
    setTheme(theme) {
        if (theme === 'dark' || theme === 'light') {
            this.currentTheme = theme;
            localStorage.setItem('smartLocker-theme', this.currentTheme);
            this.applyTheme(true);
        }
    },

    // Update toggle UI elements
    updateToggles() {
        const isDark = this.currentTheme === 'dark';

        // Update all checkbox toggles (settings page and switch toggles)
        const toggles = document.querySelectorAll('[data-theme-toggle], #darkMode, #navThemeSwitch, .theme-switch-input');
        toggles.forEach(toggle => {
            if (toggle.type === 'checkbox') {
                toggle.checked = isDark;
            }
        });

        // Update switch toggle icons (sun/moon inside the slider)
        const switchIcons = document.querySelectorAll('#themeSwitchIcon, .theme-switch-slider i');
        switchIcons.forEach(icon => {
            if (icon) {
                icon.className = isDark ? 'fas fa-moon' : 'fas fa-sun';
            }
        });

        // Update old-style theme toggle button icons (moon/sun)
        const themeIcons = document.querySelectorAll('#themeIcon, #navThemeIcon, .theme-toggle-btn i');
        themeIcons.forEach(icon => {
            if (icon) {
                icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
            }
        });
    },

    // Sync with settings page toggle
    syncSettingsToggle() {
        const darkModeToggle = document.getElementById('darkMode');
        if (darkModeToggle) {
            darkModeToggle.checked = this.currentTheme === 'dark';

            darkModeToggle.addEventListener('change', (e) => {
                this.setTheme(e.target.checked ? 'dark' : 'light');
            });
        }
    },

    // Check if dark mode is active
    isDark() {
        return this.currentTheme === 'dark';
    }
};

// ==================== Session Manager ====================
// Handles session timeout warnings

const SessionManager = {
    // Session duration in milliseconds (30 minutes default)
    sessionDuration: 30 * 60 * 1000,
    warningTime: 5 * 60 * 1000, // 5 minutes before timeout
    lastActivity: Date.now(),
    warningShown: false,
    timeoutId: null,
    warningTimeoutId: null,

    init() {
        // Update last activity on user interaction
        const events = ['click', 'keypress', 'scroll', 'mousemove', 'touchstart'];
        events.forEach(event => {
            document.addEventListener(event, () => this.resetTimer(), { passive: true });
        });

        this.startTimer();
        console.log('⏰ Session manager initialized');
    },

    startTimer() {
        this.clearTimers();

        // Warning timeout
        this.warningTimeoutId = setTimeout(() => {
            this.showWarning();
        }, this.sessionDuration - this.warningTime);

        // Session timeout
        this.timeoutId = setTimeout(() => {
            this.onTimeout();
        }, this.sessionDuration);
    },

    clearTimers() {
        if (this.timeoutId) clearTimeout(this.timeoutId);
        if (this.warningTimeoutId) clearTimeout(this.warningTimeoutId);
    },

    resetTimer() {
        this.lastActivity = Date.now();
        this.warningShown = false;
        this.hideWarning();
        this.startTimer();
    },

    showWarning() {
        if (this.warningShown) return;
        this.warningShown = true;

        // Create and show warning modal
        let modal = document.getElementById('sessionWarningModal');
        if (!modal) {
            modal = this.createWarningModal();
            document.body.appendChild(modal);
        }

        modal.classList.add('active');
        this.startCountdown();
    },

    hideWarning() {
        const modal = document.getElementById('sessionWarningModal');
        if (modal) {
            modal.classList.remove('active');
        }
    },

    createWarningModal() {
        const modal = document.createElement('div');
        modal.id = 'sessionWarningModal';
        modal.className = 'session-warning-modal';
        modal.setAttribute('role', 'alertdialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'session-warning-title');
        modal.innerHTML = `
            <div class="session-warning-content">
                <div class="session-warning-icon">
                    <i class="fas fa-clock" aria-hidden="true"></i>
                </div>
                <h2 id="session-warning-title" class="session-warning-title">Sesi Akan Berakhir</h2>
                <p class="session-warning-text">Sesi Anda akan berakhir dalam:</p>
                <div class="session-warning-timer" id="sessionTimer">5:00</div>
                <p class="session-warning-text">Apakah Anda ingin melanjutkan sesi?</p>
                <div class="session-warning-actions">
                    <button class="session-warning-btn primary" onclick="SessionManager.extendSession()" aria-label="Perpanjang sesi">
                        <i class="fas fa-refresh"></i> Perpanjang
                    </button>
                    <button class="session-warning-btn secondary" onclick="SessionManager.logout()" aria-label="Logout sekarang">
                        <i class="fas fa-sign-out-alt"></i> Logout
                    </button>
                </div>
            </div>
        `;
        return modal;
    },

    startCountdown() {
        let remaining = this.warningTime / 1000; // in seconds
        const timerEl = document.getElementById('sessionTimer');

        const countdown = setInterval(() => {
            if (!this.warningShown) {
                clearInterval(countdown);
                return;
            }

            remaining--;
            const minutes = Math.floor(remaining / 60);
            const seconds = remaining % 60;

            if (timerEl) {
                timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }

            if (remaining <= 0) {
                clearInterval(countdown);
            }
        }, 1000);
    },

    extendSession() {
        this.resetTimer();
        if (typeof showToast === 'function') {
            showToast('Sesi diperpanjang', 'success');
        }
    },

    onTimeout() {
        this.logout();
    },

    logout() {
        sessionStorage.removeItem('user');
        localStorage.removeItem('user');
        localStorage.removeItem('userActiveLocker');
        window.location.href = 'index.html';
    }
};

// ==================== Loading State Manager ====================
const LoadingManager = {
    showLoading(container, type = 'card') {
        const skeleton = this.createSkeleton(type);
        if (container) {
            container.innerHTML = '';
            container.appendChild(skeleton);
        }
    },

    hideLoading(container) {
        if (container) {
            const skeletons = container.querySelectorAll('.skeleton, .skeleton-container');
            skeletons.forEach(s => s.remove());
        }
    },

    createSkeleton(type) {
        const container = document.createElement('div');
        container.className = 'skeleton-container';

        switch (type) {
            case 'card':
                container.innerHTML = `
                    <div class="skeleton skeleton-card"></div>
                `;
                break;
            case 'stats':
                container.innerHTML = `
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
                        <div class="skeleton skeleton-stat"></div>
                        <div class="skeleton skeleton-stat"></div>
                        <div class="skeleton skeleton-stat"></div>
                    </div>
                `;
                break;
            case 'list':
                container.innerHTML = `
                    <div class="skeleton skeleton-card" style="height: 80px; margin-bottom: 10px;"></div>
                    <div class="skeleton skeleton-card" style="height: 80px; margin-bottom: 10px;"></div>
                    <div class="skeleton skeleton-card" style="height: 80px;"></div>
                `;
                break;
            case 'profile':
                container.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px;">
                        <div class="skeleton skeleton-avatar"></div>
                        <div style="flex: 1;">
                            <div class="skeleton skeleton-text short"></div>
                            <div class="skeleton skeleton-text medium"></div>
                        </div>
                    </div>
                `;
                break;
            default:
                container.innerHTML = `<div class="skeleton skeleton-card"></div>`;
        }

        return container;
    },

    // Show full page loading overlay
    showOverlay() {
        let overlay = document.getElementById('loadingOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'loadingOverlay';
            overlay.className = 'loading-overlay';
            overlay.innerHTML = `
                <div class="loading-content" style="text-align: center;">
                    <div class="loading-spinner"></div>
                    <p style="color: white; margin-top: 15px; font-size: 14px;">Memuat...</p>
                </div>
            `;
            document.body.appendChild(overlay);
        }
        overlay.classList.add('active');
    },

    hideOverlay() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.classList.remove('active');
        }
    }
};

// ==================== Empty State Helper ====================
const EmptyState = {
    create(icon, title, text, actionText = null, actionCallback = null) {
        const container = document.createElement('div');
        container.className = 'empty-state';
        container.innerHTML = `
            <div class="empty-state-icon">
                <i class="fas ${icon}" aria-hidden="true"></i>
            </div>
            <h3 class="empty-state-title">${title}</h3>
            <p class="empty-state-text">${text}</p>
            ${actionText ? `<button class="empty-state-action">${actionText}</button>` : ''}
        `;

        if (actionText && actionCallback) {
            container.querySelector('.empty-state-action').addEventListener('click', actionCallback);
        }

        return container;
    }
};

// ==================== Accessibility Helper ====================
const A11y = {
    // Announce message to screen readers
    announce(message, priority = 'polite') {
        let announcer = document.getElementById('a11y-announcer');
        if (!announcer) {
            announcer = document.createElement('div');
            announcer.id = 'a11y-announcer';
            announcer.setAttribute('aria-live', priority);
            announcer.setAttribute('aria-atomic', 'true');
            announcer.className = 'sr-only';
            document.body.appendChild(announcer);
        }

        announcer.textContent = message;
    },

    // Trap focus within modal
    trapFocus(modal) {
        const focusable = modal.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstFocusable = focusable[0];
        const lastFocusable = focusable[focusable.length - 1];

        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                if (e.shiftKey) {
                    if (document.activeElement === firstFocusable) {
                        lastFocusable.focus();
                        e.preventDefault();
                    }
                } else {
                    if (document.activeElement === lastFocusable) {
                        firstFocusable.focus();
                        e.preventDefault();
                    }
                }
            }

            if (e.key === 'Escape') {
                // Close modal on escape
                const closeBtn = modal.querySelector('.modal-close, [data-dismiss="modal"]');
                if (closeBtn) closeBtn.click();
            }
        });

        // Focus first element
        if (firstFocusable) firstFocusable.focus();
    }
};

// ==================== Initialize on DOM Load ====================
document.addEventListener('DOMContentLoaded', () => {
    ThemeManager.init();

    // Only init session manager if user is logged in
    const user = sessionStorage.getItem('user') || localStorage.getItem('user');
    if (user && !window.location.pathname.includes('index.html') &&
        !window.location.pathname.includes('admin-login')) {
        SessionManager.init();
    }
});

// Export for use in other scripts
window.ThemeManager = ThemeManager;
window.SessionManager = SessionManager;
window.LoadingManager = LoadingManager;
window.EmptyState = EmptyState;
window.A11y = A11y;
