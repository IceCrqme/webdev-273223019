(function () {
  const statusElement = () => document.querySelector('#auth-status');
  const formElement = () => document.querySelector('#auth-form');
  const emailElement = () => document.querySelector('#auth-email');
  const passwordElement = () => document.querySelector('#auth-password');
  const submitElement = () => document.querySelector('#auth-submit');

  function setStatus(message, state) {
    const status = statusElement();
    if (!status) return;
    status.textContent = message;
    status.setAttribute('data-state', state);
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

      if (mode === 'register') {
        setStatus('Account created successfully. You are now signed in.', 'success');
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

  function initialize() {
    const form = formElement();
    if (form) form.addEventListener('submit', submitAuthentication);
  }

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', initialize);
  }
})();
