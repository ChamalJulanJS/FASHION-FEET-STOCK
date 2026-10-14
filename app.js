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

    if (window.location.hash.includes('reorder') && typeof window.switchHubTab === 'function') {
        window.switchHubTab('reorder');
    } else {
        focusScanner();
    }
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').then(reg => {
            console.log('PWA ServiceWorker registered with scope:', reg.scope);
            reg.update();
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
            `${SUPABASE_URL}/product_variants?select=id,product_id,sku,barcode,size,colour,selling_price,cost_price,products(id,name,brand,category,gender)&limit=3000`,
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
        if (window.location.hash.includes('reorder') || (document.getElementById('reorderWorkspaceView') && document.getElementById('reorderWorkspaceView').style.display !== 'none')) {
            initReorderHub();
        } else if (state.reorder && state.reorder.isInitialized) {
            renderReorderCatalog();
            refreshReorderSheetStock();
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
 * Shoe Size Conversion Engine (Sri Lanka Standard: Men's 40 = UK 6)
 * ==========================================================================
 */
function isMenShoe(product) {
    if (!product) return false;
    const gender = (product.gender || '').trim().toUpperCase();
    const name = (product.name || '').toUpperCase();
    const category = (product.category || '').toUpperCase();

    // Explicit exclusions for Women, Ladies, Girls, Kids, Baby
    if (gender.includes('WOMEN') || name.includes('WOMEN') || category.includes('WOMEN') ||
        gender.includes('LADIES') || name.includes('LADIES') || category.includes('LADIES') ||
        gender.includes('GIRL') || name.includes('GIRL') || category.includes('GIRL') ||
        gender.includes('KIDS') || name.includes('KIDS') || category.includes('KIDS') ||
        gender.includes('BABY') || name.includes('BABY') || category.includes('BABY')) {
        return false;
    }

    if (gender === 'MEN' || gender === 'MALE' || gender.includes('MEN') || gender.includes('MALE')) {
        return true;
    }
    if (category.includes('MEN') || category.includes('MALE') || category.includes('GENTS')) {
        return true;
    }
    if (name.includes('MEN') || name.includes('MALE') || name.includes('GENTS')) {
        return true;
    }

    return true; // Default for remaining adult footwear styles
}

/**
 * Convert Men's EU sizes (35-48) to UK equivalent:
 * 40 = 6, 41 = 7, 42 = 8, 43 = 9, 44 = 10, 45 = 11, etc.
 * Shows formatted as: "6 (40)", or "6" if uk_only
 */
function getShoeDisplaySize(rawSize, product, format = 'full') {
    if (!rawSize) return '-';
    const s = rawSize.toString().trim();
    const num = parseFloat(s);

    if (!isNaN(num) && num >= 35 && num <= 48 && isMenShoe(product)) {
        const uk = num - 34;
        if (format === 'uk_only') {
            return `${uk}`;
        }
        if (format === 'html') {
            return `${uk} <small class="sz-sub" style="font-size:0.72em; opacity:0.8; font-weight:normal;">(${num})</small>`;
        }
        return `${uk} (${num})`;
    }

    return s;
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
        const dispSz = getShoeDisplaySize(v.size, v.products);
        const sizeMatch = (v.size && v.size.toString().trim() === q) || dispSz.toUpperCase().includes(q);
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
        const dispSize = getShoeDisplaySize(v.size, v.products);

        return `
            <li class="result-item" onclick="handleSelectVariant('${v.id}')">
                <div class="res-main">
                    <span class="res-name">${shoeName}</span>
                    <div class="res-sub">
                        <span class="res-sku">${v.sku}</span>
                        <span class="res-size-pill">Size: ${dispSize}</span>
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
        const dispSize = getShoeDisplaySize(v.size, v.products);
        return `
            <div 
                class="size-chip ${isCurrent ? 'active-variant' : ''}" 
                onclick="handleSizeChipClick('${v.id}')"
                title="Size ${dispSize}: ${stock} prs in dispatch shop (Click to select/add)"
            >
                <span class="chip-size">${dispSize}</span>
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
                    <span class="size-pill">Size: ${getShoeDisplaySize(v.size, v.products)}</span>
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
                <td style="text-align: center; font-weight: 700;">${getShoeDisplaySize(v.size, v.products)}</td>
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

    // Desktop and Mobile Navigation for Transfer & Reorder Hub
    const navTabTransfer = document.getElementById('navTabTransfer');
    const navTabReorder = document.getElementById('navTabReorder');
    const navTabHistory = document.getElementById('navTabHistory');
    const transferView = document.getElementById('transferWorkspaceView');
    const reorderView = document.getElementById('reorderWorkspaceView');
    const mobNavReorderBtn = document.getElementById('mobNavReorderBtn');

    window.switchHubTab = function(tabName) {
        if (tabName === 'reorder') {
            if (transferView) transferView.style.display = 'none';
            if (reorderView) reorderView.style.display = 'block';
            navTabReorder?.classList.add('active');
            navTabTransfer?.classList.remove('active');
            navTabHistory?.classList.remove('active');
            if (mobNavReorderBtn) setActiveMobileNav(mobNavReorderBtn);
            initReorderHub();
            const sInput = document.getElementById('reorderSearchInput');
            if (sInput) setTimeout(() => sInput.focus(), 150);
        } else if (tabName === 'history') {
            if (transferView) transferView.style.display = 'block';
            if (reorderView) reorderView.style.display = 'none';
            navTabHistory?.classList.add('active');
            navTabTransfer?.classList.remove('active');
            navTabReorder?.classList.remove('active');
            if (el.mobNavHistoryBtn) setActiveMobileNav(el.mobNavHistoryBtn);
            const target = document.getElementById('historySection');
            if (target) target.scrollIntoView({ behavior: 'smooth' });
        } else {
            if (transferView) transferView.style.display = 'block';
            if (reorderView) reorderView.style.display = 'none';
            navTabTransfer?.classList.add('active');
            navTabReorder?.classList.remove('active');
            navTabHistory?.classList.remove('active');
            if (el.mobNavTransferBtn) setActiveMobileNav(el.mobNavTransferBtn);
            focusScanner();
        }
    };

    navTabTransfer?.addEventListener('click', (e) => { e.preventDefault(); window.switchHubTab('transfer'); });
    navTabReorder?.addEventListener('click', (e) => { e.preventDefault(); window.switchHubTab('reorder'); });
    navTabHistory?.addEventListener('click', (e) => { e.preventDefault(); window.switchHubTab('history'); });

    if (mobNavReorderBtn) {
        mobNavReorderBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.switchHubTab('reorder');
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

/**
 * ==========================================================================
 * 8. FOOTWEAR STOCK MATRIX & SMART REORDER HUB ENGINE
 * Multi-Level Filtering (Brand/Category/Code), Real-Time Size Run Matrix,
 * Direct Click-to-Order Sheet, Intelligent Low-Stock Auto-Fill,
 * One-Click WhatsApp Supplier Order Generator & Printable PO Slip.
 * ==========================================================================
 */

// Initialize Reorder State if not already defined
if (!state.reorder) {
    state.reorder = {
        selectedLocationId: 'b9730905-c070-4ee8-960e-74d2fef1592b', // Default: Shoe Gallery
        filterBrand: 'ALL',
        filterCategory: 'ALL',
        filterStatus: 'ALL', // 'ALL', 'OUT_OF_STOCK', 'LOW_STOCK', 'IN_STOCK'
        searchQuery: '',
        orderSheet: new Map(), // productId -> sheetItem
        supplierNotes: '',
        isInitialized: false
    };
}

function initReorderHub() {
    const locSelect = document.getElementById('reorderLocationSelect');
    const brandSelect = document.getElementById('reorderBrandSelect');
    const catSelect = document.getElementById('reorderCategorySelect');
    const statusSelect = document.getElementById('reorderStatusSelect');
    const searchInput = document.getElementById('reorderSearchInput');
    const clearSearchBtn = document.getElementById('reorderClearSearchBtn');

    if (!locSelect || !brandSelect || !catSelect) return;

    // 1. Populate Locations Dropdown
    locSelect.innerHTML = `<option value="ALL">🌐 All Branches Combined (සියලු ශාඛා)</option>`;
    state.locations.forEach(loc => {
        const isDefault = loc.id === state.reorder.selectedLocationId;
        locSelect.innerHTML += `<option value="${loc.id}" ${isDefault ? 'selected' : ''}>🏬 ${loc.name}</option>`;
    });

    // 2. Populate Brands Dropdown from Catalog
    const brandCounts = new Map();
    state.catalog.forEach(v => {
        const b = (v.products && v.products.brand ? v.products.brand.trim() : '') || 'Generic';
        brandCounts.set(b, (brandCounts.get(b) || 0) + 1);
    });

    const sortedBrands = Array.from(brandCounts.keys()).sort((a, b) => a.localeCompare(b));
    brandSelect.innerHTML = `<option value="ALL">All Brands (සියලු Brands)</option>`;
    sortedBrands.forEach(b => {
        brandSelect.innerHTML += `<option value="${b}">${b} (${brandCounts.get(b)})</option>`;
    });

    // 3. Populate Categories Dropdown from Catalog
    const catCounts = new Map();
    state.catalog.forEach(v => {
        const c = (v.products && v.products.category ? v.products.category.trim() : '') || 'General';
        catCounts.set(c, (catCounts.get(c) || 0) + 1);
    });

    const sortedCats = Array.from(catCounts.keys()).sort((a, b) => a.localeCompare(b));
    catSelect.innerHTML = `<option value="ALL">All Categories (සියලු කාණ්ඩ)</option>`;
    sortedCats.forEach(c => {
        catSelect.innerHTML += `<option value="${c}">${c} (${catCounts.get(c)})</option>`;
    });

    // Helper to update the print stock button label dynamically
    const updatePrintBtnLabel = () => {
        const btnLabel = document.getElementById('printStockBtnLabel');
        if (!btnLabel) return;
        const curLocId = state.reorder.selectedLocationId;
        if (curLocId === 'ALL') {
            btnLabel.textContent = 'Print Stock (All)';
        } else {
            const locObj = state.locations.find(l => l.id === curLocId);
            const shortName = locObj ? (locObj.name.length > 12 ? locObj.name.slice(0, 11) + '…' : locObj.name) : 'Branch';
            btnLabel.textContent = `Print Stock (${shortName})`;
        }
    };
    updatePrintBtnLabel();

    // 4. Attach Event Listeners (Once)
    if (!state.reorder.isInitialized) {
        state.reorder.isInitialized = true;

        locSelect.addEventListener('change', () => {
            state.reorder.selectedLocationId = locSelect.value;
            updatePrintBtnLabel();
            renderReorderCatalog();
            refreshReorderSheetStock();
        });

        brandSelect.addEventListener('change', () => {
            state.reorder.filterBrand = brandSelect.value;
            renderReorderCatalog();
        });

        catSelect.addEventListener('change', () => {
            state.reorder.filterCategory = catSelect.value;
            renderReorderCatalog();
        });

        statusSelect.addEventListener('change', () => {
            state.reorder.filterStatus = statusSelect.value;
            renderReorderCatalog();
        });

        let searchDebounce = null;
        searchInput.addEventListener('input', () => {
            if (clearSearchBtn) clearSearchBtn.style.display = searchInput.value ? 'block' : 'none';
            if (searchDebounce) clearTimeout(searchDebounce);
            searchDebounce = setTimeout(() => {
                state.reorder.searchQuery = searchInput.value.trim().toLowerCase();
                renderReorderCatalog();
            }, 180);
        });

        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', () => {
                searchInput.value = '';
                clearSearchBtn.style.display = 'none';
                state.reorder.searchQuery = '';
                renderReorderCatalog();
                searchInput.focus();
            });
        }

        document.getElementById('clearReorderSheetBtn')?.addEventListener('click', () => {
            if (state.reorder.orderSheet.size === 0) return;
            if (confirm("Clear all items in this Reorder Sheet?")) {
                state.reorder.orderSheet.clear();
                renderReorderSheet();
                renderReorderCatalog();
                showToast("Reorder Sheet cleared.", "info");
            }
        });

        document.getElementById('btnCopyWhatsApp')?.addEventListener('click', copyWhatsAppOrder);
        document.getElementById('btnDirectWhatsApp')?.addEventListener('click', directWhatsAppOrder);
        document.getElementById('btnPrintPO')?.addEventListener('click', printReorderPO);
        document.getElementById('btnExportCSV')?.addEventListener('click', exportReorderCSV);
        document.getElementById('btnExportCurrentStockCSV')?.addEventListener('click', openPrintStockModal);
        document.getElementById('btnPrintCurrentStockSheet')?.addEventListener('click', openPrintStockModal);
        document.getElementById('btnCopyCurrentStockWhatsApp')?.addEventListener('click', copyCurrentStockWhatsApp);
        document.getElementById('fillAllCurrentStockBtn')?.addEventListener('click', fillAllCurrentStockInSheet);

        // Branch Stock Print & Export Modal Events
        document.getElementById('closePrintStockModalBtn')?.addEventListener('click', closePrintStockModal);
        document.getElementById('printBranchStockModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'printBranchStockModal') closePrintStockModal();
        });

        document.getElementById('modalStockBranchSelect')?.addEventListener('change', updatePrintModalPreview);
        document.getElementById('modalStockBrandSelect')?.addEventListener('change', updatePrintModalPreview);
        document.getElementById('modalStockCategorySelect')?.addEventListener('change', updatePrintModalPreview);
        document.getElementById('modalStockStatusSelect')?.addEventListener('change', updatePrintModalPreview);

        document.getElementById('modalDoPrintSheetBtn')?.addEventListener('click', () => {
            const branch = document.getElementById('modalStockBranchSelect')?.value;
            const brand = document.getElementById('modalStockBrandSelect')?.value;
            const cat = document.getElementById('modalStockCategorySelect')?.value;
            const status = document.getElementById('modalStockStatusSelect')?.value;
            closePrintStockModal();
            printCurrentStockSheet(branch, brand, cat, status);
        });

        document.getElementById('modalDoExportCsvBtn')?.addEventListener('click', () => {
            const branch = document.getElementById('modalStockBranchSelect')?.value;
            const brand = document.getElementById('modalStockBrandSelect')?.value;
            const cat = document.getElementById('modalStockCategorySelect')?.value;
            const status = document.getElementById('modalStockStatusSelect')?.value;
            closePrintStockModal();
            exportCurrentStockCSV(branch, brand, cat, status);
        });

        document.getElementById('modalDoCopyWhatsAppBtn')?.addEventListener('click', () => {
            const branch = document.getElementById('modalStockBranchSelect')?.value;
            const brand = document.getElementById('modalStockBrandSelect')?.value;
            const cat = document.getElementById('modalStockCategorySelect')?.value;
            const status = document.getElementById('modalStockStatusSelect')?.value;
            closePrintStockModal();
            copyCurrentStockWhatsApp(branch, brand, cat, status);
        });

        const notesInput = document.getElementById('sheetSupplierNotes');
        if (notesInput) {
            notesInput.addEventListener('input', () => {
                state.reorder.supplierNotes = notesInput.value;
            });
        }
    }

    renderReorderCatalog();
    renderReorderSheet();
}

