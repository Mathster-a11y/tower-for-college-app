"""Arma red.html («La red de las matemáticas», fase 2) con el estilo y el motor de diagramas de motor.html."""
import json, os, re
D = os.path.dirname(os.path.abspath(__file__))
base = open(os.path.join(D, 'motor.html')).read()
head = base[:base.index('<body>') + len('<body>')].replace('<title>El motor de cálculo de Torre 3D</title>', '<title>La red de las matemáticas</title>')
script = base[base.index('<script type="module">'):]
datos = json.load(open('/tmp/claude-0/-home-user/27c2d932-7250-58c9-9cd9-6a2946c2c7af/scratchpad/guia2/datos.json'))
e = datos['exo']

def f(x, d=2):
    s = f"{x:,.{d}f}".replace(',', 'X').replace('.', ',').replace('X', '.')
    return s.replace('-', '−')

EXTRA = """
<style>
.t2 td, .t2 th { padding: 1mm 1.6mm; font-size: 8.4pt; }
.t2 td.n, .t2 th.n { text-align: right; font-variant-numeric: tabular-nums; }
.t3 td { font-size: 8.6pt; padding: 1.2mm 2mm; }
.t3 td:first-child { font-weight: 600; color: var(--cd); white-space: nowrap; }
.cuenta { border: 1.5px solid var(--cf); border-left: 4px solid var(--c); border-radius: 2mm; padding: 1.6mm 3mm; margin: 0 0 2mm; font-size: 9pt; break-inside: avoid; }
.cuenta b.t { display: block; font: 700 9.5pt 'IBM Plex Sans Condensed'; color: var(--cd); margin-bottom: .6mm; }
.cuenta .eqt { background: var(--cf); color: var(--cd); font-weight: 600; padding: .2mm 1.4mm; border-radius: 1mm; }
.cuenta .cel { font: 600 7.5pt 'IBM Plex Mono'; color: #56616c; background: #f2f4f6; border-radius: 1mm; padding: 0 1.2mm; margin-left: 1mm; }
.col3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5mm; flex: 1; min-height: 0; }
.col2 { display: grid; grid-template-columns: 1.1fr 1fr; gap: 6mm; flex: 1; min-height: 0; }
.ok2 { color: var(--ok); font-weight: 700; } .ro2 { color: var(--ro); font-weight: 700; }
</style>
"""
head = head.replace('</head>', EXTRA + '</head>')

C = {'acento': '--c:#1a6bbd;--cf:#e1edf9;--cd:#0f4a85', 'viento': '--c:#b8401a;--cf:#fbe6dc;--cd:#7a2a0f', 'fuerzas': '--c:#3f51b5;--cf:#e4e7f7;--cd:#27348a',
     'rig': '--c:#5d4037;--cf:#efe7e3;--cd:#3e2a24', 'roto': '--c:#6a3d9a;--cf:#ece4f5;--cd:#4a2a6e', 'flex': '--c:#ad1457;--cf:#f9e0ea;--cd:#7a0e3d',
     'exo': '--c:#1d7f5f;--cf:#ddf2ea;--cd:#0f5640'}
pags = []
def pag(color, eyebrow, num, titulo, cuerpo, lead=''):
    pags.append(f"""<section class="pag" style="{C[color]}">
  <div class="banda"></div>
  <div class="cab"><span class="eyebrow">{eyebrow}</span><span class="eyebrow">{num}</span></div>
  <h2>{titulo}</h2>
  {f'<p class="lead">{lead}</p>' if lead else ''}
  {cuerpo}
  <div class="pie"><span>Torre 3D · La red de las matemáticas</span><span>{eyebrow}</span></div>
</section>""")

# ---------------------------------------------------------------- portada
portada = f"""<section class="pag portada">
  <div class="franja"><i style="background:#b8401a"></i><i style="background:#3f51b5"></i><i style="background:#5d4037"></i><i style="background:#6a3d9a"></i><i style="background:#ad1457"></i><i style="background:#1d7f5f"></i></div>
  <div class="eyebrow">TORRE 3D · EDIFICIOS EN TORRE · FAUD-UNMDP</div>
  <h1>La red de las matemáticas</h1>
  <p>Qué celda le pasa qué número a qué otra: la planilla original, la planilla nueva con la hoja de balance, lo que pide el CIRSOC y lo que hace la app con el exoesqueleto, las fibras de los tabiques y los tabiques que se afinan. Al final, una torre chica calculada a mano, paso a paso, con los mismos números que da la app.</p>
  <div class="kpis">
    <div><b>344</b><span>pruebas automáticas en verde</span></div>
    <div><b>0,000 %</b><span>diferencia en N de cada barra contra structural-solver</span></div>
    <div><b>10⁻¹³</b><span>diferencia de la hoja de balance (LibreOffice) con el motor</span></div>
    <div><b>4</b><span>edificios reales con fuentes: Citicorp, Hancock, Hearst y Onterie</span></div>
  </div>
  <p style="margin-top:12mm;font-size:9.5pt;color:#8a9aab">Noviembre de 2026 · Augusto Andrés Marsella · Torre 3D · Sigue a «El motor de cálculo de Torre 3D» (pasos 1 a 7); esta guía agrega los pasos 8 a 10.</p>
</section>"""

