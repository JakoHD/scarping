import { scrapeOCC } from '../scrape.js';

export default async function handler(req, res) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Manejar preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { searchTerm } = req.body;

    if (!searchTerm || !searchTerm.trim()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Término de búsqueda requerido' 
      });
    }

    console.log(`Buscando: ${searchTerm}`);
    
    // Llamar a la función del scraper con la bandera de Vercel
    const results = await scrapeOCC(searchTerm.trim(), true);
    
    if (results.length === 0) {
      return res.json({ 
        success: false, 
        error: 'No se encontraron vacantes' 
      });
    }

    console.log(`Se encontraron ${results.length} vacantes`);
    
    res.json({ 
      success: true, 
      message: `Se encontraron ${results.length} vacantes`,
      count: results.length,
      results: results
    });

  } catch (error) {
    console.error('Error en la búsqueda:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error al procesar la búsqueda: ' + error.message 
    });
  }
}