/**
 * Natural Size Sorter (handles numeric and alphanumeric sizes: 36, 37, 38... or 6, 7, 8... or S, M, L)
 */
function sortVariantsBySize(variants) {
    return [...variants].sort((a, b) => {
        const szA = (a.size || '').trim();
        const szB = (b.size || '').trim();
        const numA = parseFloat(szA);
        const numB = parseFloat(szB);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return szA.localeCompare(szB);
    });
}

function getVariantStock(variantId, locId) {
    if (locId === 'ALL') {
        let total = 0;
        state.locations.forEach(loc => {
            total += (state.stockMap.get(`${variantId}_${loc.id}`) || 0);
        });
        return total;
    }
    return state.stockMap.get(`${variantId}_${locId}`) || 0;
}

/**
 * Compute matching shoe models and stock counts based on active filters
 */
function getMatchingReorderModels(overrideBrand, overrideCat, overrideStatus, overrideQuery, overrideLocId) {
    const brand = overrideBrand !== undefined ? overrideBrand : state.reorder.filterBrand;
    const cat = overrideCat !== undefined ? overrideCat : state.reorder.filterCategory;
    const status = overrideStatus !== undefined ? overrideStatus : state.reorder.filterStatus;
    const q = overrideQuery !== undefined ? overrideQuery : state.reorder.searchQuery;
    const locId = overrideLocId !== undefined ? overrideLocId : state.reorder.selectedLocationId;

    let matchingModels = [];
    let needsOrderCount = 0;

    for (const [productId, variants] of state.productsMap.entries()) {
        if (!variants || variants.length === 0) continue;
        const p = variants[0].products || {};
        const pName = p.name || variants[0].sku || 'Shoe Model';
        const pBrand = p.brand || 'Generic';
        const pCat = p.category || 'General';

        // 1. Filter Brand
        if (brand !== 'ALL' && pBrand !== brand) continue;

        // 2. Filter Category
        if (cat !== 'ALL' && pCat !== cat) continue;

        // 3. Search query filter
        if (q) {
            const matchName = pName.toLowerCase().includes(q);
            const matchBrand = pBrand.toLowerCase().includes(q);
            const matchCat = pCat.toLowerCase().includes(q);
            const matchSku = variants.some(v => (v.sku && v.sku.toLowerCase().includes(q)) || (v.barcode && v.barcode.toLowerCase().includes(q)));
            const matchSize = variants.some(v => {
                const raw = (v.size || '').toLowerCase();
                const disp = getShoeDisplaySize(v.size, p).toLowerCase();
                return raw === q || disp.includes(q);
            });
            if (!matchName && !matchBrand && !matchCat && !matchSku && !matchSize) continue;
        }

        // Calculate size-wise stock
        let modelTotalStock = 0;
        let hasZeroStock = false;
        let hasLowStock = false;

        const sortedVars = sortVariantsBySize(variants).map(v => {
            const stock = getVariantStock(v.id, locId);
            modelTotalStock += stock;
            if (stock === 0) hasZeroStock = true;
            if (stock <= 2) hasLowStock = true;
            const displaySize = getShoeDisplaySize(v.size, p);
            return {
                ...v,
                displaySize: displaySize,
                stock: stock
            };
        });

        if (hasZeroStock) needsOrderCount++;

        // 4. Filter Status
        if (status === 'OUT_OF_STOCK' && !hasZeroStock) continue;
        if (status === 'LOW_STOCK' && !hasLowStock) continue;
        if (status === 'IN_STOCK' && hasLowStock) continue;

        matchingModels.push({
            productId: productId,
            name: pName,
            brand: pBrand,
            category: pCat,
            gender: p.gender || '',
            productObj: p,
            totalStock: modelTotalStock,
            hasZeroStock: hasZeroStock,
            hasLowStock: hasLowStock,
            sellingPrice: Number(variants[0].selling_price) || 0,
            costPrice: Number(variants[0].cost_price) || 0,
            variants: sortedVars
        });
    }

    return { matchingModels, needsOrderCount };
}