# ---------------------------------------------------------------- 2 contenido
pag('acento', 'Introducción', 2, 'Contenido y cómo leer los cuadros', """
  <div class="dos" style="grid-template-columns:.9fr 1.1fr;gap:10mm">
    <div class="indice">
      <div><b>3</b><i style="background:#1a6bbd"></i>Cuadro 1 · La planilla original, pura</div>
      <div><b>4</b><i style="background:#1a6bbd"></i>Cuadro 2 · La planilla nueva (hojas «G ·» y balance)</div>
      <div><b>5</b><i style="background:#1a6bbd"></i>Cuadro 3 · Lo que indica el CIRSOC (102, 201 y 301)</div>
      <div><b>6</b><i style="background:#1a6bbd"></i>Cuadro 4 · Lo que hace la app</div>
      <div><b>7</b><i style="background:#1d7f5f"></i>Paso 8 · Exoesqueleto: el reparto entre tabiques y exo</div>
      <div><b>8</b><i style="background:#1d7f5f"></i>Paso 9 · La hoja de balance</div>
      <div><b>9</b><i style="background:#ad1457"></i>Paso 10 · Fibras de los tabiques y espesor por tramos</div>
      <div><b>10</b><i style="background:#b8401a"></i>Ejemplo 1 · Viento, fuerzas, corte y momento</div>
      <div><b>11</b><i style="background:#1d7f5f"></i>Ejemplo 2 · Rigideces y reparto</div>
      <div><b>12</b><i style="background:#1d7f5f"></i>Ejemplo 3 · Barras del exo y CIRSOC 301</div>
      <div><b>13</b><i style="background:#ad1457"></i>Ejemplo 4 · Fibra del tabique, con y sin exo</div>
      <div><b>14</b><i style="background:#1a6bbd"></i>Validación: cómo se controló la matemática</div>
      <div><b>15</b><i style="background:#1a6bbd"></i>Los edificios reales</div>
    </div>
    <div>
      <p class="lead"><b style="color:var(--tinta)">Los cuadros.</b> Cada cuadro tiene un número, un título, la ecuación resaltada y, en gris, la celda de la planilla (hoja!columna) o la etapa de la app donde se ve. Gris claro: un dato. Verde: lo que agrega la planilla nueva o corrige la app. Ocre y redondeado: un control. Punteado: lo que sale hacia otra hoja o etapa.</p>
      <p class="lead"><b style="color:var(--tinta)">Las flechas.</b> Llena: el número pasa al cuadro siguiente (el rótulo dice cuál). Punteada verde: lo nuevo lee de lo original sin cambiarlo.</p>
      <p class="lead"><b style="color:var(--tinta)">Unidades.</b> Como la planilla: fuerzas en t, momentos en tm, presiones en N/m² y después en t/m², tensiones en kg/cm² (1 kg/cm² = 10 t/m²), longitudes en m, J en m⁴. E del hormigón H30: 3 400 000 t/m² (el de la planilla: divisor de h/500 · 500 / 8); E del acero: 21 000 000 t/m².</p>
      <p class="lead"><b style="color:var(--tinta)">Viento A</b> sopla en la dirección y de la planta. El ejemplo de las páginas 10 a 13 sigue ese viento.</p>
    </div>
  </div>""")

# ---------------------------------------------------------------- 3 planilla original
pag('acento', 'Cuadro 1 · Planilla original', 3, 'La planilla original, pura: qué hoja le pasa qué a cuál', """
  <div class="cuerpo"><div class="diag"><pre class="mermaid">
flowchart TB
  S["#Datos del alumno¦sitio, cotas, anchos, piezas"]:::dato
  V1["#①Viento¦=qz = 0,613·Kzt·Kd·V²·I·Kz¦=p = (qz·G·Cpb − qh·G·Cps)/10 000¦@viento!M y S"]
  M2["#②M,NyQ¦=Wi = h·B·p · Q = ΣW · M = ΣQ·h¦=P, ν = Me/Mv, σ suelo¦@M,NyQ!H, I, J, M"]
  J3["#③J tabiques paralelos¦=J de cada pieza con su molde¦=ΣJ ≥ J mín = W·h²/divisor¦@J!AY y M37"]
  J4["#④J tabiques ortogonales¦=lo mismo para el viento B¦@J ortog.!AY"]
  R5["#⑤Rototrasl. cara mayor¦=fracción = J/ΣJ · Q y M de cada pieza¦=Mt = Q·e · Qrot = Mt·J·a/ΣJa²¦@Roto!C, G, N"]
  R6["#⑥Rototrasl. cara menor¦=lo mismo con la cara b¦@Roto menor"]
  F7["#⑦Flex comp PB¦=σ = −N/F ± M/W¦=As = T/σe¦@Flex!…"]
  S --> V1 -->|"p de cada nivel"| M2
  M2 -->|"W, h"| J3
  M2 -->|"W, h"| J4
  J3 -->|"J y posición"| R5
  J4 -->|"J y posición"| R6
  M2 -->|"Q y Mv en PB"| R5
  M2 -->|"Q y Mv en PB"| R6
  R5 -->|"M de cada pieza"| F7
</pre></div><div class="notas"><div><b>Siete hojas</b> que se pasan números de arriba abajo. La app las escribe como siempre y no las toca.</div><div><b>Sin exoesqueleto</b>: todo el viento lo toman las piezas de las hojas J (los tabiques).</div><div><b>Una sección por pieza</b>: la hoja J usa el espesor de PB en toda la altura.</div></div></div>""",
    'Las 7 hojas tal cual vienen del curso, sin correcciones ni agregados. Cada flecha dice qué número pasa.')

