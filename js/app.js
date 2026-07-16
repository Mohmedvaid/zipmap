import { STATES, stateName } from './states.js';
import { parseZips } from './parse.js';
import { fetchStateGeoJSON, fetchIncome } from './data.js';
import { initMap, renderColored, resetToUS } from './map.js';

const LS_STATE_KEY = 'zipmap:state';
const LS_BLUE_KEY = 'lastBlueZips';
const LS_RED_KEY = 'lastRedZips';
const LS_INCOME_KEY = 'zipmap:income';

// Whatever is currently on the map, kept so the income toggle can repaint the
// same features without re-fetching the state file or re-running the match.
let lastRender = null;
let incomeData = null;

const els = {
  state: document.getElementById('state-select'),
  blue: document.getElementById('blue-input'),
  red: document.getElementById('red-input'),
  highlight: document.getElementById('highlight-btn'),
  status: document.getElementById('status-line'),
  conflict: document.getElementById('conflict-note'),
  unmappedWrap: document.getElementById('unmapped-wrap'),
  unmappedCount: document.getElementById('unmapped-count'),
  unmappedList: document.getElementById('unmapped-list'),
  error: document.getElementById('error-line'),
  income: document.getElementById('income-toggle'),
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

function setConflict(count) {
  if (!count) {
    els.conflict.textContent = '';
    els.conflict.hidden = true;
    return;
  }
  const noun = count === 1 ? 'zip was' : 'zips were';
  els.conflict.textContent = `${count} ${noun} in both lists; treated as red.`;
  els.conflict.hidden = false;
}

function renderUnmapped(items) {
  if (!items.length) {
    els.unmappedWrap.hidden = true;
    els.unmappedList.innerHTML = '';
    return;
  }
  els.unmappedWrap.hidden = false;
  els.unmappedCount.textContent = String(items.length);
  els.unmappedList.innerHTML = '';
  for (const { zip, color } of items) {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = `dot dot--${color}`;
    const label = document.createElement('span');
    label.textContent = zip;
    li.appendChild(dot);
    li.appendChild(label);
    els.unmappedList.appendChild(li);
  }
}

function refreshButtonState() {
  // Highlight is enabled once the user has typed at least one parseable zip
  // into the blue textarea AND picked a state. Red alone is not enough.
  const hasBlue = parseZips(els.blue.value).length > 0;
  const hasState = !!els.state.value;
  els.highlight.disabled = !(hasBlue && hasState);
}

async function highlight() {
  setError('');
  const stateCode = els.state.value;
  if (!stateCode) {
    setError('Pick a state first.');
    return;
  }

  const blueRaw = parseZips(els.blue.value);
  const redRaw = parseZips(els.red.value);

  if (!blueRaw.length) {
    setError('Enter at least one blue zip.');
    return;
  }

  // Red wins on conflict: a zip in both lists is removed from the blue set
  // before matching, so it paints red and counts in the red bucket only.
  const redSet = new Set(redRaw);
  const conflicts = blueRaw.filter(z => redSet.has(z));
  const blueEffective = blueRaw.filter(z => !redSet.has(z));
  const redEffective = redRaw;

  els.highlight.dataset.busy = '1';
  els.highlight.disabled = true;
  setStatus('Loading…');

  let geo;
  try {
    geo = await fetchStateGeoJSON(stateCode);
  } catch (err) {
    setError(err.message);
    setStatus('');
    return;
  } finally {
    delete els.highlight.dataset.busy;
    refreshButtonState();
  }

  const featureByZip = new Map();
  for (const f of geo.features) {
    const z = f.properties && f.properties.zip;
    if (z) featureByZip.set(z, f);
  }

  const matched = (zips) => {
    const features = [];
    const matchedSet = new Set();
    for (const z of zips) {
      const f = featureByZip.get(z);
      if (f) { features.push(f); matchedSet.add(z); }
    }
    return { features, matchedSet };
  };

  const blueMatched = matched(blueEffective);
  const redMatched = matched(redEffective);

  const state = stateName(stateCode);
  const lines = [`Blue: ${blueMatched.matchedSet.size} of ${blueEffective.length} mapped to ${state}`];
  if (redEffective.length) {
    lines.push(`Red: ${redMatched.matchedSet.size} of ${redEffective.length} mapped to ${state}`);
  }
  setStatus(lines.join('\n'));
  setConflict(conflicts.length);

  const unmapped = [
    ...blueEffective.filter(z => !blueMatched.matchedSet.has(z)).map(zip => ({ zip, color: 'blue' })),
    ...redEffective.filter(z => !redMatched.matchedSet.has(z)).map(zip => ({ zip, color: 'red' })),
  ];
  renderUnmapped(unmapped);

  lastRender = { blue: blueMatched.features, red: redMatched.features };
  await paint({ fit: true });
  persist();
}

function persist() {
  try {
    localStorage.setItem(LS_STATE_KEY, els.state.value);
    localStorage.setItem(LS_BLUE_KEY, els.blue.value);
    localStorage.setItem(LS_RED_KEY, els.red.value);
    localStorage.setItem(LS_INCOME_KEY, els.income.checked ? '1' : '');
  } catch {}
}

async function ensureIncome() {
  if (!incomeData) incomeData = await fetchIncome();
  return incomeData;
}

// Repaints whatever is already matched. `fit` is false when only the income
// toggle changed: the matched set is the same, so re-fitting would yank the
// camera back from wherever the user had panned to (SPEC §2.5 ties auto-fit to
// the matched set changing, not to restyling).
async function paint({ fit }) {
  if (!lastRender) return;
  let income = null;
  if (els.income.checked) {
    try {
      income = await ensureIncome();
    } catch (err) {
      setError(err.message);
      els.income.checked = false;
    }
  }
  renderColored({ ...lastRender, income, fit });
}

async function onIncomeToggle() {
  setError('');
  els.income.disabled = true;
  try {
    await paint({ fit: false });
  } finally {
    els.income.disabled = false;
  }
  persist();
}

function restorePersisted() {
  try {
    const s = localStorage.getItem(LS_STATE_KEY);
    const b = localStorage.getItem(LS_BLUE_KEY);
    const r = localStorage.getItem(LS_RED_KEY);
    if (s) els.state.value = s;
    if (b) els.blue.value = b;
    if (r) els.red.value = r;
    els.income.checked = !!localStorage.getItem(LS_INCOME_KEY);
  } catch {}
}

function main() {
  populateStateDropdown();
  initMap('map');
  restorePersisted();
  refreshButtonState();

  els.highlight.addEventListener('click', highlight);
  els.income.addEventListener('change', onIncomeToggle);
  for (const input of [els.blue, els.red, els.state]) {
    input.addEventListener('input', refreshButtonState);
    input.addEventListener('change', refreshButtonState);
  }
  for (const ta of [els.blue, els.red]) {
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (!els.highlight.disabled) highlight();
      }
    });
  }
}

main();
