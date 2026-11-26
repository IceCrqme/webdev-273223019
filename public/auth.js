(function () {
  const statusElement = () => document.querySelector('#auth-status');
  const formElement = () => document.querySelector('#auth-form');
  const emailElement = () => document.querySelector('#auth-email');
  const passwordElement = () => document.querySelector('#auth-password');
  const submitElement = () => document.querySelector('#auth-submit');
  const googleLinkElement = () => document.querySelector('#google-link');

  function setStatus(message, state) {
    const status = statusElement();
    if (!status) return;
    status.textContent = message;
    status.setAttribute('data-state', state);
    status.hidden = false;
  }

  function showGoogleResult() {
    const result = new URLSearchParams(window.location.search || '').get('google');
    const messages = {
      unavailable: ['Google sign-in is not configured. Email and password sign-in are still available.', 'error'],
      denied: ['Google sign-in was cancelled.', 'error'],
      invalid_state: ['Google sign-in could not be verified. Please try again.', 'error'],
      conflict: ['That Google email belongs to an existing account. Sign in with email and password before linking Google.', 'error'],
      link_conflict: ['That Google account is already linked to another account, or this account has a different Google identity.', 'error'],
      link_requires_login: ['Sign in with email and password before linking a Google account.', 'error'],
      linked: ['Google account linked securely to your signed-in account.', 'success'],
      failed: ['Google sign-in could not be completed. Please try again.', 'error'],
    };
    if (messages[result]) setStatus(messages[result][0], messages[result][1]);
  }

  function validEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  async function responseError(response) {
    try {
      const body = await response.json();
      if (typeof body.error === 'string' && body.error) return body.error;
    } catch (error) {
      // Use the status-based message below when the response has no JSON body.
    }

    if (response.status === 401) return 'Invalid email or password.';
    if (response.status === 409) return 'An account with this email already exists.';
    if (response.status === 400) return 'Please check your email and password.';
    return 'Authentication could not be completed. Please try again.';
  }

  async function submitAuthentication(event) {
    event.preventDefault();
    const form = formElement();
    const mode = form?.dataset.mode;
    const email = emailElement()?.value.trim();
    const password = passwordElement()?.value;

    if (
      (mode !== 'login' && mode !== 'register')
      || !validEmail(email || '')
      || !password
      || (mode === 'register' && password.length < 8)
    ) {
      setStatus(
        mode === 'register'
          ? 'Enter a valid email and a password of at least 8 characters.'
          : 'Enter a valid email and password.',
        'error'
      );
      return;
    }

    const button = submitElement();
    if (button) {
      button.disabled = true;
      button.textContent = mode === 'register' ? 'Creating account...' : 'Logging in...';
    }
    setStatus(mode === 'register' ? 'Creating your account...' : 'Signing in...', 'loading');

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        setStatus(await responseError(response), 'error');
        return;
      }

      const passwordField = passwordElement();
      if (passwordField) passwordField.value = '';

      if (mode === 'register') {
        setStatus('Account created successfully. You are now signed in.', 'success');
        await window.AuthNavigation?.refresh();
        return;
      }

      setStatus('Checking your account...', 'loading');
      const profileResponse = await fetch('/api/auth/me', {
        credentials: 'same-origin',
      });
      if (!profileResponse.ok) {
        setStatus(await responseError(profileResponse), 'error');
        return;
      }

      const profile = await profileResponse.json();
      if (profile.role !== 'student' && profile.role !== 'organizer') {
        setStatus('Could not verify your account role. Please try again.', 'error');
        return;
      }

      setStatus('Signed in successfully. Redirecting...', 'success');
      window.location.href = profile.role === 'organizer' ? '/organizer.html' : '/';
    } catch (error) {
      setStatus(
        mode === 'register'
          ? 'Could not create your account. Please try again.'
          : 'Could not log in. Please try again.',
        'error'
      );
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = mode === 'register' ? 'Create account' : 'Log in';
      }
    }
  }

  async function beginGoogleLink() {
    const button = googleLinkElement();
    if (button) {
      button.disabled = true;
      button.textContent = 'Preparing secure link...';
    }
    setStatus('Preparing a secure Google account link...', 'loading');

    try {
      const tokenResponse = await fetch('/api/auth/google/link/csrf-token', {
        credentials: 'same-origin',
      });
      if (tokenResponse.status === 401) {
        setStatus('Sign in with your existing account before linking Google.', 'error');
        return;
      }
      if (!tokenResponse.ok) {
        setStatus(await responseError(tokenResponse), 'error');
        return;
      }

      const tokenBody = await tokenResponse.json();
      if (typeof tokenBody.csrfToken !== 'string' || !tokenBody.csrfToken) {
        setStatus('Could not verify this account-link request. Please try again.', 'error');
        return;
      }

      const response = await fetch('/api/auth/google/link', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': tokenBody.csrfToken },
      });
      if (!response.ok) {
        setStatus(await responseError(response), 'error');
        return;
      }

      const body = await response.json();
      const authorizationUrl = new URL(body.authorizationUrl);
      if (authorizationUrl.origin !== 'https://accounts.google.com') {
        setStatus('Could not verify the Google authorization destination.', 'error');
        return;
      }
      window.location.href = authorizationUrl.toString();
    } catch (error) {
      setStatus('Could not start Google account linking. Please try again.', 'error');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Link Google to your account';
      }
    }
  }

  function initialize() {
    const form = formElement();
    if (form) form.addEventListener('submit', submitAuthentication);
    const googleLink = googleLinkElement();
    if (googleLink) googleLink.addEventListener('click', beginGoogleLink);
    showGoogleResult();
  }

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', initialize);
  }
})();
