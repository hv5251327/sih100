const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000' : 'https://your-render-backend-url.onrender.com';

document.addEventListener('DOMContentLoaded', () => {
    const employeeForm = document.getElementById('employeeForm');
    const adminForm = document.getElementById('adminForm');

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
