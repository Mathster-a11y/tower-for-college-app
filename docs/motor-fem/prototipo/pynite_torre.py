"""La misma torre en Pynite (MIT): ménsulas Euler-Bernoulli; el diafragma rígido se arma con vigas muy rígidas en cada piso."""
import json, sys
from Pynite import FEModel3D
d = json.load(open(sys.argv[1])); E, G = d['E'], d['G']
niv = sorted(d['niveles'], key=lambda n: n['z'])
m = FEModel3D(); m.add_material('H', E, G, 0.2, 2.4)
cols = [(pz['nombre'], pz['x'], pz['y'], pz['J'], 1e-6, pz['A']) for pz in d['piezas']] + [(pp['nombre'], 0.0, pp['y'], 1e-6, pp['J'], 1.0) for pp in d['perp']]
for k, n in enumerate(niv):
    m.add_node(f'C{k}', 0, 0, n['z'])
    for (nom, x, y, Jy, Jx, A) in cols:
        m.add_node(f'{nom}_{k}', x, y, n['z'])
        if k == 0: m.def_support(f'{nom}_{k}', True, True, True, True, True, True)
        else:
            m.add_section(f'r{nom}{k}', 50, 50, 50, 50)
            m.add_member(f'R{nom}{k}', f'C{k}', f'{nom}_{k}', 'H', f'r{nom}{k}')         # brazo rígido al centro del piso
            # en el muro, el brazo es una articulación: la losa transmite fuerzas en su plano, no traba el giro del muro
            m.def_releases(f'R{nom}{k}', Rxj=True, Ryj=True, Rzj=True)
    if k == 0: m.def_support(f'C{k}', True, True, True, True, True, True)
    else: m.def_support(f'C{k}', False, False, True, True, True, False)
for (nom, x, y, Jy, Jx, A) in cols:
    m.add_section(f's{nom}', A, Jx, Jy, 1e-4)   # A, Iy (flexión en x), Iz (flexión en y), J
    for k in range(1, len(niv)):
        m.add_member(f'{nom}{k}', f'{nom}_{k-1}', f'{nom}_{k}', 'H', f's{nom}')
for k, n in enumerate(niv):
    if k and n['W']: m.add_node_load(f'C{k}', 'FY', n['W'])
m.analyze_linear(check_statics=False)
top = f'C{len(niv)-1}'
out = {'uy_top': m.nodes[top].DY['Combo 1'], 'rz_top': m.nodes[top].RZ['Combo 1'], 'corte': {nom: -m.nodes[f'{nom}_0'].RxnFY['Combo 1'] for (nom, *_ ) in cols}}
print(json.dumps(out))
