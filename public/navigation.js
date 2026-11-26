(function () {
  const guestLinks = () => Array.from(document.querySelectorAll('[data-auth-guest]'));
  const userElement = () => document.querySelector('#auth-nav-user');
  const logoutButton = () => document.querySelector('#auth-nav-logout');
  const navStatus = () => document.querySelector('#auth-nav-status');
  const authPanel = () => document.querySelector('#auth-panel');
  const authSessionStatus = () => document.querySelector('#auth-session-status');
  const googleLinkPanel = () => document.querySelector('#google-link-panel');
  let initialization;

  function showGuest() {
    guestLinks().forEach((link) => { link.hidden = false; });
    const user = userElement();
    if (user) {
      user.textContent = '';
      user.hidden = true;
    }
    const logout = logoutButton();
    if (logout) logout.hidden = true;
    const status = navStatus();
    if (status) {
      status.textContent = '';
      status.hidden = true;
    }
    const panel = authPanel();
    if (panel) panel.hidden = false;
    const linkPanel = googleLinkPanel();
    if (linkPanel) linkPanel.hidden = true;
    const sessionStatus = authSessionStatus();
    if (sessionStatus) sessionStatus.hidden = true;
  }

  function showSignedIn(profile) {
    guestLinks().forEach((link) => { link.hidden = true; });
    const user = userElement();
    if (user) {
      user.textContent = `Signed in as ${profile.email}`;
      user.hidden = false;
    }
    const logout = logoutButton();
    if (logout) logout.hidden = false;
    const status = navStatus();
    if (status) {
      status.textContent = '';
      status.hidden = true;
    }
    const panel = authPanel();
    if (panel) panel.hidden = true;
    const linkPanel = googleLinkPanel();
    if (linkPanel) linkPanel.hidden = false;
    const sessionStatus = authSessionStatus();
    if (sessionStatus) {
      sessionStatus.textContent = `You are already signed in as ${profile.email}.`;
      sessionStatus.dataset.state = 'success';
      sessionStatus.hidden = false;
    }
  }

  function showUnavailable() {
    guestLinks().forEach((link) => { link.hidden = true; });
    const user = userElement();
    if (user) {
      user.textContent = '';
      user.hidden = true;
    }
    const logout = logoutButton();
    if (logout) logout.hidden = true;
    const message = 'Could not verify sign-in status. Reload this page to try again.';
    const status = navStatus();
    if (status) {
      status.textContent = message;
      status.dataset.state = 'error';
      status.hidden = false;
    }
    const panel = authPanel();
    if (panel) panel.hidden = true;
    const linkPanel = googleLinkPanel();
    if (linkPanel) linkPanel.hidden = true;
    const sessionStatus = authSessionStatus();
    if (sessionStatus) {
      sessionStatus.textContent = message;
      sessionStatus.dataset.state = 'error';
      sessionStatus.hidden = false;
    }
  }

  async function refresh() {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (response.status === 401) {
        showGuest();
        return null;
      }
      if (!response.ok) throw new Error('AUTH_STATUS_UNAVAILABLE');

      const profile = await response.json();
      if (
        !profile
        || !Number.isSafeInteger(profile.id)
        || typeof profile.email !== 'string'
        || !profile.email
        || !['student', 'organizer'].includes(profile.role)
      ) {
        throw new Error('AUTH_STATUS_INVALID');
      }

      showSignedIn(profile);
      return profile;
    } catch (error) {
      showUnavailable();
      return null;
    }
  }

  async function logout() {
    const button = logoutButton();
    if (!button || button.disabled) return;

    button.disabled = true;
    button.textContent = 'Logging out...';
    const status = navStatus();
    if (status) {
      status.textContent = 'Logging out...';
      status.dataset.state = 'loading';
      status.hidden = false;
    }

    try {
      const tokenResponse = await fetch('/api/auth/csrf-token', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (tokenResponse.status === 401) {
        await refresh();
        return;
      }
      if (!tokenResponse.ok) throw new Error('CSRF_TOKEN_UNAVAILABLE');

      const tokenBody = await tokenResponse.json();
      if (typeof tokenBody.csrfToken !== 'string' || !tokenBody.csrfToken) {
        throw new Error('CSRF_TOKEN_INVALID');
      }

      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': tokenBody.csrfToken },
      });
      if (response.status === 401) {
        await refresh();
        return;
      }
      if (!response.ok) throw new Error('LOGOUT_FAILED');

      window.location.reload();
    } catch (error) {
      if (status) {
        status.textContent = 'Could not log out. Please try again.';
        status.dataset.state = 'error';
        status.hidden = false;
      }
    } finally {
      button.disabled = false;
      button.textContent = 'Log out';
    }
  }

  function initialize() {
    if (!initialization) {
      const button = logoutButton();
      if (button) button.addEventListener('click', logout);
      initialization = refresh();
    }
    return initialization;
  }

  window.AuthNavigation = { initialize, refresh };
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', initialize);
  }
})();
