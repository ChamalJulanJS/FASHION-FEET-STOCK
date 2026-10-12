/**
 * ==========================================================================
 * FASHIONFEET PRO MULTI-BRANCH STOCK TRANSFER HUB — APPLICATION ENGINE
 * Ultra-Fast In-Memory Catalog, Instant Barcode Scanning, Mobile Camera Scanner,
 * 8-Staff Account Authentication (Login/Signup/Reset), PWA Mobile Support.
 * ==========================================================================
 */

// Supabase Configuration
const SUPABASE_BASE = "https://qrzpsvyqiozhygtoklhv.supabase.co";
const SUPABASE_URL = `${SUPABASE_BASE}/rest/v1`;
const SUPABASE_AUTH = `${SUPABASE_BASE}/auth/v1`;
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyenBzdnlxaW96aHlndG9rbGh2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDQ1MTY4MSwiZXhwIjoyMDkwMDI3NjgxfQ.UNxy_PaglB-lVmOP6Ngl1jtVrkQNJ2My5-JL_VV-Agk";

const HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0"
};

// System State
let state = {
    currentUser: null,        // Logged-in staff member profile
    allStaff: [],             // All registered store staff accounts (8 members)
    locations: [],
    catalog: [],              // Full in-memory catalog of all ~1,319 shoe variants
    productsMap: new Map(),   // Map: product_id -> [variants]
    stockMap: new Map(),      // Key: `${variant_id}_${location_id}` -> quantity
    searchResults: [],
    stagedItem: null,
    cart: [],                 // [ { variant, qty, availableStock } ]
    autoScanMode: true,       // When true, barcode scan auto-adds +1 directly to batch
    soundEnabled: true,
    theme: 'dark',
    isSyncing: false,
    lastTransferDetails: null,// Data of last successful transfer for reprinting
    html5QrScanner: null,     // Mobile phone camera scanner instance
    cameraTorchActive: false,
    deferredPwaPrompt: null   // PWA install prompt event
};

// DOM Elements Cache
const el = {
    dbStatusDot: document.getElementById('dbStatusDot'),
    dbStatusText: document.getElementById('dbStatusText'),
    userProfileWidget: document.getElementById('userProfileWidget'),
    userMenuBtn: document.getElementById('userMenuBtn'),
    userDisplayName: document.getElementById('userDisplayName'),
    userRoleBadge: document.getElementById('userRoleBadge'),
    profileDropdown: document.getElementById('profileDropdown'),
    dropdownFullName: document.getElementById('dropdownFullName'),
    dropdownEmail: document.getElementById('dropdownEmail'),
    openStaffManagerBtn: document.getElementById('openStaffManagerBtn'),
    openResetPasswordBtn: document.getElementById('openResetPasswordBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    installPwaBtn: document.getElementById('installPwaBtn'),
    autoScanToggleBtn: document.getElementById('autoScanToggleBtn'),
    manualSyncBtn: document.getElementById('manualSyncBtn'),
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    audioToggleBtn: document.getElementById('audioToggleBtn'),
    fromBranch: document.getElementById('fromBranch'),
    toBranch: document.getElementById('toBranch'),
    swapBranchesBtn: document.getElementById('swapBranchesBtn'),
    routeSummaryFrom: document.getElementById('routeSummaryFrom'),
    routeSummaryTo: document.getElementById('routeSummaryTo'),
    fromBranchTotalStock: document.getElementById('fromBranchTotalStock'),
    toBranchTotalStock: document.getElementById('toBranchTotalStock'),
    barcodeInput: document.getElementById('barcodeInput'),
    clearSearchBtn: document.getElementById('clearSearchBtn'),
    scanModeLabel: document.getElementById('scanModeLabel'),
    openCameraScannerBtn: document.getElementById('openCameraScannerBtn'),
    searchResultsContainer: document.getElementById('searchResultsContainer'),
    resultsList: document.getElementById('resultsList'),
    resultsCountTag: document.getElementById('resultsCountTag'),
    stagedItemCard: document.getElementById('stagedItemCard'),
    closeStagedCardBtn: document.getElementById('closeStagedCardBtn'),
    stagedSku: document.getElementById('stagedSku'),
    stagedName: document.getElementById('stagedName'),
    stagedBrand: document.getElementById('stagedBrand'),
    stagedCategory: document.getElementById('stagedCategory'),
    stagedPrice: document.getElementById('stagedPrice'),
    pillFromName: document.getElementById('pillFromName'),
    pillFromQty: document.getElementById('pillFromQty'),
    pillToName: document.getElementById('pillToName'),
    pillToQty: document.getElementById('pillToQty'),
    pillOtherName: document.getElementById('pillOtherName'),
    pillOtherQty: document.getElementById('pillOtherQty'),
    sizeMatrixContainer: document.getElementById('sizeMatrixContainer'),
    sizeMatrixGrid: document.getElementById('sizeMatrixGrid'),
    transferQty: document.getElementById('transferQty'),
    qtyMinusBtn: document.getElementById('qtyMinusBtn'),
    qtyPlusBtn: document.getElementById('qtyPlusBtn'),
    maxStockBtn: document.getElementById('maxStockBtn'),
    addToCartBtn: document.getElementById('addToCartBtn'),
    cartCountBadge: document.getElementById('cartCountBadge'),
    totalPairsBadge: document.getElementById('totalPairsBadge'),
    cartEmptyState: document.getElementById('cartEmptyState'),
    cartTableWrapper: document.getElementById('cartTableWrapper'),
    cartTableBody: document.getElementById('cartTableBody'),
    totalUniqueStyles: document.getElementById('totalUniqueStyles'),
    totalPairsToTransfer: document.getElementById('totalPairsToTransfer'),
    totalBatchValue: document.getElementById('totalBatchValue'),
    transferNotes: document.getElementById('transferNotes'),
    clearCartBtn: document.getElementById('clearCartBtn'),
    confirmTransferBtn: document.getElementById('confirmTransferBtn'),
    refreshHistoryBtn: document.getElementById('refreshHistoryBtn'),
    historyTableBody: document.getElementById('historyTableBody'),
    // Camera Modal
    cameraScannerModal: document.getElementById('cameraScannerModal'),
    closeCameraScannerBtn: document.getElementById('closeCameraScannerBtn'),
    switchCameraTorchBtn: document.getElementById('switchCameraTorchBtn'),
    // Auth Modal
    authModal: document.getElementById('authModal'),
    closeAuthModalBtn: document.getElementById('closeAuthModalBtn'),
    tabLoginBtn: document.getElementById('tabLoginBtn'),
    tabSignUpBtn: document.getElementById('tabSignUpBtn'),
    tabResetBtn: document.getElementById('tabResetBtn'),
    loginForm: document.getElementById('loginForm'),
    signUpForm: document.getElementById('signUpForm'),
    resetPasswordForm: document.getElementById('resetPasswordForm'),
    loginEmail: document.getElementById('loginEmail'),
    loginPassword: document.getElementById('loginPassword'),
    quickStaffChips: document.getElementById('quickStaffChips'),
    signupFullName: document.getElementById('signupFullName'),
    signupEmail: document.getElementById('signupEmail'),
    signupRole: document.getElementById('signupRole'),
    signupBranch: document.getElementById('signupBranch'),
    signupPassword: document.getElementById('signupPassword'),
    resetEmail: document.getElementById('resetEmail'),
    resetNewPassword: document.getElementById('resetNewPassword'),
    resetConfirmPassword: document.getElementById('resetConfirmPassword'),
    // Staff Manager Modal
    staffManagerModal: document.getElementById('staffManagerModal'),
    closeStaffManagerBtn: document.getElementById('closeStaffManagerBtn'),
    addNewStaffShortcutBtn: document.getElementById('addNewStaffShortcutBtn'),
    staffDirectoryTableBody: document.getElementById('staffDirectoryTableBody'),
    // Success Modal
    successModal: document.getElementById('successModal'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    printThermalBtn: document.getElementById('printThermalBtn'),
    noteTransferId: document.getElementById('noteTransferId'),
    noteDate: document.getElementById('noteDate'),
    noteStatusType: document.getElementById('noteStatusType'),
    noteFrom: document.getElementById('noteFrom'),
    noteTo: document.getElementById('noteTo'),
    noteDriverRow: document.getElementById('noteDriverRow'),
    noteDriverText: document.getElementById('noteDriverText'),
    noteItemsTableBody: document.getElementById('noteItemsTableBody'),
    noteTotalStyles: document.getElementById('noteTotalStyles'),
    noteTotalPairs: document.getElementById('noteTotalPairs'),
    noteDispatchedBy: document.getElementById('noteDispatchedBy'),
    toastContainer: document.getElementById('toastContainer'),
    // Mobile Controls & Navigation
    mobileSettingsToggleBtn: document.getElementById('mobileSettingsToggleBtn'),
    mobileSettingsDrawer: document.getElementById('mobileSettingsDrawer'),
    mobAutoScanBtn: document.getElementById('mobAutoScanBtn'),
    mobAutoScanStatus: document.getElementById('mobAutoScanStatus'),
    mobSyncBtn: document.getElementById('mobSyncBtn'),
    mobThemeBtn: document.getElementById('mobThemeBtn'),
    mobAudioBtn: document.getElementById('mobAudioBtn'),
    mobStatusDot: document.getElementById('mobStatusDot'),
    mobStatusText: document.getElementById('mobStatusText'),
    mobileFloatingCartBar: document.getElementById('mobileFloatingCartBar'),
    mobFloatBadge: document.getElementById('mobFloatBadge'),
    mobFloatViewBtn: document.getElementById('mobFloatViewBtn'),
    mobileBottomNav: document.getElementById('mobileBottomNav'),
    mobNavTransferBtn: document.getElementById('mobNavTransferBtn'),
    mobNavCartBtn: document.getElementById('mobNavCartBtn'),
    mobNavHistoryBtn: document.getElementById('mobNavHistoryBtn'),
    mobNavStaffBtn: document.getElementById('mobNavStaffBtn'),
    mobBottomCartCount: document.getElementById('mobBottomCartCount')
};

/**
 * ==========================================================================
 * 1. Web Audio API Acoustic Sound Effects
 * ==========================================================================
 */
class SoundFx {
    static playScanBeep() {
        if (!state.soundEnabled) return;
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1400, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1900, ctx.currentTime + 0.08);
            gain.gain.setValueAtTime(0.18, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.08);
        } catch (e) {}
    }

    static playSuccessChime() {
        if (!state.soundEnabled) return;
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const chord = [523.25, 659.25, 783.99, 1046.50, 1318.51];
            chord.forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.07);
                gain.gain.setValueAtTime(0.16, ctx.currentTime + idx * 0.07);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.07 + 0.45);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + idx * 0.07);
                osc.stop(ctx.currentTime + idx * 0.07 + 0.45);
            });
        } catch (e) {}
    }

    static playWarningBuzz() {
        if (!state.soundEnabled) return;
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(160, ctx.currentTime);
            osc.frequency.setValueAtTime(130, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.22);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.22);
        } catch (e) {}
    }
}

