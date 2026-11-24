(function () {
  const statusElement = () => document.querySelector('#organizer-status');
  const listElement = () => document.querySelector('#organizer-events');
  const formElement = () => document.querySelector('#event-form');
  const formHeading = () => document.querySelector('#event-form-heading');
  const submitButton = () => document.querySelector('#event-submit');
  const cancelEditButton = () => document.querySelector('#cancel-edit');
  const fields = {
    title: () => document.querySelector('#event-title'),
    description: () => document.querySelector('#event-description'),
    date: () => document.querySelector('#event-date'),
    location: () => document.querySelector('#event-location'),
    capacity: () => document.querySelector('#event-capacity'),
  };

  let csrfToken;
  let currentUserId;
  let editingEventId;
  let initialization;

  function setStatus(message, state) {
    const status = statusElement();
    if (!status) return;
    status.replaceChildren();
    status.textContent = message;
    status.setAttribute('data-state', state);
  }

  function request(url, options = {}) {
    return fetch(url, {
      credentials: 'same-origin',
      ...options,
    });
  }

  async function responseError(response, action) {
    let body = {};
    try {
      body = await response.json();
    } catch (error) {
      body = {};
    }

    if (response.status === 401) {
      csrfToken = undefined;
      setStatus('Your session has expired. Please log in and try again.', 'error');
    } else if (response.status === 403) {
      setStatus('You do not have permission to manage this event.', 'error');
    } else if (response.status === 409) {
      setStatus(body.error || 'This change conflicts with existing registrations.', 'error');
    } else if (response.status === 400) {
      setStatus(body.error || 'Please review the event details and try again.', 'error');
    } else {
      setStatus(`Could not ${action}. Please try again.`, 'error');
    }
  }

  function displayDate(dateValue) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return dateValue || 'Date unavailable';
    return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }

  function dateInputValue(dateValue) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (part) => String(part).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
      + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function renderEvents(events) {
    const list = listElement();
    if (!list) return;
    list.replaceChildren();

    for (const event of events) {
      const item = document.createElement('li');
      item.className = 'event-card organizer-event-card';

      const title = document.createElement('h3');
      title.textContent = event.title;

      const description = document.createElement('p');
      description.className = 'event-description';
      description.textContent = event.description || '';

      const dateLocation = document.createElement('p');
      dateLocation.className = 'event-meta';
      dateLocation.textContent = `${displayDate(event.date)} | ${event.location}`;

      const capacity = document.createElement('p');
      capacity.className = 'event-meta';
      capacity.textContent = `Capacity: ${event.capacity}`;

      const availablePlaces = document.createElement('p');
      availablePlaces.className = 'event-meta';
      availablePlaces.textContent = `${event.available_places} places available`;

      item.append(title, description, dateLocation, capacity, availablePlaces);
      if (event.organizer_id === currentUserId) {
        const actions = document.createElement('div');
        actions.className = 'organizer-event-actions';

        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'register-button';
        edit.textContent = 'Edit';
        edit.addEventListener('click', () => beginEdit(event));

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'secondary-button';
        remove.textContent = 'Delete';
        remove.addEventListener('click', () => deleteEvent(event));

        actions.append(edit, remove);
        item.appendChild(actions);
      } else {
        const readOnly = document.createElement('p');
        readOnly.className = 'event-meta event-read-only';
        readOnly.textContent = event.organizer_id === null
          ? 'Read-only: no organizer is assigned to this legacy event.'
          : 'Read-only: this event belongs to another organizer.';
        item.appendChild(readOnly);
      }
      list.appendChild(item);
    }
  }

  async function loadEvents(preserveStatus = false) {
    const list = listElement();
    if (list) list.replaceChildren();
    if (!preserveStatus) setStatus('Loading organizer events...', 'loading');

    try {
      const response = await request('/api/organizer/events');
      if (!response.ok) {
        await responseError(response, 'load events');
        return false;
      }

      const events = await response.json();
      renderEvents(events);
      if (!preserveStatus) {
        setStatus(events.length ? '' : 'No events to manage yet.', events.length ? 'success' : 'empty');
      }
      return true;
    } catch (error) {
      setStatus('Could not load events. Please try again.', 'error');
      return false;
    }
  }

  function clearForm() {
    for (const getField of Object.values(fields)) {
      const field = getField();
      if (field) field.value = '';
    }
    editingEventId = undefined;
    const heading = formHeading();
    if (heading) heading.textContent = 'Create an event';
    const button = submitButton();
    if (button) button.textContent = 'Create event';
    const cancelButton = cancelEditButton();
    if (cancelButton) cancelButton.hidden = true;
  }

  function beginEdit(event) {
    editingEventId = event.id;
    fields.title().value = event.title || '';
    fields.description().value = event.description || '';
    fields.date().value = dateInputValue(event.date);
    fields.location().value = event.location || '';
    fields.capacity().value = String(event.capacity);
    const heading = formHeading();
    if (heading) heading.textContent = 'Edit event';
    const button = submitButton();
    if (button) button.textContent = 'Save changes';
    const cancelButton = cancelEditButton();
    if (cancelButton) cancelButton.hidden = false;
    setStatus(`Editing ${event.title}.`, 'success');
  }

  function collectEventFields() {
    const title = fields.title()?.value.trim();
    const description = fields.description()?.value.trim();
    const dateValue = fields.date()?.value;
    const location = fields.location()?.value.trim();
    const capacityValue = fields.capacity()?.value.trim();

    if (!title || !description || !dateValue || !location || !/^\d+$/.test(capacityValue || '')) {
      setStatus('Complete all event fields with valid values.', 'error');
      return null;
    }

    const date = new Date(dateValue);
    const capacity = Number(capacityValue);
    if (Number.isNaN(date.getTime()) || !Number.isSafeInteger(capacity) || capacity <= 0) {
      setStatus('Enter a valid date and a positive whole-number capacity.', 'error');
      return null;
    }

    return {
      title,
      description,
      date: date.toISOString(),
      location,
      capacity,
    };
  }

  async function submitEvent(event) {
    event.preventDefault();
    const payload = collectEventFields();
    if (!payload) return;
    if (!csrfToken) {
      setStatus('Your security token is missing. Reload the dashboard and try again.', 'error');
      return;
    }

    const isEditing = editingEventId !== undefined;
    const url = isEditing
      ? `/api/organizer/events/${editingEventId}`
      : '/api/organizer/events';
    const method = isEditing ? 'PUT' : 'POST';
    const button = submitButton();
    if (button) {
      button.disabled = true;
      button.textContent = isEditing ? 'Saving changes...' : 'Creating event...';
    }
    setStatus(isEditing ? 'Saving event changes...' : 'Creating event...', 'loading');

    try {
      const response = await request(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        await responseError(response, isEditing ? 'update event' : 'create event');
        return;
      }

      const message = isEditing ? 'Event updated successfully.' : 'Event created successfully.';
      clearForm();
      const refreshed = await loadEvents(true);
      if (refreshed) {
        setStatus(message, 'success');
      } else {
        setStatus(`${message} The event list could not refresh; reload the dashboard to see the latest events.`, 'error');
      }
    } catch (error) {
      setStatus('Could not save the event. Please try again.', 'error');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = editingEventId === undefined ? 'Create event' : 'Save changes';
      }
    }
  }

  async function deleteEvent(event) {
    if (!window.confirm(`Delete "${event.title}"? This cannot be undone.`)) {
      setStatus('Event deletion cancelled.', 'success');
      return;
    }
    if (!csrfToken) {
      setStatus('Your security token is missing. Reload the dashboard and try again.', 'error');
      return;
    }

    setStatus(`Deleting ${event.title}...`, 'loading');
    try {
      const response = await request(`/api/organizer/events/${event.id}`, {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': csrfToken },
      });
      if (!response.ok) {
        await responseError(response, 'delete event');
        return;
      }

      const refreshed = await loadEvents(true);
      if (refreshed) {
        setStatus('Event deleted successfully.', 'success');
      } else {
        setStatus('Event deleted successfully, but the event list could not refresh; reload the dashboard to see the latest events.', 'error');
      }
    } catch (error) {
      setStatus('Could not delete the event. Please try again.', 'error');
    }
  }

  function wireForm() {
    const form = formElement();
    if (form) form.addEventListener('submit', submitEvent);
    const cancelButton = cancelEditButton();
    if (cancelButton) {
      cancelButton.addEventListener('click', () => {
        clearForm();
        setStatus('Editing cancelled.', 'success');
      });
    }
  }

  async function initializeDashboard() {
    wireForm();
    setStatus('Checking your organizer access...', 'loading');
    try {
      const profileResponse = await request('/api/auth/me');
      if (profileResponse.status === 401) {
        setStatus('Please log in to access the organizer dashboard.', 'error');
        return false;
      }
      if (!profileResponse.ok) {
        await responseError(profileResponse, 'verify your account');
        return false;
      }

      const profile = await profileResponse.json();
      if (profile.role !== 'organizer') {
        setStatus('Organizer access is required to use this dashboard.', 'error');
        return false;
      }
      if (!Number.isSafeInteger(profile.id) || profile.id <= 0) {
        setStatus('Could not verify your organizer account. Please log in again.', 'error');
        return false;
      }
      currentUserId = profile.id;

      const tokenResponse = await request('/api/organizer/csrf-token');
      if (!tokenResponse.ok) {
        await responseError(tokenResponse, 'load the security token');
        return false;
      }
      const tokenBody = await tokenResponse.json();
      if (typeof tokenBody.csrfToken !== 'string' || !tokenBody.csrfToken) {
        setStatus('Could not load the security token. Please reload the dashboard.', 'error');
        return false;
      }
      csrfToken = tokenBody.csrfToken;
      return loadEvents();
    } catch (error) {
      setStatus('Could not verify your account. Please try again.', 'error');
      return false;
    }
  }

  function initialize() {
    if (!initialization) initialization = initializeDashboard();
    return initialization;
  }

  window.OrganizerDashboard = {
    initialize,
    loadEvents,
  };

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', initialize);
  }
})();
