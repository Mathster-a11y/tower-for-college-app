// Escribe el reporte FEM de la torre de la guía (para revisarlo a mano o en LibreOffice).
// Uso: npx vite-node tools/escribir_reporte_fem.ts salida.xlsx
import { writeFileSync } from 'node:fs';
import { ejemploGuia, type Proyecto } from '../src/engine/modelo';
import { calcularProyecto } from '../src/ui/estado';
import { datosGuia } from '../src/engine/metodos/guiaPasos';
import { reporteFem } from '../src/xlsx/libros/reporteFem';

const p: Proyecto = { ...ejemploGuia(), calculo: { metodo: 'fem' } };
const c = calcularProyecto(p);
const libro = reporteFem({ p, fem: c.fem!, verif: c.cirsoc!.verif, controles: c.controles, rects: datosGuia(p, c.asig.piezas).rects, teoria: 'timoshenko', limiteDeriva: 500 });
writeFileSync(process.argv[2] ?? 'reporte_fem.xlsx', await libro.xlsx());
