# Leeza SOHO (Zaha Hadid Architects, Pekín, 2019): relevamiento

Base para armar el ejemplo de la Leeza SOHO en la app, con el mismo procedimiento que el núcleo del Gherkin
(`docs/gherkin-nucleo/`). **Etapa 1: todavía no se tocó la app.** Primero se junta, se mide y se revisa con el usuario.

## Fuentes

- **Láminas de ZHA** (publicadas con el proyecto, pasadas por el usuario el 28/11): cortes A-A y B-B con la tabla de
  niveles y escala gráfica; planta de sitio y de PB con escala; plantas de detalle de PB, del 2º (+4,10) y del 10º
  (+37,70); diagramas de masa, losas, columnas, estructura y fachada explotada. **No se suben al repositorio** (son de
  ZHA): acá quedan solo las medidas y los dibujos propios hechos con ellas.
- **Públicas:** [Wikipedia](https://en.wikipedia.org/wiki/Leeza_SOHO), [Bollinger + Grohmann](https://www.bollinger-grohmann.com/en.projects.leeza-soho.html)
  (ingeniería estructural, con la Academia China de Investigación de la Construcción), [Architectural Record](https://www.architecturalrecord.com/articles/14408-leeza-soho-tower-by-zaha-hadid-architects),
  [Dezeen](https://www.dezeen.com/2019/11/20/leeza-soho-zaha-hadid-architects-skyscraper-beijing/),
  [constructsteel](https://constructsteel.org/steel-projects/case-study-leeza-soho/), [World Construction Network](https://www.worldconstructionnetwork.com/projects/leeza-soho-mixed-use-tower-beijing/),
  y en chino: [土木在线 (sismo)](https://bbs.co188.com/thread-9281976-1-1.html), [建筑技艺 (consultor estructural)](http://www.atd.com.cn/Print.aspx?id=7016),
  [双圆监理 (supervisión de obra)](http://www.syjl.com/news/312?cid=9), [知乎](https://zhuanlan.zhihu.com/p/94161469).
  Ninguna fuente pública da medidas de la planta, diámetros de columnas ni espesores: salen de las láminas.

## Lo que dicen las fuentes

- **Altura:** piel hasta +199,97 / +199,99 m, techo del 46º (sala de máquinas) +190,50 m, helipuerto +207,00 m. Altura
  estructural 191,5 m (fuente china). 45 pisos sobre PB y 4 subsuelos (B4 a −19,30 m).
- **Partido:** un cilindro elíptico partido al medio por un atrio de unos 194 m (el más alto del mundo). El corte sigue
  el túnel de servicio del subte que cruza el terreno, y el atrio **gira unos 45°** de abajo arriba para alinear los pisos
  altos con la calle Lize.
- **Estructura:** dos medias torres antisimétricas; cada una es un **núcleo de hormigón armado** («dos ojos» o
  «dos carozos») más un **pórtico curvo de un solo lado** con **columnas de tubo de acero relleno de hormigón,
  inclinadas** (siguen la panza de la torre). Una sola media torre no es estable (vuelco y torsión por el voladizo):
  trabajan juntas gracias a **4 anillos-cinturón de acero** (腰桁架) y puentes de 9 a 38 m de luz sobre el atrio, en los
  pisos de refugio e instalaciones **13, 24, 35 y 45**. Losas compuestas (chapa colaborante y hormigón). La torre supera
  los 150 m que el código chino admite para pórtico de tubos rellenos + núcleo: se aprobó como «superalta» con revisión
  especial. Acero estructural: 18 000 a 24 000 t según la fuente.
- **Columnas:** según la supervisión de obra, el pórtico exterior tiene **34 columnas de B2 al 14º**; hay además
  «columnas del atrio» con curvatura 3D (diagrama de columnas de ZHA).

## Cómo se midió

1. **Cortes:** cada triángulo de nivel de la tabla se detectó y se ajustó con su cota: 5,92 px/m, los 52 niveles con
   menos de 0,4 px de error (≈ 7 cm). En cada piso se midió el ancho exterior de la piel a 1,5 m sobre la losa.
2. **Plantas:** la de sitio tiene escala (6,889 px/m). La de detalle de PB se registró sobre ella por coincidencia de
   dibujo (49 puntos, giro 0,08°): 9,36 px/m. Las del 2º y del 10º se registraron sobre la de PB **usando solo los muros
   negros de los núcleos**: calzan enteros, así que los núcleos son iguales y verticales al menos hasta el 10º.
3. **Columnas:** círculos grises llenos, detectados y llevados al mismo marco (metros, origen en el eje de la torre); a
   cada anillo se le ajustó una elipse descartando lo que no cae en ella.

## Lo medido (etapa 1)

![anillos y perfil](progreso_1_anillos_y_perfil.png)

**Perfil (la «panza»):** ancho exterior de la piel. El largo/corto se mantiene en 1,24–1,30.

| z (m) | eje largo (B-B) | eje corto (A-A) |
|---|---|---|
| 17,2 | 75,3 | 58,1 |
| 41,8 | 80,4 | 63,9 |
| 67,4 | 83,6 | 67,1 |
| 92,0 a 105,9 | **84,8** (el más ancho) | **68,5** |
| 130,5 | 83,1 | 66,9 |
| 156,1 | 79,7 | 63,6 |
| 180,7 | 74,0 | 58,7 |
| 195,0 | 70,1 | 54,8 |

Debajo del 4º la piel se mete hacia adentro (la base angosta: la exigencia del acceso de bomberos, según ZHA); los
cortes ahí se mezclan con el basamento y no se midieron.

**Anillo de columnas:**

| Planta | columnas en el anillo | elipse (ejes) | diámetro dibujado |
|---|---|---|---|
| PB (+0,00) | 32 | 48,9 × 61,2 m | 1,48 m |
| 2º (+4,10) | 26 | 48,2 × 64,5 m | 1,43 m |
| 10º (+37,70) | 26 (+ 8 fuera del anillo = **34**) | 57,5 × 72,7 m | 1,25 m |

- De PB al 2º el anillo casi no cambia; del 2º al 10º se abre unos 9 m en cada eje: **las columnas se inclinan hacia
  afuera** siguiendo la panza (unos 3 m adentro de la piel en el 10º).
- En el 10º hay 34 columnas, como dice la supervisión de obra (26 en la elipse y 8 en las puntas del atrio).
- Orientación del eje largo en la lámina: unos 38,5° (igual en el 2º y el 10º). El eje largo de la planta es el del
  corte B-B.
- PB tiene detecciones de más (círculos que no son columnas): el anillo de PB es el menos seguro.

**Núcleos:** dos «ojos» iguales de **29,5 × 15,75 m**, con muros de **~0,55 m** (medido en el 10º), con **simetría
central**: centros en ±(9,66; 17,09) m, a 19,6 m del eje. Iguales en PB, 2º y 10º.

Datos: `relevamiento.json` (niveles, perfil piso por piso, cada columna de cada anillo, centros de los núcleos).

## Para revisar con el usuario

1. **Ejes y orientación:** ¿tomamos el eje largo (B-B, 84,8 m en la panza) y el corto (A-A, 68,5 m) como B y L de la
   app? ¿Ponemos la elipse girada como en la lámina o alineada con los ejes de la app?
2. **El atrio:** el corte entre las dos mitades gira unos 45° en altura. Para medirlo piso por piso harían falta plantas
   de más arriba (por ejemplo del 25º y del 40º). ¿Hay?
3. **Columnas:** el diámetro dibujado (1,25–1,5 m) puede incluir el revestimiento contra fuego; el tubo real no
   aparece en ninguna fuente. ¿Lo tomamos así o con un valor típico (por ejemplo 1,2 m con 30–40 mm de acero)?
4. **Qué columnas son del pórtico y cuáles del atrio** (las 8 fuera del anillo en el 10º): conviene marcarlas a mano
   sobre la planta.
5. **Núcleos:** ¿el espesor de 0,55 m sigue igual en altura? ¿Los núcleos siguen hasta el techo (en el corte B-B parece
   que sí)?
6. **Cinturones:** ¿van en los pisos dobles 13–14, 24–25, 35–36 y 45–46 (los de refugio, de 5,1 a 5,7 m)?
7. **Altura del ejemplo:** ¿191,5 m (estructural), 199,99 m (piel) o 207 m (helipuerto)?
