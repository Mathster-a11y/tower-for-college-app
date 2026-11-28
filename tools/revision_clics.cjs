/**
 * Revisión de clics con el mouse (los errores que no aparecen con el dedo):
 *  1. «clic perdido»: se escribe en un campo y, sin salir de él, se hace clic con el mouse en un botón de la misma
 *     carta. Al apretar, el campo pierde el foco y aplica su valor; si eso rearma la carta en ese momento, el botón
 *     apretado se reemplaza y el navegador no cuenta el clic (y la carta vuelve arriba).
 *  2. «tapado»: un botón visible que, en su centro, tiene otro elemento encima (no se puede apretar ahí).
 * Recorre todas las etapas y sus pasos, y las cartas de la planta. Uso: con la app en marcha
 * (npx vite --port 5191 --strictPort), `node tools/revision_clics.cjs [ejemplo]` (guia, citicorp, gherkin).
 */
const { chromium } = require('playwright');
const URL = process.env.TORRE_URL ?? 'http://localhost:5191/';
const EJEMPLO = process.argv[2] ?? 'guia';
const ETAPAS = ['diseno', 'viento', 'fuerzas', 'estabilidad', 'rigidez', 'rototrasl', 'flexion', 'exo', 'carta', 'resumen', 'ecuaciones', 'ayuda'];
// botones que no se aprietan en la prueba (cambian de proyecto, abren archivos o ventanas, borran)
const PELIGRO = /borrar|eliminar|quitar|sacar|exportar|descargar|bajar|abrir|importar|nuevo|nueva|ejemplo|imprimir|grabar|copiar|pegar|limpiar|reiniciar|empezar|simular|correr|probar|vaciar|cambiar a|dimensionar|aplicar a los|calcular|⤓|↗|presentación|todas/i;

