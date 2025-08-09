import readline from 'readline';
import fs from 'fs';
import { Parser as Json2csvParser } from 'json2csv';
import XLSX from 'xlsx';
import PDFDocument from 'pdfkit';

const isVercel = process.env.VERCEL === '1' || process.env.NOW_REGION;

let puppeteer;
let chromium;
if (isVercel) {
  // En Vercel: usar puppeteer-core + chromium-aws-lambda (@sparticuz/chromium)
  puppeteer = await import('puppeteer-core').then(m => m.default || m);
  chromium = await import('@sparticuz/chromium');
} else {
  puppeteer = await import('puppeteer').then(m => m.default || m);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

const OCC_URL = 'https://www.occ.com.mx/';

export async function scrapeOCC(searchTerm, forceVercel = false) {
  const runOnVercel = forceVercel || isVercel;
  let browser;

  if (runOnVercel) {
    const executablePath = await chromium.executablePath();
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: chromium.args,
      defaultViewport: { width: 1400, height: 900 }
    });
  } else {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1400,900'
      ],
      defaultViewport: { width: 1400, height: 900 }
    });
  }

  const page = await browser.newPage();

  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
  );

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  await page.goto(OCC_URL, { waitUntil: 'networkidle2' });

  await page.waitForSelector('#prof-cat-search-input-desktop, #search-input', { timeout: 20000 });

  if (await page.$('#prof-cat-search-input-desktop') !== null) {
    await page.type('#prof-cat-search-input-desktop', searchTerm);
  } else {
    await page.type('#search-input', searchTerm);
  }

  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForSelector('div[id^="jobcard-"]', { timeout: 20000 })
  ]);

  let results = [];
  let hasNextPage = true;
  let pageNum = 1;

  while (hasNextPage) {
    console.log(`📄 Procesando página ${pageNum}...`);
    try {
      await page.waitForSelector('div[id^="jobcard-"]', { timeout: 15000 });
      const jobCards = await page.$$('div[id^="jobcard-"]');

      console.log(`   ➡ ${jobCards.length} vacantes encontradas en esta página.`);

      for (let i = 0; i < jobCards.length; i++) {
        const card = jobCards[i];
        let nombreVacante = '';
        let empresa = '';
        let ubicacion = '';
        let sueldo = '';
        let verificada = false;
        let descripcion = '';
        let sobreElEmpleo = {};
        let detalles = {};

        try {
          const nombreElement = await card.$('h3, .job-title, [data-testid="job-title"]');
          if (nombreElement) {
            nombreVacante = await nombreElement.evaluate(el => el.textContent.trim());
          }

          const empresaElement = await card.$('.company-name, [data-testid="company-name"], .employer-name');
          if (empresaElement) {
            empresa = await empresaElement.evaluate(el => el.textContent.trim());
          }

          const ubicacionElement = await card.$('.location, [data-testid="location"], .job-location');
          if (ubicacionElement) {
            ubicacion = await ubicacionElement.evaluate(el => el.textContent.trim());
          }

          const sueldoElement = await card.$('.salary, [data-testid="salary"], .job-salary');
          if (sueldoElement) {
            sueldo = await sueldoElement.evaluate(el => el.textContent.trim());
          }

          const verificadaElement = await card.$('.verified, [data-testid="verified"]');
          if (verificadaElement) {
            verificada = true;
          }

          const descripcionElement = await card.$('.description, [data-testid="description"], .job-description');
          if (descripcionElement) {
            descripcion = await descripcionElement.evaluate(el => el.textContent.trim());
          }

          const sobreEmpleoElements = await card.$$('.job-details, [data-testid="job-details"] .detail-item');
          for (const element of sobreEmpleoElements) {
            const text = await element.evaluate(el => el.textContent.trim());
            if (text.includes(':')) {
              const [key, value] = text.split(':').map(s => s.trim());
              sobreElEmpleo[key] = value;
            }
          }

          const detallesElements = await card.$$('.job-info, [data-testid="job-info"] .info-item');
          for (const element of detallesElements) {
            const text = await element.evaluate(el => el.textContent.trim());
            if (text.includes(':')) {
              const [key, value] = text.split(':').map(s => s.trim());
              detalles[key] = value;
            }
          }

        } catch (error) {
          console.log(`   ⚠ Error al procesar vacante ${i + 1}: ${error.message}`);
        }

        if (nombreVacante) {
          results.push({
            nombreVacante,
            empresa: empresa || 'La empresa es confidencial o no se encuentra disponible',
            ubicacion,
            sueldo,
            verificada,
            descripcion,
            sobreElEmpleo,
            detalles
          });
        }
      }

      const nextButton = await page.$('button[aria-label="Siguiente"], .pagination-next, [data-testid="next-page"]');
      if (nextButton && pageNum < 5) {
        const isDisabled = await nextButton.evaluate(button => button.disabled || button.classList.contains('disabled'));
        if (!isDisabled) {
          await nextButton.click();
          await page.waitForTimeout(2000);
          pageNum++;
        } else {
          hasNextPage = false;
        }
      } else {
        hasNextPage = false;
      }

    } catch (error) {
      console.log(`   ⚠ Error en página ${pageNum}: ${error.message}`);
      hasNextPage = false;
    }
  }

  await browser.close();

  if (!runOnVercel) {
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

    if (datosPlano.length > 0) {
      const json2csvParser = new Json2csvParser({ fields: Object.keys(datosPlano[0]) });
      const csv = json2csvParser.parse(datosPlano);
      fs.writeFileSync('resultados.csv', csv, 'utf-8');

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(datosPlano);
      XLSX.utils.book_append_sheet(wb, ws, 'Vacantes');
      XLSX.writeFile(wb, 'resultados.xlsx');

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
        pdfStream.on('finish', () => console.log('✅ PDF generado'));
      } catch (error) {
        console.error('❌ Error al generar PDF:', error.message);
      }

      fs.writeFileSync('resultados.json', JSON.stringify(results, null, 2), 'utf-8');
    }
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
    console.warn('⚠ No se encontraron vacantes o algo salió mal.');
  }
}

if (process.env.NODE_ENV !== 'production') {
  // Evitar ejecutar main() en Vercel
  main();
}