(() => {
    const endpoint = '/.netlify/functions/auth';
    const status = document.getElementById('accountStatus');
    const login = document.getElementById('googleLogin');
    const logout = document.getElementById('googleLogout');
    const params = new URLSearchParams(location.search);
    const errors = {
        cancelled: 'Google sign-in was cancelled.',
        invalid_state: 'Your sign-in request expired. Please try again.',
        failed: 'Google sign-in could not finish. Please try again.',
    };
    const error = params.get('auth_error');
    if (error) {
        params.delete('auth_error');
        history.replaceState(null, '', `${location.pathname}${params.size ? '?' + params : ''}${location.hash}`);
    }
    async function loadSession() {
        login.hidden = true;
        logout.hidden = true;
        if (!['http:', 'https:'].includes(location.protocol)) {
            status.textContent = 'Open the hosted app to sign in with Google.';
            return;
        }
        try {
            const response = await fetch(endpoint, { credentials: 'same-origin', cache: 'no-store' });
            if (!response.ok) throw new Error();
            const { user } = await response.json();
            status.textContent = user ? `Signed in as ${user.name} (${user.email})` : (errors[error] || 'Sign in to create your My Day account.');
            login.hidden = Boolean(user);
            logout.hidden = !user;
        } catch {
            status.textContent = navigator.onLine ? 'Google sign-in is unavailable. Try again later.' : 'Connect to the internet to manage your account.';
        }
    }
    logout.addEventListener('click', async () => {
        logout.disabled = true;
        try {
            const response = await fetch(`${endpoint}?action=logout`, { method: 'POST', credentials: 'same-origin' });
            if (!response.ok) throw new Error();
            await loadSession();
        } catch { status.textContent = 'Could not sign out. Please try again.'; }
        finally { logout.disabled = false; }
    });
    window.addEventListener('online', loadSession);
    loadSession();
})();
