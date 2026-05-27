import { STATES, stateName } from './states.js';
import { parseZips } from './parse.js';
import { fetchStateGeoJSON } from './data.js';
import { initMap, renderZips, resetToUS } from './map.js';

const LS_STATE_KEY = 'zipmap:state';
const LS_ZIPS_KEY = 'zipmap:zips';

const els = {
  state: document.getElementById('state-select'),
  zips: document.getElementById('zip-input'),
  highlight: document.getElementById('highlight-btn'),
  status: document.getElementById('status-line'),
  unmappedWrap: document.getElementById('unmapped-wrap'),
  unmappedCount: document.getElementById('unmapped-count'),
  unmappedList: document.getElementById('unmapped-list'),
  error: document.getElementById('error-line'),
};

function populateStateDropdown() {
  const frag = document.createDocumentFragment();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select a state…';
  frag.appendChild(placeholder);
  for (const s of STATES) {
    const opt = document.createElement('option');
    opt.value = s.code;
    opt.textContent = s.name;
    frag.appendChild(opt);
  }
  els.state.appendChild(frag);
}

function setError(msg) {
  els.error.textContent = msg || '';
  els.error.hidden = !msg;
}

function setStatus(text) {
  els.status.textContent = text || '';
}

function renderUnmapped(zips) {
  if (!zips.length) {
    els.unmappedWrap.hidden = true;
    els.unmappedList.innerHTML = '';
    return;
  }
  els.unmappedWrap.hidden = false;
  els.unmappedCount.textContent = String(zips.length);
  els.unmappedList.innerHTML = '';
  for (const z of zips) {
    const li = document.createElement('li');
    li.textContent = z;
    els.unmappedList.appendChild(li);
  }
}

async function highlight() {
  setError('');
  const stateCode = els.state.value;
  const text = els.zips.value;

  if (!stateCode) {
    setError('Pick a state first.');
    return;
  }

  const zips = parseZips(text);
  if (!zips.length) {
    setStatus(`0 of 0 mapped to ${stateName(stateCode)}.`);
    renderUnmapped([]);
    resetToUS();
    return;
  }

  els.highlight.disabled = true;
  setStatus('Loading…');
  let geo;
  try {
    geo = await fetchStateGeoJSON(stateCode);
  } catch (err) {
    setError(err.message);
    setStatus('');
    els.highlight.disabled = false;
    return;
  } finally {
    els.highlight.disabled = false;
  }

  const want = new Set(zips);
  const matchedFeatures = [];
  const matchedZips = new Set();
  for (const f of geo.features) {
    const z = f.properties && f.properties.zip;
    if (z && want.has(z)) {
      matchedFeatures.push(f);
      matchedZips.add(z);
    }
  }
  const unmapped = zips.filter(z => !matchedZips.has(z));

  setStatus(`${matchedZips.size} of ${zips.length} mapped to ${stateName(stateCode)}.`);
  renderUnmapped(unmapped);
  renderZips(matchedFeatures);

  try {
    localStorage.setItem(LS_STATE_KEY, stateCode);
    localStorage.setItem(LS_ZIPS_KEY, text);
  } catch {}
}

function restorePersisted() {
  try {
    const s = localStorage.getItem(LS_STATE_KEY);
    const z = localStorage.getItem(LS_ZIPS_KEY);
    if (s) els.state.value = s;
    if (z) els.zips.value = z;
  } catch {}
}

function main() {
  populateStateDropdown();
  initMap('map');
  restorePersisted();
  els.highlight.addEventListener('click', highlight);
  els.zips.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      highlight();
    }
  });
}

main();