/**
 * ==========================================================================
 * 2. Application Initialization & PWA Service Worker Registration
 * ==========================================================================
 */
async function initApp() {
    setupEventListeners();
    registerServiceWorker();

    updateConnectionStatus("loading", "Connecting to Supabase...");
    
    // 1. Fetch store locations & all 8 staff accounts FIRST
    await fetchLocations();
    await fetchStaffAccounts();

    // 2. Enforce immediate login screen gate if not authenticated
    restoreAuthSession();

    // 3. Sync full catalog and stock levels
    await syncCatalogAndStock();
    await fetchRecentTransfers();

    focusScanner();
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').then(reg => {
            console.log('PWA ServiceWorker registered with scope:', reg.scope);
        }).catch(err => {
            console.warn('ServiceWorker registration error:', err);
        });
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        state.deferredPwaPrompt = e;
        if (el.installPwaBtn) el.installPwaBtn.style.display = 'inline-flex';
    });
}

function focusScanner() {
    setTimeout(() => {
        if (el.barcodeInput && state.currentUser) el.barcodeInput.focus();
    }, 250);
}

function updateConnectionStatus(status, text) {
    if (el.dbStatusText) el.dbStatusText.textContent = text;
    if (el.mobStatusText) el.mobStatusText.textContent = text;
    if (el.dbStatusDot) {
        el.dbStatusDot.className = 'pulse-dot';
        if (status === 'connected') el.dbStatusDot.classList.add('active');
        else if (status === 'loading') el.dbStatusDot.classList.add('loading');
    }
    if (el.mobStatusDot) {
        el.mobStatusDot.className = 'pulse-dot';
        if (status === 'connected') el.mobStatusDot.classList.add('active');
        else if (status === 'loading') el.mobStatusDot.classList.add('loading');
    }
}

/**
 * ==========================================================================
 * 3. User Authentication & 8-Staff Management System
 * ==========================================================================
 */
function restoreAuthSession() {
    try {
        const saved = localStorage.getItem('ff_transfer_user') || sessionStorage.getItem('ff_transfer_user') || localStorage.getItem('ff_pos_user') || sessionStorage.getItem('ff_pos_user');
        if (saved) {
            const parsed = JSON.parse(saved);
            // Verify it has an actual valid email and is not a mock auto-default
            if (parsed && parsed.email && !parsed.email.includes('_autodefault')) {
                state.currentUser = parsed;
                updateUserDisplay();
                if (el.authModal) el.authModal.style.display = 'none';
                return;
            }
        }
    } catch (e) {
        console.warn("Session restore error:", e);
    }

    // No valid session -> Mandatory Login Screen Gate on App Load
    state.currentUser = null;
    localStorage.removeItem('ff_transfer_user');
    sessionStorage.removeItem('ff_transfer_user');
    localStorage.removeItem('ff_pos_user');
    sessionStorage.removeItem('ff_pos_user');
    updateUserDisplay();
    showLoginScreen(true);
}

function showLoginScreen(isMandatory = false) {
    if (!el.authModal) return;
    switchAuthTab('login');

    if (isMandatory) {
        if (el.closeAuthModalBtn) el.closeAuthModalBtn.style.display = 'none';
    } else {
        if (el.closeAuthModalBtn) el.closeAuthModalBtn.style.display = 'block';
    }

    el.authModal.style.display = 'flex';

    setTimeout(() => {
        if (el.loginEmail && el.loginEmail.value) {
            if (el.loginPassword) el.loginPassword.focus();
        } else if (el.loginEmail) {
            el.loginEmail.focus();
        }
    }, 150);
}

function updateUserDisplay() {
    if (state.currentUser) {
        el.userDisplayName.textContent = state.currentUser.name || state.currentUser.email.split('@')[0];
        const roleLabel = (state.currentUser.role || 'Staff').toUpperCase();
        const branchName = state.locations.find(l => l.id === state.currentUser.location_id)?.name || '';
        el.userRoleBadge.textContent = branchName ? `${roleLabel} • ${branchName}` : roleLabel;
        el.dropdownFullName.textContent = state.currentUser.name || 'Staff Member';
        el.dropdownEmail.textContent = state.currentUser.email || '';
    } else {
        el.userDisplayName.textContent = "Sign In Required";
        el.userRoleBadge.textContent = "Click to Sign In";
        el.dropdownFullName.textContent = "Not Signed In";
        el.dropdownEmail.textContent = "Please log in to continue";
    }
}

/**
 * Fetch all registered store staff members (8 accounts) from Supabase profiles
 */
async function fetchStaffAccounts() {
    try {
        const res = await fetch(`${SUPABASE_URL}/profiles?select=*&order=name.asc`, { headers: HEADERS });
        if (!res.ok) throw new Error("Staff fetch failed");

        state.allStaff = await res.json() || [];
        renderQuickStaffChips();
        renderStaffDirectory();
    } catch (err) {
        console.warn("Staff accounts fetch error:", err);
    }
}

function renderQuickStaffChips() {
    if (!el.quickStaffChips) return;
    if (!state.allStaff || state.allStaff.length === 0) {
        el.quickStaffChips.innerHTML = `<small style="color:var(--text-muted); font-size: 0.72rem;">Loading staff accounts...</small>`;
        return;
    }

    el.quickStaffChips.innerHTML = state.allStaff.map(s => {
        const isSelected = el.loginEmail && el.loginEmail.value && el.loginEmail.value.toLowerCase() === s.email.toLowerCase();
        const roleLabel = (s.role || 'staff').toUpperCase();
        const displayName = s.name || s.email.split('@')[0];
        return `
            <button type="button" class="staff-chip-btn ${isSelected ? 'selected' : ''}" onclick="selectQuickStaff('${s.email}')" title="${s.email} (${roleLabel})">
                <span class="chip-icon">👤</span>
                <span class="chip-name">${displayName}</span>
                <span class="chip-badge">${roleLabel}</span>
            </button>
        `;
    }).join('');
}

window.selectQuickStaff = function(email) {
    if (el.loginEmail) {
        el.loginEmail.value = email;
        if (el.loginPassword) {
            el.loginPassword.value = '';
            el.loginPassword.focus();
        }
    }
    renderQuickStaffChips();
};

function renderStaffDirectory() {
    if (!el.staffDirectoryTableBody) return;
    if (state.allStaff.length === 0) {
        el.staffDirectoryTableBody.innerHTML = `<tr><td colspan="5" class="loading-td">No staff profiles found.</td></tr>`;
        return;
    }

    el.staffDirectoryTableBody.innerHTML = state.allStaff.map(s => {
        const branch = state.locations.find(l => l.id === s.location_id)?.name || 'All Branches';
        const roleStr = (s.role || 'staff').toUpperCase();
        return `
            <tr>
                <td><strong>${s.name || s.email.split('@')[0]}</strong></td>
                <td><span style="font-family: var(--font-mono); color: var(--accent-primary);">${s.email}</span></td>
                <td><span class="size-pill">${roleStr}</span></td>
                <td>${branch}</td>
                <td style="text-align: right;">
                    <button class="btn btn-sm btn-secondary" onclick="openStaffPasswordReset('${s.email}')">
                        🔑 Reset Password
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

window.openStaffPasswordReset = function(email) {
    el.staffManagerModal.style.display = 'none';
    switchAuthTab('reset');
    el.resetEmail.value = email;
    el.authModal.style.display = 'flex';
    el.resetNewPassword.focus();
};

/**
 * Handle Staff Login
 */
async function handleLogin(email, password) {
    showToast("Signing in...", "info");
    try {
        // Find staff profile
        const cleanEmail = email.trim().toLowerCase();
        let matchedProfile = state.allStaff.find(s => s.email && s.email.toLowerCase() === cleanEmail);

        // Authenticate with Supabase Auth endpoint
        const res = await fetch(`${SUPABASE_AUTH}/token?grant_type=password`, {
            method: "POST",
            headers: {
                "apikey": SUPABASE_KEY,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ email: cleanEmail, password: password })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error_description || err.message || "Invalid email or password");
        }

        const authData = await res.json();
        const userId = authData.user?.id;

        if (!matchedProfile && userId) {
            matchedProfile = state.allStaff.find(s => s.id === userId);
        }

        state.currentUser = {
            id: userId || matchedProfile?.id,
            name: matchedProfile?.name || authData.user?.user_metadata?.name || cleanEmail.split('@')[0],
            email: cleanEmail,
            role: matchedProfile?.role || 'staff',
            location_id: matchedProfile?.location_id || null
        };

        const rememberMe = document.getElementById('loginRememberMe')?.checked;
        if (rememberMe) {
            localStorage.setItem('ff_transfer_user', JSON.stringify(state.currentUser));
            sessionStorage.removeItem('ff_transfer_user');
        } else {
            sessionStorage.setItem('ff_transfer_user', JSON.stringify(state.currentUser));
            localStorage.removeItem('ff_transfer_user');
        }

        updateUserDisplay();
        SoundFx.playSuccessChime();
        el.authModal.style.display = 'none';
        showToast(`Welcome back, ${state.currentUser.name}!`, "success");

        // Set default dispatch branch to user's assigned branch if available
        if (state.currentUser.location_id && el.fromBranch) {
            el.fromBranch.value = state.currentUser.location_id;
            updateRouteHeader();
        }

        focusScanner();

    } catch (err) {
        console.error("Login failed:", err);
        showToast(err.message, "error");
        SoundFx.playWarningBuzz();
    }
}

/**
 * Handle Sign Up / Create New Staff Member (among the 8 store staff)
 */
async function handleSignUp(fullName, email, password, role, branchId) {
    showToast("Creating staff account in Supabase...", "info");
    try {
        const cleanEmail = email.trim().toLowerCase();

        // 1. Create confirmed user account in Supabase Auth via Admin API
        const createRes = await fetch(`${SUPABASE_AUTH}/admin/users`, {
            method: "POST",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: cleanEmail,
                password: password,
                email_confirm: true,
                user_metadata: { name: fullName, role: role, location_id: branchId }
            })
        });

        if (!createRes.ok) {
            const err = await createRes.json();
            throw new Error(err.message || "Failed to create user in auth system");
        }

        const newUser = await createRes.json();
        const newUserId = newUser.id;

        // 2. Insert or update profile row in `profiles` table
        const profilePayload = {
            id: newUserId,
            name: fullName,
            email: cleanEmail,
            role: role,
            location_id: branchId || null,
            is_active: true
        };

        await fetch(`${SUPABASE_URL}/profiles`, {
            method: "POST",
            headers: HEADERS,
            body: JSON.stringify(profilePayload)
        });

        await fetchStaffAccounts();
        SoundFx.playSuccessChime();
        showToast(`Staff account for ${fullName} created successfully!`, "success");

        // Automatically switch to login tab with the new email
        switchAuthTab('login');
        el.loginEmail.value = cleanEmail;
        el.loginPassword.value = password;

    } catch (err) {
        console.error("Sign up failed:", err);
        showToast("Error creating staff: " + err.message, "error");
        SoundFx.playWarningBuzz();
    }
}

/**
 * Handle Instant Password Reset
 */
async function handleResetPassword(email, newPassword) {
    showToast("Updating password in Supabase...", "info");
    try {
        const cleanEmail = email.trim().toLowerCase();

        // Find user by email in auth admin users list
        const listRes = await fetch(`${SUPABASE_AUTH}/admin/users`, {
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`
            }
        });
        const listData = await listRes.json();
        const users = listData.users || [];
        const user = users.find(u => u.email && u.email.toLowerCase() === cleanEmail);

        if (!user) {
            throw new Error(`Staff member with email "${cleanEmail}" not found in database.`);
        }

        // Update user password instantly via Admin API
        const updateRes = await fetch(`${SUPABASE_AUTH}/admin/users/${user.id}`, {
            method: "PUT",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ password: newPassword })
        });

        if (!updateRes.ok) {
            const err = await updateRes.json();
            throw new Error(err.message || "Failed to update password");
        }

        SoundFx.playSuccessChime();
        showToast(`Password for ${cleanEmail} updated successfully!`, "success");

        // Return to login
        switchAuthTab('login');
        el.loginEmail.value = cleanEmail;
        el.loginPassword.value = newPassword;

    } catch (err) {
        console.error("Reset password failed:", err);
        showToast(err.message, "error");
        SoundFx.playWarningBuzz();
    }
}

