"""Arma docs/dudas_planilla/index.html con los números de datos.json (DUDAS=1 npx vitest run tools/dudas).
Después: node tools/dudas/pdf.cjs  → docs/dudas_planilla/dudas_planilla.pdf"""
import json, os, base64, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ecuaciones as EQ

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.join(AQUI, '..', '..')
D = json.load(open(os.path.join(RAIZ, 'docs/dudas_planilla/datos.json')))
G, A, P = D['guia'], D['asim'], D['p34']


def n(v, d=0):
    if v is None:
        return '—'
    s = f'{v:,.{d}f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
    return s.replace('-', '−')


def pct(a, b):
    """diferencia de a contra b, en %"""
    if a is None or b is None or b == 0:
        return '—'
    v = (a - b) / abs(b) * 100
    return ('+' if v > 0 else '−' if v < 0 else '') + n(abs(v)) + ' %'


def sig(v, d=1):
    """tensión con su color: rojo tracción (+), azul compresión (−)"""
    if v is None:
        return '<span class="err">#DIV/0!</span>'
    c = 'trac' if v > 0 else 'comp'
    return f'<span class="{c}">{"+" if v > 0 else "−"}{n(abs(v), d)}</span>'


def pz(e, nombre):
    return next(x for x in e['piezas'] if x['nombre'] == nombre)


def c(e, fila, m):
    return e['cargas'][fila][m]


EJ = [('Ejemplo de la guía', G), ('Torre asimétrica', A), ('Torre de 34 pisos', P)]

# ---------------------------------------------------------------------------------------------- duda 1
filas1 = []
for nom, e, piezas in [('Ejemplo de la guía', G, ['T1']), ('Torre asimétrica', A, ['T1', 'T2', 'T6']), ('Torre de 34 pisos', P, ['T1', 'T4', 'T6'])]:
    for k, p in enumerate(piezas):
        x = pz(e, p)
        filas1.append(f"<tr><td>{nom if k == 0 else ''}</td><td>{p}</td><td class=n>{n(x['G'])}</td><td class=n>{n(x['Qrot'], 2)}</td>"
                      f"<td class=n>{n(e['hW'], 2)}</td><td class=n><b>{n(x['O'])}</b></td><td class=n><b>{n(x['Mcorr'])}</b></td>"
                      f"<td class=n>{pct(x['O'], x['Mcorr'])}</td></tr>")

# ---------------------------------------------------------------------------------------------- duda 2
filas2 = []
for nom, e, piezas in [('Ejemplo de la guía', G, ['T1']), ('Torre asimétrica', A, ['T1', 'T2', 'T5']), ('Torre de 34 pisos', P, ['T2', 'T5'])]:
    for k, p in enumerate(piezas):
        x = pz(e, p)
        filas2.append(f"<tr><td>{nom if k == 0 else ''}</td><td>{p}</td><td class=n>{n(x['Ng'])}</td><td class=n>{n(x['Nq'])}</td>"
                      f"<td class=n>{sig(x['sigCompPl'])}</td><td class=n>{sig(x['sigCompBien'])}</td>"
                      f"<td class=n>{sig(x['sigTracPl'])}</td><td class=n>{sig(x['sigTracBien'])}</td></tr>")

# ---------------------------------------------------------------------------------------------- duda 3
t2 = pz(P, 'T2')
pp_falta = t2['F'] * P['altura'] * 2.4
t2_comp = t2['sigCompBien'] - pp_falta / t2['F'] * 0.1
t2_trac = t2['sigTracBien'] - pp_falta / t2['F'] * 0.1
sin_pp = [x['nombre'] for x in P['piezas'] if 10 <= x['fila'] <= 17]

# ---------------------------------------------------------------------------------------------- duda 4
def sin_tension(e):
    return [x['nombre'] for x in e['piezas'] if x['sigCompPl'] is None]

# ---------------------------------------------------------------------------------------------- duda 5
filas5 = []
for nom, e, piezas in [('Torre asimétrica', A, ['T1', 'T2', 'T6']), ('Torre de 34 pisos', P, ['T1', 'T3', 'T4', 'T6'])]:
    for k, p in enumerate(piezas):
        x = pz(e, p)
        v = x['parte']
        filas5.append(f"<tr><td>{nom if k == 0 else ''}</td><td>{p}</td><td class=n>{n(v['planilla'], 1)} %</td><td class=n>{n(v['guia'], 1)} %</td>"
                      f"<td class=n>{n(v['cirsoc'], 1)} %</td><td class=n>{n(v['fem'], 1)} %</td></tr>")

