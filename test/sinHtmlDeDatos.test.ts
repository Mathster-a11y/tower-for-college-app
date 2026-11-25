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
import { simbolo, textoMat } from '../src/ui/grafo';

const PERMITIDAS: [string, string][] = [
  ['src/ui/diagramaJ.ts', 'ley.innerHTML = `<span><i class="tab"></i>tabiques</span>'],   // texto fijo
  ['src/ui/comp.ts', 'ec.innerHTML = ecuacion;'],                                             // armada con v(), n(), r(), op(): escapan
  ['src/ui/comp.ts', 'e.innerHTML = mat(t);'],                                                 // mat() escapa
  ['src/ui/vista3d.ts', 'leyT.innerHTML = `<b>Peor fibra de cada piso'],                       // números y la dirección del viento
  ['src/ui/vista3d.ts', 'info.innerHTML = `<b>Traslación ×'],                                  // números
  ['src/ui/desglose.ts', "f.innerHTML = mat(p.formula)"],                                      // mat() escapa
  ['src/app.ts', 'ic.innerHTML = e.icono;'],                                                   // íconos fijos de las etapas
  ['src/ui/editorContorno.ts', "x.insertAdjacentHTML('beforeend', svgIcono(icono))"],      // íconos fijos de las herramientas de CAD (ICONOS)
  ['src/app.ts', 'd.innerHTML = html;'],                                                       // dialogo(): cada dato con esc()
  ['src/app.ts', "insertAdjacentHTML('beforeend', '<span class=\"plegar\""],                  // texto fijo
  ['src/ui/planta.ts', `bMasTr.innerHTML = '<span class="ic">⋯</span>`],                       // texto fijo
  // Ecuaciones: símbolos con simbolo()/textoMat() (mat, v y esc), ecuaciones con conSimbolos/conNumeros (textoMat y
  // números), títulos y unidades con esc(); los nombres de piezas del proyecto solo entran por esas funciones
  ['src/ui/grafo.ts', 's.innerHTML = x ? simbolo(x.sim) : esc(id);'],
  ['src/ui/grafo.ts', 'sp.innerHTML = textoMat(t);'],
  ['src/ui/grafo.ts', 's.innerHTML = simbolo(p.sim);'],
  ['src/ui/grafo.ts', 'sal.innerHTML = simbolo(n.sim);'],
  ['src/ui/grafo.ts', "sp.innerHTML = simbolo(n.sim) + ' ';"],
  ['src/ui/ecuaciones/glosario.ts', 'td.innerHTML = simbolo(s);'],   // símbolos de los grafos (texto de la app, simbolo() escapa)
  ['src/ui/ecuaciones/vista.ts', 'nom.innerHTML = `${simbolo(p.sim)} · ${esc(p.nombre)}`;'],
  ['src/ui/ecuaciones/vista.ts', 'titulo.innerHTML = `${simbolo((n ?? p)!.sim)} · ${esc(n ? n.titulo : p!.nombre)}`;'],
  ['src/ui/ecuaciones/vista.ts', 'sim.innerHTML = `${simbolo(n.sim)} = ${conSimbolos(n.ec, cap)}`;'],
  ['src/ui/ecuaciones/vista.ts', 'num.innerHTML = `${simbolo(n.sim)} = ${conNumeros(n.ec, valorDe, decDe)}'],
  ['src/ui/ecuaciones/vista.ts', 'cond.innerHTML = `${/^[≤≥<>=]/.test(n.control.cond.trim())'],
  ['src/ui/ecuaciones/vista.ts', 'b.innerHTML = x ? simbolo(x.sim) : esc(id);'],
  ['src/ui/ecuaciones/imprimir.ts', 's.innerHTML = simbolo(x.sim);'],
  ['src/ui/ecuaciones/imprimir.ts', 'tit.innerHTML = `${simbolo(n.sim)} · ${esc(n.titulo)}`;'],
  ['src/ui/ecuaciones/imprimir.ts', 'e1.innerHTML = `${simbolo(n.sim)} = ${conSimbolos(n.ec, cap)}`;'],
  ['src/ui/ecuaciones/imprimir.ts', 'e2.innerHTML = `${simbolo(n.sim)} = ${conNumeros(n.ec, val, dec)}'],
  ['src/ui/ecuaciones/imprimir.ts', 'cond.innerHTML = `${/^[≤≥<>=]/.test(n.control.cond.trim())'],
  ['src/ui/ecuaciones/imprimir.ts', 's.innerHTML = `${simbolo(n.sim)} · ${esc(n.titulo)}`;'],
  ['src/ui/ecuaciones/imprimir.ts', 'c.innerHTML = conSimbolos(n.control!.cond,'],
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

  it('los símbolos de las ecuaciones escapan los nombres de las piezas', () => {
    const malo = '<img src=x onerror=alert(1)>';
    for (const x of [simbolo(`J_${malo}`), simbolo(`AB_${malo}`), textoMat(`p_${malo} + ${malo}`)]) expect(x).not.toMatch(/<img/);
  });

  it('esc() deja el texto inerte, también dentro de un atributo entre comillas', () => {
    const malo = `<img src=x onerror="alert('x')">&`;
    expect(esc(malo)).toBe('&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;');
    expect(esc(malo)).not.toMatch(/[<>"']/);
  });
});
