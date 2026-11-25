# Torre 3D · pendientes y recomendaciones (25/11/2026)

Lista armada después de la pasada para el lunes (`tools/pasada_entrega.cjs`): cada ejemplo con los cuatro métodos, todas
las etapas, las descargas (planillas, libros, PowerPoint, tabla, proyecto) y las hojas para imprimir (desglose, carta,
informe, lámina), más la prueba en tablet simulada (pantalla táctil de 1280 × 800 y 800 × 1280, procesador 4 veces más
lento).

## Lo que se arregló en esta pasada

| Qué pasaba | Qué se hizo |
|---|---|
| Con Citicorp en CIRSOC o FEM cada clic tardaba 9 a 15 s (en la tablet, la app parecía congelada) | El exo quedó en memoria por cálculo y el resolvedor del pórtico factoriza una sola vez. Ahora: 0,1 a 0,3 s por etapa y 1 a 1,4 s al cambiar de método (en la tablet simulada, 1 a 4 s solo la primera vez) |
| En una tablet apaisada el 3D quedaba debajo, fuera de la pantalla, y con el dedo no se llegaba: los botones 📷, σ, p, J y Encuadrar no se podían usar | Tablet apaisada y notebook chica: tres columnas como en la computadora. Tablet vertical: el 3D abajo y a la vista |
| Herramientas de la planta cortadas en la tablet («Grilla», «⋯») | Van en dos líneas hasta 1280 px |
| Túnel 2D: la rueda acercaba a saltos, no se podía correr de costado y en la tablet el dedo movía la página | Rueda proporcional, rueda de costado o Mayúsculas para correr, pellizco y arrastre con el dedo, doble toque para ver todo, sin salirse del túnel |
| «Materiales y fundación» se desarmaba (el botón de la platea ensanchaba la columna de los rótulos) y la Shanghai mostraba el hormigón vacío (H70 no estaba en la lista) | El botón va en su fila y la lista llega a H80 (y suma el del proyecto si es otro) |

## Lo que falta (depende de otros)

1. **Cátedra**: las preguntas del PDF de dudas (`docs/dudas_planilla/dudas_planilla.pdf`), el amortiguamiento y el criterio
   de aceleración del túnel 3D, la rosa de vientos del SMN de cada sitio.
2. **Vos**: el documento del contexto urbano.
3. **Medir el 3D en tu computadora**: la carpeta «CLAUDE CARPETA DE TRABAJO» de DESKTOP-JLPPS9M aparece en Remote Control,
   pero la computadora no la ofrece a sesiones en la nube. Lo más probable: actualizar la app de Claude en esa computadora
   (en Windows hace falta una versión que comparta carpetas). Mientras tanto se puede medir abriendo `torre3d.html` y el
   botón «Probar la placa de video» del túnel 3D.
4. **Probar en la tablet Samsung real** antes del lunes: abrir Citicorp, pasar a CIRSOC, recorrer las etapas, el túnel 2D
   (pellizco) y el 3D. Si algo sigue lento, avisame qué y en qué pantalla.

## Importante: derechos de autor de los archivos del repositorio

En la raíz del repositorio están subidos PDF que no son tuyos: los reglamentos CIRSOC 101, 102, 200, 201, 301, 302, 303,
401 y 103, la norma **UNE-ENV 1997-3** (de AENOR, que se vende) y dos documentos de la cátedra («7-edif torre 2024.pdf» y
«guia viento torre cirsoc2005.pdf»). Si el repositorio es público (GitHub Pages lo pide en el plan gratuito), eso es
redistribuirlos sin permiso: los reglamentos del INTI se descargan gratis de su página, pero eso no da permiso para
volver a publicarlos, y la UNE directamente no se puede. La licencia de la app solo dice que la cátedra autorizó las dos
planillas.

Recomiendo: sacarlos del repositorio (quedan en tu computadora, ignorados por git) y, si el repositorio es o fue público,
borrarlos también de la historia (eso reescribe la historia de `main`: lo hago solo si me lo pedís). En el README y en la
app, en vez del archivo, un enlace a la página oficial de cada reglamento.

También conviene sumar al aviso de licencias las bibliotecas que faltan nombrar: **pdf.js** (Apache 2.0, pide incluir su
licencia) y **PptxGenJS** (MIT), además de three.js, JSZip y las fuentes, que ya están.

## Recomendaciones para mejorar la app

### Rendimiento (lo que más se nota en la tablet)

1. **Calcular en segundo plano** (un *worker*): el cálculo corre aparte y la pantalla nunca se traba; mientras tanto,
   un aviso «Calculando…» y los resultados anteriores atenuados. Es el cambio que elimina de raíz los congelamientos.
