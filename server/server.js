const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const apiRouter = require('./routes/api');
const trafficData = require('./data/mock_traffic.json');

const app = express();
app.use(cors());
app.use(express.json());

// Serve client static files
const clientPath = path.join(__dirname, '..', 'client');
app.use('/', express.static(clientPath));

// API router
app.use('/api', apiRouter);

// Start server
const server = http.createServer(app);
const io = new Server(server);

// Broadcast fake traffic updates every 8 seconds
function randomizeTraffic() {
  trafficData.areas.forEach(a => {
    // random walk congestion between 5 and 95
    const delta = Math.round((Math.random() - 0.5) * 20);
    a.congestion = Math.max(5, Math.min(95, a.congestion + delta));
  });
}

io.on('connection', socket => {
  console.log('Client connected:', socket.id);
  // Send initial snapshot
  socket.emit('traffic_update', { timestamp: Date.now(), areas: trafficData.areas });

  // allow client to request a single update
  socket.on('request_update', () => {
    socket.emit('traffic_update', { timestamp: Date.now(), areas: trafficData.areas });
  });
});

setInterval(() => {
  randomizeTraffic();
  io.emit('traffic_update', { timestamp: Date.now(), areas: trafficData.areas });
}, 8000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Navify server listening on http://localhost:${PORT}`));
