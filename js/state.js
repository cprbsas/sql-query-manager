// Estado central de la app + persistencia en localStorage

import { STORAGE_KEY, DEFAULT_CATEGORIES, DEFAULT_DATABASES } from './config.js';
import { isValidBackup } from './utils.js';

export const state = {
  queries: [],
  categories: [],
  databases: [],
  dictionaries: [],          // diccionarios de bases de datos importados desde Excel
  activeTab: 'queries',
  search: '',
  filterCat: '',
  filterDb: '',
  sortField: 'createdAt',
  sortDir: 'desc',
  // Estado UI específico del módulo diccionarios (no se persiste)
  dictSearch: '',
  dictActiveId: null,
  // Hook que dispara saveState automático cuando cambian los datos persistidos
  // (lo establece main.js — desacoplamos de Drive aquí)
  _onPersist: null,
};

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state.queries = Array.isArray(parsed.queries) ? parsed.queries : [];
      state.categories = Array.isArray(parsed.categories) ? parsed.categories : [];
      state.databases = Array.isArray(parsed.databases) ? parsed.databases : [];
      state.dictionaries = Array.isArray(parsed.dictionaries) ? parsed.dictionaries : [];
    } else {
      state.categories = [...DEFAULT_CATEGORIES];
      state.databases = [...DEFAULT_DATABASES];
      state.dictionaries = [];
    }
  } catch (err) {
    console.error('Error cargando estado local:', err);
    state.categories = [...DEFAULT_CATEGORIES];
    state.databases = [...DEFAULT_DATABASES];
    state.dictionaries = [];
  }
}

/**
 * Persiste los datos en localStorage. Maneja QuotaExceededError.
 * Devuelve true si se guardó, false si falló.
 */
export function saveState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        queries: state.queries,
        categories: state.categories,
        databases: state.databases,
        dictionaries: state.dictionaries,
        savedAt: new Date().toISOString(),
      })
    );
    if (typeof state._onPersist === 'function') state._onPersist();
    return true;
  } catch (err) {
    if (err && (err.name === 'QuotaExceededError' || err.code === 22)) {
      console.error('Cuota de localStorage agotada:', err);
      // Importamos toast dinámicamente para evitar dependencia circular
      import('./ui/toast.js').then(m => m.showToast('Almacenamiento lleno. Exporta y limpia.', 'error'));
    } else {
      console.error('Error guardando estado:', err);
    }
    return false;
  }
}

/**
 * Lee directamente lo persistido sin tocar el state actual.
 * Útil para comparar versiones local vs Drive.
 */
export function readPersistedRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Reemplaza completamente los datos del state desde un backup válido.
 */
export function replaceFromBackup(backup, { regenerateIds = false } = {}) {
  if (!isValidBackup(backup)) return false;
  if (regenerateIds) {
    // Importación dinámica para evitar dep circular (genId vive en utils)
    return import('./utils.js').then(({ genId }) => {
      state.queries = backup.queries.map(q => ({ ...q, id: genId() }));
      state.categories = backup.categories.length ? [...backup.categories] : [];
      state.databases = backup.databases.length ? [...backup.databases] : [];
      state.dictionaries = Array.isArray(backup.dictionaries)
        ? backup.dictionaries.map(d => ({ ...d, id: genId() }))
        : [];
      return true;
    });
  }
  state.queries = [...backup.queries];
  state.categories = backup.categories.length ? [...backup.categories] : [];
  state.databases = backup.databases.length ? [...backup.databases] : [];
  state.dictionaries = Array.isArray(backup.dictionaries) ? [...backup.dictionaries] : [];
  return true;
}

/**
 * Resetea a defaults locales.
 */
export function resetState() {
  state.queries = [];
  state.categories = [...DEFAULT_CATEGORIES];
  state.databases = [...DEFAULT_DATABASES];
  state.dictionaries = [];
  localStorage.removeItem(STORAGE_KEY);
}
