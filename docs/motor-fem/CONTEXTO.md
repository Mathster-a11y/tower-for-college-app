# Rama `motor-fem`: motores de cálculo nuevos para comparar con la planilla

Documento de arranque para una sesión nueva de Claude Code en la rama `motor-fem`. Junta lo que se investigó y se
decidió el 16/11/2026. Estado al 17/11/2026: el paso 1 está hecho (verificadores en `tools/motor_fem/` y prueba de oro
en `test/motorFem.test.ts`); el motor pseudo-3D (paso 2) todavía no.

> **Cómo usarlo en la sesión nueva:** leer este archivo entero, después `README.md` y `PENDIENTES.md`, y responder
> con el usuario las preguntas abiertas (sección 9) antes de escribir código.

---

## 1. Objetivo

- **No reemplazar** los motores actuales. Hay que **sumar columnas a una tabla comparativa de motores** y tener más
  factores de verificación de los resultados.
- Los motores nuevos tienen que servir para **torres de tabiques de hormigón** y, después, para **sistemas
  estructurales de acero** (pórticos, arriostrados, tubo, diagrid, el exoesqueleto que ya tiene la app).
- Cada resultado nuevo se tiene que poder **comparar y verificar** contra los métodos actuales y contra motores externos
  independientes.

## 2. Reglas del proyecto (siguen valiendo)

1. **La planilla de la cátedra no se toca.** Es el sistema matemático con el que se enseña. La app la replica tal cual
   (motores «Actual» y «Planilla 2025») y, aparte, muestra cálculos propios.
2. Solo CIRSOC 102-2005 para el viento. Unidades: m, t, tm, t/m², kg/cm², m⁴.
3. Todo cambio se verifica: pruebas automáticas (`npm test`) y comparación con LibreOffice o con motores externos.
4. La interfaz y los textos están en castellano rioplatense (voseo).
5. Copyright: no copiar código de programas comerciales ni de licencias incompatibles (ver la sección 4). De los
   comerciales solo se toman ideas de su documentación pública.

## 3. Estado de la app al crear la rama (rama `main`, commit 708b252)

- **Dos motores que replican planillas** (botón «Motor»):
  - «Actual» replica `src/assets/planilla_virgen.xlsx`.
  - «Planilla 2025» replica `src/assets/planilla_catedra_2025.xlsx` (EDIFICIO_TORRE_1 de la cátedra). Agrega filas si
    hay más de 20 piezas por viento.
  - Los dos están verificados celda por celda con LibreOffice (`tools/verificar_motor_nuevo.ts` +
    `tools/comparar_motor_nuevo.py`; `tools/escribir_prueba.ts` + `tools/comparar_libreoffice.py`).
- **Dos métodos de armado de piezas** (botón «Cambiar a método planilla»): el de la app y el método simplificado de la
  cátedra (sección 7 de la especificación).
- **Valores «Guía/CIRSOC»** (correcciones de la app): están apagados por defecto.
- **Modo de cálculo «En vivo» / «Con botón»** (F9).
- **Solver propio que ya existe y conviene reusar:** `src/engine/exo.ts`.
  - Método directo de la rigidez para pórticos planos (3 gdl por nudo).
  - Condensación estática (`condensar`, `condensarCara`).
  - Eliminación de Gauss con pivoteo (`resolver`).
  - Rigidez lateral de los tabiques como ménsula (`rigidezTabiques`).
  - Ya se comparó con un solver externo (`tools/comparar_solver/`).
- **Archivos clave del motor:**
  - `src/engine/planilla.ts`: fórmulas de la planilla.
  - `src/engine/mapping.ts`: de los muros a las filas de las hojas J (`aPlanilla`, `perfilPlanilla`, `Jreal`).
  - `src/engine/correcciones.ts`: valores Guía/CIRSOC y la rotación muro por muro.
  - `src/engine/verificaciones.ts`: los controles.
  - `src/engine/config.ts`: motor y método activos.
  - `src/ui/estado.ts`: `calcularProyecto`.

