const express = require('express');
const router = express.Router();
const shortid = require('shortid');
const trafficData = require('../data/mock_traffic.json');
const fetch = global.fetch || require('node-fetch');
const MAPS_KEY = process.env.MAPS_API_KEY || null;

// GET /api/traffic -> returns current traffic snapshot
router.get('/traffic', (req, res) => {
  res.json({
    timestamp: Date.now(),
    areas: trafficData.areas
  });
});

// GET /api/routes?origin=...&dest=...
// returns mocked route options and ETAs based on current traffic
router.get('/routes', (req, res) => {
  const { origin = 'A', dest = 'B' } = req.query;
  // Influence ETAs by current traffic: higher average congestion increases ETA
  const avgCong = Math.round(trafficData.areas.reduce((s,a)=>s+a.congestion,0)/trafficData.areas.length);
  const baseFast = 8 + Math.round(avgCong/8); // base ETA influenced by congestion
  const routes = [
    { id: shortid.generate(), name: 'Fastest', distance_km: 6.2, eta_min: Math.max(6, baseFast + Math.round(Math.random()*6) ) },
    { id: shortid.generate(), name: 'Balanced', distance_km: 7.4, eta_min: Math.max(8, baseFast + 4 + Math.round(Math.random()*8)) },
    { id: shortid.generate(), name: 'Scenic (avoid highway)', distance_km: 9.8, eta_min: Math.max(10, baseFast + 8 + Math.round(Math.random()*10)) }
  ];

  res.json({ origin, dest, generated: Date.now(), avgCongestion: avgCong, routes });
});

// GET /api/transit -> mock next buses
router.get('/transit', (req, res) => {
  // create a small, shifting schedule influenced by traffic hotspots
  const hotspot = trafficData.areas.filter(a=>a.congestion>60).map(a=>a.name);
  const next = [
    { line: "Bus 12", in_min: Math.max(2, 5 + Math.round(hotspot.length * 2 - Math.random()*3)), status: hotspot.length? 'Delayed' : 'On time' },
    { line: "Bus 3", in_min: Math.max(4, 10 + Math.round(hotspot.length * 2 + Math.random()*4)), status: Math.random()>0.7? 'Delayed 3m':'On time' },
    { line: "Bus 5", in_min: Math.max(6, 15 + Math.round(hotspot.length * 3 + Math.random()*6)), status: 'On time' }
  ];
  res.json({ stop: "Central Bus Stop", next });
});

module.exports = router;

