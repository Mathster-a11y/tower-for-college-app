"""Arma docs/dudas_planilla/index.html: los errores de la planilla de la cátedra, celda por celda, con capturas.

Antes:
  DUDAS=1 npx vitest run tools/dudas        → datos.json (tres ejemplos con los cuatro métodos) y las planillas llenas
  python3 tools/dudas/capturas.py           → capturas/*.png y capturas/valores.json (LibreOffice recalcula)
Después:
  node tools/dudas/pdf.cjs                  → docs/dudas_planilla/dudas_planilla.pdf
"""
import json, os, re, base64, sys, subprocess, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ecuaciones as EQ

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.join(AQUI, '..', '..')
DOC = os.path.join(RAIZ, 'docs/dudas_planilla')
D = json.load(open(os.path.join(DOC, 'datos.json')))
V = json.load(open(os.path.join(DOC, 'capturas/valores.json')))
G, A, P = D['guia'], D['asim'], D['p34']


# ------------------------------------------------------------------------------------------------ formato
def n(v, d=0):
    if v is None:
        return '—'
    if isinstance(v, str):
        return v
    s = f'{v:,.{d}f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
    return s.replace('-', '−')


def pct(a, b):
    """cambio de b (antes) a a (después), en %"""
    if not isinstance(a, (int, float)) or not isinstance(b, (int, float)) or b == 0:
        return '—'
    v = (a - b) / abs(b) * 100
    return ('+' if v > 0 else '−' if v < 0 else '') + n(abs(v)) + ' %'


def pcta(a, b):
    """cambio en valor absoluto (para tensiones: «+41 %» es 41 % más compresión)"""
    if not isinstance(a, (int, float)) or not isinstance(b, (int, float)):
        return '—'
    return pct(abs(a), abs(b))


def sig(v, d=1):
    """tensión con su color: rojo tracción (+), azul compresión (−)"""
    if not isinstance(v, (int, float)):
        return f'<span class="err">{v or "#DIV/0!"}</span>'
    c = 'trac' if v > 0 else 'comp'
    return f'<span class="{c}">{"+" if v > 0 else "−"}{n(abs(v), d)}</span>'


def val(fig, celda):
    return V.get(fig, {}).get(celda)


def pz(e, nombre):
    return next(x for x in e['piezas'] if x['nombre'] == nombre)


# qué pieza ocupa cada fila de la hoja (para nombrar las filas de las capturas)
def filas(ej):
    d = json.load(open(os.path.join(DOC, f'planillas/{ej}_anterior.json')))
    return {p['fila']: p['nombre'] for p in d['piezas'] if p['dir'] == 'A' and p['fila'] is not None}


FA, F34, FG = filas('asim'), filas('p34'), filas('guia')


def img(nombre, pie, ancho=100):
    """captura incrustada (reducida a 256 colores: las hojas tienen pocos y el archivo queda chico)"""
    ruta = os.path.join(DOC, 'capturas', nombre + '.png')
    tmp = tempfile.mktemp(suffix='.png')
    subprocess.run(['convert', ruta, '-colors', '256', '-define', 'png:compression-level=9', tmp], check=True)
    b = base64.b64encode(open(tmp, 'rb').read()).decode()
    os.remove(tmp)
    alt = re.sub(r'<[^>]+>', '', pie).replace('"', '')
    return (f'<figure class="cap" style="--w:{ancho}%"><img src="data:image/png;base64,{b}" alt="{alt}">'
            f'<figcaption>{pie}</figcaption></figure>')


def par(antes, despues, pa, pd, wa=100, wd=100):
    return (f'<div class="par"><div class="lado mal"><div class="et">Hoy</div>{img(antes, pa, wa)}</div>'
            f'<div class="lado bien"><div class="et">{"Corregida" if "despues" in despues or "bien" in despues else "Y además"}</div>{img(despues, pd, wd)}</div></div>')


def formula(hoy, bien, celda='', nota=''):
    return (f'<div class="formulas"><div class="fx mal"><span class="cel">{celda}</span><span class="lbl">hoy</span><code>{hoy}</code></div>'
            f'<div class="fx bien"><span class="cel">{celda}</span><span class="lbl">corregida</span><code>{bien}</code></div>'
            + (f'<p class="nota-fx">{nota}</p>' if nota else '') + '</div>')


def donde(*filas_):
    """filas_: (planilla, hoja, celdas, estado)"""
    tr = ''.join(f'<tr><td>{p}</td><td><b>{h}</b></td><td class="mono">{c}</td><td>{e}</td></tr>' for p, h, c, e in filas_)
    return f'<table class="donde"><tr><th>Planilla</th><th>Hoja</th><th>Celdas</th><th>Estado</th></tr>{tr}</table>'


def barras(titulo, filas_, unidad='', d=0):
    """gráfico de barras antes / después (gris y verde: no son tracción ni compresión)"""
    nums = [abs(x) for _, a, b in filas_ for x in (a, b) if isinstance(x, (int, float))]
    m = max(nums) if nums else 1
    alto, h = 22, 22 * len(filas_) * 2 + 34
    W, x0 = 640, 110
    s = [f'<svg class="barras" viewBox="0 0 {W} {h}" role="img" aria-label="{titulo}">',
         f'<text x="0" y="14" class="t">{titulo}</text>']
    y = 28
    for nom, a, b in filas_:
        for k, (v, cl) in enumerate(((a, 'b-antes'), (b, 'b-desp'))):
            if isinstance(v, (int, float)):
                w = (W - x0 - 120) * abs(v) / m
                s.append(f'<rect x="{x0}" y="{y}" width="{w:.1f}" height="16" rx="3" class="{cl}"/>'
                         f'<text x="{x0 + w + 6:.1f}" y="{y + 12}" class="v">{n(v, d)} {unidad}</text>')
            else:
                s.append(f'<text x="{x0}" y="{y + 12}" class="v err">{v or "sin valor"}</text>')
            if k == 0:
                s.append(f'<text x="{x0 - 8}" y="{y + 20}" class="n" text-anchor="end">{nom}</text>')
            y += alto - 2
        y += 4
    s.append('</svg>')
    return ('<div class="graf">' + ''.join(s) +
            '<div class="ley"><span class="sw b-antes"></span>hoy <span class="sw b-desp"></span>corregida</div></div>')


def tag(nivel, texto):
    return f'<span class="tag {nivel}">{texto}</span>'


# ------------------------------------------------------------------------------------------------ dibujos
SVG_FLUJO = """<svg class="flujo" viewBox="0 0 900 250" role="img" aria-label="Las hojas de la planilla y dónde está cada error">
<defs><marker id="fl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#5b6472"/></marker></defs>
<g class="hoja"><rect x="10" y="20" width="130" height="64" rx="8"/><text x="75" y="48">viento</text><text x="75" y="66" class="s">p de cada nivel</text></g>
<g class="hoja"><rect x="10" y="160" width="130" height="64" rx="8"/><text x="75" y="188">M,NyQ</text><text x="75" y="206" class="s">Q y M de cada nivel</text></g>
<g class="hoja"><rect x="250" y="90" width="150" height="64" rx="8"/><text x="325" y="118">Hojas J</text><text x="325" y="136" class="s">J, W y área de cada pieza</text></g>
<g class="hoja"><rect x="490" y="20" width="160" height="64" rx="8"/><text x="570" y="48">Rototrasl.</text><text x="570" y="66" class="s">M de cada pieza</text></g>
<g class="hoja"><rect x="490" y="160" width="160" height="64" rx="8"/><text x="570" y="188">Flex comp PB</text><text x="570" y="206" class="s">σ de cada pieza</text></g>
<g class="hoja fin"><rect x="760" y="90" width="130" height="64" rx="8"/><text x="825" y="118">Verifica</text><text x="825" y="136" class="s">o no verifica</text></g>
<path d="M75,84 V160" marker-end="url(#fl)"/><path d="M140,192 C200,192 420,40 490,48" marker-end="url(#fl)"/>
<path d="M400,110 C440,100 460,60 490,56" marker-end="url(#fl)"/><path d="M400,134 C440,144 460,184 490,188" marker-end="url(#fl)"/>
<path d="M570,84 V160" marker-end="url(#fl)"/><path d="M650,192 C700,192 720,130 760,124" marker-end="url(#fl)"/>
<g class="err"><circle cx="140" cy="160" r="11"/><text x="140" y="164">11</text></g>
<g class="err"><circle cx="400" cy="90" r="11"/><text x="400" y="94">6</text></g><g class="err"><circle cx="424" cy="90" r="11"/><text x="424" y="94">8</text></g>
<g class="err"><circle cx="400" cy="154" r="11"/><text x="400" y="158">9</text></g><g class="err"><circle cx="424" cy="154" r="11"/><text x="424" y="158">10</text></g>
<g class="err"><circle cx="650" cy="20" r="11"/><text x="650" y="24">1</text></g><g class="err"><circle cx="650" cy="44" r="11"/><text x="650" y="48">12</text></g>
<g class="err"><circle cx="650" cy="160" r="11"/><text x="650" y="164">2</text></g><g class="err"><circle cx="674" cy="160" r="11"/><text x="674" y="164">3</text></g>
<g class="err"><circle cx="650" cy="184" r="11"/><text x="650" y="188">4</text></g><g class="err"><circle cx="674" cy="184" r="11"/><text x="674" y="188">5</text></g>
<g class="err"><circle cx="650" cy="208" r="11"/><text x="650" y="212">7</text></g>
<g class="crit"><circle cx="140" cy="20" r="11"/><text x="140" y="24">C</text></g>
</svg>"""


