"""Extrae de una planilla original «Edificios en torre» los datos de entrada (en el formato del motor)
y los resultados guardados por Excel, para probar el motor de la app.
Uso: python3 -I tools/extraer_fixture.py planilla.xlsx salida.json"""
import json, sys, warnings
import openpyxl
warnings.filterwarnings('ignore')
src, out = sys.argv[1], sys.argv[2]
wf = openpyxl.load_workbook(src)
wv = openpyxl.load_workbook(src, data_only=True)

def val(ws, ref):
    v = ws[ref].value
    return None if isinstance(v, str) and v.startswith('=') else v

def num(x):
    return x if isinstance(x, (int, float)) and not isinstance(x, bool) else None

v = wf['viento']
viento = {k: num(val(v, c)) for k, c in [('V', 'C4'), ('Kd', 'D4'), ('I', 'E4'), ('zg', 'F4'), ('alfa', 'G4'), ('Kzt', 'I4'),
                                        ('G', 'J4'), ('Cpb', 'K4'), ('Cps', 'L4'), ('GCpi', 'O4')]}
viento['Z'] = [num(wv['viento'][f'B{r}'].value) or 0 for r in range(5, 59)]
m = wf['M,NyQ']
mnyq = {'C': [], 'D': [], 'E': [], 'F': []}
for r in range(4, 58):
    for col in 'CDEF':
        x = val(m, f'{col}{r}')
        mnyq[col].append(num(x) if x is not None else None)
mnyq['b1'] = num(val(m, 'N80'))
mnyq['a1'] = num(val(m, 'N81'))
JCOLS = ['B', 'C', 'F', 'G', 'J', 'K', 'S', 'T', 'W', 'X', 'Z', 'AB', 'AE', 'AF', 'AH', 'AI', 'AO', 'AP', 'AQ', 'AT', 'AU']

def jsheet(name):
    ws = wf[name]
    rows = []
    for r in range(4, 24):
        d = {c: num(val(ws, f'{c}{r}')) for c in JCOLS}
        d = {k: x for k, x in d.items() if x is not None}
        if ws[f'Y{r}'].value is None:
            d['sinYAC'] = True
        if ws[f'O{r}'].value == 0:
            d['O0'] = True
        rows.append(d)
    return rows

def roto(name):
    ws = wf[name]
    return {'H': [num(val(ws, f'H{r}')) for r in range(5, 51)]}

f = wf['Flex comp PB paralelos']
flex = [{c: num(val(f, f'{c}{r}')) for c in 'CFG'} for r in range(4, 24)]
inputs = {'viento': viento, 'mnyq': mnyq, 'jpar': jsheet('J Tabiques paralelos'), 'jort': jsheet('J Tabiques ortogonales'),
          'rotA': roto('Rototrasl. cara mayor'), 'rotB': roto('Rototrasl. cara menor'), 'flex': flex}

def grab(sheet, cols, r0, r1):
    ws = wv[sheet]
    return {c: [num(ws[f'{c}{r}'].value) for r in range(r0, r1 + 1)] for c in cols}

expected = {
    'viento': grab('viento', ['H', 'M', 'P', 'Q', 'R', 'S'], 5, 55),
    'mnyq': grab('M,NyQ', ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'], 4, 57),
    'mnyqTot': {c: num(wv['M,NyQ'][c].value) for c in ['H61', 'J61', 'M61', 'O61', 'F62', 'G65', 'G66', 'G68', 'G69', 'G70',
                                                         'N82', 'N83', 'N84', 'N85', 'N86', 'N87', 'N89', 'N90', 'H99', 'I99', 'J99', 'K99', 'L99', 'M99', 'N99']},
    'jpar': grab('J Tabiques paralelos', ['N', 'O', 'Q', 'U', 'V', 'AK', 'AL', 'AM', 'AN', 'AX', 'AY'], 4, 23),
    'jparTot': {c: num(wv['J Tabiques paralelos'][c].value) for c in ['AY24', 'K37', 'M37', 'O37']},
    'jort': grab('J Tabiques ortogonales', ['N', 'O', 'AM', 'AY'], 4, 23),
    'jortTot': {c: num(wv['J Tabiques ortogonales'][c].value) for c in ['AY24', 'I37', 'K37', 'M37', 'O37']},
    'rotA': grab('Rototrasl. cara mayor', ['B', 'C', 'E', 'G', 'I', 'K', 'L', 'M', 'N', 'O'], 5, 50),
    'rotATot': {c: num(wv['Rototrasl. cara mayor'][c].value) for c in ['D5', 'F5', 'J7', 'J15', 'J38', 'M51', 'B25', 'B51', 'I51', 'L25']},
    'rotB': grab('Rototrasl. cara menor', ['B', 'C', 'E', 'G', 'K', 'N', 'O'], 5, 50),
    'rotBTot': {c: num(wv['Rototrasl. cara menor'][c].value) for c in ['D5', 'F5', 'J7', 'J15', 'J38', 'M51', 'B51']},
    'flex': grab('Flex comp PB paralelos', ['B', 'D', 'E', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'], 4, 23),
}
json.dump({'fuente': src.split('/')[-1], 'inputs': inputs, 'expected': expected}, open(out, 'w'), ensure_ascii=False, indent=1)
print('ok', out)
