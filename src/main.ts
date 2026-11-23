import { Viewer, type ColorMode, type ViewerState } from './viewer';
import { parsePointCloud, formatCount, type CloudData } from './loader';
import { classInfo, hexColor } from './classes';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error('Élément manquant: ' + id);
  return el as T;
};

const canvas = $<HTMLCanvasElement>('scene');
const dropOverlay = $('drop-overlay');
const loading = $('loading');
const loadingText = $('loading-text');
const status = $('status');
const stats = $('stats');
const fileInfo = $('file-info');
const panel = $('panel');
const btnPanel = $<HTMLButtonElement>('btn-panel');
const fileInput = $<HTMLInputElement>('file-input');
const classList = $('class-list');
const colorModeSel = $<HTMLSelectElement>('color-mode');
const rowColor = $('row-color');
const rowIntensity = $('row-intensity');
const uniformColor = $<HTMLInputElement>('uniform-color');
const intensityGain = $<HTMLInputElement>('intensity-gain');
const pointSize = $<HTMLInputElement>('point-size');
const stride = $<HTMLInputElement>('stride');
const strideVal = $('stride-val');
const elevMin = $<HTMLInputElement>('elev-min');
const elevMax = $<HTMLInputElement>('elev-max');
const elevMinVal = $('elev-min-val');
const elevMaxVal = $('elev-max-val');

const viewer = new Viewer(canvas);

const state: ViewerState = {
  colorMode: 'classification',
  uniformColor: 0x8fd4ff,
  intensityGain: 1,
  pointSize: 2,
  stride: 1,
  elevMinT: 0,
  elevMaxT: 1,
  visibleClasses: new Set<number>()
};

const items = new Map<number, HTMLDivElement>();

function setStatus(text: string, error = false) {
  status.textContent = text;
  status.classList.toggle('error', error);
}

function showLoading(text: string) {
  loadingText.textContent = text;
  loading.hidden = false;
}

function hideLoading() {
  loading.hidden = true;
}

function refreshClassList(cloud: CloudData) {
  items.clear();
  classList.innerHTML = '';
  const entries = [...cloud.classCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [value, count] of entries) {
    state.visibleClasses.add(value);
    const info = classInfo(value);
    const pct = ((count / cloud.count) * 100).toFixed(1).replace('.0', '') + '%';
    const row = document.createElement('div');
    row.className = 'class-item';
    row.innerHTML =
      '<span class="class-swatch" style="background:' + hexColor(info.color) + '"></span>' +
      '<span class="class-name">' + info.name + ' <span class="muted">(' + value + ')</span></span>' +
      '<span class="class-pct">' + pct + (count >= 1 ? '' : '') + '</span>';
    row.addEventListener('click', () => {
      if (state.visibleClasses.has(value)) {
        state.visibleClasses.delete(value);
        row.classList.add('off');
      } else {
        state.visibleClasses.add(value);
        row.classList.remove('off');
      }
      viewer.applyState(state);
    });
    items.set(value, row);
    classList.appendChild(row);
  }
}

function refreshElevationLabels() {
  const cloud = viewer.getCloud();
  if (!cloud) {
    elevMinVal.textContent = '—';
    elevMaxVal.textContent = '—';
    return;
  }
  const min = cloud.elevationMin + (cloud.elevationMax - cloud.elevationMin) * state.elevMinT;
  const max = cloud.elevationMin + (cloud.elevationMax - cloud.elevationMin) * state.elevMaxT;
  elevMinVal.textContent = min.toFixed(1) + ' m';
  elevMaxVal.textContent = max.toFixed(1) + ' m';
}

function updateFileInfo(cloud: CloudData) {
  fileInfo.innerHTML =
    '<strong>' + cloud.name + '</strong><br>' +
    formatCount(cloud.count) + ' points · ' +
    (cloud.compressed ? 'LAZ compressé' : 'LAS') + ' · format ' + cloud.pointFormat +
    (cloud.version ? ' · LAS ' + cloud.version : '') + '<br>' +
    'Z : ' + cloud.elevationMin.toFixed(1) + ' → ' + cloud.elevationMax.toFixed(1) + ' m<br>' +
    (cloud.hasColor ? 'RGB disponible' : 'Pas de couleur RGB');
}

function updateStats() {
  const cloud = viewer.getCloud();
  if (!cloud) {
    stats.textContent = '';
    return;
  }
  const shown = Math.ceil(cloud.count / state.stride);
  stats.textContent = formatCount(shown) + ' / ' + formatCount(cloud.count) + ' points affichés';
}