# ---------------------------------------------------------------- 4 planilla nueva
pag('acento', 'Cuadro 2 · Planilla nueva', 4, 'La planilla nueva: las hojas «G ·» leen las originales sin cambiarlas', """
  <div class="cuerpo"><div class="diag"><pre class="mermaid">
flowchart TB
  O["#Las 7 hojas originales¦viento · M,NyQ · J · Rototrasl. · Flex¦(las fórmulas no cambian)"]:::dato
  T["#Hojas T3D¦la torre completa: niveles, muros,¦espesor en altura, juntas, exo"]:::dato
  VC["#G · Viento corregido¦=z′ = máx(z ; 5 m)¦@lee viento!"]:::corr
  CA["#G · Carta de la torre¦=Wi, Q, M, N en altura¦@lee M,NyQ!H a O"]:::corr
  SR["#G · Sección real¦=J con todos los muros y Steiner¦@lee T3D Muros"]:::corr
  EX["#G · Exoesqueleto¦=ρ = F tab / W (motor de la app)¦=barras: N, M, σ, λ"]:::corr
  BA["#G · Balance tabiques + exo¦=W tab = ρ·W · W exo = W − W tab¦=Q y M de cada parte, como I y J¦@lee M,NyQ!C, H, I, J y Roto!C"]:::corr
  K(["#Controles de la hoja¦=Σ W tab + Σ W exo − Σ W = 0¦=con ρ = 1, igual a M,NyQ"]):::ctrl
  P["#→ Piezas con el exo¦M en PB = C·M tabiques"]:::sale
  O -.-> VC
  O -.-> CA
  T -.-> SR
  O -.-> BA
  EX -->|"ρ de cada piso"| BA
  BA --> K
  BA --> P
</pre></div><div class="notas"><div><b>No se toca ninguna hoja original</b>: las hojas nuevas leen sus celdas con fórmulas.</div><div><b>Balance</b>: la única columna que viene de la app es ρ (sale de la matriz de rigidez de las caras, que no entra en Excel). El resto son fórmulas.</div><div><b>Verificada</b> en LibreOffice: M de los tabiques de la hoja menos el del motor ≈ 10⁻¹³.</div></div></div>""",
    'Lo verde es lo que agrega la planilla nueva. Las flechas punteadas leen de las hojas originales; la de balance dice cuánto trabajan los tabiques y cuánto el exoesqueleto.')

# ---------------------------------------------------------------- 5 CIRSOC
pag('acento', 'Cuadro 3 · CIRSOC', 5, 'Lo que indica el CIRSOC, lo que hace la planilla del curso y lo que hace la app', """
  <table class="t3"><thead><tr><th>Tema</th><th>Lo que indica el CIRSOC</th><th>La planilla del curso</th><th>La app</th></tr></thead><tbody>
  <tr><td>102 · presión</td><td>qz = 0,613·Kz·Kzt·Kd·V²·I (N/m²); Kz de la Tabla 5</td><td>la misma fórmula (viento!M)</td><td>igual; columna «Guía/CIRSOC»</td></tr>
  <tr><td>102 · Kz abajo</td><td>Tabla 5, nota 2: debajo de 5 m se usa z = 5 m</td><td>usa la altura real (error E5)</td><td>z′ = máx(z ; 5 m) y hoja «G · Viento corregido»</td></tr>
  <tr><td>102 · ráfaga y Cp</td><td>G = 0,85 (estructura rígida); Cp 0,8 barlovento, −0,5/−0,3/−0,2 sotavento según L/B</td><td>G y Cp como datos</td><td>los mismos datos</td></tr>
  <tr><td>102 · torsión</td><td>casos de carga de la Figura 9 (viento con excentricidad y viento en diagonal)</td><td>e = Xr del centro de rigidez</td><td>rotación muro por muro; con exo, viento a 45° como 0,71·A + 0,71·B en las esquinas</td></tr>
  <tr><td>201 · tabiques</td><td>diseño por resistencia (estados últimos, como el ACI 318)</td><td>verificación simplificada en tensiones: σ = −N/F ± M/W contra σbk; As = T/σe; cuantía mínima</td><td>la del curso, en PB y en la base de cada piso (fibras), con o sin exo</td></tr>
  <tr><td>301 · barras de acero</td><td>LRFD: 1,2·D + 1,6·W; φt·Pn = 0,9·Fy·A; φc·Pn = 0,85·Fcr·A con λc; φb·Mn = 0,9·Z·Fy; interacción H1-1a/b; pared b/t ≤ 1,40·√(E/Fy)</td><td>no tiene exoesqueleto</td><td>control simple (σ adm y π²EI/1,7L²) y CIRSOC 301 completo, barra por barra; «Dimensionar» exige los dos</td></tr>
  <tr><td>Flecha</td><td>límite de servicio: lo fija el proyecto</td><td>J mín para δ ≤ h/500 con carga uniforme</td><td>h/500 con la deformada real (y h/n a elección con el exo)</td></tr>
  </tbody></table>
  <p class="lead" style="margin-top:3mm">El CIRSOC 201 y la guía del curso no miden lo mismo: el reglamento pide resistencia con cargas mayoradas; la guía, una verificación en tensiones de servicio. La app hace la de la guía y lo dice. Para el acero del exoesqueleto, que la guía no trae, la app usa el CIRSOC 301.</p>""",
    'Tres reglamentos: viento (102), hormigón (201) y acero (301). La columna del medio es lo que simplifica la planilla.')

# ---------------------------------------------------------------- 6 app
pag('acento', 'Cuadro 4 · La app', 6, 'Lo que hace la app: los motores y dónde se ve cada cosa', """
  <div class="cuerpo"><div class="diag"><pre class="mermaid">
flowchart TB
  P["#Proyecto¦niveles · muros (espesor por tramos, juntas)¦sitio · exoesqueleto"]:::dato
  M["#Mapeo a la planilla¦piezas, moldes, filas¦J real sin doble conteo en las juntas"]
  R["#Motores 1 a 3¦réplica · Guía/CIRSOC · analítico¦@etapas 01 a 07"]
  JZ["#J piso a piso¦=ΣJ(z) con el espesor de cada tramo¦@botón J del 3D · etapa 05"]
  X["#⑧Motor del exo¦=(K tab + Σ K cara)·u = W¦@etapa 08"]:::corr
  B["#⑨Balance¦=F tab = K tab·u · F exo = W − F tab¦@hoja G · Balance"]:::corr
  F["#⑩Fibras¦=σ = −N/A ± M/W en cada piso¦@etapa 07 · capa σ del 3D"]:::corr
  C3(["#CIRSOC 301 y viento a 45°¦=interacción ≤ 1 · 0,71·(N A + N B)¦@etapa 08"]):::ctrl
  P --> M --> R
  P --> JZ
  JZ -->|"E·J(z) de los tabiques"| X
  R -->|"W de cada piso"| X
  X -->|"ρ y M tab"| B
  X -->|"M que les queda"| F
  X --> C3
</pre></div><div class="notas"><div><b>Pasos 1 a 7</b>: los de «El motor de cálculo» (viento, fuerzas, estabilidad, rigidez, rototraslación, flexocompresión).</div><div><b>Pasos 8 a 10</b>: lo nuevo de esta fase, con el mismo formato.</div><div><b>Todo en verde</b> se controla contra otro camino de cálculo (página 14).</div></div></div>""",
    'Un proyecto, tres motores para la planilla y uno nuevo para el exoesqueleto. Cada cuadro dice en qué etapa de la app se ve.')

