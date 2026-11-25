const { chromium } = require('playwright');
// pasada antes de presentar: cada ejemplo, cada etapa con cada método, el túnel 3D (procesador) y las exportaciones.
// uso: npx vite build --outDir dist2 && npx vite preview --outDir dist2 --port 4180  y después
//      node tools/pasada_entrega.cjs carpeta_de_salida
const fs = require('fs'), path = require('path');
const S = process.argv[2] || 'pasada'; fs.mkdirSync(S, { recursive: true });
const EJ = ['b-ejemplo', 'b-ejemplo-asim', 'b-ejemplo-citicorp', 'b-ejemplo-chica', 'b-ejemplo-hancock', 'b-ejemplo-shanghai', 'b-ejemplo-hearst', 'b-ejemplo-gherkin', 'b-ejemplo-onterie', 'b-ejemplo-34'];
const ETAPAS = ['Diseño', 'Viento', 'Fuerzas', 'Estabilidad', 'Rigidez', 'Rototrasl', 'Flexión', 'Exoesqueleto', 'Carta', 'Resumen'];
const METODOS = ['Planilla', 'Guía', 'CIRSOC', 'FEM'];
const EXPORT = ['b-exportar', 'b-libros-zip', 'b-presentacion', 'b-tabla', 'b-guardar'];
const IMPRIMIR = ['b-desglose', 'b-carta-pdf', 'b-informe', 'b-lamina'];
const SOLO = process.env.SOLO ? process.env.SOLO.split(',') : null;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
  const pg = await ctx.newPage();
  let errs = []; pg.on('pageerror', e => errs.push(e.message.slice(0, 200))); pg.on('console', m => m.type() === 'error' && errs.push(m.text().slice(0, 200)));
  pg.on('dialog', d => d.dismiss().catch(() => {}));
  await pg.goto('http://localhost:4180/'); await pg.waitForTimeout(2000);
  const informe = [];
  const cerrar = () => pg.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
  for (const id of EJ) {
    if (SOLO && !SOLO.some(s => id.endsWith(s))) continue;
    errs = [];
    const t0 = Date.now();
    await pg.evaluate(i => document.getElementById(i).click(), id); await pg.waitForTimeout(3000); await cerrar();
    const linea = [`== ${id} (carga ${((Date.now() - t0) / 1000).toFixed(1)} s)`];
    for (const met of METODOS) {
      const bm = pg.locator('button', { hasText: new RegExp(`^${met}$`) }).first();
      if (await bm.count()) { await bm.click({ force: true }).catch(() => {}); await pg.waitForTimeout(1500); await cerrar(); }
      const mal = [];
      for (const et of ETAPAS) {
        const bt = pg.locator('#riel button', { hasText: et }).first();
        if (!(await bt.count())) continue;
        const e0 = errs.length, t1 = Date.now();
        await bt.click({ force: true }).catch(() => {}); await pg.waitForTimeout(900);
        const dt = Date.now() - t1;
        const txt = await pg.evaluate(() => document.body.innerText);
        if (/NaN|undefined|Infinity(?! )|\[object/.test(txt.replace(/Infinity\b/g, m => m))) {
          const m = txt.match(/.{0,40}(NaN|undefined|\[object).{0,40}/); mal.push(`${et}: texto raro «${m ? m[0].replace(/\n/g, ' ') : ''}»`);
        }
        if (errs.length > e0) mal.push(`${et}: ${errs.slice(e0).join(' / ')}`);
        if (dt > 4000) mal.push(`${et}: lenta (${dt} ms)`);
        if (met === 'CIRSOC' || met === 'Planilla') await pg.screenshot({ path: path.join(S, `${id}_${met}_${et}.png`) }).catch(() => {});
      }
      const res = await pg.evaluate(() => (document.querySelector('#centro-dibujos, main')?.innerText.match(/no verifican? \d+|\d+ no verifican?/i) || [''])[0]);
      linea.push(`  ${met}: ${mal.length ? mal.join(' · ') : 'ok'} ${res}`);
    }
    // exportaciones (con el método CIRSOC elegido al final)
    for (const ex of EXPORT) {
      try {
        await pg.evaluate(() => document.getElementById('b-exportar-menu').click());
        const espera = pg.waitForEvent('download', { timeout: 90000 });
        await pg.evaluate(i => document.getElementById(i).click(), ex);
        if (ex === 'b-exportar') { await pg.waitForTimeout(800); await pg.locator('#dialogo button', { hasText: 'Escribir y descargar' }).click(); }
        const dl = await espera;
        const f = path.join(S, `${id}_${dl.suggestedFilename()}`); await dl.saveAs(f);
        linea.push(`  ${ex}: ${dl.suggestedFilename()} ${(fs.statSync(f).size / 1024).toFixed(0)} kB`);
      } catch (e) { linea.push(`  ${ex}: SIN DESCARGA (${e.message.slice(0, 80)})`); }
      await cerrar(); await pg.keyboard.press('Escape').catch(() => {});
    }
    // lo que se imprime (abre otra ventana con la hoja lista para imprimir o guardar como PDF)
    for (const ex of IMPRIMIR) {
      try {
        const e0 = errs.length;
        await pg.evaluate(() => document.getElementById('b-exportar-menu').click());
        const espera = ctx.waitForEvent('page', { timeout: 90000 });
        await pg.evaluate(i => document.getElementById(i).click(), ex);
        const w = await espera; const we = []; w.on('pageerror', e => we.push(e.message.slice(0, 120)));
        await w.waitForLoadState('load').catch(() => {}); await w.waitForTimeout(4000);
        const info = await w.evaluate(() => ({ n: document.body.innerText.length, svg: document.querySelectorAll('svg, img, canvas').length, raro: (document.body.innerText.match(/.{0,30}(NaN|undefined|\[object).{0,30}/) || [''])[0] }));
        await w.screenshot({ path: path.join(S, `${id}_${ex}.png`) }).catch(() => {});
        linea.push(`  ${ex}: ventana con ${info.n} letras y ${info.svg} dibujos${info.raro ? ` · texto raro «${info.raro}»` : ''}${we.length ? ` · errores ${we.join(' / ')}` : ''}${errs.length > e0 ? ` · ${errs.slice(e0).join(' / ')}` : ''}`);
        await w.close();
      } catch (e) { linea.push(`  ${ex}: NO ABRIÓ (${e.message.slice(0, 80)})`); }
      await cerrar();
    }
    if (errs.length) linea.push(`  errores: ${[...new Set(errs)].slice(0, 5).join(' / ')}`);
    console.log(linea.join('\n')); informe.push(linea.join('\n'));
  }
  fs.writeFileSync(path.join(S, 'informe.txt'), informe.join('\n'));
  await b.close();
})();