function loadCloud(cloud: CloudData) {
  viewer.setCloud(cloud, state);
  dropOverlay.classList.add('hidden');
  updateFileInfo(cloud);
  refreshClassList(cloud);
  refreshElevationLabels();
  updateStats();
  setStatus('Nuage chargé : ' + cloud.name);
}

async function openBuffer(data: ArrayBuffer, name: string) {
  showLoading('Décompression et analyse de ' + name + '…');
  await new Promise((r) => setTimeout(r, 60));
  try {
    const cloud = await parsePointCloud(data, name);
    loadCloud(cloud);
  } catch (err) {
    console.error(err);
    setStatus('Erreur : ' + (err instanceof Error ? err.message : String(err)), true);
  } finally {
    hideLoading();
  }
}

async function openFile(file: File) {
  setStatus('Lecture de ' + file.name + '…');
  try {
    const data = await file.arrayBuffer();
    await openBuffer(data, file.name);
  } catch (err) {
    setStatus('Lecture impossible : ' + (err instanceof Error ? err.message : String(err)), true);
    hideLoading();
  }
}

async function openUrl(url: string) {
  setStatus('Téléchargement…');
  showLoading('Téléchargement du nuage…');
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const name = url.split('/').pop() || 'nuage.laz';
    await openBuffer(await resp.arrayBuffer(), name);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(
      'Téléchargement impossible (' +
        msg + '). Le serveur de données doit autoriser le CORS ; sinon, téléchargez la dalle puis importez-la.',
      true
    );
    hideLoading();
  }
}

function applyAll() {
  viewer.applyState(state);
  refreshElevationLabels();
  updateStats();
}

function setVisibleAll(on: boolean) {
  for (const [value, row] of items) {
    if (on) state.visibleClasses.add(value);
    else state.visibleClasses.delete(value);
    row.classList.toggle('off', !on);
  }
  applyAll();
}

for (const el of ['btn-open', 'btn-open-hero']) {
  $(el).addEventListener('click', () => fileInput.click());
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) openFile(file);
  fileInput.value = '';
});

btnPanel.addEventListener('click', () => {
  panel.hidden = !panel.hidden;
  btnPanel.classList.toggle('active', !panel.hidden);
});

colorModeSel.addEventListener('change', () => {
  state.colorMode = colorModeSel.value as ColorMode;
  rowColor.hidden = state.colorMode !== 'uniform';
  rowIntensity.hidden = state.colorMode !== 'intensity';
  applyAll();
});

uniformColor.addEventListener('input', () => {
  state.uniformColor = parseInt(uniformColor.value.slice(1), 16);
  applyAll();
});

intensityGain.addEventListener('input', () => {
  state.intensityGain = 0.05 + (Number(intensityGain.value) / 100) * 5;
  applyAll();
});

pointSize.addEventListener('input', () => {
  state.pointSize = Number(pointSize.value);
  applyAll();
});

stride.addEventListener('input', () => {
  state.stride = Number(stride.value);
  strideVal.textContent = '1/' + state.stride;
  applyAll();
});

const onElev = () => {
  let lo = Number(elevMin.value) / 100;
  let hi = Number(elevMax.value) / 100;
  if (lo > hi) [lo, hi] = [hi, lo];
  state.elevMinT = lo;
  state.elevMaxT = hi;
  applyAll();
};
elevMin.addEventListener('input', onElev);
elevMax.addEventListener('input', onElev);

$('btn-all').addEventListener('click', () => setVisibleAll(true));
$('btn-none').addEventListener('click', () => setVisibleAll(false));
$('btn-sol').addEventListener('click', () => {
  setVisibleAll(false);
  for (const value of items.keys()) {
    if (value === 2 || value === 8) {
      state.visibleClasses.add(value);
      items.get(value)?.classList.remove('off');
    }
  }
  applyAll();
});

$('btn-3d').addEventListener('click', () => viewer.view3D());
$('btn-top').addEventListener('click', () => viewer.viewTop());
$('btn-fit').addEventListener('click', () => viewer.view3D());

$('btn-url').addEventListener('click', () => {
  const url = ($('url-input') as HTMLInputElement).value.trim();
  if (url) openUrl(url);
});
$('url-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('btn-url').click();
});

document.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropOverlay.classList.remove('hidden');
  dropOverlay.classList.add('dragover');
});

document.addEventListener('dragleave', (e) => {
  if (e.clientX === 0 && e.clientY === 0) {
    dropOverlay.classList.remove('dragover');
  }
});

document.addEventListener('drop', (e) => {
  e.preventDefault();
  dropOverlay.classList.remove('dragover');
  const file = e.dataTransfer?.files?.[0];
  if (file) openFile(file);
});

setStatus('Prêt — glissez un fichier .laz / .las pour commencer');
