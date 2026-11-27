# Túneles de viento: pisos abiertos (la plaza del Citicorp)

Pedido del usuario (27/11): que en la simulación de viento del Citicorp los pisos de abajo (la plaza sobre las
supercolumnas, sin carpintería) se simulen con lo construido (núcleo y columnas) y no como un cuadrado lleno.
Relevado en la rama `alternativa` (c1b966e); sin cambios en el código del viento todavía. Es el área de
`claude/ejemplos-cirsoc` (viento y túneles): este texto es el pedido listo para esa sesión.

## Antes de empezar

Leé `CLAUDE.md` y la sección «Quién hace qué» de `PENDIENTES.md`. Si trabajás desde otra rama, hacé el cambio más
chico posible y decilo en el commit. Anotá el inicio y el fin en `PENDIENTES.md` (rama y fecha), en el mismo commit.
Textos de la interfaz en español rioplatense. Colores: rojo es tracción o succión y azul es compresión o empuje; lo
demás va con otros colores.

## Lo que hay hoy

**El ejemplo** (`src/engine/ejemploCiticorpFachada.ts`; en la app, Ejemplos → Citicorp con fachada):

- Debajo del cajón hay un solo nivel de la app: «PB (plaza)», de cota 0 a 34,75 m (índice 49). Los pisos reales 1
  a 7 no son niveles aparte. Arriba sigue «8º–9º (cajón de transición sobre las supercolumnas)», a 34,75 m.
- Tramos de carpintería: `[{desde 0, modo 'sin'}, {desde 34.75, modo 'losa'}, {desde 244.62, modo 'continua'}]`. La
  PB no tiene carpintería propia (`n.carpinteria` vacío).
- Muros: N1 es el núcleo, tubo-rect, hasta 229,82. S1 a S4 son las supercolumnas, tubo-rect, de la fundación a
  34,75. En la PB, `poligonosMuros(p, 49).pols` devuelve 20 rectángulos (4 por tubo-rect).
- El exo (`p.exo`, tipo E) tiene `mastilBase` hasta 34,75. Las barras del exo no entran en `poligonosMuros`; las
  supercolumnas ya están como muros S1 a S4.

**Túnel 2D en planta** (`src/ui/tunel2d.ts`, `iniciar()`, aprox. líneas 170 a 205):

- Toma `pol = puntosAlViento(p, i)` (`src/engine/silueta.ts:126`), que usa `contornoAlViento`
  (`silueta.ts:118`): la carpintería del nivel o, si no hay, la silueta de la losa.
- En la PB del Citicorp da el cuadrado de la losa, y el túnel simula un bloque lleno. Es el «cuadrado negro» que ve
  el usuario. No mira si el tramo es `'sin'`.
- Existe `cfg.forma === 'muros'` («Planta: solo los muros», selector aprox. en la línea 1351). Usa
  `murosDelNivel(i, D)` → `poligonosMuros(p, i, emin)` (`src/engine/murosPlanta.ts:10`): engruesa los tabiques
  finos a 1,2 celdas y usa D ≥ `D_MUROS` = 40 celdas por ancho, unas 4 veces más lento.
- Con esa opción, la PB del Citicorp ya se ve bien: el núcleo y las 4 supercolumnas, con el aire entre ellos.
  Probado en el navegador.
- La nota del modo muros está aprox. en la línea 1247. El mensaje «En X no hay muros…» está en la línea 196.

**Túnel 3D** (`src/ui/tunel3d.ts`, `nivelesProyecto()`, aprox. líneas 129 a 138):

- Ya usa la regla buena: `modo = tramoEn(p, cota)?.modo` (`src/engine/carpinteria.ts:39`). Si `modo === 'sin'` y
  el nivel no tiene carpintería, `piezas = poligonosMuros(p, i).pols`.
- `src/viento/malla3d.ts` (aprox. línea 82) arma un prisma suelto por pieza, con tapa arriba y abajo.
- No se pudo verificar corriendo: el Chromium sin cabeza no tiene WebGPU, y el motor «procesador» es lento.

