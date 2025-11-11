// client-side JS
// Supports: dynamic backend origin, socket.io realtime, Google Maps directions (if server provides MAPS_API_KEY), and graceful fallbacks.

// mark that JS is enabled so CSS can show slide animations
document.documentElement.classList.add('js');

// determine backend origin dynamically: if frontend is served from port 3000, use relative paths
const SERVER_ORIGIN = (location.port === '3000' || (location.hostname === 'localhost' && location.port === '3000')) ? '' : 'http://localhost:3000';
function apiUrl(path){ return SERVER_ORIGIN ? `${SERVER_ORIGIN}${path}` : path; }

// create socket if `io` is available, otherwise null
let socket = null;
if(typeof io !== 'undefined'){
  try{ socket = (SERVER_ORIGIN === '') ? io() : io(SERVER_ORIGIN); }catch(e){ console.warn('socket init failed', e); socket = null; }
} else {
  console.warn('socket.io client not loaded; continuing without realtime');
}

// tiny debug/status UI
function ensureStatusEl(){
  let el = document.getElementById('backendStatus');
  if(!el){
    el = document.createElement('div');
    el.id = 'backendStatus';
    el.style.fontSize='12px';
    el.style.color='var(--muted)';
    el.style.marginLeft='8px';
    const headerBrand = document.querySelector('.brand');
    if(headerBrand) headerBrand.appendChild(el);
  }
  return el;
}
const statusEl = ensureStatusEl();
function setStatus(text, color){ if(statusEl){ statusEl.textContent = text; statusEl.style.color = color || 'var(--muted)'; }}
setStatus('connecting...');

function ensureDebug(){
  let d = document.getElementById('debugBox');
  if(!d){
    d = document.createElement('pre');
    d.id = 'debugBox';
    d.style.position = 'fixed';
    d.style.right = '12px';
    d.style.bottom = '12px';
    d.style.background = 'rgba(2,6,23,0.6)';
    d.style.color = '#9fbccf';
    d.style.padding = '8px 10px';
    d.style.borderRadius = '8px';
    d.style.fontSize = '12px';
    d.style.maxWidth = '360px';
    d.style.maxHeight = '220px';
    d.style.overflow = 'auto';
    d.style.zIndex = 9999;
    document.body.appendChild(d);
  }
  return d;
}
const debugEl = ensureDebug();
function debug(msg){ try{ console.log('[DEBUG]', msg); debugEl.textContent = `${new Date().toLocaleTimeString()} - ${msg}\n` + debugEl.textContent.slice(0,2000); }catch(e){} }
window.addEventListener('error', e => { debug('ERROR: '+(e.message||e)); });
window.addEventListener('unhandledrejection', e => { debug('PromiseRejection: '+(e.reason&&e.reason.message?e.reason.message:JSON.stringify(e.reason))); });

// Google Maps state (populated if server provides API key)
let googleMapsLoaded = false;
let map = null;
let userMarker = null;
let directionsService = null;
let directionsRenderer = null;
let watchId = null;

