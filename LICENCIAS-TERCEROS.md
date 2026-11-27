# Programas y letras de terceros

Torre 3D lleva adentro estas bibliotecas y letras. Cada una tiene su licencia; el texto completo está en el sitio de
cada proyecto y en `node_modules/<paquete>/LICENSE` al instalar las dependencias.

| Qué | Para qué la usa la app | Versión | Licencia | Sitio |
|---|---|---|---|---|
| three.js | axonometría, 3D y túneles de viento 3D | 0.170.0 | MIT | https://threejs.org/ |
| pdf.js (pdfjs-dist, Mozilla) | calcar planos en PDF | 4.10.38 | Apache 2.0 | https://mozilla.github.io/pdf.js/ |
| PptxGenJS | presentaciones en PowerPoint | 3.12.0 | MIT | https://gitbrent.github.io/PptxGenJS/ |
| JSZip | Excel y archivos .zip | 3.10.1 | MIT o GPL 3 (se usa con la MIT) | https://stuk.github.io/jszip/ |
| IBM Plex Sans (@fontsource/ibm-plex-sans) | letra del texto | 5.2.5 | SIL Open Font License 1.1 | https://github.com/IBM/plex |
| IBM Plex Math (@ibm/plex-math) | letra de las fórmulas | 1.1.0 | SIL Open Font License 1.1 | https://github.com/IBM/plex |
| JetBrains Mono (@fontsource/jetbrains-mono) | letra de los números | 5.2.5 | SIL Open Font License 1.1 | https://www.jetbrains.com/lp/mono/ |

pdf.js se distribuye con la licencia Apache 2.0: http://www.apache.org/licenses/LICENSE-2.0

Para verificar el motor de cálculo, fuera de la app:

- **OpenSees** (Universidad de California, Berkeley): solo en las pruebas (`tools/motor_fem`); no se distribuye.
- **Pynite** (licencia MIT): lo usan las pruebas y el archivo «Contraste con Pynite» que baja la app, que se corre en la
  computadora del alumno o en Google Colab.
