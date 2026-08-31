const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000' : 'https://sih100-backend.onrender.com';

// Centralized persistent placeholder configuration
const SYSTEM_PLACEHOLDERS = {
    employeeEmail: 'e.g. sunita.sharma@mospi.gov.in',
    employeePassword: 'Enter your password',
    adminEmail: 'e.g. admin@mospi.gov.in',
    adminPassword: 'Enter password',
    regName: 'e.g. Dr. Sunita Sharma',
    regEmail: 'e.g. sunita.sharma@mospi.gov.in',
    regPassword: 'Create a secure password (e.g. mospi123)'
};

document.addEventListener('DOMContentLoaded', () => {
    const employeeForm = document.getElementById('employeeForm');
    const adminForm = document.getElementById('adminForm');
    const registerForm = document.getElementById('registerForm');

    // Enforce permanent placeholders
    if (employeeForm) {
        const em = document.getElementById('email');
        const pw = document.getElementById('password');
        if (em) em.placeholder = SYSTEM_PLACEHOLDERS.employeeEmail;
        if (pw) pw.placeholder = SYSTEM_PLACEHOLDERS.employeePassword;

        employeeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await submitAuth('employee');
        });
    }

    if (adminForm) {
        const em = document.getElementById('email');
        const pw = document.getElementById('password');
        if (em) em.placeholder = SYSTEM_PLACEHOLDERS.adminEmail;
        if (pw) pw.placeholder = SYSTEM_PLACEHOLDERS.adminPassword;

        adminForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await submitAuth('admin');
        });
    }

    if (registerForm) {
        const nm = document.getElementById('regName');
        const em = document.getElementById('regEmail');
        const pw = document.getElementById('regPassword');
        if (nm) nm.placeholder = SYSTEM_PLACEHOLDERS.regName;
        if (em) em.placeholder = SYSTEM_PLACEHOLDERS.regEmail;
        if (pw) pw.placeholder = SYSTEM_PLACEHOLDERS.regPassword;

        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await submitRegistration();
        });
    }
});

async function submitAuth(role) {
    const emailInput = document.getElementById('email') || document.querySelector('input[type="email"]');
    const passwordInput = document.getElementById('password') || document.querySelector('input[type="password"]');
    
    if (!emailInput || !passwordInput) return;
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const submitBtn = document.querySelector('button[type="submit"]');

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Verifying...';
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, role })
        });
        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('mospi_user', JSON.stringify(data.user));
            
            if (role === 'admin' || data.user.role === 'admin' || email.toLowerCase().includes('admin')) {
                window.location.href = 'admin.html';
            } else {
                window.location.href = 'dashboard.html';
            }
        } else {
            alert(`Authentication Error: ${data.error || 'Invalid credentials'}`);
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = role === 'admin' ? 'Authorize & Access Portal' : 'Login';
            }
        }
    } catch (err) {
        alert('Server unreachable. Please check connection and retry.');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = role === 'admin' ? 'Authorize & Access Portal' : 'Login';
        }
    }
}

async function submitRegistration() {
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const cadre = document.getElementById('regCadre').value;
    const deptSelect = document.getElementById('regDept');
    const department = deptSelect.options[deptSelect.selectedIndex] ? deptSelect.options[deptSelect.selectedIndex].text : '';
    const designation = document.getElementById('regDesignation').value;
    const submitBtn = document.querySelector('#registerForm button[type="submit"]');

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Registering...';
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, cadre, department, designation })
        });
        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('mospi_user', JSON.stringify(data.user));
            window.location.href = 'dashboard.html';
        } else {
            alert(`Registration Error: ${data.error || 'Unable to register'}`);
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = 'Register & Create Profile';
            }
        }
    } catch (err) {
        alert('Backend connection error. Please retry.');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Register & Create Profile';
        }
    }
}

async function triggerGovSSO(provider, targetEmail) {
    const defaultEmail = targetEmail || (document.getElementById('email') ? document.getElementById('email').value.trim() : '') || 'sunita.sharma@mospi.gov.in';

    let authEmail = defaultEmail;
    if (!authEmail || authEmail === 'e.g. sunita.sharma@mospi.gov.in') {
        const choice = prompt(`🇮🇳 Government Single Sign-On Gateway (${provider})\n\nEnter your official Government Email ID (@gov.in / @nic.in / @mospi.gov.in):\n\n(Default: sunita.sharma@mospi.gov.in)`, 'sunita.sharma@mospi.gov.in');
        if (!choice) return;
        authEmail = choice.trim();
    }

    try {
        const res = await fetch(`${API_BASE_URL}/api/auth/sso`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: authEmail, role: 'employee', sso_provider: provider })
        });
        const data = await res.json();

        if (res.ok && data.user) {
            localStorage.setItem('mospi_user', JSON.stringify(data.user));
            alert(`✅ ${provider} Identity Verified!\n\n• Officer: ${data.user.name}\n• Cadre: ${data.user.cadre}\n• Division: ${data.user.department}\n• Session: Verified & CERT-In Compliant\n\nRedirecting to Officer Competency Dashboard...`);
            window.location.href = 'dashboard.html';
        } else {
            alert(`SSO Error: ${data.error || 'Authentication failed'}`);
        }
    } catch (e) {
        alert(`SSO Gateway connection error: ${e.message}`);
    }
}

async function triggerGovAdminSSO() {
    const adminEmail = (document.getElementById('email') ? document.getElementById('email').value.trim() : '') || 'admin@mospi.gov.in';

    try {
        const res = await fetch(`${API_BASE_URL}/api/auth/sso`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: adminEmail, role: 'admin', sso_provider: 'Parichay (MeriPehchan Admin Gateway)' })
        });
        const data = await res.json();

        if (res.ok && data.user) {
            localStorage.setItem('mospi_user', JSON.stringify(data.user));
            alert(`✅ Parichay Admin SSO Verified!\n\n• Role: MoSPI Training Administrator\n• Authority: NSSTA Training HQ\n• Security Clearance: Level 3 High-Trust\n\nRedirecting to Command Center...`);
            window.location.href = 'admin.html';
        } else {
            alert(`Admin SSO Error: ${data.error || 'Authentication failed'}`);
        }
    } catch (e) {
        alert(`Admin SSO Gateway connection error: ${e.message}`);
    }
}