**Corte vertical o alzado** (`tunel2d.ts`, `iniciarAlzado()`, aprox. línea 207; `src/viento/geometria2d.ts`,
`geometriaAlzado()`, línea 200):

- Cada nivel da `pol = puntosAlViento(p, i)`. De cada `pol` se toma dónde la línea del corte entra y sale
  (`[xmin, xmax]`), y la piel va recta de un nivel al siguiente.
- La PB es el cuadrado de la losa a z = 0 y el 8º–9º está a 34,75, así que la plaza sale como un bloque macizo
  debajo de la torre, sin hueco entre las columnas.

## Propuestas (en orden de costo)

1. **Túnel 2D en planta, automático (chico).**
   - En `iniciar()`: si `cfg.forma === 'dibujada'`, el nivel tiene `tramoEn(p, cota)?.modo === 'sin'` y no tiene
     carpintería propia, usar `murosDelNivel` como en la forma `'muros'`, con el mismo D mínimo.
   - Si ese nivel no tiene muros, seguir con la silueta.
   - Mostrar una nota: «Piso abierto (carpintería “sin”): el viento ve sus muros y columnas, no la losa». Es la misma
     regla del 3D.
   - Cuidar que `claveCorrida` (aprox. línea 149) siga reiniciando bien.
   - «Su caja, con esquinas vivas» y las ochavas no aplican a un piso abierto: no aplicarlas, o avisarlo.
2. **Corte vertical con pisos abiertos (mediano).**
   - En `geometriaAlzado`, para los niveles de tramo `'sin'` sin carpintería, tomar como tramo propio cada muro o
     columna que corta la línea `yc`, en lugar del `[xmin, xmax]` de la losa.
   - Dibujarlos como rectángulos sólidos de la cota de ese nivel a la del de arriba. La racha de la piel arranca
     recién en el primer nivel cerrado (el 8º–9º).
   - En el Citicorp quedarían la supercolumna de barlovento, el núcleo y la de sotavento como barras, con aire entre
     ellas y la torre apoyada arriba.
   - Pasar en `NivelAlzado` un `piezas?: P[][]` (de `poligonosMuros`), igual que en el 3D, y que `tunel2d.ts` lo llene
     con la misma regla del punto 1.
   - Si la línea, corrida con `desplaz`, no cruza ninguna columna, el piso abierto queda todo aire, y está bien.
3. **Túnel 3D.**
   - Verificar con WebGPU que la plaza se ve abierta.
   - Agregar una prueba de que la geometría da piezas en la PB del Citicorp.
   - Opcional, no pedido: rellenar el interior de los tubos cerrados (N1) para el túnel.
4. **Opcional, del ejemplo** (área de `alternativa`; no tocar sin pedido): partir la plaza en más niveles. No hace
   falta para el túnel.

## Pruebas y cierre

- **Pruebas unitarias nuevas:**
  - el corte 2D de la PB del Citicorp da los polígonos de los muros y no la silueta;
  - `geometriaAlzado` con un nivel `'sin'` deja aire entre las columnas;
  - los demás ejemplos no cambian.
- **Capturas con Playwright** (app en el puerto 5191, `deviceScaleFactor` 2), antes y después:
  - Viento → Túnel 2D, corte en la PB del Citicorp con «como está dibujada»;
  - el corte vertical;
  - si se puede, el 3D.
- **Llegar al Túnel 2D en Playwright:**
  - abrir el ejemplo con `document.getElementById('b-ejemplo-citicorp-fachada').click()`;
  - poner `localStorage['torre3d.etapa'] = 'viento'`, recargar y hacer clic en `#subpasos button` con el texto
    «Túnel 2D»;
  - para bajar a PB, poner al mínimo el `input[type=range]` del panel (su valor 0 es PB) y disparar `input` y
    `change`.
- **Antes de commitear:** `npx tsc --noEmit`, `npx vitest run`, `node tools/revision_punteros.cjs` (con la app en el
  puerto 5191) y `npm run build`.
- Commit en la rama de la sesión y push. Nada a `main` sin pedido explícito.