def svg_unidades():
    """duda 1: qué suma la columna O"""
    g5, n5, o5 = val('d1_antes', 'G5'), val('d1_antes', 'N5'), val('d1_antes', 'O5')
    o5b, hw = val('d1_despues', 'O5'), val('d1_antes', 'F5') / val('d1_antes', 'D5')
    return f"""<svg class="dib" viewBox="0 0 640 170" role="img" aria-label="Momento más fuerza">
<text x="10" y="18" class="t">Fila 5 ({FA[0]}): lo que suma O5 hoy y lo que debería sumar</text>
<g transform="translate(10,32)"><rect width="150" height="44" rx="6" class="mom"/><text x="75" y="20" text-anchor="middle">G5 = {n(g5, 0)}</text><text x="75" y="36" class="s" text-anchor="middle">momento (tm)</text></g>
<text x="172" y="60" class="op">+</text>
<g transform="translate(192,32)"><rect width="130" height="44" rx="6" class="fza"/><text x="65" y="20" text-anchor="middle">N5 = {n(n5, 2)}</text><text x="65" y="36" class="s" text-anchor="middle">fuerza (t)</text></g>
<text x="334" y="60" class="op">=</text>
<g transform="translate(354,32)"><rect width="160" height="44" rx="6" class="malo"/><text x="80" y="20" text-anchor="middle">O5 = {n(o5, 0)}</text><text x="80" y="36" class="s" text-anchor="middle">¿tm? (suma t con tm)</text></g>
<g transform="translate(10,104)"><rect width="150" height="44" rx="6" class="mom"/><text x="75" y="20" text-anchor="middle">G5 = {n(g5, 0)}</text><text x="75" y="36" class="s" text-anchor="middle">momento (tm)</text></g>
<text x="172" y="132" class="op">+</text>
<g transform="translate(192,104)"><rect width="150" height="44" rx="6" class="mom"/><text x="75" y="20" text-anchor="middle">N5 · F5/D5 = {n(n5 * hw, 0)}</text><text x="75" y="36" class="s" text-anchor="middle">t × {n(hw, 2)} m = tm</text></g>
<text x="354" y="132" class="op">=</text>
<g transform="translate(374,104)"><rect width="160" height="44" rx="6" class="bueno"/><text x="80" y="20" text-anchor="middle">O5 = {n(o5b, 0)}</text><text x="80" y="36" class="s" text-anchor="middle">momento (tm)</text></g>
</svg>"""


def svg_tensiones():
    """duda 2: diagrama de tensiones de una pieza y qué carga va con cada borde"""
    return """<svg class="dib" viewBox="0 0 640 190" role="img" aria-label="Qué carga va con cada borde">
<text x="10" y="16" class="t">σ = −N/F ± M/W: cada borde se verifica con la carga que lo empeora</text>
<g transform="translate(30,40)">
 <rect x="0" y="0" width="240" height="18" class="muro"/><text x="120" y="13" class="s" style="text-anchor:middle">la pieza, de borde a borde</text>
 <line x1="0" y1="60" x2="240" y2="60" class="cota"/>
 <path d="M0,60 L0,120 L150,60 Z" class="pc"/><path d="M150,60 L240,60 L240,30 Z" class="pt"/>
 <text x="2" y="138" class="cc">borde comprimido</text><text x="240" y="138" class="ct" style="text-anchor:end">borde traccionado</text>
</g>
<g transform="translate(320,44)" class="regla">
 <text x="0" y="0"><tspan class="cc">Compresión</tspan> (columna O): con la carga mayor,</text>
 <text x="0" y="18">N<tspan dy="3" font-size="9">0,9</tspan><tspan dy="-3"> = N cargado = columna I.</tspan></text>
 <text x="0" y="38" class="mal">Hoy usa H (N<tspan dy="3" font-size="9">0,7</tspan><tspan dy="-3">): da menos compresión.</tspan></text>
 <text x="0" y="74"><tspan class="ct">Tracción</tspan> (columna P): con la carga menor,</text>
 <text x="0" y="92">N<tspan dy="3" font-size="9">0,7</tspan><tspan dy="-3"> = N descargado = columna H.</tspan></text>
 <text x="0" y="112" class="mal">Hoy usa I (N<tspan dy="3" font-size="9">0,9</tspan><tspan dy="-3">): da menos tracción.</tspan></text>
</g></svg>"""


SVG_2025 = """<svg class="dib" viewBox="0 0 700 340" role="img" aria-label="Qué fila de la hoja J lee cada fila de Flex comp en la planilla 2025">
<text x="10" y="16" class="t">Planilla 2025: para cada fila de «Flex comp», de qué fila de la hoja J salen el área y el momento</text>
<text x="80" y="38" class="h" text-anchor="middle">Flex comp</text><text x="330" y="38" class="h" text-anchor="middle">J Tabiques paralelos</text>
<text x="600" y="38" class="h" text-anchor="middle">Rototrasl. (momento)</text>
{filas}
<g transform="translate(10,326)"><line x1="0" y1="0" x2="26" y2="0" class="area"/><text x="32" y="4" class="s">área y W (B, M, O, P)</text>
<line x1="190" y1="0" x2="216" y2="0" class="mom2"/><text x="222" y="4" class="s">momento (J, por Rototrasl.)</text>
<rect x="430" y="-7" width="14" height="14" class="huerf"/><text x="450" y="4" class="s">filas de J que nadie lee</text></g>
</svg>"""


def svg_2025():
    # Flex k lee el área de J: 4..9 → 4..9; 10..12 → 14..16; 13..23 → 21..31. Momento: Rototrasl. O(k+1) → J 4..11, 15..26
    area = {k: (k if k <= 9 else {10: 14, 11: 15, 12: 16}.get(k, k + 8)) for k in range(4, 24)}
    mom = {k: (k if k <= 11 else k + 3) for k in range(4, 24)}
    out = []
    ys = lambda r: 50 + (r - 4) * 9.4
    for r in range(4, 32):
        leida = r in area.values() or r in mom.values()
        out.append(f'<g><rect x="300" y="{ys(r) - 6:.1f}" width="60" height="8.4" rx="2" class="{"jf" if leida else "huerf"}"/>'
                   f'<text x="296" y="{ys(r) + 1:.1f}" class="m" text-anchor="end">{r}</text></g>')
    for k in range(4, 24):
        y = 50 + (k - 4) * 13.2
        mal = area[k] != mom[k]
        out.append(f'<rect x="40" y="{y - 7:.1f}" width="80" height="11" rx="2" class="{"ff mal" if mal else "ff"}"/><text x="36" y="{y + 2:.1f}" class="m" text-anchor="end">{k}</text>')
        out.append(f'<path d="M120,{y - 3:.1f} C200,{y - 3:.1f} 220,{ys(area[k]) - 2:.1f} 300,{ys(area[k]) - 2:.1f}" class="area{" malo" if mal else ""}"/>')
        out.append(f'<path d="M360,{ys(mom[k]) - 2:.1f} C450,{ys(mom[k]) - 2:.1f} 500,{y - 1:.1f} 560,{y - 1:.1f}" class="mom2"/>'
                   f'<text x="566" y="{y + 2:.1f}" class="m">O{k + 1}</text>')
    return SVG_2025.replace('{filas}', ''.join(out))


