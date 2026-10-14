/* Installation is available over HTTPS or localhost; ordinary file previews still work. */
document.addEventListener('DOMContentLoaded', () => {
    const section = document.createElement('div');
    section.className = 'backup-section';
    section.innerHTML = '<h3>Use on your phone</h3><p id="pwaStatus" role="status"></p><button id="installApp" type="button" class="primary-button" hidden>Install My Day</button><p>iPhone: open this website in Safari, then Share → Add to Home Screen. Android: open it in Chrome, then use the menu to install or add it to your home screen.</p>';
    document.querySelector('#settingsModal .modal-content').append(section);
    const status = document.getElementById('pwaStatus');
    const button = document.getElementById('installApp');
    let installPrompt = null, offlineReady = false;
    const updateStatus = () => {
        if (!['https:', 'http:'].includes(location.protocol)) {
            status.textContent = 'Installation and offline mode become available after this app is hosted over HTTPS. You can test them on localhost.';
        } else if (offlineReady) {
            status.textContent = navigator.onLine ? 'Ready to work offline on this device.' : 'You are offline. Your schedule still works and changes save on this device.';
        } else {
            status.textContent = 'Preparing offline mode. Keep this page open until setup finishes.';
        }
    };
    updateStatus();
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault(); installPrompt = event; button.hidden = false;
    });
    button.addEventListener('click', async () => {
        if (!installPrompt) return;
        const prompt = installPrompt;
        installPrompt = null; button.hidden = true;
        await prompt.prompt(); await prompt.userChoice;
    });
    window.addEventListener('appinstalled', () => {
        installPrompt = null; button.hidden = true;
    });
    if ('serviceWorker' in navigator && window.isSecureContext && ['https:', 'http:'].includes(location.protocol)) {
        navigator.serviceWorker.register('./sw.js', {scope: './', updateViaCache: 'none'})
            .then(() => navigator.serviceWorker.ready)
            .then(() => {offlineReady = true; updateStatus();})
            .catch(() => {status.textContent = 'Offline setup did not finish. Reconnect and reload to try again.';});
    } else if (location.protocol !== 'file:') {
        status.textContent = 'Offline installation needs HTTPS or localhost and a browser with service worker support.';
    }
});
