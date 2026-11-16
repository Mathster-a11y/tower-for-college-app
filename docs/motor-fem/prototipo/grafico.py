import json, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
fig, axs = plt.subplots(1, 2, figsize=(13, 4.8), dpi=150)
for ax, c, tit in [(axs[0], 'guia', 'Ejemplo de la guía (planta simétrica)'), (axs[1], 'anexo', 'Anexo de la guía (T5 aislado: rototraslación)')]:
    d = json.load(open(f'{c}.json')); pz = [p['nombre'] for p in d['piezas']]
    pl = {r['nombre']: (r['Qtras'] + (r['N'] if r['N'] == r['N'] else 0)) / d['planilla']['Q'] * 100 for r in d['planilla']['reparto']}
    fuentes = [('Planilla (J y rotación)', pl)]
    for f, nom in [(f'os_{c}_e.json', 'OpenSees · Euler'), (f'pn_{c}.json', 'Pynite · Euler'), (f'os_{c}_t.json', 'OpenSees · Timoshenko')]:
        r = json.load(open(f))['corte']; tot = sum(r[p] for p in pz); fuentes.append((nom, {p: r[p] / tot * 100 for p in pz}))
    w = 0.2
    for i, (nom, v) in enumerate(fuentes):
        xs = [k + (i - 1.5) * w for k in range(len(pz))]
        ax.bar(xs, [v[p] for p in pz], w, label=nom)
    ax.set_xticks(range(len(pz)), pz); ax.set_ylabel('% del corte en la base'); ax.set_title(tit, fontsize=10); ax.grid(axis='y', alpha=.3)
    print(c); [print(f'  {nom:28s}', ' '.join(f'{p}:{v[p]:6.2f}' for p in pz)) for nom, v in fuentes]
axs[0].legend(fontsize=8)
plt.tight_layout(); plt.savefig('comparacion_motores.png')
