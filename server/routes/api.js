const express = require('express');
const router = express.Router();
const shortid = require('shortid');
const trafficData = require('../data/mock_traffic.json');

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
  // Create 3 mocked routes with ETAs influenced by random factor and traffic
  const routes = [
    { id: shortid.generate(), name: 'Fastest', distance_km: 6.2, eta_min: Math.max(8, Math.round(10 + Math.random()*8)) },
    { id: shortid.generate(), name: 'Balanced', distance_km: 7.4, eta_min: Math.max(10, Math.round(12 + Math.random()*10)) },
    { id: shortid.generate(), name: 'Scenic (avoid highway)', distance_km: 9.8, eta_min: Math.max(12, Math.round(15 + Math.random()*12)) }
  ];
  res.json({ origin, dest, generated: Date.now(), routes });
});

// GET /api/transit -> mock next buses
router.get('/transit', (req, res) => {
  res.json({
    stop: "Central Bus Stop",
    next: [
      { line: "Bus 12", in_min: 5, status: "On time" },
      { line: "Bus 3", in_min: 12, status: "Delayed 4m" },
      { line: "Bus 5", in_min: 20, status: "On time" }
    ]
  });
});

module.exports = router;
