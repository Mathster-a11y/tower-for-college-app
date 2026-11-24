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
