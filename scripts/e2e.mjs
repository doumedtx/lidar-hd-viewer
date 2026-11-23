import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const root = join(process.cwd(), 'dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm' };

const server = createServer(async (req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  try {
    const data = await readFile(join(root, p));
    res.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((r) => server.listen(4173, r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto('http://localhost:4173/');
await page.waitForSelector('#drop-overlay');

await page.setInputFiles('#file-input', '/tmp/test.laz');
await page.waitForFunction(
  () => document.getElementById('file-info')?.textContent?.includes('50'),
  { timeout: 30000 }
);

const info = await page.textContent('#file-info');
const stats = await page.textContent('#stats');
console.log('FILE_INFO:', info);
console.log('STATS:', stats);

await page.screenshot({ path: '/tmp/v1_classification.png' });

await page.selectOption('#color-mode', 'elevation');
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/v1_elevation.png' });

await page.selectOption('#color-mode', 'intensity');
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/v1_intensity.png' });

await page.click('#btn-top');
await page.selectOption('#color-mode', 'classification');
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/v1_top.png' });

const classItems = await page.locator('.class-item').count();
console.log('CLASS_ITEMS:', classItems);

await browser.close();
server.close();

const serious = errors.filter((e) => !e.includes('GPU stall') && !/favicon/i.test(e));
console.log('CONSOLE_ISSUES:', serious.length ? serious.join('\n') : 'none');