def svg_seccion():
    """duda 9: W de una pieza asimétrica (fibra superior e inferior)"""
    return """<svg class="dib" viewBox="0 0 640 230" role="img" aria-label="W de una sección asimétrica">
<text x="10" y="16" class="t">Una T: el eje neutro no está en la mitad de la altura</text>
<g transform="translate(60,30)">
 <rect x="0" y="0" width="160" height="16" class="muro"/><rect x="72" y="16" width="16" height="164" class="muro"/>
 <line x1="-30" y1="52" x2="200" y2="52" class="en"/><text x="204" y="56" class="s">eje neutro (AK)</text>
 <line x1="-30" y1="90" x2="200" y2="90" class="mitad"/><text x="204" y="94" class="s">mitad de la altura (lo que usa AN)</text>
 <path d="M-20,0 V52" class="cota"/><text x="-24" y="30" class="s" text-anchor="end">y sup</text>
 <path d="M-20,52 V180" class="cota"/><text x="-24" y="120" class="s" text-anchor="end">y inf</text>
</g>
<g transform="translate(340,60)" class="regla">
 <text x="0" y="0">W sup = J / y sup</text><text x="0" y="22">W inf = J / y inf  ← el menor manda</text>
 <text x="0" y="52" class="mal">Hoy: AN = J / (h/2): un solo W</text>
 <text x="0" y="74" class="s">En la punta lejana del alma la tensión</text><text x="0" y="90" class="s">de flexión es mayor que la que da la hoja.</text>
</g></svg>"""


SVG_TUBO = """<svg class="dib" viewBox="0 0 640 140" role="img" aria-label="W de un tubo">
<text x="10" y="16" class="t">W de un tubo: J dividido por la mitad del diámetro</text>
<g transform="translate(70,80)"><circle r="44" class="muro"/><circle r="34" fill="#fff"/><line x1="0" y1="0" x2="44" y2="0" class="cota"/><text x="22" y="-6" class="s" text-anchor="middle">D/2</text></g>
<g transform="translate(180,50)" class="regla">
 <text x="0" y="0">Bien: W = J / (D/2) = 2·J/D</text>
 <text x="0" y="24" class="mal">Planilla anterior, V4: =U4/S4/2 = J/(2·D): 4 veces menos</text>
 <text x="0" y="48" class="s">La 2025 ya lo corrigió: =U4/(S4/2)</text>
</g></svg>"""


# ------------------------------------------------------------------------------------------------ números
a = lambda c: val('d1_antes', c)
b = lambda c: val('d1_despues', c)
barras1 = barras('Rototrasl. cara mayor, columna O: momento de cada pieza (tm), torre asimétrica',
                 [(FA[r - 5], a(f'O{r}'), b(f'O{r}')) for r in range(5, 11)], 'tm')
tabla1 = ''.join(f'<tr><td>{FA[r - 5]}</td><td class=n>{n(a(f"G{r}"), 1)}</td><td class=n>{n(a(f"N{r}"), 2)}</td><td class=n>{n(a(f"O{r}"), 1)}</td>'
                 f'<td class=n><b>{n(b(f"O{r}"), 1)}</b></td><td class=n>{pct(b(f"O{r}"), a(f"O{r}"))}</td></tr>' for r in range(5, 11))
f1 = lambda c: val('d1_flex', c)
d2a = lambda c: val('d2_antes', c)
d2b = lambda c: val('d2_despues', c)
d14 = lambda c: val('d14_flex', c)
tabla2 = ''.join(f'<tr><td>{FA[r - 4]}</td><td class=n>{n(d2a(f"H{r}"), 1)}</td><td class=n>{n(d2a(f"I{r}"), 1)}</td>'
                 f'<td class=n>{sig(d2a(f"O{r}"))}</td><td class=n>{sig(d2b(f"O{r}"))}</td><td class=n>{sig(d2a(f"P{r}"))}</td><td class=n>{sig(d2b(f"P{r}"))}</td>'
                 f'<td class=n>{sig(d14(f"P{r}"))}</td></tr>' for r in range(5, 10))
barras2 = barras('Flex comp, columna P: tracción de cada pieza (kg/cm²), torre asimétrica',
                 [(FA[r - 4], d2a(f'P{r}'), d2b(f'P{r}')) for r in range(5, 10)], 'kg/cm²', 1)

asimT1 = pz(A, 'T1')
t2 = pz(P, 'T2')

html_fichas = []


def ficha(num, titulo, nivel, etiqueta, cuerpo):
    html_fichas.append(f'<section class="duda" id="e{num}"><h2><span class="num">{num}</span>{titulo} {tag(nivel, etiqueta)}</h2>{cuerpo}</section>')


# ------------------------------------------------------------------------------------------------ 1
ficha(1, 'El momento de cada pieza suma un momento y una fuerza', 'alta', f'hasta {pct(b("O6"), a("O6"))}', f"""
{donde(('Anterior y 2025', 'Rototrasl. cara mayor', 'O5:O24', 'mal en las dos'), ('Anterior y 2025', 'Rototrasl. cara menor', 'O5:O24', 'mal en las dos'))}
{formula('=G5+N5', '=G5+N5*$F$5/$D$5', 'O5', 'G5 es el momento por traslación (tm). N5 = −(J15·L5/M51) es la fuerza que toma la pieza por la rotación (t), aunque el título de N4 dice «(tm)». Para pasarla a momento se multiplica por el brazo de la resultante, F5/D5 = M<sub>v</sub>/Q. Es lo mismo que hace la guía: (E5 + N5)/D5 · F5. Se copia hasta la fila 24.')}
{svg_unidades()}
{par('d1_antes', 'd1_despues', 'Torre asimétrica, planilla anterior. En naranja la columna O; en violeta lo que suma: G (tm) y N (t).', 'La misma hoja con la fórmula corregida (verde). En violeta, D5 y F5: el brazo de la resultante.')}
<table><tr><th>Pieza</th><th>G (tm)</th><th>N (t)</th><th>O hoy (tm)</th><th>O corregida (tm)</th><th>Cambio</th></tr>{tabla1}</table>
{barras1}
<p>Sin excentricidad (el ejemplo de la guía) N = 0 y da igual. Con excentricidad, la planilla le saca casi toda la rotación al momento:
las piezas que la rotación carga quedan cortas y las que descarga, largas. Este momento es el que lee «Flex comp» en la columna J:</p>
{img('d1_flex', 'Flex comp de la torre asimétrica con O corregida en Rototrasl.: cambia J (verde) y, con J, las tensiones O y P (violeta).')}
<div class="preg"><b>Pregunta 1.</b> ¿La columna O de «Rototrasl.» es el momento de la pieza? Si es así, ¿N no debería pasar a momento con el brazo
de la resultante (N·M<sub>v</sub>/Q), como hace la guía con el porcentaje total? Si O es otra cosa, ¿qué momento tiene que leer «Flex comp»?</div>
""")

# ------------------------------------------------------------------------------------------------ 2
ficha(2, 'Las cargas de la flexocompresión están cruzadas', 'alta', 'del lado inseguro', f"""
{donde(('Anterior y 2025', 'Flex comp PB paralelos', 'O4:O23 y P4:P23', 'mal en las dos'))}
{formula('=(-H4/B4-J4/W)*0.1', '=(-I4/B4-J4/W)*0.1', 'O4')}
{formula('=(-I4/B4+J4/W)*0.1', '=(-H4/B4+J4/W)*0.1', 'P4', 'W es la celda de la hoja J que corresponde a la fila (Q, AN o V): esa parte no cambia. Solo se intercambian H e I. H = N descargado (0,7 de la sobrecarga), I = N cargado (0,9).')}
{svg_tensiones()}
{par('d2_formulas', 'd2_formulas_bien', 'Las fórmulas de O y P, filas 4 y 5: la compresión (O) usa H y la tracción (P) usa I.', 'Corregidas: la compresión con I (la carga mayor) y la tracción con H (la menor).')}
{par('d2_antes', 'd2_despues', 'Torre asimétrica: H e I (violeta) y las tensiones O y P (naranja).', 'Con las cargas en su lugar. La fila 4 sigue en #DIV/0!: es el error 4.')}
<table><tr><th>Pieza</th><th>N<sub>0,7</sub> = H (t)</th><th>N<sub>0,9</sub> = I (t)</th><th>σ<sub>c</sub> hoy</th><th>σ<sub>c</sub> corregida</th><th>σ<sub>t</sub> hoy</th><th>σ<sub>t</sub> corregida</th><th>σ<sub>t</sub> con 1 y 2</th></tr>{tabla2}</table>
<p>Tensiones en kg/cm² (<span class="comp">azul, compresión</span>; <span class="trac">rojo, tracción</span>). La diferencia es siempre
(N<sub>0,9</sub> − N<sub>0,7</sub>)/F y en las dos tensiones va del lado inseguro. La última columna suma la corrección del error 1:
la tracción de {FA[1]} pasa de {sig(d2a('P5'))} a {sig(d14('P5'))} kg/cm², el doble.</p>
{barras2}
{img('d14_flex', 'Los errores 1 y 2 corregidos juntos (verde): el momento J que llega de Rototrasl. y las tensiones O y P.')}
<div class="preg"><b>Pregunta 2.</b> ¿O y P cruzan las cargas a propósito? Si no, ¿la compresión debería usar N<sub>0,9</sub> (columna I) y la tracción
N<sub>0,7</sub> (columna H)?</div>
""")

