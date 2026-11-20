"""Arma docs/motor-fem/comparacion_motores.png con los resultados de test/fixtures/motor_fem/ (viento A de la guía
y del anexo): % del corte en la base de cada pieza según la planilla, OpenSees (Euler y Timoshenko) y Pynite.

    /tmp/venv/bin/python tools/motor_fem/grafico.py
"""
import json, os
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt

AQUI = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.join(AQUI, '..', '..', 'test', 'fixtures', 'motor_fem')
SALIDA = os.path.join(AQUI, '..', '..', 'docs', 'motor-fem', 'comparacion_motores.png')

fig, axs = plt.subplots(1, 2, figsize=(13, 4.8), dpi=150)
for ax, c, tit in [(axs[0], 'guia_A', 'Ejemplo de la guía (planta simétrica)'), (axs[1], 'anexo_A', 'Anexo de la guía (T5 aislado: rototraslación)')]:
    d = json.load(open(os.path.join(DIR, f'{c}.entrada.json')))
    res = json.load(open(os.path.join(DIR, f'{c}.resultados.json')))['motores']
    pz = [p['nombre'] for p in d['piezas']]
    fuentes = [('Planilla (J y rotación)', {r['nombre']: r['pct'] for r in d['planilla']['reparto']})]
    for r in res:
        tot = sum(r['corte'][p] for p in pz); fuentes.append((r['motor'], {p: r['corte'][p] / tot * 100 for p in pz}))
    w = 0.2
    for i, (nom, v) in enumerate(fuentes):
        ax.bar([k + (i - 1.5) * w for k in range(len(pz))], [v[p] for p in pz], w, label=nom)
    ax.set_xticks(range(len(pz)), pz); ax.set_ylabel('% del corte en la base'); ax.set_title(tit, fontsize=10); ax.grid(axis='y', alpha=.3)
axs[0].legend(fontsize=8)
plt.tight_layout(); plt.savefig(SALIDA)
print('gráfico:', os.path.normpath(SALIDA))
