"""Bloques de ecuaciones del documento de dudas, con la notación de la etapa «Ecuaciones» de la app
(src/ui/ecuaciones/planilla.ts, guia.ts y cirsoc.ts): Planilla, Guía y CIRSOC en columnas, con el término que cambia
resaltado y el ejemplo con los números puestos."""


def v(s, sub=''):
    """variable en itálica, con subíndice"""
    return f'<i>{s}</i>' + (f'<sub>{sub}</sub>' if sub else '')


def dif(x):
    """el término que cambia entre métodos"""
    return f'<mark class="dif">{x}</mark>'


def fr(a, b):
    """fracción"""
    return f'<span class="fr"><span>{a}</span><span>{b}</span></span>'


def bloque(cols, variables, nota=''):
    """cols: (clase, título, fuente, [ecuaciones], ejemplo). clase: pla, gui o cir (los colores de la app)."""
    cs = []
    for clase, titulo, fuente, ecs, ej in cols:
        cs.append(f'<div class="col {clase}"><div class="cab">{titulo}<span class="fuente">{fuente}</span></div>'
                  + ''.join(f'<div class="f">{e}</div>' for e in ecs)
                  + (f'<div class="ej"><div class="t">Ejemplo</div>{ej}</div>' if ej else '') + '</div>')
    vs = ' · '.join(f'{s} {t}' for s, t in variables)
    return (f'<div class="eqs">{"".join(cs)}</div><p class="vars"><b>Variables.</b> {vs}.</p>'
            + (f'<p class="vars">{nota}</p>' if nota else ''))


S = 'Σ'
Mt, Mv, Q, J, a = v('M', 't'), v('M', 'v'), v('Q'), v('J', 'j'), v('a', 'j')
SJ, SJa2 = f'{S}{v("J")}', f'{S}{v("J")}·{v("a")}²'
C, Qt, Qr, Mtr, Mj, MPB = v('C', 'j'), v('Q', 'tras'), v('Q', 'rot'), v('M', 'tras'), v('M', 'j'), v('M', 'PB')
F, W, N07, N09, ND, NC = v('F'), v('W'), v('N', '0,7'), v('N', '0,9'), v('N', 'D'), v('N', 'C')
sc, st, sM = v('σ', 'c'), v('σ', 't'), v('σ', 'M')


def eq_momento(e):
    """duda 1: el momento de la pieza (T1 de la torre asimétrica)"""
    return bloque([
        ('pla', 'Planilla', 'Rototrasl., columnas C, G, N y O', [
            f'{C} = {fr(J, SJ)} &nbsp;&nbsp; {Mtr} = {C} · {Mv} <small>[tm]</small>',
            f'{Qr} = − {fr(f"{Mt} · {J} · {a}", SJa2)} <small>[t]</small>',
            f'{Mj} = {Mtr} + {dif(Qr)}',
        ], f'T1: {Mj} = 0,1003 · 4.985 + {dif("6,23")} = <b>506 tm</b>'),
        ('gui', 'Guía', 'Anexo de rototraslación', [
            f'{Qt} = {Q} · {fr(J, SJ)} &nbsp;&nbsp; {Qr} = − {fr(f"{Mt} · {J} · {a}", SJa2)}',
            f'{Mj} = {MPB} · {dif(fr(f"{Qt} + {Qr}", Q))}',
            '<small>la pieza toma del momento la misma parte que del corte</small>',
        ], f'T1: {Mj} = 4.467 · {dif("(12,63 + 5,95) / 125,97")} = <b>659 tm</b>'),
        ('cir', 'CIRSOC', '102-25, casos 1 a 4', [
            f'{v("φ", "1")} = {fr(J, SJ)} − {fr(f"{v("e")} · {J} · {a}", SJa2)}',
            f'{Mj} = {dif(v("φ", "1"))} · {MPB} &nbsp; <small>(y φ₂, φ₄ con e ± 0,15 B)</small>',
            '<small>mismo reparto que la guía, con el viento del 102-25</small>',
        ], f'T1, con el viento de la planilla: {Mj} = {dif("0,147")} · 4.985 = <b>733 tm</b>'),
    ], [(Mv, 'momento del viento en el nivel −1 (tm)'), (MPB, 'momento en PB (tm)'), (Q, 'corte (t)'), (Mt, '= Q · e, momento de rotación (tm)'),
        (J, 'J de la pieza (m⁴)'), (a, 'brazo al eje de inercia (m)'), (C, 'parte por traslación'), (Qr, 'corte por rotación (t)'), (v('φ', '1'), 'parte del viento en el caso 1')],
        f'Lo que cambia: la planilla suma {Qr}, una <b>fuerza</b> (t), a un momento (tm). La guía y el CIRSOC pasan la rotación a '
        f'momento con la misma proporción que el corte: {Mj} = {Mtr} + {Qr} · {Mv}/{Q}.')


