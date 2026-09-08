/**
 * MoSPI Competency Portal - redirect.js
 */
const REDIRECT_CONFIG = {
    API_URL: window.location.hostname === 'localhost' ? 'http://localhost:5000' : 'https://sih100-backend.onrender.com',
    DEFAULT_SESSION_DAYS: 7
};

function safeRedirect(targetUrl) {
    if (!targetUrl) targetUrl = 'dashboard.html';
    try {
        window.location.href = targetUrl;
    } catch (e) {
        window.location.assign(targetUrl);
    }
    setTimeout(() => {
        if (!window.location.href.includes(targetUrl)) {
            window.location.replace(targetUrl);
        }
    }, 40);
}

function getActiveSession() {
    try {
        const raw = localStorage.getItem('mospi_user') || sessionStorage.getItem('mospi_user');
        if (raw) {
            const user = JSON.parse(raw);
            if (user && user.email) return user;
        }
    } catch (e) {}
    return null;
}

function saveActiveSession(userObj) {
    if (!userObj || !userObj.email) return;
    if (!userObj.session_expiry) {
        userObj.session_expiry = new Date(Date.now() + 86400000 * REDIRECT_CONFIG.DEFAULT_SESSION_DAYS).toISOString();
    }
    const serialized = JSON.stringify(userObj);
    localStorage.setItem('mospi_user', serialized);
    sessionStorage.setItem('mospi_user', serialized);
}

async function handleEmployeeLogin(event) {
    if (typeof submitAuth === 'function') {
        return submitAuth('employee', event);
    }
    safeRedirect('dashboard.html');
}

async function handleAdminLogin(event) {
    if (typeof submitAdminAuth === 'function') {
        return submitAdminAuth(event);
    }
    safeRedirect('admin.html');
}

window.handleEmployeeLogin = handleEmployeeLogin;
window.handleAdminLogin = handleAdminLogin;
window.safeRedirect = safeRedirect;
window.saveActiveSession = saveActiveSession;
window.getActiveSession = getActiveSession;