# ------------------------------------------------------------------------------------------------ 3
ficha(3, 'Planilla 2025: «Flex comp» lee el área de una pieza y el momento de otra', 'alta', 'desde la fila 10', f"""
{donde(('2025', 'Flex comp PB paralelos', 'B10:B23, M10:M23, O10:P23', 'leen otra fila de la hoja J'),
       ('2025', 'J Tabiques paralelos', 'filas 12 y 13', 'ninguna hoja las lee'),
       ('2025', 'J Tabiques paralelos', 'filas 14 y 27 a 31', 'solo las lee Flex comp (no entran al reparto)'))}
<p>La 2025 agrandó la hoja J a 28 filas, pero «Rototrasl.» lee las filas 4 a 11 y 15 a 26, y «Flex comp» lee las 4 a 9, 14 a 16 y 21 a 31.
Hasta la fila 9 de «Flex comp» las dos coinciden; desde la 10, el área y el W salen de una pieza y el momento (que llega por
«Rototrasl.») de otra.</p>
{svg_2025()}
{par('d5_formulas', 'd5_roto', '«Flex comp» de la 2025, en fórmulas: B10 lee la fila 14 de la hoja J (naranja), pero J10 lee O11 de «Rototrasl.» (violeta)…', '…y O11 de «Rototrasl.» viene de B11, que lee AY10: la fila 10 de la hoja J.', 100, 38)}
{formula("='J Tabiques paralelos'!O14", "='J Tabiques paralelos'!O10", 'B10', 'Y lo mismo en M10, O10 y P10 (Q14 → Q10, O14 → O10). Regla para las filas 10 a 23: la fila de la hoja J tiene que ser la que lee B de «Rototrasl.» en la fila siguiente (Flex 10 → J 10, Flex 11 → J 11, Flex 12 → J 15, …, Flex 23 → J 26). Las filas 12 y 13 de la hoja J quedan sin usar, o se suman a «Rototrasl.» corriendo sus vínculos.')}
<p>La app arma la planilla 2025 poniendo cada pieza en la fila que lee «Rototrasl.» (el reparto queda bien) y avisa que «Flex comp»
lee otra pieza desde la fila 10.</p>
<div class="preg"><b>Pregunta 3.</b> ¿Qué filas de la hoja J son las de la pieza 7 en adelante: las que lee «Rototrasl.» o las que lee «Flex comp»?
Para que las dos hojas hablen de la misma pieza hay que cambiar una de las dos.</div>
""")

# ------------------------------------------------------------------------------------------------ 4
ficha(4, 'El tipo de fila manda sobre el tipo de pieza (#DIV/0!)', 'alta', 'piezas sin verificar', f"""
{donde(('Anterior y 2025', 'Flex comp PB paralelos', 'M4:M23, O4:P23', 'el W lo elige la fila'))}
<p>Cada fila de «Flex comp» lee un W fijo de la hoja J: Q (simétricas) en las filas 4 a 10 y 15 a 20, AN (asimétricas) en las 11 a 14 y
V (tubos) en las 21 a 23 (columna Q de la hoja: «simetrica», «asimetrica», «columnas circulares»). Si la pieza de esa fila es de otro
tipo, el W de la fila es 0/0 y toda la fila da #DIV/0!. J25 lo avisa («se deberá cambiar el hipervínculo»).</p>
{formula("='J Tabiques paralelos'!Q4/'J Tabiques paralelos'!O4", "='J Tabiques paralelos'!BD4/'J Tabiques paralelos'!O4", 'M4',
         'Propuesta: que la hoja J dé un solo W por pieza y que «Flex comp» lea siempre ese. La planilla ya tiene la columna BD («W resist total» = Q + V + AN + 0,001), pero Q da 0/0 en las piezas que no son simétricas; con BD4 = SI.ERROR(Q4;0)+V4+AN4+AZ4 sirve para cualquier pieza. Lo mismo en O4 y P4. (En la captura «corregida» se cambió Q por AN en las filas 4 y 5, que es lo que hace esa fórmula con estas piezas.)')}
{par('d4_antes', 'd4_despues', f'Ejemplo de la guía: {FG[0]} y {FG[1]} son asimétricas pero caen en filas «simetrica» (violeta): #DIV/0! (naranja).', 'Con el W de la pieza: las dos se verifican.')}
<p>Las piezas que quedan sin tensión son justo las más cargadas: los núcleos. En la torre de 34 pisos son 6 de las 12 piezas del viento A.</p>
<div class="preg"><b>Pregunta 4.</b> ¿Se espera que el alumno reescriba los vínculos a mano? Si es así, ¿hay una regla (qué columna de la hoja J
para cada tipo de pieza)? ¿O se puede pasar a un W único por pieza (BD)?</div>
""")

# ------------------------------------------------------------------------------------------------ 5
d13 = lambda c: val('d13_flex', c)
d13b = lambda c: val('d13_flex_despues', c)
ficha(5, 'Los pórticos no tienen área ni W en «Flex comp»', 'alta', 'pórticos sin verificar', f"""
{donde(('Anterior y 2025', 'Flex comp PB paralelos', 'B4:B23 y M, O, P', 'leen O y Q de la hoja J'),
       ('Anterior y 2025', 'J Tabiques paralelos', 'BB (área) y AZ (W) del pórtico', 'nadie las lee'))}
<p>El área de los pies del pórtico está en BB y su W en AZ, pero «Flex comp» toma el área de O (que no suma los pies del pórtico) y el W de
Q. Un pórtico tiene área 0, peso propio 0 y #DIV/0! en las tensiones, en cualquier fila.</p>
{formula("='J Tabiques paralelos'!O8", "='J Tabiques paralelos'!O8+'J Tabiques paralelos'!BB8", 'B8', 'Y en M, O y P el W del pórtico (AZ), o el W único por pieza que propone el error 4.')}
{img('d13_j', 'Hoja J de la torre de 34 pisos, filas 8 a 10 (pórticos de dos pies de 0,50 × 0,50 m): O y Q (naranja) en 0 y #DIV/0!; el área y el W del pórtico están en BB y AZ (verde).')}
{par('d13_flex', 'd13_flex_despues', '«Flex comp»: área 0 y #DIV/0! en los tres pórticos.', f'Con BB y AZ: compresión de {sig(d13b("O8"))} a {sig(d13b("O9"))} kg/cm².')}
<div class="preg"><b>Pregunta 5.</b> ¿Los pórticos se verifican en «Flex comp» o en otra hoja? Si es en esta, ¿B debería sumar BB y el W ser AZ?</div>
""")

