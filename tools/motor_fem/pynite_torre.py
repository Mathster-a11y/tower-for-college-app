"""La misma torre en Pynite (MIT): ménsulas Euler-Bernoulli. Pynite no tiene diafragma rígido: en cada piso hay un
nudo central y brazos muy rígidos hasta cada muro, articulados en el muro (la losa transmite fuerzas en su plano pero
no traba el giro del muro; sin la articulación la flecha sale unas 235 veces menor).
Dos columnas en el mismo punto de la planta (por ejemplo T1 y T3 del ejemplo, una arriba de la otra en el dibujo de la
planilla) dejan la matriz de Pynite singular. Se separan en la coordenada que no cambia nada: las paralelas en y
(su posición en el sentido del viento no entra con losa rígida) y las perpendiculares en x.
Además, el nudo central va corrido del eje, en (XC, YC): un brazo justo paralelo al eje y global (pieza en x = 0) le
da a Pynite una rigidez falsa (la flecha sale cientos de veces menor). La fuerza de cada piso se lleva a x = 0 con un
momento MZ = −W·XC, equivalente exacto con losa rígida, y la flecha se informa en x = 0.

Uso como script:  python pynite_torre.py caso.json   → imprime el resultado en JSON
"""
import json, sys


XC, YC = 0.0731, 0.0517


def resolver(d):
    from Pynite import FEModel3D
    E, G = d['E'], d['G']
    niv = sorted(d['niveles'], key=lambda n: n['z'])
    zTop = niv[-1]['z']
    m = FEModel3D(); m.add_material('H', E, G, 0.2, 2.4)
    # (nombre, x, y, Jx, Jy, A, zHasta): Jy flexiona en y (viento), Jx en x
    cols = [(pz['nombre'], pz['x'], pz['y'], 1e-6, pz['J'], pz['A'], pz.get('zHasta', zTop)) for pz in d['piezas']]
    cols += [(f'perp{i}', 0.0, pp['y'], pp['J'], 1e-6, 1.0, zTop) for i, pp in enumerate(d['perp'])]
    usados, sep = set(), []
    for i, (nom, x, y, *resto) in enumerate(cols):
        paralela = i < len(d['piezas'])
        while (round(x, 4), round(y, 4)) in usados or (abs(x - XC) < 1e-3 or abs(y - YC) < 1e-3):
            if paralela: y += 0.05
            else: x += 0.05
        usados.add((round(x, 4), round(y, 4))); sep.append((nom, x, y, *resto))
    cols = sep
    m.add_section('rigido', 50, 50, 50, 50)
    for k, n in enumerate(niv):
        m.add_node(f'C{k}', XC, YC, n['z'])
        for (nom, x, y, Jx, Jy, A, zH) in cols:
            if n['z'] > zH + 1e-6: continue
            m.add_node(f'{nom}_{k}', x, y, n['z'])
            if k == 0: m.def_support(f'{nom}_{k}', True, True, True, True, True, True)
            else:
                m.add_member(f'R{nom}_{k}', f'C{k}', f'{nom}_{k}', 'H', 'rigido')
                m.def_releases(f'R{nom}_{k}', Rxj=True, Ryj=True, Rzj=True)
        if k == 0: m.def_support(f'C{k}', True, True, True, True, True, True)
        else: m.def_support(f'C{k}', False, False, True, True, True, False)
    for (nom, x, y, Jx, Jy, A, zH) in cols:
        m.add_section(f's{nom}', A, Jx, Jy, 1e-4)          # A, Iy (flexión en x), Iz (flexión en y), J
        for k in range(1, len(niv)):
            if niv[k]['z'] > zH + 1e-6: break
            m.add_member(f'{nom}|{k}', f'{nom}_{k-1}', f'{nom}_{k}', 'H', f's{nom}')
    for k, n in enumerate(niv):
        if k and n['W']:
            m.add_node_load(f'C{k}', 'FY', n['W']); m.add_node_load(f'C{k}', 'MZ', -n['W'] * XC)
    m.analyze_linear(check_statics=False, check_stability=False)
    c = 'Combo 1'
    return {
        'motor': 'Pynite · Euler',
        'corte': {pz['nombre']: -m.nodes[f"{pz['nombre']}_0"].RxnFY[c] for pz in d['piezas']},
        'momento': {pz['nombre']: m.nodes[f"{pz['nombre']}_0"].RxnMX[c] for pz in d['piezas']},
        'uy': [m.nodes[f'C{k}'].DY[c] - m.nodes[f'C{k}'].RZ[c] * XC if k else 0.0 for k in range(len(niv))],
        'rz': [m.nodes[f'C{k}'].RZ[c] if k else 0.0 for k in range(len(niv))],
        'z': [n['z'] for n in niv],
    }


if __name__ == '__main__':
    print(json.dumps(resolver(json.load(open(sys.argv[1])))))
