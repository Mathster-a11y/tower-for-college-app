# Núcleo del Gherkin: relevamiento de las plantas

Base para rehacer el núcleo del ejemplo `ejemploGherkin` (`src/engine/ejemplosExo.ts`) con tabiques y columnas. El ejemplo
**todavía no se tocó**: primero se junta y se revisa toda la información.

## Cómo se midió

1. Se tomaron cinco plantas de Foster + Partners: p1 (oficinas bajas, con pozos de luz), p5 (oficinas, lámina girada),
   p6 (oficinas altas, cerca del 33º), p7 (39º, restaurante) y p4 (40º, bar bajo la cúpula).
2. En cada lámina se detectaron las columnas y se ajustó un giro, una escala y un traslado que las lleva sobre el mismo
   modelo (`ajuste_laminas.json`). Las 20 columnas caen en el mismo lugar en p1, p5 y p6 con 2 a 5 cm de error.
3. Las tres plantas de oficinas se superpusieron al 30 % de opacidad, centradas en el eje
   (`progreso_1_superposicion.jpg`). Donde la tinta se acumula, el muro está en las tres: es el que sigue de abajo para
   arriba y el candidato a estructural.
4. Cada muro se trazó a mano y después se ajustó solo a la línea de tinta común (`scripts/refinar.py`): la mayoría queda
   con menos de 1 cm de dispersión. La mitad derecha se comprobó por separado y es el espejo de la izquierda con 1 a 5 cm
   de diferencia (salvo W2, que del lado derecho es más débil).
5. El tamaño y el giro de cada columna se midieron con el rectángulo mínimo de su mancha (`scripts/colsz.py`).

## Datos

`relevamiento.json` es la fuente: columnas (centro, lado, giro), muros (eje de punta a punta, vanos), fragmentos dudosos,
lo que no es estructural y hasta qué altura llega cada cosa. Coordenadas en metros con origen en el centro de la torre,
+y hacia los bancos de ascensores; solo la mitad izquierda (la derecha es su espejo, x → −x, giro → −giro).

## Qué se encontró

- **Anillo de 16 columnas** a 12,3 m del centro, a ±11,6°, 25°, 51,2°, 67,9°, 95,2°, 108,6°, 135,1° y 165° del eje,
  de unos 0,70 m de lado y giradas con su radio.
- **Columnas interiores:** D (el nudo donde se juntan el banco de ascensores, la escalera y el muro W), S (del lado del
  hall, girada 38°) y un poste chico P en la esquina del ascensor C.
- **Muros que se repiten:** el banco de 3 ascensores A (girado unos 3,5°, abierto hacia arriba; frente con tres puertas),
  el ascensor suelto A′, la escalera B, el ascensor chico C, el muro W (de la columna de 95° al nudo D) y W2.
- **No siguen:** el centro entre los dos bancos (baños abajo, vacío arriba) y el bloque de servicios entre W y S
  (ascensores bajos abajo, baños y locales arriba). Solo quedan dos trozos dudosos (F1 y F2).
- **En altura:** el anillo y los muros están iguales en p1, p5 y p6. En el 39º (p7) no está ninguna columna del anillo; con
  p6 coinciden solo los dos pozos que arrancan en S. El 40º apoya en el diagrid.
- **Losas:** son continuas en el medio del núcleo, sin vacío.

## Decidido con el usuario

- Columnas de 0,70 × 0,70 m.
- La columna D va en el cruce de A_ext, A_inf y W, alineada con el banco (antes estaba en el centro de la mancha del
  nudo, corrida unos 0,3 m).
- De los dudosos queda solo A2_inf (el piso del ascensor A′); F1 y F2 quedan en «descartados».

## Pendiente antes de pasarlo a la app

- Hasta qué losa suben el anillo y los muros: 38º o 39º. `progreso_4_corte.jpg` es un corte del ejemplo actual con el
  núcleo nuevo. En el 38º la losa tiene 15,05 m de radio y sobran 2,40 m entre la cara del anillo (12,65 m) y la piel;
  en el 39º sobran 0,60 m; la losa del 40º (11,43 m) queda adentro del anillo, así que el anillo no puede llegar ahí.
- Los scripts leen las láminas de la carpeta de subidas de la sesión; para rehacerlos hay que apuntar `U` a las imágenes.
