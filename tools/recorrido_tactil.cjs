const { chromium } = require('playwright');
// recorrido táctil del plan de entrega (inciso 1): 3 tamaños, pantalla táctil, todas las etapas; capturas en la carpeta del 1er argumento
// uso: npx vite preview --outDir dist --port 4180  y después  node tools/recorrido_tactil.cjs /tmp/capturas
const S = process.argv[2] || 'capturas_tactil'; require('fs').mkdirSync(S, { recursive: true });
(async () => {
  const b = await chromium.launch();
  const tams = [[1366, 768, 'notebook'], [1024, 768, 'tablet_apaisada'], [820, 1180, 'tablet_vertical']];
  const etapas = ['Diseño', 'Viento', 'Fuerzas', 'Estabilidad', 'Rigidez', 'Rototrasl', 'Flexión', 'Exoesqueleto', 'Carta', 'Resumen'];
  for (const [w, hh, nom] of tams) {
    const ctx = await b.newContext({ viewport: { width: w, height: hh }, hasTouch: true, isMobile: false });
    const pg = await ctx.newPage();
    const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && errs.push(m.text().slice(0, 160)));
    await pg.goto('http://localhost:4180/'); await pg.waitForTimeout(1500);
    await pg.evaluate(() => document.getElementById('b-ejemplo').click()); await pg.waitForTimeout(2500);
    await pg.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
    const res = [];
    for (const et of etapas) {
      const bt = pg.locator('#riel button', { hasText: et }).first();
      if (!(await bt.count())) { res.push(`${et}: sin botón en el riel`); continue; }
      await bt.tap().catch(async () => { await bt.click({ force: true }); }); await pg.waitForTimeout(1500);
      const info = await pg.evaluate(() => {
        const vis = (e) => { const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none'; };
        const bs = [...document.querySelectorAll('button, [role=button], select, input[type=checkbox], input[type=range]')].filter(vis);
        const fuera = bs.filter(e => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; }).map(e => (e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 30));
        const chicos = bs.filter(e => { const r = e.getBoundingClientRect(); return (r.height < 30 || r.width < 30) && e.tagName === 'BUTTON' && !e.closest('svg'); }).map(e => `${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 18)}(${Math.round(e.getBoundingClientRect().width)}×${Math.round(e.getBoundingClientRect().height)})`);
        return { fuera: [...new Set(fuera)].slice(0, 6), chicos: [...new Set(chicos)].slice(0, 8), nChicos: new Set(chicos).size, scrollX: document.documentElement.scrollWidth > innerWidth + 2 };
      });
      res.push(`${et}: fuera ${info.fuera.length ? info.fuera.join(' | ') : 0} · chicos ${info.nChicos}${info.nChicos ? ` (${info.chicos.join(', ')})` : ''}${info.scrollX ? ' · DESPLAZA DE COSTADO' : ''}`);
      await pg.screenshot({ path: `${S}/${nom}_${et}.png` });
    }
    console.log(`== ${nom} ${w}×${hh} · errores ${errs.length} ${errs.slice(0, 3).join(' / ')}`); console.log(res.join('\n'));
    await ctx.close();
  }
  await b.close();
})();
