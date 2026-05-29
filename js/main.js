// Entry point — orquesta carga inicial, sync de Drive y service worker

import { state, loadState } from './state.js';
import { initDriveLocal, scheduleDriveSync, flushOnUnload, setDriveRerender } from './drive.js';
import { render } from './ui/render.js';
import { setViewRerender } from './ui/dictionaries.js';

// Hook: cuando saveState() persista, dispara sync a Drive
state._onPersist = () => scheduleDriveSync();

// Inicialización
loadState();
initDriveLocal();
setDriveRerender(render);   // permite que drive.js refresque la UI tras cargar
setViewRerender(render);    // permite que la ficha de tabla refresque tras editar/eliminar
render();

// Salvar cambios pendientes al cerrar
// (visibilitychange es más confiable que beforeunload en móviles)
window.addEventListener('pagehide', flushOnUnload);
window.addEventListener('beforeunload', flushOnUnload);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushOnUnload();
});

// Service worker para PWA + offline
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('SW register failed:', err);
    });
  });
}
