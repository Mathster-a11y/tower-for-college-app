import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { correrFormula, escribirCelda, leerCelda } from '../src/xlsx/xml';
import { escribirPlanilla, leerPlanilla } from '../src/xlsx/planilla';
import { ejemploGuia } from '../src/engine/modelo';
import { aPlanilla } from '../src/engine/mapping';
import { calcularPlanilla } from '../src/engine/planilla';

describe('XML de hojas', () => {
  it('corre referencias relativas y respeta las absolutas, hojas y funciones', () => {
    expect(correrFormula('+B16+3', 1, 0)).toBe('+B17+3');
    expect(correrFormula("'M,NyQ'!I55*$B$2+POWER(C5,2)", 2, 1)).toBe("'M,NyQ'!J57*$B$2+POWER(D7,2)");
    expect(correrFormula('viento!S5', 1, 0)).toBe('viento!S6');
    expect(correrFormula('LOG10(A1)', 1, 0)).toBe('LOG10(A2)');
  });
  it('al pisar la celda madre de una fórmula compartida, las hijas quedan con su fórmula', () => {
    const xml = '<sheetData><row r="5"><c r="E5" s="1" t="str"><f t="shared" ref="E5:F5" si="1">+E4</f><v>0</v></c><c r="F5" s="1"><f t="shared" si="1"/><v>0</v></c></row></sheetData>';
    const out = escribirCelda(xml, 'E5', { num: 40 });
    expect(out).toContain('<c r="E5" s="1"><v>40</v></c>');
    expect(out).toContain('<c r="F5" s="1"><f>+F4</f>');
    expect(out).not.toContain('si="1"');
  });
  it('crea filas y celdas que no existen, en orden', () => {
    const xml = '<sheetData><row r="2"><c r="A2"/><c r="C2"/></row></sheetData>';
    const out = escribirCelda(escribirCelda(xml, 'B2', { num: 1 }), 'A1', { str: 'x' });
    expect(out).toBe('<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>x</t></is></c></row><row r="2"><c r="A2"/><c r="B2"><v>1</v></c><c r="C2"/></row></sheetData>');
    expect(leerCelda(out, 'B2', [])).toBe(1);
  });
});

describe('planilla completa', () => {
  it('escribe el ejemplo y lo vuelve a leer desde la hoja T3D', async () => {
    const p = ejemploGuia();
    const a = aPlanilla(p);
    const bytes = await escribirPlanilla(readFileSync(new URL('../public/planilla_virgen.xlsx', import.meta.url)), a.datos, calcularPlanilla(a.datos), p);
    const leido = await leerPlanilla(bytes);
    expect(leido.proyecto?.muros.length).toBe(10);
    expect(leido.sitio.V).toBe(48);
    expect(leido.cotas[29]).toBe(64);
    const zip = await JSZip.loadAsync(bytes);
    expect(await zip.file('xl/workbook.xml')!.async('string')).toContain('fullCalcOnLoad="1"');
  });
});
