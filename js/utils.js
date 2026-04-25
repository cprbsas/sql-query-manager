// Helpers utilitarios reutilizables

/**
 * Escapa una cadena para insertarla como texto en HTML.
 */
export function esc(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

/**
 * Genera un ID único usando crypto.randomUUID con fallback.
 */
export function genId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `q_${crypto.randomUUID()}`;
  }
  // Fallback para navegadores muy viejos
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Devuelve una versión debounced de fn — la última llamada se ejecuta tras `wait` ms de inactividad.
 */
export function debounce(fn, wait) {
  let timer = null;
  const debounced = function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
  debounced.cancel = () => clearTimeout(timer);
  debounced.flush = function (...args) {
    clearTimeout(timer);
    fn.apply(this, args);
  };
  return debounced;
}

/**
 * Formatea bytes en una cadena legible.
 */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Normaliza una cadena para comparar sin acentos / case-insensitive.
 */
export function normalize(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Comparador de strings respetando locale español.
 */
export function compareStrings(a, b) {
  return String(a || '').toLowerCase().localeCompare(String(b || '').toLowerCase(), 'es');
}

/**
 * Valida que un objeto tenga la forma de un backup válido.
 */
export function isValidBackup(data) {
  return (
    data &&
    typeof data === 'object' &&
    Array.isArray(data.queries) &&
    Array.isArray(data.categories) &&
    Array.isArray(data.databases)
  );
}

/**
 * Formatea una fecha ISO a la forma local española.
 */
export function formatDate(iso, opts = { day: '2-digit', month: 'short', year: 'numeric' }) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('es-CO', opts);
  } catch {
    return '';
  }
}

/**
 * Formatea un timestamp completo (fecha + hora).
 */
export function formatDateTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('es-CO');
  } catch {
    return '';
  }
}