# ------------------------------------------------------------------------------------------------ 6
ficha(6, 'Tubos circulares: W cuatro veces menor y área en 0', 'media', 'tubos sin verificar (anterior)', f"""
{donde(('Anterior', 'J Tabiques paralelos', 'V4:V23', 'W = J/D/2'), ('Anterior', 'J Tabiques paralelos', 'O21:O23', '0 fijo'),
       ('2025', 'J Tabiques paralelos', 'V y O', 'ya corregidas'))}
{formula('=U4/S4/2', '=U4/(S4/2)', 'V4', 'U4/S4/2 es J/(2·D); el W del tubo es J/(D/2) = 2·J/D, 4 veces más. La 2025 ya tiene =U4/(S4/2).')}
{formula('0', '=B21*C21+F21*G21+J21*K21+PI()*POWER(S21/2,2)-PI()*POWER(T21/2,2)+W21*X21+Z21*AB21+AE21*AF21', 'O21', 'La misma fórmula que O20 (la 2025 la tiene). Se copia a O22 y O23.')}
{SVG_TUBO}
{par('d8_antes', 'd8_despues', 'Caso de prueba: un tubo de Ø 2,00 m y 20 cm de pared en la fila 10 y en la 21. V (naranja) da 0,116 m³ y O21 da 0.', 'Corregida: W = 0,464 m³ y el área de la fila 21, 1,13 m².')}
<p>En «Flex comp» solo las filas 21 a 23 leen V (las demás leen Q, que para un tubo es 0/0), y justo en esas el área es 0: en la planilla
anterior un tubo circular no se puede verificar en ninguna fila.</p>
{par('d8_flex', 'd8_flex_despues', 'Fila 21 de «Flex comp» hoy: área 0 y #DIV/0!.', f'Con O21 y V corregidas: {sig(val("d8_flex_despues", "O21"))} y {sig(val("d8_flex_despues", "P21"))} kg/cm².')}
<div class="preg"><b>Pregunta 6.</b> ¿Se puede pasar la corrección de V y O21:O23 de la 2025 a la planilla anterior, que todavía usan algunos grupos?</div>
""")

# ------------------------------------------------------------------------------------------------ 7
d3a = lambda c: val('d3_antes', c)
d3b = lambda c: val('d3_despues', c)
ficha(7, 'Ocho filas sin peso propio', 'media', f'{pcta(d3b("O13"), d3a("O13"))} de compresión', f"""
{donde(('Anterior y 2025', 'Flex comp PB paralelos', 'D13:D20', '0,01 fijo'))}
{formula('0.01', '=B13*C13', 'D13', 'Volumen = superficie × altura, como en D4:D12 y D21:D23. Se copia hasta D20.')}
{par('d3_antes', 'd3_despues', f'Torre de 34 pisos: {F34[9]} y {F34[10]} caen en las filas 13 y 14. Volumen 0,01 m³ y peso 0,024 t (naranja).', f'Con =B·C: {n(d3b("D13"), 1)} m³ y {n(d3b("E13"), 1)} t de peso propio.')}
{barras('Flex comp, compresión O (kg/cm²), torre de 34 pisos', [(F34[9], d3a('O13'), d3b('O13')), (F34[10], d3a('O14'), d3b('O14'))], 'kg/cm²', 1)}
<p>Una pieza de {n(t2['F'], 2)} m² y {n(P['altura'], 1)} m de alto pesa {n(d3b('E13'), 0)} t; en esas filas pesa 0,024 t. La compresión
crece {pcta(d3b('O13'), d3a('O13'))} con el peso y el núcleo central (K, L contra M) también cambia.</p>
<div class="preg"><b>Pregunta 7.</b> ¿El 0,01 de D13:D20 es un resto de una versión anterior, o esas filas son para piezas sin peso (columnas
metálicas, por ejemplo)? ¿Deberían llevar =B·C?</div>
""")

# ------------------------------------------------------------------------------------------------ 8
d7a = lambda c: val('d7_antes', c)
ficha(8, 'Piezas 8 y 9: faltan dos fórmulas del J asimétrico', 'media', f'J {pct(d7a("AM11"), d7a("AM4"))}', f"""
{donde(('Anterior', 'J Tabiques paralelos', 'Y11:Y12 y AC11:AC12', 'vacías'), ('2025', 'J Tabiques paralelos', 'Y y AC', 'completas'))}
{formula('(vacía)', '=W11*POWER(X11,3)/12+W11*X11*POWER(AK11-X11/2,2)', 'Y11')}
{formula('(vacía)', '=Z11*POWER(AB11,3)/12+Z11*AB11*POWER(AB11/2+X11-AK11,2)', 'AC11', 'Las mismas fórmulas que Y10 y AC10, copiadas a las filas 11 y 12.')}
{par('d7_antes', 'd7_despues', f'Caso de prueba: {FA[0]} de la torre asimétrica en la fila 4 y la misma pieza en la 11. En la 11 faltan Y y AC (naranja): J = {n(d7a("AM11"), 2)} m⁴ en vez de {n(d7a("AM4"), 2)}.', 'Con las fórmulas: las dos filas dan el mismo J.')}
<p>Las filas 11 y 12 son dos de las cuatro filas «asimétricas» de «Flex comp» (11 a 14): justo donde el alumno pone las piezas en C, L o T.
El ala superior y el alma izquierda no suman J, y la pieza toma menos viento en el reparto. La app no usa esas dos filas.</p>
<div class="preg"><b>Pregunta 8.</b> ¿Se pueden completar Y11:Y12 y AC11:AC12 en la planilla anterior?</div>
""")

# ------------------------------------------------------------------------------------------------ 9
d6a = lambda c: val('d6_antes', c)
d6b = lambda c: val('d6_despues', c)
ficha(9, 'Piezas asimétricas: el área sin el ala inferior y un solo W', 'media', f'W {pct(d6b("AN4"), d6a("AN4"))}', f"""
{donde(('Anterior y 2025', 'J Tabiques paralelos', 'O4:O23 (O4:O31)', 'no suma AH·AI'), ('Anterior y 2025', 'J Tabiques paralelos', 'AN4:AN23 (AN4:AN31)', 'W con h/2'))}
{formula('=B4*C4+…+W4*X4+Z4*AB4+AE4*AF4', '=B4*C4+…+W4*X4+Z4*AB4+AE4*AF4+AH4*AI4', 'O4', 'Falta el ala inferior asimétrica (AH·AI). AK, el eje neutro, sí la cuenta.')}
{formula('=AM4/(X4/2+AB4/2+AI4/2)', '=AM4/MAX(AK4,X4+AB4+AI4-AK4)', 'AN4', 'J dividido por la distancia del eje neutro a la fibra más lejana (el W menor). Con dos W (uno por fibra) se puede verificar cada borde con el suyo.')}
{svg_seccion()}
{par('d6_antes', 'd6_despues', f'Torre de 34 pisos, filas 4 a 7 ({F34[0]}, {F34[1]}, {F34[2]} y {F34[3]}): área O y W AN (naranja); AH, AI y AK (violeta).', f'Corregida: el área de {F34[0]} pasa de {n(d6a("O4"), 2)} a {n(d6b("O4"), 2)} m² y el W, de {n(d6a("AN4"), 2)} a {n(d6b("AN4"), 2)} m³.')}
<p>El área cuenta en el peso propio y en N/F. El W de {F34[0]} baja {pct(d6b('AN4'), d6a('AN4'))}: la tensión de flexión en la punta lejana
sube {pct(d6a('AN4') / d6b('AN4'), 1)}. En piezas casi simétricas ({F34[2]}) casi no cambia.</p>
<div class="preg"><b>Pregunta 9.</b> ¿La columna O debería sumar AH·AI? ¿Se verifica cada fibra con su W (J/y sup. y J/y inf.)?</div>
""")

# ------------------------------------------------------------------------------------------------ 10
d9 = lambda c: val('d9_antes', c)
ficha(10, '«J Tabiques ortogonales», fila 23: el J del tubo se suma dos veces', 'media', 'J ×2 (pieza 40)', f"""
{donde(('Anterior y 2025', 'J Tabiques ortogonales', 'N23', 'suma U23'))}
{formula('=D23+I23+M23+U23', '=D23+I23+M23', 'N23', 'N es el J del perfil I (alma y alas). El total de la pieza ya suma el tubo: AY23 = N23 + U23 + AM23 + AX23 (en la 2025, AW23). Así U23 entra dos veces.')}
{img('d9_formulas', 'N22 (violeta) y N23 (naranja): la fila 23 suma U23.', 40)}
{img('d9_antes', f'Caso de prueba: el mismo tubo en las filas 22 y 23. AY22 = {n(d9("AY22"), 2)} m⁴; AY23 = {n(d9("AY23"), 2)} m⁴, el doble.')}
<div class="preg"><b>Pregunta 10.</b> ¿Se puede sacar U23 de N23?</div>
""")

