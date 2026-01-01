const container = document.getElementById('container');
const registerBtn = document.getElementById('register');
const loginBtn = document.getElementById('login');

// Toggle between Sign In and Sign Up
if (registerBtn) {
    registerBtn.addEventListener('click', () => {
        container.classList.add("active");
    });
}

if (loginBtn) {
    loginBtn.addEventListener('click', () => {
        container.classList.remove("active");
    });
}

// Password Toggle Functionality
const togglePasswordButtons = document.querySelectorAll('.toggle-password');

togglePasswordButtons.forEach(button => {
    button.addEventListener('click', function () {
        const targetId = this.getAttribute('data-target');
        const passwordInput = document.getElementById(targetId);
        const icon = this.querySelector('i');

        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } else {
            passwordInput.type = 'password';
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    });
});

// Email Validation
const emailInputs = document.querySelectorAll('input[type="email"]');

emailInputs.forEach(input => {
    input.addEventListener('input', function () {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const inputGroup = this.closest('.input-group');

        if (this.value.length > 0) {
            if (emailRegex.test(this.value)) {
                inputGroup.classList.remove('invalid');
                inputGroup.classList.add('valid');
            } else {
                inputGroup.classList.remove('valid');
                inputGroup.classList.add('invalid');
            }
        } else {
            inputGroup.classList.remove('valid', 'invalid');
        }
    });
});

// Password Strength Indicator
const signupPasswordInput = document.getElementById('signup-password');
const strengthIndicator = document.querySelector('.password-strength');
const strengthText = document.querySelector('.strength-text');

// Track password strength globally
let currentPasswordStrength = 0;

if (signupPasswordInput && strengthIndicator) {
    signupPasswordInput.addEventListener('input', function () {
        const password = this.value;
        let strength = 0;
        let requirements = [];

        if (password.length === 0) {
            strengthIndicator.classList.remove('weak', 'medium', 'strong');
            strengthText.textContent = '';
            currentPasswordStrength = 0;
            updateSubmitButton();
            return;
        }

        // Check password strength criteria
        if (password.length >= 8) {
            strength++;
        } else {
            requirements.push('min 8 karakter');
        }

        if (password.match(/[a-z]/)) {
            strength++;
        } else {
            requirements.push('huruf kecil');
        }

        if (password.match(/[A-Z]/)) {
            strength++;
        } else {
            requirements.push('huruf besar');
        }

        if (password.match(/[0-9]/)) {
            strength++;
        } else {
            requirements.push('angka');
        }

        if (password.match(/[^a-zA-Z0-9]/)) {
            strength++;
        } else {
            requirements.push('simbol');
        }

        // Update global strength
        currentPasswordStrength = strength;

        // Update strength class and text
        strengthIndicator.classList.remove('weak', 'medium', 'strong');

        if (strength <= 2) {
            strengthIndicator.classList.add('weak');
            strengthText.innerHTML = '<i class="fas fa-times-circle"></i> Password lemah - tambahkan: ' + requirements.slice(0, 2).join(', ');
            strengthText.style.color = '#ef4444';
        } else if (strength === 3) {
            strengthIndicator.classList.add('medium');
            strengthText.innerHTML = '<i class="fas fa-exclamation-circle"></i> Hampir bagus - tambahkan: ' + requirements.join(', ');
            strengthText.style.color = '#f59e0b';
        } else if (strength === 4) {
            strengthIndicator.classList.add('strong');
            strengthText.innerHTML = '<i class="fas fa-check-circle"></i> Password bagus!';
            strengthText.style.color = '#22c55e';
        } else {
            strengthIndicator.classList.add('strong');
            strengthText.innerHTML = '<i class="fas fa-shield-alt"></i> Password sangat kuat!';
            strengthText.style.color = '#10b981';
        }

        updateSubmitButton();
    });
}

// Function to update submit button state based on password strength AND terms agreement
function updateSubmitButton() {
    const signUpForm = document.querySelector('.sign-up form');
    if (!signUpForm) return;

    const submitBtn = signUpForm.querySelector('.submit-btn');
    if (!submitBtn) return;

    const agreeTerms = document.getElementById('agree-terms');
    const termsChecked = agreeTerms ? agreeTerms.checked : false;

    // Password must be at least "Good" (4+ criteria met) AND terms must be accepted
    if (currentPasswordStrength >= 4 && termsChecked) {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.style.cursor = 'pointer';
    } else {
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.6';
        submitBtn.style.cursor = 'not-allowed';
    }
}