/**
 * Render the filtered catalog cards
 */
function renderReorderCatalog() {
    const listEl = document.getElementById('reorderCatalogList');
    const totalStylesTag = document.getElementById('reorderTotalStylesCount');
    const needsOrderTag = document.getElementById('reorderNeedsOrderCount');
    const filterStatsTag = document.getElementById('reorderFilterStatsTag');

    if (!listEl) return;

    const { matchingModels, needsOrderCount } = getMatchingReorderModels();

    // Update Counts
    if (totalStylesTag) totalStylesTag.innerHTML = `Styles: <strong>${matchingModels.length}</strong>`;
    if (needsOrderTag) needsOrderTag.innerHTML = `Needs Reorder: <strong>${needsOrderCount}</strong>`;
    if (filterStatsTag) filterStatsTag.textContent = `Showing ${matchingModels.length} of ${state.productsMap.size} styles`;

    // Render Cards
    if (matchingModels.length === 0) {
        listEl.innerHTML = `
            <div style="text-align: center; padding: 3rem 1rem; color: var(--text-dim);">
                <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">🔍</div>
                <div style="font-weight: 600; color: var(--text-muted); font-size: 0.95rem;">No matching shoe models found</div>
                <div style="font-size: 0.8rem; margin-top: 0.25rem;">Try changing your Brand, Category, or Search keyword.</div>
            </div>
        `;
        return;
    }

    let html = '';
    matchingModels.forEach(m => {
        const inSheet = state.reorder.orderSheet.has(m.productId);

        let sizePillsHtml = '';
        m.variants.forEach(v => {
            let statusCls = 'good-stock';
            if (v.stock === 0) statusCls = 'out-stock';
            else if (v.stock <= 2) statusCls = 'low-stock';

            const dispSz = v.displaySize || getShoeDisplaySize(v.size, v.products || m.productObj);
            sizePillsHtml += `
                <div class="size-stock-box ${statusCls}" title="Size ${dispSz}: ${v.stock} in stock">
                    <span class="sz-label">Sz ${dispSz}</span>
                    <span class="sz-qty">${v.stock}</span>
                </div>
            `;
        });

        html += `
            <div class="reorder-model-card ${inSheet ? 'in-sheet' : ''}" data-product-id="${m.productId}" onclick="window._reorderHub.toggleCode('${m.productId}')">
                <div class="model-card-top">
                    <div class="model-title-wrap">
                        <h4>${m.name}</h4>
                        <div class="model-meta-row">
                            <span class="brand-badge">${m.brand}</span>
                            <span class="category-tag">${m.category}</span>
                            <span class="price-tag">• Sell: Rs. ${m.sellingPrice.toLocaleString()}</span>
                            ${m.costPrice > 0 ? `<span class="price-tag" style="color:#64748b;">(Cost: Rs. ${m.costPrice.toLocaleString()})</span>` : ''}
                        </div>
                    </div>
                    <div class="model-card-stock-sum">
                        <span>Total: <strong>${m.totalStock} prs</strong></span>
                    </div>
                </div>

                <!-- Size Run Strip -->
                <div class="size-run-strip">
                    ${sizePillsHtml}
                </div>

                <div class="model-card-actions">
                    ${m.totalStock > 0 ? `
                    <button type="button" class="btn-card-transfer" onclick="event.stopPropagation(); window._reorderHub.sendToTransfer('${m.productId}')" title="Move available stock (${m.totalStock} prs) to Transfer Batch">
                        <span>🚚</span> Transfer Stock (${m.totalStock} prs)
                    </button>
                    ` : ''}
                    <button type="button" class="btn-add-to-sheet" onclick="event.stopPropagation(); window._reorderHub.addCode('${m.productId}')">
                        ${inSheet ? '✓ Selected in Order Sheet' : '➕ Add to Reorder'}
                    </button>
                </div>
            </div>
        `;
    });

    listEl.innerHTML = html;
}