# ---------------------------------------------------------------- 7 paso 8
pag('exo', 'Paso a paso 8 · Exoesqueleto', 7, 'El reparto del viento entre tabiques y exoesqueleto', """
  <div class="cuerpo"><div class="diag"><pre class="mermaid">
flowchart TB
  W["#Viento de cada piso¦W i de M,NyQ (o corregido)"]:::dato
  T["#①Tabiques como ménsula¦=K tab de vigas de E·J(z), un u por piso¦@J piso a piso"]
  CA["#②Cada cara del exo¦=pórtico plano: barras con E·A y E·I,¦=uniones rígidas o articuladas"]
  CO["#③Condensación al piso¦=K c = Kmm − Kms·Kss⁻¹·Ksm¦=la losa es un diafragma: un u por piso"]
  S["#④Sistema combinado¦=(K tab + Σ K c)·u = W"]
  R["#⑤Reparto¦=F tab = K tab·u · F exo = W − F tab"]
  E["#⑥Esfuerzos de cada barra¦=f = k′·T·d − P′"]
  J["#⑦J equivalente de la cara¦=ménsula que se corre igual"]
  K(["#Controles¦=F tab + F exo = W en cada piso¦=Σ reacciones = corte del exo"]):::ctrl
  W --> S
  T --> S
  CA --> CO --> S --> R --> K
  S --> E
  CO --> J
</pre></div><div class="notas"><div><b>Dos resortes en paralelo</b>: tabiques y exo se corren lo mismo en cada piso (la losa los ata) y cada uno toma según su rigidez.</div><div><b>La cara se condensa</b> a un grado de libertad por piso; los nudos entre pisos (el cruce de una X) quedan libres.</div><div><b>Arriba puede dar negativo</b>: la ménsula y el pórtico se deforman distinto y el pórtico empuja a los tabiques hacia atrás. Lo que cuenta es el momento en la base.</div></div></div>""",
    'Unidades: t y m. Cada piso tiene un solo corrimiento horizontal u; los dos sistemas lo comparten.')

# ---------------------------------------------------------------- 8 paso 9
pag('exo', 'Paso a paso 9 · Balance', 8, 'La hoja «G · Balance tabiques + exo», columna por columna', """
  <div class="cuerpo"><div class="diag"><pre class="mermaid">
flowchart TB
  A["#Lee M,NyQ¦=h = C · W = H (cara b: D·F·G)¦=M sin exo = J (cara b: O)"]:::dato
  RH["#ρ tabiques (app)¦=ρ = F tab / W, piso por piso"]:::dato
  B1["#①W de cada parte¦=W tab = ρ·W · W exo = W − W tab"]:::corr
  B2["#②Corte de los tabiques¦=Q tab(k) = Q tab(k−1) + W tab(k−1)¦@como M,NyQ!I"]:::corr
  B3["#③Momento de los tabiques¦=M tab(k) = M tab(k−1) + Q tab(k)·h(k)¦@como M,NyQ!J"]:::corr
  B4["#④Lo que toma el exo¦=Q exo = Q − Q tab · M exo = M − M tab"]:::corr
  B5["#⑤Piezas en PB¦=M pieza = C·M tab(PB)¦@C de Rototrasl."]:::corr
  K(["#Controles¦=Σ W tab + Σ W exo − Σ W = 0¦=Δ con la app ≈ 0¦=ρ = 1 → igual a M,NyQ"]):::ctrl
  A --> B1
  RH --> B1
  B1 --> B2 --> B3 --> B4
  B3 --> B5
  B3 --> K
</pre></div><div class="notas"><div><b>Misma regla que M,NyQ</b>: el corte en el nivel k suma las fuerzas de arriba; el momento suma corte por altura del entrepiso.</div><div><b>Si el exo no existiera</b> (ρ = 1 en todos los pisos) la hoja da exactamente M,NyQ.</div><div><b>«Δ con la app»</b> da 0 con los valores de la planilla y unas décimas por mil con los de la Guía/CIRSOC (Kz desde 5 m).</div></div></div>""",
    'Todo lo verde son fórmulas de Excel. Se lee de arriba (azotea) a abajo (PB), en el orden de M,NyQ.')

# ---------------------------------------------------------------- 9 paso 10
pag('flex', 'Paso a paso 10 · Fibras', 9, 'Fibras de los tabiques en cada piso, con el espesor de cada tramo', """
  <div class="cuerpo"><div class="diag"><pre class="mermaid">
flowchart TB
  Z["#Corte en la base del piso¦cota z, justo encima de la losa"]:::dato
  S["#①Sección en z¦=e(z) del tramo · A = e·L · J pieza(z)"]
  N["#②Carga en z¦=N = A·Σ e·Δz·2,4 + q·a·n losas arriba¦=q = 0,7 (descargado) o 0,9 t/m² (cargado)"]
  M["#③Momento de la pieza¦=M = fracción · M(z)¦=con exo: M(z) = M que les queda a los tabiques"]
  SG["#④Tensiones extremas¦=σ = −N/A ± M·y/J"]
  K(["#Controles¦=tracción descargado → As = T/σe¦=compresión cargado ≤ σbk"]):::ctrl
  P["#→ 3D: capa σ¦peor fibra de cada piso"]:::sale
  Z --> S --> N --> SG
  Z --> M --> SG --> K
  SG --> P
</pre></div><div class="notas"><div><b>En PB</b> y sin exo es exactamente la flexocompresión de la etapa 07 (la guía, sección 5).</div><div><b>Espesor por tramos</b>: el J de cada piso y el peso propio usan el espesor que tiene el muro ahí; la hoja J de la planilla sigue con el de PB.</div><div><b>Con exo</b> el momento de los tabiques baja; el peso no cambia. La app tiene un interruptor «con / sin exo».</div></div></div>""",
    'La misma cuenta de PB, repetida en la base de cada piso: lo que pesa de ahí para arriba y el momento de ese nivel.')

