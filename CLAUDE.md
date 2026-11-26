# Torre 3D: convenciones del proyecto

- **Colores: rojo es tracción y azul es compresión, en toda la app** (diagramas, 3D, exoesqueleto, Excel, láminas).
  Variables `--traccion` y `--compresion` de `src/estilo.css`. Una presión de viento que empuja una cara la comprime
  (azul) y una succión la tracciona (rojo). Lo que no es tracción ni compresión (velocidad, giro del aire, cargas)
  va con otros colores (`--deformada`, `--carga`, `--corte`), nunca con rojo y azul.
  Única excepción, pedida por el usuario: la opción «arcoíris» para la velocidad (`espectroVel` en `src/ui/campoSuave.ts`),
  apagada por defecto; con ella las llaves avisan que el rojo es aire rápido y no tracción.
- Las planillas originales de la cátedra no se cambian: solo aceptan secciones enteras por defecto.
- App y Excel tienen que dar lo mismo (pruebas con el evaluador y verificación con LibreOffice en `tools/`).
- Textos de la interfaz y explicaciones al usuario en español rioplatense.
- Rama de trabajo: la que indique la sesión; nada se une a `main` sin pedido explícito.

## Varias sesiones a la vez

Dos sesiones trabajan sobre esta app en paralelo, cada una en su rama. Para no hacer dos veces lo mismo ni pisarse:

- **Quién hace qué.** Diseño de la torre (planta, losas, perfil, carpintería, envolvente, fachada y panelería), el
  exoesqueleto y los ejemplos con forma (el Citicorp con fachada): rama `alternativa`. Viento y túneles (2D, 3D,
  contexto urbano), métodos de cálculo (Planilla, Guía, CIRSOC, FEM, verificaciones), salidas de entrega (informes,
  PDF, PowerPoint, libros de Excel), tablet y estética general: la otra rama (hoy `claude/ejemplos-cirsoc`). Algo de un
  área ajena se toca solo si hace falta para lo propio, con el cambio más chico posible y dicho en el commit.
- **Archivos que tocan las dos:** `src/engine/exo.ts`, `src/ui/estado.ts`, `src/app.ts`, `src/ui/vista3d.ts`,
  `src/ui/planta.ts`, `src/estilo.css`, `src/xlsx/proyectoTablas.ts`, `src/sync/` y `docs/sheets/Codigo.gs`. En
  ellos, cambios chicos y localizados; nada de reordenar ni reescribir de paso.
- **Antes de empezar algo grande:** `git fetch origin`, mirar `git log HEAD..origin/main` y la rama de la otra sesión,
  y leer la sección «Quién hace qué» de `PENDIENTES.md`. Si el tema ya está en curso allá, no se empieza acá: se le
  suma lo que falte o se espera.
- **Al empezar y al terminar:** anotarlo en «Quién hace qué» de `PENDIENTES.md` (rama y fecha), en el mismo commit.
- **Antes de unir con `main`:** traer `main` a la rama y resolver los conflictos conservando los arreglos de las dos.
  Si las dos ramas resolvieron lo mismo (ya pasó con la memoria y el resolvedor del exo), queda una sola versión y el
  commit de la unión dice cuál y por qué. Recién después: `npx tsc --noEmit`, `npx vitest run`,
  `node tools/revision_punteros.cjs` (mouse, pen y touch, con la app en el puerto 5191) y `npm run build`.