function switchAuthTab(tab) {
    el.tabLoginBtn.classList.remove('active');
    el.tabSignUpBtn.classList.remove('active');
    el.tabResetBtn.classList.remove('active');

    el.loginForm.style.display = 'none';
    el.signUpForm.style.display = 'none';
    el.resetPasswordForm.style.display = 'none';

    if (tab === 'login') {
        el.tabLoginBtn.classList.add('active');
        el.loginForm.style.display = 'flex';
    } else if (tab === 'signup') {
        el.tabSignUpBtn.classList.add('active');
        el.signUpForm.style.display = 'flex';
    } else if (tab === 'reset') {
        el.tabResetBtn.classList.add('active');
        el.resetPasswordForm.style.display = 'flex';
    }
}

/**
 * ==========================================================================
 * 4. Mobile Camera Barcode Scanner (Android & iOS Phone Camera)
 * ==========================================================================
 */
async function startMobileCameraScanner() {
    if (!window.Html5Qrcode) {
        showToast("Camera scanner library loading... please wait 2 seconds.", "warning");
        return;
    }

    el.cameraScannerModal.style.display = 'flex';

    try {
        if (!state.html5QrScanner) {
            state.html5QrScanner = new Html5Qrcode("cameraScannerPreview");
        }

        const config = {
            fps: 15,
            qrbox: { width: 250, height: 180 },
            aspectRatio: 1.0
        };

        await state.html5QrScanner.start(
            { facingMode: "environment" }, // Prefer back camera on mobile phones
            config,
            (decodedText) => {
                // Barcode successfully scanned!
                handleCameraScanResult(decodedText);
            },
            () => {} // ignore frame errors
        );

    } catch (err) {
        console.error("Camera start failed:", err);
        showToast("Camera access error: " + (err.message || "Permission denied"), "error");
        el.cameraScannerModal.style.display = 'none';
    }
}

function stopMobileCameraScanner() {
    if (state.html5QrScanner && state.html5QrScanner.isScanning) {
        state.html5QrScanner.stop().then(() => {
            el.cameraScannerModal.style.display = 'none';
        }).catch(() => {
            el.cameraScannerModal.style.display = 'none';
        });
    } else {
        el.cameraScannerModal.style.display = 'none';
    }
}

function handleCameraScanResult(barcodeText) {
    if (!barcodeText || barcodeText.trim().length === 0) return;

    // Vibrate device if mobile vibration API is supported
    if ('vibrate' in navigator) {
        try { navigator.vibrate([100]); } catch (e) {}
    }

    SoundFx.playScanBeep();
    handleBarcodeScanInput(barcodeText.trim());

    // Show feedback banner
    showToast(`Scanned: ${barcodeText}`, "success");
}

/**
 * ==========================================================================
 * 5. Branch Location & Catalog Synchronization
 * ==========================================================================
 */
async function fetchLocations() {
    try {
        const res = await fetch(`${SUPABASE_URL}/locations?select=*&order=name.asc`, { headers: HEADERS });
        if (!res.ok) throw new Error("Branch fetch failed");

        state.locations = await res.json() || [];

        el.fromBranch.innerHTML = '';
        el.toBranch.innerHTML = '';

        state.locations.forEach(loc => {
            const isWarehouse = loc.name.toLowerCase().includes('head office') || (loc.type && loc.type.toLowerCase().includes('warehouse'));
            const typeLabel = isWarehouse ? 'Central Warehouse' : 'Retail Showroom';
            const label = `${loc.name} • ${typeLabel}`;
            el.fromBranch.add(new Option(label, loc.id));
            el.toBranch.add(new Option(label, loc.id));
        });

        // Set intelligent defaults:
        // FROM: Shoe Gallery (b9730905-c070-4ee8-960e-74d2fef1592b)
        // TO: Head Office (0bd6ffaf-247b-422f-a379-c0d196d1aa7e) or FF Branch
        const shoeGallery = state.locations.find(l => l.name.toLowerCase().includes('shoe gallery'));
        const headOffice = state.locations.find(l => l.name.toLowerCase().includes('head office'));
        const ffBranch = state.locations.find(l => l.name.toLowerCase().includes('ff branch'));

        if (shoeGallery) el.fromBranch.value = shoeGallery.id;
        else if (state.locations[0]) el.fromBranch.value = state.locations[0].id;

        if (headOffice && headOffice.id !== el.fromBranch.value) el.toBranch.value = headOffice.id;
        else if (ffBranch && ffBranch.id !== el.fromBranch.value) el.toBranch.value = ffBranch.id;
        else if (state.locations[1]) el.toBranch.value = state.locations[1].id;

        renderCustomDropdownMenus();
        updateRouteHeader();
    } catch (err) {
        console.error("Fetch locations error:", err);
        showToast("Error loading store locations from database.", "error");
    }
}

async function syncCatalogAndStock() {
    if (state.isSyncing) return;
    state.isSyncing = true;
    updateConnectionStatus("loading", "Syncing Catalog & Stock...");

    try {
        // 1. Fetch full product variants catalog with products join
        const catRes = await fetch(
            `${SUPABASE_URL}/product_variants?select=id,product_id,sku,barcode,size,colour,selling_price,cost_price,products(id,name,brand,category)&limit=3000`,
            { headers: HEADERS }
        );
        if (!catRes.ok) throw new Error("Catalog fetch failed");
        state.catalog = await catRes.json() || [];

        // Build product groups map (grouped by product_id for size matrix)
        state.productsMap.clear();
        state.catalog.forEach(v => {
            const pId = v.product_id || (v.products && v.products.id) || 'unknown';
            if (!state.productsMap.has(pId)) {
                state.productsMap.set(pId, []);
            }
            state.productsMap.get(pId).push(v);
        });

        // 2. Fetch all stock levels
        const stockRes = await fetch(
            `${SUPABASE_URL}/stock_levels?select=variant_id,location_id,quantity&limit=5000`,
            { headers: HEADERS }
        );
        if (!stockRes.ok) throw new Error("Stock levels fetch failed");
        const stocks = await stockRes.json() || [];

        state.stockMap.clear();
        stocks.forEach(s => {
            state.stockMap.set(`${s.variant_id}_${s.location_id}`, Number(s.quantity) || 0);
        });

        updateBranchStockTotals();
        renderCustomDropdownMenus();
        updateConnectionStatus("connected", `Connected • ${state.catalog.length} Styles Synced`);
        showToast(`Catalog Synced! ${state.catalog.length} shoe variants loaded.`, "success");

        if (state.stagedItem) {
            renderStagedItemStock(state.stagedItem);
        }

    } catch (err) {
        console.error("Sync error:", err);
        updateConnectionStatus("error", "Sync Error • Check Connection");
        showToast("Failed to sync live catalog from Supabase.", "error");
    } finally {
        state.isSyncing = false;
    }
}

function getStock(variantId, locationId) {
    if (!variantId || !locationId) return 0;
    return state.stockMap.get(`${variantId}_${locationId}`) || 0;
}