# ---------------------------------------------------------------- ejemplo 1: viento
niv = [n for n in datos['niveles'] if n['z'] >= 0]
filas = ''.join(f"<tr><td>{n['n']}</td><td class=n>{f(n['z'],0)}</td><td class=n>{f(n['Kz'],4)}</td><td class=n>{f(n['qz'],1)}</td><td class=n>{f(n['S'],4)}</td><td class=n>{f(n['D'],1)}</td><td class=n>{f(n['H'],3)}</td><td class=n>{f(n['I'],3)}</td><td class=n>{f(n['J'],1)}</td></tr>" for n in niv)
n10 = niv[1]
pag('viento', 'Ejemplo 1 · Viento', 10, 'Torre chica: 10 pisos de 3 m, dos tabiques y un tubo en X', f"""
  <div class="col2">
    <div>
      <table class="t2"><thead><tr><th>Nivel</th><th class=n>z (m)</th><th class=n>Kz</th><th class=n>qz (N/m²)</th><th class=n>p (t/m²)</th><th class=n>h infl (m)</th><th class=n>Wi (t)</th><th class=n>Q (t)</th><th class=n>M (tm)</th></tr></thead><tbody>{filas}</tbody></table>
      <p class="lead" style="margin-top:2mm;font-size:8.5pt">Valores «Guía/CIRSOC» (Kz con z ≥ 5 m) de la app. Celdas: viento!H, M y S; M,NyQ!D, H, I y J. Q y M de cada fila son los del entrepiso de arriba de ese nivel, como la planilla.</p>
    </div>
    <div>
      <div class="cuenta"><b class="t">Datos</b>Planta de 16 × 12 m (B = 16 m de fachada al viento A). Dos tabiques T1 y T2 de 4,00 × 0,25 m paralelos al viento, a x = ±4 m. Sitio: V = 48 m/s, Kd = 0,85, I = 1, Kzt = 1, exposición α = 5, zg = 457 m; G = 0,85, Cp = 0,8 y −0,5. Hormigón H30. Exo ficha D: columnas 300×16 mm, diagonales 200×12,5 mm, vigas 250×12,5 mm, módulo de 5 pisos (dos X de 15 m), sin peso propio del acero en el reparto.</div>
      <div class="cuenta"><b class="t">① Kz en el 10º (z = {f(n10['z'],0)} m)</b><span class="eqt">Kz = 2,01·(z/zg)^(2/α) = 2,01·(27/457)^0,4 = {f(n10['Kz'],4)}</span><span class="cel">viento!H</span></div>
      <div class="cuenta"><b class="t">② Presión dinámica</b><span class="eqt">qz = 0,613·Kzt·Kd·V²·I·Kz = 0,613·1·0,85·48²·1·{f(n10['Kz'],4)} = {f(n10['qz'],1)} N/m²</span><span class="cel">viento!M</span></div>
      <div class="cuenta"><b class="t">③ Presión neta</b><span class="eqt">p = (qz·G·Cpb − qh·G·Cps)/10 000 = ({f(n10['qz'],1)}·0,85·0,8 + {f(datos['qh'],1)}·0,85·0,5)/10 000 = {f(n10['S'],4)} t/m²</span><span class="cel">viento!S</span></div>
      <div class="cuenta"><b class="t">④ Fuerza del nivel</b><span class="eqt">Wi = h infl·B·p = 3·16·{f(n10['S'],4)} = {f(n10['H'],3)} t</span><span class="cel">M,NyQ!H</span></div>
      <div class="cuenta"><b class="t">⑤ Corte y momento en PB</b><span class="eqt">Q = Σ Wi = {f(niv[-1]['I'],2)} t · M = Σ Q·h = {f(niv[-1]['J'],1)} tm</span><span class="cel">M,NyQ!I y J</span></div>
    </div>
  </div>""")

