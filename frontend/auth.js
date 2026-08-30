const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000' : 'https://sih100-backend.onrender.com';

document.addEventListener('DOMContentLoaded', () => {
    const employeeForm = document.getElementById('employeeForm');
    const adminForm = document.getElementById('adminForm');
    const registerForm = document.getElementById('registerForm');

    if (employeeForm) {
        employeeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await submitAuth('employee');
        });
    }

    if (adminForm) {
        adminForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await submitAuth('admin');
        });
    }

    if (registerForm) {
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

async function triggerGovSSO(role) {
    const ssoEmail = role === 'admin' ? 'admin@mospi.gov.in' : 'officer.iss@nic.in';
    const ssoBtn = document.getElementById('btn-parichay-sso') || document.querySelector('.sso-btn');
    if (ssoBtn) {
        ssoBtn.disabled = true;
        ssoBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Authenticating via Parichay (MeriPehchan)...`;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/sso`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: ssoEmail,
                role: role,
                sso_provider: 'Parichay (MeriPehchan - Govt of India)'
            })
        });
        const data = await response.json();

        if (response.ok && data.user) {
            localStorage.setItem('mospi_user', JSON.stringify(data.user));
            if (role === 'admin' || data.user.role === 'admin') {
                window.location.href = 'admin.html';
            } else {
                window.location.href = 'dashboard.html';
            }
        } else {
            alert(`Gov SSO Error: ${data.error || 'Parichay authentication failed'}`);
            if (ssoBtn) {
                ssoBtn.disabled = false;
                ssoBtn.innerHTML = `<i class="fa-solid fa-shield-halved"></i> Sign In with Parichay (Gov SSO)`;
            }
        }
    } catch (err) {
        alert('Could not connect to Government SSO gateway. Please retry.');
        if (ssoBtn) {
            ssoBtn.disabled = false;
            ssoBtn.innerHTML = `<i class="fa-solid fa-shield-halved"></i> Sign In with Parichay (Gov SSO)`;
        }
    }
}
