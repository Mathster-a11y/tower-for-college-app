"""Compara la hoja «G · Malla» recalculada por LibreOffice con lo que espera la app (tools/verificar_malla_excel.ts).
Uso: python3 -I tools/comparar_malla.py recalculada.xlsx malla.json"""
import json, sys, warnings
import openpyxl
warnings.filterwarnings('ignore')
wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
e = json.load(open(sys.argv[2]))
h = wb['G · Malla']
r0 = e['r0']
mal = 0
for i, (L, A) in enumerate(zip(e['L'], e['A'])):
    r = r0 + 1 + i
    for c, x in (('L', L), ('P', A)):
        y = h[f'{c}{r}'].value
        if not isinstance(y, (int, float)) or abs(y - x) > 1e-9 * max(1, abs(x)):
            mal += 1
            if mal < 10: print('DISTINTO', c, r, 'LibreOffice', y, 'app', x)
# totales: la fila «acero de la malla» (columna L) y «barras que no verifican»
tot = {h[f'G{r}'].value: h[f'L{r}'].value for r in range(1, h.max_row + 1) if h[f'G{r}'].value}
peso = tot.get('acero de la malla, con los anillos (t)')
if peso is None or abs(peso - e['peso']) > 1e-6 * e['peso']: mal += 1; print('PESO', peso, 'app', e['peso'])
if tot.get('barras que no verifican') != e['malas']: mal += 1; print('NO VERIFICAN', tot.get('barras que no verifican'), 'app', e['malas'])
dl = tot.get('mayor |Δ L| (m; debe dar 0)')
if dl is None or abs(dl) > 1e-9: mal += 1; print('ΔL', dl)
print(f'barras {len(e["L"])} · distintos {mal}')
