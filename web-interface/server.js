import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { scrapeOCC } from '../scrape.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Servir el archivo HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Endpoint para buscar
app.post('/search', async (req, res) => {
    try {
        const { searchTerm } = req.body;
        
        if (!searchTerm || !searchTerm.trim()) {
            return res.json({ success: false, error: 'Término de búsqueda requerido' });
        }

        console.log(`Buscando: ${searchTerm}`);
        
        // Llamar a la función del scraper
        const results = await scrapeOCC(searchTerm.trim());
        
        if (results.length === 0) {
            return res.json({ success: false, error: 'No se encontraron vacantes' });
        }

        console.log(`Se encontraron ${results.length} vacantes`);
        
        res.json({ 
            success: true, 
            message: `Se encontraron ${results.length} vacantes y se generaron los archivos`
        });

    } catch (error) {
        console.error('Error en la búsqueda:', error);
        res.json({ success: false, error: 'Error al procesar la búsqueda' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
    console.log(`Abre tu navegador y ve a: http://localhost:${PORT}`);
}); 