# ---------------------------------------------------------------- ejemplo 2: rigideces y reparto
zs = e['zs']
filas2 = ''.join(f"<tr><td class=n>{f(zs[i+1],0)}</td><td class=n>{f(e['W'][i],3)}</td><td class=n>{f(e['Ftab'][i],3)}</td><td class=n>{f(e['Fexo'][i],3)}</td><td class=n>{f(e['Mtab'][i+1],1)}</td><td class=n>{f(e['Msin'][i+1],1)}</td><td class=n>{f(e['u'][i]*1000,2)}</td><td class=n>{f(e['uSin'][i]*1000,2)}</td></tr>" for i in reversed(range(len(e['W']))))
filas2 += f"<tr><td class=n>0 (PB)</td><td class=n>—</td><td class=n>—</td><td class=n>—</td><td class=n><b>{f(e['Mtab'][0],1)}</b></td><td class=n><b>{f(e['Msin'][0],1)}</b></td><td class=n>0</td><td class=n>0</td></tr>"
n_ = 2.1e7 / datos['E']
Jcol = n_ * 2 * e['col']['A'] * (e['ancho'] / 2) ** 2
pag('exo', 'Ejemplo 2 · Reparto', 11, 'Rigideces y reparto del viento A', f"""
  <div class="col2">
    <div>
      <div class="cuenta"><b class="t">① J de los tabiques</b><span class="eqt">J = e·L³/12 = 0,25·4³/12 = {f(datos['Jtab'],3)} m⁴ por tabique · ΣJ = {f(2*datos['Jtab'],3)} m⁴</span><span class="cel">J!AY · etapa 05</span></div>
      <div class="cuenta"><b class="t">② E y relación de módulos</b><span class="eqt">E h = 3 400 000 t/m² (H30) · n = E acero/E h = 21 000 000/3 400 000 = {f(n_,3)}</span><span class="cel">G · Exoesqueleto</span></div>
      <div class="cuenta"><b class="t">③ J de las columnas de una cara (a mano, solo flexión)</b><span class="eqt">J col = n·2·A·(ancho/2)² = {f(n_,3)}·2·{f(e['col']['A'],5)}·6² = {f(Jcol,2)} m⁴</span><span class="cel">G · Exoesqueleto</span></div>
      <div class="cuenta"><b class="t">④ J equivalente de la cara (app)</b><span class="eqt">J eq = {f(e['Jeq'][0],2)} m⁴</span> La ménsula de hormigón que se corre lo mismo que la cara sola. Es la mitad de ③ porque las X también se deforman (corte) y entre los nudos de las X las columnas trabajan solas. <span class="cel">etapa 08</span></div>
      <div class="cuenta"><b class="t">⑤ Reparto y flecha</b><span class="eqt">(K tab + K cara 1 + K cara 2)·u = W → F tab = K tab·u</span> El exo toma el <b>{f(e['fraccion']*100,1)} %</b> del momento en PB: M tabiques = {f(e['Mtab'][0],1)} tm contra {f(e['Msin'][0],1)} tm sin exo. La azotea se corre {f(e['u'][-1]*1000,2)} mm (sin exo, {f(e['uSin'][-1]*1000,2)} mm; límite h/500 = 60 mm). <span class="cel">etapa 08 · hoja G · Balance</span></div>
    </div>
    <div>
      <table class="t2"><thead><tr><th class=n>z (m)</th><th class=n>W (t)</th><th class=n>F tab (t)</th><th class=n>F exo (t)</th><th class=n>M tab (tm)</th><th class=n>M sin exo</th><th class=n>δ (mm)</th><th class=n>δ sin exo</th></tr></thead><tbody>{filas2}</tbody></table>
      <p class="lead" style="margin-top:2mm;font-size:8.5pt">F tab + F exo = W en cada piso. El exo toma casi todo en los pisos 15 y 30 m, donde están los nudos de sus X; en la azotea los tabiques dan negativo: el pórtico los empuja hacia atrás (interacción ménsula–pórtico).</p>
    </div>
  </div>""")

# ---------------------------------------------------------------- ejemplo 3: barras
B = {b['id']: b for b in e['barras']}
d1, c1, v1 = B['D1'], B['C1'], B['V1']
L = d1['L']; cos = 6 / L; sen = 7.5 / L
Vexo = sum(e['Fexo']); Vcara = Vexo / 2
Mcara = (e['Msin'][0] - e['Mtab'][0]) / 2
R = e['reac']
cd = [c for c in e['c301'] if c['id'] == 'D3'][0]
pag('exo', 'Ejemplo 3 · Barras', 12, 'Barras de una cara del exo y CIRSOC 301', f"""
  <div class="col2">
    <div>
      <div class="cuenta"><b class="t">① Corte que toma una cara en la base</b><span class="eqt">V cara = Σ F exo / 2 = {f(Vexo,3)}/2 = {f(Vcara,3)} t</span> Las reacciones horizontales de la app: 2 × {f(-R[0]['H'],3)} = {f(-2*R[0]['H'],3)} t. <span class="cel">etapa 08</span></div>
      <div class="cuenta"><b class="t">② Diagonal de abajo (D1, tracción; D3, compresión)</b><span class="eqt">N = V/(2·cos θ) = {f(Vcara,3)}/(2·{f(cos,4)}) = {f(Vcara/(2*cos),3)} t</span> cos θ = 6/{f(L,3)} (media diagonal: de la esquina al cruce). App: N D1 = {f(d1['N'],3)} t; la diferencia es el corte que toman las columnas por flexión.</div>
      <div class="cuenta"><b class="t">③ Momento de una cara en PB y columna de esquina</b><span class="eqt">M cara = (M sin exo − M tab)/2 = ({f(e['Msin'][0],1)} − {f(e['Mtab'][0],1)})/2 = {f(Mcara,1)} tm</span><br><span class="eqt">N base = M cara/ancho = {f(Mcara,1)}/12 = {f(Mcara/12,2)} t</span> App: reacción vertical {f(abs(R[0]['V']),2)} t = columna C1 ({f(c1['N'],3)} t) + componente vertical de D1 ({f(d1['N'],3)}·7,5/{f(L,3)} = {f(d1['N']*sen,3)} t).</div>
    </div>
    <div>
      <div class="cuenta"><b class="t">④ CIRSOC 301 · diagonal D3 (compresión)</b>
        <span class="eqt">Pu = 1,2·D + 1,6·W = {f(cd['Pu'],2)} t</span> (D: peso propio del acero, que el CIRSOC 301 siempre suma)<br>
        <span class="eqt">λc = L/(r·π)·√(Fy/E) = {f(L,3)}/({f(e['dia']['i'],4)}·π)·√(24 000/21 000 000) = {f(cd['lambdaC'],3)}</span><br>
        <span class="eqt">Fcr = 0,658^(λc²)·Fy = {f(0.658**(cd['lambdaC']**2)*24000,0)} t/m² · φc·Pn = 0,85·Fcr·A = {f(cd['phiPc'],2)} t</span><br>
        <span class="eqt">φb·Mn = 0,9·Z·Fy = {f(cd['phiMn'],2)} tm · Mu = {f(cd['Mu'],3)} tm (peso propio)</span><br>
        <span class="eqt">Pu/φPn = {f(-cd['Pu']/cd['phiPc'],3)} &lt; 0,2 → H1-1b: Pu/(2φPn) + Mu/φMn = {f(cd['ratio'],3)} ≤ 1</span> <span class="ok2">verifica</span> <span class="cel">etapa 08 · CIRSOC 301</span></div>
      <div class="cuenta"><b class="t">⑤ Control del curso (σ adm y pandeo)</b>λ = L/i = {f(L/e['dia']['i'],1)} ≤ 200; N cr = π²·E·I/L² = {f(3.141592653589793**2*2.1e7*e['dia']['I']/L**2,1)} t; |N| ≤ N cr/1,7 = {f(3.141592653589793**2*2.1e7*e['dia']['I']/L**2/1.7,1)} t <span class="ok2">verifica</span></div>
      <div class="cuenta"><b class="t">⑥ Viento a 45°</b>Las columnas de las esquinas son de dos caras: N 45° = 0,71·(N A + N B). En una torre cuadrada da 1,41 veces lo de frente: lo que se descubrió en el Citicorp en 1978.</div>
    </div>
  </div>""")

