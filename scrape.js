import puppeteer from 'puppeteer';
import readline from 'readline';
import fs from 'fs';
import { Parser as Json2csvParser } from 'json2csv';
import XLSX from 'xlsx';
import PDFDocument from 'pdfkit';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

const OCC_URL = 'https://www.occ.com.mx/';

export async function scrapeOCC(searchTerm) {
  const browser = await puppeteer.launch({ headless: false, args: ['--start-maximized'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.goto(OCC_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#prof-cat-search-input-desktop', { timeout: 15000 });
  await page.type('#prof-cat-search-input-desktop', searchTerm);
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForSelector('div[id^="jobcard-"]', { timeout: 15000 })
  ]);

  let results = [];
  let hasNextPage = true;
  let pageNum = 1;

  while (hasNextPage) {
    await page.waitForSelector('div[id^="jobcard-"]', { timeout: 15000 });
    const jobCards = await page.$$('div[id^="jobcard-"]');
    for (let i = 0; i < jobCards.length; i++) {
      const card = jobCards[i];
      let nombreVacante = '';
      try {
        nombreVacante = await card.$eval('h2', el => el.textContent.trim());
      } catch { }
      let empresa = '';
      try {
        empresa = await card.$eval('span.text-grey-900.no-underline', el => el.textContent.trim());
      } catch { }
      let ubicacion = '';
      try {
        ubicacion = await card.$$eval('.no-alter-loc-text span', spans =>
          spans.map(s => s.textContent.trim()).filter(Boolean).join(', ')
        );
      } catch { }
      let sueldo = '';
      try {
        sueldo = await card.$eval('span.mr-2.text-grey-900', el => el.textContent.trim());
      } catch { }
      let beforeTitle = await page.evaluate(() => {
        const el = document.querySelector('p.font-h4-m, h1, h2');
        return el ? el.innerText.trim() : null;
      });
      await card.click();
      await new Promise(res => setTimeout(res, 500));
      let afterTitle = beforeTitle;
      let retries = 0;
      while (afterTitle === beforeTitle && retries < 10) {
        await new Promise(res => setTimeout(res, 200));
        afterTitle = await page.evaluate(() => {
          const el = document.querySelector('p.font-h4-m, h1, h2');
          return el ? el.innerText.trim() : null;
        });
        retries++;
      }

      let panelData = { sobreEmpleo: {}, detalles: {}, descripcion: '', verificada: false };
      try {
        panelData = await page.evaluate(() => {
          let sobreEmpleo = {};
          const sobreEmpleoDivs = document.querySelectorAll('.flex.flex-col.gap-4 > div, .flex.flex-col.gap-2 > div');
          sobreEmpleoDivs.forEach(div => {
            const label = div.querySelector('span.text-base')?.innerText.trim();
            const valor = div.querySelector('.text-base.font-light')?.innerText.trim();
            if (label && valor) sobreEmpleo[label.replace(':', '')] = valor;
          });

          let detalles = {};
          const detallesDivs = document.querySelectorAll('[class*="[&>div]:flex"] > div');
          detallesDivs.forEach(div => {
            const p = div.querySelector('p');
            const valorEl = div.querySelector('a.font-light, span.font-light');
            if (p && valorEl) detalles[p.innerText.replace(':', '').trim()] = valorEl.innerText.trim();
          });

          let descripcion = '';
          const descDiv = document.querySelector('.break-words > div');
          if (descDiv) {
            descripcion = descDiv.innerText.trim();
          }
          const verificada = !!Array.from(document.querySelectorAll('a')).find(a => a.textContent.trim() === 'Empresa verificada');
          return { sobreEmpleo, detalles, descripcion, verificada };
        });
      } catch { }

      results.push({
        nombreVacante,
        empresa,
        ubicacion,
        sueldo,
        verificada: panelData.verificada,
        sobreElEmpleo: {
          ...panelData.sobreEmpleo,
          Categoria: panelData.sobreEmpleo['Categoría'] || '',
          Subcategoria: panelData.sobreEmpleo['Subcategoría'] || '',
          'Educación mínima requerida': panelData.sobreEmpleo['Educación mínima requerida'] || ''
        },
        detalles: panelData.detalles,
        descripcion: panelData.descripcion
      });

      await page.keyboard.press('Escape');
      await new Promise(res => setTimeout(res, 500));
    }
    const nextPageLi = await page.$('li[tabindex="0"]:last-child');
    if (nextPageLi) {
      const isDisabled = await page.evaluate(el => el.getAttribute('aria-disabled') === 'true' || el.classList.contains('pointer-events-none'), nextPageLi);
      if (!isDisabled) {
        await nextPageLi.click();
        await new Promise(res => setTimeout(res, 3000));
        pageNum++;
      } else {
        hasNextPage = false;
      }
    } else {
      hasNextPage = false;
    }
  }
  await browser.close();
  return results;
}

async function main() {
  const searchTerm = await askQuestion('¿Qué deseas buscar? ');
  rl.close();
  if (!searchTerm.trim()) {
    console.error('❌ No ingresaste ningún término de búsqueda.');
    process.exit(1);
  }
  const results = await scrapeOCC(searchTerm.trim());
  if (results.length === 0) {
    console.warn('⚠ No se encontraron vacantes o algo salió mal.');
  }
  
  // Guardar JSON original
  fs.writeFileSync('resultados.json', JSON.stringify(results, null, 2), 'utf-8');
  console.log('✅ Se guardaron ${results.length} resultados en resultados.json');

  // Crear estructura plana para CSV/Excel
  const datosPlano = results.map(result => ({
    nombreVacante: result.nombreVacante,
    empresa: result.empresa || 'La empresa es confidencial o no se encuentra disponible',
    ubicacion: result.ubicacion,
    sueldo: result.sueldo,
    verificada: result.verificada,
    categoria: result.sobreElEmpleo.Categoria || '',
    subcategoria: result.sobreElEmpleo.Subcategoria || '',
    educacionMinima: result.sobreElEmpleo['Educación mínima requerida'] || '',
    contratacion: result.detalles['Contratación'] || '',
    horario: result.detalles['Horario'] || '',
    espacioDeTrabajo: result.detalles['Espacio de trabajo'] || '',
    descripcion: result.descripcion,
  }));

  // Generar CSV
  if (datosPlano.length > 0) {
    const json2csvParser = new Json2csvParser({ fields: Object.keys(datosPlano[0]) });
    const csv = json2csvParser.parse(datosPlano);
    fs.writeFileSync('resultados.csv', csv, 'utf-8');
    console.log('✅ Se guardó el archivo CSV: resultados.csv');
  }

  // Generar Excel
  if (datosPlano.length > 0) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(datosPlano);
    XLSX.utils.book_append_sheet(wb, ws, 'Vacantes');
    XLSX.writeFile(wb, 'resultados.xlsx');
    console.log('✅ Se guardó el archivo Excel: resultados.xlsx');
  }

  // Crear PDF con pdfkit
  if (datosPlano.length > 0) {
    try {
      const doc = new PDFDocument({ margin: 30, size: 'A4' });
      const pdfStream = fs.createWriteStream('resultados.pdf');
      doc.pipe(pdfStream);

      doc.fontSize(18).text(`Resultados de Búsqueda: ${searchTerm}`, { align: 'center', underline: true });
      doc.moveDown(1);
      doc.fontSize(12).text(`Total de vacantes encontradas: ${datosPlano.length}`);
      doc.moveDown(1);

      datosPlano.forEach((item, i) => {
        doc.fontSize(14).text(`Vacante ${i + 1}`, { underline: true });
        doc.fontSize(12).text(`Título: ${item.nombreVacante}`);
        doc.text(`Empresa: ${item.empresa}`);
        doc.text(`Ubicación: ${item.ubicacion}`);
        doc.text(`Sueldo: ${item.sueldo}`);
        doc.text(`Categoría: ${item.categoria}`);
        doc.text(`Verificada: ${item.verificada ? 'Sí' : 'No'}`);
        doc.text(`Educación mínima: ${item.educacionMinima}`);
        doc.text(`Contratación: ${item.contratacion}`);
        doc.text(`Horario: ${item.horario}`);
        doc.text(`Espacio de trabajo: ${item.espacioDeTrabajo}`);
        doc.moveDown(0.5);
        doc.fontSize(11).text('Descripción:', { underline: true });
        doc.fontSize(10).text(item.descripcion || 'Sin descripción');
        doc.moveDown(1);
        doc.text('----------------------------------------');
        doc.moveDown(1);
      });

      doc.end();
      pdfStream.on('finish', () => {
        console.log('✅ Se guardó el archivo PDF: resultados.pdf');
      });
    } catch (error) {
      console.error('❌ Error al generar PDF:', error.message);
    }
  }
}

main();