// Initialize button state on page load
document.addEventListener('DOMContentLoaded', function () {
    updateSubmitButton();

    // Add event listener for terms checkbox
    const agreeTerms = document.getElementById('agree-terms');
    if (agreeTerms) {
        agreeTerms.addEventListener('change', updateSubmitButton);
    }
});

// Button Loading State
const submitButtons = document.querySelectorAll('.submit-btn');

submitButtons.forEach(button => {
    button.addEventListener('click', function (e) {
        // Don't add loading state if it's just switching forms
        if (this.getAttribute('onclick')) {
            return;
        }

        // Add loading state
        this.classList.add('loading');

        // Simulate loading (remove this in production, handle in actual form submission)
        setTimeout(() => {
            this.classList.remove('loading');
        }, 2000);
    });
});

// Form Submission (Sign Up)
const signUpForm = document.querySelector('.sign-up form');
if (signUpForm) {
    signUpForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const submitBtn = this.querySelector('.submit-btn');
        const name = document.getElementById('signup-name').value.trim();
        const nim = document.getElementById('signup-nim').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const password = document.getElementById('signup-password').value;

        // Validasi frontend
        if (!name || !nim || !email || !password) {
            showToast('Semua field harus diisi!', 'error');
            return;
        }

        // Check password strength - must be at least "Good" (4 criteria)
        if (currentPasswordStrength < 4) {
            showToast('Password harus mencapai level "Bagus" (hijau) untuk mendaftar!', 'error');
            return;
        }

        // Check terms agreement
        const agreeTerms = document.getElementById('agree-terms');
        if (!agreeTerms || !agreeTerms.checked) {
            showToast('Anda harus menyetujui peraturan penggunaan loker!', 'error');
            return;
        }

        submitBtn.classList.add('loading');

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, nim, email, password })
            });

            const data = await response.json();

            if (data.success) {
                showToast(data.message, 'success');
                // Reset form
                this.reset();
                // Switch to login form after 1.5 seconds
                setTimeout(() => {
                    container.classList.remove('active');
                }, 1500);
            } else {
                showToast(data.message, 'error');
            }
        } catch (error) {
            console.error('Registration error:', error);
            showToast('Terjadi kesalahan. Silakan coba lagi.', 'error');
        } finally {
            submitBtn.classList.remove('loading');
        }
    });
}

// Toast Notification Function
function showToast(message, type = 'info') {
    // Remove existing toast
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
        <span>${message}</span>
    `;

    document.body.appendChild(toast);

    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);

    // Remove after 4 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Form Submission (Sign In)
const signInForm = document.querySelector('.sign-in form');
if (signInForm) {
    signInForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const submitBtn = this.querySelector('.submit-btn');
        const email = document.getElementById('signin-email').value.trim();
        const password = document.getElementById('signin-password').value;
        const rememberMe = document.getElementById('remember').checked;

        // Validasi frontend
        if (!email || !password) {
            showToast('Email dan password harus diisi!', 'error');
            return;
        }

        submitBtn.classList.add('loading');

        try {
            const response = await fetch('/api/user/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (data.success) {
                showToast(data.message, 'success');
                // Store user data
                if (rememberMe) {
                    localStorage.setItem('user', JSON.stringify(data.user));
                } else {
                    sessionStorage.setItem('user', JSON.stringify(data.user));
                }
                // Redirect to home after 1 second
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 1000);
            } else {
                showToast(data.message, 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            showToast('Terjadi kesalahan. Silakan coba lagi.', 'error');
        } finally {
            submitBtn.classList.remove('loading');
        }
    });
}

// Floating Labels Enhancement
const allInputs = document.querySelectorAll('.input-group input');

allInputs.forEach(input => {
    // Check if input has value on page load
    if (input.value) {
        input.classList.add('has-value');
    }

    input.addEventListener('blur', function () {
        if (this.value) {
            this.classList.add('has-value');
        } else {
            this.classList.remove('has-value');
        }
    });
});

// Add ripple effect to buttons (optional enhancement)
function createRipple(event) {
    const button = event.currentTarget;

    // Don't add ripple to toggle password buttons
    if (button.classList.contains('toggle-password')) {
        return;
    }

    const circle = document.createElement('span');
    const diameter = Math.max(button.clientWidth, button.clientHeight);
    const radius = diameter / 2;

    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${event.clientX - button.offsetLeft - radius}px`;
    circle.style.top = `${event.clientY - button.offsetTop - radius}px`;
    circle.classList.add('ripple');

    const ripple = button.getElementsByClassName('ripple')[0];

    if (ripple) {
        ripple.remove();
    }

    button.appendChild(circle);
}