## 4. Herramientas investigadas: ventajas, desventajas y licencia

| Herramienta | Tipo · licencia | Ventajas | Desventajas | Uso propuesto |
|---|---|---|---|---|
| **OpenSees / OpenSeesPy** (`pip install openseespy`, v3.8) | C++/Python · **gratis para investigación, educación y uso interno**; la redistribución comercial dentro de una app requiere licencia (LICENSE.md del paquete) | Referencia académica mundial; elementos de Timoshenko, cáscaras (ShellMITC4, LayeredShell); muros no lineales (MVLEM, SFI-MVLEM); diafragma rígido (`rigidDiaphragm`); modal | No corre en el navegador (no hay versión WebAssembly conocida); no se puede incluir en la app | **Verificador externo** (scripts en `tools/`), como el de LibreOffice |
| **Pynite** (`pip install PyniteFEA`, v3.2.1) | Python · **MIT** | Simple, legible, pórticos 3D, P-Δ, liberaciones de extremo; se puede estudiar y portar con atribución | Solo barras Euler-Bernoulli (sin corte); no tiene restricción de diafragma (hay que simularla, ver la sección 5) | **Segundo verificador**, independiente de OpenSees; fuente de ideas para el motor de barras 3D |
| **Frame3DD** | C · **GPL v3** | Pórticos 2D y 3D, análisis modal con masas concentradas, geometría no lineal | GPL: no se puede mezclar su código con la app; el sitio está detrás de Cloudflare | Verificador por línea de comandos, opcional |
| **Stabileo** (lambdaclass) | Rust compilado a WebAssembly · **AGPL-3.0** | Corre en el navegador: estático, 2.º orden, pandeo, modal, espectro, historia temporal | AGPL: no copiar código | Solo idea de arquitectura (un solver en WebAssembly) |
| **awatif / awatif-fem** (npm 2.0.13) | TypeScript · **sin licencia declarada** en el paquete npm (= todos los derechos reservados), viene compilado y depende de jwt-decode | Hecho para apps web de estructuras | Licencia incierta; solo análisis estático | **Descartado** |
| **edubeam** | TypeScript/Vue · libre | Interfaz didáctica de vigas, reticulados y pórticos 2D | Solo 2D | Ideas de interfaz |
| **buckle** | React + TypeScript + OpenSeesPy en un servidor | Ejemplo de interfaz web conectada con OpenSees | Necesita servidor | Idea de arquitectura |
| **FEAScript** | JavaScript · libre | Elementos finitos en el navegador | Por ahora solo calor; nada estructural | No sirve hoy |
| **ETABS / SAP2000** (CSI) | Comercial | Estándar de edificios: *piers* y *spandrels*, diafragma rígido, semirrígido o flexible, variantes automáticas de viento con excentricidad, deriva por piso, modal | Pago; no se puede ver ni copiar código | Ideas de su documentación pública; casos de comparación si la facultad tiene licencia |
| **RFEM / RSTAB** (Dlubal), **Robot** (Autodesk), **Tekla Structural Designer**, **Midas Gen**, **STAAD.Pro** | Comerciales | Elementos finitos completos de placas y cáscaras, dimensionado | Pago | Ídem |
| **CYPECAD** | Comercial | Trae normas argentinas: CIRSOC 201-1982 y 2005, viento CIRSOC 102-1984 | Pago; viento con la versión de 1984 | Referencia local si hay licencia |
| **SkyCiv** | Comercial, web | Placas Mindlin, mallado estructurado o libre, API | Pago; no se encontró documentación de torres | Ideas de interfaz de mallado |

Desde la sesión anterior **no se pudieron sacar capturas** de esos sitios: la red del contenedor los bloquea. En su
lugar se corrieron los motores libres (sección 5). Si la sesión nueva tiene red, se pueden sacar capturas para uso
interno, sin redistribuirlas en la app.

**Novedad normativa:** el proyecto **CIRSOC 102-24** estuvo en discusión pública (junio–diciembre de 2024). Conviene
seguir si se aprueba.

