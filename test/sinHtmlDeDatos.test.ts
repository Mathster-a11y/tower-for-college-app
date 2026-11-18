/**
 * Hallazgo 1 del informe técnico (docs/informes/analisis-tecnico-torre-3d.html): un nombre de nivel con HTML ejecutaba
 * código al abrir «Rototrasl. → En 3D». Los datos del proyecto (nombres de niveles, piezas, muros, versiones, archivos)
 * se escriben siempre como texto: textContent, append(string) o el helper h(), que no interpretan HTML.
 *
 * Esta prueba revisa el código: cada asignación de HTML (innerHTML, insertAdjacentHTML, outerHTML) tiene que estar en
 * la lista de abajo, que solo arma HTML con textos fijos, números o funciones que escapan (esc, mat, v, n, r).
 * Si agregás una, escribila con nodos o, si de verdad hace falta HTML, escapá cada dato con esc() y sumala acá.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { esc } from '../src/ui/comp';

const PERMITIDAS: [string, string][] = [
  ['src/ui/diagramaJ.ts', 'ley.innerHTML = `<span><i class="tab"></i>tabiques</span>'],   // texto fijo
  ['src/ui/comp.ts', 'ec.innerHTML = ecuacion;'],                                             // armada con v(), n(), r(), op(): escapan
  ['src/ui/comp.ts', 'e.innerHTML = mat(t);'],                                                 // mat() escapa
  ['src/ui/vista3d.ts', 'leyT.innerHTML = `<b>Peor fibra de cada piso'],                       // números y la dirección del viento
  ['src/ui/vista3d.ts', 'info.innerHTML = `<b>Traslación ×'],                                  // números
  ['src/ui/desglose.ts', "f.innerHTML = mat(p.formula)"],                                      // mat() escapa
  ['src/app.ts', 'ic.innerHTML = e.icono;'],                                                   // íconos fijos de las etapas
  ['src/app.ts', 'd.innerHTML = html;'],                                                       // dialogo(): cada dato con esc()
  ['src/app.ts', "insertAdjacentHTML('beforeend', '<span class=\"plegar\""],                  // texto fijo
  ['src/ui/planta.ts', `bMasTr.innerHTML = '<span class="ic">⋯</span>`],                       // texto fijo
];

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const r = join(dir, n);
    return statSync(r).isDirectory() ? archivos(r) : /\.ts$/.test(n) && !/\.test\.ts$/.test(n) ? [r] : [];
  });
}

describe('los datos del proyecto nunca van como HTML', () => {
  it('cada asignación de HTML está en la lista de las revisadas', () => {
    const nuevas: string[] = [];
    for (const f of archivos('src')) {
      readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
        if (!/innerHTML|insertAdjacentHTML|outerHTML/.test(l)) return;
        if (!PERMITIDAS.some(([a, t]) => f.replace(/\\/g, '/') === a && l.includes(t))) nuevas.push(`${f}:${i + 1}: ${l.trim().slice(0, 120)}`);
      });
    }
    expect(nuevas).toEqual([]);
  });

  it('esc() deja el texto inerte, también dentro de un atributo entre comillas', () => {
    const malo = `<img src=x onerror="alert('x')">&`;
    expect(esc(malo)).toBe('&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;');
    expect(esc(malo)).not.toMatch(/[<>"']/);
  });
});
