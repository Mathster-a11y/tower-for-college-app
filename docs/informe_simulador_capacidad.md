# Simulador de viento: ¿se puede avisar (o prohibir) según la computadora y según la forma de la torre?

Informe de factibilidad, sin implementar. Noviembre de 2026.

Se pidieron dos avisos para el túnel 3D:

1. **Por la computadora:** después de analizar qué puede hacer la máquina, que no deje usar el túnel 3D a las que no
   llegan a un mínimo.
2. **Por la forma de la torre:** que avise cuando el perfil es tan complejo que puede sobreexigir a la computadora.

Resumen corto:
- **Aviso 1:** se puede, pero el navegador no deja hacer un «análisis completo» de la computadora. Lo único confiable
  es *medir* (la prueba de la placa que ya existe) más unos pocos datos que el navegador sí da. Conviene prohibir solo
  lo imposible y, para lo lento, avisar y ofrecer una grilla más liviana.
- **Aviso 2:** tal como está planteado, no tiene base técnica. En este método (Lattice Boltzmann) lo que cuesta es el
  tamaño de la grilla, no lo complicada que sea la forma: un cuadrado y una fachada de 200 vértices tardan lo mismo
  por paso. La forma importa por otra razón, la **resolución**: los detalles más chicos que una celda no aparecen en
  la simulación. Ese aviso sí se puede dar, y es útil justamente para comparar fachadas.

---

## Cómo funciona hoy el túnel 3D (lo que condiciona todo)

- Corre en la placa de video con **WebGPU** (Lattice Boltzmann D3Q19, 19 números por celda en float32).
- Hay tres grillas:

  | grilla  | celdas                    | memoria en la placa | memoria al arrancar (RAM) | celda con la torre de ejemplo (64 m) |
  |---------|---------------------------|---------------------|---------------------------|--------------------------------------|
  | rápida  | 96 × 48 × 40 = 0,18 M     | ≈ 32 MB             | ≈ 14 MB                   | ≈ 2,5 m                              |
  | liviana | 160 × 80 × 64 = 0,82 M    | ≈ 141 MB            | ≈ 62 MB                   | ≈ 1,5 m                              |
  | fina    | 256 × 128 × 96 = 3,1 M    | ≈ 541 MB            | ≈ 239 MB                  | ≈ 1,0 m                              |

  La memoria en la placa son dos copias de las 19 distribuciones (152 B/celda), más el sólido y el campo de velocidad
  (172 B/celda en total).
- **Tamaño de la celda:**
  - La escala se elige para que entre la torre con 1,5 veces su altura. En una torre alta manda la altura: con 100 m
    y grilla liviana, la celda pasa a unos 2,4 m.
  - El túnel 2D tiene 20 celdas por ancho (30 en «fina»): con 20 m de ancho, una celda es de 1 m (0,67 m en fina).
- **La prueba de la placa (Viento → Túnel 2D → «Probar la placa de video»):**
  - Corre la grilla liviana 4 s y mide millones de celdas por segundo.
  - El criterio del plan pide 10 cuadros por segundo a 20 pasos por cuadro, es decir unos 164 M celdas/s.
- **Limitaciones de este informe:**
  - No pude probar WebGPU acá: el contenedor donde trabajo no tiene placa de video. Las mediciones reales quedan para
    tu notebook (está anotado en PENDIENTES).
  - Hoy la app no atiende el caso en que el controlador de video reinicia la placa a mitad de una corrida
    (*device lost*). Hay que agregarlo con cualquiera de las dos opciones.

---

## 1. Aviso o bloqueo según la computadora

### Qué puede saber el navegador (y qué no)

| dato | ¿se puede? | comentario |
|---|---|---|
| ¿Hay WebGPU? | sí | Chrome y Edge de escritorio; Safari 26; Firefox todavía no en todas las plataformas. |
| ¿La placa es real o es una emulación por software? | sí | `adapter.info.isFallbackAdapter`: la emulada es lentísima y hay que bloquearla. |
| Tamaño máximo de memoria por bloque de la placa | sí | `adapter.limits` (`maxBufferSize`, `maxStorageBufferBindingSize`). Ya se usa para frenar la grilla si no entra. |
| Modelo exacto de la placa | a medias | Por privacidad, Chrome da el fabricante y la familia («nvidia / ampere»), muchas veces sin el modelo. No sirve armar una lista de placas permitidas. |
| Memoria total de la placa (VRAM) | **no** | No hay forma estándar de leerla. |
| Memoria RAM | apenas | `navigator.deviceMemory`: solo Chrome, redondeada y con tope en 8 GB. |
| Núcleos del procesador | sí, aproximado | `navigator.hardwareConcurrency` (hilos, no núcleos reales). |
| Batería, ahorro de energía, temperatura | **no** | La API de batería está limitada o retirada en la mayoría de los navegadores. |
| **Velocidad real del túnel en esa máquina** | **sí, midiendo** | La prueba de la placa: es el único dato que de verdad predice si anda. |