def eq_cargas():
    """duda 2: la combinación de cargas (T5 de la torre asimétrica)"""
    return bloque([
        ('pla', 'Planilla', 'Flex comp PB, columnas H, I, O y P', [
            f'{N07} = {v("P", "p")} + {v("A", "inf")}·{v("n")}·0,7 &nbsp; {N09} = … · 0,9',
            f'{sc} = (− {dif(fr(N07, F))} − {fr(v("M"), W)}) · 0,1',
            f'{st} = (− {dif(fr(N09, F))} + {fr(v("M"), W)}) · 0,1',
        ], f'T5: {st} = (− {dif("448 / 0,80")} + 354 / 0,533) · 0,1 = <span class="trac">+10,4 kg/cm²</span>'),
        ('gui', 'Guía', 'sección 5', [
            f'{ND} = {v("P", "p")} + {v("q", "D")}·{v("A", "inf")} &nbsp; {NC} = … {v("q", "C")}',
            f'{sc} = − {dif(fr(NC, v("A")))} − {sM}',
            f'{st} = − {dif(fr(ND, v("A")))} + {sM}',
        ], f'T5 con la regla de la guía: {st} = (− {dif("376 / 0,80")} + 354 / 0,533) · 0,1 = <span class="trac">+19,4 kg/cm²</span>'),
        ('cir', 'CIRSOC', '101-25, combinaciones', [
            f'compresión: {v("N", "u")} = {dif("1,2 D + L")} con 1,0 W',
            f'tracción: {v("N", "u")} = {dif("0,9 D")} con 1,0 W',
            '<small>la carga mayor con la compresión, la menor con la tracción</small>',
        ], ''),
    ], [(N07, f'= {ND}: carga sin sobrecarga, 0,7 t/m² (t)'), (N09, f'= {NC}: con sobrecarga, 0,9 t/m² (t)'), (F, 'área de la pieza (m²)'), (W, 'módulo resistente J / y (m³)'),
        (sc, 'borde comprimido'), (st, 'borde traccionado (kg/cm²)')],
        f'Lo que cambia: la planilla pone {N07} (la menor) con la compresión y {N09} (la mayor) con la tracción. Con la misma fórmula y '
        f'las cargas al revés da lo de la guía y lo del CIRSOC. La diferencia es siempre ({N09} − {N07}) / {F}.')


def eq_peso(t2, pp, altura):
    """duda 3: peso propio en las filas 13 a 20"""
    return bloque([
        ('pla', 'Planilla', 'Flex comp PB, columnas D y E', [
            f'filas 4 a 12 y 21 a 23: {v("D", "i")} = {v("F", "i")} · {v("h", "i")}',
            f'filas 13 a 20: {v("D", "i")} = {dif("0,01")} m³',
            f'{v("P", "p")} = {v("D", "i")} · 2,4',
        ], f'T2 (fila 13): {v("P", "p")} = {dif("0,01")} · 2,4 = <b>0,02 t</b>'),
        ('gui', 'Guía', 'sección 5', [f'{v("P", "p")} = {v("A")} · {v("h", "m")} · {v("γ", "H")}', '<small>en todas las piezas</small>'],
         f'T2: {v("P", "p")} = 1,524 · {altura} · 2,4 = <b>{pp} t</b>'),
        ('cir', 'CIRSOC', '101-25', [f'{v("D")} incluye el peso propio', f'{v("N", "u")} = 1,2 {v("D")} … ó 0,9 {v("D")} …'], ''),
    ], [(v('D', 'i'), 'volumen de la pieza (m³)'), (v('F', 'i'), 'área (m²)'), (v('h', 'i'), 'altura hasta la terraza (m)'), (v('P', 'p'), 'peso propio (t)')])


