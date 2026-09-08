const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000' : 'https://sih100-backend.onrender.com';

document.addEventListener('DOMContentLoaded', () => {
    const employeeForm = document.getElementById('employeeForm');
    const adminForm = document.getElementById('adminForm');

    if (employeeForm) {
        employeeForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (typeof submitAuth === 'function') {
                submitAuth('employee', e);
            } else {
                window.location.href = 'dashboard.html';
            }
        });
    }

    if (adminForm) {
        adminForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (typeof submitAdminAuth === 'function') {
                submitAdminAuth(e);
            } else {
                window.location.href = 'admin.html';
            }
        });
    }
});
