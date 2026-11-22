# Simulador de viento: diagnóstico y propuestas

Noviembre de 2026. Son propuestas: **no se cambió nada del simulador**. El criterio que manda es que ande en la mayor
cantidad posible de computadoras, empezando por las más modestas.

## 1. Cómo está hoy

| | Túnel 2D | Túnel 3D |
|---|---|---|
| Método | Lattice Boltzmann D2Q9, colisión BGK + Smagorinsky | Lattice Boltzmann D3Q19, BGK + Smagorinsky |
| Dónde corre | procesador, en un *worker* (un núcleo) | placa de video (WebGPU) |
| Qué computadoras | todas | solo las que tienen WebGPU (Chrome/Edge, Safari 26) |
| Geometría | **un** piso: la carpintería o la losa de ese corte | **piso por piso**: cada nivel extruido con su contorno |
| Resolución | 14, 20 o 30 celdas por ancho (≈ 1 m o 0,67 m por celda en 20 m) | celda de ≈ 2,5 / 1,5 / 1,0 m (torre de 64 m) y peor en torres altas |
| Paredes | rebote «a mitad de camino»: la pared queda en escalones de una celda | igual |
| Reynolds | 150, 1 000 o 20 000 (el real es de decenas de millones) | ≈ 5 000 |
| Qué mide | Cd, Cl eficaz, Strouhal, V crítica, tabla para comparar formas | Cp medio de cada cara contra el del reglamento, cortes, líneas de corriente, vereda |
| Guardar resultados | la tabla de anotadas (mientras la página está abierta) | nada |

**Lo que más limita la calidad alrededor de las esquinas y las curvas:**

1. **Paredes en escalones.**
   - Una curva o una diagonal se vuelve una escalera de celdas.
   - La escalera agrega rugosidad que no existe, mueve el punto donde se despega el aire y hace ruidosa la fuerza.
   - Es lo que más se nota en una carpintería curva.
2. **Pocas celdas en el detalle.**
   - Con 1 a 1,5 m por celda, una ochava de 1 m no existe y un radio de 3 m queda en 2 o 3 escalones.
3. **El 3D estira la celda por la altura.**
   - El dominio tiene que contener 1,5 veces la altura de la torre, y con la grilla fija las celdas engordan en
     planta.
   - Justo la planta, piso por piso, es lo que más importa.
4. **Colisión BGK.**
   - Es la más simple y se vuelve inestable con grillas gruesas y Reynolds altos.
   - Obliga a usar más celdas (más computadora) o Reynolds más bajos.

## 2. Propuestas (de más a menos conveniente)

Cada propuesta indica qué mejora, cuánto cuesta en la computadora del usuario y cuánto trabajo lleva.

### P1. Paredes exactas: rebote interpolado (Bouzidi) · 2D y 3D

- **Qué es:** en vez de poner la pared en el medio de la celda, cada enlace que la cruza usa la distancia exacta
  hasta la curva. Esa distancia la tenemos exacta: polígonos, arcos y Bézier del contorno de cada piso.
- **Mejora:**
  - las curvas dejan de ser escaleras: con la misma grilla, el despegue en esquinas redondeadas y en carpinterías
    curvas sale mucho mejor;
  - la fuerza (Cd, Cl) es menos ruidosa;
  - es la mejora de calidad más grande por unidad de esfuerzo.
- **Costo en la computadora:** casi nada (unas cuentas más en las celdas de borde).
- **Trabajo:** medio. Va con P2 (TRT), porque con BGK la pared «se corre» según la viscosidad.

### P2. Colisión más estable: TRT o «regularizada» · 2D y 3D

- **Qué es:** reemplazar BGK por una colisión de dos tiempos de relajación (TRT) o regularizada, manteniendo
  Smagorinsky.
- **Mejora:**
  - aguanta Reynolds más altos con grillas más gruesas sin volverse inestable;
  - deja la pared donde corresponde (con P1);
  - la grilla «rápida» pasa a ser útil, y eso es justo lo que necesita una computadora modesta.
- **Costo:** 5 a 15 % más por paso.
- **Trabajo:** bajo a medio.

### P3. Túnel «piso por piso» (2,5D): todas las siluetas con el 2D · todas las computadoras

- **Qué es:**
  - corre el túnel 2D para **cada planta distinta** de la torre (los pisos iguales se calculan una sola vez), en
    paralelo, un *worker* por núcleo;
  - a cada piso le aplica la velocidad del viento a su altura (perfil del CIRSOC 102-25).
- **Qué da:**
  - Cd, Cl, Strouhal y V crítica **piso por piso** (gráfico en altura);
  - la fuerza de cada nivel según la simulación;
  - el corte y el momento en la base, comparados con la planilla y el CIRSOC;
  - es exactamente «la silueta piso por piso».
- **Costo:** solo procesador. Anda en cualquier computadora; en una modesta tarda unos minutos y muestra el avance.
- **Limitación:** no ve el aire que sube o baja (la punta de la torre y el pie). Por eso es aproximado arriba y
  abajo, cosa que se avisa. Para el resto de la altura es la aproximación clásica de franjas.
- **Trabajo:** medio. El 2D ya existe; falta el reparto en *workers*, el perfil de velocidad y los gráficos.

### P4. Corrida larga con grabación y archivo para reproducir · 3D (y 2D)