# ---------------------------------------------------------------- ejemplo 4: fibra
fp = datos['flexPB'][0]; mu = fp['muros'][0]
fib = datos['fibras'][0]
def fila4(nv):
    m = nv['muros'][0]; k = [i for i, z in enumerate(e['zs']) if abs(z - nv['z']) < 1e-6][0]
    Mc = 0.5 * e['Mtab'][k]; sc = Mc * 2 / nv['J']
    return f"<tr><td>{nv['n']}</td><td class=n>{f(nv['z'],0)}</td><td class=n>{f(m['Ndesc'],1)}</td><td class=n>{f(nv['M'],1)}</td><td class=n>{f(m['traccion'],2)}</td><td class=n>{f(Mc,1)}</td><td class=n>{f((-m['Ndesc']+abs(sc))/10,2)}</td><td class=n>{f((-m['Ncarg']-abs(sc))/10,2)}</td></tr>"
filas4 = ''.join(fila4(nv) for nv in fib['niveles'])
Mcon = e['Mtab'][0] * 0.5
sigMc = Mcon * 2 / fp['J']
pag('flex', 'Ejemplo 4 · Fibras', 13, 'La fibra más traccionada de T1 en PB, sin y con exoesqueleto', f"""
  <div class="col2">
    <div>
      <div class="cuenta"><b class="t">① Carga de T1 (descargado y cargado)</b><span class="eqt">N g = F·h·2,4 + 0,7·a·n = 1·30·2,4 + 0,7·40·10 = {f(mu['Ndesc'],0)} t</span> · <span class="eqt">N q = 72 + 0,9·40·10 = {f(mu['Ncarg'],0)} t</span><span class="cel">Flex · etapa 07</span></div>
      <div class="cuenta"><b class="t">② Sin exo (planilla del curso)</b><span class="eqt">M T1 = fracción·M PB = 0,5·{f(e['Msin'][0],1)} = {f(fp['M'],1)} tm</span><br><span class="eqt">σ = −N/F + M·y/J = −{f(mu['Ndesc'],0)} + {f(fp['M'],1)}·2/{f(fp['J'],3)} = {f(mu['desc'][0],1)} t/m² = {f(mu['traccion'],2)} kg/cm²</span> <span class="ro2">tracciona</span>: T = {f(mu['T'],2)} t, As = T/2400 = {f(mu['As'],2)} cm² (mínima 0,8 % = {f(mu['AsMin'],0)} cm²).<br><span class="eqt">compresión: −{f(mu['Ncarg'],0)} − {f(mu['sigM'],1)} = {f(mu['compresion'],2)} kg/cm²</span></div>
    </div>
    <div>
      <div class="cuenta"><b class="t">③ Con exo (lo que les queda a los tabiques)</b><span class="eqt">M T1 = 0,5·M tab = 0,5·{f(e['Mtab'][0],1)} = {f(Mcon,1)} tm</span><br><span class="eqt">σ = −{f(mu['Ndesc'],0)} + {f(Mcon,1)}·2/{f(fp['J'],3)} = {f(-mu['Ndesc']+sigMc,1)} t/m² = {f((-mu['Ndesc']+sigMc)/10,2)} kg/cm²</span> <span class="ok2">todo comprimido</span>: armadura mínima.<br><span class="eqt">compresión: −{f(mu['Ncarg'],0)} − {f(sigMc,1)} = {f((-mu['Ncarg']-sigMc)/10,2)} kg/cm²</span> &lt; σbk = 300 kg/cm²</div>
      <div class="cuenta"><b class="t">Lo que muestra</b>El exo saca la tracción del tabique: el peso es el mismo, el momento baja a {f(Mcon/fp['M']*100,0)} %. Es lo que muestra la etapa 07 con la marca «con el exoesqueleto» y la capa σ del 3D.</div>
    </div>
  </div>
  <table class="t2" style="margin-top:2mm"><thead><tr><th>Base del piso sobre</th><th class=n>z (m)</th><th class=n>N g (t)</th><th class=n>M T1 sin exo (tm)</th><th class=n>σ tracción sin exo (kg/cm²)</th><th class=n>M T1 con exo (tm)</th><th class=n>σ tracción con exo (kg/cm²)</th><th class=n>σ compresión con exo (kg/cm²)</th></tr></thead><tbody>{filas4}</tbody></table>
  <p class="lead" style="margin-top:1.5mm;font-size:8.5pt">Etapa 07, «Verificar en la base del piso sobre…»: la misma cuenta en cada piso. σ negativa: la fibra está comprimida. M negativo con exo: arriba el pórtico empuja a los tabiques hacia el otro lado (el viento puede venir de los dos lados, así que cuenta |M|).</p>""")

