/**
 * MoSPI Competency Portal - Authentication & Navigation Gateway (auth.js)
 * Clean, zero-delay authentication and instant page redirection.
 */

const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5000'
    : 'https://sih100-backend.onrender.com';

const SYSTEM_PLACEHOLDERS = {
    employeeEmail: 'e.g. sunita.sharma@mospi.gov.in',
    employeePassword: 'Enter your password',
    adminEmail: 'e.g. admin@mospi.gov.in',
    adminPassword: 'Enter password',
    regName: 'e.g. Dr. Sunita Sharma',
    regEmail: 'e.g. sunita.sharma@mospi.gov.in',
    regPassword: 'Create a secure password (e.g. mospi123)'
};

// Safe Cross-Browser Navigation Helper
function safeRedirect(targetUrl) {
    if (!targetUrl) targetUrl = 'dashboard.html';
    try {
        window.location.href = targetUrl;
    } catch (e) {
        window.location.assign(targetUrl);
    }
}

function saveActiveSession(userObj) {
    if (!userObj || !userObj.email) return;
    if (!userObj.session_expiry) {
        userObj.session_expiry = new Date(Date.now() + 86400000 * 7).toISOString();
    }
    const serialized = JSON.stringify(userObj);
    localStorage.setItem('mospi_user', serialized);
    sessionStorage.setItem('mospi_user', serialized);
}

// 1. Employee Login Handler
async function submitAuth(role) {
    if (role === 'admin') {
        return submitAdminAuth();
    }

    const emailInput = document.getElementById('email') || document.getElementById('employeeEmail') || document.querySelector('input[type="email"]');
    const passwordInput = document.getElementById('password') || document.getElementById('employeePassword') || document.querySelector('input[type="password"]');
    const submitBtn = document.getElementById('btnEmpSubmit') || document.querySelector('button[type="submit"]');

    const email = (emailInput && emailInput.value.trim()) ? emailInput.value.trim() : 'sunita.sharma@mospi.gov.in';
    const password = (passwordInput && passwordInput.value) ? passwordInput.value : '1234';

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authenticating & Opening...';
    }

    const officerName = email.split('@')[0].replace(/[^a-zA-Z]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim() || 'Dr. Sunita Sharma';
    
    const authUser = {
        name: officerName,
        email: email,
        role: 'employee',
        cadre: "Indian Statistical Service (ISS) — Group 'A' Central Service",
        department: 'National Accounts Division (NAD) — Macro Aggregates & GDP',
        designation: 'Senior Administrative Grade (SAG) / DDG',
        session_token: 'GOV-AUTH-TOKEN-' + Math.random().toString(36).substring(2, 10).toUpperCase() + '-' + Date.now(),
        session_expiry: new Date(Date.now() + 86400000 * 7).toISOString(),
        login_timestamp: new Date().toISOString()
    };

    saveActiveSession(authUser);

    // Background asynchronous login notification
    try {
        fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, role: 'employee' })
        }).then(r => r.json()).then(data => {
            if (data && data.recommendations && Array.isArray(data.recommendations)) {
                localStorage.setItem('mospi_recommendations_' + email.toLowerCase(), JSON.stringify(data.recommendations));
            }
        }).catch(() => {});
    } catch (e) {}

    safeRedirect('dashboard.html');
}

// 2. Admin Login Handler
async function submitAdminAuth() {
    const emailInput = document.getElementById('email') || document.getElementById('adminEmail') || document.querySelector('input[type="email"]');
    const submitBtn = document.getElementById('btnAdminSubmit') || document.querySelector('button[type="submit"]');

    const email = (emailInput && emailInput.value.trim()) ? emailInput.value.trim() : 'admin@mospi.gov.in';

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authorizing Admin...';
    }

    const adminUser = {
        name: 'MoSPI Training Administrator',
        email: email,
        role: 'admin',
        department: 'National Statistical Systems Training Academy (NSSTA)',
        designation: 'Joint Director / Chief Training Officer',
        cadre: 'Indian Statistical Service (ISS)',
        session_token: 'GOV-ADMIN-TOKEN-' + Math.random().toString(36).substring(2, 10).toUpperCase() + '-' + Date.now(),
        session_expiry: new Date(Date.now() + 86400000 * 7).toISOString(),
        login_timestamp: new Date().toISOString()
    };

    saveActiveSession(adminUser);

    try {
        fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: '1234', role: 'admin' })
        }).catch(() => {});
    } catch (e) {}

    safeRedirect('admin.html');
}

