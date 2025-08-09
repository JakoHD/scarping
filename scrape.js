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

export async function scrapeOCC(searchTerm, isVercel = false) {
  let browser;
  
  if (isVercel) {
    // Configuración especial para Vercel
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1400,900'
      ],
      defaultViewport: { width: 1400, height: 900 }
    });
  } else {
    // Configuración para desarrollo local
    browser = await puppeteer.launch({
      headless: "new",
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

  // Poner un User-Agent para que parezca un navegador real
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
  );

  // Eliminar la variable que delata la automatización
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  await page.goto(OCC_URL, { waitUntil: 'networkidle2' });

  // Este cambio hace que espere el input de búsqueda o el input alternativo
  await page.waitForSelector('#prof-cat-search-input-desktop, #search-input', { timeout: 20000 });

  // Si existe el input de escritorio, úsalo; si no, el otro
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
          // Extraer nombre de la vacante
          const nombreElement = await card.$('h3, .job-title, [data-testid="job-title"]');
          if (nombreElement) {
            nombreVacante = await nombreElement.evaluate(el => el.textContent.trim());
          }

          // Extraer empresa
          const empresaElement = await card.$('.company-name, [data-testid="company-name"], .employer-name');
          if (empresaElement) {
            empresa = await empresaElement.evaluate(el => el.textContent.trim());
          }

          // Extraer ubicación
          const ubicacionElement = await card.$('.location, [data-testid="location"], .job-location');
          if (ubicacionElement) {
            ubicacion = await ubicacionElement.evaluate(el => el.textContent.trim());
          }

          // Extraer sueldo
          const sueldoElement = await card.$('.salary, [data-testid="salary"], .job-salary');
          if (sueldoElement) {
            sueldo = await sueldoElement.evaluate(el => el.textContent.trim());
          }

          // Verificar si está verificada
          const verificadaElement = await card.$('.verified, [data-testid="verified"]');
          if (verificadaElement) {
            verificada = true;
          }

          // Intentar extraer descripción
          const descripcionElement = await card.$('.description, [data-testid="description"], .job-description');
          if (descripcionElement) {
            descripcion = await descripcionElement.evaluate(el => el.textContent.trim());
          }

          // Extraer información adicional sobre el empleo
          const sobreEmpleoElements = await card.$$('.job-details, [data-testid="job-details"] .detail-item');
          for (const element of sobreEmpleoElements) {
            const text = await element.evaluate(el => el.textContent.trim());
            if (text.includes(':')) {
              const [key, value] = text.split(':').map(s => s.trim());
              sobreElEmpleo[key] = value;
            }
          }

          // Extraer detalles adicionales
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

      // Verificar si hay siguiente página
      const nextButton = await page.$('button[aria-label="Siguiente"], .pagination-next, [data-testid="next-page"]');
      if (nextButton && pageNum < 5) { // Limitar a 5 páginas para evitar timeouts
        const isDisabled = await nextButton.evaluate(button => {
          return button.disabled || button.classList.contains('disabled');
        });
        
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

  // Solo escribir archivos si no estamos en Vercel
  if (!isVercel) {
    // Guardar JSON
    fs.writeFileSync('resultados.json', JSON.stringify(results, null, 2), 'utf-8');
    console.log(`✅ Se guardaron ${results.length} resultados en resultados.json`);

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

    // CSV
    if (datosPlano.length > 0) {
      const json2csvParser = new Json2csvParser({ fields: Object.keys(datosPlano[0]) });
      const csv = json2csvParser.parse(datosPlano);
      fs.writeFileSync('resultados.csv', csv, 'utf-8');
      console.log('✅ Se guardó el archivo CSV: resultados.csv');
    }

    // Excel
    if (datosPlano.length > 0) {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(datosPlano);
      XLSX.utils.book_append_sheet(wb, ws, 'Vacantes');
      XLSX.writeFile(wb, 'resultados.xlsx');
      console.log('✅ Se guardó el archivo Excel: resultados.xlsx');
    }

    // PDF
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

main();