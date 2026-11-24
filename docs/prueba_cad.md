# Prueba manual de las herramientas CAD de la planta

Guion del inciso 8 del plan de entrega (`docs/plan_entrega.html`). Se corre a mano antes de cada entrega, con mouse y
después con la tablet (o el modo táctil de las herramientas de desarrollo del navegador). Cada falla que aparezca se
corrige y se suma acá como un paso nuevo, para que no vuelva.

Arrancá con un proyecto nuevo (ejemplo «Guía»), en la etapa **Piezas**, con la grilla a 0,05 m. Los comandos entre
corchetes se pueden escribir en la línea de comandos de la planta (como en AutoCAD).

## Dibujar un núcleo

1. **Dibujar muros** [L]: dibujá un rectángulo de 6 × 6 m con cuatro clics y cerralo en el primer punto.
   *Esperado:* cuatro tabiques que se tocan en las esquinas, sin superponerse (las juntas se limpian solas).
2. Apretá **R** dos veces mientras dibujás: la línea de referencia pasa por eje y por la otra cara.
   *Esperado:* el mensaje lo dice y el muro de prueba cambia de lado.
3. Apretá **F8** y dibujá un muro en diagonal. *Esperado:* sale como perfil, de a 15°. Borralo (**Borrar**).
4. **Lazo** [LA]: encerrá los cuatro muros. *Esperado:* quedan los cuatro elegidos y la barra de selección muestra 4.

## Agrupar y hacer componente

5. **Agrupar**: el núcleo pasa a ser un grupo. *Esperado:* un clic en cualquier muro elige el grupo entero.
6. **Hacer componente** (clic derecho sobre el grupo). *Esperado:* el grupo queda marcado como componente.
7. **Copia vinculada** con el componente elegido y ponela a 12 m a la derecha.
8. **Simetría** [MI] sobre la copia, eje vertical por su centro. *Esperado:* la copia queda espejada y sigue vinculada.

## Mover y girar el grupo entero

9. Elegí el grupo original y movelo con el mouse 1 m. *Esperado:* se mueven los cuatro muros juntos.
10. Con el grupo elegido, usá las **flechas del teclado** (paso 0,05 m; con Mayúsculas, 1 m).
    *Esperado:* se mueve el grupo entero, no un solo muro. Con varios muros elegidos con el lazo, se mueven todos.
11. **↺ 90°** sobre el grupo. *Esperado:* gira un cuarto de vuelta alrededor de su centro.
12. **Girar libre** [RL] 30°. *Esperado:* los muros pasan a perfiles girados y el área total no cambia.
13. **Escalar** [SC] ×1,5 con el espesor. *Esperado:* las medidas crecen 1,5 veces.

## Entrar y editar

14. Doble clic en el grupo (o **Entrar**). *Esperado:* el resto de la planta queda atenuado y solo se edita el grupo.
15. Cambiá el espesor de un muro en el panel. *Esperado:* la copia vinculada cambia igual.
16. **Hacer único** sobre la copia y cambiá otra vez el espesor del original. *Esperado:* la copia ya no cambia.
17. **Alargar / recortar** [AL] un muro hasta otro. **Partir** [PA] un muro en dos y **Unir** [UN] los dos trozos.
    *Esperado:* el largo total vuelve al original.
18. **Esquina** [F] entre dos muros que no se tocan. *Esperado:* se alargan hasta encontrarse.
19. **Desfase** [O] de un muro 1 m. *Esperado:* aparece uno nuevo paralelo, del mismo espesor.
20. Salí del grupo (**Soltar** o Esc). *Esperado:* vuelve la planta normal y el grupo se elige entero otra vez.

## Calar

21. **Calar** [CA] un vano de 1 m en un muro del núcleo. *Esperado:* el muro queda en dos tramos y el J baja.
22. Cerrá el vano. *Esperado:* el muro vuelve a ser uno y el J vuelve al valor de antes.

## Acotar

23. **Cotas** [D]: acotá un lado del núcleo de esquina a esquina. *Esperado:* la cota dice 6,00 m.
24. Mové el grupo con las flechas. *Esperado:* la cota lo sigue y sigue diciendo 6,00.
25. Girá el grupo con **↺ 90°**, con **Simetría** y con **Girar libre**. *Esperado:* la cota sigue pegada a las mismas
    esquinas y mide lo mismo (antes quedaba en el lugar viejo; corregido, prueba en `src/engine/cotasSiguen.test.ts`).
26. **Medir** [ME] entre dos esquinas. *Esperado:* da la distancia sin dejar una cota dibujada.

## Elegir iguales

27. Elegí un muro y apretá **Iguales**. *Esperado:* se eligen todos los del mismo tipo, largo y espesor.
28. Elegí un perfil girado y apretá **Iguales**. *Esperado:* se eligen los perfiles con la misma sección (aunque estén
    girados o espejados), no todos los perfiles.

## Deshacer

29. **Ctrl+Z** paso por paso hasta el principio. *Esperado:* cada paso vuelve atrás uno solo, incluso los movimientos con
    flechas, y las cotas vuelven con su muro.
30. **Ctrl+Y** hasta el final. *Esperado:* queda igual que en el paso 28.

## Pruebas automáticas que acompañan el guion

- `npx vitest run src/engine/cotasSiguen.test.ts`: las cotas siguen al muro al mover, girar, espejar y escalar.
- `node tools/recorrido_tactil.cjs`: recorre la app con toque en tres tamaños (teléfono, tablet, notebook) y avisa
  botones chicos, cosas fuera de la pantalla y errores.
