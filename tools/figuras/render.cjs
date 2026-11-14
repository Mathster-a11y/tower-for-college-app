// HTML de cada figura → PNG a 2× con fondo transparente. Uso: node render.cjs <carpeta con figuras.json y fig_*.html>
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
(async () => {
  const dir = path.resolve(process.argv[2]);
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'figuras.json'), 'utf8'));
  const b = await chromium.launch();
  for (const pre of ['fig', 'rev']) for (const [k, m] of Object.entries(meta)) {
    const f = path.join(dir, `${pre}_${k}.html`); if (!fs.existsSync(f)) continue;
    const p = await b.newPage({ deviceScaleFactor: 2, viewport: { width: m.W, height: m.H } });
    await p.goto('file://' + f); await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: path.join(dir, `${pre}_${k}.png`), omitBackground: true, clip: { x: 0, y: 0, width: m.W, height: m.H } });
    await p.close();
  }
  await b.close();
})();
