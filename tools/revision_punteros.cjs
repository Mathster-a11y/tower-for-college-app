/**
 * Revisión de la planta con mouse, lápiz y toque: los mismos gestos con los tres punteros (por el protocolo de Chrome:
 * Input.dispatchMouseEvent con pointerType 'pen' para el lápiz e Input.dispatchTouchEvent para el dedo).
 *
 * Uso: con la app en marcha (npx vite --port 5191 --strictPort), `node tools/revision_punteros.cjs [mouse|pen|touch]`.
 * Escribe una línea «ok» o «MAL» por prueba y las capturas en la carpeta temporal del sistema.
 */
const { chromium } = require('playwright');
const D = require('path').join(require('os').tmpdir(), 'revision_punteros_');
const SOLO = process.argv[2];
const URL = process.env.TORRE_URL ?? 'http://localhost:5191/';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
  const pg = await ctx.newPage();
  const cdp = await ctx.newCDPSession(pg);
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const espera = ms => pg.waitForTimeout(ms);
  // gesto: apoyar en el primer punto, pasar por los del medio y levantar en el último
  async function gesto(tipo, pts, o = {}) {
    const pasos = o.pasos ?? 6;
    if (tipo === 'touch') {
      const tp = (p) => [{ x: p[0], y: p[1], id: 1, radiusX: 4, radiusY: 4, force: 1 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(pts[0]) });
      for (let i = 1; i < pts.length; i++) for (let k = 1; k <= pasos; k++) { const a = pts[i - 1], c = pts[i]; await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp([a[0] + (c[0] - a[0]) * k / pasos, a[1] + (c[1] - a[1]) * k / pasos]) }); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      const ev = (type, p, extra = {}) => cdp.send('Input.dispatchMouseEvent', { type, x: p[0], y: p[1], button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: o.clicks ?? 1, pointerType: tipo, ...extra });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts[0][0], y: pts[0][1], button: 'none', buttons: 0, pointerType: tipo });
      await ev('mousePressed', pts[0]);
      for (let i = 1; i < pts.length; i++) for (let k = 1; k <= pasos; k++) { const a = pts[i - 1], c = pts[i]; await ev('mouseMoved', [a[0] + (c[0] - a[0]) * k / pasos, a[1] + (c[1] - a[1]) * k / pasos]); }
      await ev('mouseReleased', pts[pts.length - 1]);
    }
    await espera(o.espera ?? 250);
  }
  const toque = (tipo, p, o) => gesto(tipo, [p], o);
  const est = (f) => pg.evaluate(async (src) => { const { estado } = await import('/src/ui/estado.ts'); return new Function('estado', 'return (' + src + ')(estado)')(estado); }, f.toString());
  const caja = async (sel) => { if (!(await pg.locator(sel).count())) return null; const r = await pg.locator(sel).first().boundingBox({ timeout: 3000 }).catch(() => null); return r ? [r.x + r.width / 2, r.y + r.height / 2, r] : null; };
  const res = [];
  const anota = (tipo, prueba, ok, det = '') => { res.push({ tipo, prueba, ok, det }); console.log(`${ok ? 'ok ' : 'MAL'} [${tipo}] ${prueba}${det ? ' · ' + det : ''}`); };
  async function inicio() {
    await pg.goto(URL); await espera(1200);
    await pg.evaluate(async () => { localStorage.clear(); localStorage.setItem('torre3d.indicaciones', '1'); const { estado } = await import('/src/ui/estado.ts'); const { ejemploGuia } = await import('/src/engine/modelo.ts'); estado.reemplazar(ejemploGuia()); });
    await pg.reload(); await espera(1600);
  }
  // (el botón se lleva a la vista antes, como haría una persona: en una carta larga puede estar más abajo)
  const boton = async (tipo, sel) => { await pg.locator(sel).first().scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {}); const c = await caja(sel); if (!c) throw new Error('no está ' + sel); await toque(tipo, [c[0], c[1]]); };

  for (const tipo of ['mouse', 'pen', 'touch']) {
    if (SOLO && SOLO !== tipo) continue;
    await inicio();
    // 1 · elegir un muro
    let c = await caja('[data-muro="M1"] polygon, [data-muro="M1"] rect');
    await toque(tipo, [c[0], c[1]]);
    anota(tipo, 'elegir un muro', await est(e => e.seleccion) === 'M1', String(await est(e => e.seleccion)));
    await espera(700);                                   // (si no, el toque siguiente es un doble toque)
    // 2 · arrastrar el muro elegido 60 px a la derecha
    const x0 = await est(e => e.proyecto.muros.find(m => m.id === 'M1').x);
    c = await caja('[data-muro="M1"] polygon, [data-muro="M1"] rect');
    await gesto(tipo, [[c[0], c[1]], [c[0] + 60, c[1]]]);
    const x1 = await est(e => e.proyecto.muros.find(m => m.id === 'M1').x);
    anota(tipo, 'arrastrar un muro', x1 > x0 + 0.5, `${x0} → ${x1}`);
    await pg.keyboard.press('Control+z'); await espera(300);
    // 3 · tocar el fondo suelta la selección
    const sv = await caja('svg.planta');
    // el fondo libre empieza debajo de la tira de pasos y de la barra de herramientas (en una notebook ocupan arriba)
    const libre = await pg.evaluate(() => Math.max(0, ...[...document.querySelectorAll('.pasos-torre, .herr-planta')].filter(e => !e.hidden).map(e => e.getBoundingClientRect().bottom)));
    const yFondo = Math.max(sv[2].y + sv[2].height * 0.22, libre + 30), yDib = Math.max(sv[2].y + 90, libre + 40);
    await espera(700); await toque(tipo, [sv[2].x + sv[2].width * 0.2, yFondo]);
    anota(tipo, 'tocar el fondo suelta', await est(e => e.seleccion) === null, String(await est(e => e.seleccion)));
    // 4 · desplazar la vista arrastrando el fondo
    const m0 = (await caja('[data-muro="M2"] polygon, [data-muro="M2"] rect'))[0];
    await gesto(tipo, [[sv[2].x + sv[2].width * 0.2, yFondo], [sv[2].x + sv[2].width * 0.2 + 100, yFondo]]);
    const m1 = (await caja('[data-muro="M2"] polygon, [data-muro="M2"] rect'))[0];
    await espera(1000);
    anota(tipo, 'correr la vista con el fondo', Math.abs(m1 - m0 - 100) < 15, `${(m1 - m0).toFixed(0)} px`);
    // 5 · dibujar un muro (dos toques) y terminar con doble toque / Esc
    await boton(tipo, '.herr-planta button:has(.tx:text-is("Dibujar"))');
    const n0 = await est(e => e.proyecto.muros.length);
    const pA = [sv[2].x + sv[2].width * 0.35, yDib], pB = [sv[2].x + sv[2].width * 0.6, yDib];
    await toque(tipo, pA, { espera: 450 }); await toque(tipo, pB, { espera: 450 });
    const n1 = await est(e => e.proyecto.muros.length);
    anota(tipo, 'dibujar un muro con dos toques', n1 === n0 + 1, `${n0} → ${n1}`);
    if (tipo === 'mouse') await pg.keyboard.press('Escape'); else await toque(tipo, pB, { espera: 300 });
    const enc = await pg.evaluate(() => document.querySelector('svg.planta .tramo-nuevo, svg.planta .muro-nuevo, svg.planta line.goma') !== null);
    anota(tipo, 'terminar el encadenado', (await est(e => e.proyecto.muros.length)) === n1, `muros ${await est(e => e.proyecto.muros.length)}`);
    await pg.keyboard.press('Escape'); await espera(200);
    await boton(tipo, '.herr-planta button:has(.tx:text-is("Mover"))');
    // 6 · menú Ayudas abre y cierra
    await boton(tipo, '.herr-planta button:has(.tx:text-is("Ayudas"))');
    const abre = await pg.locator('.menu-mas-lista:not([hidden])').count();
    if (process.env.DEPURAR) console.log('menú', JSON.stringify(await pg.evaluate(() => { const b = [...document.querySelectorAll('.herr-planta button')].find(x => x.textContent === 'Ayudas ▾'); const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return [Math.round(r.x), Math.round(r.y), e.tagName + '.' + e.className + ':' + e.textContent.slice(0, 12)]; })));
    await toque(tipo, [sv[2].x + sv[2].width * 0.5, sv[2].y + sv[2].height * 0.9]);
    const cierra = await pg.locator('.menu-mas-lista:not([hidden])').count();
    anota(tipo, 'menú Ayudas abre y se cierra afuera', abre === 1 && cierra === 0, `${abre}/${cierra}`);
    // 7 · carta: mover con el asa y cambiar el tamaño
    await boton(tipo, '.herr-planta button:has(.tx:text-is("Colocar"))'); await espera(400);
    const asa = await caja('.dock-planta > .asa-mover');
    const pos0 = (await caja('.dock-planta'))[2];
    if (asa) await gesto(tipo, [[asa[0], asa[1]], [asa[0] + 80, asa[1] + 40]]);
    const pos1 = (await caja('.dock-planta'))[2];
    anota(tipo, 'mover una carta con el asa', !!asa && Math.abs(pos1.x - pos0.x - 80) < 12, asa ? `${(pos1.x - pos0.x).toFixed(0)} px` : 'sin asa');
    const tam = await caja('.colocar-panel:not([hidden]) .asa-tamano');
    const w0 = (await caja('.colocar-panel:not([hidden])'))[2].width;
    if (tam) await gesto(tipo, [[tam[0], tam[1]], [tam[0] + 70, tam[1] - 60]]);
    const w1 = (await caja('.colocar-panel:not([hidden])'))[2].width;
    anota(tipo, 'agrandar una carta con el tirador', !!tam && w1 > w0 + 40, tam ? `${w0.toFixed(0)} → ${w1.toFixed(0)}` : 'sin tirador');
    await boton(tipo, '.herr-planta button:has(.tx:text-is("Colocar"))'); await espera(300);
    // 8 · losa: arrastrar un vértice (con las cartas en su lugar)
    await inicio();
    await boton(tipo, '.herr-planta button:has(.tx:text-is("Losa"))'); await espera(500);
    const vtx = await caja('svg.planta .manija-vertice');
    const s0 = await est(e => JSON.stringify(e.proyecto.niveles.find(n => n.nombre === 'PB').silueta ?? null));
    if (vtx) await gesto(tipo, [[vtx[0], vtx[1]], [vtx[0] - 40, vtx[1] - 30]]);
    const s1 = await est(e => JSON.stringify(e.proyecto.niveles.find(n => n.nombre === 'PB').silueta ?? null));
    await pg.screenshot({ path: D + tipo + '_losa.png' });
    anota(tipo, 'losa: arrastrar un vértice', !!vtx && s0 !== s1, vtx ? '' : 'sin manija');
    // 9 · losa a mano: cuatro toques y cerrar tocando el primero
    const det = pg.locator('.losa-cero'); if ((await det.getAttribute('open')) === null) await boton(tipo, '.losa-cero summary');
    await boton(tipo, '.losa-cero button:has-text("Dibujar la losa a mano")'); await espera(300);
    const cx = sv[2].x + sv[2].width * 0.62, cy = sv[2].y + sv[2].height * 0.5;
    for (const [dx, dy] of [[-90, 80], [90, 80], [90, -80], [-90, -80], [-90, 80]]) await toque(tipo, [cx + dx, cy + dy], { espera: 200 });
    await pg.screenshot({ path: D + tipo + '_amano.png' });
    const sm = await est(e => (e.proyecto.niveles.find(n => n.nombre === 'PB').silueta ?? []).length);
    anota(tipo, 'losa a mano: cuatro toques y cerrar', sm === 4, `${sm} vértices`);
    // 10 · editor de contornos: arrastrar el centro de un arco
    await pg.evaluate(async () => { const { estado } = await import('/src/ui/estado.ts'); estado.cambiar(p => { p.niveles.find(n => n.nombre === 'PB').silueta = [{ x: -10, y: -8, b: 0.25 }, { x: 10, y: -8 }, { x: 10, y: 8 }, { x: -10, y: 8 }]; }); });
    await espera(400);
    await boton(tipo, '.silueta-panel button:has-text("Herramientas CAD")'); await espera(600);
    const ah = await caja('[data-h="arco:0:0"]');
    if (ah) await toque(tipo, [ah[0], ah[1]]);
    const ch = await caja('[data-h="centro:0:0"]');
    const b0 = await pg.evaluate(() => document.querySelector('.contorno-panel')?.textContent?.match(/radio/) !== null);
    if (ch) await gesto(tipo, [[ch[0], ch[1]], [ch[0], ch[1] - 80]]);
    const rad = await pg.evaluate(() => { const i = [...document.querySelectorAll('.contorno-panel label')].find(l => l.textContent.startsWith('radio'))?.querySelector('input'); return i ? i.value : null; });
    anota(tipo, 'arco: elegir y arrastrar el centro', !!ah && !!ch && rad !== null && parseFloat(rad.replace(',', '.')) > 22, `radio ${rad}`);
    await pg.keyboard.press('Escape'); await espera(300);
    // 11 · mantener apretado un vértice de la losa (en el toque eso es el «clic derecho») y después arrastrarlo
    await pg.keyboard.press('Escape'); await espera(200);
    if ((await pg.locator('.herr-planta button:has(.tx:text-is("Losa"))').getAttribute('aria-pressed')) !== 'true') await boton(tipo, '.herr-planta button:has(.tx:text-is("Losa"))');
    await espera(400);
    const nv0 = await est(e => (e.proyecto.niveles.find(n => n.nombre === 'PB').silueta ?? []).length);
    const vt = await caja('svg.planta .manija-vertice');
    if (vt) {
      if (tipo === 'touch') { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: vt[0], y: vt[1], id: 1 }] }); await espera(900); for (let k = 1; k <= 5; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: vt[0] - k * 6, y: vt[1] - k * 4, id: 1 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
      else { await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: vt[0], y: vt[1], button: 'left', buttons: 1, clickCount: 1, pointerType: tipo }); await espera(900); for (let k = 1; k <= 5; k++) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: vt[0] - k * 6, y: vt[1] - k * 4, button: 'left', buttons: 1, pointerType: tipo }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: vt[0] - 30, y: vt[1] - 20, button: 'left', buttons: 0, clickCount: 1, pointerType: tipo }); }
      await espera(400);
    }
    const nv1 = await est(e => (e.proyecto.niveles.find(n => n.nombre === 'PB').silueta ?? []).length);
    const menu = await pg.locator('.menu-contextual:not([hidden])').count();
    anota(tipo, 'mantener apretado un vértice no lo borra', !!vt && nv1 === nv0, `${nv0} → ${nv1} vértices${menu ? ' · se abrió un menú' : ''}`);
    await pg.keyboard.press('Escape'); await espera(200);
    await boton(tipo, '.herr-planta button:has(.tx:text-is("Mover"))').catch(() => {});
    // 12 · pellizcar (solo con dos dedos)
    if (tipo === 'touch') {
      const svz = (await caja('svg.planta'))[2], cxz = svz.x + svz.width * 0.55, cyz = svz.y + svz.height * 0.5;
      const ancho0 = (await caja('[data-muro="M2"] polygon, [data-muro="M2"] rect'))[2].height;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cxz - 40, y: cyz, id: 1 }, { x: cxz + 40, y: cyz, id: 2 }] });
      for (let k = 1; k <= 8; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cxz - 40 - k * 10, y: cyz, id: 1 }, { x: cxz + 40 + k * 10, y: cyz, id: 2 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await espera(500);
      const ancho1 = (await caja('[data-muro="M2"] polygon, [data-muro="M2"] rect'))[2].height;
      const n0p = await est(e => e.proyecto.muros.length);
      anota(tipo, 'pellizcar acerca sin mover muros', ancho1 > ancho0 * 1.5, `alto de M2 ${ancho0.toFixed(0)} → ${ancho1.toFixed(0)} px · muros ${n0p}`);
    }
    // 13 · exoesqueleto 3D: tocar elige una barra; arrastrar gira sin elegir
    await pg.evaluate(async () => { const { estado } = await import('/src/ui/estado.ts'); const { EXO_POR_DEFECTO } = await import('/src/engine/exo.ts'); estado.cambiar(p => { p.exo = structuredClone(EXO_POR_DEFECTO); }); });
    await boton(tipo, ':text-is("Exoesqueleto"):visible'); await espera(800);
    await boton(tipo, 'button:has-text("Diseño 3D")'); await espera(1200);
    const lz = (await caja('.exo3d-lienzo canvas'))?.[2];
    let elegida = false;
    if (lz) for (let dx = -160; dx <= 160 && !elegida; dx += 10) for (let dy = -180; dy <= 180 && !elegida; dy += 30) { await toque(tipo, [lz.x + lz.width / 2 + dx, lz.y + lz.height / 2 + dy], { espera: 30 }); elegida = (await pg.locator('.exo3d-n').count()) > 0; }
    anota(tipo, 'exo 3D: tocar una barra la elige', elegida);
    if (lz) { await pg.keyboard.press('Escape'); await espera(200); const antes = await pg.locator('.exo3d-n').count(); await gesto(tipo, [[lz.x + lz.width * 0.3, lz.y + lz.height * 0.8], [lz.x + lz.width * 0.6, lz.y + lz.height * 0.75]]); const despues = await pg.locator('.exo3d-n').count(); anota(tipo, 'exo 3D: arrastrar gira y no elige', despues === 0, `${antes} → ${despues}`); }
    await pg.screenshot({ path: D + tipo + '.png' });
  }
  console.log('errores', JSON.stringify(errs.slice(0, 8)));
  require('fs').writeFileSync(D + 'res.json', JSON.stringify(res, null, 1));
  await b.close();
})();