# ---------------------------------------------------------------- 14 validación
pag('acento', 'Validación', 14, 'Cómo se controló la matemática', """
  <table class="t3"><thead><tr><th>Control</th><th>Qué se compara</th><th>Resultado</th></tr></thead><tbody>
  <tr><td>Otro programa</td><td>una cara de tubo en X resuelta con el solver de reticulados y pórticos de structural-solver- (Python, código independiente; la losa como tirante muy rígido)</td><td><span class="ok2">0,000 %</span> en N de las 26 barras; flecha 2,770 mm en los dos</td></tr>
  <tr><td>Equilibrio</td><td>F tab + F exo = W en cada piso; Σ reacciones horizontales de las caras = corte del exo; reacciones verticales de cada cara suman 0 sin peso propio; momentos en cada nudo</td><td><span class="ok2">10⁻⁶</span> o menos</td></tr>
  <tr><td>Casos cerrados</td><td>ménsula δ = P·H³/3EI y W·H³/8EI; dos columnas atadas = Σ A·d²; vigas con carga repartida (qL²/12, qL²/8, 3qL/8)</td><td><span class="ok2">exactos</span> o &lt; 3 %</td></tr>
  <tr><td>Entre motores</td><td>la flecha «sin exo» del motor del exo contra la deformada de la etapa 05 (mismo E·J)</td><td><span class="ok2">&lt; 0,5 %</span></td></tr>
  <tr><td>Hoja de balance</td><td>Excel recalculado en LibreOffice contra el motor; con ρ = 1, contra M,NyQ</td><td><span class="ok2">10⁻¹³</span> y 10⁻¹²</td></tr>
  <tr><td>Fibras</td><td>en PB, sin exo, contra la flexocompresión de la etapa 07, en 11 torres y los dos vientos</td><td><span class="ok2">iguales</span></td></tr>
  <tr><td>CIRSOC 301</td><td>λc, Fcr, φPn y φMn contra las fórmulas a mano; 1,2·D sin viento</td><td><span class="ok2">exactos</span></td></tr>
  <tr><td>Viento a 45°</td><td>torre cuadrada simétrica: esquinas = √2 veces lo de frente</td><td><span class="ok2">1,4142</span></td></tr>
  <tr><td>Edificios reales</td><td>los cuatro entran en la planilla, los módulos caen en niveles, flecha ≤ h/500, todas las barras verifican (curso y CIRSOC 301)</td><td><span class="ok2">4 de 4</span></td></tr>
  <tr><td>Paquete completo</td><td>344 pruebas automáticas del código (las 10 torres de prueba, juntas, espesores, grupos, Excel…)</td><td><span class="ok2">344 / 344</span></td></tr>
  </tbody></table>""",
    'Cada parte nueva se controla por un camino distinto del que la calcula. Se corrió todo el paquete después de cada parte.')

# ---------------------------------------------------------------- 15 edificios reales
pag('acento', 'Edificios reales', 15, 'Los cuatro edificios con exoesqueleto de la app', """
  <table class="t3"><thead><tr><th>Edificio</th><th>Datos con fuente</th><th>Modelo de la app</th><th>Resultado (viento A)</th></tr></thead><tbody>
  <tr><td>Citicorp Center<br>Nueva York, 1977</td><td>59 pisos, 278,6 m; planta 47,85 m; 4 supercolumnas a media cara de 34,75 m; 6 módulos de chevrones de 8 pisos; mástil que se afina arriba del piso 40; núcleo que lleva la mitad del peso (Wikipedia, plano de elevación)</td><td>ficha E con módulos por cotas; núcleo solo de gravedad; supercolumna como pieza de la base; pisos 8 y 9 juntos (cajón de transición)</td><td>el exo toma el 100 %; flecha 540 mm (límite 557); 534 / 534 barras; esquinas a 45° × 1,41</td></tr>
  <tr><td>John Hancock Center<br>Chicago, 1969</td><td>100 pisos, 343,5 m; caras de 165 → 100 ft y 265 → 165 ft; X de 200 ft; 24 columnas, 7 por cara; el tubo toma todo el viento (estudio JHU, CTBUH)</td><td>ficha D con caras que siguen la planta (columnas inclinadas); alas del tubo = 5 columnas intermedias; un nivel cada 25 ft</td><td>100 % al exo; flecha 603 mm (límite 687); 420 / 420 barras; ≈ 25 700 t de acero en el tubo</td></tr>
  <tr><td>Hearst Tower<br>Nueva York, 2006</td><td>46 pisos, 182 m; torre de 160 × 120 ft; diagrid sobre el piso 10, triángulos de 4 pisos, nudos cada 40 ft; núcleo al oeste (Wikipedia, ENR, AISC)</td><td>ficha A con nudos cada 12,2 m (4 rombos en la cara de 160 ft y 3 en la de 120 ft); núcleo corrido: hay torsión</td><td>el exo toma el 38 %; flecha 150 mm (límite 364); 200 / 200 barras</td></tr>
  <tr><td>Onterie Center<br>Chicago, 1986</td><td>60 pisos, 174 m; X de paneles de hormigón que forman un tubo reticulado (Wikipedia, STRUCTURE 2024)</td><td>ficha D en hormigón (E, γ y σ adm del hormigón, barras macizas); planta y X supuestas</td><td>el exo toma el 82 %; flecha 178 mm (límite 348); 180 / 180 barras</td></tr>
  </tbody></table>
  <p class="lead" style="margin-top:3mm">Las secciones de las barras no están publicadas: salen del botón «Dimensionar» de la app (control del curso y CIRSOC 301). Cada ejemplo trae en la etapa 08 la lista «De dónde sale cada número», con la fuente o la marca «supuesto».</p>""",
    'Elegidos para que cada ficha tenga un edificio real que se pueda modelar con plantas rectangulares.')

html = head + '\n' + portada + '\n' + '\n'.join(pags) + '\n' + script
open(os.path.join(D, 'red.html'), 'w').write(html)
print('ok', len(pags) + 1, 'páginas')