# ------------------------------------------------------------------------------------------------ 11
ficha(11, '«M,NyQ», G55:G57: vínculos a otro libro', 'baja', 'pide actualizar vínculos', f"""
{donde(('Anterior', 'M,NyQ', 'G55:G57', 'leen [1]viento!S56:S58'))}
{formula('=[1]viento!S56', '=+viento!S56', 'G55', 'Como G4:G54. Las filas 55 a 57 son los subsuelos −1º a −3º: el viento ahí es 0, así que el resultado casi no cambia, pero Excel pide «actualizar vínculos» al abrir y, si encuentra el otro libro, trae su presión.')}
{img('d10_formulas', 'G52:G54 (violeta) leen la hoja viento de este libro; G55:G57 (naranja), la de «planilla edificios en torre - 2024.xlsx».')}
""")

# ------------------------------------------------------------------------------------------------ 12
ficha(12, '«Rototrasl. cara menor»: B51 e I51 suman hasta la fila 38', 'media', 'CR del viento B', f"""
{donde(('Anterior', 'Rototrasl. cara menor', 'B51 e I51', 'SUM(B28:B38)'), ('2025', 'Rototrasl. cara menor', 'B51 e I51', 'ya corregidas'))}
{formula('=SUM(B28:B38)', '=SUM(B28:B50)', 'B51', 'Y I51 = SUM(I28:I50). L51 y M51 ya llegan a la 50.')}
{img('d11_formulas', 'B51 e I51 (naranja) contra L51 y M51 (violeta).', 85)}
<p>Las piezas 9 a 20 del viento A no cuentan para el centro de rigidez del viento B (ΣJ y ΣJ·x de las perpendiculares).</p>
""")

# ------------------------------------------------------------------------------------------------ criterio (lo que no es un error de celda)
filas_mold = []
for nom, e, piezas in [('Torre asimétrica', A, ['T1', 'T2', 'T6']), ('Torre de 34 pisos', P, ['T1', 'T3', 'T4', 'T6'])]:
    for k, p in enumerate(piezas):
        x = pz(e, p); v = x['parte']
        filas_mold.append(f"<tr><td>{nom if k == 0 else ''}</td><td>{p}</td><td class=n>{n(v['planilla'], 1)} %</td><td class=n>{n(v['guia'], 1)} %</td>"
                          f"<td class=n>{n(v['cirsoc'], 1)} %</td><td class=n>{n(v['fem'], 1)} %</td></tr>")
GF = {'guia': (0.863, 0.893), 'asim': (0.863, 0.893), 'p34': (0.863, 0.895)}
filas_g = []
for (nom, e), k in zip([('Ejemplo de la guía', G), ('Torre asimétrica', A), ('Torre de 34 pisos', P)], ['guia', 'asim', 'p34']):
    c = e['cargas']; f = 'Frecuencia n1, viento A'; q = 'Corte del viento en PB, viento A'
    filas_g.append(f"<tr><td>{nom}</td><td class=n>{n(c[f]['planilla'], 2)}</td><td class=n>0,85</td><td class=n>{n(GF[k][0], 2)} a {n(GF[k][1], 2)}</td>"
                   f"<td class=n>{n(c[f]['fem'], 2)}</td><td class=n>{n(c[q]['planilla'])}</td><td class=n>{n(c[q]['fem'])}</td><td class=n>{n(c[q]['cirsoc'])}</td></tr>")

criterio = f"""
<section class="duda" id="criterio"><h2><span class="num c">C</span>Preguntas de criterio (no son celdas mal escritas)</h2>
<h3>C1. Piezas de más de cuatro muros y el molde de la hoja J {tag('alta', 'cambia el reparto')}</h3>
<p>El molde de cada pieza tiene un ala superior, un ala inferior y dos almas. Un núcleo con tabiques interiores se tiene que «armar» en
ese molde. En la torre de 34 pisos, T1 tiene seis muros: J = 17,93 m⁴ con el armado de la app, 31,19 m⁴ con el de la sección 7 de la guía
y 34,98 m⁴ con la sección real. Como la rototraslación reparte por J, cambia cuánto toma cada pieza:</p>
<table><tr><th>Ejemplo</th><th>Pieza</th><th>Planilla (molde)</th><th>Guía (sección real)</th><th>CIRSOC</th><th>FEM</th></tr>{''.join(filas_mold)}</table>
<div class="preg"><b>Pregunta C1.</b> Para piezas que no entran en el molde, ¿qué J se espera: el del armado de la sección 7 o el de la sección real?</div>
<h3>C2. Pieza entera o almas y alas por separado {tag('media', 'criterio')}</h3>
<p>«Flex comp» da una tensión por fibra para la pieza entera; la guía separa almas y alas, cada una con su N y su parte del momento.
T1 de la torre asimétrica: {sig(asimT1['sigTracBien'])} de tracción con la planilla corregida (pieza entera) y {sig(asimT1['guiaTrac'])} con la guía.</p>
<div class="preg"><b>Pregunta C2.</b> Para la entrega, ¿la verificación es la de la planilla (pieza entera) o la de la guía (almas y alas)?</div>
<h3>C3. G = 0,85 con frecuencias menores que 1 Hz {tag('media', 'la frecuencia manda')}</h3>
<p>El G está en <code>viento!J4</code> (dato que copia toda la columna J). La planilla calcula la frecuencia pero usa 0,85 igual; con n<sub>1</sub> &lt; 1 Hz
el CIRSOC 102 pide G<sub>f</sub> (edificio flexible).</p>
{img('d12_viento', 'Hoja viento: el G (violeta) es un dato, 0,85, que se copia a todos los niveles.')}
<table><tr><th>Ejemplo</th><th>F planilla (Hz)</th><th>G planilla</th><th>G<sub>f</sub> con esa F</th><th>n<sub>1</sub> FEM</th><th>Q planilla (t)</th><th>Q FEM (t)</th><th>Q CIRSOC (t)</th></tr>{''.join(filas_g)}</table>
<p>Con la frecuencia de la planilla, G<sub>f</sub> supera a 0,85 en 2 a 10 %. Lo que separa a los métodos es la frecuencia: la del FEM es 2 a
2,4 veces menor; con ella el corte en PB crece 2,3 a 3,4 veces.</p>
<div class="preg"><b>Pregunta C3.</b> ¿Qué frecuencia se espera usar y, si da menos de 1 Hz, se pide G<sub>f</sub> o se acepta 0,85?</div>
</section>"""

menores = """
<section class="duda" id="menores"><h2>Celdas raras sin efecto en el resultado</h2>
<table><tr><th>Planilla</th><th>Hoja</th><th>Celda</th><th>Qué tiene</th><th>Por qué no cambia nada</th></tr>
<tr><td>Las dos</td><td>J Tabiques paralelos</td><td class="mono">BD9</td><td><code>=Q9+V9+AN9+0.01</code> (las demás, +0.001)</td><td>Ninguna hoja lee BD (sirve si se adopta la propuesta del error 4).</td></tr>
<tr><td>Anterior</td><td>J Tabiques paralelos</td><td class="mono">BD11:BD14</td><td><code>=AM11+V11+AN11+0.001</code>: suma el J (AM) en vez del W (Q)</td><td>Ídem.</td></tr>
<tr><td>Las dos</td><td>J Tabiques paralelos</td><td class="mono">BB23 (BB31 en la 2025)</td><td>Una fórmula de otra hoja, con BG, BH, BK… vacías</td><td>Da lo mismo que las demás porque esas columnas están vacías.</td></tr>
<tr><td>Anterior</td><td>Rototrasl. cara mayor</td><td class="mono">L25</td><td><code>=SUM(L5:L19)</code> (la menor y la 2025, hasta la 24)</td><td>Es el control ΣJ·a = 0; nadie lo lee.</td></tr>
<tr><td>Anterior</td><td>M,NyQ</td><td class="mono">D13, C14, D14</td><td>Números sueltos (0; 3; 1,5) en lugar de las fórmulas</td><td>Son datos («corregir según corresponda») de los pisos 41º y 40º: solo pesan en torres de más de 40 pisos si no se reescriben (con D13 = 0 el 41º no recibe viento). La app los reescribe.</td></tr>
<tr><td>Las dos</td><td>J Tabiques paralelos</td><td class="mono">Q5</td><td><code>=N5*2/(C5+G5+K5)</code></td><td>Es la misma cuenta que las demás filas, escrita de otra forma.</td></tr>
</table></section>"""

