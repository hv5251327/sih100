function navigate(role) {
    if (role === 'Admin Login') {
        window.location.href = 'admin-login.html';
    } else if (role === 'Officer Login') {
        window.location.href = 'officer-login.html';
    } else {
        alert('Navigating to ' + role + ' module...');
    }
}

function playVideo(courseTitle) {
    alert(`Loading iGOT Karmayogi video stream: "${courseTitle}"`);
}
