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
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const submitBtn = document.querySelector('#employeeForm button[type="submit"], #adminForm button[type="submit"], .btn-submit');

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
            window.location.href = 'dashboard.html';
        } else {
            alert(`Authentication Error: ${data.error || 'Invalid credentials'}`);
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = role === 'admin' ? 'Authorize & Access Portal' : 'Login';
            }
        }
    } catch (err) {
        alert('Server unreachable. Please wait 30 seconds for backend initialization and retry.');
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
        alert('Backend connection error. Please retry in a few moments.');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Register & Create Profile';
        }
    }
}