(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errores = []; pg.on('pageerror', e => errores.push(e.message));
  const hallazgos = [];
  await pg.goto(URL); await pg.waitForTimeout(800);
  const cargar = async (etapa) => {
    await pg.evaluate(e => { localStorage.clear(); localStorage.setItem('torre3d.indicaciones', '1'); localStorage.setItem('torre3d.etapa', e); }, etapa);
    await pg.reload(); await pg.waitForTimeout(1200);
    await pg.evaluate(async ej => {
      const { estado } = await import('/src/ui/estado.ts');
      const m = ej === 'guia' ? (await import('/src/engine/modelo.ts')).ejemploGuia() : ej === 'citicorp' ? (await import('/src/engine/modelo.ts')).ejemploCiticorp() : (await import('/src/engine/ejemplosExo.ts')).ejemploGherkin();
      estado.reemplazar(m);
    }, EJEMPLO);
    await pg.waitForTimeout(2500);
    await pg.evaluate(() => {
      window.__perdidos = []; window.__md = null;
      const nombre = el => (el.closest('button, [role=button], label, summary')?.textContent ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
      document.addEventListener('mousedown', e => { window.__md = e.target; window.__mdNombre = nombre(e.target); }, true);
      document.addEventListener('mouseup', () => { const t = window.__md; if (t && !t.isConnected) window.__perdidos.push(window.__mdNombre); }, true);
    });
  };
  // las vistas de una etapa: la etapa sola y cada paso de #subpasos (y de la planta, en Diseño)
  const vistas = async () => (await pg.evaluate(() => [...document.querySelectorAll('#subpasos button, .pasos-torre button')].filter(x => x.offsetParent).map(x => x.textContent.trim()).filter(Boolean))).slice(0, 12);
  for (const etapa of ETAPAS) {
    await cargar(etapa);
    const pasos = ['', ...await vistas()];
    for (const paso of pasos) {
      if (paso) { await cargar(etapa); const l = pg.locator('#subpasos button, .pasos-torre button', { hasText: paso }).first(); if (!(await l.count())) continue; await l.click().catch(() => {}); await pg.waitForTimeout(1500); }
      const donde = `${etapa}${paso ? ` › ${paso}` : ''}`;
      // 2 · botones tapados
      const tapados = await pg.evaluate(() => [...document.querySelectorAll('button')].filter(x => {
        const r = x.getBoundingClientRect(); if (!x.offsetParent || x.closest('[inert]') || (x.closest('details:not([open])') && !x.closest('summary')) || r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false;
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        // fuera de lo visible de un contenedor que recorta (una carta o un panel con barra de desplazamiento): se ve al bajar
        for (let p = x.parentElement; p; p = p.parentElement) {
          const cs = getComputedStyle(p); if (!/(auto|scroll|hidden|clip)/.test(cs.overflow + cs.overflowX + cs.overflowY)) continue;
          const q = p.getBoundingClientRect(); if (cx < q.left || cx > q.right || cy < q.top || cy > q.bottom) return false;
        }
        const e = document.elementFromPoint(cx, cy);
        // (un contenedor con barra de desplazamiento que recorta el botón no cuenta: se ve al bajar)
        return e && e !== x && !x.contains(e) && !e.contains(x) && !e.closest('.globo, [role=tooltip]');
      }).map(x => { const r = x.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return `«${(x.textContent || x.getAttribute('aria-label') || '').trim().slice(0, 24)}» bajo ${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}`; }));
      tapados.forEach(t => hallazgos.push(`${donde}: tapado ${t}`));
      // 3 · pasar el mouse por encima: si rearma la vista, el botón se reemplaza y el clic que sigue se pierde
      const nB = await pg.evaluate(() => { let n = 0; document.querySelectorAll('button').forEach(x => { if (x.offsetParent && !x.closest('details:not([open])')) x.dataset.rh = String(n++); }); return n; });
      for (let k = 0; k < Math.min(nB, 60); k++) {
        const l = pg.locator(`[data-rh="${k}"]`);
        const r = await l.boundingBox().catch(() => null);
        if (!r || r.y < 0 || r.y > 900 || r.x < 0 || r.x > 1440) continue;
        await pg.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await pg.waitForTimeout(60);
        const sigue = await pg.evaluate(k2 => !!document.querySelector(`[data-rh="${k2}"]`), k);
        if (!sigue) hallazgos.push(`${donde}: pasar el mouse por encima rearma la vista (el botón ${k} se reemplaza)`);
      }
      await pg.mouse.move(2, 2);
      // 1 · escribir en un campo y apretar un botón de su carta sin salir del campo
      const casos = await pg.evaluate(peligro => {
        const re = new RegExp(peligro, 'i');
        const out = [];
        document.querySelectorAll('input[type=number], input[type=text]:not([readonly])').forEach((inp, i) => {
          if (!inp.offsetParent || inp.disabled || (inp.closest('details:not([open])') && !inp.closest('summary'))) return;
          const caja = inp.closest('.calco-panel, .carta, details, section, .seccion, .bloque, .panel, fieldset, .formulario') ?? inp.parentElement;
          const bt = [...caja.querySelectorAll('button')].find(x => x.offsetParent && !x.disabled && !re.test(x.textContent + ' ' + (x.title || '')));
          if (!bt) return;
          inp.dataset.rc = String(i); bt.dataset.rcb = String(i);
          out.push({ i, campo: (inp.closest('label')?.textContent || inp.getAttribute('aria-label') || inp.name || '').trim().slice(0, 30), boton: bt.textContent.trim().slice(0, 30) });
        });
        return out.slice(0, 8);
      }, PELIGRO.source);
      for (const c of casos) {
        const inp = pg.locator(`[data-rc="${c.i}"]`), bt = pg.locator(`[data-rcb="${c.i}"]`);
        if (!(await inp.count()) || !(await bt.count())) continue;
        await pg.evaluate(() => { window.__perdidos = []; });
        try {
          await inp.click({ timeout: 2000 });
          const v = await inp.inputValue();
          const n = parseFloat(v.replace(',', '.'));
          await inp.fill(isFinite(n) ? String(+(n * 1.01 + 0.01).toFixed(3)) : `${v}x`);
          const r = await bt.boundingBox({ timeout: 2000 });
          if (!r) continue;
          await pg.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await pg.mouse.down(); await pg.waitForTimeout(80); await pg.mouse.up();
          await pg.waitForTimeout(300);
          const perdidos = await pg.evaluate(() => window.__perdidos);
          if (perdidos.length) hallazgos.push(`${donde}: clic perdido en «${perdidos[0]}» después de escribir en «${c.campo}»`);
        } catch { /* el campo o el botón se fueron con la vista: se sigue */ }
        await pg.evaluate(async () => { const { estado } = await import('/src/ui/estado.ts'); while (estado.puedeDeshacer) estado.deshacer(); });
        await pg.keyboard.press('Escape').catch(() => {});
      }
    }
  }
  // el caso del usuario: el contorno de un muro (el mismo editor que el de las losas), escribir una medida y, sin
  // salir del campo, «Listo» con el mouse: la carta se tiene que cerrar con la medida nueva
  await cargar('diseno');
  await pg.locator('.pasos-torre button', { hasText: 'Estructura' }).first().click().catch(() => {}); await pg.waitForTimeout(500);
  await pg.locator('button:visible', { hasText: /^Mover$/ }).first().click().catch(() => {}); await pg.waitForTimeout(500);
  const muro = pg.locator('[data-muro="M1"] polygon, [data-muro="M1"] rect').first();
  if (await muro.count()) {
    await muro.click({ force: true }); await pg.waitForTimeout(600);
    const bc = pg.locator('button:has-text("Contorno…"):visible').first();
    if (await bc.count()) {
      await bc.click(); await pg.waitForTimeout(600);
      const campo = pg.locator('.col-campo input:visible').first();
      const listo = async () => { const r = await pg.locator('button:visible', { hasText: /^Listo/ }).first().boundingBox(); return r; };
      if (await campo.count()) {
        const antes = await pg.evaluate(async () => { const { estado } = await import('/src/ui/estado.ts'); return JSON.stringify(estado.proyecto.muros.find(m => m.id === 'M1')); });
        await campo.click(); await campo.fill(String(parseFloat((await campo.inputValue()).replace(',', '.')) + 0.5).replace('.', ','));
        const r = await listo();
        if (r) {
          await pg.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await pg.mouse.down(); await pg.waitForTimeout(80); await pg.mouse.up(); await pg.waitForTimeout(600);
          const abierto = await pg.locator('button:visible', { hasText: /^Listo/ }).count();
          const despues = await pg.evaluate(async () => { const { estado } = await import('/src/ui/estado.ts'); return JSON.stringify(estado.proyecto.muros.find(m => m.id === 'M1')); });
          if (abierto) hallazgos.push('diseño › contorno de M1: después de escribir una medida, «Listo» con el mouse no cerró la carta');
          else if (antes === despues) hallazgos.push('diseño › contorno de M1: «Listo» cerró la carta pero no guardó la medida escrita');
          else console.log('contorno de M1: «Listo» con el mouse después de escribir: bien (se cerró y guardó la medida)');
        }
      } else console.log('(el contorno de M1 no tiene campos de medida a la vista)');
    } else console.log('(no apareció «Contorno…» al elegir M1)');
  }
  console.log([...new Set(hallazgos)].join('\n') || 'sin hallazgos');
  console.log('errores', JSON.stringify(errores.slice(0, 5)));
  await b.close();
})();