const buttons = document.querySelectorAll('button:not(.toggle-password)');
buttons.forEach(button => {
    button.addEventListener('click', createRipple);
});

// Add CSS for ripple effect dynamically
const style = document.createElement('style');
style.textContent = `
    button {
        position: relative;
        overflow: hidden;
    }
    
    .ripple {
        position: absolute;
        border-radius: 50%;
        background-color: rgba(255, 255, 255, 0.6);
        transform: scale(0);
        animation: ripple-animation 0.6s linear;
        pointer-events: none;
    }
    
    @keyframes ripple-animation {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// ==================== SECRET ADMIN ACCESS ====================
// Method 1: Keyboard Shortcut (Ctrl + Shift + A) - Desktop
document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        window.location.href = 'admin-login.html';
    }
});

// Method 2: Logo Click 5x - Desktop & Mobile
let logoClickCount = 0;
let logoClickTimer = null;

// Method 3: Long Press on Security Badge (3 seconds) - Mobile Friendly
let longPressTimer = null;
const LONG_PRESS_DURATION = 3000; // 3 seconds

// Method 4: Tap Copyright 7 times - Mobile Friendly
let copyrightTapCount = 0;
let copyrightTapTimer = null;

document.addEventListener('DOMContentLoaded', function () {
    // Method A: Locker Icon 5x Click (in toggle panel)
    const logo = document.querySelector('.locker-icon');
    if (logo) {
        logo.style.cursor = 'pointer';
        logo.addEventListener('click', function () {
            logoClickCount++;
            if (logoClickTimer) clearTimeout(logoClickTimer);
            logoClickTimer = setTimeout(() => { logoClickCount = 0; }, 800);
            if (logoClickCount >= 5) {
                logoClickCount = 0;
                window.location.href = 'admin-login.html';
            }
        });
    }

    // Method B: Brand Logo "Smart Loker" 5x Click (MOBILE FRIENDLY - always visible)
    const brandLogo = document.querySelector('.brand-logo');
    let brandClickCount = 0;
    let brandClickTimer = null;

    if (brandLogo) {
        brandLogo.style.cursor = 'pointer';
        brandLogo.addEventListener('click', function (e) {
            brandClickCount++;
            // Brand logo click counter for admin access

            if (brandClickTimer) clearTimeout(brandClickTimer);
            brandClickTimer = setTimeout(() => { brandClickCount = 0; }, 1500);

            if (brandClickCount >= 5) {
                brandClickCount = 0;
                window.location.href = 'admin-login.html';
            }
        });
    }

    // Long Press on Security Badge (Works on Mobile)
    const securityBadge = document.querySelector('.security-badge');
    if (securityBadge) {
        // Touch events for mobile
        securityBadge.addEventListener('touchstart', function (e) {
            longPressTimer = setTimeout(() => {
                // Vibrate if available (feedback for user)
                if (navigator.vibrate) navigator.vibrate(200);
                window.location.href = 'admin-login.html';
            }, LONG_PRESS_DURATION);
        });

        securityBadge.addEventListener('touchend', function () {
            if (longPressTimer) clearTimeout(longPressTimer);
        });

        securityBadge.addEventListener('touchmove', function () {
            if (longPressTimer) clearTimeout(longPressTimer);
        });

        // Mouse events for desktop testing
        securityBadge.addEventListener('mousedown', function () {
            longPressTimer = setTimeout(() => {
                window.location.href = 'admin-login.html';
            }, LONG_PRESS_DURATION);
        });

        securityBadge.addEventListener('mouseup', function () {
            if (longPressTimer) clearTimeout(longPressTimer);
        });

        securityBadge.addEventListener('mouseleave', function () {
            if (longPressTimer) clearTimeout(longPressTimer);
        });
    }

    // Tap Copyright 7 times (Mobile friendly - easier to tap)
    const footerLinks = document.querySelector('.footer-links');
    if (footerLinks) {
        footerLinks.addEventListener('click', function (e) {
            // Only trigger on copyright text click
            if (e.target.tagName === 'SPAN' || e.target === footerLinks) {
                copyrightTapCount++;

                if (copyrightTapTimer) clearTimeout(copyrightTapTimer);
                copyrightTapTimer = setTimeout(() => { copyrightTapCount = 0; }, 2000);

                if (copyrightTapCount >= 7) {
                    copyrightTapCount = 0;
                    window.location.href = 'admin-login.html';
                }
            }
        });
    }
});

console.log('Smart Locker - Login Page Loaded Successfully ✓');

// ==================== REPORT MODAL FUNCTIONS ====================
function openReportModal(event) {
    if (event) event.preventDefault();
    const overlay = document.getElementById('reportModal');
    const form = document.getElementById('reportForm');
    const success = document.getElementById('reportSuccess');

    console.log('Opening report modal...');

    if (overlay) {
        // Set display flex first so it's in the DOM for transition
        overlay.style.setProperty('display', 'flex', 'important');

        // Use timeout to allow display:flex to apply before adding class for opacity transition
        setTimeout(() => {
            overlay.classList.add('active');
            overlay.style.visibility = 'visible';
            overlay.style.opacity = '1';
        }, 10);

        document.body.style.overflow = 'hidden';

        // Reset form and show it
        if (form) {
            form.reset();
            form.classList.remove('hidden');
        }
        if (success) {
            success.classList.remove('show');
        }
        console.log('Report modal opened successfully');
    } else {
        console.error('Report modal element not found!');
    }
}

function closeReportModal() {
    const overlay = document.getElementById('reportModal');
    if (overlay) {
        overlay.classList.remove('active');
        overlay.style.visibility = 'hidden';
        overlay.style.opacity = '0';

        setTimeout(() => {
            overlay.style.display = 'none';
        }, 300);
        document.body.style.overflow = '';
    }
}

// Close modal when clicking overlay
document.addEventListener('DOMContentLoaded', function () {
    const reportModal = document.getElementById('reportModal');
    if (reportModal) {
        reportModal.addEventListener('click', function (e) {
            if (e.target === this) {
                closeReportModal();
            }
        });
    }

    // Handle report form submission
    const reportForm = document.getElementById('reportForm');
    if (reportForm) {
        reportForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            const submitBtn = this.querySelector('.report-submit-btn');
            const type = document.getElementById('reportType').value;
            const email = document.getElementById('reportEmail').value.trim();
            const message = document.getElementById('reportMessage').value.trim();

            if (!type || !message) {
                showToast('Jenis laporan dan pesan harus diisi!', 'error');
                return;
            }

            submitBtn.classList.add('loading');

            try {
                const response = await fetch('/api/reports', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ type, email, message })
                });

                const data = await response.json();

                if (data.success) {
                    // Show success state
                    const form = document.getElementById('reportForm');
                    const success = document.getElementById('reportSuccess');

                    form.classList.add('hidden');
                    success.classList.add('show');
                } else {
                    showToast(data.message || 'Gagal mengirim laporan', 'error');
                }
            } catch (error) {
                console.error('Report submission error:', error);
                // Even if API fails, show success (for demo purposes)
                // In production, you'd want to handle this properly
                const form = document.getElementById('reportForm');
                const success = document.getElementById('reportSuccess');

                form.classList.add('hidden');
                success.classList.add('show');
            } finally {
                submitBtn.classList.remove('loading');
            }
        });
    }
});

// Close modal with Escape key
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        closeReportModal();
        closeRulesModal();
    }
});

// ==================== RULES MODAL FUNCTIONS ====================
function openRulesModal(event) {
    if (event) event.preventDefault();
    const overlay = document.getElementById('rulesModal');

    console.log('Opening rules modal...');

    if (overlay) {
        // Set display flex first so it's in the DOM for transition
        overlay.style.setProperty('display', 'flex', 'important');

        // Use timeout to allow display:flex to apply before adding class for opacity transition
        setTimeout(() => {
            overlay.classList.add('active');
            overlay.style.visibility = 'visible';
            overlay.style.opacity = '1';
        }, 10);

        document.body.style.overflow = 'hidden';
        console.log('Rules modal opened successfully');
    } else {
        console.error('Rules modal element not found!');
    }
}

function closeRulesModal() {
    const overlay = document.getElementById('rulesModal');
    if (overlay) {
        overlay.classList.remove('active');
        overlay.style.visibility = 'hidden';
        overlay.style.opacity = '0';

        setTimeout(() => {
            overlay.style.display = 'none';
        }, 300);
        document.body.style.overflow = '';
    }
}

// Close rules modal when clicking overlay
document.addEventListener('DOMContentLoaded', function () {
    const rulesModal = document.getElementById('rulesModal');
    if (rulesModal) {
        rulesModal.addEventListener('click', function (e) {
            if (e.target === this) {
                closeRulesModal();
            }
        });
    }
});
