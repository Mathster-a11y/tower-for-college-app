"""Resuelve la cara exportada por la app (cara.json) con el solver de pórticos/reticulados de structural-solver-
(apps/truss/truss_math.py, código independiente) y compara el esfuerzo normal de cada barra.

La losa (diafragma rígido) se representa con un tirante muy rígido entre las dos esquinas de cada piso: así los
nudos del piso se corren lo mismo, como en la app. Unidades del solver: kN, GPa, cm², cm⁴, coordenadas en px."""
import json, sys, os
SOLVER = sys.argv[1]
sys.path.insert(0, SOLVER)
# el solver importa tkinter para su interfaz; acá solo se usa la parte de cálculo
import types
class _Nada(types.ModuleType):
    def __getattr__(self, k): return type(k, (), {'__init__': lambda *a, **kw: None})
for m in ('tkinter', 'tkinter.ttk', 'tkinter.filedialog', 'tkinter.messagebox', 'tkinter.font', 'tkinter.simpledialog'):
    sys.modules.setdefault(m, _Nada(m))
from apps.truss.truss_math import analyze
from common import PX_PER_M
d = json.load(open(os.path.join(os.path.dirname(__file__), 'cara.json')))
g = 9.80665
E_GPa = d['E'] * g * 1e-6                      # t/m² → kN/m² → GPa
nodos = [(n['s'] * PX_PER_M, n['z'] * PX_PER_M) for n in d['nudos']]
barras = []
for b in d['barras']:
    rigida = not b['relA'] and not b['relB']
    assert b['relA'] == b['relB'], 'el solver no tiene articulación en un solo extremo'
    barras.append({'a': b['a'], 'b': b['b'], 'E': E_GPa, 'A': b['A'] * 1e4, 'I': b['I'] * 1e8, 'conn': 'rigid' if rigida else 'pin'})
n_app = len(barras)
# diafragma: un tirante muy rígido entre los nudos de cada piso (de izquierda a derecha)
for k in range(1, len(d['zs'])):
    piso = sorted([i for i, n in enumerate(d['nudos']) if n['piso'] == k], key=lambda i: d['nudos'][i]['s'])
    for a, b in zip(piso, piso[1:]):
        barras.append({'a': a, 'b': b, 'E': E_GPa, 'A': 1e7, 'I': 1.0, 'conn': 'pin'})
# viento de cada piso en el nudo de la izquierda (kN); apoyos empotrados en la base
cargas = []
for k, w in enumerate(d['W'], start=1):
    izq = min([i for i, n in enumerate(d['nudos']) if n['piso'] == k], key=lambda i: d['nudos'][i]['s'])
    cargas.append({'node': izq, 'fx': w * g, 'fy': 0.0})
apoyos = [{'node': i, 'type': 'fixed'} for i, n in enumerate(d['nudos']) if n['piso'] == 0]
res, err = analyze(nodos, barras, cargas, apoyos)
assert err is None, err
peor = 0
print(f"{'barra':6} {'N app (t)':>10} {'N solver (t)':>13} {'dif %':>7}")
for i, b in enumerate(d['barras']):
    Ns = res['rod_res'][i]['force'] / g       # kN → t; + tracción en los dos
    Na = d['N'][b['id']]
    dif = abs(Ns - Na) / max(abs(Na), 1e-6) * 100 if abs(Na) > 0.01 else 0.0
    peor = max(peor, dif)
    print(f"{b['id']:6} {Na:10.3f} {Ns:13.3f} {dif:7.3f}")
utop_app = d['u'][-1]
top = [i for i, n in enumerate(d['nudos']) if n['piso'] == len(d['zs']) - 1][0]
utop_s = res['node_res'][top]['ux'] if 'ux' in res['node_res'][top] else None
print('mayor diferencia en N: %.3f %%' % peor)
print('corrimiento de la azotea: app %.3f mm · solver %.3f mm' % (utop_app * 1000, utop_s))
