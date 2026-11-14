# Figuras de la planilla

Los dibujos explicativos de las hojas originales («viento», «M,NyQ» y las dos hojas J), rediseñados con el lenguaje
de la app: tarjeta con franja de título, rótulos dentro del dibujo y «paso a paso» numerado. Se guardan como PNG en
`src/assets/figuras` y la app los pone sobre las hojas al escribir la planilla (los dibujos originales quedan ocultos
en el archivo, no se borran).

- `figs.py`: cada figura, en píxeles de la hoja (mismo lugar y ancho que la figura original).
- `base_fig.py`: colores, tarjeta, cotas, lista de partes y pasos.
- `hacer.sh`: rehace todo (`sh tools/figuras/hacer.sh`).

Los colores de las piezas son los de los encabezados de las tablas (verde, amarillo, salmón, celeste, violeta, rojo):
así cada parte del dibujo se reconoce en sus columnas.