# ---------------------------------------------------------------------------------------------- duda 9
filas9 = []
GF = {'guia': (0.863, 0.893), 'asim': (0.863, 0.893), 'p34': (0.863, 0.895)}
for (nom, e), k in zip(EJ, ['guia', 'asim', 'p34']):
    f = 'Frecuencia n1, viento A'
    q = 'Corte del viento en PB, viento A'
    filas9.append(f"<tr><td>{nom}</td><td class=n>{n(c(e, f, 'planilla'), 2)}</td><td class=n>0,85</td><td class=n>{n(GF[k][0], 2)} a {n(GF[k][1], 2)}</td>"
                  f"<td class=n>{n(c(e, f, 'fem'), 2)}</td><td class=n>{n(c(e, f, 'cirsoc'), 2)}</td>"
                  f"<td class=n>{n(c(e, q, 'planilla'))}</td><td class=n>{n(c(e, q, 'fem'))}</td><td class=n>{n(c(e, q, 'cirsoc'))}</td></tr>")

ejemplos = ''.join(
    f"<tr><td>{nom}</td><td>{e['nombre'].split('(')[-1].rstrip(')') if '(' in e['nombre'] else ''}</td><td class=n>{e['pisos']}</td><td class=n>{n(e['altura'], 1)}</td>"
    f"<td class=n>{n(e['e'], 2)}</td><td class=n>{len(e['piezas'])}</td><td class=n>{n(e['Q'], 1)}</td><td class=n>{n(e['Mv'])}</td></tr>" for nom, e in EJ)

asimT1 = pz(A, 'T1')
def b64(r):
    return base64.b64encode(open(os.path.join(RAIZ, r), 'rb').read()).decode()
FUENTES = ("@font-face { font-family: 'IBM Plex Math'; src: url(data:font/woff2;base64," + b64('src/assets/fuentes/plex-math-sub.woff2') + ") format('woff2'); }\n"
           "@font-face { font-family: 'IBM Plex Sans'; font-weight: 400; src: url(data:font/woff2;base64," + b64('node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2') + ") format('woff2'); }\n"
           "@font-face { font-family: 'IBM Plex Sans'; font-weight: 600 700; src: url(data:font/woff2;base64," + b64('node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2') + ") format('woff2'); }\n"
           "@font-face { font-family: 'JetBrains Mono'; font-weight: 400; src: url(data:font/woff2;base64," + b64('node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2') + ") format('woff2'); }\n")
