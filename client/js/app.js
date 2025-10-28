// client-side JS
// If the frontend is served from Live Server (127.0.0.1:5500) or similar,
// point API and socket requests to the backend server which runs on port 3000.
const SERVER_ORIGIN = 'http://localhost:3000';
const socket = io(SERVER_ORIGIN);

document.addEventListener('DOMContentLoaded', () => {
  const mapEl = document.getElementById('map');
  const routesEl = document.getElementById('routes');
  const transitEl = document.getElementById('transit');
  const avgEtaEl = document.getElementById('avgEta');
  const hotspotsEl = document.getElementById('hotspots');
  const refreshBtn = document.getElementById('refreshBtn');
  const findRoutesBtn = document.getElementById('findRoutes');
  const originIn = document.getElementById('origin');
  const destIn = document.getElementById('dest');

  // helper to render areas as cards
  function renderAreas(areas){
    mapEl.innerHTML = '';
    areas.forEach(a => {
      const div = document.createElement('div');
      div.className = 'area';
      const name = document.createElement('div'); name.className='name'; name.textContent = a.name;
      const cong = document.createElement('div'); cong.className='cong'; cong.textContent = `Congestion: ${a.congestion}%`;
      const bar = document.createElement('div'); bar.className='bar';
      const fill = document.createElement('div'); fill.className='fill'; fill.style.width = `${a.congestion}%`;
      bar.appendChild(fill);
      div.appendChild(name);
      div.appendChild(cong);
      div.appendChild(bar);
      mapEl.appendChild(div);
    });
  }

  // fetch initial traffic snapshot
  async function fetchTraffic(){
    const res = await fetch(`${SERVER_ORIGIN}/api/traffic`);
    const data = await res.json();
    renderAreas(data.areas);
    updateAnalytics(data.areas);
  }

  // update analytics
  function updateAnalytics(areas){
    const avg = Math.round(areas.reduce((s,a)=>s+a.congestion,0)/areas.length);
    const hotspots = areas.filter(a=>a.congestion>60).map(a=>a.name).join(', ') || 'None';
    avgEtaEl.textContent = Math.round(10 + avg/6); // mock relation
    hotspotsEl.textContent = hotspots;
  }

  // fetch transit
  async function fetchTransit(){
    const res = await fetch(`${SERVER_ORIGIN}/api/transit`);
    const data = await res.json();
    transitEl.innerHTML = '';
    data.next.forEach(n=>{
      const item = document.createElement('div');
      item.className='transit-item';
      item.innerHTML = `<div>${n.line} <span class="muted">in ${n.in_min}m</span></div><div>${n.status}</div>`;
      transitEl.appendChild(item);
    });
  }

  // fetch routes
  async function findRoutes(origin='Start', dest='End'){
    const res = await fetch(`${SERVER_ORIGIN}/api/routes?origin=${encodeURIComponent(origin)}&dest=${encodeURIComponent(dest)}`);
    const data = await res.json();
    routesEl.innerHTML = '';
    let sumEta=0;
    data.routes.forEach(r=>{
      const div = document.createElement('div');
      div.className='route-item';
      div.innerHTML = `<div><strong>${r.name}</strong><div class='muted'>${r.distance_km} km</div></div><div><strong>${r.eta_min} min</strong></div>`;
      routesEl.appendChild(div);
      sumEta += r.eta_min;
    });
    avgEtaEl.textContent = Math.round(sumEta/data.routes.length);
  }

  // socket updates
  socket.on('traffic_update', payload => {
    renderAreas(payload.areas);
    updateAnalytics(payload.areas);
    // subtle highlight animation
    document.querySelectorAll('.area').forEach(el=> {
      el.animate([{transform:'scale(1)'},{transform:'scale(1.02)'},{transform:'scale(1)'}],{duration:600, easing:'ease-out'});
    });
  });

  // UI events
  refreshBtn.addEventListener('click', ()=> {
    socket.emit('request_update');
    fetchTransit();
  });
  findRoutesBtn.addEventListener('click', ()=> {
    findRoutes(originIn.value||'A', destIn.value||'B');
  });

  // initial load
  fetchTraffic();
  fetchTransit();
  findRoutes();

  // slide-in reveal
  const observers = document.querySelectorAll('.slide-in');
  const io = new IntersectionObserver(entries=>{
    entries.forEach(e=>{
      if(e.isIntersecting){ e.target.classList.add('visible'); io.unobserve(e.target); }
    });
  }, {threshold:0.15});
  observers.forEach(o=>io.observe(o));
});