def eq_fila():
    """duda 4: el W lo elige la fila"""
    return bloque([
        ('pla', 'Planilla', 'Flex comp PB, columna M (W)', [
            f'filas 4 a 10: {W} = hoja J, {dif("columna Q")} (simétricas)',
            f'filas 11 a 14: {W} = hoja J, {dif("columna AN")} (asimétricas)',
            f'filas 21 a 23: {W} = hoja J, {dif("columna V")} (tubos)',
        ], f'núcleo en U en la fila 4: {W} = {dif("0 / 0")} → #DIV/0!'),
        ('gui', 'Guía', '', [f'{W} = {fr(v("J", "j"), v("y"))} de la sección de <b>cada pieza</b>'], ''),
        ('cir', 'CIRSOC', '', ['cada pieza con su sección'], ''),
    ], [(W, 'módulo resistente (m³)'), (v('y'), 'distancia del baricentro a la fibra (m)')])


def eq_molde():
    """duda 5: el J de una pieza de más de cuatro muros (T1 de la torre de 34 pisos)"""
    return bloque([
        ('pla', 'Planilla', 'hoja J, columna AY (molde)', [
            f'{J} = {dif("molde: ala sup. + ala inf. + 2 almas")}, con Steiner',
            f'{C} = {fr(J, SJ)}',
        ], f'T1 (6 muros): {J} = <b>17,93 m⁴</b> (armado App) o <b>31,19 m⁴</b> (armado Cátedra) · {C} = 6,3 %'),
        ('gui', 'Guía', 'sección 7 o sección real', [
            f'{J} = {S} ({v("J", "propio")} + {v("A")} · {v("d")}²) {dif("muro por muro")}',
        ], f'T1: {J} = <b>34,98 m⁴</b> · {C} = 12,1 %'),
        ('cir', 'CIRSOC', '', [f'{J} de la {dif("sección real")}'], f'T1: <b>34,98 m⁴</b>'),
    ], [(J, 'J de la pieza (m⁴)'), (v('d'), 'distancia del muro al baricentro de la pieza (m)'), (C, 'parte del viento por traslación')])


def eq_W():
    """duda 6: W de las asimétricas y el área"""
    return bloque([
        ('pla', 'Planilla', 'hoja J, columnas AN y O', [
            f'{W} = {fr(J, dif("(X + AB + AI) / 2"))} <small>(la mitad de la altura)</small>',
            f'{F} = W·X + Z·AB + AE·AF &nbsp; <small>(sin {dif("AH·AI")}, el ala inferior)</small>',
        ], f'T de 4 × 0,2 + 0,2 × 4 m: {W} = 2,83 / {dif("2,10")} = <b>1,35 m³</b>'),
        ('gui', 'Guía / CIRSOC', '', [
            f'{W}<sub>sup</sub> = {fr(J, v("y", "sup"))} &nbsp; {W}<sub>inf</sub> = {fr(J, v("y", "inf"))}',
            f'{F} = {S} {v("b")} · {v("h")} <small>(todas las partes)</small>',
        ], f'misma T: {W}<sub>inf</sub> = 2,83 / {dif("3,05")} = <b>0,93 m³</b> (+45 % de tensión)'),
    ], [(v('y', 'sup'), ', '), (v('y', 'inf'), 'distancia del baricentro a cada fibra (m)')])