/**
 * Add a shoe model to the Reorder Form (Order Sheet)
 */
function addCodeToReorder(productId) {
    if (state.reorder.orderSheet.has(productId)) {
        // Already in sheet: highlight it
        showToast("Already in Reorder Sheet. Adjust sizes on the right panel.", "info");
        const elItem = document.getElementById(`sheetItem_${productId}`);
        if (elItem && typeof elItem.scrollIntoView === "function") elItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
    }

    const variants = state.productsMap.get(productId);
    if (!variants || variants.length === 0) return;

    const p = variants[0].products || {};
    const pName = p.name || variants[0].sku || 'Shoe Model';
    const pBrand = p.brand || 'Generic';
    const pCat = p.category || 'General';
    const locId = state.reorder.selectedLocationId;

    const sortedVars = sortVariantsBySize(variants);

    const sheetItem = {
        productId: productId,
        name: pName,
        brand: pBrand,
        category: pCat,
        sellingPrice: Number(variants[0].selling_price) || 0,
        costPrice: Number(variants[0].cost_price) || 0,
        variants: sortedVars.map(v => {
            const stock = getVariantStock(v.id, locId);
            return {
                variantId: v.id,
                sku: v.sku,
                size: v.size || '-',
                displaySize: getShoeDisplaySize(v.size, p),
                colour: v.colour || '-',
                currentStock: stock,
                costPrice: Number(v.cost_price) || Number(variants[0].cost_price) || 0,
                // Intelligent suggestion: if 0 stock, suggest 3 pairs; if low stock, suggest 2 pairs; else 0
                orderQty: stock === 0 ? 3 : (stock <= 2 ? 2 : 0)
            };
        })
    };

    state.reorder.orderSheet.set(productId, sheetItem);

    renderReorderSheet();
    renderReorderCatalog();

    if (typeof SoundEffects !== 'undefined' && SoundEffects.playPop) {
        SoundEffects.playPop();
    }

    showToast(`Added ${sheetItem.brand} ${sheetItem.name} to Reorder Form!`, "success");

    // Scroll new sheet item into view
    setTimeout(() => {
        const elItem = document.getElementById(`sheetItem_${productId}`);
        if (elItem && typeof elItem.scrollIntoView === "function") elItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
}

function removeCodeFromReorder(productId) {
    state.reorder.orderSheet.delete(productId);
    renderReorderSheet();
    renderReorderCatalog();
    showToast("Model removed from Reorder Sheet.", "info");
}

function toggleCodeInReorder(productId) {
    if (state.reorder.orderSheet.has(productId)) {
        removeCodeFromReorder(productId);
    } else {
        addCodeToReorder(productId);
    }
}

/**
 * Update stock counts of existing items in the order sheet if location changes
 */
function refreshReorderSheetStock() {
    const locId = state.reorder.selectedLocationId;
    for (const [productId, sheetItem] of state.reorder.orderSheet.entries()) {
        sheetItem.variants.forEach(v => {
            v.currentStock = getVariantStock(v.variantId, locId);
        });
    }
    renderReorderSheet();
}

/**
 * Stepper qty update for a specific size
 */
function updateSizeOrderQty(productId, variantId, delta, absoluteVal = null) {
    const sheetItem = state.reorder.orderSheet.get(productId);
    if (!sheetItem) return;

    const v = sheetItem.variants.find(x => x.variantId === variantId);
    if (!v) return;

    if (absoluteVal !== null) {
        v.orderQty = Math.max(0, parseInt(absoluteVal) || 0);
    } else {
        v.orderQty = Math.max(0, (v.orderQty || 0) + delta);
    }

    renderReorderSheet();
}

/**
 * Quick Preset: Fill all sizes with 0 stock to target quantity (e.g. 3 pairs)
 */
function fillZeroStockForModel(productId, targetQty = 3) {
    const sheetItem = state.reorder.orderSheet.get(productId);
    if (!sheetItem) return;

    let filledCount = 0;
    sheetItem.variants.forEach(v => {
        if (v.currentStock === 0) {
            v.orderQty = targetQty;
            filledCount++;
        }
    });

    renderReorderSheet();
    showToast(`Set ${targetQty} pairs for ${filledCount} out-of-stock size(s)!`, "success");
}

/**
 * Quick Preset: Add +1 pair to all sizes
 */
function addOneToAllSizes(productId) {
    const sheetItem = state.reorder.orderSheet.get(productId);
    if (!sheetItem) return;

    sheetItem.variants.forEach(v => {
        v.orderQty = (v.orderQty || 0) + 1;
    });

    renderReorderSheet();
    showToast("Added +1 pair to all sizes", "info");
}

/**
 * Quick Preset: Set order quantities to match currently available stock for this model
 */
function fillCurrentStockForModel(productId) {
    const sheetItem = state.reorder.orderSheet.get(productId);
    if (!sheetItem) return;

    let totalCopied = 0;
    sheetItem.variants.forEach(v => {
        v.orderQty = Math.max(0, v.currentStock || 0);
        totalCopied += v.orderQty;
    });

    renderReorderSheet();
    showToast(`Copied current stock (${totalCopied} pairs) as order quantity!`, "success");
}

/**
 * Quick Preset: Reset all order quantities for this model to 0
 */
function zeroAllForModel(productId) {
    const sheetItem = state.reorder.orderSheet.get(productId);
    if (!sheetItem) return;

    sheetItem.variants.forEach(v => {
        v.orderQty = 0;
    });

    renderReorderSheet();
    showToast("Reset order quantities to 0", "info");
}

/**
 * Quick Preset: Match Current Stock for all items in order sheet
 */
function fillAllCurrentStockInSheet() {
    if (state.reorder.orderSheet.size === 0) return;
    let total = 0;
    for (const [productId, sheetItem] of state.reorder.orderSheet.entries()) {
        sheetItem.variants.forEach(v => {
            v.orderQty = Math.max(0, v.currentStock || 0);
            total += v.orderQty;
        });
    }
    renderReorderSheet();
    showToast(`Matched current stock (${total} pairs) across all models in sheet!`, "success");
}

/**
 * Transfer currently available stock of a shoe model to the Transfer Batch
 */
function sendModelToTransfer(productId) {
    const variants = state.productsMap.get(productId);
    if (!variants || variants.length === 0) return;

    const locId = state.reorder.selectedLocationId !== 'ALL' 
        ? state.reorder.selectedLocationId 
        : (el.fromBranch ? el.fromBranch.value : state.locations[0]?.id);
    
    const locObj = state.locations.find(l => l.id === locId);
    const branchName = locObj ? locObj.name : "Dispatch Branch";

    if (el.fromBranch && locId !== 'ALL') {
        el.fromBranch.value = locId;
        updateRouteHeader();
        updateBranchStockTotals();
        renderCustomDropdownMenus();
    }

    let addedCount = 0;
    let addedPairs = 0;

    variants.forEach(v => {
        const available = getStock(v.id, locId);
        if (available > 0) {
            addItemDirectlyToCart(v, available);
            addedCount++;
            addedPairs += available;
        }
    });

    if (addedCount === 0) {
        showToast(`No stock currently available for this model at ${branchName}!`, "warning");
        SoundFx.playWarningBuzz();
        return;
    }

    SoundFx.playSuccessChime();
    showToast(`Added ${addedPairs} pairs (${addedCount} sizes) to Transfer Batch!`, "success");

    if (typeof window.switchHubTab === 'function') {
        window.switchHubTab('transfer');
    }
}

/**
 * Render the Right Panel Reorder Sheet
 */
function renderReorderSheet() {
    const emptyState = document.getElementById('sheetEmptyState');
    const itemsList = document.getElementById('sheetItemsList');
    const footer = document.getElementById('sheetFooter');
    const subTitle = document.getElementById('sheetSubTitle');
    const fillAllBtn = document.getElementById('fillAllCurrentStockBtn');

    const summaryModels = document.getElementById('sheetSummaryModels');
    const summaryPairs = document.getElementById('sheetSummaryPairs');
    const summaryCost = document.getElementById('sheetSummaryCost');

    if (!itemsList) return;

    const count = state.reorder.orderSheet.size;
    if (fillAllBtn) fillAllBtn.style.display = count > 0 ? 'inline-flex' : 'none';

    if (count === 0) {
        if (emptyState) emptyState.style.display = 'block';
        if (itemsList) itemsList.style.display = 'none';
        if (footer) footer.style.display = 'none';
        if (subTitle) subTitle.textContent = "0 Models • 0 Total Pairs";
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (itemsList) itemsList.style.display = 'flex';
    if (footer) footer.style.display = 'flex';

    let totalPairs = 0;
    let totalCost = 0;
    let html = '';

    for (const [productId, item] of state.reorder.orderSheet.entries()) {
        let modelPairs = 0;
        let modelCost = 0;

        let sizeCellsHtml = '';
        item.variants.forEach(v => {
            const qty = v.orderQty || 0;
            modelPairs += qty;
            modelCost += (qty * (v.costPrice || 0));

            sizeCellsHtml += `
                <div class="sheet-size-cell">
                    <span class="cell-sz">Sz ${v.displaySize || v.size}</span>
                    <span class="cell-stock-tag ${v.currentStock === 0 ? 'zero' : ''}" title="Click to use current stock (${v.currentStock}) as order qty" onclick="window._reorderHub.setQty('${productId}', '${v.variantId}', ${v.currentStock})">${v.currentStock} in st.</span>
                    <div class="stepper-wrap">
                        <button type="button" class="btn-step" onclick="window._reorderHub.stepQty('${productId}', '${v.variantId}', -1)">-</button>
                        <input 
                            type="number" 
                            class="stepper-input" 
                            min="0" 
                            value="${qty}" 
                            onchange="window._reorderHub.setQty('${productId}', '${v.variantId}', this.value)"
                            onfocus="this.select()"
                        >
                        <button type="button" class="btn-step" onclick="window._reorderHub.stepQty('${productId}', '${v.variantId}', 1)">+</button>
                    </div>
                </div>
            `;
        });

        totalPairs += modelPairs;
        totalCost += modelCost;

        html += `
            <div class="sheet-item-card" id="sheetItem_${productId}">
                <div class="sheet-item-header">
                    <div>
                        <div class="sheet-item-name">
                            <span class="brand-badge">${item.brand}</span> ${item.name}
                        </div>
                        <small style="color:var(--text-dim); font-size:0.75rem;">
                            ${item.category} • Cost: Rs. ${item.costPrice.toLocaleString()} • Subtotal: <strong>${modelPairs} prs</strong> (Rs. ${modelCost.toLocaleString()})
                        </small>
                    </div>
                    <div class="sheet-item-quick-tools">
                        <button type="button" class="btn-sheet-tool" title="Set 3 pairs for 0-stock sizes" onclick="window._reorderHub.fillZeroStock('${productId}', 3)">⚡ 0-Stock (3)</button>
                        <button type="button" class="btn-sheet-tool stock" title="Set order quantities to match current stock" onclick="window._reorderHub.fillCurrentStock('${productId}')">📦 Current Stock</button>
                        <button type="button" class="btn-sheet-tool" title="Add 1 to all sizes" onclick="window._reorderHub.addOneAll('${productId}')">+1 All</button>
                        <button type="button" class="btn-sheet-tool zero" title="Reset all quantities to 0" onclick="window._reorderHub.zeroAll('${productId}')">0</button>
                        <button type="button" class="btn-sheet-tool danger" title="Remove this model" onclick="window._reorderHub.removeCode('${productId}')">✕</button>
                    </div>
                </div>

                <div class="sheet-size-grid">
                    ${sizeCellsHtml}
                </div>
            </div>
        `;
    }

    itemsList.innerHTML = html;

    if (subTitle) subTitle.textContent = `${count} Models • ${totalPairs} Total Pairs`;
    if (summaryModels) summaryModels.textContent = count;
    if (summaryPairs) summaryPairs.textContent = `${totalPairs} prs`;
    if (summaryCost) summaryCost.textContent = `Rs. ${totalCost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
}

/**
 * Generate formatted WhatsApp order text
 */
function buildWhatsAppMessage() {
    if (state.reorder.orderSheet.size === 0) return null;

    const locSelect = document.getElementById('reorderLocationSelect');
    const branchName = locSelect ? locSelect.options[locSelect.selectedIndex].text.replace(/^[^\w\s]+/, '').trim() : 'Fashion Feet Store';
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB') + ' ' + now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const notes = (state.reorder.supplierNotes || '').trim();

    let totalPairs = 0;
    let totalCost = 0;
    let lines = [];

    let idx = 1;
    for (const [productId, item] of state.reorder.orderSheet.entries()) {
        const orderedSizes = item.variants.filter(v => (v.orderQty || 0) > 0);
        if (orderedSizes.length === 0) continue;

        let modelPairs = 0;
        let sizeRows = [];
        orderedSizes.forEach(v => {
            modelPairs += v.orderQty;
            totalCost += (v.orderQty * (v.costPrice || 0));
            sizeRows.push(`   • Size ${v.displaySize || v.size} : *${v.orderQty} pairs* (Stock: ${v.currentStock})`);
        });

        totalPairs += modelPairs;

        lines.push(`👟 *${idx}. ${item.brand.toUpperCase()} — ${item.name}* (${item.category})\n${sizeRows.join('\n')}\n   _Model Subtotal: ${modelPairs} Pairs_`);
        idx++;
    }

    if (lines.length === 0) return null;

    let msg = `📦 *FASHION FEET — FOOTWEAR REORDER SHEET*\n`;
    msg += `📅 Date: ${dateStr}\n`;
    msg += `🏬 Branch: ${branchName}\n`;
    if (notes) msg += `📝 Notes: ${notes}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += lines.join('\n\n') + '\n\n';
    msg += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📊 *TOTAL REORDER: ${totalPairs} PAIRS*\n`;
    if (totalCost > 0) {
        msg += `💰 *ESTIMATED COST: LKR ${totalCost.toLocaleString(undefined, {minimumFractionDigits: 2})}*\n`;
    }
    msg += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `_Generated via Fashion Feet Inventory Hub_`;

    return { text: msg, totalPairs: totalPairs };
}

function copyWhatsAppOrder() {
    const data = buildWhatsAppMessage();
    if (!data) {
        showToast("Please enter order quantities (> 0) for at least one size.", "warning");
        return;
    }

    navigator.clipboard.writeText(data.text).then(() => {
        showToast(`WhatsApp Order copied to clipboard! (${data.totalPairs} Pairs)`, "success");
    }).catch(err => {
        console.error("Clipboard error:", err);
        showToast("Failed to copy. Please select and copy manually.", "error");
    });
}

function directWhatsAppOrder() {
    const data = buildWhatsAppMessage();
    if (!data) {
        showToast("Please enter order quantities (> 0) for at least one size.", "warning");
        return;
    }

    const url = `https://wa.me/?text=${encodeURIComponent(data.text)}`;
    window.open(url, '_blank');
}

/**
 * Print Purchase Order Sheet
 */
function printReorderPO() {
    const data = buildWhatsAppMessage();
    if (!data) {
        showToast("Please enter order quantities (> 0) for at least one size.", "warning");
        return;
    }

    const locSelect = document.getElementById('reorderLocationSelect');
    const branchName = locSelect ? locSelect.options[locSelect.selectedIndex].text.replace(/^[^\w\s]+/, '').trim() : 'Fashion Feet Store';
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB') + ' ' + now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const notes = (state.reorder.supplierNotes || '').trim();

    let rowsHtml = '';
    let totalPairs = 0;
    let totalCost = 0;

    for (const [productId, item] of state.reorder.orderSheet.entries()) {
        const orderedSizes = item.variants.filter(v => (v.orderQty || 0) > 0);
        orderedSizes.forEach(v => {
            const lineCost = v.orderQty * (v.costPrice || 0);
            totalPairs += v.orderQty;
            totalCost += lineCost;

            rowsHtml += `
                <tr>
                    <td><strong>${item.brand}</strong> - ${item.name}</td>
                    <td>${item.category}</td>
                    <td style="text-align:center; font-weight:bold;">${v.displaySize || v.size}</td>
                    <td style="text-align:center;">${v.currentStock}</td>
                    <td style="text-align:center; font-weight:bold; font-size:1.05rem;">${v.orderQty}</td>
                    <td style="text-align:right;">Rs. ${(v.costPrice || 0).toLocaleString()}</td>
                    <td style="text-align:right; font-weight:bold;">Rs. ${lineCost.toLocaleString()}</td>
                </tr>
            `;
        });
    }

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Fashion Feet — Purchase Reorder Voucher</title>
            <style>
                body { font-family: 'Inter', sans-serif; padding: 25px; color: #1e293b; line-height: 1.5; }
                .po-header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
                .po-title { font-size: 22px; font-weight: 800; text-transform: uppercase; color: #0f172a; }
                .meta-table { width: 100%; margin-bottom: 20px; font-size: 14px; }
                .meta-table td { padding: 4px 0; }
                table.items { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px; }
                table.items th, table.items td { border: 1px solid #cbd5e1; padding: 8px 10px; }
                table.items th { background: #f1f5f9; text-transform: uppercase; font-size: 11px; }
                .total-box { margin-top: 25px; border-top: 2px solid #0f172a; padding-top: 12px; display: flex; justify-content: space-between; font-size: 16px; font-weight: bold; }
                .sig-box { margin-top: 50px; display: flex; justify-content: space-between; font-size: 12px; }
                .sig-line { width: 180px; border-top: 1px dashed #64748b; text-align: center; padding-top: 5px; }
                @media print { .no-print { display: none; } }
            </style>
        </head>
        <body>
            <div class="po-header">
                <div>
                    <div class="po-title">👟 Fashion Feet — Purchase Reorder Sheet</div>
                    <div>Footwear Supply & Reordering Note</div>
                </div>
                <div style="text-align: right; font-size: 13px;">
                    <div>Date: <strong>${dateStr}</strong></div>
                    <div>Location: <strong>${branchName}</strong></div>
                </div>
            </div>

            ${notes ? `<div style="background:#f8fafc; padding:8px 12px; border-radius:6px; margin-bottom:15px; font-size:13px;"><strong>Supplier / Notes:</strong> ${notes}</div>` : ''}

            <table class="items">
                <thead>
                    <tr>
                        <th>Brand & Model Code</th>
                        <th>Category</th>
                        <th style="text-align:center;">Size</th>
                        <th style="text-align:center;">Current Stock</th>
                        <th style="text-align:center;">Reorder Qty</th>
                        <th style="text-align:right;">Unit Cost</th>
                        <th style="text-align:right;">Total Cost</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>

            <div class="total-box">
                <div>Total Reorder Pairs: <span style="font-size:20px; color:#0284c7;">${totalPairs} Pairs</span></div>
                <div>Estimated Total Cost: <span style="font-size:20px; color:#16a34a;">Rs. ${totalCost.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
            </div>

            <div class="sig-box">
                <div class="sig-line">Prepared By (Staff)</div>
                <div class="sig-line">Store Manager Approval</div>
                <div class="sig-line">Supplier Confirmation</div>
            </div>

            <script>
                window.onload = function() { window.print(); }
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

/**
 * Export Reorder Sheet to CSV / Excel
 */
function exportReorderCSV() {
    if (state.reorder.orderSheet.size === 0) {
        showToast("Reorder Sheet is empty.", "warning");
        return;
    }

    let csv = "Brand,Model Code,Category,Size,Current Stock,Order Qty,Unit Cost,Line Total Cost\n";
    let hasItems = false;

    for (const [productId, item] of state.reorder.orderSheet.entries()) {
        const orderedSizes = item.variants.filter(v => (v.orderQty || 0) > 0);
        orderedSizes.forEach(v => {
            hasItems = true;
            const lineCost = v.orderQty * (v.costPrice || 0);
            csv += `"${item.brand}","${item.name}","${item.category}","${v.displaySize || v.size}",${v.currentStock},${v.orderQty},${v.costPrice || 0},${lineCost}\n`;
        });
    }

    if (!hasItems) {
        showToast("Please enter quantities (> 0) to export.", "warning");
        return;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `FashionFeet_Reorder_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Reorder Sheet exported to CSV!", "success");
}

/**
 * Branch Stock Print & Export Modal Controls
 */
function openPrintStockModal() {
    const modal = document.getElementById('printBranchStockModal');
    if (!modal) return;

    const modalBranchSelect = document.getElementById('modalStockBranchSelect');
    const modalBrandSelect = document.getElementById('modalStockBrandSelect');
    const modalCatSelect = document.getElementById('modalStockCategorySelect');
    const modalStatusSelect = document.getElementById('modalStockStatusSelect');

    if (modalBranchSelect) {
        modalBranchSelect.innerHTML = `<option value="ALL">🌐 All Branches Combined (සියලු ශාඛා)</option>`;
        state.locations.forEach(loc => {
            const isSelected = loc.id === state.reorder.selectedLocationId;
            modalBranchSelect.innerHTML += `<option value="${loc.id}" ${isSelected ? 'selected' : ''}>🏬 ${loc.name}</option>`;
        });
        if (state.reorder.selectedLocationId === 'ALL') {
            modalBranchSelect.value = 'ALL';
        }
    }

    if (modalBrandSelect) {
        const brandCounts = new Map();
        state.catalog.forEach(v => {
            const b = (v.products && v.products.brand ? v.products.brand.trim() : '') || 'Generic';
            brandCounts.set(b, (brandCounts.get(b) || 0) + 1);
        });
        const sortedBrands = Array.from(brandCounts.keys()).sort((a, b) => a.localeCompare(b));
        modalBrandSelect.innerHTML = `<option value="ALL">All Brands (සියල්ල)</option>`;
        sortedBrands.forEach(b => {
            const isSelected = b === state.reorder.filterBrand;
            modalBrandSelect.innerHTML += `<option value="${b}" ${isSelected ? 'selected' : ''}>${b}</option>`;
        });
    }

    if (modalCatSelect) {
        const catCounts = new Map();
        state.catalog.forEach(v => {
            const c = (v.products && v.products.category ? v.products.category.trim() : '') || 'General';
            catCounts.set(c, (catCounts.get(c) || 0) + 1);
        });
        const sortedCats = Array.from(catCounts.keys()).sort((a, b) => a.localeCompare(b));
        modalCatSelect.innerHTML = `<option value="ALL">All Categories (සියල්ල)</option>`;
        sortedCats.forEach(c => {
            const isSelected = c === state.reorder.filterCategory;
            modalCatSelect.innerHTML += `<option value="${c}" ${isSelected ? 'selected' : ''}>${c}</option>`;
        });
    }

    if (modalStatusSelect) {
        modalStatusSelect.value = state.reorder.filterStatus || 'ALL';
    }

    updatePrintModalPreview();
    modal.style.display = 'flex';
}

function closePrintStockModal() {
    const modal = document.getElementById('printBranchStockModal');
    if (modal) modal.style.display = 'none';
}

function updatePrintModalPreview() {
    const branchSelect = document.getElementById('modalStockBranchSelect');
    const brandSelect = document.getElementById('modalStockBrandSelect');
    const catSelect = document.getElementById('modalStockCategorySelect');
    const statusSelect = document.getElementById('modalStockStatusSelect');

    const locId = branchSelect ? branchSelect.value : state.reorder.selectedLocationId;
    const brand = brandSelect ? brandSelect.value : 'ALL';
    const cat = catSelect ? catSelect.value : 'ALL';
    const status = statusSelect ? statusSelect.value : 'ALL';

    const locObj = state.locations.find(l => l.id === locId);
    const branchName = locId === 'ALL' ? 'All Branches' : (locObj ? locObj.name : 'Branch');

    const { matchingModels } = getMatchingReorderModels(brand, cat, status, undefined, locId);

    let totalPairs = 0;
    let totalRetail = 0;
    matchingModels.forEach(m => {
        totalPairs += m.totalStock;
        totalRetail += (m.totalStock * m.sellingPrice);
    });

    const nameEl = document.getElementById('modalPreviewBranchName');
    const modelsEl = document.getElementById('modalPreviewModelsCount');
    const pairsEl = document.getElementById('modalPreviewTotalPairs');
    const retailEl = document.getElementById('modalPreviewRetailVal');

    if (nameEl) nameEl.textContent = branchName;
    if (modelsEl) modelsEl.textContent = `${matchingModels.length} Styles`;
    if (pairsEl) pairsEl.textContent = `${totalPairs} Pairs`;
    if (retailEl) retailEl.textContent = `Rs. ${totalRetail.toLocaleString()}`;
}

/**
 * Export Current Live Stock of filtered shoe models to CSV / Excel
 */
function exportCurrentStockCSV(targetLocId, targetBrand, targetCat, targetStatus) {
    const locId = targetLocId !== undefined ? targetLocId : state.reorder.selectedLocationId;
    const brand = targetBrand !== undefined ? targetBrand : state.reorder.filterBrand;
    const cat = targetCat !== undefined ? targetCat : state.reorder.filterCategory;
    const status = targetStatus !== undefined ? targetStatus : state.reorder.filterStatus;

    const locObj = state.locations.find(l => l.id === locId);
    const branchName = locId === 'ALL' ? 'All_Branches' : (locObj ? locObj.name.replace(/[^a-zA-Z0-9_-]/g, '_') : 'Branch');
    const branchDisplay = locId === 'ALL' ? 'All Branches Combined' : (locObj ? locObj.name : 'Branch');
    
    const { matchingModels } = getMatchingReorderModels(brand, cat, status, undefined, locId);
    if (!matchingModels || matchingModels.length === 0) {
        showToast(`No shoe models found for ${branchDisplay} with current filters.`, "warning");
        return;
    }

    let csv = "Branch,Brand,Article_Code,Category,Size,Current_Stock_Pairs,Barcode,Unit_Cost,Selling_Price,Retail_Stock_Value,Cost_Stock_Value\n";
    let grandTotalPairs = 0;
    let grandTotalRetail = 0;
    let grandTotalCost = 0;

    matchingModels.forEach(m => {
        m.variants.forEach(v => {
            const stock = v.stock || 0;
            const retailVal = stock * (m.sellingPrice || 0);
            const costVal = stock * (m.costPrice || 0);
            grandTotalPairs += stock;
            grandTotalRetail += retailVal;
            grandTotalCost += costVal;

            csv += `"${branchDisplay}","${m.brand}","${m.name}","${m.category}","${v.displaySize || v.size || '-'}","${stock}","${v.barcode || ''}",${m.costPrice || 0},${m.sellingPrice || 0},${retailVal},${costVal}\n`;
        });
    });

    csv += `\n"TOTAL","","${matchingModels.length} Models","","","${grandTotalPairs} Pairs","","","",${grandTotalRetail},${grandTotalCost}\n`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `FashionFeet_Stock_${branchName}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Stock CSV for ${branchDisplay} exported! (${grandTotalPairs} pairs)`, "success");
}

/**
 * Print Live Stock Inventory Sheet
 */
function printCurrentStockSheet(targetLocId, targetBrand, targetCat, targetStatus) {
    const locId = targetLocId !== undefined ? targetLocId : state.reorder.selectedLocationId;
    const brand = targetBrand !== undefined ? targetBrand : state.reorder.filterBrand;
    const cat = targetCat !== undefined ? targetCat : state.reorder.filterCategory;
    const status = targetStatus !== undefined ? targetStatus : state.reorder.filterStatus;

    const locObj = state.locations.find(l => l.id === locId);
    const branchName = locId === 'ALL' ? 'All Branches Combined' : (locObj ? locObj.name : 'Branch');
    
    const { matchingModels } = getMatchingReorderModels(brand, cat, status, undefined, locId);
    if (!matchingModels || matchingModels.length === 0) {
        showToast(`No shoe models found for ${branchName} with current filters.`, "warning");
        return;
    }

    const printWindow = window.open('', '_blank', 'width=950,height=750');
    if (!printWindow) {
        alert("Please allow popups to print Current Stock Sheet.");
        return;
    }

    const dateStr = new Date().toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
    });

    let grandTotalPairs = 0;
    let grandTotalRetail = 0;

    let rowsHtml = '';
    matchingModels.forEach(m => {
        grandTotalPairs += m.totalStock;
        grandTotalRetail += (m.totalStock * m.sellingPrice);

        const sizeChips = m.variants.map(v => {
            const isZero = v.stock === 0;
            const isLow = v.stock <= 2 && v.stock > 0;
            const color = isZero ? '#dc2626' : (isLow ? '#d97706' : '#16a34a');
            return `<span style="display:inline-block; margin:2px 4px; padding:2px 6px; border:1px solid #cbd5e1; border-radius:4px; font-size:11px; background:${isZero ? '#fef2f2' : '#f8fafc'};">
                <span style="color:#64748b;">${v.displaySize || v.size}:</span> <strong style="color:${color}; font-size:12px;">${v.stock}</strong>
            </span>`;
        }).join('');

        rowsHtml += `
            <tr style="border-bottom:1px solid #e2e8f0;">
                <td style="padding:8px 10px;">
                    <div style="font-weight:700; color:#0f172a; font-size:13px;">${m.name}</div>
                    <div style="font-size:11px; color:#64748b;">${m.brand} • ${m.category}</div>
                </td>
                <td style="padding:8px 10px;">${sizeChips}</td>
                <td style="padding:8px 10px; text-align:center; font-weight:700; font-size:13px;">${m.totalStock} prs</td>
                <td style="padding:8px 10px; text-align:right; font-size:12px;">Rs. ${m.sellingPrice.toLocaleString()}</td>
                <td style="padding:8px 10px; text-align:right; font-weight:700; font-size:12px; color:#0284c7;">Rs. ${(m.totalStock * m.sellingPrice).toLocaleString()}</td>
            </tr>
        `;
    });

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Fashion Feet — Live Stock Inventory Report (${branchName})</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 20px; color: #1e293b; }
                .report-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
                .report-title { font-size: 20px; font-weight: 800; color: #4338ca; text-transform: uppercase; letter-spacing: 0.5px; }
                .report-sub { font-size: 13px; color: #64748b; margin-top: 3px; }
                .meta-col { text-align: right; font-size: 12px; line-height: 1.5; }
                .branch-pill { display: inline-block; background: #e0e7ff; color: #3730a3; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 13px; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th { background: #f1f5f9; padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; color: #475569; border-bottom: 2px solid #cbd5e1; }
                .total-bar { display: flex; justify-content: space-between; background: #e0e7ff; padding: 12px 16px; border-radius: 6px; margin-top: 20px; font-weight: 700; font-size: 14px; }
                .sig-row { display: flex; justify-content: space-between; margin-top: 40px; padding-top: 10px; }
                .sig-box { width: 30%; text-align: center; border-top: 1px dashed #94a3b8; font-size: 11px; color: #64748b; padding-top: 6px; }
                @media print { body { margin: 10mm; } }
            </style>
        </head>
        <body>
            <div class="report-header">
                <div>
                    <div class="report-title">👟 FASHION FEET — LIVE STOCK INVENTORY REPORT</div>
                    <div class="report-sub">Real-Time Branch Stock Matrix & Valuation Sheet</div>
                </div>
                <div class="meta-col">
                    <div><strong>Branch:</strong> <span class="branch-pill">🏬 ${branchName}</span></div>
                    <div><strong>Date & Time:</strong> ${dateStr}</div>
                    <div><strong>Filter:</strong> ${brand !== 'ALL' ? brand : 'All Brands'} • ${cat !== 'ALL' ? cat : 'All Categories'} • ${status !== 'ALL' ? status : 'All Levels'}</div>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th style="width:25%;">Shoe Model / Code</th>
                        <th style="width:45%;">Size Stock Breakdown</th>
                        <th style="width:10%; text-align:center;">Total Qty</th>
                        <th style="width:10%; text-align:right;">Sell Price</th>
                        <th style="width:10%; text-align:right;">Stock Value</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>

            <div class="total-bar">
                <div>Total Styles: <strong>${matchingModels.length} Models</strong></div>
                <div>Total Pairs in Stock: <strong style="color:#4338ca; font-size:16px;">${grandTotalPairs} Pairs</strong></div>
                <div>Total Retail Inventory Value: <strong style="color:#15803d; font-size:16px;">Rs. ${grandTotalRetail.toLocaleString()}</strong></div>
            </div>

            <div class="sig-row">
                <div class="sig-box">Audited By (Stock Keeper)</div>
                <div class="sig-box">Showroom Manager Approval</div>
                <div class="sig-box">Head Office Inventory Sync</div>
            </div>

            <script>
                window.onload = function() { window.print(); }
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

/**
 * Copy Current Stock Summary to WhatsApp
 */
function copyCurrentStockWhatsApp(targetLocId, targetBrand, targetCat, targetStatus) {
    const locId = targetLocId !== undefined ? targetLocId : state.reorder.selectedLocationId;
    const brand = targetBrand !== undefined ? targetBrand : state.reorder.filterBrand;
    const cat = targetCat !== undefined ? targetCat : state.reorder.filterCategory;
    const status = targetStatus !== undefined ? targetStatus : state.reorder.filterStatus;

    const locObj = state.locations.find(l => l.id === locId);
    const branchName = locId === 'ALL' ? 'All Branches Combined' : (locObj ? locObj.name : 'Branch');
    
    const { matchingModels } = getMatchingReorderModels(brand, cat, status, undefined, locId);
    if (!matchingModels || matchingModels.length === 0) {
        showToast(`No shoe models found for ${branchName} with current filters.`, "warning");
        return;
    }

    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    let totalPairs = 0;

    let text = `👟 *FASHION FEET — CURRENT STOCK LIST*\n`;
    text += `🏬 *Branch:* ${branchName}\n`;
    text += `📅 *Date:* ${dateStr}\n`;
    if (brand !== 'ALL' || cat !== 'ALL') {
        text += `🔍 *Filter:* ${brand !== 'ALL' ? brand : 'All Brands'} | ${cat !== 'ALL' ? cat : 'All Categories'}\n`;
    }
    text += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    matchingModels.forEach(m => {
        totalPairs += m.totalStock;
        const sizeParts = m.variants.map(v => `${v.displaySize || v.size}:${v.stock}`).join(' | ');
        text += `*${m.name}* (${m.brand})\n`;
        text += `👉 ${sizeParts}\n`;
        text += `📊 *Total: ${m.totalStock} prs* (Rs. ${m.sellingPrice.toLocaleString()})\n\n`;
    });

    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `📊 *GRAND TOTAL:* ${totalPairs} Pairs across ${matchingModels.length} styles.\n`;

    navigator.clipboard.writeText(text).then(() => {
        if (typeof SoundFx !== 'undefined' && SoundFx.playSuccessChime) SoundFx.playSuccessChime();
        showToast(`Current Stock for ${branchName} copied for WhatsApp! (${totalPairs} pairs)`, "success");
    }).catch(() => {
        prompt("Copy this stock summary:", text);
    });
}

// Global Reorder API for inline HTML handlers
window._reorderHub = {
    addCode: addCodeToReorder,
    removeCode: removeCodeFromReorder,
    toggleCode: toggleCodeInReorder,
    stepQty: updateSizeOrderQty,
    setQty: (pId, vId, val) => updateSizeOrderQty(pId, vId, 0, val),
    fillZeroStock: fillZeroStockForModel,
    fillCurrentStock: fillCurrentStockForModel,
    zeroAll: zeroAllForModel,
    fillAllCurrentStock: fillAllCurrentStockInSheet,
    addOneAll: addOneToAllSizes,
    sendToTransfer: sendModelToTransfer,
    openPrintStockModal: openPrintStockModal,
    closePrintStockModal: closePrintStockModal,
    updatePrintModalPreview: updatePrintModalPreview,
    exportCurrentStockCSV: exportCurrentStockCSV,
    printCurrentStockSheet: printCurrentStockSheet,
    copyCurrentStockWhatsApp: copyCurrentStockWhatsApp
};


// Start Engine on DOM Load
document.addEventListener('DOMContentLoaded', initApp);
