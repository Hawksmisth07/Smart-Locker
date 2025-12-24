/**
 * Cache Busting Utility for Smart Loker
 * Automatically checks for new versions and prompts users to reload
 */

(function () {
    'use strict';

    const CACHE_VERSION_KEY = 'smart_loker_version';
    const CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes

    // Get stored version from localStorage
    function getStoredVersion() {
        return localStorage.getItem(CACHE_VERSION_KEY);
    }

    // Store new version
    function setStoredVersion(version) {
        localStorage.setItem(CACHE_VERSION_KEY, version);
    }

    // Check for new version from server
    async function checkForUpdates() {
        try {
            const response = await fetch('/api/version?t=' + Date.now(), {
                cache: 'no-store',
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache'
                }
            });

            if (!response.ok) return;

            const data = await response.json();
            const storedVersion = getStoredVersion();

            if (storedVersion && storedVersion !== data.version) {
                // New version detected - show update notification
                showUpdateNotification();
            } else if (!storedVersion) {
                // First visit - store current version
                setStoredVersion(data.version);
            }
        } catch (error) {
            console.log('Version check failed:', error.message);
        }
    }

    // Show update notification
    function showUpdateNotification() {
        // Check if notification already exists
        if (document.getElementById('cache-update-notification')) return;

        const notification = document.createElement('div');
        notification.id = 'cache-update-notification';
        notification.innerHTML = `
            <style>
                #cache-update-notification {
                    position: fixed;
                    bottom: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 15px 25px;
                    border-radius: 12px;
                    box-shadow: 0 8px 32px rgba(102, 126, 234, 0.4);
                    z-index: 99999;
                    display: flex;
                    align-items: center;
                    gap: 15px;
                    animation: slideUp 0.5s ease-out;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }
                @keyframes slideUp {
                    from { transform: translate(-50%, 100%); opacity: 0; }
                    to { transform: translate(-50%, 0); opacity: 1; }
                }
                #cache-update-notification .update-icon {
                    font-size: 24px;
                }
                #cache-update-notification .update-text {
                    font-size: 14px;
                }
                #cache-update-notification .update-btn {
                    background: white;
                    color: #667eea;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 600;
                    transition: transform 0.2s;
                }
                #cache-update-notification .update-btn:hover {
                    transform: scale(1.05);
                }
                #cache-update-notification .close-btn {
                    background: transparent;
                    border: none;
                    color: rgba(255,255,255,0.7);
                    cursor: pointer;
                    font-size: 18px;
                    padding: 5px;
                }
            </style>
            <span class="update-icon">🔄</span>
            <span class="update-text">Versi baru tersedia!</span>
            <button class="update-btn" onclick="window.location.reload(true)">Refresh</button>
            <button class="close-btn" onclick="this.parentElement.remove()">✕</button>
        `;

        document.body.appendChild(notification);
    }

    // Force clear browser cache for current page
    function forceCacheClear() {
        // Clear service worker caches if any
        if ('caches' in window) {
            caches.keys().then(function (names) {
                for (let name of names) {
                    caches.delete(name);
                }
            });
        }

        // Unregister service workers
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(function (registrations) {
                for (let registration of registrations) {
                    registration.unregister();
                }
            });
        }
    }

    // Initialize
    function init() {
        // Force cache clear on first load
        forceCacheClear();

        // Check for updates immediately
        checkForUpdates();

        // Set up periodic checks
        setInterval(checkForUpdates, CHECK_INTERVAL);

        // Check when page becomes visible
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) {
                checkForUpdates();
            }
        });
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose for manual cache clearing
    window.SmartLokerCache = {
        checkForUpdates: checkForUpdates,
        clearCache: function () {
            forceCacheClear();
            localStorage.removeItem(CACHE_VERSION_KEY);
            window.location.reload(true);
        }
    };
})();