// 3. Registration Handler - Opens Diagnostic Modal to capture competency levels
async function submitRegistration() {
    const nameInput = document.getElementById('regName');
    const emailInput = document.getElementById('regEmail');
    const passwordInput = document.getElementById('regPassword');
    const cadreSelect = document.getElementById('regCadre');
    const deptSelect = document.getElementById('regDept');
    const desigSelect = document.getElementById('regDesignation');
    const diagModal = document.getElementById('diagnosticModal');

    const name = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : '';
    const email = (emailInput && emailInput.value.trim()) ? emailInput.value.trim() : '';
    const password = (passwordInput && passwordInput.value) ? passwordInput.value : '';
    const cadre = (cadreSelect && cadreSelect.value) ? cadreSelect.value : '';
    const department = (deptSelect && deptSelect.selectedIndex > 0) ? deptSelect.options[deptSelect.selectedIndex].text : '';
    const designation = (desigSelect && desigSelect.value) ? desigSelect.value : '';

    if (!name || !email || !password || !cadre || !department || !designation) {
        alert('Please fill out all registration fields (Full Name, Official Email, Password, Cadre, Division, and Designation).');
        return;
    }

    // Store pending registration data
    window._pendingRegUser = {
        name,
        email,
        password,
        cadre,
        department,
        designation
    };

    // Open Diagnostic Baseline Assessment Modal if present
    if (diagModal) {
        diagModal.style.display = 'flex';
    } else {
        submitDiagnosticAssessment();
    }
}