def eq_entera():
    """duda 7: pieza entera o muro por muro"""
    return bloque([
        ('pla', 'Planilla', 'pieza entera', [
            f'σ = − {fr(v("N"), dif(F))} ± {fr(v("M"), dif(W))} <small>[t/m²] · 0,1</small>',
            '<small>F y W de toda la pieza</small>',
        ], ''),
        ('gui', 'Guía', 'sección 5, cada muro', [
            f'{sM} = {fr(f"{Mj} · {v("y")}", J)}',
            f'σ = − {fr(dif(v("N", "muro")), dif(v("A", "muro")))} ± {sM}',
        ], ''),
        ('cir', 'CIRSOC', '201: secciones planas', [
            f'({v("M", "u")}, {v("N", "u")}) dentro de φ · ({v("M", "n")}, {v("P", "n")})',
            '<small>la sección que trabaja junta; la app hoy, muro por muro</small>',
        ], ''),
    ], [(v('N', 'muro'), 'carga del muro por su área de influencia (t)'), (v('A', 'muro'), 'área del muro (m²)'), (v('y'), 'fibra más alejada (m)')])


def eq_viento():
    """duda 8: G y la frecuencia"""
    return bloque([
        ('pla', 'Planilla', 'hoja viento', [
            f'{v("F")} = 1 / {v("T")} <small>(se calcula)</small>',
            f'{v("G")} = {dif("0,85")} <small>siempre</small>',
        ], f'guía: {v("F")} = 0,87 Hz &lt; 1 · {v("G")} = 0,85'),
        ('gui', 'Guía', '', [f'{v("G")} = {dif("0,85")}', '<small>igual que la planilla</small>'], ''),
        ('cir', 'CIRSOC', '102-25, 1.9.4 y 1.9.5', [
            f'{v("n", "1")} = 117,3 · √{v("C", "w")} / {v("h")} &nbsp;<small>(o el modal del FEM)</small>',
            f'{v("G")} = 0,85 si {v("n", "1")} ≥ 1 Hz; si no, {dif(v("G", "f"))}',
        ], f'guía: {v("n", "1")} = 0,17 Hz (aprox.) o 0,36 Hz (FEM) · {v("G", "f")} = 1,40 o 1,06'),
    ], [(v('F') + ', ' + v('n', '1'), 'frecuencia propia (Hz)'), (v('G', 'f'), 'factor de ráfaga de una torre flexible'), (v('C', 'w'), 'coeficiente de los tabiques')])


CSS = """
.eqs { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; margin: 10px 0 4px; }
.eqs .col { border: 1px solid #c3cad1; border-radius: 8px; overflow: hidden; break-inside: avoid; display: flex; flex-direction: column; }
.eqs .cab { font-weight: 700; font-size: 12.5px; padding: 5px 10px; color: #fff; }
.eqs .cab .fuente { display: block; font-weight: 400; font-size: 10.5px; opacity: .9; }
.eqs .f { font-family: 'IBM Plex Math', 'STIX Two Math', 'Cambria Math', Georgia, serif; font-size: 14px; line-height: 1.7; padding: 2px 10px; }
.eqs .f small, .eqs .ej small { font-family: 'IBM Plex Sans', sans-serif; font-size: 11px; color: #5f6b76; }
.eqs .ej { margin-top: auto; padding: 6px 10px; font-size: 12.5px; border-top: 1px dashed #c3cad1; font-family: 'IBM Plex Math', Georgia, serif; }
.eqs .ej .t { font: 600 10px 'IBM Plex Sans', sans-serif; text-transform: uppercase; letter-spacing: .06em; color: #8a949e; }
.eqs .pla .cab { background: #a8650a; } .eqs .pla .ej { background: #fdf0dc; }
.eqs .gui .cab { background: #6a3d9a; } .eqs .gui .ej { background: #efe7f7; }
.eqs .cir .cab { background: #1a6bbd; } .eqs .cir .ej { background: #dbe8f6; }
mark.dif { background: #ffe58a; color: inherit; border-radius: 3px; padding: 0 2px; box-shadow: 0 0 0 1px #e0b800 inset; }
.fr { display: inline-flex; flex-direction: column; vertical-align: middle; text-align: center; font-size: 92%; line-height: 1.15; margin: 0 2px; }
.fr > span:first-child { border-bottom: 1px solid currentColor; padding: 0 2px; }
.vars { font-size: 12px; color: #5b6472; margin: 2px 0 8px; }
.vars i, .vars sub { font-family: 'IBM Plex Math', Georgia, serif; }
"""