function loadGoogleMaps(key){
  return new Promise((resolve,reject)=>{
    if(window.google && window.google.maps){ googleMapsLoaded = true; return resolve(); }
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places`;
    s.defer = true; s.async = true;
    s.onload = ()=>{ googleMapsLoaded = true; debug('Google Maps loaded'); resolve(); };
    s.onerror = (err)=>{ debug('Google Maps load error'); reject(err); };
    document.head.appendChild(s);
  });
}

function initMap(mapEl){
  if(!googleMapsLoaded) return;
  const defaultPos = { lat: 37.7749, lng: -122.4194 };
  map = new google.maps.Map(mapEl, { center: defaultPos, zoom: 12 });
  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({ map });

  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition(pos=>{
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      map.setCenter(p);
      userMarker = new google.maps.Marker({ position: p, map, title: 'You' });
    }, err => { debug('geolocation denied or failed'); });

    try{
      watchId = navigator.geolocation.watchPosition(p=>{
        const loc = { lat: p.coords.latitude, lng: p.coords.longitude };
        if(!userMarker){ userMarker = new google.maps.Marker({ position: loc, map, title:'You' }); }
        else { userMarker.setPosition(loc); }
      }, e=>{ debug('watchPosition failed'); }, { enableHighAccuracy:true, maximumAge:2000 });
    }catch(e){ debug('watchPosition unsupported'); }
  }
}

// Entry point: DOM ready
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

  // helper to render the traffic areas
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
      div.appendChild(name); div.appendChild(cong); div.appendChild(bar);
      mapEl.appendChild(div);
    });
  }

  // load server config (maps API key) and initialize map if present
  async function loadConfig(){
    try{
      const res = await fetch(apiUrl('/api/config'));
      const cfg = await res.json();
      if(cfg && cfg.mapsApiKey){
        await loadGoogleMaps(cfg.mapsApiKey);
        initMap(mapEl);
      } else {
        debug('No Maps key provided; map features disabled');
      }
    }catch(e){ debug('loadConfig failed: '+(e && e.message)); }
  }

  // fetch data functions
  async function fetchTraffic(){
    debug('fetchTraffic start');
    let data;
    try{
      const res = await fetch(apiUrl('/api/traffic'));
      data = await res.json();
      setStatus('connected', 'var(--accent-2)');
      debug('fetchTraffic: got ' + (data.areas && data.areas.length));
    }catch(e){
      console.warn('fetchTraffic failed, using fallback', e);
      setStatus('using fallback', '#ff9f43');
      data = { areas: [ {id:'A1',name:'Main Ave - East',congestion:30}, {id:'A2',name:'Central Blvd',congestion:45}, {id:'A3',name:'Market St',congestion:70}, {id:'A4',name:'University Road',congestion:20} ] };
    }
    renderAreas(data.areas);
    updateAnalytics(data.areas);
  }

  function updateAnalytics(areas){
    const avg = Math.round(areas.reduce((s,a)=>s+a.congestion,0)/areas.length);
    const hotspots = areas.filter(a=>a.congestion>60).map(a=>a.name).join(', ') || 'None';
    avgEtaEl.textContent = Math.round(10 + avg/6);
    hotspotsEl.textContent = hotspots;
  }

  async function fetchTransit(){
    debug('fetchTransit start');
    let data;
    try{
      const res = await fetch(apiUrl('/api/transit'));
      data = await res.json();
      debug('fetchTransit: got ' + (data.next && data.next.length));
    }catch(e){
      console.warn('fetchTransit failed, using fallback', e);
      data = { next: [ { line: 'Bus 12', in_min: 5, status: 'On time' }, { line: 'Bus 3', in_min: 12, status: 'Delayed 4m' } ] };
    }
    transitEl.innerHTML = '';
    data.next.forEach(n=>{
      const item = document.createElement('div');
      item.className = 'transit-item';
      item.innerHTML = `<div>${n.line} <span class='muted'>in ${n.in_min}m</span></div><div>${n.status}</div>`;
      transitEl.appendChild(item);
    });
  }

  // find routes: use Google Directions if available, otherwise fall back to server API
  async function findRoutes(origin='Start', dest='End'){
    debug('findRoutes start');
    // If Google Maps Directions is available, use it
    if(directionsService && map){
      const userLoc = userMarker ? userMarker.getPosition().toJSON() : null;
      const originVal = originIn.value || (userLoc ? `${userLoc.lat},${userLoc.lng}` : origin);
      const request = { origin: originVal, destination: dest, travelMode: google.maps.TravelMode.DRIVING, provideRouteAlternatives: true };
      directionsService.route(request, (result, status) => {
        if(status === 'OK'){
          directionsRenderer.setDirections(result);
          routesEl.innerHTML = '';
          let totalEta = 0;
          result.routes.forEach((r, idx) => {
            const legs = r.legs || [];
            const eta = legs.reduce((s,l)=>s + (l.duration? l.duration.value/60:0),0);
            totalEta += eta;
            const div = document.createElement('div');
            div.className = 'route-item';
            div.innerHTML = `<div><strong>Option ${idx+1}</strong><div class='muted'>${(r.summary||'Route')} — ${Math.round(eta)} min</div></div><div><button class='btn small' data-idx='${idx}'>Show</button></div>`;
            routesEl.appendChild(div);
            div.querySelector('button').addEventListener('click', ()=>{
              directionsRenderer.setDirections({ routes: [r] });
            });
          });
          avgEtaEl.textContent = Math.round(totalEta / Math.max(1, result.routes.length));
        } else {
          debug('DirectionsService failed: ' + status);
        }
      });
      return;
    }

    // fallback to server-provided mocked routes
    debug('findRoutes fallback to server API');
    let data;
    try{
      const res = await fetch(apiUrl(`/api/routes?origin=${encodeURIComponent(origin)}&dest=${encodeURIComponent(dest)}`));
      data = await res.json();
      debug('findRoutes: got ' + (data.routes && data.routes.length));
    }catch(e){
      console.warn('findRoutes failed, using fallback', e);
      data = { routes: [ { name:'Fastest', distance_km:6.2, eta_min:12 }, { name:'Balanced', distance_km:7.4, eta_min:15 }, { name:'Scenic', distance_km:9.8, eta_min:18 } ] };
    }
    routesEl.innerHTML = '';
    let sumEta=0;
    data.routes.forEach(r=>{
      const div = document.createElement('div');
      div.className = 'route-item';
      div.innerHTML = `<div><strong>${r.name}</strong><div class='muted'>${r.distance_km} km</div></div><div><strong>${r.eta_min} min</strong></div>`;
      routesEl.appendChild(div);
      sumEta += r.eta_min;
    });
    avgEtaEl.textContent = Math.round(sumEta/data.routes.length);
  }

  // socket updates
  if(socket){
    socket.on('traffic_update', payload => {
      debug('socket traffic_update: count=' + (payload.areas && payload.areas.length));
      renderAreas(payload.areas);
      updateAnalytics(payload.areas);
      document.querySelectorAll('.area').forEach(el=> {
        try{ el.animate([{transform:'scale(1)'},{transform:'scale(1.02)'},{transform:'scale(1)'}],{duration:600, easing:'ease-out'}); }catch(e){}
      });
    });

    socket.on('connect', ()=> setStatus('connected', 'var(--accent-2)'));
    socket.on('connect_error', ()=> setStatus('no backend', '#ff6b6b'));
    socket.on('disconnect', ()=> setStatus('disconnected', '#ff9f43'));
  } else {
    debug('no socket: realtime disabled');
  }

  // observe the main container to detect accidental clears
  try{
    const main = document.querySelector('main');
    if(main){
      const mo = new MutationObserver(muts=>{ debug('main children: ' + main.querySelectorAll('*').length); });
      mo.observe(main, { childList:true, subtree:true });
    }
  }catch(e){/* ignore */}

  // UI events
  refreshBtn.addEventListener('click', ()=> {
    if(socket && socket.connected){ socket.emit('request_update'); }
    fetchTraffic();
    fetchTransit();
  });
  findRoutesBtn.addEventListener('click', ()=> {
    const origin = originIn.value || '';
    const dest = destIn.value || '';
    if(!dest){ alert('Please enter a destination'); return; }
    findRoutes(origin||'Start', dest);
  });

  // initial load
  loadConfig();
  fetchTraffic();
  fetchTransit();

  // slide-in reveal
  const observers = document.querySelectorAll('.slide-in');
  const ioObserver = new IntersectionObserver(entries=>{
    entries.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('visible'); ioObserver.unobserve(e.target); } });
  }, {threshold:0.15});
  observers.forEach(o=>ioObserver.observe(o));

});
