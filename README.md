# Torre 3D

Web app that accompanies the course workbook «Edificios en torre» (Electiva Edificios en Torre, FAUD-UNMDP).

The student draws the ground-floor plan (walls, pieces, levels). The app does the following:

- It computes the same results as the workbook, with the same formulas and the same quirks, so the numbers match cell for cell.
- It also computes the corrected values (CIRSOC 102 / the course guide) and shows both side by side with the checks: vuelco, eccentricity, soil, J mínimo, rototraslación, Fig. 9 torsion and flexocompresión.
- It writes the data into the **original course workbook** (`public/planilla_virgen.xlsx`). It only writes data cells, never formulas, and adds a `T3D` sheet that stores the project so the file can be reopened in the app.

The interface is in Spanish.

![Pantalla principal](docs/01_inicio.png)

## Usage (for students)

1. **Ejemplo** loads the guide's example (Neuquén, 20 floors). **Nuevo** starts an empty project.
2. **Sitio**: wind data, concrete and foundation. The concrete grade gives the admissible stress (H30 → 30 MPa = 300 kg/cm²).
3. **Niveles**: floor levels and plan dimensions B and L. There is a generator for repeated floors.
4. **Muros**: walls go on the plan. Drag them with the mouse or move them with the arrow keys. Each wall belongs to one piece per direction (A and B). Where it is attached decides whether it acts as an alma or an ala.
5. **Piezas**: the equivalent profile of each piece, as written to the J sheets.
6. **Resultados**: «Planilla» shows the workbook's values and «Guía/CIRSOC» shows the corrected ones, with each check.
7. **Escribir planilla .xlsx** downloads the filled workbook. Excel or LibreOffice recalculate it on opening. **Guardar proyecto** downloads a `.json`. **Abrir…** accepts either the `.json` or a workbook written by the app.

The project is also saved in the browser (localStorage).

## Development

```bash
npm install
npm run dev        # local server
npm test           # tests: the engine vs. the workbook results (fixture extracted from the Excel)
npm run build      # typecheck + static build in dist/
```

Code layout:

- `src/engine/`: calculation with no DOM.
  - `planilla.ts` replicates the workbook.
  - `mapping.ts` goes from walls to J-sheet rows.
  - `correcciones.ts` holds the corrected values.
  - `verificaciones.ts` holds the checks.
- `src/xlsx/`: xlsx reading and writing with JSZip. It edits the XML directly so it keeps styles and charts, deletes cached results and forces recalculation.
- `src/ui/`: SVG plan, three.js 3D view and panels.
- `tools/`: scripts that extract the fixture from the Excel and write the example for checking with LibreOffice.

### Deploy

`npm run build` produces a static site (`base: './'`) that works from any folder or static host.

GitHub Pages on a private repo needs a paid plan. The alternative is to make the repo public or upload `dist/` to Netlify, Cloudflare Pages or similar.

Downloading files does not work inside sandboxed iframes, such as a page embedded in another site.

## Known limitations

These are open questions for the cátedra:

- The virgin «J Tabiques paralelos» sheet is missing the top-ala and left-alma formulas in the rows for pieces 8 and 9. The app uses the other asymmetric rows first.
- In «Flex comp PB paralelos», cells D13:D20 are fixed at 0.01, so pieces 10–17 do not add their own weight.
- It is not settled whether flexible buildings (F < 1 Hz) should use Gf (CIRSOC 102 art. 5.8.2). The app flags them with «atención».