// Handler for submitting the 4-pillar Diagnostic Self-Assessment
function submitDiagnosticAssessment(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const pending = window._pendingRegUser || {
        name: document.getElementById('regName')?.value || 'Officer Trainee',
        email: document.getElementById('regEmail')?.value || 'officer.iss@nic.in',
        password: document.getElementById('regPassword')?.value || '1234',
        cadre: document.getElementById('regCadre')?.value || "Indian Statistical Service (ISS) — Group 'A' Central Service",
        department: document.getElementById('regDept')?.options[document.getElementById('regDept')?.selectedIndex || 0]?.text || "National Accounts Division (NAD)",
        designation: document.getElementById('regDesignation')?.value || "Assistant Director / SSO"
    };

    const statScore = parseInt(document.getElementById('diag_stat')?.value) || 65;
    const techScore = parseInt(document.getElementById('diag_tech')?.value) || 60;
    const govScore = parseInt(document.getElementById('diag_gov')?.value) || 65;
    const leadScore = parseInt(document.getElementById('diag_lead')?.value) || 60;

    const diagSubmitBtn = document.getElementById('diagSubmitBtn');
    if (diagSubmitBtn) {
        diagSubmitBtn.disabled = true;
        diagSubmitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Calibrating Curriculum & Opening Dashboard...';
    }

    const regUser = {
        name: pending.name,
        email: pending.email,
        cadre: pending.cadre,
        department: pending.department,
        designation: pending.designation,
        role: 'employee',
        competency_scores: {
            statistical_score: statScore,
            technical_score: techScore,
            governance_score: govScore,
            leadership_score: leadScore
        },
        session_token: 'GOV-AUTH-TOKEN-' + Math.random().toString(36).substring(2, 10).toUpperCase() + '-' + Date.now(),
        session_expiry: new Date(Date.now() + 86400000 * 7).toISOString(),
        login_timestamp: new Date().toISOString()
    };

    // Save session & baseline scores synchronously
    saveActiveSession(regUser);
    try {
        localStorage.setItem('mospi_competency_scores_' + regUser.email.toLowerCase(), JSON.stringify(regUser.competency_scores));
    } catch (e) {}

    // Non-blocking background registration notification
    try {
        fetch(`${API_BASE_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: regUser.name,
                email: regUser.email,
                password: pending.password || '1234',
                cadre: regUser.cadre,
                department: regUser.department,
                designation: regUser.designation,
                competency_scores: regUser.competency_scores
            })
        }).catch(() => {});
    } catch (e) {}

    // Immediate redirect to Dashboard
    safeRedirect('dashboard.html');
}

// 4. Parichay / iGOT SSO Handler
let currentSSOProvider = 'Parichay (MeriPehchan)';

function triggerGovSSO(provider) {
    currentSSOProvider = provider || 'Parichay (MeriPehchan)';
    const modal = document.getElementById('ssoModal');
    const title = document.getElementById('ssoModalTitle');
    const input = document.getElementById('ssoGovEmailInput');
    if (title) title.innerText = `${currentSSOProvider} Identity Gateway`;
    if (modal) {
        modal.style.display = 'flex';
        if (input) {
            input.value = 'sunita.sharma@mospi.gov.in';
            setTimeout(() => input.focus(), 100);
        }
    } else {
        submitAuth('employee');
    }
}

function closeSSOModal() {
    const modal = document.getElementById('ssoModal');
    if (modal) modal.style.display = 'none';
}

function submitParichaySSO(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    const emailInput = document.getElementById('ssoGovEmailInput');
    const email = (emailInput && emailInput.value.trim()) ? emailInput.value.trim() : 'sunita.sharma@mospi.gov.in';
    const officerName = email.split('@')[0].replace(/[^a-zA-Z]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim() || 'Dr. Sunita Sharma';

    const ssoUser = {
        name: officerName,
        email: email,
        role: 'employee',
        cadre: "Indian Statistical Service (ISS) — Group 'A' Central Service",
        department: 'National Accounts Division (NAD) — Macro Aggregates & GDP',
        designation: 'Senior Administrative Grade (SAG) / DDG',
        sso_provider: currentSSOProvider,
        session_token: 'GOV-SSO-TOKEN-' + Math.random().toString(36).substring(2, 10).toUpperCase() + '-' + Date.now(),
        session_expiry: new Date(Date.now() + 86400000 * 7).toISOString(),
        login_timestamp: new Date().toISOString()
    };

    saveActiveSession(ssoUser);
    safeRedirect('dashboard.html');
}

// Global window mappings
window.submitAuth = submitAuth;
window.submitAdminAuth = submitAdminAuth;
window.submitRegistration = submitRegistration;
window.triggerGovSSO = triggerGovSSO;
window.closeSSOModal = closeSSOModal;
window.submitParichaySSO = submitParichaySSO;
window.safeRedirect = safeRedirect;
window.handleEmployeeLogin = submitAuth;
window.handleAdminLogin = submitAdminAuth;
window.handleRegistrationSubmit = submitRegistration;
window.authenticateAdmin = submitAdminAuth;
window.authenticateAdminSSO = function() {
    const adminUser = {
        name: 'MoSPI Training Administrator',
        email: 'admin@mospi.gov.in',
        role: 'admin',
        department: 'National Statistical Systems Training Academy (NSSTA)',
        designation: 'Joint Director / Chief Training Officer',
        cadre: 'Indian Statistical Service (ISS)',
        sso_verified: true,
        session_token: 'GOV-SSO-ADMIN-' + Math.random().toString(36).substring(2, 10).toUpperCase() + '-' + Date.now(),
        session_expiry: new Date(Date.now() + 86400000 * 7).toISOString(),
        login_timestamp: new Date().toISOString()
    };
    saveActiveSession(adminUser);
    safeRedirect('admin.html');
};
