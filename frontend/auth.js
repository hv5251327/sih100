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
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, role })
        });
        const data = await response.json();
        if (response.ok) {
            alert(`Logged in successfully as ${role.toUpperCase()}`);
        } else {
            alert(`Authentication Error: ${data.error || 'Invalid credentials'}`);
        }
    } catch (err) {
        alert('Server unreachable. Ensure the backend is active.');
    }
}

async function submitRegistration() {
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const cadre = document.getElementById('regCadre').value;
    const department = document.getElementById('regDept').options[document.getElementById('regDept').selectedIndex].text;
    const designation = document.getElementById('regDesignation').value;
    const submitBtn = document.querySelector('.btn-register-submit');

    submitBtn.disabled = true;
    submitBtn.innerText = "Registering...";

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, cadre, department, designation })
        });
        const data = await response.json();
        
        if (response.ok) {
            alert(`Registration successful! Record created for ${data.user.name} in Supabase.`);
            // No redirect - awaiting next instructions
        } else {
            alert(`Registration Error: ${data.error || 'Unable to complete registration'}`);
        }
    } catch (err) {
        alert('Server unreachable. Please check backend status.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Register & Create Competency Profile";
    }
}
