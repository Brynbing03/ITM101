const status = document.getElementById('accountStatus');
const login = document.getElementById('googleLogin');
const logout = document.getElementById('googleLogout');

const signInErrors = {
    'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
    'auth/popup-blocked': 'Allow pop-ups for this site and try again.',
    'auth/unauthorized-domain': 'This site is not authorized for Google sign-in.',
    'auth/operation-not-allowed': 'Google sign-in is not enabled for this Firebase project.',
    'auth/network-request-failed': 'Connect to the internet to sign in with Google.',
};

async function initializeAccount() {
    if (!['http:', 'https:'].includes(location.protocol)) {
        status.textContent = 'Open the hosted app to sign in with Google.';
        return;
    }

    try {
        const [{ auth }, { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut }] = await Promise.all([
            import('./firebase-config.js'),
            import('https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js'),
        ]);
        const provider = new GoogleAuthProvider();

        onAuthStateChanged(auth, user => {
            const identity = [user?.displayName, user?.email].filter(Boolean);
            const label = identity.length === 2 ? `${identity[0]} (${identity[1]})` : identity[0] || 'Google user';
            status.textContent = user ? `Signed in as ${label}` : 'Sign in with Google to use your My Day account.';
            login.hidden = Boolean(user);
            logout.hidden = !user;
        });

        login.addEventListener('click', async () => {
            login.disabled = true;
            try {
                await signInWithPopup(auth, provider);
            } catch (error) {
                status.textContent = signInErrors[error.code] || 'Google sign-in could not finish. Please try again.';
            } finally {
                login.disabled = false;
            }
        });

        logout.addEventListener('click', async () => {
            logout.disabled = true;
            try {
                await signOut(auth);
            } catch {
                status.textContent = 'Could not sign out. Please try again.';
            } finally {
                logout.disabled = false;
            }
        });
    } catch {
        status.textContent = navigator.onLine
            ? 'Google sign-in is unavailable. Reload the app to try again.'
            : 'Connect to the internet and reload to manage your account.';
    }
}

initializeAccount();
