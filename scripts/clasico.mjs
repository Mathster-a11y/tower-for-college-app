// La copia de un solo archivo (dist-unico/index.html) con el programa como script clásico al final del <body>:
// así arranca también en los visores de HTML de Android y WebViews viejos que no corren <script type="module">.
import { readFileSync, writeFileSync } from 'node:fs';
const ruta = process.argv[2] ?? 'dist-unico/index.html';
let h = readFileSync(ruta, 'utf8');
const marca = '<script type="module" crossorigin>';
const ini = h.indexOf(marca);
if (ini < 0) { console.log('sin script módulo: nada que cambiar'); process.exit(0); }
const fin = h.indexOf('</script>', ini) + '</script>'.length;
const codigo = h.slice(ini + marca.length, fin - '</script>'.length);
if (/\bimport\.meta\b/.test(codigo)) { console.error('el programa todavía usa import.meta: no puede ir como script clásico'); process.exit(1); }
h = h.slice(0, ini) + h.slice(fin);
const cierre = h.lastIndexOf('</body>');
h = h.slice(0, cierre) + '<script>' + codigo + '</script>\n' + h.slice(cierre);
writeFileSync(ruta, h);
console.log('script clásico al final del body:', (codigo.length / 1e6).toFixed(2), 'MB');