# ------------------------------------------------------------------------------------------------ resumen
resumen = [
    (1, 'Momento de cada pieza = momento + fuerza', 'Rototrasl. (las dos caras)', 'O5:O24', 'las dos', 'alta'),
    (2, 'Cargas cruzadas en la flexocompresión', 'Flex comp PB', 'O4:P23', 'las dos', 'alta'),
    (3, 'Área de una pieza y momento de otra', 'Flex comp PB', 'B, M, O, P 10:23', '2025', 'alta'),
    (4, 'El tipo de fila manda (#DIV/0!)', 'Flex comp PB', 'M, O, P 4:23', 'las dos', 'alta'),
    (5, 'Pórticos sin área ni W', 'Flex comp PB', 'B, M, O, P', 'las dos', 'alta'),
    (6, 'Tubos: W/4 y área 0', 'J Tabiques paralelos', 'V4:V23, O21:O23', 'anterior', 'media'),
    (7, 'Ocho filas sin peso propio', 'Flex comp PB', 'D13:D20', 'las dos', 'media'),
    (8, 'Faltan Y y AC (piezas 8 y 9)', 'J Tabiques paralelos', 'Y11:Y12, AC11:AC12', 'anterior', 'media'),
    (9, 'Área sin ala inferior; un solo W', 'J Tabiques paralelos', 'O, AN', 'las dos', 'media'),
    (10, 'J del tubo dos veces', 'J Tabiques ortogonales', 'N23', 'las dos', 'media'),
    (11, 'Vínculos a otro libro', 'M,NyQ', 'G55:G57', 'anterior', 'baja'),
    (12, 'CR del viento B hasta la fila 38', 'Rototrasl. cara menor', 'B51, I51', 'anterior', 'media'),
]
filas_res = ''.join(f'<tr><td><a href="#e{k}">{k}</a></td><td>{t}</td><td>{h}</td><td class="mono">{c}</td><td>{p}</td><td>{tag(g, g)}</td></tr>' for k, t, h, c, p, g in resumen)

# ------------------------------------------------------------------------------------------------ página
def b64(r):
    return base64.b64encode(open(os.path.join(RAIZ, r), 'rb').read()).decode()


FUENTES = ("@font-face { font-family: 'IBM Plex Math'; src: url(data:font/woff2;base64," + b64('src/assets/fuentes/plex-math-sub.woff2') + ") format('woff2'); }\n"
           "@font-face { font-family: 'IBM Plex Sans'; font-weight: 400; src: url(data:font/woff2;base64," + b64('node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2') + ") format('woff2'); }\n"
           "@font-face { font-family: 'IBM Plex Sans'; font-weight: 600 700; src: url(data:font/woff2;base64," + b64('node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2') + ") format('woff2'); }\n"
           "@font-face { font-family: 'JetBrains Mono'; font-weight: 400; src: url(data:font/woff2;base64," + b64('node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2') + ") format('woff2'); }\n")

CSS = """
:root { --tinta: #1f2328; --gris: #5b6472; --suave: #eef1f5; --acento: #1565c0;
  /* la convención de la app: rojo tracción, azul compresión. Lo demás, otros colores */
  --traccion: #e24b4a; --compresion: #378add;
  --mal: #e65100; --mal-f: #ffe3c2; --bien: #2e7d32; --bien-f: #dff2e1; --ojo: #7b3fa0; }
* { box-sizing: border-box; }
body { margin: 0; background: #fff; color: var(--tinta); font: 14px/1.55 "IBM Plex Sans", "IBM Plex Math", sans-serif; }
main { max-width: 1000px; margin: 0 auto; padding: 28px 20px 60px; }
h1 { font-size: 28px; margin: 0 0 4px; } h2 { font-size: 19px; margin: 0 0 10px; padding-bottom: 6px; border-bottom: 2px solid var(--suave); display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
h3 { font-size: 15px; margin: 18px 0 4px; } p, li { max-width: 86ch; } .sub { color: var(--gris); margin: 0 0 16px; }
.num { display: inline-grid; place-items: center; min-width: 30px; height: 30px; border-radius: 50%; background: var(--mal); color: #fff; font-size: 15px; }
.num.c { background: var(--gris); }
table { border-collapse: collapse; width: 100%; font-size: 12.5px; margin: 8px 0 12px; }
th, td { border-bottom: 1px solid #e3e7ec; padding: 4px 7px; text-align: left; vertical-align: top; }
th { background: var(--suave); font-weight: 600; } td.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.mono, code { font-family: "IBM Plex Sans", sans-serif; font-size: 12.5px; letter-spacing: .01em; }  /* no monoespaciada: en ella la O de las columnas se confunde con el cero */
code { background: var(--suave); padding: 0 4px; border-radius: 3px; }
.tag { display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 9px; border-radius: 999px; background: var(--suave); color: var(--gris); white-space: nowrap; }
.tag.alta { background: #ffe0c2; color: #9a3c00; } .tag.media { background: #fff3c4; color: #7a5600; } .tag.baja { background: var(--suave); }
.comp { color: var(--compresion); font-weight: 600; } .trac { color: var(--traccion); font-weight: 600; } .err { color: var(--gris); font-style: italic; }
.donde { width: auto; min-width: 70%; } .donde td:nth-child(3) { color: var(--mal); font-weight: 600; }
.formulas { margin: 8px 0; }
.fx { display: grid; grid-template-columns: 64px 84px 1fr; align-items: center; border-radius: 8px; margin: 4px 0; overflow: hidden; border: 1px solid; }
.fx .cel { font: 700 13.5px "IBM Plex Sans", sans-serif; text-align: center; padding: 6px 0; }
.fx .lbl { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; padding: 6px 8px; }
.fx code { background: none; font-size: 13px; padding: 6px 10px; word-break: break-all; }
.fx.mal { border-color: var(--mal); background: var(--mal-f); } .fx.mal .cel, .fx.mal .lbl { background: var(--mal); color: #fff; }
.fx.bien { border-color: var(--bien); background: var(--bien-f); } .fx.bien .cel, .fx.bien .lbl { background: var(--bien); color: #fff; }
.nota-fx { font-size: 12.5px; color: var(--gris); margin: 4px 0 8px; }
.cap { margin: 10px 0; width: var(--w); } .cap img { width: 100%; height: auto; display: block; border: 1px solid #d5dae0; border-radius: 6px; }
.cap figcaption { font-size: 12px; color: var(--gris); margin-top: 4px; }
.par { display: grid; grid-template-columns: 1fr; gap: 4px; margin: 8px 0; }
.par .lado { border-left: 5px solid; padding-left: 10px; break-inside: avoid; } .par .mal { border-color: var(--mal); } .par .bien { border-color: var(--bien); }
.par .et { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; }
.par .mal .et { color: var(--mal); } .par .bien .et { color: var(--bien); }
.par .cap { margin: 2px 0 6px; }
.preg { border-left: 4px solid var(--acento); background: #f3f7fc; padding: 8px 14px; margin: 12px 0; border-radius: 0 8px 8px 0; }
.preg b:first-child { color: var(--acento); }
.caja { background: var(--suave); border-radius: 8px; padding: 10px 14px; margin: 10px 0; } .caja.ok { background: #e8f5e9; }
.leyenda { display: flex; flex-wrap: wrap; gap: 10px 22px; font-size: 12.5px; margin: 8px 0; }
.leyenda span { display: inline-flex; align-items: center; gap: 6px; }
.leyenda i { width: 26px; height: 16px; border-radius: 3px; border: 2.5px solid; display: inline-block; }
svg text { font-family: "IBM Plex Sans", sans-serif; font-size: 12px; fill: var(--tinta); }
svg .t { font-weight: 600; font-size: 12.5px; } svg .s { font-size: 10.5px; fill: var(--gris); } svg .h { font-weight: 600; }
svg .m { font: 9.5px "JetBrains Mono", monospace; fill: var(--gris); }
.flujo, .dib { width: 100%; height: auto; margin: 6px 0 10px; display: block; }
.flujo .hoja rect { fill: #fff; stroke: #8892a0; stroke-width: 1.5; } .flujo .hoja.fin rect { fill: var(--suave); }
.flujo .hoja text { text-anchor: middle; font-weight: 600; font-size: 14px; } .flujo .hoja text.s { font-weight: 400; font-size: 11px; }
.flujo path { fill: none; stroke: #8892a0; stroke-width: 1.6; }
.flujo .err circle { fill: var(--mal); } .flujo .crit circle { fill: var(--gris); }
.flujo .err text, .flujo .crit text { fill: #fff; font-weight: 700; font-size: 11px; text-anchor: middle; }
.dib .mal { fill: var(--mal); font-weight: 600; }
.dib rect.mom { fill: #ede4f5; stroke: var(--ojo); } .dib rect.fza { fill: #fff3c4; stroke: #b08400; }
.dib rect.malo { fill: var(--mal-f); stroke: var(--mal); stroke-width: 2; } .dib rect.bueno { fill: var(--bien-f); stroke: var(--bien); stroke-width: 2; }
.dib .op { font-size: 22px; font-weight: 600; fill: var(--gris); }
.dib .muro { fill: #c7ccd3; stroke: #6b7480; } .dib .pc { fill: var(--compresion); opacity: .35; } .dib .pt { fill: var(--traccion); opacity: .35; }
.dib .cc { fill: var(--compresion); font-weight: 600; } .dib .ct { fill: var(--traccion); font-weight: 600; }
.dib tspan.cc { fill: var(--compresion); } .dib tspan.ct { fill: var(--traccion); }
.dib .en { stroke: var(--ojo); stroke-width: 2; } .dib .mitad { stroke: var(--mal); stroke-width: 2; stroke-dasharray: 6 4; }
.dib .cota { stroke: var(--gris); stroke-width: 1.2; fill: none; }
.dib .ff { fill: #fff; stroke: #8892a0; } .dib .ff.mal { fill: var(--mal-f); stroke: var(--mal); }
.dib .jf { fill: #fff; stroke: #8892a0; } .dib .huerf { fill: #d5dae0; stroke: #8892a0; stroke-dasharray: 2 2; }
.dib path.area { fill: none; stroke: #8892a0; stroke-width: 1.2; } .dib path.area.malo { stroke: var(--mal); stroke-width: 1.8; }
.dib line.area { stroke: var(--mal); stroke-width: 2; } .dib .mom2, .dib line.mom2 { fill: none; stroke: var(--ojo); stroke-width: 1.2; opacity: .8; }
.graf { margin: 8px 0; } .barras { width: 100%; max-width: 760px; height: auto; display: block; }
.barras .b-antes, .sw.b-antes { fill: #b8bfc8; background: #b8bfc8; } .barras .b-desp, .sw.b-desp { fill: var(--bien); background: var(--bien); }
.barras .v { font-size: 11px; fill: var(--gris); } .barras .n { font-weight: 600; }
.ley { font-size: 11.5px; color: var(--gris); display: flex; gap: 8px; align-items: center; }
.sw { display: inline-block; width: 14px; height: 10px; border-radius: 2px; margin-left: 8px; }
.duda { break-before: page; }
@media print { main { max-width: none; padding: 0 2mm; } body { font-size: 12.5px; line-height: 1.45; }
  table, .preg, .fx, .cap, .graf, .dib, .flujo { break-inside: avoid; } h2, h3 { break-after: avoid; } p { margin: 5px 0; } }
@media (max-width: 700px) { .fx { grid-template-columns: 52px 1fr; } .fx .lbl { display: none; } table { font-size: 11.5px; } }
"""