## 5. Prototipo y resultados (ya verificados)

El prototipo pasó a `tools/motor_fem/` (paso 1 del plan, hecho el 17/11/2026):

- `src/engine/femEntrada.ts`: `entradaFem(proyecto, viento)` arma la entrada común de los motores nuevos: fuerzas de
  cada piso de la planilla (H de M,NyQ para el viento A, D·F·G para el B), piezas paralelas (J de la hoja, posición,
  área, área de corte de las almas, cotas desde y hasta), perpendiculares (para la torsión) y el reparto de la
  planilla. Ejes locales iguales para los dos vientos: x perpendicular al viento, y en la dirección del viento.
- `tools/motor_fem/casos.ts`: los casos de comparación (guía, anexo y planta34, vientos A y B).
- `tools/motor_fem/exportar.ts`: escribe `test/fixtures/motor_fem/<caso>.entrada.json`.
- `tools/motor_fem/opensees_torre.py`: cada pieza es una ménsula vertical (`elasticBeamColumn` o
  `ElasticTimoshenkoBeam`), con `rigidDiaphragm` en cada piso. Respeta la cota hasta donde llega cada pieza.
- `tools/motor_fem/pynite_torre.py`: el mismo modelo en Pynite, con brazos rígidos **articulados en el muro**. Dos
  arreglos para que Pynite no dé resultados falsos: las piezas que caen en el mismo punto de la planta se separan en la
  coordenada que no influye, y el nudo central va corrido del eje (con un momento que lleva la fuerza a x = 0).
- `tools/motor_fem/verificar.py`: resuelve todos los casos, guarda `<caso>.resultados.json` y muestra la tabla.
- `tools/motor_fem/grafico.py`: arma `docs/motor-fem/comparacion_motores.png`.
- `test/motorFem.test.ts`: **la prueba de oro** y los controles cruzados, con los resultados guardados (`npm test` no
  necesita Python).

Para volver a correrlo (desde la raíz del repo):

```bash
python3 -m venv /tmp/venv && /tmp/venv/bin/pip install openseespy PyniteFEA matplotlib
npx vite-node tools/motor_fem/exportar.ts
/tmp/venv/bin/python tools/motor_fem/verificar.py
/tmp/venv/bin/python tools/motor_fem/grafico.py
```

### Resultados: % del corte en la base de cada pieza, viento A

| Caso · motor | T1 | T2 | T3 | T4 | T5 | T6 |
|---|---|---|---|---|---|---|
| **Guía** · planilla (J) | 6,88 | 6,88 | 6,88 | 6,88 | 36,25 | 36,25 |
| · OpenSees, Euler | 6,88 | 6,88 | 6,88 | 6,88 | 36,25 | 36,25 |
| · Pynite, Euler | 6,83 | 6,83 | 6,83 | 6,83 | 36,35 | 36,35 |
| · OpenSees, Timoshenko | 13,13 | 13,13 | 13,13 | 13,13 | 23,74 | 23,74 |
| **Anexo** (T5 aislado) · planilla (J + rotación) | 14,84 | 6,83 | 14,84 | 6,83 | 9,43 | 47,23 |
| · OpenSees, Euler | 14,84 | 6,83 | 14,84 | 6,83 | 9,43 | 47,23 |
| · Pynite, Euler | 14,76 | 6,77 | 14,76 | 6,77 | 9,59 | 47,35 |
| · OpenSees, Timoshenko | 16,30 | 13,89 | 16,30 | 13,89 | 12,30 | 27,32 |

Flecha en la azotea con Euler: OpenSees 0,062625 m y Pynite 0,062625 m. Giro del anexo: −0,003681 rad en los dos.
Con Timoshenko la flecha sube solo un 2 % (0,06379 m).

**Conclusiones:**

