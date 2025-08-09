# Scrapin-OCC

Scraper de OCC (OCC Mundial) usando Puppeteer con interfaz web.

## 🚀 Despliegue en Vercel

Este proyecto está configurado para desplegarse fácilmente en Vercel.

### Estructura del Proyecto

```
Scrapin-OCC/
├── api/                    # Funciones serverless de Vercel
│   └── scrape.js          # Endpoint para el scraper
├── web-interface/         # Interfaz web
│   ├── index.html         # Página principal
│   ├── server.js          # Servidor Express
│   └── ...
├── scrape.js              # Lógica del scraper
├── vercel.json           # Configuración de Vercel
├── package.json          # Dependencias del proyecto
└── README.md             # Este archivo
```

### Pasos para Desplegar

1. **Instalar Vercel CLI** (opcional):
   ```bash
   npm i -g vercel
   ```

2. **Conectar con Vercel**:
   - Ve a [vercel.com](https://vercel.com)
   - Crea una cuenta o inicia sesión
   - Conecta tu repositorio de GitHub/GitLab/Bitbucket

3. **Desplegar**:
   - Si usas Vercel CLI:
     ```bash
     vercel
     ```
   - Si usas la interfaz web:
     - Importa tu repositorio
     - Vercel detectará automáticamente la configuración

4. **Variables de Entorno** (opcional):
   - En el dashboard de Vercel, ve a Settings > Environment Variables
   - Agrega cualquier variable de entorno necesaria

### Configuración

El proyecto incluye:

- **`vercel.json`**: Configuración de rutas y builds
- **`api/scrape.js`**: Endpoint serverless para el scraper
- **`web-interface/server.js`**: Servidor Express para la interfaz web

### Uso

Una vez desplegado, puedes:

1. Acceder a la interfaz web en la URL de Vercel
2. Usar el endpoint API directamente: `https://tu-proyecto.vercel.app/api/scrape`
3. Integrar el scraper en otras aplicaciones

### Notas Importantes

- El scraper usa Puppeteer con configuración especial para Vercel
- Los archivos se generan solo en desarrollo local (no en Vercel)
- El proyecto está limitado a 5 páginas por búsqueda para evitar timeouts
- Se requiere Node.js 18+ para el despliegue

### Desarrollo Local

```bash
# Instalar dependencias
npm install

# Ejecutar en desarrollo
npm run dev
```

### Troubleshooting

- Si hay problemas con Puppeteer en Vercel, revisa los logs en el dashboard
- Asegúrate de que todas las dependencias estén en `package.json`
- Verifica que la versión de Node.js sea compatible (18+)
