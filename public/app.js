(function () {
  const statusElement = () => document.querySelector('#events-status');
  const listElement = () => document.querySelector('#events-list');

  function setStatus(message, state) {
    const status = statusElement();
    if (!status) return;
    status.replaceChildren();
    status.textContent = message;
    status.setAttribute('data-state', state);
  }

  function setLoadingError() {
    setStatus('Could not load events. Please try again.', 'error');
    const status = statusElement();
    if (!status) return;
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'register-button';
    retry.textContent = 'Retry';
    retry.addEventListener('click', () => loadEvents());
    status.append(retry);
  }

  function formatDate(dateValue) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return dateValue;
    return date.toLocaleString([], {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  function renderEvents(events) {
    const list = listElement();
    if (!list) return;

    list.replaceChildren();
    events.forEach((event) => {
      const card = document.createElement('article');
      card.className = 'event-card';

      const title = document.createElement('h2');
      title.textContent = event.title;

      const dateLocation = document.createElement('p');
      dateLocation.className = 'event-meta';
      dateLocation.textContent = `${formatDate(event.date)} | ${event.location}`;

      const description = document.createElement('p');
      description.className = 'event-description';
      description.textContent = event.description || '';

      const capacity = document.createElement('p');
      capacity.className = 'event-meta';
      capacity.textContent = `${event.available_places} places available`;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'register-button';
      button.textContent = event.available_places > 0 ? 'Register' : 'Event full';
      button.disabled = event.available_places <= 0;
      button.addEventListener('click', () => registerForEvent(event.id, button));

      card.append(title, dateLocation, description, capacity, button);
      list.appendChild(card);
    });
  }

  async function loadEvents(options) {
    const preserveStatus = options && options.preserveStatus;
    const list = listElement();
    if (list) list.replaceChildren();
    if (!preserveStatus) setStatus('Loading upcoming events...', 'loading');

    try {
      const response = await fetch('/api/events');
      if (!response.ok) throw new Error('Could not load events');

      const events = await response.json();
      if (!preserveStatus) {
        if (events.length === 0) {
          setStatus('No upcoming events. Check back soon.', 'empty');
        } else {
          setStatus('', 'success');
        }
      }
      renderEvents(events);
      return true;
    } catch (error) {
      if (!preserveStatus) {
        setLoadingError();
      }
      return false;
    }
  }

  async function registerForEvent(eventId, button) {
    button.disabled = true;
    button.textContent = 'Registering...';
    let restoreButton = true;

    try {
      const response = await fetch(`/api/events/${eventId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.status === 401) {
        setStatus('Please log in before registering for an event.', 'error');
        return;
      }

      if (response.status === 409) {
        const body = await response.json();
        if (/full/i.test(body.error || '')) {
          setStatus('This event is full.', 'error');
          button.textContent = 'Event full';
          button.disabled = true;
          restoreButton = false;
        } else {
          setStatus('You are already registered for this event.', 'error');
          button.textContent = 'Register';
          button.disabled = false;
          restoreButton = false;
        }
        return;
      }

      if (!response.ok) {
        setStatus('Could not complete registration. Please try again.', 'error');
        return;
      }

      restoreButton = false;
      const refreshed = await loadEvents({ preserveStatus: true });
      if (refreshed) {
        setStatus('Event registered successfully.', 'success');
        restoreButton = true;
      } else {
        setStatus(
          'Event registered successfully, but the event list could not refresh. Please retry.',
          'error'
        );
        const status = statusElement();
        if (status) {
          const retry = document.createElement('button');
          retry.type = 'button';
          retry.className = 'register-button';
          retry.textContent = 'Retry';
          retry.addEventListener('click', () => loadEvents());
          status.append(retry);
        }
      }
    } catch (error) {
      setStatus('Could not complete registration. Please try again.', 'error');
    } finally {
      if (restoreButton) {
        button.disabled = false;
        button.textContent = 'Register';
      }
    }
  }

  window.ClubEvents = {
    loadEvents,
    registerForEvent,
    renderEvents,
  };

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', () => loadEvents());
  }
})();
