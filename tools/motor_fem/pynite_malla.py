"""La malla de la ficha M en Pynite (MIT): un reticulado espacial de verdad, sin la proyección de la app.

Cada barra es un elemento de pórtico 3D con su sección real (tubo cuadrado), articulado donde la app lo articula
(las diagonales en los nudos de los anillos; las columnas si sus uniones son articuladas) y continuo en los pisos que
cruza. La losa de cada piso es rígida en su plano: un nudo central con brazos articulados hasta cada nudo de la malla
y un anillo de barras articuladas entre los nudos del piso (triángulos: no se deforma en su plano, pero no traba
nada en vertical). Los tabiques, como en la app, son una ménsula en el centro con el J de cada piso. El nudo central
va corrido del eje (XC, YC) como en pynite_torre.py: un brazo justo paralelo a un eje le da a Pynite una rigidez falsa.

Se resuelve cada viento por separado (A: en y; B: en x), solo con el viento, y un torsor con la forma del viento.

Uso como script:  python pynite_malla.py malla.json   → imprime el resultado en JSON
"""
import json, math, sys

XC, YC = 0.0731, 0.0517


def modelo(d, dirv, torsor=False):
    from Pynite import FEModel3D
    E, G, Eh = d['E'], d['E'] / 2.6, d['Eh']
    m = FEModel3D()
    m.add_material('S', E, G, 0.3, 7.85)
    m.add_material('H', Eh, Eh / 2.4, 0.2, 2.4)
    m.add_section('brazo', 10.0, 1.0, 1.0, 1.0)
    zs, cx, cy = d['zs'], d['cx'] + XC, d['cy'] + YC
    nudos = d['nudos']
    porPiso = {}
    for i, (x, y, z, k) in enumerate(nudos):
        m.add_node(f'N{i}', x, y, z)
        porPiso.setdefault(k, []).append(i)
        if k == 0: m.def_support(f'N{i}', True, True, True, True, True, True)
    # barras de la malla (una sección por barra: A, I y la torsión de un tubo cerrado ≈ 2·I)
    girosLibres = {i: True for i in range(len(nudos))}
    for j, (a, b, A, I, ra, rb) in enumerate(d['barras']):
        m.add_section(f's{j}', A, I, I, 2 * I)
        m.add_member(f'B{j}', f'N{a}', f'N{b}', 'S', f's{j}')
        if ra or rb:
            m.def_releases(f'B{j}', Ryi=ra, Rzi=ra, Ryj=rb, Rzj=rb, Rxj=(ra and rb))
        if not ra: girosLibres[a] = False
        if not rb: girosLibres[b] = False
    # un nudo donde todas las barras están articuladas no tiene rigidez al giro: se lo traba (no cambia nada)
    for i, libre in girosLibres.items():
        if libre and nudos[i][3] > 0: m.def_support(f'N{i}', False, False, False, True, True, True)
    # la losa de cada piso: centro, brazos y anillo articulados (solo fuerzas en el plano)
    for k in range(1, len(zs)):
        z = zs[k]
        m.add_node(f'C{k}', cx, cy, z)
        m.def_support(f'C{k}', False, False, True, True, True, True)
        ids = sorted(porPiso.get(k, []), key=lambda i: math.atan2(nudos[i][1] - cy, nudos[i][0] - cx))
        for i in ids:
            m.add_member(f'R{k}_{i}', f'C{k}', f'N{i}', 'S', 'brazo')
            m.def_releases(f'R{k}_{i}', Ryi=True, Rzi=True, Ryj=True, Rzj=True, Rxj=True)
        if len(ids) >= 3:
            for t, i in enumerate(ids):
                j2 = ids[(t + 1) % len(ids)]
                m.add_member(f'L{k}_{i}', f'N{i}', f'N{j2}', 'S', 'brazo')
                m.def_releases(f'L{k}_{i}', Ryi=True, Rzi=True, Ryj=True, Rzj=True, Rxj=True)
    # los tabiques: una ménsula en el centro (el J de cada piso; sin tabiques, nada)
    m.add_node('C0', cx, cy, zs[0]); m.def_support('C0', True, True, True, True, True, True)
    J = d['J' + dirv]
    for k in range(1, len(zs)):
        if J[k - 1] > 0:
            m.add_section(f't{k}', 1.0, J[k - 1], J[k - 1], 1e-6)
            m.add_member(f'T{k}', f'C{k - 1}', f'C{k}', 'H', f't{k}')
    # (con ménsula, el centro gira con ella; sin, queda trabado: los brazos están articulados)
    for k in range(1, len(zs)):
        if J[k - 1] > 0 or (k < len(zs) - 1 and J[k] > 0): m.def_support(f'C{k}', False, False, True, False, False, True)
        # un nivel sin nudos de la malla ni tabiques (sin losa: la app le pasa su viento a los de al lado) no tiene nada
        elif not porPiso.get(k): m.def_support(f'C{k}', True, True, True, True, True, True)
    W = d['W' + dirv]
    for k in range(1, len(zs)):
        if not W[k - 1]: continue
        if not torsor:
            m.add_node_load(f'C{k}', 'FY' if dirv == 'A' else 'FX', W[k - 1])
        else:
            # el torsor (W·1 m) repartido en los nudos del piso, a lo largo de la vuelta: T·r / Σ r²
            ids = porPiso.get(k, [])
            r2 = sum((nudos[i][0] - cx) ** 2 + (nudos[i][1] - cy) ** 2 for i in ids)
            for i in ids:
                dx, dy = nudos[i][0] - cx, nudos[i][1] - cy
                m.add_node_load(f'N{i}', 'FX', -W[k - 1] * dy / r2); m.add_node_load(f'N{i}', 'FY', W[k - 1] * dx / r2)
    m.analyze_linear(check_statics=False, check_stability=False)
    return m


def resolver(d):
    c = 'Combo 1'
    out = {'motor': 'Pynite · reticulado espacial', 'z': d['zs']}
    for dirv in ('A', 'B'):
        m = modelo(d, dirv)
        hay = lambda k: any(n[3] == k for n in d['nudos']) or d['J' + dirv][k - 1] > 0
        out['u' + dirv] = [0.0] + [((m.nodes[f'C{k}'].DY[c] if dirv == 'A' else m.nodes[f'C{k}'].DX[c]) if hay(k) else None) for k in range(1, len(d['zs']))]
        # N de cada barra (+ tracción): el promedio de los dos extremos
        out['N' + dirv] = [0.5 * (m.members[f'B{j}'].axial(0, c) + m.members[f'B{j}'].axial(m.members[f'B{j}'].L(), c)) * -1 for j in range(len(d['barras']))]
    # el giro de los pisos con el torsor (en los anillos: la app lo calcula con la malla articulada de anillo a anillo)
    mt = modelo(d, 'A', torsor=True)
    th = []
    for k in range(1, len(d['zs'])):
        ids = [i for i, n in enumerate(d['nudos']) if n[3] == k]
        if not ids: th.append(None); continue
        # el giro del piso: el corrimiento a lo largo de la vuelta de sus nudos sobre el radio, en promedio
        cx, cy = d['cx'] + XC, d['cy'] + YC
        s = 0.0
        for i in ids:
            x, y = d['nudos'][i][0] - cx, d['nudos'][i][1] - cy
            s += (-y * mt.nodes[f'N{i}'].DX[c] + x * mt.nodes[f'N{i}'].DY[c]) / (x * x + y * y)
        th.append(s / len(ids))
    out['giro'] = [0.0] + th
    return out


if __name__ == '__main__':
    print(json.dumps(resolver(json.load(open(sys.argv[1])))))
