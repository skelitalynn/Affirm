// Minimal client-side interactions for admin pages.
(() => {
    const alerts = document.querySelectorAll('.alert');
    alerts.forEach((alert) => {
        alert.addEventListener('click', () => {
            alert.remove();
        });
    });
})();
