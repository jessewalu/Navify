const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const apiRouter = require('./routes/api');
const trafficData = require('./data/mock_traffic.json');

const app = express();
// Allow requests from the frontend Live Server and local dev origins
app.use(cors({
  origin: ['http://127.0.0.1:5500', 'http://localhost:5500', 'http://localhost:3000'],
  methods: ['GET','POST','PUT','DELETE'],
  credentials: true
}));
app.use(express.json());

// Serve client static files
const clientPath = path.join(__dirname, '..', 'client');
app.use('/', express.static(clientPath));

// API router
app.use('/api', apiRouter);

// Expose minimal config (maps API key) to the frontend if provided via env
app.get('/api/config', (req, res) => {
  const mapsKey = process.env.MAPS_API_KEY || null;
  res.json({ mapsApiKey: mapsKey });
});

// Start server
const server = http.createServer(app);
// Initialize Socket.IO with CORS policy to allow Live Server origins
const io = new Server(server, {
  cors: {
    origin: ['http://127.0.0.1:5500', 'http://localhost:5500', 'http://localhost:3000'],
    methods: ['GET','POST']
  }
});

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
server.on('error', err => {
  console.error('Server error', err);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Navify server listening on http://0.0.0.0:${PORT}`);
  console.log('Available on localhost and on the machine network interfaces.');
});