function updateBranchStockTotals() {
    const fromId = el.fromBranch.value;
    const toId = el.toBranch.value;

    let fromTotal = 0;
    let toTotal = 0;

    state.catalog.forEach(v => {
        fromTotal += getStock(v.id, fromId);
        toTotal += getStock(v.id, toId);
    });

    if (el.fromBranchTotalStock) {
        el.fromBranchTotalStock.textContent = `Stock: ${fromTotal.toLocaleString()} prs`;
    }
    if (el.toBranchTotalStock) {
        el.toBranchTotalStock.textContent = `Stock: ${toTotal.toLocaleString()} prs`;
    }
}

function updateRouteHeader() {
    const fromLoc = state.locations.find(l => l.id === el.fromBranch.value);
    const toLoc = state.locations.find(l => l.id === el.toBranch.value);

    const fromName = fromLoc ? fromLoc.name : 'Source';
    const toName = toLoc ? toLoc.name : 'Destination';

    if (el.routeSummaryFrom) el.routeSummaryFrom.textContent = fromName;
    if (el.routeSummaryTo) el.routeSummaryTo.textContent = toName;

    // Update dynamic leading icons and branch helper tags
    const fromIsWh = fromLoc && (fromLoc.name.toLowerCase().includes('head office') || (fromLoc.type && fromLoc.type.toLowerCase().includes('warehouse')));
    const toIsWh = toLoc && (toLoc.name.toLowerCase().includes('head office') || (toLoc.type && toLoc.type.toLowerCase().includes('warehouse')));

    const fromLocIcon = document.getElementById('fromLocIcon');
    const toLocIcon = document.getElementById('toLocIcon');
    const fromBranchTitle = document.getElementById('fromBranchTitle');
    const fromBranchSubtitle = document.getElementById('fromBranchSubtitle');
    const toBranchTitle = document.getElementById('toBranchTitle');
    const toBranchSubtitle = document.getElementById('toBranchSubtitle');
    const fromBranchTag = document.getElementById('fromBranchTag');
    const toBranchTag = document.getElementById('toBranchTag');

    if (fromLocIcon) fromLocIcon.textContent = fromIsWh ? '🏭' : '🏬';
    if (toLocIcon) toLocIcon.textContent = toIsWh ? '🏭' : '🏬';
    if (fromBranchTitle) fromBranchTitle.textContent = fromLoc ? fromLoc.name : 'Select Branch';
    if (fromBranchSubtitle) fromBranchSubtitle.textContent = fromIsWh ? 'Central Distribution Hub' : 'Retail Showroom & Shop';
    if (toBranchTitle) toBranchTitle.textContent = toLoc ? toLoc.name : 'Select Destination';
    if (toBranchSubtitle) toBranchSubtitle.textContent = toIsWh ? 'Central Distribution Hub' : 'Retail Showroom & Shop';

    if (fromBranchTag) fromBranchTag.textContent = fromIsWh ? 'Central Distribution Warehouse' : 'Retail Showroom & Shop';
    if (toBranchTag) toBranchTag.textContent = toIsWh ? 'Central Distribution Warehouse' : 'Retail Showroom & Shop';

    updateBranchStockTotals();
    renderCustomDropdownMenus();
    if (state.stagedItem) renderStagedItemStock(state.stagedItem);
}

/**
 * Render items in the custom luxury dropdown menus
 */
function renderCustomDropdownMenus() {
    const fromList = document.getElementById('fromDropdownList');
    const toList = document.getElementById('toDropdownList');
    if (!fromList || !toList) return;

    const fromVal = el.fromBranch ? el.fromBranch.value : '';
    const toVal = el.toBranch ? el.toBranch.value : '';

    const buildItemsHtml = (type, currentVal) => {
        return state.locations.map(loc => {
            const isWarehouse = loc.name.toLowerCase().includes('head office') || (loc.type && loc.type.toLowerCase().includes('warehouse'));
            const icon = isWarehouse ? '🏭' : '🏬';
            const typeLabel = isWarehouse ? 'Central Warehouse Hub' : 'Retail Showroom & Shop';
            const isSelected = loc.id === currentVal;
            
            // Calculate live stock for this branch
            let locStock = 0;
            state.catalog.forEach(v => {
                locStock += getStock(v.id, loc.id);
            });
            const stockStr = locStock > 0 ? `${locStock.toLocaleString()} prs available` : '0 prs in stock';

            return `
                <div class="dropdown-option ${isSelected ? 'selected' : ''}" onclick="selectCustomBranch('${type}', '${loc.id}')">
                    <div class="opt-left">
                        <div class="opt-icon-badge">${icon}</div>
                        <div class="opt-meta">
                            <div class="opt-name">${loc.name}</div>
                            <div class="opt-sub">${typeLabel} • ${stockStr}</div>
                        </div>
                    </div>
                    ${isSelected ? '<span class="opt-check">✓</span>' : ''}
                </div>
            `;
        }).join('');
    };

    fromList.innerHTML = buildItemsHtml('from', fromVal);
    toList.innerHTML = buildItemsHtml('to', toVal);
}

window.selectCustomBranch = function(type, locId) {
    if (type === 'from') {
        if (el.fromBranch) el.fromBranch.value = locId;
        if (el.toBranch && el.toBranch.value === locId) {
            const other = state.locations.find(l => l.id !== locId);
            if (other) el.toBranch.value = other.id;
        }
        closeCustomDropdowns();
    } else if (type === 'to') {
        if (el.toBranch) el.toBranch.value = locId;
        if (el.fromBranch && el.fromBranch.value === locId) {
            const other = state.locations.find(l => l.id !== locId);
            if (other) el.fromBranch.value = other.id;
        }
        closeCustomDropdowns();
    }
    SoundFx.playScanBeep();
    updateRouteHeader();
};

function toggleCustomDropdown(type) {
    const fromContainer = document.getElementById('fromDropdownContainer');
    const toContainer = document.getElementById('toDropdownContainer');
    const fromMenu = document.getElementById('fromDropdownMenu');
    const toMenu = document.getElementById('toDropdownMenu');
    const fromBtn = document.getElementById('fromDropdownBtn');
    const toBtn = document.getElementById('toDropdownBtn');

    if (type === 'from') {
        const isClosed = !fromMenu || fromMenu.style.display === 'none';
        if (toMenu) toMenu.style.display = 'none';
        if (toContainer) toContainer.classList.remove('open');
        if (toBtn) toBtn.setAttribute('aria-expanded', 'false');

        if (isClosed && fromMenu) {
            renderCustomDropdownMenus();
            fromMenu.style.display = 'block';
            if (fromContainer) fromContainer.classList.add('open');
            if (fromBtn) fromBtn.setAttribute('aria-expanded', 'true');
        } else if (fromMenu) {
            fromMenu.style.display = 'none';
            if (fromContainer) fromContainer.classList.remove('open');
            if (fromBtn) fromBtn.setAttribute('aria-expanded', 'false');
        }
    } else if (type === 'to') {
        const isClosed = !toMenu || toMenu.style.display === 'none';
        if (fromMenu) fromMenu.style.display = 'none';
        if (fromContainer) fromContainer.classList.remove('open');
        if (fromBtn) fromBtn.setAttribute('aria-expanded', 'false');

        if (isClosed && toMenu) {
            renderCustomDropdownMenus();
            toMenu.style.display = 'block';
            if (toContainer) toContainer.classList.add('open');
            if (toBtn) toBtn.setAttribute('aria-expanded', 'true');
        } else if (toMenu) {
            toMenu.style.display = 'none';
            if (toContainer) toContainer.classList.remove('open');
            if (toBtn) toBtn.setAttribute('aria-expanded', 'false');
        }
    }
}

function closeCustomDropdowns() {
    const fromContainer = document.getElementById('fromDropdownContainer');
    const toContainer = document.getElementById('toDropdownContainer');
    const fromMenu = document.getElementById('fromDropdownMenu');
    const toMenu = document.getElementById('toDropdownMenu');
    const fromBtn = document.getElementById('fromDropdownBtn');
    const toBtn = document.getElementById('toDropdownBtn');

    if (fromMenu) fromMenu.style.display = 'none';
    if (toMenu) toMenu.style.display = 'none';
    if (fromContainer) fromContainer.classList.remove('open');
    if (toContainer) toContainer.classList.remove('open');
    if (fromBtn) fromBtn.setAttribute('aria-expanded', 'false');
    if (toBtn) toBtn.setAttribute('aria-expanded', 'false');
}

/**
 * ==========================================================================
 * 6. Smart Search & Instant Barcode Scanner Engine
 * ==========================================================================
 */
function searchCatalog(query) {
    if (!query || query.trim().length < 2) {
        el.searchResultsContainer.style.display = 'none';
        state.searchResults = [];
        return;
    }

    const q = query.trim().toUpperCase();
    const fromLocId = el.fromBranch.value;

    const matches = state.catalog.filter(v => {
        const barcodeMatch = v.barcode && v.barcode.toUpperCase() === q;
        const skuMatch = v.sku && v.sku.toUpperCase().includes(q);
        const nameMatch = v.products?.name && v.products.name.toUpperCase().includes(q);
        const brandMatch = v.products?.brand && v.products.brand.toUpperCase().includes(q);
        const sizeMatch = v.size && v.size.toString().trim() === q;
        const catMatch = v.products?.category && v.products.category.toUpperCase().includes(q);

        return barcodeMatch || skuMatch || nameMatch || brandMatch || sizeMatch || catMatch;
    });

    matches.sort((a, b) => {
        const aExact = (a.barcode && a.barcode.toUpperCase() === q) || (a.sku && a.sku.toUpperCase() === q);
        const bExact = (b.barcode && b.barcode.toUpperCase() === q) || (b.sku && b.sku.toUpperCase() === q);
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;

        const aStock = getStock(a.id, fromLocId);
        const bStock = getStock(b.id, fromLocId);
        return bStock - aStock;
    });

    state.searchResults = matches.slice(0, 25);
    renderSearchResults(state.searchResults, q);
}

