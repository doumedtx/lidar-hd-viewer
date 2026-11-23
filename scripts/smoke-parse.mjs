import { readFile } from 'node:fs/promises';

const moduleRoot = new URL('../node_modules/@loaders.gl/las/dist/', import.meta.url).pathname;
const lazy = (p) => import(moduleRoot + p);

const bytes = await readFile(moduleRoot + 'libs/laz-rs-wasm/laz_rs_wasm_bg.wasm');
const lazRs = await lazy('libs/laz-rs-wasm/laz_rs_wasm.js');
lazRs.initSync({ module: await WebAssembly.compile(bytes) });

const path = process.argv[2];
if (!path) {
  console.error('usage: node smoke-parse.mjs <file.las|file.laz>');
  process.exit(1);
}

const { parseLAS } = await lazy('lib/laz-rs-wasm/parse-las.js');

const buffer = await readFile(path);
const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
const t0 = performance.now();
const cloud = parseLAS(ab);
const dt = performance.now() - t0;

const attrs = cloud.attributes;
const count = cloud.header.vertexCount;
const bb = cloud.header.boundingBox;
assert(count > 0, 'point count');
assert(attrs.POSITION && attrs.intensity && attrs.classification, 'attributes present');
assert(Number.isFinite(bb[0][0]) && Number.isFinite(bb[1][2]), 'bounding box');

let maxC = 0;
const cls = attrs.classification.value;
for (let i = 0; i < count; i++) maxC = Math.max(maxC, cls[i]);
assert(maxC > 0 && maxC < 32, 'classification values in range, max=' + maxC);

assert(attrs.COLOR_0, 'RGB colors parsed');

console.log('OK', count, 'points in', dt.toFixed(0), 'ms');
console.log('bbox', JSON.stringify(bb));

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}