1. **La planilla (rototraslación) es exacta** para su hipótesis: ménsulas de flexión pura (Euler), todas de altura
   completa, con losa rígida. Coincide con OpenSees hasta el segundo decimal, rotación incluida. Esto es la **prueba de
   oro** del motor nuevo: en modo Euler y con muros de altura completa tiene que dar igual que la planilla.
2. **La deformación por corte cambia mucho el corte en la base** (las U pasan de 36 % a 24 %). Cerca de la base, la
   deriva de cada piso la manda la rigidez al corte G·A del alma, no el J. La flecha y los momentos casi no cambian. Es
   el factor de verificación nuevo más importante, y la planilla no lo puede ver.
3. Pynite difiere de OpenSees en menos del 1 %, porque los brazos no son infinitamente rígidos.
4. **Hallazgo del paso 1 (planta34, viento B):** la hoja «cara menor» de la planilla original suma B51 e I51 solo hasta
   la fila 38. Con más de 8 perpendiculares, el centro de las perpendiculares (J38) sale corrido: en planta34 da 0 m en
   lugar de 1,74 m. La rotación cambia hasta 0,025 puntos de %. La app lo replica tal cual (la planilla no se toca).
5. Pynite da la misma flecha que OpenSees (diferencia menor que 1e-6 m) en los seis casos.
6. **Aclaración:** el corte total del modelo de elementos finitos (125,81 t) no incluye el viento de la franja de PB,
   que en la planilla sí suma (129,55 t). Por eso se comparan porcentajes.

## 6. Motores propuestos (de más simple a más completo)

### A. Pseudo-3D con diafragma rígido (**recomendado para empezar**), en TypeScript y en el navegador

- 3 grados de libertad por piso (ux, uy, θz). Cada pieza es una ménsula en su dirección, Euler o Timoshenko,
  condensada a rigidez lateral por piso. Existe solo entre su `zDesde` y su `zHasta`, cosa que la planilla ignora.
  Las piezas se ensamblan con su posición en planta. Es el modelo de las primeras versiones de ETABS (TABS, Wilson).
- **Ventajas:**
  - Reusa el solver de `exo.ts`.
  - Matrices chicas (3 × número de pisos), instantáneo.
  - Valida contra la planilla con la prueba de oro.
  - Agrega deformación por corte, muros que no llegan arriba, reparto en altura (no un % constante), deriva por piso
    y giro de planta.
  - Integra el exoesqueleto, que ya se condensa a rigidez lateral.
- **Desventajas:** no modela dinteles, muros acoplados, pórticos 3D generales ni P-Δ.
- Prueba externa: los verificadores de la sección 5 (OpenSees y Pynite) y, para casos elegidos, Robot.

### B. Análisis modal (sobre A)

- Masas de las losas (peso de M,NyQ ÷ g) e inercia rotacional por piso. Autovalores por Jacobi (matrices chicas).
- Da el período T₁ y la frecuencia F₁. Responde la pregunta pendiente de los **edificios flexibles (F < 1 Hz, Gf del
  CIRSOC 102 art. 5.8.2)** y la compara con la fórmula de la guía T = 0,08·h/√L·√(h/(L+h)).
- Verificar con OpenSees (`eigen`) o con Frame3DD.

### C. Pórtico 3D de barras (columna ancha con brazos rígidos), en TypeScript

- Cada muro es una columna en su baricentro, con brazos rígidos a los bordes. Incluye dinteles o vigas de acople,
  pórticos y arriostramientos de acero, el exoesqueleto en 3D y P-Δ. Se pueden portar ideas de Pynite (MIT), con
  atribución.
- **Ventajas:** cubre los sistemas de acero y los muros acoplados; es el puente hacia CIRSOC 301 (ya existe la
  verificación de barras del exo).
- **Desventajas:** más trabajo; la analogía de columna ancha tiene errores conocidos en la deformación por corte
  (Stafford Smith y Girgis, 1986), así que hay que calibrarla.

### D. Elementos finitos de membrana o cáscara para muros con aberturas (más adelante)

