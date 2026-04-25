# Biblioteca de consultas SQL — v2.0.0

Refactor completo de la app: arquitectura modular con ES modules, PWA con offline, accesibilidad, mejor manejo de Drive sync.

## Estructura

```
/
├── index.html                  Entrada con CSP y cache busting
├── manifest.webmanifest        PWA manifest
├── sw.js                       Service Worker (offline shell)
├── css/
│   └── styles.css              Estilos (incluye adiciones v2)
└── js/
    ├── main.js                 Entry point ES module
    ├── config.js               Constantes
    ├── state.js                Estado + persistencia local
    ├── drive.js                OAuth + sync con Google Drive
    ├── sql.js                  highlightSQL + formatSQL
    ├── csv.js                  parseCSV (soporta multilínea)
    ├── utils.js                Helpers: esc, debounce, genId, etc.
    └── ui/
        ├── render.js           Render principal + event delegation
        ├── modal.js            Modal accesible (focus trap, aria)
        ├── confirm.js          confirmDialog/promptDialog (reemplazan nativos)
        ├── toast.js            Toasts con cola
        ├── queries.js          CRUD de consultas
        ├── categories.js       Panel categorías
        ├── databases.js        Panel bases de datos
        ├── import.js           Import individual + batch CSV
        └── backup.js           Export / restore / reset
```

## Cambios en esta versión

### Seguridad
- **CSP por meta tag** — restringe scripts/conexiones a fuentes confiables.
- **Revoke real de token Drive** al desconectar (antes solo se borraba localmente).
- **Filtro `'me' in owners`** en búsqueda de Drive — evita encontrar archivos compartidos.
- **`crypto.randomUUID()`** para IDs (antes `Date.now()++` con riesgo de colisión).
- Cache busting con `?v=2.0.0` en assets.

### UX / Accesibilidad
- Reemplazo de `confirm()` y `prompt()` nativos por modales propios (mejor en móvil).
- Focus trap en modales; `Escape` cierra; `aria-modal`, `aria-labelledby`.
- Tarjetas de queries activables con teclado (Enter/Espacio).
- `aria-pressed`, `aria-label` en botones; `role` apropiados.
- Soporte `prefers-reduced-motion`.
- Búsqueda con debounce (180ms).

### Sincronización Drive
- Mejor merge: ya **no sobrescribe local silenciosamente** si Drive es más reciente.
- Detección de cambios reales: si local y Drive son idénticos, no pregunta.
- `fetch keepalive` en `pagehide`/`beforeunload` para no perder el último cambio.
- Mejor manejo de errores 401 (token expirado) y 404 (archivo movido).

### Calidad de código
- Modular en 16 archivos pequeños (antes: 1 archivo de 403 líneas minificado).
- Event delegation en lugar de `onclick` inline → CSP más estricta posible.
- Validación de tamaño en archivos importados (5 MB / 10 MB).
- Toast queue (no se pisan los mensajes).
- Manejo de `QuotaExceededError` en localStorage.
- Parser CSV soporta saltos de línea dentro de campos.

### PWA
- Service Worker con app shell pre-cacheado.
- Funciona offline una vez visitada.
- Instalable en iOS/Android desde el navegador.
- Manifest con iconos SVG inline.

## Despliegue en GitHub Pages

1. Sube todos los archivos a tu repo manteniendo la estructura.
2. En **Settings → Pages**, selecciona la rama y carpeta raíz.
3. **Importante**: en Google Cloud Console, verifica que "Authorized JavaScript origins" tenga:
   - `https://tu-usuario.github.io` (tu dominio de Pages, sin path, sin trailing slash)
   - `http://localhost:8080` (o el puerto que uses para pruebas locales)

## Pruebas locales

Como la app usa ES modules, **debes servirla desde un servidor HTTP** (no funciona con `file://`):

```bash
# Python 3
cd ruta/al/proyecto
python -m http.server 8080

# Node
npx serve .

# VSCode: extensión "Live Server"
```

Abre `http://localhost:8080`.

## Actualizar a una nueva versión

Cada vez que hagas cambios y quieras invalidar caché:

1. Cambia `APP_VERSION` en `js/config.js`.
2. Cambia `CACHE_VERSION` en `sw.js`.
3. Cambia los `?v=2.0.0` en `index.html`.

Idealmente las tres en sincronía.

## Tests rápidos manuales

- [ ] Crear consulta, editar, eliminar
- [ ] Filtrar por categoría y BD
- [ ] Buscar (probar con debounce)
- [ ] Conectar Drive, esperar sync, desconectar (verificar que en Google se revoca)
- [ ] Cargar CSV batch con SQL multilínea
- [ ] Exportar backup, recargar, restaurar
- [ ] Probar offline: abrir, desactivar red, recargar — debe seguir funcionando
- [ ] Tab navigation: navegar toda la UI sin mouse
- [ ] Escape cierra modales