function renderSearchResults(variants, query) {
    if (!variants || variants.length === 0) {
        el.resultsList.innerHTML = `<li class="result-item" style="color: var(--text-muted); cursor: default; justify-content: center; padding: 1.5rem;">No shoe styles found matching "${query}"</li>`;
        el.resultsCountTag.textContent = "0 found";
        el.searchResultsContainer.style.display = 'block';
        return;
    }

    el.resultsCountTag.textContent = `${variants.length} found`;
    const fromLocId = el.fromBranch.value;

    el.resultsList.innerHTML = variants.map(v => {
        const stockAtFrom = getStock(v.id, fromLocId);
        const stockClass = stockAtFrom > 0 ? 'in-stock' : 'out-stock';
        const brandPrefix = v.products?.brand ? `${v.products.brand} — ` : '';
        const shoeName = `${brandPrefix}${v.products?.name || v.sku}`;

        return `
            <li class="result-item" onclick="handleSelectVariant('${v.id}')">
                <div class="res-main">
                    <span class="res-name">${shoeName}</span>
                    <div class="res-sub">
                        <span class="res-sku">${v.sku}</span>
                        <span class="res-size-pill">Size: ${v.size || 'N/A'}</span>
                        <span>${v.colour || '-'}</span>
                    </div>
                </div>
                <div class="res-stock-col">
                    <span class="res-stock-num ${stockClass}">
                        ${stockAtFrom > 0 ? stockAtFrom + ' prs' : '0 prs (Out)'}
                    </span>
                    <span class="res-price">Rs. ${(v.selling_price || 0).toLocaleString()}</span>
                </div>
            </li>
        `;
    }).join('');

    el.searchResultsContainer.style.display = 'block';
}

function handleBarcodeScanInput(query) {
    if (!query || query.trim().length === 0) return;
    const q = query.trim().toUpperCase();

    const exactMatch = state.catalog.find(v => 
        (v.barcode && v.barcode.toUpperCase() === q) || 
        (v.sku && v.sku.toUpperCase() === q)
    );

    if (exactMatch) {
        if (state.autoScanMode) {
            addItemDirectlyToCart(exactMatch, 1);
            SoundFx.playScanBeep();
            el.barcodeInput.value = '';
            el.clearSearchBtn.style.display = 'none';
            el.searchResultsContainer.style.display = 'none';
            return;
        } else {
            stageVariant(exactMatch);
            el.barcodeInput.value = '';
            el.clearSearchBtn.style.display = 'none';
            el.searchResultsContainer.style.display = 'none';
            return;
        }
    }

    if (state.searchResults.length === 1) {
        const item = state.searchResults[0];
        if (state.autoScanMode) {
            addItemDirectlyToCart(item, 1);
            SoundFx.playScanBeep();
        } else {
            stageVariant(item);
        }
        el.barcodeInput.value = '';
        el.clearSearchBtn.style.display = 'none';
        el.searchResultsContainer.style.display = 'none';
        return;
    }

    searchCatalog(query);
}

window.handleSelectVariant = function(variantId) {
    const v = state.catalog.find(it => it.id === variantId);
    if (!v) return;

    if (state.autoScanMode) {
        addItemDirectlyToCart(v, 1);
        SoundFx.playScanBeep();
    } else {
        stageVariant(v);
    }

    el.searchResultsContainer.style.display = 'none';
    el.barcodeInput.value = '';
    el.clearSearchBtn.style.display = 'none';
    focusScanner();
};

function stageVariant(variant) {
    state.stagedItem = variant;
    SoundFx.playScanBeep();

    el.stagedSku.textContent = `SKU: ${variant.sku || 'N/A'}`;
    el.stagedName.textContent = variant.products?.name || variant.sku;
    el.stagedBrand.textContent = variant.products?.brand || 'Fashion Feet';
    el.stagedCategory.textContent = variant.products?.category || 'Footwear';
    el.stagedPrice.textContent = `Rs. ${(variant.selling_price || 0).toLocaleString()}.00`;

    el.transferQty.value = 1;
    el.stagedItemCard.style.display = 'block';

    renderStagedItemStock(variant);
    renderSizeMatrix(variant);
}

function renderStagedItemStock(variant) {
    const fromId = el.fromBranch.value;
    const toId = el.toBranch.value;

    const fromLoc = state.locations.find(l => l.id === fromId);
    const toLoc = state.locations.find(l => l.id === toId);
    const otherLoc = state.locations.find(l => l.id !== fromId && l.id !== toId);

    const fromQty = getStock(variant.id, fromId);
    const toQty = getStock(variant.id, toId);
    const otherQty = otherLoc ? getStock(variant.id, otherLoc.id) : 0;

    el.pillFromName.textContent = `${fromLoc ? fromLoc.name : 'From Shop'}:`;
    el.pillFromQty.textContent = `${fromQty} prs`;
    el.pillFromQty.className = `b-qty ${fromQty > 0 ? 'in-stock' : ''}`;

    el.pillToName.textContent = `${toLoc ? toLoc.name : 'To Shop'}:`;
    el.pillToQty.textContent = `${toQty} prs`;
    el.pillToQty.className = `b-qty ${toQty > 0 ? 'in-stock' : ''}`;

    if (otherLoc) {
        el.pillOtherName.textContent = `${otherLoc.name}:`;
        el.pillOtherQty.textContent = `${otherQty} prs`;
        el.pillOtherQty.className = `b-qty ${otherQty > 0 ? 'in-stock' : ''}`;
        el.pillOtherName.parentElement.style.display = 'flex';
    } else {
        el.pillOtherName.parentElement.style.display = 'none';
    }
}

function renderSizeMatrix(currentVariant) {
    const pId = currentVariant.product_id || (currentVariant.products && currentVariant.products.id);
    const siblings = state.productsMap.get(pId) || [currentVariant];
    const fromId = el.fromBranch.value;

    siblings.sort((a, b) => {
        const numA = parseFloat(a.size);
        const numB = parseFloat(b.size);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return (a.size || '').localeCompare(b.size || '');
    });

    el.sizeMatrixGrid.innerHTML = siblings.map(v => {
        const stock = getStock(v.id, fromId);
        const isCurrent = v.id === currentVariant.id;
        return `
            <div 
                class="size-chip ${isCurrent ? 'active-variant' : ''}" 
                onclick="handleSizeChipClick('${v.id}')"
                title="Size ${v.size}: ${stock} prs in dispatch shop (Click to select/add)"
            >
                <span class="chip-size">${v.size || '-'}</span>
                <span class="chip-stock ${stock === 0 ? 'zero' : ''}">${stock} prs</span>
            </div>
        `;
    }).join('');
}

window.handleSizeChipClick = function(variantId) {
    const variant = state.catalog.find(v => v.id === variantId);
    if (!variant) return;

    if (state.autoScanMode) {
        addItemDirectlyToCart(variant, 1);
        SoundFx.playScanBeep();
    } else {
        stageVariant(variant);
    }
};

/**
 * ==========================================================================
 * 7. Transfer Batch (Cart) Operations
 * ==========================================================================
 */
function addItemDirectlyToCart(variant, qty = 1) {
    const fromLocId = el.fromBranch.value;
    const availableStock = getStock(variant.id, fromLocId);

    const existingIdx = state.cart.findIndex(item => item.variant.id === variant.id);
    let targetIdx = existingIdx;

    if (existingIdx >= 0) {
        state.cart[existingIdx].qty += qty;
        state.cart[existingIdx].availableStock = availableStock;
    } else {
        state.cart.unshift({
            variant: variant,
            qty: qty,
            availableStock: availableStock
        });
        targetIdx = 0;
    }

    renderCart();
    highlightCartRow(targetIdx);

    const name = variant.products?.name || variant.sku;
    showToast(`+${qty} pr added: ${name} (Size ${variant.size || 'N/A'})`, "success");
}

function addStagedItemToCart() {
    if (!state.stagedItem) return;

    const qty = parseInt(el.transferQty.value, 10);
    if (isNaN(qty) || qty <= 0) {
        showToast("Please enter a valid transfer quantity!", "warning");
        SoundFx.playWarningBuzz();
        return;
    }

    addItemDirectlyToCart(state.stagedItem, qty);
    SoundFx.playScanBeep();

    state.stagedItem = null;
    el.stagedItemCard.style.display = 'none';
    focusScanner();
}

function highlightCartRow(index) {
    setTimeout(() => {
        const rows = el.cartTableBody.querySelectorAll('tr');
        if (rows[index]) {
            rows[index].classList.add('cart-row-pulse');
            setTimeout(() => rows[index].classList.remove('cart-row-pulse'), 1200);
        }
    }, 50);
}

function renderCart() {
    const fromLocId = el.fromBranch.value;

    if (state.cart.length === 0) {
        el.cartEmptyState.style.display = 'block';
        el.cartTableWrapper.style.display = 'none';
        el.cartCountBadge.textContent = "0 Items";
        el.totalPairsBadge.textContent = "0 Pairs";
        el.totalUniqueStyles.textContent = "0";
        el.totalPairsToTransfer.textContent = "0 Pairs";
        el.totalBatchValue.textContent = "Rs. 0.00";
        if (el.mobileFloatingCartBar) el.mobileFloatingCartBar.classList.remove('active');
        if (el.mobBottomCartCount) el.mobBottomCartCount.textContent = '0';
        if (el.mobFloatBadge) el.mobFloatBadge.textContent = '0 prs';
        return;
    }

    el.cartEmptyState.style.display = 'none';
    el.cartTableWrapper.style.display = 'flex';

    let totalPairs = 0;
    let totalValue = 0;

    el.cartTableBody.innerHTML = state.cart.map((item, idx) => {
        totalPairs += item.qty;
        const v = item.variant;
        const price = Number(v.selling_price || 0);
        const lineTotal = price * item.qty;
        totalValue += lineTotal;

        const currentStock = getStock(v.id, fromLocId);
        item.availableStock = currentStock;

        const isStockOk = currentStock >= item.qty;
        const stockHintClass = isStockOk ? 'ok' : 'low';

        return `
            <tr data-index="${idx}">
                <td style="color: var(--text-dim); font-weight: 700;">${idx + 1}</td>
                <td>
                    <div class="row-item-title">${v.products?.brand ? v.products.brand + ' ' : ''}${v.products?.name || v.sku}</div>
                    <div class="row-item-sku">SKU: ${v.sku} ${v.barcode ? '• Barcode: ' + v.barcode : ''}</div>
                </td>
                <td>
                    <span class="size-pill">Size: ${v.size || 'N/A'}</span>
                    <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">${v.colour || '-'}</div>
                </td>
                <td>
                    <span class="stock-tag-sm ${stockHintClass}">${currentStock} prs</span>
                </td>
                <td>
                    <div class="cart-qty-control">
                        <button class="cart-qty-btn" onclick="updateCartItemQty(${idx}, -1)" title="Decrease quantity">-</button>
                        <span class="cart-qty-val">${item.qty}</span>
                        <button class="cart-qty-btn" onclick="updateCartItemQty(${idx}, 1)" title="Increase quantity">+</button>
                    </div>
                </td>
                <td style="text-align: right; font-family: var(--font-mono); font-weight: 700; color: var(--warning-color);">
                    Rs. ${price.toLocaleString()}
                </td>
                <td style="text-align: center;">
                    <button class="btn-remove" onclick="removeCartItem(${idx})" title="Remove style from batch">&times;</button>
                </td>
            </tr>
        `;
    }).join('');

    el.cartCountBadge.textContent = `${state.cart.length} Styles`;
    el.totalPairsBadge.textContent = `${totalPairs} Pairs`;
    el.totalUniqueStyles.textContent = state.cart.length;
    el.totalPairsToTransfer.textContent = `${totalPairs} Pairs`;
    el.totalBatchValue.textContent = `Rs. ${totalValue.toLocaleString()}.00`;

    // Update mobile floating batch bar & bottom nav counter
    if (el.mobileFloatingCartBar) el.mobileFloatingCartBar.classList.add('active');
    if (el.mobBottomCartCount) el.mobBottomCartCount.textContent = totalPairs;
    if (el.mobFloatBadge) el.mobFloatBadge.textContent = `${totalPairs} prs`;
}

