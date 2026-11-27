"""Capturas de la planilla para el documento de dudas (docs/dudas_planilla/capturas/*.png).

LibreOffice abre cada planilla llena (tools/dudas/planillas.test.ts), recalcula, resalta las celdas en cuestión y
exporta solo el recorte a PDF, con los encabezados de filas y columnas como en la pantalla; pdftoppm lo pasa a PNG.
Las capturas «corregida» aplican la corrección propuesta en una copia (nunca en src/assets) y recalculan.

Uso: python3 tools/dudas/capturas.py   (necesita soffice, pdftoppm y convert)
"""
import json, os, subprocess, sys, time, shutil, tempfile

import uno
from com.sun.star.beans import PropertyValue
from com.sun.star.table import BorderLine2

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..'))
PLAN = os.path.join(RAIZ, 'docs/dudas_planilla/planillas')
SAL = os.path.join(RAIZ, 'docs/dudas_planilla/capturas')



def pv(nombre, valor):
    p = PropertyValue(); p.Name = nombre; p.Value = valor
    return p


class Calc:
    def __init__(self):
        self.perfil = tempfile.mkdtemp(prefix='lo_dudas_')
        self.proc = subprocess.Popen(['soffice', '--headless', '--invisible', '--nologo', '--norestore',
                                      f'-env:UserInstallation=file://{self.perfil}',
                                      '--accept=socket,host=localhost,port=2299;urp;'],
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        local = uno.getComponentContext()
        res = local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', local)
        for _ in range(60):
            try:
                ctx = res.resolve('uno:socket,host=localhost,port=2299;urp;StarOffice.ComponentContext'); break
            except Exception:
                time.sleep(0.5)
        else:
            raise RuntimeError('LibreOffice no arrancó')
        self.desk = ctx.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', ctx)

    def abrir(self, ruta):
        return self.desk.loadComponentFromURL(uno.systemPathToFileUrl(ruta), '_blank', 0, (pv('Hidden', True),))

    def cerrar(self):
        try:
            self.desk.terminate()
        except Exception:
            pass
        self.proc.wait(timeout=30)
        shutil.rmtree(self.perfil, ignore_errors=True)


def marco(color=0xC0392B, ancho=60):
    b = BorderLine2(); b.Color = color; b.LineStyle = 0; b.LineWidth = ancho   # línea simple (con la doble quedaban franjas)
    return b


def recorte(calc, archivo, hoja, rango, nombre, resaltar=(), cambios=(), formulas=False, ocultar_cols=(), ocultar_filas=(),
            ancho_cols=None, leer=(), datos=(), alto_filas=None):
    """resaltar: [(rango, color de fondo o None, color del marco o None)]; cambios: [(rango, función(fórmula, fila) → fórmula)];
    datos: [(hoja, celda, valor)] escritos antes de recalcular (casos de prueba); leer: celdas cuyo valor se devuelve"""
    doc = calc.abrir(os.path.join(PLAN, archivo))
    try:
        sh = doc.Sheets.getByName(hoja)
        for h, celda, v in datos:
            c = doc.Sheets.getByName(h).getCellRangeByName(celda)
            c.setFormula(v) if isinstance(v, str) else c.setValue(v)
        for r, fn in cambios:
            cr = sh.getCellRangeByName(r)
            a = cr.RangeAddress
            for fila in range(a.StartRow, a.EndRow + 1):
                for col in range(a.StartColumn, a.EndColumn + 1):
                    c = sh.getCellByPosition(col, fila)
                    c.setFormula(fn(c.getFormula(), fila + 1))
        doc.calculateAll()
        valores = {}
        for celda in leer:
            h, ref = celda.split('!') if '!' in celda else (hoja, celda)
            c = doc.Sheets.getByName(h).getCellRangeByName(ref)
            valores[celda] = c.getString() if c.getError() else c.getValue()
            valores[celda + ':f'] = c.getFormula()
            valores[celda + ':t'] = c.getString()
        for r, fondo, borde in resaltar:
            cr = sh.getCellRangeByName(r)
            if fondo is not None:
                cr.CellBackColor = fondo
            if borde is not None:
                m = marco(borde)
                cr.TopBorder = m; cr.BottomBorder = m; cr.LeftBorder = m; cr.RightBorder = m
        # sin los dibujos ni los comentarios de la planilla (tapan celdas en el recorte); es una copia que no se guarda
        sh.removeAllManualPageBreaks()
        dp = sh.DrawPage
        while dp.Count:
            dp.remove(dp.getByIndex(0))
        an = sh.Annotations
        while an.Count:
            an.removeByIndex(0)
        if alto_filas:
            for fila, alto in alto_filas.items():
                sh.getRows().getByIndex(fila - 1).Height = alto
        for col in ocultar_cols:
            sh.getColumns().getByName(col).IsVisible = False
        for fila in ocultar_filas:
            sh.getRows().getByIndex(fila - 1).IsVisible = False
        if ancho_cols:
            for col, w in ancho_cols.items():
                sh.getColumns().getByName(col).Width = w
        # página: con encabezados de filas y columnas y la cuadrícula, todo el recorte en una hoja
        estilo = doc.StyleFamilies.getByName('PageStyles').getByName(sh.PageStyle)
        estilo.IsLandscape = True
        estilo.Width, estilo.Height = 120000, 120000         # hoja enorme a escala 100 %: sin cortes ni reescalado
        estilo.PrintHeaders = True
        estilo.PrintGrid = True
        estilo.PrintFormulas = formulas
        estilo.PrintAnnotations = False
        estilo.HeaderIsOn = False
        estilo.FooterIsOn = False
        estilo.PageScale = 100
        for m in ('LeftMargin', 'RightMargin', 'TopMargin', 'BottomMargin'):
            setattr(estilo, m, 300)
        for i in range(doc.Sheets.Count):
            doc.Sheets.getByIndex(i).setPrintAreas(())
        sh.setPrintAreas((sh.getCellRangeByName(rango).RangeAddress,))
        # guardar la copia y volver a abrirla: con el alto o el ancho cambiados en la misma sesión, la exportación
        # dejaba franjas blancas (el armado de la página viejo)
        tmp = os.path.join(calc.perfil, nombre + '.ods')
        doc.storeToURL(uno.systemPathToFileUrl(tmp), (pv('FilterName', 'calc8'),))
        doc.close(True)
        doc = calc.abrir(tmp)
        sh = doc.Sheets.getByName(hoja)
        pdf = os.path.join(SAL, nombre + '.pdf')
        sel = sh.getCellRangeByName(rango)
        doc.storeToURL(uno.systemPathToFileUrl(pdf), (pv('FilterName', 'calc_pdf_Export'),
                                                      pv('FilterData', uno.Any('[]com.sun.star.beans.PropertyValue', (pv('Selection', sel),)))))
        a_png(pdf, nombre)
        return valores
    finally:
        doc.close(True)


def a_png(pdf, nombre):
    base = os.path.join(SAL, nombre)
    subprocess.run(['pdftocairo', '-png', '-r', '170', '-singlefile', pdf, base], check=True)
    subprocess.run(['convert', base + '.png', '-trim', '-bordercolor', 'white', '-border', '6', base + '.png'], check=True)
    if not os.environ.get('GUARDAR_PDF'): os.remove(pdf)



# marcos: lo que está mal (naranja), lo corregido (verde), lo que se compara (violeta). Ni rojo ni azul: en la app son
# tracción y compresión, y en estas hojas hay tensiones
MAL, BIEN, OJO = 0xE65100, 0x2E7D32, 0x7B3FA0
FMAL, FBIEN = 0xFFD8A8, 0xC8EBCB                     # fondos


def todas(rango_filas, plantilla):
    """cambio que escribe plantilla.format(r=fila) en cada celda del rango"""
    return lambda f, r: plantilla.format(r=r)


def cambiar(a, b):
    """intercambia dos textos dentro de la fórmula (con la fila de la celda)"""
    def fn(f, r):
        x, y = a.format(r=r), b.format(r=r)
        return f.replace(x, '\0').replace(y, x).replace('\0', y)
    return fn


def figuras(c):
    V = {}
    def fig(nombre, *a, **k):
        if SOLO and nombre not in SOLO:
            return
        if a[1] == 'Flex comp PB paralelos' and 'alto_filas' not in k:
            k['alto_filas'] = {2: 2300}
        V[nombre] = recorte(c, *a, nombre=nombre, **k)
        print('  ', nombre)

    # 1. Rototrasl., columna O: momento + fuerza (torre asimétrica)
    leer1 = [f'{x}{r}' for r in range(5, 11) for x in 'DFGNO']
    fig('d1_antes', 'asim_anterior.xlsx', 'Rototrasl. cara mayor', 'A3:O10', leer=leer1,
        resaltar=[('O5:O10', FMAL, MAL), ('N5:N10', None, OJO), ('G5:G10', None, OJO)])
    fig('d1_despues', 'asim_anterior.xlsx', 'Rototrasl. cara mayor', 'A3:O10', leer=leer1,
        cambios=[('O5:O24', todas(None, '=G{r}+N{r}*$F$5/$D$5'))],
        resaltar=[('O5:O10', FBIEN, BIEN), ('D5', None, OJO), ('F5', None, OJO)])
    # 1b. efecto en la flexocompresión (lee O de Rototrasl.)
    leerF = [f'{x}{r}' for r in range(4, 10) for x in 'HIJOP']
    fig('d1_flex', 'asim_anterior.xlsx', 'Flex comp PB paralelos', 'A2:P9', leer=leerF,
        datos=[('Rototrasl. cara mayor', f'O{r}', f'=G{r}+N{r}*$F$5/$D$5') for r in range(5, 25)],
        resaltar=[('J4:J9', FBIEN, BIEN), ('O4:P9', None, OJO)])

    # 2. Flex comp: cargas cruzadas (torre asimétrica)
    fig('d2_antes', 'asim_anterior.xlsx', 'Flex comp PB paralelos', 'A2:P9', leer=leerF,
        resaltar=[('H4:I9', None, OJO), ('O4:P9', FMAL, MAL)])
    fig('d2_despues', 'asim_anterior.xlsx', 'Flex comp PB paralelos', 'A2:P9', leer=leerF,
        cambios=[('O4:P23', cambiar('-H{r}/', '-I{r}/'))],
        resaltar=[('H4:I9', None, OJO), ('O4:P9', FBIEN, BIEN)])
    fig('d2_formulas', 'asim_anterior.xlsx', 'Flex comp PB paralelos', 'A3:P5', formulas=True,
        ocultar_cols=['B', 'C', 'D', 'E', 'F', 'G', 'K', 'L', 'M', 'N'],
        ancho_cols={'H': 3600, 'I': 3600, 'J': 6200, 'O': 10500, 'P': 10500},
        resaltar=[('O4:P5', FMAL, MAL)])
    fig('d2_formulas_bien', 'asim_anterior.xlsx', 'Flex comp PB paralelos', 'A3:P5', formulas=True,
        cambios=[('O4:P23', cambiar('-H{r}/', '-I{r}/'))],
        ocultar_cols=['B', 'C', 'D', 'E', 'F', 'G', 'K', 'L', 'M', 'N'],
        ancho_cols={'H': 3600, 'I': 3600, 'J': 6200, 'O': 10500, 'P': 10500},
        resaltar=[('O4:P5', FBIEN, BIEN)])

    # 3. Flex comp D13:D20 = 0,01 (torre de 34 pisos: T2 y T5 caen en las filas 13 y 14)
    leer3 = [f'{x}{r}' for r in (13, 14) for x in 'BCDEHIOP']
    filas3 = list(range(4, 12)) + list(range(16, 24))
    fig('d3_antes', 'p34_anterior.xlsx', 'Flex comp PB paralelos', 'A2:P15', leer=leer3, ocultar_filas=list(range(4, 12)),
        resaltar=[('D13:D15', FMAL, MAL), ('E13:E14', None, OJO), ('H13:I14', None, OJO)])
    fig('d3_despues', 'p34_anterior.xlsx', 'Flex comp PB paralelos', 'A2:P15', leer=leer3, ocultar_filas=list(range(4, 12)),
        cambios=[('D13:D20', todas(None, '=B{r}*C{r}'))],
        resaltar=[('D13:D15', FBIEN, BIEN), ('E13:E14', None, OJO), ('H13:I14', None, OJO)])

    # 4. el tipo de fila manda (ejemplo de la guía: T5 y T6 asimétricas en filas «simetrica»)
    leer4 = [f'{x}{r}' for r in (4, 5) for x in 'BJMOP']
    fig('d4_antes', 'guia_anterior.xlsx', 'Flex comp PB paralelos', 'A2:Q9', leer=leer4,
        resaltar=[('M4:P5', FMAL, MAL), ('Q4:Q5', None, OJO)])
    fig('d4_despues', 'guia_anterior.xlsx', 'Flex comp PB paralelos', 'A2:Q9', leer=leer4,
        cambios=[('M4:P5', lambda f, r: f.replace(f'.Q{r}', f'.AN{r}').replace(f'.$Q${r}', f'.$AN${r}'))],
        resaltar=[('M4:P5', FBIEN, BIEN), ('Q4:Q5', None, OJO)])

    # 5. planilla 2025: «Flex comp» lee el área de una fila de la hoja J y el momento de otra (torre de 34 pisos)
    fig('d5_formulas', 'p34_2025.xlsx', 'Flex comp PB paralelos', 'A8:M14', formulas=True,
        ocultar_cols=['C', 'D', 'E', 'F', 'G', 'H', 'I', 'K', 'L'],
        ancho_cols={'B': 7800, 'J': 7800, 'M': 14500},
        resaltar=[('B10:B14', FMAL, MAL), ('J10:J14', None, OJO), ('M10:M14', FMAL, MAL)])
    fig('d5_roto', 'p34_2025.xlsx', 'Rototrasl. cara mayor', 'A9:B15', formulas=True, ancho_cols={'B': 7800},
        resaltar=[('B11:B15', None, OJO)])

    # 6. hoja J: área sin el ala inferior (O) y W de las asimétricas por la mitad de la altura (AN) (torre de 34 pisos)
    leer6 = [f'{x}{r}' for r in range(4, 8) for x in ['O', 'X', 'AB', 'AH', 'AI', 'AK', 'AM', 'AN']]
    oc6 = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'Y', 'AA', 'AC', 'AD', 'AG', 'AJ', 'AL']
    fig('d6_antes', 'p34_anterior.xlsx', 'J Tabiques paralelos', 'A2:AN7', leer=leer6, ocultar_cols=oc6,
        resaltar=[('O4:O7', FMAL, MAL), ('AN4:AN7', FMAL, MAL), ('AH4:AI7', None, OJO), ('AK4:AK7', None, OJO)])
    fig('d6_despues', 'p34_anterior.xlsx', 'J Tabiques paralelos', 'A2:AN7', leer=leer6, ocultar_cols=oc6,
        cambios=[('O4:O23', lambda f, r: f + f'+AH{r}*AI{r}'),
                 ('AN4:AN23', todas(None, '=AM{r}/MAX(AK{r};X{r}+AB{r}+AI{r}-AK{r})'))],
        resaltar=[('O4:O7', FBIEN, BIEN), ('AN4:AN7', FBIEN, BIEN), ('AH4:AI7', None, OJO), ('AK4:AK7', None, OJO)])

    # 7. hoja J, filas 11 y 12 (piezas 8 y 9) sin Y ni AC: la misma pieza en la fila 4 y en la 11 (torre asimétrica, T6)
    t6 = [('W', 5), ('X', 0.2), ('Z', 0.2), ('AB', 3.6), ('AH', 5), ('AI', 0.2)]
    datos7 = [('J Tabiques paralelos', f'{col}11', v) for col, v in t6]
    leer7 = [f'{x}{r}' for r in (4, 11) for x in ['Y', 'AC', 'AG', 'AJ', 'AM']]
    oc7 = [chr(c) for c in range(ord('B'), ord('W'))]
    fig('d7_antes', 'asim_anterior.xlsx', 'J Tabiques paralelos', 'A2:AM11', datos=datos7, leer=leer7, ocultar_cols=oc7,
        ocultar_filas=list(range(5, 11)), resaltar=[('Y11', FMAL, MAL), ('AC11', FMAL, MAL), ('AM11', None, MAL), ('AM4', None, OJO)])
    fig('d7_despues', 'asim_anterior.xlsx', 'J Tabiques paralelos', 'A2:AM11', datos=datos7, leer=leer7, ocultar_cols=oc7,
        ocultar_filas=list(range(5, 11)),
        cambios=[('Y11:Y12', todas(None, '=W{r}*POWER(X{r};3)/12+W{r}*X{r}*POWER(AK{r}-X{r}/2;2)')),
                 ('AC11:AC12', todas(None, '=Z{r}*POWER(AB{r};3)/12+Z{r}*AB{r}*POWER(AB{r}/2+X{r}-AK{r};2)'))],
        resaltar=[('Y11', FBIEN, BIEN), ('AC11', FBIEN, BIEN), ('AM11', None, BIEN), ('AM4', None, OJO)])

    # 8. tubos circulares: W = J/D/2 (4 veces menos) y el área en 0 en las filas 21 a 23 (caso de prueba: Ø 2 m, e = 20 cm)
    datos8 = [('J Tabiques paralelos', 'S10', 2.0), ('J Tabiques paralelos', 'T10', 1.6),
              ('J Tabiques paralelos', 'S21', 2.0), ('J Tabiques paralelos', 'T21', 1.6)] + \
             [('Flex comp PB paralelos', f'{c}{r}', v) for r in (10, 21) for c, v in (('C', 64.0), ('F', 20.0), ('G', 21.0))]
    leer8 = [f'{x}{r}' for r in (10, 21) for x in 'OSTUV'] + ['Flex comp PB paralelos!O21', 'Flex comp PB paralelos!P21', 'Flex comp PB paralelos!O10']
    oc8 = [chr(c) for c in range(ord('B'), ord('O'))] + ['P', 'Q', 'R']
    fig('d8_antes', 'asim_anterior.xlsx', 'J Tabiques paralelos', 'A2:V21', datos=datos8, leer=leer8, ocultar_cols=oc8,
        ocultar_filas=list(range(4, 10)) + list(range(11, 21)), ancho_cols={'O': 3200, 'V': 3200},
        resaltar=[('O21', FMAL, MAL), ('V10', FMAL, MAL), ('V21', FMAL, MAL), ('U10', None, OJO), ('U21', None, OJO)])
    fig('d8_despues', 'asim_anterior.xlsx', 'J Tabiques paralelos', 'A2:V21', datos=datos8, leer=leer8, ocultar_cols=oc8,
        ocultar_filas=list(range(4, 10)) + list(range(11, 21)), ancho_cols={'O': 3200, 'V': 3200},
        cambios=[('V4:V23', todas(None, '=U{r}/(S{r}/2)')),
                 ('O21:O23', todas(None, '=B{r}*C{r}+F{r}*G{r}+J{r}*K{r}+PI()*POWER(S{r}/2;2)-PI()*POWER(T{r}/2;2)+W{r}*X{r}+Z{r}*AB{r}+AE{r}*AF{r}'))],
        resaltar=[('O21', FBIEN, BIEN), ('V10', FBIEN, BIEN), ('V21', FBIEN, BIEN), ('U10', None, OJO), ('U21', None, OJO)])
    fig('d8_flex', 'asim_anterior.xlsx', 'Flex comp PB paralelos', 'A2:P21', datos=datos8, ocultar_filas=list(range(4, 21)),
        leer=['B21', 'M21', 'O21', 'P21'], resaltar=[('B21', FMAL, MAL), ('K21:P21', FMAL, MAL)])
    fig('d8_flex_despues', 'asim_anterior.xlsx', 'Flex comp PB paralelos', 'A2:P21', ocultar_filas=list(range(4, 21)),
        datos=datos8 + [('J Tabiques paralelos', 'O21', '=B21*C21+F21*G21+J21*K21+PI()*POWER(S21/2;2)-PI()*POWER(T21/2;2)+W21*X21+Z21*AB21+AE21*AF21')] +
        [('J Tabiques paralelos', f'V{r}', f'=U{r}/(S{r}/2)') for r in range(4, 24)],
        leer=['B21', 'D21', 'H21', 'I21', 'J21', 'M21', 'O21', 'P21'], resaltar=[('B21', FBIEN, BIEN), ('K21:P21', FBIEN, BIEN)])

    # 9. «J Tabiques ortogonales» N23 suma el J del tubo, que AY23 vuelve a sumar (caso de prueba: tubo en las filas 22 y 23)
    datos9 = [('J Tabiques ortogonales', f'{c}{r}', v) for r in (22, 23) for c, v in (('S', 2.0), ('T', 1.6))]
    leer9 = [f'{x}{r}' for r in (22, 23) for x in ['N', 'U', 'AY']]
    oc9 = [chr(c) for c in range(ord('B'), ord('N'))] + ['O', 'P', 'Q', 'R', 'V'] + [f'A{chr(c)}' for c in range(ord('A'), ord('X'))]
    fig('d9_antes', 'asim_anterior.xlsx', 'J Tabiques ortogonales', 'A2:AY23', datos=datos9, leer=leer9, ocultar_cols=oc9,
        ocultar_filas=list(range(4, 22)), resaltar=[('N23', FMAL, MAL), ('AY23', FMAL, MAL), ('AY22', None, OJO)])
    fig('d9_formulas', 'asim_anterior.xlsx', 'J Tabiques ortogonales', 'A2:N23', formulas=True, ocultar_cols=[chr(c) for c in range(ord('B'), ord('N'))],
        ocultar_filas=list(range(4, 22)), ancho_cols={'N': 6500}, resaltar=[('N23', FMAL, MAL), ('N22', None, OJO)])

    # 10. «M,NyQ» G55:G57 leen otro libro ([1]viento)
    fig('d10_formulas', 'asim_anterior.xlsx', 'M,NyQ', 'A52:H57', formulas=True, ocultar_cols=['C', 'D', 'E', 'F'],
        ancho_cols={'A': 2600, 'B': 3000, 'G': 30000, 'H': 4200}, resaltar=[('G55:G57', FMAL, MAL), ('G52:G54', None, OJO)])

    # 11. «Rototrasl. cara menor» B51 e I51 suman hasta la fila 38
    fig('d11_formulas', 'asim_anterior.xlsx', 'Rototrasl. cara menor', 'A49:O51', formulas=True,
        ocultar_cols=['C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'N', 'O'], ancho_cols={'B': 6500, 'I': 4800, 'L': 4800, 'M': 4800},
        resaltar=[('B51', FMAL, MAL), ('I51', FMAL, MAL), ('L51:M51', None, OJO)])

    # 12. el G de la hoja viento
    fig('d12_viento', 'asim_anterior.xlsx', 'viento', 'A2:S7', resaltar=[('J4:J7', None, OJO)])
    # 13. pórticos: «Flex comp» lee el área en O y el W en Q, pero los del pórtico están en BB y AZ (torre de 34 pisos, T27 a T29)
    leer13 = [f'J Tabiques paralelos!{x}{r}' for r in (8, 9, 10) for x in ['O', 'Q', 'AX', 'AZ', 'BB']] + [f'{x}{r}' for r in (8, 9, 10) for x in 'BJMOP']
    fig('d13_flex', 'p34_anterior.xlsx', 'Flex comp PB paralelos', 'A2:P10', leer=leer13, ocultar_filas=list(range(4, 8)),
        resaltar=[('B8:B10', FMAL, MAL), ('M8:P10', FMAL, MAL), ('J8:J10', None, OJO)])
    oc13 = [chr(c) for c in range(ord('B'), ord('O'))] + ['P', 'R', 'S', 'T', 'U', 'V'] + [f'A{chr(c)}' for c in range(ord('A'), ord('O'))] + ['AR', 'AS', 'AV', 'AW', 'BA', 'BC', 'BD']
    fig('d13_j', 'p34_anterior.xlsx', 'J Tabiques paralelos', 'A2:BB10', ocultar_filas=list(range(4, 8)), ocultar_cols=oc13,
        resaltar=[('O8:O10', FMAL, MAL), ('Q8:Q10', FMAL, MAL), ('AZ8:AZ10', None, BIEN), ('BB8:BB10', None, BIEN)])
    fig('d13_flex_despues', 'p34_anterior.xlsx', 'Flex comp PB paralelos', 'A2:P10', ocultar_filas=list(range(4, 8)), leer=[f'{x}{r}' for r in (8, 9, 10) for x in 'BMOP'],
        cambios=[('B8:B10', lambda f, r: f.replace(f'.O{r}', f'.BB{r}')),
                 ('M8:P10', lambda f, r: f.replace(f'.Q{r}', f'.AZ{r}').replace(f'.O{r}', f'.BB{r}'))],
        resaltar=[('B8:B10', FBIEN, BIEN), ('M8:P10', FBIEN, BIEN), ('J8:J10', None, OJO)])

    # 14. las dudas 1 y 2 juntas, en la flexocompresión de la torre asimétrica
    fig('d14_flex', 'asim_anterior.xlsx', 'Flex comp PB paralelos', 'A2:P9', leer=leerF,
        datos=[('Rototrasl. cara mayor', f'O{r}', f'=G{r}+N{r}*$F$5/$D$5') for r in range(5, 25)],
        cambios=[('O4:P23', cambiar('-H{r}/', '-I{r}/'))],
        resaltar=[('J4:J9', FBIEN, BIEN), ('O4:P9', FBIEN, BIEN)])
    return V


SOLO = set(sys.argv[1:])

if __name__ == '__main__':
    os.makedirs(SAL, exist_ok=True)
    c = Calc()
    try:
        V = figuras(c)
    finally:
        c.cerrar()
    ruta = os.path.join(SAL, 'valores.json')
    viejo = json.load(open(ruta)) if SOLO and os.path.exists(ruta) else {}
    viejo.update(V)
    json.dump(viejo, open(ruta, 'w'), indent=1, ensure_ascii=False)
    print('listo', len(V))