- Cuadriláteros de tensión plana por paño, con las aberturas que ya modela la app (`aberturas.ts`).
- **Ventajas:** lo más preciso en régimen elástico.
- **Desventajas:** pesado; mallado; difícil de explicar en clase. Verificar con OpenSees ShellMITC4.

### Opcional: métodos manuales clásicos

- Método continuo de Stafford Smith y Coull para muros acoplados: sirve para la parte didáctica y como verificación
  manual.

## 7. Ideas de interfaz tomadas de los programas

- **Tabla «Comparar motores»:** una fila por control (corte y momento de cada pieza en la base, flecha, deriva máxima,
  giro, eje de inercia, período). Las columnas son planilla anterior, planilla 2025, Guía/CIRSOC, pseudo-3D Euler,
  pseudo-3D Timoshenko, pórtico 3D… Cada columna muestra la diferencia en % y un semáforo.
- **Gráficos en altura:** % del corte y del momento de cada pieza piso por piso, por motor.
- **Deriva por piso** contra h/500 (como ETABS).
- **Variantes de viento con excentricidad** (torsión de la Fig. 9 del CIRSOC 102, pendiente con la cátedra).
- **Piezas como *piers*** de ETABS, con su nombre en todas las tablas.

## 8. Plan de trabajo sugerido para la rama

1. ✅ (17/11/2026) Pasar el prototipo a `tools/` (verificadores con OpenSeesPy y Pynite que lean un JSON exportado por la app) y fijar
   la prueba de oro en `test/` (motor A en modo Euler = planilla).
2. `src/engine/pseudo3d.ts`: el motor A, con pruebas contra la planilla y contra los resultados de la sección 5.
3. Análisis modal (motor B).
4. Interfaz: etapa o pestaña «Motores» con la tabla comparativa y los gráficos; selector de opciones (Euler o
   Timoshenko, inercia fisurada).
5. Motor C para acero y muros acoplados.
6. Motor D, si hace falta.

Después de cada paso: `npm test`, verificador externo, capturas para el usuario, commit y push en `motor-fem`.

## 9. Preguntas abiertas para el usuario (hacerlas antes de programar)

1. ¿Arrancamos por el motor pseudo-3D (recomendado) o directo por el pórtico 3D, por los sistemas de acero?
2. ¿La deformación por corte va siempre como columna aparte? ¿Agregamos inercia fisurada como opción? ¿Con qué factor?
   (Referencia: CIRSOC 103 Parte III da Ie = 0,40·Ig para mampostería; para hormigón suele usarse 0,5 a 0,7·Ig.)
3. ¿Los motores nuevos usan las fuerzas de cada piso de la planilla, para comparar solo el reparto? (recomendado) ¿O
   también recalculan el viento?
4. ¿La facultad tiene licencias de ETABS, RFEM, Robot o CYPECAD para armar casos de comparación?
5. ¿Qué sistemas de acero van primero: pórticos rígidos, arriostrados, tubo o diagrid?

## 10. Fuentes