window.updateCartItemQty = function(idx, delta) {
    if (!state.cart[idx]) return;
    state.cart[idx].qty += delta;

    if (state.cart[idx].qty <= 0) {
        state.cart.splice(idx, 1);
        SoundFx.playScanBeep();
        showToast("Item removed from batch", "info");
    } else {
        SoundFx.playScanBeep();
    }

    renderCart();
};

window.removeCartItem = function(idx) {
    if (!state.cart[idx]) return;
    state.cart.splice(idx, 1);
    SoundFx.playScanBeep();
    renderCart();
    showToast("Item removed from batch", "info");
};

function clearCart() {
    if (state.cart.length === 0) return;
    if (confirm("Are you sure you want to clear all items from the current transfer batch?")) {
        state.cart = [];
        renderCart();
        SoundFx.playScanBeep();
        showToast("Transfer batch cleared", "info");
        focusScanner();
    }
}

/**
 * ==========================================================================
 * 8. Confirm Transfer & Supabase Atomic Saga Execution
 * ==========================================================================
 */
async function confirmAndDispatchTransfer() {
    if (!state.currentUser) {
        showToast("Please sign in with your staff account first to dispatch transfers!", "warning");
        SoundFx.playWarningBuzz();
        showLoginScreen(true);
        return;
    }

    if (state.cart.length === 0) {
        showToast("Transfer batch is empty! Add shoe items first.", "warning");
        SoundFx.playWarningBuzz();
        return;
    }

    const fromLocId = el.fromBranch.value;
    const toLocId = el.toBranch.value;

    if (!fromLocId || !toLocId) {
        showToast("Please select both Dispatch and Receiving branches!", "warning");
        SoundFx.playWarningBuzz();
        return;
    }

    if (fromLocId === toLocId) {
        showToast("Dispatch and Receiving branches cannot be identical!", "error");
        SoundFx.playWarningBuzz();
        return;
    }

    const modeRadio = document.querySelector('input[name="transferMode"]:checked');
    const transferStatus = modeRadio ? modeRadio.value : "received";

    let stockWarnings = [];
    state.cart.forEach(item => {
        const stock = getStock(item.variant.id, fromLocId);
        if (item.qty > stock) {
            stockWarnings.push(`${item.variant.sku} (Transfer: ${item.qty}, Shop has: ${stock})`);
        }
    });

    if (stockWarnings.length > 0) {
        const proceed = confirm(`⚠️ Warning: ${stockWarnings.length} item(s) exceed available stock at source:\n\n${stockWarnings.slice(0, 4).join('\n')}\n\nDo you still wish to proceed with the transfer?`);
        if (!proceed) return;
    }

    el.confirmTransferBtn.disabled = true;
    el.confirmTransferBtn.innerHTML = `⏳ Executing Supabase Saga...`;

    try {
        const fromShopName = el.fromBranch.options[el.fromBranch.selectedIndex].text.split('(')[0].trim();
        const toShopName = el.toBranch.options[el.toBranch.selectedIndex].text.split('(')[0].trim();
        const driverNotes = el.transferNotes.value.trim();
        const nowIso = new Date().toISOString();
        const currentUserId = (state.currentUser && state.currentUser.id) ? state.currentUser.id : "d0e59b77-058d-45df-b907-fb45d9486b34";

        // 1. Insert master record into `transfers` table
        const transferPayload = {
            from_location: fromLocId,
            to_location: toLocId,
            status: transferStatus,
            created_by: currentUserId,
            dispatched_at: nowIso,
            received_at: transferStatus === "received" ? nowIso : null
        };

        const resTransfer = await fetch(`${SUPABASE_URL}/transfers`, {
            method: "POST",
            headers: HEADERS,
            body: JSON.stringify(transferPayload)
        });

        if (!resTransfer.ok) {
            const errBody = await resTransfer.text();
            throw new Error(`Transfer creation failed: ${errBody}`);
        }

        const transferData = await resTransfer.json();
        const transferId = (transferData && transferData[0]?.id) ? transferData[0].id : `TRN-${Date.now().toString().slice(-6)}`;

        // 2. Loop through all batch items: Update stock_levels and log stock_movements
        for (const item of state.cart) {
            const vId = item.variant.id;
            const qty = item.qty;

            // A. Deduct from source branch stock_levels
            const currentFromQty = getStock(vId, fromLocId);
            const newFromQty = Math.max(0, currentFromQty - qty);

            const sFromRes = await fetch(`${SUPABASE_URL}/stock_levels?variant_id=eq.${vId}&location_id=eq.${fromLocId}`, { headers: HEADERS });
            const sFromData = await sFromRes.json();

            if (sFromData && sFromData.length > 0) {
                await fetch(`${SUPABASE_URL}/stock_levels?id=eq.${sFromData[0].id}`, {
                    method: "PATCH",
                    headers: HEADERS,
                    body: JSON.stringify({ quantity: newFromQty, updated_at: nowIso })
                });
            } else {
                await fetch(`${SUPABASE_URL}/stock_levels`, {
                    method: "POST",
                    headers: HEADERS,
                    body: JSON.stringify({ variant_id: vId, location_id: fromLocId, quantity: 0, updated_at: nowIso })
                });
            }
            state.stockMap.set(`${vId}_${fromLocId}`, newFromQty);

            // B. Add to receiving branch stock_levels
            const currentToQty = getStock(vId, toLocId);
            const newToQty = currentToQty + qty;

            const sToRes = await fetch(`${SUPABASE_URL}/stock_levels?variant_id=eq.${vId}&location_id=eq.${toLocId}`, { headers: HEADERS });
            const sToData = await sToRes.json();

            if (sToData && sToData.length > 0) {
                await fetch(`${SUPABASE_URL}/stock_levels?id=eq.${sToData[0].id}`, {
                    method: "PATCH",
                    headers: HEADERS,
                    body: JSON.stringify({ quantity: newToQty, updated_at: nowIso })
                });
            } else {
                await fetch(`${SUPABASE_URL}/stock_levels`, {
                    method: "POST",
                    headers: HEADERS,
                    body: JSON.stringify({ variant_id: vId, location_id: toLocId, quantity: qty, updated_at: nowIso })
                });
            }
            state.stockMap.set(`${vId}_${toLocId}`, newToQty);

            // C. Log TWO stock_movements rows (POS standard: negative for source, positive for destination)
            const movements = [
                {
                    variant_id: vId,
                    from_location: fromLocId,
                    to_location: null,
                    quantity: -qty,
                    type: "branch_transfer",
                    reference_id: transferId.toString(),
                    created_by: currentUserId,
                    created_at: nowIso
                },
                {
                    variant_id: vId,
                    from_location: null,
                    to_location: toLocId,
                    quantity: qty,
                    type: "branch_transfer",
                    reference_id: transferId.toString(),
                    created_by: currentUserId,
                    created_at: nowIso
                }
            ];

            await fetch(`${SUPABASE_URL}/stock_movements`, {
                method: "POST",
                headers: HEADERS,
                body: JSON.stringify(movements)
            }).catch(e => console.warn("Stock movement log error:", e));
        }

        // 3. Play victory chime and show official printable voucher
        SoundFx.playSuccessChime();
        state.lastTransferDetails = {
            id: transferId,
            fromName: fromShopName,
            toName: toShopName,
            status: transferStatus,
            driverNotes: driverNotes,
            dispatchedByName: state.currentUser?.name || "Staff",
            date: new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }),
            items: [...state.cart]
        };

        showPrintableVoucher(state.lastTransferDetails);

        // 4. Reset batch cart and refresh tables
        state.cart = [];
        el.transferNotes.value = '';
        renderCart();
        updateBranchStockTotals();
        fetchRecentTransfers();
        showToast("Transfer confirmed and inventory synced!", "success");

    } catch (err) {
        console.error("Transfer execution error:", err);
        showToast("Transfer failed: " + (err.message || "Network error"), "error");
        SoundFx.playWarningBuzz();
    } finally {
        el.confirmTransferBtn.disabled = false;
        el.confirmTransferBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            🚀 Confirm & Dispatch Transfer
        `;
    }
}

/**
 * ==========================================================================
 * 9. Printable Dispatch Voucher & Thermal Slip
 * ==========================================================================
 */
function showPrintableVoucher(details) {
    el.noteTransferId.textContent = `#${details.id.slice(0, 10).toUpperCase()}`;
    el.noteDate.textContent = details.date;
    el.noteStatusType.textContent = details.status === 'received' ? 'Direct Stock Sync (Received)' : 'Dispatched (In-Transit)';
    el.noteFrom.textContent = details.fromName;
    el.noteTo.textContent = details.toName;

    if (details.dispatchedByName && el.noteDispatchedBy) {
        el.noteDispatchedBy.textContent = `Dispatched By: ${details.dispatchedByName}`;
    }

    if (details.driverNotes) {
        el.noteDriverText.textContent = details.driverNotes;
        el.noteDriverRow.style.display = 'block';
    } else {
        el.noteDriverRow.style.display = 'none';
    }

    let totalPairs = 0;
    el.noteItemsTableBody.innerHTML = details.items.map((it, idx) => {
        totalPairs += it.qty;
        const v = it.variant;
        return `
            <tr>
                <td style="color: #6b7280; font-weight: 700;">${idx + 1}</td>
                <td>
                    <strong>${v.products?.brand ? v.products.brand + ' ' : ''}${v.products?.name || v.sku}</strong>
                    <div style="font-size: 0.7rem; color: #6b7280;">Color: ${v.colour || '-'}</div>
                </td>
                <td style="font-family: var(--font-mono); font-size: 0.75rem;">${v.sku}</td>
                <td style="text-align: center; font-weight: 700;">${v.size || 'N/A'}</td>
                <td style="text-align: right; font-weight: 800; font-family: var(--font-mono);">${it.qty} prs</td>
            </tr>
        `;
    }).join('');

    el.noteTotalStyles.textContent = `${details.items.length} Styles`;
    el.noteTotalPairs.textContent = `${totalPairs} Pairs`;

    el.successModal.style.display = 'flex';
}