html = f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Errores de la planilla</title>
<style>{FUENTES}{EQ.CSS}{CSS}</style></head><body><main>
<h1>La planilla de la cátedra, celda por celda</h1>
<p class="sub">Torre 3D · qué celdas dan mal, cómo se corrigen y cuánto cambia, en la planilla anterior y en la 2025 ·
para llevar a la cátedra · 27 de noviembre de 2026</p>

<div class="caja"><b>Criterio.</b> La planilla es de la cátedra: la app la reproduce tal como está y <b>no la cambia</b>. Este documento
muestra lo que encontramos al revisarla fórmula por fórmula, con la celda exacta, una captura de la hoja con un ejemplo cargado, la
corrección que proponemos y la misma captura con la corrección aplicada en una copia. Algunas pueden ser simplificaciones a propósito:
por eso cada ficha termina con una pregunta.</div>

<h2>Dónde está cada error</h2>
{SVG_FLUJO}
<table class="indice"><tr><th>#</th><th>Qué pasa</th><th>Hoja</th><th>Celdas</th><th>Planilla</th><th>Efecto</th></tr>{filas_res}
<tr><td><a href="#criterio">C</a></td><td>Molde de la hoja J, pieza entera o por muros, G = 0,85</td><td>J, Flex comp, viento</td><td class="mono">—</td><td>las dos</td><td>{tag('media', 'criterio')}</td></tr></table>

<h2>Cómo leer las capturas</h2>
<p>Son capturas de LibreOffice Calc con la planilla tal como la exporta la app para un ejemplo (encabezados de filas y columnas como en
la pantalla). Las «corregidas» son la misma planilla con la fórmula cambiada en una copia y recalculada: los números son los que da la hoja.
Los dos casos de prueba (una pieza copiada en las filas 11 y 12, un tubo de Ø 2 m) están dichos en su ficha.</p>
<div class="leyenda"><span><i style="border-color:var(--mal);background:var(--mal-f)"></i>la celda que está mal</span>
<span><i style="border-color:var(--bien);background:var(--bien-f)"></i>la celda corregida</span>
<span><i style="border-color:var(--ojo);background:#fff"></i>lo que se compara o lo que suma</span>
<span><b class="comp">azul</b>: compresión · <b class="trac">rojo</b>: tracción (como en la app)</span></div>
<p>Los ejemplos: el de la guía 2024 (20 pisos, simétrico), la torre asimétrica (el anexo de la guía: T5 aislado, la planta rota) y una
torre de 34 pisos con núcleos de seis muros y pórticos.</p>

{''.join(html_fichas)}
{criterio}
{menores}

<section class="duda"><h2>Lo que está bien</h2>
<div class="caja ok"><ul>
<li>σ = −N/F ± M/W, el núcleo central k = W/F y la comparación con e = M/N: correctos para una sección sin fisurar.</li>
<li>Unidades de la flexocompresión (t/m² × 0,1 = kg/cm²) y el W de las piezas simétricas (Q).</li>
<li>La traslación del reparto (W·J/ΣJ), el eje de inercia y el J de cada molde (Y, AC, AG, AJ con Steiner al eje neutro AK).</li>
<li>La hoja viento: qz, qh (N con $N$4) y p = qz·G·Cp − qh·G·Cp; la 2025 escribió N = SI(M=0;0;$N$4), que da lo mismo.</li>
<li>La 2025 ya corrigió el W y el área de los tubos (error 6), las fórmulas de las piezas 8 y 9 (error 8) y las sumas del CR (error 12).</li>
</ul></div>
<h2>Erratas de la guía (no son de la planilla)</h2>
<ul>
<li>Anexo de rototraslación: con las posiciones que da (T1 a T4 a ±10 m, T5 a −6 m, T6 a +4,14 m) el eje de inercia queda a 1,77 m, no a 0,37 m.</li>
<li>T1: el largo traccionado del triángulo figura como 78 cm (y 1,05 m en el esquema); con σ = +137,78 / −788 t/m² sale 0,67 m.</li>
<li>τ adm: la guía da 24 kg/cm² para H30; para otros hormigones la app usa 0,08·σbk. Hay que confirmarlo.</li>
</ul>
<h2>Cómo lo llevamos</h2>
<ol>
<li>Primero los errores 1 y 2 con la torre asimétrica: juntos, la tracción de {FA[1]} pasa de {sig(d2a('P5'))} a {sig(d14('P5'))} kg/cm².</li>
<li>Después 3, 4 y 5: son las piezas que hoy quedan sin verificar o se verifican con datos de otra pieza.</li>
<li>Del 6 al 12, como lista de correcciones de celdas (casi todas de una línea).</li>
<li>Las de criterio (C1 a C3) como preguntas.</li>
<li>Hasta tener las respuestas, la app sigue dando los números de la planilla tal cual en el método Planilla y muestra al lado los de la
guía y el CIRSOC.</li>
</ol>
<h2>Cómo se rearma este documento</h2>
<p class="mono">DUDAS=1 npx vitest run tools/dudas · python3 tools/dudas/capturas.py · python3 tools/dudas/armar.py · node tools/dudas/pdf.cjs</p>
<p>Las planillas llenas que usan las capturas quedan en <code>docs/dudas_planilla/planillas/</code>; las originales de la cátedra
(<code>src/assets</code>) no se tocan.</p>
</section>
</main></body></html>
"""
open(os.path.join(DOC, 'index.html'), 'w').write(html)
print('ok', len(html))