- OpenSeesPy, MVLEM: https://openseespydoc.readthedocs.io/en/latest/src/MVLEM.html
- OpenSees wiki, MVLEM: https://opensees.berkeley.edu/wiki/index.php/MVLEM_-_Multiple-Vertical-Line-Element-Model_for_RC_Walls
- OpenSees wiki, SFI-MVLEM: https://opensees.berkeley.edu/wiki/index.php/SFI_MVLEM_-_Cyclic_Shear-Flexure_Interaction_Model_for_RC_Walls
- Pynite: https://github.com/JWock82/Pynite · https://pypi.org/project/PyNiteFEA
- Frame3DD: https://frame3dd.sourceforge.net/ · pyFrame3DD (WISDEM): https://wisdem.readthedocs.io/en/latest/wisdem/pyframe3dd/index.html
- Stabileo: https://github.com/lambdaclass/stabileo/wiki
- awatif: https://github.com/madil4/awatif · https://npmjs.com/package/awatif-fem
- edubeam: https://awesome.ecosyste.ms/projects/github.com%2Fjanvorisek%2Fedubeam · buckle: https://github.com/igor-barcelos/buckle · FEAScript: https://github.com/feascript/feascript-core
- ETABS, hormigón multipiso (CSI): https://wiki.csiamerica.com/download/attachments/13404260/etabs-multistory-concrete.pdf?api=v2
- Tesis Penn State, muros con diafragma rígido en ETABS: https://www.engr.psu.edu/ae/thesis/portfolios/2008/jte132/Tech%203%20Ergas-Jeremiah.pdf
- SkyCiv: https://skyciv.com/docs/structural-3d/modelling/meshing-your-plate/ · https://skyciv.com/skyciv-structural-features/
- CYPE, normas en la licencia: https://www.coavalladolid.com/wp-content/uploads/2023/09/CYPE-Software-Licencia-170947-.pdf · Manual de CYPECAD: https://downloads2.cype.com/documentos_es/manuales/ccadmc01.pdf
- Proyecto CIRSOC 102-24: https://www.inti.gob.ar/assets/uploads/files/cirsoc/04-Reglamentos-en-discusion-publica-nacional/Proyecto-CIRSOC-102-24-Discusion-Publica-Nacional.pdf
- Analogía de pórtico para muros (ASCE, 1984): https://ascelibrary.com/doi/10.1061/%28ASCE%290733-9445%281984%29110%3A11%282655%29
- Método continuo (Stafford Smith y Coull; tesis Khachatoorian, 1984): https://theses.gla.ac.uk/2952/1/1984Khachatoorianphd.pdf

## 11. Respuestas del usuario (16/11/2026)

| Pregunta | Decisión |
|---|---|
| 1 · Primer motor | **Pseudo-3D con diafragma rígido (motor A)** |
| 2 · Corte e inercia fisurada | Euler y Timoshenko como **columnas aparte**; **inercia fisurada opcional**, con un factor que se elige |
| 3 · Fuerzas de cada piso | **Las de la planilla** (Wi de M,NyQ): se compara solo el reparto |
| 4 · Licencias de ETABS, RFEM, Robot o CYPECAD | la facultad no tiene; **el usuario tiene Robot** (Autodesk Robot Structural Analysis): se arman casos para que los corra y se comparan sus resultados |
| 5 · Sistemas de acero primero | **pórticos rígidos, tubo y diagrid** (los arriostrados, después) |

Rama de trabajo: `claude/nice-ptolemy-xvgp8n`. Junta `motor-fem` con el último trabajo de la app (tablas de Muros,
planta sin superposiciones, armado de piezas). Se sigue el plan de la sección 8 desde el paso 1.


## 12. Más casos y contraste desde la app (27/11/2026)

- `tools/motor_fem/casos.ts` suma cuatro torres de prueba: P4 (asimétrica), P5 (muros que terminan antes de la azotea:
  ahí no hay prueba de oro, la planilla no vale), P6 (redonda, núcleo cajón y columnas circulares) y P8 (subsuelos).
  `verificar.py` guarda además `src/engine/contraste_resumen.json`, que la app muestra en la etapa FEM
  («Contrastado con otros programas»).
- **Hallazgo:** el área de corte de un núcleo cajón o de un tubo circular salía mal (un solo elemento con dirección «Y»:
  0 en el viento B, una sola cara en el A). Ahora sale por tipo (`areaCorte` en `femEntrada.ts`): las dos almas del
  cajón, la mitad del área del tubo. Cambia el FEM con Timoshenko en las torres con esos elementos.
- Pynite difiere de OpenSees hasta 1,1 puntos en un núcleo que toma el 65 % (P8) y hasta 1,9 con muros que terminan
  antes (P5): sus brazos de losa no son infinitamente rígidos. Las tolerancias de `test/motorFem.test.ts` lo dicen.
- La app baja «Contraste con Pynite (.py)» (Exportar, o el botón de la etapa FEM): la torre del proyecto en base64, el
  mismo `pynite_torre.py` y la comparación con la planilla y el motor de la app. Se corre en Google Colab.
