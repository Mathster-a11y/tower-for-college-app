// Genera las guías de cálculo de cada método en PDF (docs/guia_metodo_*.pdf) con el ejemplo de la guía 2024.
// Uso: npm run build && npx vite preview --port 4179  (en otra terminal)  →  node tools/guias_pdf.cjs [url]
// Usa el mismo botón «Guía del método … (imprimir o PDF)» de la etapa Ecuaciones: el PDF dice lo mismo que la app.
const { chromium } = require('playwright');
const path = require('path');

const url = process.argv[2] || 'http://localhost:4179/';
const METODOS = [['Guía', 'guia'], ['Planilla', 'planilla'], ['CIRSOC', 'cirsoc'], ['FEM', 'fem'], ['Flujo', 'flujo']];

(async () => {
  const b = await chromium.launch();
  const pg = await (await b.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  const errores = [];
  pg.on('pageerror', e => errores.push(e.message));
  await pg.goto(url);
  await pg.waitForTimeout(1500);
  await pg.evaluate(() => { document.getElementById('b-ejemplo').click(); });
  await pg.waitForTimeout(2000);
  await pg.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); window.print = () => undefined; });
  await pg.locator('#riel button', { hasText: 'Ecuaciones' }).click();
  await pg.waitForTimeout(800);
  for (const [metodo, archivo] of METODOS) {
    await pg.locator('#subpasos button', { hasText: metodo }).first().click();
    await pg.waitForTimeout(1500);
    await pg.locator('button', { hasText: `Guía del método ${metodo}` }).click();
    await pg.waitForSelector('.guia-impresion[data-listo="1"]', { timeout: 60000 });
    await pg.emulateMedia({ media: 'print' });
    const salida = path.join(__dirname, '..', 'docs', `guia_metodo_${archivo}.pdf`);
    await pg.pdf({ path: salida, preferCSSPageSize: true, printBackground: true });
    await pg.emulateMedia({ media: 'screen' });
    await pg.locator('.guia-barra button', { hasText: 'Cerrar' }).click();
    console.log('listo', salida);
  }
  // el glosario completo (unidades, la simulación paso a paso y las variables de los cinco métodos)
  await pg.locator('#panel button', { hasText: 'Glosario y unidades' }).click();
  await pg.waitForSelector('.guia-impresion[data-listo="1"]', { timeout: 60000 });
  await pg.emulateMedia({ media: 'print' });
  const glos = path.join(__dirname, '..', 'docs', 'glosario_y_unidades.pdf');
  await pg.pdf({ path: glos, format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' } });
  await pg.emulateMedia({ media: 'screen' });
  console.log('listo', glos);
  if (errores.length) console.log('errores', errores);
  await b.close();
})();