Conclusión: un «análisis completo» como el de un programa instalado no se puede hacer desde una página web. Lo que sí
se puede es combinar tres controles: ¿hay WebGPU? ¿la placa es real? ¿entra la grilla en su memoria? A eso se suma
una **prueba de velocidad** corta.

### Cómo podría funcionar

1. **Controles inmediatos (sin medir, en menos de 1 s):**
   - si no hay WebGPU, o la placa es emulada, o la grilla no entra en los límites de memoria, se **bloquea**;
   - el mensaje dice por qué y ofrece el túnel 2D, que corre en el procesador y anda en cualquier computadora.
2. **Prueba de velocidad (unos 5 a 15 s, solo cuando el usuario la pide o la primera vez que entra al 3D):**
   - mide millones de celdas por segundo y, de ahí, cuántos cuadros por segundo daría **cada** grilla (el costo es
     proporcional a la cantidad de celdas);
   - el resultado se guarda en el navegador junto con el nombre de la placa, así no se repite en cada visita;
   - un botón «Volver a medir» la repite.
3. **Con el resultado:**
   - cada grilla queda habilitada si llega al mínimo, y las que no llegan quedan bloqueadas (o con aviso, ver abajo);
   - se muestra el tiempo estimado de una corrida, por ejemplo «la grilla fina tardaría unos 4 minutos en estabilizarse».

### Ventajas

- Evita lo peor: la pestaña congelada o el controlador de video que se reinicia (en Windows, si la placa tarda más de
  unos 2 s en un cálculo, el sistema la reinicia).
- El alumno entiende por qué no puede y qué usar en su lugar (el 2D o una grilla más liviana).
- La medición es objetiva: no depende de listas de placas que envejecen.
- Ya está casi todo hecho: la prueba de la placa y el control de memoria existen.

### Desventajas y limitaciones

- **La medición cambia de un momento a otro en la misma computadora.** En una notebook puede dar el doble enchufada
  que a batería, o la mitad si está caliente o con otras pestañas pesadas. Un bloqueo estricto puede dejar afuera a
  una máquina que, en otro momento, andaba. Por eso conviene un margen y la opción de volver a medir.
- **Notebooks con dos placas:**
  - la app pide la placa potente, pero es solo un pedido: algunos sistemas le dan al navegador la integrada;
  - el bloqueo podría deberse a la configuración del sistema y no a la máquina;
  - el mensaje debería explicar cómo elegir la placa potente para el navegador (en Windows: Configuración → Pantalla
    → Gráficos).
- **La prueba tiene costo:** son unos segundos con la placa al máximo. No conviene correrla sola al abrir la app.
- **Prohibir no siempre ayuda a aprender:**
  - una máquina que no llega a 10 cuadros por segundo con la grilla liviana suele poder correr la rápida, o la liviana
    más despacio (el resultado es el mismo, solo tarda más);
  - un bloqueo total le quita la herramienta justo a quien tiene la computadora más modesta.
- **No es un control de seguridad:** todo corre en la computadora del usuario y un alumno que sabe puede saltearlo.
  Sirve para orientar, no para impedir.
- **Datos que no se pueden leer** (VRAM, temperatura, batería): el bloqueo nunca va a ser «completo».

### Recomendación

| situación | qué hacer |
|---|---|
| Sin WebGPU, placa emulada o la grilla no entra en la memoria | **bloquear** esa grilla (o todo el 3D) y ofrecer el 2D |
| La placa mide menos de lo necesario para una grilla | **avisar** con el tiempo estimado; bloquear solo la grilla fina |
| La placa llega | dejar usar, mostrando la velocidad medida |

Es factible, con un esfuerzo chico a mediano. Incluye el manejo del *device lost*, que hace falta de todos modos.

---

## 2. Aviso por la forma (el «perfil complejo»)

### Lo que realmente cuesta en este simulador

En Lattice Boltzmann cada celda hace la misma cuenta, sea aire o pared. El tiempo por paso depende solo de
nx · ny · nz.