2. **Exo: resolver las cargas juntas.** Peso, sobrecarga y viento usan la misma estructura: se puede factorizar una vez
   por cara y resolver los tres casos juntos (hoy son tres resoluciones). Bajaría otro 50 a 60 % el tiempo del exo.
3. **Carga de la página**: el lector de PDF (1,7 MB) y el 3D (0,5 MB) ya se cargan aparte; el núcleo de la app pesa 1,3
   MB. Separar el túnel 2D, las ecuaciones y el editor de perfil para que la primera carga en la tablet sea más rápida.
4. **Probar en CI**: correr `tools/pasada_entrega.cjs` y `tools/dudas/verif.test.ts` en GitHub Actions, para que
   un cambio que rompa una descarga, haga lenta una etapa o cambie un resultado se vea antes de publicar.

### Uso

5. **Modo presentación**: un botón que pase a pantalla completa, agrande letras y dibujos, oculte los paneles que no
   se usan y deje las flechas del teclado para avanzar de etapa. Sirve para el lunes y para las clases con proyector.
6. **Mensajes del pie**: los mensajes largos (al cargar un ejemplo) ocupan dos renglones en la computadora y más en la
   tablet. Mejor un aviso que aparece arriba de la planta y se cierra solo o con una ✕.
7. **Desplazamiento en pantallas chicas**: en 1024 × 600 algunos botones del final de cada panel quedan pegados al pie;
   se llega desplazando el panel, pero un margen abajo lo haría más cómodo.

### Didáctica (la parte de fondo la da la cátedra)

8. **«Predecí antes de calcular»**: antes de mostrar un resultado (el J mínimo, la flecha, qué pieza toma más
   viento), el alumno anota su estimación y la app la compara. Es una técnica conocida de la enseñanza de la ingeniería
   para que el número no se acepte sin pensarlo.
9. **Comparar dos versiones de la torre**: guardar una variante (por ejemplo, con un tabique más largo) y ver lado a lado
   qué cambia en cada etapa, con las diferencias marcadas. La comparación de métodos ya existe; esto sería lo mismo
   entre dos diseños.
10. **Ejercicios con autocorrección** armados por la cátedra: un proyecto cerrado con preguntas («¿cuánto vale Q en
    PB?») que la app corrige contra su propio cálculo.

### Cálculo (con criterio CIRSOC)

11. **Contraste independiente del FEM**: exportar el modelo a un formato que lea un programa abierto de pórticos (por
    ejemplo PyNite, licencia MIT, o anaStruct, GPL) y comparar desplazamientos y esfuerzos en un informe. Solo se
    exporta un archivo y se compara: no se incorpora código de esos programas (la GPL obligaría a publicar la app con esa
    licencia).
12. **Pendientes del reglamento** que ya están anotados: torsión de la Fig. 9 del CIRSOC 102, Gf para edificios
    flexibles, P-Δ global en todos los métodos CIRSOC.
13. **Dimensionado asistido**: un «¿qué espesor necesito?» que barra el espesor de un tabique o la sección del exo hasta
    que verifique (hoy se hace a mano o con el botón «Dimensionar» del exo).

## Otros programas como referencia (solo ideas generales)

Las ideas y las funciones no tienen derechos de autor; el código, los textos, los íconos, los manuales y el aspecto de
cada programa sí. Se pueden tomar como referencia de qué ofrecen, sin copiar nada de ellos.

| Programa | Tipo | Qué tiene que podría inspirar algo propio |
|---|---|---|
| ETABS / SAP2000 (CSI) | comercial | Modelo por pisos con diafragma rígido, combinaciones generadas por norma, tablas de resultados por piso |
| RFEM / RSTAB (Dlubal) | comercial | Generadores de cargas de viento por norma, informes que se arman eligiendo qué incluir |
| Robot Structural Analysis (Autodesk) | comercial | Ida y vuelta con el modelo de arquitectura (BIM) |
| OpenSees | gratis para enseñanza e investigación (no es de código abierto en sentido estricto) | Análisis no lineal y dinámico; referencia académica |
| PyNite (MIT), anaStruct (GPL), Frame3DD (GPL) | código abierto | Contraste del FEM de la app (punto 11) |
| OpenFOAM (GPL) | código abierto | La app ya exporta el caso del túnel; se podría sumar la lectura de sus resultados para compararlos con el túnel 3D |
| SimScale | comercial, en la nube | Túnel de viento en el navegador; referencia de cómo presentar el confort peatonal |

Antes de usar cualquier código, texto o imagen de otro programa, conviene revisar su licencia (MIT o BSD se pueden usar
dando crédito; GPL obliga a que la app entera sea GPL; lo comercial, nada).
