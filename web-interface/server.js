import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import fetch from 'node-fetch';
import { scrapeOCC } from '../scrape.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Servir el archivo HTML principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Servir vacantes.html
app.get('/vacantes', (req, res) => {
    res.sendFile(path.join(__dirname, 'vacantes.html'));
});

app.get('/vacantes.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'vacantes.html'));
});

// Endpoint para buscar - invoca directamente el scraper (modo Vercel)
app.post('/search', async (req, res) => {
    try {
        const { searchTerm } = req.body;
        
        if (!searchTerm || !searchTerm.trim()) {
            return res.json({ success: false, error: 'Término de búsqueda requerido' });
        }

        console.log(`Buscando: ${searchTerm}`);

        const results = await scrapeOCC(searchTerm.trim(), true);

        if (!Array.isArray(results) || results.length === 0) {
            return res.json({ success: false, error: 'No se encontraron vacantes' });
        }

        console.log(`Se encontraron ${results.length} vacantes`);
        
        res.json({ 
            success: true, 
            message: `Se encontraron ${results.length} vacantes`,
            count: results.length,
            results
        });

    } catch (error) {
        console.error('Error en la búsqueda:', error);
        res.json({ success: false, error: 'Error al procesar la búsqueda: ' + error.message });
    }
});

// Servir resultados.json desde la raíz del proyecto
app.get('/resultados.json', (req, res) => {
  const filePath = path.join(__dirname, 'resultados.json');
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send({ error: 'No hay resultados.json' });
  }
});

// Servir otros archivos de resultados
app.get('/resultados.csv', (req, res) => {
  const filePath = path.join(__dirname, 'resultados.csv');
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send({ error: 'No hay resultados.csv' });
  }
});

app.get('/resultados.xlsx', (req, res) => {
  const filePath = path.join(__dirname, 'resultados.xlsx');
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send({ error: 'No hay resultados.xlsx' });
  }
});

app.get('/resultados.pdf', (req, res) => {
  const filePath = path.join(__dirname, 'resultados.pdf');
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send({ error: 'No hay resultados.pdf' });
  }
});

// Endpoint proxy para geocodificación con LocationIQ
app.get('/geocode', async (req, res) => {
    const { q } = req.query;
    if (!q) {
        return res.status(400).json({ error: 'Falta el parámetro q' });
    }
    // PON AQUÍ TU API KEY DE LOCATIONIQ
    const apiKey = 'pk.8e189bb0bea1772e515ad047bed32836'; // <-- Reemplaza esto por tu API key real
    const url = `https://us1.locationiq.com/v1/search.php?key=${apiKey}&q=${encodeURIComponent(q)}&countrycodes=mx&format=json&limit=1&addressdetails=1`;
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Scrapin-OCC/1.0 (tuemail@dominio.com)'
            }
        });
        if (!response.ok) {
            return res.status(500).json({ error: 'Error al consultar LocationIQ' });
        }
        const data = await response.json();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Error al buscar la ubicación' });
    }
});

// Iniciar el servidor solo si no estamos en producción (Vercel)
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
        console.log(`Abre tu navegador y ve a: http://localhost:${PORT}`);
    });
}

// Exportar la app para Vercel
export default app; 