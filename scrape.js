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
  const processedVacantes = new Set();
  let hasNextPage = true;
  let pageNum = 1;

  while (hasNextPage) {
    try {
      await page.waitForSelector('div[id^="jobcard-"]', { timeout: 20000 });
      const jobCards = await page.$$('div[id^="jobcard-"]');

      console.log(`🔍 Procesando página ${pageNum}...`);

      for (let i = 0; i < jobCards.length; i++) {
        const card = jobCards[i];
        try {
          await card.click();
          await page.waitForTimeout(1000);
        } catch {
          try {
            await page.evaluate(card => card.click(), card);
            await page.waitForTimeout(1000);
          } catch {
            continue;
          }
        }

        let nombreVacante = '';
        try {
          nombreVacante = await card.$eval('h2', el => el.textContent.trim());
        } catch {}

        let empresa = '';
        try {
          empresa = await card.$eval('span.text-grey-900.no-underline', el => el.textContent.trim());
        } catch {}
        if (!empresa) empresa = 'No se muestra la empresa';

        let ubicacion = '';
        try {
          ubicacion = await card.$$eval('.no-alter-loc-text span', spans =>
            spans.map(s => s.textContent.trim()).filter(Boolean).join(', ')
          );
        } catch {}
        if (!ubicacion) ubicacion = 'Sin ubicación';

        let sueldo = '';
        try {
          sueldo = await card.$eval('span.mr-2.text-grey-900', el => el.textContent.trim());
        } catch {}

        let panelData = { sobreEmpleo: {}, detalles: {}, descripcion: '', verificada: false };
        try {
          await page.waitForTimeout(500);
          panelData = await page.evaluate(() => {
            const data = { sobreEmpleo: {}, detalles: {}, descripcion: '', verificada: false };

            const sobreEmpleoDivs = document.querySelectorAll('.flex.flex-col.gap-4 > div, .flex.flex-col.gap-2 > div');
            sobreEmpleoDivs.forEach(div => {
              const label = div.querySelector('span.text-base')?.innerText.trim();
              const valor = div.querySelector('.text-base.font-light')?.innerText.trim();
              if (label && valor) {
                data.sobreEmpleo[label.replace(':', '')] = valor;
              }
            });

            const detallesDivs = document.querySelectorAll('[class*="[&>div]:flex"] > div');
            detallesDivs.forEach(div => {
              const p = div.querySelector('p');
              const valorEl = div.querySelector('a.font-light, span.font-light');
              if (p && valorEl) {
                data.detalles[p.innerText.replace(':', '').trim()] = valorEl.innerText.trim();
              }
            });

            const descDiv = document.querySelector('.break-words > div');
            if (descDiv) {
              data.descripcion = descDiv.innerText.trim();
            }

            const verificada = !!Array.from(document.querySelectorAll('a')).find(a =>
              a.textContent.trim() === 'Empresa verificada'
            );
            data.verificada = verificada;

            return data;
          });
        } catch {}

        // Deduplicación: solo guardar la primera vacante con la misma combinación
        const vacanteId = `${nombreVacante}|||${empresa}|||${ubicacion}`;
        if (processedVacantes.has(vacanteId)) {
          continue;
        }
        processedVacantes.add(vacanteId);

        if (nombreVacante && nombreVacante.trim().length > 0) {
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
        } else {
          console.log(`⚠️ Vacante ignorada (sin título)`);
        }

        try {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
        } catch {}
      }
    } catch (error) {
      console.log('⚠️ Error al procesar página:', error.message);
    }

    try {
      const paginationButtons = await page.$$('li[tabindex="0"]');
      if (paginationButtons.length === 0) break;

      const nextPageLi = await page.$('li[tabindex="0"]:last-child');
      const isDisabled = await page.evaluate(el =>
        el.getAttribute('aria-disabled') === 'true' ||
        el.classList.contains('pointer-events-none') ||
        el.classList.contains('disabled') ||
        el.style.pointerEvents === 'none', nextPageLi);

      if (!isDisabled) {
        await nextPageLi.click();
        await page.waitForTimeout(3000);
        pageNum++;
      } else {
        hasNextPage = false;
      }
    } catch {
      hasNextPage = false;
    }
  }

  await browser.close();

  // Guardar archivos
  fs.writeFileSync('resultados.json', JSON.stringify(results, null, 2), 'utf-8');
  console.log(`✅ Resultados guardados: ${results.length}`);

  const datosPlano = results.map(result => ({
    nombreVacante: result.nombreVacante,
    empresa: result.empresa,
    ubicacion: result.ubicacion,
    sueldo: result.sueldo,
    verificada: result.verificada,
    categoria: result.sobreElEmpleo.Categoria || '',
    subcategoria: result.sobreElEmpleo.Subcategoria || '',
    educacionMinima: result.sobreElEmpleo['Educación mínima requerida'] || '',
    contratacion: result.detalles['Contratación'] || '',
    horario: result.detalles['Horario'] || '',
    espacioDeTrabajo: result.detalles['Espacio de trabajo'] || '',
    descripcion: result.descripcion
  }));

  if (datosPlano.length > 0) {
    const json2csvParser = new Json2csvParser({ fields: Object.keys(datosPlano[0]) });
    fs.writeFileSync('resultados.csv', json2csvParser.parse(datosPlano), 'utf-8');

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(datosPlano);
    XLSX.utils.book_append_sheet(wb, ws, 'Vacantes');
    XLSX.writeFile(wb, 'resultados.xlsx');

    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    const pdfStream = fs.createWriteStream('resultados.pdf');
    doc.pipe(pdfStream);

    doc.fontSize(18).text(`Resultados de Búsqueda: ${searchTerm}`, { align: 'center', underline: true });
    doc.moveDown(1).fontSize(12).text(`Total: ${datosPlano.length}`).moveDown(1);

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
      doc.moveDown(0.5).fontSize(11).text('Descripción:', { underline: true });
      doc.fontSize(10).text(item.descripcion || 'Sin descripción');
      doc.moveDown(1).text('----------------------------------------').moveDown(1);
    });

    doc.end();
    pdfStream.on('finish', () => {
      console.log('✅ PDF generado correctamente.');
    });
  }

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
    console.warn('⚠ No se encontraron vacantes.');
  }
}

main();