- **Cuesta lo mismo:** una torre cuadrada, una con esquinas sustraídas, una con 200 vértices de carpintería curva o
  una con forma distinta en cada piso.
- **Pasar la forma a celdas es despreciable:** se hace una sola vez, en el procesador, y tarda milisegundos aun con
  muchos niveles y arcos (los arcos se parten cada 12°).
- **El dibujo 3D de la torre** también es liviano para cualquier placa que pase el aviso 1.

Por eso un aviso de «perfil muy complejo, puede sobreexigir la computadora» estaría avisando algo que no pasa. No lo
recomiendo.

### Dónde sí importa la forma

1. **Resolución: lo que no se ve.**
   - Con la grilla liviana y la torre de ejemplo, cada celda mide unos 1,5 m. Una esquina sustraída de 2 × 2 m queda
     en 1 o 2 celdas, una ochava de 1 m directamente no aparece y un radio de 3 m queda escalonado.
   - Para comparar fachadas, este es el aviso valioso. Por ejemplo: «el detalle más chico de esta planta mide 0,8 m y
     la celda mide 1,5 m: en la simulación queda como una esquina viva; usá la grilla fina o el túnel 2D, que tiene
     celdas de 1 m o menos».
   - Se puede calcular exactamente con la geometría: el lado más corto, el radio más chico y la profundidad de cada
     sustracción, contra el tamaño de la celda de cada grilla.
2. **Tiempo total y estabilidad.**
   - Las formas con aristas finas o salientes pueden volver inestable la simulación a Reynolds altos (el 2D ya avisa
     «se volvió inestable»).
   - Algunas formas tardan más en dar promedios quietos (más pasadas para que Cd y St se estabilicen).
   - Esto se avisa midiendo durante la corrida, no mirando la forma antes.
3. **Reynolds: una limitación de fondo, más importante que la anterior.**
   - El simulador trabaja con Reynolds de miles. El edificio real, con decenas de millones.
   - En aristas vivas casi no importa: el aire se despega en la arista a cualquier Reynolds. En **esquinas
     redondeadas**, en cambio, el despegue depende mucho del Reynolds.
   - Por eso, aunque el radio se vea bien en la grilla, el beneficio que mida el simulador para esquinas curvas es
     **cualitativo**: muestra la tendencia, no el número.
   - Con chaflanes y sustracciones (que tienen aristas) la comparación es más confiable.

### Ventajas de reemplazarlo por un aviso de resolución y tiempo

- Responde a lo que importa para comparar fachadas: si la diferencia entre dos casos va a aparecer o no.
- Es barato de calcular y no depende de la computadora.
- Junto con la velocidad medida en el aviso 1 da un **tiempo estimado**: la forma más útil de «esto va a exigir la
  computadora».

### Desventajas y limitaciones

- **Medir el detalle mínimo de una planta cualquiera no es trivial:** ranuras finas, vértices casi juntos o arcos
  muy chatos. Hace falta un criterio (por ejemplo, ignorar lo menor a 5 cm) y probarlo con las plantas de los
  ejemplos.
- **Los umbrales son una convención:** «3 celdas por detalle» es una regla práctica de la bibliografía de LBM, no
  una ley. Conviene mostrarlo como guía, no como prohibición.
- **No resuelve el problema del Reynolds,** que necesita su propia nota (ya está en el 2D; habría que repetirla en el
  3D cuando la planta tiene curvas).

### Recomendación

No implementar el aviso de «perfil complejo» tal como está planteado. En su lugar:

1. un **aviso de resolución** por grilla (detalle más chico contra tamaño de celda, y qué grilla o qué túnel lo
   resuelve);
2. un **tiempo estimado** (celdas por la velocidad medida);
3. una **nota de Reynolds** cuando la planta tiene curvas.

Es factible, con un esfuerzo chico.

---

## Para comparar casos de fachada hoy

Esto ya está en la app:

1. Dibujá la carpintería de cada caso: Diseño → Contornos → Carpintería, o «Esquinas de la torre».
2. En **Viento → Túnel 2D**, con el mismo corte, Reynolds y resolución, anotá cada caso con «Anotar esta medición».
   La tabla compara Cd, Cl, St y V crítica contra el primero. Con «Planta: su caja, con esquinas vivas» tenés la
   referencia sin tratar.
3. El túnel 3D muestra el Cp de cada cara contra el del reglamento. Por ahora no tiene tabla de comparación; se
   puede agregar igual que en el 2D.
