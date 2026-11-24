(function () {
  const statusElement = () => document.querySelector('#my-events-status');
  const listElement = () => document.querySelector('#my-events-list');

  function setStatus(message, state) {
    const status = statusElement();
    if (!status) return;
    status.textContent = message;
    status.setAttribute('data-state', state);
  }

  function formatDate(dateValue) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return dateValue;
    return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }

  function renderRegistrations(registrations) {
    const list = listElement();
    if (!list) return;
    list.replaceChildren();

    for (const registration of registrations) {
      const item = document.createElement('li');
      item.className = 'event-card my-event-card';

      const title = document.createElement('h2');
      title.textContent = registration.title;

      const details = document.createElement('p');
      details.className = 'event-meta';
      details.textContent = `${formatDate(registration.date)} | ${registration.location}`;

      const description = document.createElement('p');
      description.className = 'event-description';
      description.textContent = registration.description || '';

      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'secondary-button';
      cancel.textContent = 'Cancel registration';
      cancel.addEventListener('click', () => cancelRegistration(registration, cancel));

      item.append(title, details, description, cancel);
      list.appendChild(item);
    }
  }

  function accessError(status) {
    if (status === 401) return 'Please log in to view your registrations.';
    if (status === 403) return 'A student account is required to view My Events.';
    return 'Could not load your registrations. Please try again.';
  }

  function cancellationError(status) {
    if (status === 401) return 'Please log in to cancel your registration.';
    if (status === 403) return 'You are not authorized to cancel this registration.';
    if (status === 404) return 'This registration no longer exists.';
    return 'Could not cancel your registration. Please try again.';
  }

  async function loadRegistrations(options = {}) {
    const preserveStatus = options.preserveStatus;
    const list = listElement();
    if (list) list.replaceChildren();
    if (!preserveStatus) setStatus('Loading your registrations...', 'loading');

    try {
      const response = await fetch('/api/registrations', {
        credentials: 'same-origin',
      });
      if (!response.ok) {
        setStatus(accessError(response.status), 'error');
        return false;
      }

      const registrations = await response.json();
      if (!Array.isArray(registrations)) {
        setStatus('Could not load your registrations. Please try again.', 'error');
        return false;
      }

      renderRegistrations(registrations);
      if (!preserveStatus) {
        setStatus(
          registrations.length ? '' : 'No registrations yet.',
          registrations.length ? 'success' : 'empty'
        );
      }
      return true;
    } catch (error) {
      setStatus('Could not load your registrations. Please try again.', 'error');
      return false;
    }
  }

  async function cancelRegistration(registration, button) {
    if (!window.confirm(`Cancel your registration for "${registration.title}"?`)) {
      setStatus('Cancellation cancelled.', 'success');
      return;
    }

    button.disabled = true;
    button.textContent = 'Cancelling...';
    setStatus('Cancelling your registration...', 'loading');

    try {
      const response = await fetch(`/api/registrations/${registration.registration_id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!response.ok) {
        setStatus(cancellationError(response.status), 'error');
        return;
      }

      const refreshed = await loadRegistrations({ preserveStatus: true });
      if (refreshed) {
        setStatus('Registration cancelled successfully.', 'success');
      }
    } catch (error) {
      setStatus('Could not cancel your registration. Please try again.', 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Cancel registration';
    }
  }

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', () => loadRegistrations());
  }
})();