html = f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dudas sobre la planilla</title>
<style>
{FUENTES}{EQ.CSS}
.duda {{ break-before: page; }}
h3.paso-duda {{ font-size: 11px; text-transform: uppercase; letter-spacing: .07em; color: var(--gris); margin: 14px 0 2px; }}
.preg {{ font-size: 15px; }}
.indice td:first-child {{ font-weight: 700; color: var(--acento); width: 28px; }}
.indice td {{ vertical-align: middle; }}
:root {{ --tinta: #1f2328; --gris: #5b6472; --suave: #eef1f5; --acento: #1565c0; --ok: #2e7d32; --aviso: #8a5f00;
  /* la convención de la app: rojo tracción, azul compresión */
  --traccion: #e24b4a; --compresion: #378add; }}
* {{ box-sizing: border-box; }}
body {{ margin: 0; background: #fff; color: var(--tinta); font: 14.5px/1.55 "IBM Plex Sans", "IBM Plex Math", sans-serif; }}
main {{ max-width: 980px; margin: 0 auto; padding: 28px 20px 60px; }}
h1 {{ font-size: 27px; margin: 0 0 4px; }} h2 {{ font-size: 20px; margin: 34px 0 8px; border-bottom: 2px solid var(--suave); padding-bottom: 4px; break-after: avoid; }}
h3 {{ font-size: 15.5px; margin: 16px 0 4px; break-after: avoid; }} p, li {{ max-width: 82ch; }} .sub {{ color: var(--gris); margin: 0 0 16px; }}
table {{ border-collapse: collapse; width: 100%; font-size: 13px; margin: 8px 0 10px; }} th, td {{ border-bottom: 1px solid #e3e7ec; padding: 5px 7px; text-align: left; vertical-align: top; }}
th {{ background: var(--suave); font-weight: 600; }} td.n {{ text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }}
.caja {{ background: var(--suave); border-radius: 8px; padding: 10px 14px; margin: 10px 0; }} .caja.ok {{ background: #e8f5e9; }} .caja.aviso {{ background: #fff7e0; }}
.preg {{ border-left: 4px solid var(--acento); background: #f3f7fc; padding: 8px 14px; margin: 10px 0; border-radius: 0 8px 8px 0; }}
.preg b:first-child {{ color: var(--acento); }}
.grilla {{ display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin: 8px 0; }}
.grilla > div {{ border: 1px solid #e3e7ec; border-radius: 8px; padding: 8px 12px; font-size: 13.5px; }}
.grilla h4 {{ margin: 0 0 4px; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--gris); }}
.tag {{ display: inline-block; font-size: 11.5px; font-weight: 600; padding: 1px 8px; border-radius: 999px; background: var(--suave); color: var(--gris); white-space: nowrap; }}
.tag.alta {{ background: #fdecea; color: #a1302b; }} .tag.media {{ background: #fff7e0; color: var(--aviso); }} .tag.baja {{ background: var(--suave); }}
.comp {{ color: var(--compresion); font-weight: 600; }} .trac {{ color: var(--traccion); font-weight: 600; }} .err {{ color: var(--gris); font-style: italic; }}
code {{ background: var(--suave); padding: 0 4px; border-radius: 3px; font-size: 12.5px; }}
.f {{ font-family: "JetBrains Mono", "IBM Plex Math", monospace; font-size: 13px; }}
.duda {{ break-inside: auto; }}
@media print {{ main {{ max-width: none; padding: 0 4mm; }} table, .caja, .preg, .grilla {{ break-inside: avoid; }} h2 {{ break-before: auto; }} }}
@media (max-width: 700px) {{ .grilla {{ grid-template-columns: 1fr; }} table {{ font-size: 12px; }} }}
@media print {{ body {{ font-size: 13px; line-height: 1.45; }} th, td {{ padding: 3px 6px; }} table {{ font-size: 12px; }} .preg {{ font-size: 13.5px; }} p {{ margin: 6px 0; }} .eqs .f {{ font-size: 13px; line-height: 1.5; }} .vars {{ margin: 2px 0 4px; }} h2 {{ margin-top: 0; }} }}
</style></head><body><main>
<h1>Dudas sobre el método de la planilla</h1>
<p class="sub">Torre 3D · comparación con el método de la guía y con el CIRSOC, en tres ejemplos · 24 de noviembre de 2026 ·
preparado para llevar a la cátedra antes de proponer cualquier cambio.</p>

<div class="caja">
<b>Criterio de este documento.</b> La planilla y la guía son de la cátedra: la app las reproduce tal como están y <b>no las
cambia</b>. El método CIRSOC y el FEM dependen solo del reglamento (102-25, 101-25 y 201-2005): ahí la app sigue el CIRSOC y,
ante una duda, manda el CIRSOC. Por eso cada duda está armada igual: <b>qué hace la planilla</b> (con la celda), <b>qué hace la
guía</b>, <b>qué pide el CIRSOC o la estática</b>, <b>cuánto cambia en tres ejemplos</b> y <b>la pregunta concreta</b>. Ninguna
duda presupone que la cátedra se equivocó: varias pueden ser simplificaciones a propósito, y la pregunta es si lo son.
</div>

<h2>En pocas palabras</h2>
<ul>
<li><b>Dos dudas cambian números de verdad y conviene llevarlas primero:</b> el momento de cada pieza en «Rototrasl.» (columna O,
que suma un momento y una fuerza: hasta {pct(pz(P, 'T4')['O'], pz(P, 'T4')['Mcorr'])} en la torre de 34 pisos) y la combinación de
cargas de la flexocompresión (la carga mayor va con la tracción y la menor con la compresión: hasta {pct(pz(A, 'T5')['sigTracBien'], pz(A, 'T5')['sigTracPl'])}
de tracción).</li>
<li><b>Tres dudas hacen que la hoja de flexocompresión no dé resultado o dé un resultado de otra pieza:</b> ocho filas sin peso propio,
el tipo de fila que manda sobre el tipo de pieza (#DIV/0!) y las piezas de más de cuatro muros que no entran en el molde de la hoja J.
En la torre de 34 pisos, {len(sin_tension(P))} de las {len(P['piezas'])} piezas del viento A quedan sin tensión.</li>
<li><b>El viento:</b> la planilla usa G = 0,85 aunque su propia frecuencia da menos de 1 Hz. Con esa frecuencia el Gf del reglamento
da apenas 2 a 10 % más; lo que multiplica el corte por 2,3 a 3,4 en el FEM y el CIRSOC es <b>qué frecuencia</b> se usa, no el G.</li>
<li>En el ejemplo de la guía (simétrico) casi todo coincide: las diferencias aparecen con excentricidad y con piezas complejas,
que es justo lo que traen los alumnos.</li>
</ul>

<h2>Las ocho dudas</h2>
<table class="indice"><tr><th>#</th><th>Duda</th><th>Dónde</th><th>Efecto</th></tr>
<tr><td>1</td><td>El momento de cada pieza suma un momento y una fuerza</td><td>Rototrasl., columna O</td><td><span class="tag alta">hasta 66 %</span></td></tr>
<tr><td>2</td><td>Las cargas de la flexocompresión están cruzadas</td><td>Flex comp PB, columnas O y P</td><td><span class="tag alta">del lado inseguro</span></td></tr>
<tr><td>3</td><td>Ocho filas sin peso propio</td><td>Flex comp PB, D13:D20</td><td><span class="tag media">según la fila</span></td></tr>
<tr><td>4</td><td>El tipo de fila manda sobre el tipo de pieza</td><td>Flex comp PB, columna M</td><td><span class="tag media">#DIV/0!</span></td></tr>
<tr><td>5</td><td>Piezas de más de cuatro muros y el molde</td><td>Hojas J</td><td><span class="tag alta">cambia el reparto</span></td></tr>
<tr><td>6</td><td>W de las asimétricas y área sin ala inferior</td><td>Hojas J, columnas AN y O</td><td><span class="tag media">hasta 45 %</span></td></tr>
<tr><td>7</td><td>Pieza entera o almas y alas por separado</td><td>Flex comp PB</td><td><span class="tag media">criterio</span></td></tr>
<tr><td>8</td><td>G = 0,85 con frecuencias menores que 1 Hz</td><td>Hoja viento</td><td><span class="tag media">la frecuencia manda</span></td></tr>
</table>
<p class="vars">Cada duda va en su página, siempre en el mismo orden: las ecuaciones de los tres métodos (el término que cambia, en amarillo), qué pasa con los números de los tres ejemplos y la pregunta. Colores de las tensiones: <span class="trac">rojo, tracción</span>; <span class="comp">azul, compresión</span>.</p>
<h2>Los tres ejemplos</h2>
<table><tr><th>Ejemplo</th><th>Qué es</th><th>Pisos</th><th>Altura (m)</th><th>e (m)</th><th>Piezas viento A</th><th>Q en −1 (t)</th><th>Mv en −1 (tm)</th></tr>{ejemplos}</table>
<p>Ejemplo de la guía: el de la guía 2024, simétrico (e = 0). Torre asimétrica: el caso particular del Anexo de la guía (T5 aislado, un
tabique de 4,00 × 0,20 m), donde la planta rota. Torre de 34 pisos: una planta real con núcleos de seis muros. Todo sale de la app con la planilla anterior y el armado
«App»; los números se reproducen con <code>DUDAS=1 npx vitest run tools/dudas</code> y la planilla exportada da lo mismo en
Excel y LibreOffice (la app se verifica celda por celda contra las dos).</p>

<div class="duda">
<h2>1. El momento de cada pieza: M<sub>j</sub> = M<sub>tras</sub> + Q<sub>rot</sub> suma un momento y una fuerza <span class="tag alta">cambia hasta 66 %</span></h2>
<h3 class="paso-duda">Cómo lo calcula cada método</h3>
{EQ.eq_momento(A)}
<h3 class="paso-duda">Qué pasa y cuánto cambia</h3>
<table><tr><th>Ejemplo</th><th>Pieza</th><th>M<sub>tras</sub> (tm)</th><th>Q<sub>rot</sub> (t)</th><th>M<sub>v</sub>/Q (m)</th><th>M<sub>j</sub> planilla = M<sub>tras</sub> + Q<sub>rot</sub></th><th>M<sub>j</sub> = M<sub>tras</sub> + Q<sub>rot</sub>·M<sub>v</sub>/Q</th><th>Planilla contra corregido</th></tr>
{''.join(filas1)}</table>
<p>Sin excentricidad (ejemplo de la guía) Q<sub>rot</sub> = 0 y da igual. Con excentricidad, la planilla le saca casi toda la rotación al momento:
las piezas del lado que se suma quedan cortas (T1 de la torre asimétrica: {n(asimT1['O'])} en vez de {n(asimT1['Mcorr'])} tm) y las del lado que se resta, largas.
Como Q<sub>rot</sub> está en toneladas y M<sub>tras</sub> en tm, el resultado además cambia si se cambian las unidades.</p>
<div class="preg"><b>Pregunta 1.</b> ¿La columna O de «Rototrasl.» (M<sub>j</sub>) quiere ser el momento de la pieza? Si es así, ¿la columna N (Q<sub>rot</sub>) no debería pasar a momento
con el brazo de la resultante (Q<sub>rot</sub>·M<sub>v</sub>/Q), o aplicarse el porcentaje total (Q<sub>tras</sub> + Q<sub>rot</sub>)/Q a M<sub>v</sub>, como hace la guía? Si O es otra cosa
(por ejemplo, un índice para ordenar las piezas), ¿qué momento debería leer la hoja de flexocompresión?</div>
</div>

<div class="duda">
<h2>2. La combinación de cargas en la flexocompresión <span class="tag alta">del lado inseguro</span></h2>
<h3 class="paso-duda">Cómo lo calcula cada método</h3>
{EQ.eq_cargas()}
<h3 class="paso-duda">Qué pasa y cuánto cambia</h3>
<table><tr><th>Ejemplo</th><th>Pieza</th><th>N<sub>0,7</sub> (t)</th><th>N<sub>0,9</sub> (t)</th><th>σ<sub>c</sub> planilla (con N<sub>0,7</sub>)</th><th>σ<sub>c</sub> con N<sub>0,9</sub></th><th>σ<sub>t</sub> planilla (con N<sub>0,9</sub>)</th><th>σ<sub>t</sub> con N<sub>0,7</sub></th></tr>
{''.join(filas2)}</table>
<p>Tensiones en kg/cm², con el mismo momento M<sub>j</sub> de la planilla, para separar esta duda de la anterior
(<span class="trac">rojo: tracción</span>, <span class="comp">azul: compresión</span>). La diferencia es siempre (N<sub>0,9</sub> − N<sub>0,7</sub>)/F y en las dos
tensiones va del lado inseguro: menos compresión y menos tracción que las que corresponden.</p>
<div class="preg"><b>Pregunta 2.</b> ¿Las columnas O y P cruzan las cargas a propósito? Si no, ¿la compresión debería usar N<sub>0,9</sub> (columna I) y la
tracción N<sub>0,7</sub> (columna H)?</div>
</div>

<div class="duda">
<h2>3. Ocho filas sin peso propio <span class="tag media">según la fila donde cae la pieza</span></h2>
<h3 class="paso-duda">Cómo lo calcula cada método</h3>
{EQ.eq_peso(t2, n(pp_falta), n(P['altura'], 1))}
<h3 class="paso-duda">Qué pasa y cuánto cambia</h3>
<p><b>Planilla:</b> en «Flex comp PB paralelos», <code>D13:D20</code> tienen 0,01 m³ fijo en lugar de <code>B·C</code>: las piezas que caen en las
filas 10 a 17 no suman su peso propio a N. <b>Guía y CIRSOC:</b> el peso propio entra siempre (en el CIRSOC, como D).</p>
<p>En la torre de 34 pisos caen ahí {', '.join(sin_pp)}. T2 (F = {n(t2['F'], 3)} m², {n(P['altura'], 1)} m de alto) pierde
{n(pp_falta)} t de peso propio: con la combinación corregida la compresión pasaría de {sig(t2['sigCompBien'])} a {sig(t2_comp)} kg/cm²
(la planilla informa {sig(t2['sigCompPl'])}). En el ejemplo de la guía, si T1 cayera en esas filas, N<sub>0,7</sub> bajaría de 293 a 155 t y la tracción subiría de
{sig(18.28)} a {sig(33.6)} kg/cm².</p>
<div class="preg"><b>Pregunta 3.</b> ¿El 0,01 de D13:D20 es un resto de una versión anterior, o esas filas están pensadas para piezas sin peso
(columnas metálicas, por ejemplo)? ¿Deberían llevar <code>=B·C</code> como las de arriba?</div>
</div>

<div class="duda">
<h2>4. El tipo de fila manda sobre el tipo de pieza <span class="tag media">#DIV/0! o la pieza equivocada</span></h2>
<h3 class="paso-duda">Cómo lo calcula cada método</h3>
{EQ.eq_fila()}
<h3 class="paso-duda">Qué pasa y cuánto cambia</h3>
<p><b>Planilla:</b> el W lo elige la fila y no la pieza (filas 4 a 10: simétricas; 11 a 14: asimétricas; 21 a 23: tubos). Si una pieza
asimétrica cae en una fila simétrica, la hoja lee un molde vacío y da 0/0. J25 lo avisa («se deberá cambiar el hipervínculo»): el
alumno tiene que reescribir la fórmula. En la 2025, desde la fila 10 el área y el W salen de una fila de la hoja J y el momento de otra.
<b>Guía y CIRSOC:</b> cada pieza con su propia sección.</p>
<p>Ejemplo de la guía: los núcleos {', '.join(sin_tension(G))} dan #DIV/0!. Torre asimétrica: {', '.join(sin_tension(A)) or 'ninguna'}.
Torre de 34 pisos: {len(sin_tension(P))} de {len(P['piezas'])} ({', '.join(sin_tension(P))}). Las piezas más cargadas son justo las que no tienen tensión.</p>
<div class="preg"><b>Pregunta 4.</b> ¿Se espera que el alumno reescriba los vínculos a mano? Si es así, ¿hay una regla para hacerlo (qué columna de
la hoja J usar para cada tipo de pieza)? La app puede ordenar las piezas para que caigan en la fila de su tipo, pero en plantas con muchas
asimétricas no alcanzan las filas.</div>
</div>

<div class="duda">
<h2>5. Piezas de más de cuatro muros y el molde de la hoja J <span class="tag alta">cambia el reparto</span></h2>
<h3 class="paso-duda">Cómo lo calcula cada método</h3>
{EQ.eq_molde()}
<h3 class="paso-duda">Qué pasa y cuánto cambia</h3>
<p><b>Planilla:</b> el molde de cada pieza tiene un ala superior, un ala inferior y dos almas. Una pieza con más muros (un núcleo con
tabiques interiores) se tiene que «armar» en ese molde. <b>Guía:</b> sección 7, armado simplificado de la cátedra (alas apiladas, almas
unidas). <b>CIRSOC / estática:</b> no hay molde; la rigidez es la de la sección real.</p>
<p>En la torre de 34 pisos, T1 tiene seis muros. Su J da <b>17,93 m⁴</b> con el armado de la app, <b>31,19 m⁴</b> con el de la cátedra y
<b>34,98 m⁴</b> con la sección real; T3 da 118,14, 65,44 y 102,87 m⁴. Como la rototraslación reparte por J, cambia cuánto toma cada pieza:</p>
<table><tr><th>Ejemplo</th><th>Pieza</th><th>Planilla (molde)</th><th>Guía (sección real)</th><th>CIRSOC</th><th>FEM (Timoshenko)</th></tr>{''.join(filas5)}</table>
<p>Parte del viento A que toma cada pieza en el caso 1. Guía y CIRSOC coinciden porque usan el mismo reparto con la sección real; el FEM
además cuenta el corte de las almas, que baja la parte de los núcleos grandes.</p>
<div class="preg"><b>Pregunta 5.</b> Para piezas que no entran en el molde, ¿qué J se espera en la entrega: el del armado de la sección 7 o el de
la sección real? ¿Se aceptan piezas partidas en dos filas (con el riesgo de que no trabajen juntas)?</div>
</div>

<div class="duda">
<h2>6. W de las piezas asimétricas y área sin ala inferior <span class="tag media">hasta 45 % en la flexión</span></h2>
<h3 class="paso-duda">Cómo lo calcula cada método</h3>
{EQ.eq_W()}
<h3 class="paso-duda">Qué pasa y cuánto cambia</h3>
<p><b>Planilla:</b> <code>AN = AM / (X/2 + AB/2 + AI/2)</code> divide el J por la mitad de la altura, pero en una pieza asimétrica el eje
neutro no está en la mitad: hay un W por fibra. El área (columna O de la hoja J) suma <code>W·X + Z·AB + AE·AF</code> y no el ala
inferior <code>AH·AI</code>. <b>Guía y CIRSOC:</b> cada fibra con su distancia al baricentro; el área completa.</p>
<p>Una T con ala de 4 × 0,2 m y alma de 0,2 × 4 m: J = 2,83 m⁴, eje a 1,15 m del ala; la hoja usa W = 1,35 m³, pero en la punta del alma
(a 3,05 m) W = 0,93 m³: la tensión de flexión es 45 % mayor que la de la hoja. En los núcleos del ejemplo de la guía el área da 1,72 m² en
vez de 2,72 m² (−37 %): menos peso propio y otra N/F.</p>
<div class="preg"><b>Pregunta 6.</b> ¿Se verifica cada fibra con su W (J/y sup. y J/y inf.)? ¿La columna O debería sumar AH·AI?</div>
</div>

<div class="duda">
<h2>7. Pieza entera o almas y alas por separado <span class="tag media">criterio</span></h2>
<h3 class="paso-duda">Cómo lo calcula cada método</h3>
{EQ.eq_entera()}
<h3 class="paso-duda">Qué pasa y cuánto cambia</h3>
<p><b>Planilla:</b> una sola tensión por fibra para la pieza entera (N total / área total ± M/W). <b>Guía:</b> separa almas y alas, cada una
con su N (por su área de influencia) y su parte del momento. <b>CIRSOC:</b> el 201 verifica la sección con compatibilidad de deformaciones
(secciones planas); si alas y alma están unidas trabaja la sección entera, con el ala que colabora. La app, en el método CIRSOC, hoy
verifica muro por muro como la guía (del lado seguro para las alas). <i>El ancho de ala que colabora hay que confirmarlo en el texto del
201, que no tenemos en el repositorio.</i></p>
<p>Ejemplo: T1 de la torre asimétrica da {sig(asimT1['sigTracBien'])} de tracción con la planilla corregida (pieza entera) y
{sig(asimT1['guiaTrac'])} con la guía (muro por muro); la compresión, {sig(asimT1['sigCompBien'])} y {sig(asimT1['guiaComp'])} kg/cm².
Parte de la diferencia es el momento (duda 1) y parte es el criterio.</p>
<div class="preg"><b>Pregunta 7.</b> Para la entrega, ¿la verificación es la de la planilla (pieza entera) o la de la guía (almas y alas)?</div>
</div>

<div class="duda">
<h2>8. El viento: G = 0,85 con frecuencias menores que 1 Hz <span class="tag media">el G cambia poco; la frecuencia, mucho</span></h2>
<h3 class="paso-duda">Cómo lo calcula cada método</h3>
{EQ.eq_viento()}
<h3 class="paso-duda">Qué pasa y cuánto cambia</h3>
<p><b>Planilla y guía:</b> calculan la frecuencia (F = 1/T) pero usan G = 0,85 igual. <b>CIRSOC 102:</b> con n1 &lt; 1 Hz el edificio es
flexible y corresponde Gf (102-25, art. 1.9.5; el 102-2005 distingue lo mismo).</p>
<table><tr><th>Ejemplo</th><th>F planilla (Hz)</th><th>G planilla</th><th>Gf con F de la planilla</th><th>n1 FEM</th><th>n1 aprox. 102-25</th><th>Q planilla (t)</th><th>Q FEM (t)</th><th>Q CIRSOC (t)</th></tr>{''.join(filas9)}</table>
<p>Gf con exposición B o C del 102-25 y 2 % de amortiguamiento. Con la frecuencia de la planilla, Gf supera a 0,85 en 2 a 10 %: poco. Lo
que separa a los métodos es la frecuencia: la del FEM (análisis modal de la torre) es 2 a 2,4 veces menor que la de la planilla y la aproximada del
102-25 para tabiques, 5 veces menor. Con esas frecuencias el corte en PB crece 2,3 a 3,4 veces (también cambian V, Kz y la carga mínima del 102-25).</p>
<div class="preg"><b>Pregunta 8.</b> ¿Qué frecuencia se espera usar y, si da menos de 1 Hz, se pide Gf o se acepta 0,85? (La pregunta ya está en
la lista de la cátedra; acá van los números.)</div>
</div>

<div class="duda"><h2>9. Dudas chicas</h2>
<table><tr><th>Dónde</th><th>Qué pasa</th><th>Efecto</th><th>Pregunta</th></tr>
<tr><td>Planilla anterior, «Rototrasl. cara menor» B51 e I51</td><td>Suman hasta la fila 38; L51, M51 y la planilla 2025 llegan a la 50.</td><td>Las piezas 9 a 20 del viento A no cuentan para el CR del viento B.</td><td>¿Deberían sumar hasta la 50?</td></tr>
<tr><td>«J Tabiques paralelos», filas 8 y 9</td><td>Faltan fórmulas en la planilla virgen.</td><td>Esas piezas no aportan J si no se completan a mano.</td><td>¿Es a propósito?</td></tr>
<tr><td>«Flex comp PB»</td><td>Solo el viento A (cara mayor).</td><td>Las piezas del viento B no se verifican.</td><td>¿Hay que agregar el viento B?</td></tr>
<tr><td>«Flex comp PB»</td><td>Una pieza puede tomar menos que la traslación sola por la rotación.</td><td>T2 y T4 de la torre asimétrica bajan 32 %.</td><td>¿Se toma el mayor de los dos sentidos del giro?</td></tr>
<tr><td>Rotación</td><td>Las piezas perpendiculares entran enteras en su baricentro; la guía suma cada muro con su J.</td><td>En los dos ejemplos con rotación, poco: los perpendiculares aportan 2 % y 1 % de ΣJt·a².</td><td>¿Cuál se pide?</td></tr>
<tr><td>Áreas de influencia</td><td>La guía carga 198 de 320 m² de losa en el ejemplo.</td><td>N de los tabiques.</td><td>¿Qué criterio: 45°, fajas, o una parte va a columnas fuera del modelo?</td></tr>
</table>

</div><h2>Lo que está bien</h2>
<div class="caja ok"><ul>
<li>σ = −N/F ± M/W, el núcleo central k = W/F y la comparación con e = M/N<sub>0,7</sub>: correctos para una sección sin fisurar.</li>
<li>Unidades de la flexocompresión (t/m² × 0,1 = kg/cm²) y el W de las piezas simétricas.</li>
<li>La rototraslación de la traslación (W·J/ΣJ) y el eje de inercia.</li>
<li>El W del tubo ya está corregido en la planilla 2025 (la anterior daba 4 veces menos).</li>
<li>En el ejemplo de la guía, planilla, guía y CIRSOC dan el mismo reparto (6,9 % y 36,2 %).</li>
</ul></div>

<h2>Erratas de la guía (para no confundirlas con dudas del método)</h2>
<ul>
<li>Anexo de rototraslación: con las posiciones que da (T1 a T4 a ±10 m, T5 a −6 m, T6 a +4,14 m) el eje de inercia queda a 1,77 m, no a 0,37 m.</li>
<li>T1: el largo traccionado del triángulo figura como 78 cm (y 1,05 m en el esquema); con σ = +137,78 / −788 t/m² sale 0,67 m.</li>
<li>τ adm: la guía da 24 kg/cm² para H30; para otros hormigones la app usa 0,08·σbk (proporcional). Hay que confirmarlo.</li>
</ul>

<h2>Cómo lo vamos a llevar</h2>
<ol>
<li>Primero las dudas 1 y 2, con la tabla de la torre asimétrica: es la que más se parece a una entrega.</li>
<li>Las dudas 3, 4 y 5 juntas: son las que dejan piezas sin verificar.</li>
<li>La 8 como pregunta de criterio (no es un error: es qué reglamento se aplica).</li>
<li>Hasta tener las respuestas, la app sigue dando los números de la planilla tal cual en el método Planilla, y muestra al lado lo de la
guía y lo del CIRSOC para que se vea la diferencia.</li>
</ol>
</main></body></html>
"""
open(os.path.join(RAIZ, 'docs/dudas_planilla/index.html'), 'w').write(html)
print('ok', len(html))
