function textResult(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
  };
}

function toolError(message) {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  };
}

function errorMessage(error) {
  switch (error?.message) {
    case 'EVENT_NOT_FOUND':
      return 'Event not found.';
    case 'EVENT_PAST':
      return 'Cannot register for past events.';
    case 'ALREADY_REGISTERED':
      return 'Already registered for this event.';
    case 'EVENT_FULL':
      return 'Event is full.';
    case 'INVALID_INPUT':
      return 'A valid positive event ID is required.';
    case 'User not found':
      return 'Configured MCP user was not found.';
    default:
      return 'The event request could not be completed.';
  }
}

const definitions = [
  {
    name: 'list_events',
    description: 'List upcoming club events and their available places.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_event_details',
    description: 'Get the full details for a club event by its ID.',
    inputSchema: {
      type: 'object',
      properties: {
        event_id: { type: 'integer', minimum: 1, description: 'Event ID' },
      },
      required: ['event_id'],
    },
  },
  {
    name: 'register_for_event',
    description: 'Register the authenticated MCP user for an upcoming event.',
    inputSchema: {
      type: 'object',
      properties: {
        event_id: { type: 'integer', minimum: 1, description: 'Event ID' },
      },
      required: ['event_id'],
    },
  },
];

function createProjectTools({ eventService, authService, userId }) {
  async function call(name, args = {}) {
    try {
      if (name === 'list_events') {
        return textResult(await eventService.getUpcomingEvents());
      }

      if (name === 'get_event_details') {
        return textResult(await eventService.getEventDetails(args.event_id));
      }

      if (name === 'register_for_event') {
        if (!Number.isSafeInteger(userId) || userId <= 0) {
          return toolError('An authenticated user is required for registration.');
        }
        await authService.getUserById(userId);
        return textResult(await eventService.registerForEvent(userId, args.event_id));
      }
    } catch (error) {
      return toolError(errorMessage(error));
    }

    return toolError(`Unknown project tool: ${name}`);
  }

  return {
    definitions,
    call,
  };
}

module.exports = { createProjectTools };
