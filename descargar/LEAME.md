# Torre 3D en un solo archivo

El archivo único (`torre3d.html`) ya no se guarda en el repositorio: lo arma GitHub Actions en cada versión de
`main`, con las pruebas pasadas, y se descarga de un solo lugar:

**https://mathster-a11y.github.io/tower-for-college-app/torre3d.html** (unos 5 MB)

Se abre con doble clic en Chrome, Edge o Firefox, sin internet ni servidor. Abajo a la derecha la app muestra su
versión y su commit (por ejemplo `v0.1.0 · cb53f67`): el archivo descargado y la página publicada de la misma
versión dicen lo mismo.

Para armarlo en una computadora propia: `npm run build:unico` (queda en `dist-unico/index.html`).