- **Qué es:** un botón «Corrida larga».
  - Corre muchos miles de pasos (minutos o la noche entera), con avance y tiempo estimado.
  - Mientras corre, acumula **promedios en el tiempo**: Cp medio, Cp eficaz (rms) y picos de cada cara y cada piso;
    velocidad media en la vereda; espectro de la fuerza lateral.
  - Graba cuadros comprimidos: cortes horizontales en los pisos elegidos, un corte vertical y las líneas de
    corriente. Se guarda en un archivo `.torreviento` (ZIP: datos + metadatos del proyecto, la grilla y el Reynolds).
- **Reproducir:**
  - la app abre ese archivo y lo reproduce con una barra de tiempo;
  - **no hace falta placa de video para mirarlo**: una computadora potente (la del laboratorio o la del docente)
    calcula, y cualquiera mira;
  - también se puede exportar como video WebM.
- **Tamaño estimado** con la grilla liviana: unos 50 KB por cuadro (4 cortes en 8 bits). 600 cuadros ≈ 30 MB antes
  de comprimir. Guardar el campo 3D entero cada cuadro (≈ 0,8 MB) solo conviene para pocos cuadros.
- **Costo:** el de la simulación; la grabación agrega poco.
- **Trabajo:** medio.

### P5. Datos que se extraen (sale casi gratis con P4)

- **Cp a lo largo del perímetro de cada piso**, con los picos de succión en las esquinas. Es lo más útil para
  diseñar la **carpintería**: dónde y cuánto succiona el viento en los vidrios. Al lado se pone la referencia del
  CIRSOC para componentes y revestimientos.
- **Perfil en altura** del Cp de cada cara contra el del reglamento.
- **Fuerza por piso, corte y momento en la base** de la simulación contra la planilla y el CIRSOC.
- **Strouhal y espectro**, con la V crítica de desprendimiento y la n1 de la torre.
- **Viento en la vereda** (confort del peatón, con un criterio tipo Lawson): mapa de zonas.
- **Exportación** a Excel/CSV de todo, para la entrega.

### P6. 3D en más computadoras: WebGL2 de respaldo

- **Qué es:** el mismo cálculo escrito para WebGL2, que tiene casi cualquier computadora desde 2017, incluidas las
  integradas Intel y muchas notebooks sin WebGPU, y Firefox.
- **Mejora:** amplía mucho quién puede usar el 3D. Es la propuesta que más suma a «en más computadoras mejor».
- **Costo:** algo más lento que WebGPU en la misma placa (de 1,5 a 2 veces), pero anda.
- **Trabajo:** medio a alto. Además hace falta manejar el reinicio de la placa (*device lost*), que hoy no se atiende.

### P7. Más resolución donde importa · 3D (y 2D)

1. **Banda de pisos:**
   - un 3D de unos 10 pisos, periódico arriba y abajo, con muchas más celdas en planta (las mismas celdas totales);
   - ve la turbulencia 3D de una zona de la torre con 3 a 4 veces más detalle en planta;
   - trabajo bajo a medio.
2. **Dominio más ajustado:**
   - techo deslizante a 1,3 H en vez de 1,5 H, y menos ancho a los costados;
   - suma 15 a 25 % de celdas en planta sin costo extra.
3. **Refinamiento local:**
   - una grilla el doble de fina solo alrededor de la torre;
   - es la mejora «de libro», pero en 3D es compleja (pasos de tiempo distintos por nivel de grilla);
   - en el 2D es más simple y valdría la pena después de P1 y P2.

### P8. Calidad automática según la computadora

Esto ya está en el informe anterior (`docs/informe_simulador_capacidad.md`):
- una prueba corta elige la grilla y la cantidad de pasos;
- se muestra el tiempo estimado;
- un aviso de resolución dice qué detalle es más chico que la celda;
- se prohíbe solo lo imposible.

## 3. Orden sugerido

| orden | propuesta | por qué primero |
|---|---|---|
| 1 | **P1 + P2** (paredes exactas + colisión estable) | la mayor ganancia de calidad en esquinas y curvas, con costo casi nulo; mejora el 2D y el 3D a la vez |
| 2 | **P3** (piso por piso con el 2D) | da la información que más importa (cada silueta) en **todas** las computadoras |
| 3 | **P4 + P5** (corrida larga, archivo, datos) | resultados estables y reproducibles; mirar sin placa |
| 4 | **P6** (WebGL2) | lleva el 3D a muchas más computadoras |
| 5 | **P7** (banda de pisos, dominio, refinamiento) | más detalle donde la grilla no alcanza |

## 4. Límites que no cambian

- **Reynolds:** cualquier simulador de navegador trabaja con Reynolds miles de veces más bajos que el real. Con
  aristas vivas casi no importa. Con esquinas redondeadas o carpinterías curvas sí: el resultado muestra la
  **tendencia** (qué forma es mejor), no el número final. Lo correcto es decirlo en pantalla cada vez.
- **No reemplaza al CIRSOC ni a un ensayo:** sirve para comparar formas y entender el flujo. El cálculo de la torre
  sigue con los coeficientes del reglamento.
- **Validación:** conviene sumar casos de prueba conocidos y mostrar cuánto se acerca el simulador:
  - cilindro cuadrado: Cd ≈ 2,1 y St ≈ 0,13;
  - cilindro circular;
  - el edificio patrón CAARC.

  Con P1 y P2 esos números deberían mejorar con la misma grilla.