/**
 * ==========================================================================
 * 10. Live Recent Transfer History & Audit Feed
 * ==========================================================================
 */
async function fetchRecentTransfers() {
    try {
        const url = `${SUPABASE_URL}/transfers?select=*&order=created_at.desc&limit=15`;
        const res = await fetch(url, { headers: HEADERS });
        if (!res.ok) throw new Error("History fetch failed");

        const transfers = await res.json() || [];
        renderHistoryTable(transfers);
    } catch (err) {
        console.warn("History fetch warning:", err);
        renderHistoryTable([]);
    }
}

function renderHistoryTable(transfers) {
    if (!transfers || transfers.length === 0) {
        el.historyTableBody.innerHTML = `<tr><td colspan="5" class="loading-td">No recent transfers recorded in database.</td></tr>`;
        return;
    }

    el.historyTableBody.innerHTML = transfers.map(t => {
        const dateStr = t.created_at ? new Date(t.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Just now';
        const fromName = state.locations.find(l => l.id === t.from_location)?.name || "Dispatch Shop";
        const toName = state.locations.find(l => l.id === t.to_location)?.name || "Receiving Shop";
        const isReceived = (t.status === 'received' || t.status === 'Received');

        return `
            <tr>
                <td><strong style="font-family: var(--font-mono); color: var(--accent-primary);">#${t.id ? t.id.slice(0, 8).toUpperCase() : 'TRN'}</strong></td>
                <td>${dateStr}</td>
                <td>
                    <strong>${fromName}</strong> ➔ <strong style="color: var(--success-color);">${toName}</strong>
                </td>
                <td>
                    <span class="status-badge ${isReceived ? 'status-received' : 'status-dispatched'}">
                        ${isReceived ? 'Received' : 'In-Transit'}
                    </span>
                </td>
                <td style="text-align: right;">
                    <button class="btn btn-sm btn-secondary" onclick="reprintPastTransfer('${t.id}')" title="Reprint official dispatch slip">
                        🖨️ Slip
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

window.reprintPastTransfer = async function(transferId) {
    showToast("Loading transfer items...", "info");
    try {
        const { data: t } = await (await fetch(`${SUPABASE_URL}/transfers?id=eq.${transferId}&select=*`, { headers: HEADERS })).json().then(d => ({ data: d[0] }));
        if (!t) throw new Error("Transfer not found");

        const { data: movements } = await (await fetch(`${SUPABASE_URL}/stock_movements?reference_id=eq.${transferId}&quantity=gt.0&select=*`, { headers: HEADERS })).json().then(d => ({ data: d }));

        const fromName = state.locations.find(l => l.id === t.from_location)?.name || "Dispatch Shop";
        const toName = state.locations.find(l => l.id === t.to_location)?.name || "Receiving Shop";

        const items = (movements || []).map(m => {
            const v = state.catalog.find(cat => cat.id === m.variant_id) || { sku: 'N/A', size: 'N/A' };
            return {
                variant: v,
                qty: m.quantity
            };
        });

        showPrintableVoucher({
            id: t.id,
            fromName: fromName,
            toName: toName,
            status: t.status,
            driverNotes: `Dispatched at: ${t.dispatched_at || t.created_at}`,
            dispatchedByName: "Verified Staff",
            date: new Date(t.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }),
            items: items.length > 0 ? items : [{ variant: { sku: 'Items recorded', size: '-' }, qty: 1 }]
        });
    } catch (e) {
        showToast("Error loading past transfer: " + e.message, "error");
    }
};

/**
 * ==========================================================================
 * 11. Event Listeners & UI Wiring
 * ==========================================================================
 */
function setupEventListeners() {
    // Auth & Profile Menu
    el.userMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!state.currentUser) {
            showLoginScreen(true);
            return;
        }
        const isOpen = el.profileDropdown.style.display === 'block';
        el.profileDropdown.style.display = isOpen ? 'none' : 'block';
    });

    document.addEventListener('click', () => {
        if (el.profileDropdown) el.profileDropdown.style.display = 'none';
    });

    el.openStaffManagerBtn.addEventListener('click', () => {
        el.profileDropdown.style.display = 'none';
        el.staffManagerModal.style.display = 'flex';
        renderStaffDirectory();
    });

    el.openResetPasswordBtn.addEventListener('click', () => {
        el.profileDropdown.style.display = 'none';
        switchAuthTab('reset');
        showLoginScreen(false);
        if (state.currentUser?.email) el.resetEmail.value = state.currentUser.email;
    });

    el.logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('ff_transfer_user');
        sessionStorage.removeItem('ff_transfer_user');
        localStorage.removeItem('ff_pos_user');
        sessionStorage.removeItem('ff_pos_user');
        state.currentUser = null;
        updateUserDisplay();
        el.profileDropdown.style.display = 'none';
        showToast("Logged out from Transfer Hub", "info");
        showLoginScreen(true);
    });

    // Toggle Login Password Visibility
    const toggleLoginPwBtn = document.getElementById('toggleLoginPwBtn');
    if (toggleLoginPwBtn && el.loginPassword) {
        toggleLoginPwBtn.addEventListener('click', () => {
            const isPw = el.loginPassword.type === 'password';
            el.loginPassword.type = isPw ? 'text' : 'password';
            toggleLoginPwBtn.innerHTML = isPw ? `
                <svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
            ` : `
                <svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                </svg>
            `;
        });
    }

    // Forgot PIN link to jump straight to Reset tab
    const authForgotBtn = document.getElementById('authForgotBtn');
    if (authForgotBtn) {
        authForgotBtn.addEventListener('click', () => {
            switchAuthTab('reset');
            if (el.loginEmail && el.resetEmail && el.loginEmail.value) {
                el.resetEmail.value = el.loginEmail.value;
            }
            if (el.resetNewPassword) el.resetNewPassword.focus();
        });
    }

    // Auth Modal Tabs
    el.tabLoginBtn.addEventListener('click', () => switchAuthTab('login'));
    el.tabSignUpBtn.addEventListener('click', () => switchAuthTab('signup'));
    el.tabResetBtn.addEventListener('click', () => switchAuthTab('reset'));
    el.closeAuthModalBtn.addEventListener('click', () => {
        if (!state.currentUser) {
            showToast("Please sign in to access Fashion Feet POS Hub", "warning");
            return;
        }
        el.authModal.style.display = 'none';
    });

    el.closeStaffManagerBtn.addEventListener('click', () => el.staffManagerModal.style.display = 'none');
    el.addNewStaffShortcutBtn.addEventListener('click', () => {
        el.staffManagerModal.style.display = 'none';
        switchAuthTab('signup');
        el.authModal.style.display = 'flex';
    });

    // Auth Forms Submission
    el.loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleLogin(el.loginEmail.value, el.loginPassword.value);
    });

    el.signUpForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleSignUp(
            el.signupFullName.value,
            el.signupEmail.value,
            el.signupPassword.value,
            el.signupRole.value,
            el.signupBranch.value
        );
    });

    el.resetPasswordForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (el.resetNewPassword.value !== el.resetConfirmPassword.value) {
            showToast("Passwords do not match!", "warning");
            SoundFx.playWarningBuzz();
            return;
        }
        handleResetPassword(el.resetEmail.value, el.resetNewPassword.value);
    });

    // PWA Install Button
    el.installPwaBtn.addEventListener('click', async () => {
        if (state.deferredPwaPrompt) {
            state.deferredPwaPrompt.prompt();
            const { outcome } = await state.deferredPwaPrompt.userChoice;
            if (outcome === 'accepted') {
                showToast("Fashion Feet App installed successfully!", "success");
            }
            state.deferredPwaPrompt = null;
        } else {
            // Check if iOS device
            const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
            if (isIos) {
                alert("📲 To Install on iPhone/iPad:\n\n1. Tap the Share icon [↑] at the bottom of Safari.\n2. Scroll down and tap 'Add to Home Screen'.\n3. Tap 'Add' at the top right.");
            } else {
                alert("📲 To Install on Android:\n\n1. Tap the three dots (⋮) menu in Chrome.\n2. Tap 'Install app' or 'Add to Home screen'.");
            }
        }
    });

    // Camera Scanner Handlers
    el.openCameraScannerBtn.addEventListener('click', startMobileCameraScanner);
    el.closeCameraScannerBtn.addEventListener('click', stopMobileCameraScanner);
    el.switchCameraTorchBtn.addEventListener('click', async () => {
        if (state.html5QrScanner && state.html5QrScanner.isScanning) {
            try {
                state.cameraTorchActive = !state.cameraTorchActive;
                await state.html5QrScanner.applyVideoConstraints({
                    advanced: [{ torch: state.cameraTorchActive }]
                });
                el.switchCameraTorchBtn.textContent = state.cameraTorchActive ? "⚡ Torch ON" : "⚡ Torch";
            } catch (e) {
                showToast("Torch is not supported by your camera", "info");
            }
        }
    });

    // Route Selection Changes
    el.fromBranch.addEventListener('change', updateRouteHeader);
    el.toBranch.addEventListener('change', updateRouteHeader);

    // Swap Branches
    el.swapBranchesBtn.addEventListener('click', () => {
        const temp = el.fromBranch.value;
        el.fromBranch.value = el.toBranch.value;
        el.toBranch.value = temp;
        SoundFx.playScanBeep();
        updateRouteHeader();
        showToast("Dispatch and Receiving branches swapped!", "info");
    });

    // Custom Luxury Dropdown Triggers
    const fromDropdownBtn = document.getElementById('fromDropdownBtn');
    const toDropdownBtn = document.getElementById('toDropdownBtn');

    if (fromDropdownBtn) {
        fromDropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleCustomDropdown('from');
        });
    }

    if (toDropdownBtn) {
        toDropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleCustomDropdown('to');
        });
    }

    // Close custom dropdown menus when clicking outside
    document.addEventListener('click', (e) => {
        const fromContainer = document.getElementById('fromDropdownContainer');
        const toContainer = document.getElementById('toDropdownContainer');
        if (fromContainer && !fromContainer.contains(e.target) && toContainer && !toContainer.contains(e.target)) {
            closeCustomDropdowns();
        }
    });

    // Barcode Search Input Handlers
    let debounceTimer;
    el.barcodeInput.addEventListener('input', (e) => {
        const val = e.target.value;
        el.clearSearchBtn.style.display = val.length > 0 ? 'block' : 'none';

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            searchCatalog(val);
        }, 120);
    });

    el.barcodeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            clearTimeout(debounceTimer);
            handleBarcodeScanInput(el.barcodeInput.value);
        }
    });

    el.clearSearchBtn.addEventListener('click', () => {
        el.barcodeInput.value = '';
        el.clearSearchBtn.style.display = 'none';
        el.searchResultsContainer.style.display = 'none';
        focusScanner();
    });

    // Auto-Scan Toggle
    el.autoScanToggleBtn.addEventListener('click', () => {
        state.autoScanMode = !state.autoScanMode;
        if (state.autoScanMode) {
            el.autoScanToggleBtn.classList.add('active');
            el.autoScanToggleBtn.innerHTML = `<span class="toggle-icon">⚡</span> <span class="toggle-text">Instant Scan: <strong>ON</strong></span>`;
            el.scanModeLabel.innerHTML = `<span class="dot-indicator"></span><span>Instant Add Mode Active (Auto +1 on Scan)</span>`;
            showToast("Instant Barcode Scan Mode ON ⚡", "success");
        } else {
            el.autoScanToggleBtn.classList.remove('active');
            el.autoScanToggleBtn.innerHTML = `<span class="toggle-icon">🔍</span> <span class="toggle-text">Instant Scan: <strong>OFF</strong></span>`;
            el.scanModeLabel.innerHTML = `<span class="dot-indicator" style="background: var(--text-dim);"></span><span>Inspection Mode (Show Size Matrix on Scan)</span>`;
            showToast("Inspection Mode Active (Scan opens preview) 🔍", "info");
        }
        if (el.mobAutoScanStatus) el.mobAutoScanStatus.textContent = state.autoScanMode ? 'ON' : 'OFF';
        SoundFx.playScanBeep();
        focusScanner();
    });

    // Manual Catalog Sync
    el.manualSyncBtn.addEventListener('click', () => {
        SoundFx.playScanBeep();
        syncCatalogAndStock();
    });

    // Staged Card Close
    el.closeStagedCardBtn.addEventListener('click', () => {
        el.stagedItemCard.style.display = 'none';
        state.stagedItem = null;
        focusScanner();
    });

    // Stepper Controls
    el.qtyMinusBtn.addEventListener('click', () => {
        let q = parseInt(el.transferQty.value, 10) || 1;
        if (q > 1) el.transferQty.value = q - 1;
    });

    el.qtyPlusBtn.addEventListener('click', () => {
        let q = parseInt(el.transferQty.value, 10) || 1;
        el.transferQty.value = q + 1;
    });

    el.maxStockBtn.addEventListener('click', () => {
        if (!state.stagedItem) return;
        const available = getStock(state.stagedItem.id, el.fromBranch.value);
        el.transferQty.value = Math.max(1, available);
        SoundFx.playScanBeep();
    });

    el.addToCartBtn.addEventListener('click', addStagedItemToCart);
    el.clearCartBtn.addEventListener('click', clearCart);
    el.confirmTransferBtn.addEventListener('click', confirmAndDispatchTransfer);

    el.refreshHistoryBtn.addEventListener('click', () => {
        SoundFx.playScanBeep();
        fetchRecentTransfers();
        showToast("Transfer audit logs refreshed!", "info");
    });

    // Modal Actions
    el.closeModalBtn.addEventListener('click', () => {
        el.successModal.style.display = 'none';
        focusScanner();
    });

    el.printThermalBtn.addEventListener('click', () => {
        window.print();
    });

    // Theme Toggle
    el.themeToggleBtn.addEventListener('click', () => {
        const body = document.body;
        if (body.classList.contains('dark-theme')) {
            body.classList.remove('dark-theme');
            body.classList.add('light-theme');
            state.theme = 'light';
            showToast("Light Theme Activated ☀️", "info");
        } else {
            body.classList.remove('light-theme');
            body.classList.add('dark-theme');
            state.theme = 'dark';
            showToast("Dark Theme Activated 🌙", "info");
        }
        SoundFx.playScanBeep();
    });

    // Audio Feedback Toggle
    el.audioToggleBtn.addEventListener('click', () => {
        state.soundEnabled = !state.soundEnabled;
        el.audioToggleBtn.style.opacity = state.soundEnabled ? '1' : '0.4';
        showToast(`Sound FX ${state.soundEnabled ? 'Enabled 🔊' : 'Muted 🔇'}`, "info");
        if (state.soundEnabled) SoundFx.playScanBeep();
    });

    // Hide search results when clicking outside
    document.addEventListener('click', (e) => {
        if (!el.barcodeInput.contains(e.target) && !el.searchResultsContainer.contains(e.target)) {
            el.searchResultsContainer.style.display = 'none';
        }
    });

    // -------------------------------------------------------------
    // Mobile Drawer & App Navigation Event Listeners
    // -------------------------------------------------------------
    if (el.mobileSettingsToggleBtn && el.mobileSettingsDrawer) {
        el.mobileSettingsToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = el.mobileSettingsDrawer.style.display === 'block';
            el.mobileSettingsDrawer.style.display = isOpen ? 'none' : 'block';
        });

        document.addEventListener('click', (e) => {
            if (!el.mobileSettingsDrawer.contains(e.target) && !el.mobileSettingsToggleBtn.contains(e.target)) {
                el.mobileSettingsDrawer.style.display = 'none';
            }
        });
    }

    if (el.mobAutoScanBtn) {
        el.mobAutoScanBtn.addEventListener('click', () => {
            if (el.autoScanToggleBtn) el.autoScanToggleBtn.click();
        });
    }

    if (el.mobSyncBtn) {
        el.mobSyncBtn.addEventListener('click', () => {
            if (el.mobileSettingsDrawer) el.mobileSettingsDrawer.style.display = 'none';
            if (el.manualSyncBtn) el.manualSyncBtn.click();
        });
    }

    if (el.mobThemeBtn) {
        el.mobThemeBtn.addEventListener('click', () => {
            if (el.themeToggleBtn) el.themeToggleBtn.click();
        });
    }

    if (el.mobAudioBtn) {
        el.mobAudioBtn.addEventListener('click', () => {
            if (el.audioToggleBtn) el.audioToggleBtn.click();
        });
    }

    // Mobile Bottom Navigation Tabs
    const mobileNavItems = document.querySelectorAll('.mobile-nav-item');
    function setActiveMobileNav(activeEl) {
        mobileNavItems.forEach(item => item.classList.remove('active'));
        if (activeEl) activeEl.classList.add('active');
    }

    if (el.mobNavTransferBtn) {
        el.mobNavTransferBtn.addEventListener('click', (e) => {
            e.preventDefault();
            setActiveMobileNav(el.mobNavTransferBtn);
            const target = document.getElementById('transferSection');
            if (target) target.scrollIntoView({ behavior: 'smooth' });
            focusScanner();
        });
    }

    if (el.mobNavCartBtn) {
        el.mobNavCartBtn.addEventListener('click', (e) => {
            e.preventDefault();
            setActiveMobileNav(el.mobNavCartBtn);
            const target = document.getElementById('cartSection');
            if (target) target.scrollIntoView({ behavior: 'smooth' });
        });
    }

    if (el.mobFloatViewBtn) {
        el.mobFloatViewBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (el.mobNavCartBtn) setActiveMobileNav(el.mobNavCartBtn);
            const target = document.getElementById('cartSection');
            if (target) target.scrollIntoView({ behavior: 'smooth' });
        });
    }

    if (el.mobNavHistoryBtn) {
        el.mobNavHistoryBtn.addEventListener('click', (e) => {
            e.preventDefault();
            setActiveMobileNav(el.mobNavHistoryBtn);
            const target = document.getElementById('historySection');
            if (target) target.scrollIntoView({ behavior: 'smooth' });
        });
    }

    if (el.mobNavStaffBtn) {
        el.mobNavStaffBtn.addEventListener('click', (e) => {
            e.preventDefault();
            setActiveMobileNav(el.mobNavStaffBtn);
            if (el.staffManagerModal) el.staffManagerModal.style.display = 'flex';
        });
    }
}

function showToast(message, type = "info") {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = "💡";
    if (type === "success") icon = "✅";
    if (type === "error") icon = "❌";
    if (type === "warning") icon = "⚠️";

    toast.innerHTML = `<span>${icon}</span> <div>${message}</div>`;
    el.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 260);
    }, 3800);
}

// Start Engine on DOM Load
document.addEventListener('DOMContentLoaded', initApp);
