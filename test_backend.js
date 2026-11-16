const app = require('./src/app');
const http = require('http');

const PORT = 3001;
const server = app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);

  http.get(`http://localhost:${PORT}/api/events`, (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      try {
        const events = JSON.parse(data);
        console.log('GET /api/events response:', JSON.stringify(events, null, 2));
        
        if (Array.isArray(events) && events.length > 0) {
          console.log('SUCCESS: Events returned correctly.');
          
          const event = events[0];
          if (event.hasOwnProperty('available_places')) {
            console.log('SUCCESS: available_places field present.');
          } else {
            console.log('FAILURE: available_places field missing.');
          }
        } else {
          console.log('FAILURE: No events returned or incorrect format.');
        }
      } catch (e) {
        console.error('FAILURE: Could not parse response:', e.message);
      }
      server.close();
    });
  }).on('error', (err) => {
    console.error('FAILURE: Request error:', err.message);
    server.close();
  });
});
