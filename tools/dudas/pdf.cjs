// docs/dudas_planilla/index.html → dudas_planilla.pdf (A4)
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage();
  await pg.goto('file://' + path.resolve(__dirname, '../../docs/dudas_planilla/index.html'));
  await pg.pdf({ path: path.resolve(__dirname, '../../docs/dudas_planilla/dudas_planilla.pdf'), format: 'A4', margin: { top: '14mm', bottom: '14mm', left: '10mm', right: '10mm' }, printBackground: true,
    displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#888">Dudas sobre la planilla · <span class="pageNumber"></span> de <span class="totalPages"></span></div>' });
  await b.close();
})();
