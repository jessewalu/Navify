# Navify Server

## Setup
1. `cd server`
2. `npm install`
3. `node server.js`

The server will run on default port 3000 and serve the client files.
APIs:
- GET /api/traffic
- GET /api/routes?origin=...&dest=...
- GET /api/transit

Real-time: Socket.IO event `traffic_update` is emitted every 8s.
