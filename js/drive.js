// Integración con Google Drive (OAuth + sync)

import {
  GDRIVE_CLIENT_ID, GDRIVE_SCOPE, GDRIVE_FILENAME,
  DRIVE_FILEID_KEY, DRIVE_USER_KEY, STORAGE_KEY,
  DRIVE_SYNC_DEBOUNCE_MS,
} from './config.js';
import { state, saveState, readPersistedRaw } from './state.js';
import { isValidBackup, formatDateTime } from './utils.js';
import { showToast } from './ui/toast.js';
import { confirmDialog } from './ui/confirm.js';

// Hook para re-render — lo establece main.js para evitar dep circular
let _rerender = null;
export function setDriveRerender(fn) { _rerender = fn; }
function doRerender() { if (typeof _rerender === 'function') _rerender(); }

// Estado interno encapsulado
const drive = {
  token: null,
  fileId: null,
  status: 'disconnected',  // disconnected | syncing | connected | error
  userName: '',
  syncTimer: null,
  errorDetail: '',
};

// Listener de cambio de estado (lo registra render.js)
let onStatusChange = null;
export function onDriveStatusChange(cb) { onStatusChange = cb; }
function notify() { if (typeof onStatusChange === 'function') onStatusChange(getDriveStatusInfo()); }

export function getDriveStatusInfo() {
  if (drive.status === 'syncing') return { label: 'Sincronizando…', cls: 'syncing', title: '' };
  if (drive.status === 'error') return { label: 'Error — Reintentar', cls: 'error', title: drive.errorDetail || 'Error de sincronización' };
  if (drive.status === 'connected') return { label: drive.userName || 'Drive OK', cls: 'connected', title: 'Conectado a Google Drive' };
  if (drive.userName) return { label: `↩ Reconectar (${drive.userName})`, cls: '', title: 'Reconectar a Google Drive' };
  return { label: 'Conectar Drive', cls: '', title: 'Conectar a Google Drive' };
}

export function isDriveConnected() { return drive.status === 'connected'; }
export function getDriveToken() { return drive.token; }
export function getDriveFileId() { return drive.fileId; }

export function initDriveLocal() {
  drive.fileId = localStorage.getItem(DRIVE_FILEID_KEY) || null;
  drive.userName = localStorage.getItem(DRIVE_USER_KEY) || '';
  drive.status = 'disconnected';
  drive.token = null;
}

export async function connectDrive() {
  // Si ya conectado, desconectar (con revoke real)
  if (drive.status === 'connected') {
    const confirmed = await confirmDialog(
      `¿Desconectar de Google Drive (${drive.userName})?\nTus datos locales se mantienen.`,
      { title: 'Desconectar Drive', confirmText: 'Desconectar', danger: true }
    );
    if (!confirmed) return;
    await disconnectDrive();
    return;
  }

  // Conectar
  if (!window.google || !window.google.accounts) {
    showToast('Google Identity no disponible', 'error');
    return;
  }

  try {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GDRIVE_CLIENT_ID,
      scope: GDRIVE_SCOPE,
      prompt: '',
      callback: async (tr) => {
        if (tr.error) {
          drive.status = 'disconnected';
          drive.errorDetail = tr.error_description || tr.error;
          notify();
          showToast(`Conexión cancelada: ${tr.error}`, 'error');
          return;
        }
        drive.token = tr.access_token;
        drive.status = 'syncing';
        notify();

        // Recupera info del usuario
        try {
          const res = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
            headers: { Authorization: `Bearer ${drive.token}` },
          });
          if (res.ok) {
            const u = await res.json();
            drive.userName = u.given_name || u.name || u.email || 'Usuario';
            localStorage.setItem(DRIVE_USER_KEY, drive.userName);
          }
        } catch (err) {
          // No fatal, seguimos
          console.warn('No se pudo obtener userinfo:', err);
        }

        await loadFromDrive();
      },
    });
    client.requestAccessToken();
  } catch (err) {
    console.error('Error inicializando OAuth:', err);
    drive.status = 'error';
    drive.errorDetail = err.message || 'Error desconocido';
    notify();
  }
}

/**
 * Desconecta y revoca el token en Google.
 */
export async function disconnectDrive() {
  const token = drive.token;
  drive.token = null;
  drive.fileId = null;
  drive.userName = '';
  drive.status = 'disconnected';
  drive.errorDetail = '';
  localStorage.removeItem(DRIVE_FILEID_KEY);
  localStorage.removeItem(DRIVE_USER_KEY);
  notify();

  // Revoke real — esto sí cierra la sesión OAuth
  if (token && window.google && window.google.accounts && window.google.accounts.oauth2) {
    try {
      await new Promise(resolve => {
        window.google.accounts.oauth2.revoke(token, () => resolve());
      });
    } catch (err) {
      console.warn('Error al revocar token:', err);
    }
  }
}

async function findOrCreateDriveFile() {
  // Búsqueda restringida a archivos propios y no-papelera
  const q = encodeURIComponent(`name='${GDRIVE_FILENAME}' and 'me' in owners and trashed=false`);
  const sr = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&spaces=drive`,
    { headers: { Authorization: `Bearer ${drive.token}` } }
  );
  if (!sr.ok) {
    if (sr.status === 401) throw new Error('401: token expirado');
    throw new Error(`Búsqueda Drive falló: ${sr.status}`);
  }
  const sd = await sr.json();
  if (sd.files && sd.files.length > 0) {
    drive.fileId = sd.files[0].id;
    localStorage.setItem(DRIVE_FILEID_KEY, drive.fileId);
    return drive.fileId;
  }

  // No existe, crearlo
  const cr = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${drive.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: GDRIVE_FILENAME, mimeType: 'application/json' }),
  });
  if (!cr.ok) throw new Error(`Crear archivo falló: ${cr.status}`);
  const cd = await cr.json();
  drive.fileId = cd.id;
  localStorage.setItem(DRIVE_FILEID_KEY, drive.fileId);
  return drive.fileId;
}

export async function loadFromDrive(rerender) {
  if (!drive.token) return;
  drive.status = 'syncing';
  notify();

  try {
    const fileId = drive.fileId || await findOrCreateDriveFile();
    if (!fileId) {
      drive.status = 'connected';
      notify();
      return;
    }

    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${drive.token}` } }
    );

    if (res.status === 404) {
      // El archivo desapareció — crear uno nuevo en el próximo save
      drive.fileId = null;
      localStorage.removeItem(DRIVE_FILEID_KEY);
      drive.status = 'connected';
      notify();
      scheduleDriveSync();
      return;
    }
    if (res.status === 401) {
      drive.token = null;
      drive.status = 'disconnected';
      drive.errorDetail = 'Sesión expirada';
      notify();
      showToast('Sesión de Drive expirada — vuelve a conectar', 'warn');
      return;
    }
    if (!res.ok) throw new Error(`Carga falló: ${res.status}`);

    const text = await res.text();
    if (!text || !text.trim().startsWith('{')) {
      // Archivo vacío o nuevo — subimos el local
      drive.status = 'connected';
      notify();
      await saveToDrive();
      showToast('Drive sincronizado');
      return;
    }

    const data = JSON.parse(text);
    if (!isValidBackup(data)) {
      drive.status = 'error';
      drive.errorDetail = 'Backup en Drive con formato inválido';
      notify();
      showToast('Backup de Drive con formato inválido', 'error');
      return;
    }

    if (!data.queries || data.queries.length === 0) {
      // Drive vacío — subir local
      drive.status = 'connected';
      notify();
      await saveToDrive();
      showToast('Drive sincronizado');
      return;
    }

    // Comparación local vs Drive
    const localData = readPersistedRaw();
    const driveDate = data.savedAt ? new Date(data.savedAt) : new Date(0);
    const localDate = localData && localData.savedAt ? new Date(localData.savedAt) : new Date(0);
    const localHas = localData && localData.queries && localData.queries.length > 0;

    if (localHas) {
      const sameContent = JSON.stringify(localData.queries) === JSON.stringify(data.queries) &&
                          JSON.stringify(localData.categories) === JSON.stringify(data.categories) &&
                          JSON.stringify(localData.databases) === JSON.stringify(data.databases);
      if (sameContent) {
        drive.status = 'connected';
        notify();
        return;
      }

      // Decidir merge
      if (localDate > driveDate) {
        const keepLocal = await confirmDialog(
          `Drive: ${data.queries.length} consultas (${formatDateTime(driveDate.toISOString())}).\n` +
          `Local: ${localData.queries.length} consultas (${formatDateTime(localDate.toISOString())}).\n\n` +
          `Tu copia local es más reciente. ¿Subirla a Drive?`,
          { title: 'Conflicto de sincronización', confirmText: 'Subir local a Drive', cancelText: 'Cargar Drive' }
        );
        if (keepLocal) {
          drive.status = 'connected';
          notify();
          await saveToDrive();
          showToast(`Drive actualizado con ${state.queries.length} consultas`);
          return;
        }
        // Si dice no -> cargamos drive (caemos al bloque siguiente)
      } else if (driveDate > localDate) {
        // Drive es más reciente — preguntar antes de sobrescribir local
        const accept = await confirmDialog(
          `Drive: ${data.queries.length} consultas (${formatDateTime(driveDate.toISOString())}).\n` +
          `Local: ${localData.queries.length} consultas (${formatDateTime(localDate.toISOString())}).\n\n` +
          `Drive tiene una versión más reciente. ¿Reemplazar local con Drive?`,
          { title: 'Conflicto de sincronización', confirmText: 'Reemplazar local', cancelText: 'Mantener local' }
        );
        if (!accept) {
          drive.status = 'connected';
          notify();
          await saveToDrive();
          showToast(`Drive actualizado con ${state.queries.length} consultas`);
          return;
        }
      }
    }

    // Cargar de Drive
    state.queries = data.queries;
    state.categories = data.categories.length ? data.categories : state.categories;
    state.databases = data.databases.length ? data.databases : state.databases;
    saveState();
    drive.status = 'connected';
    notify();
    doRerender();
    showToast(`Drive: ${state.queries.length} consultas cargadas`);
  } catch (err) {
    console.error('loadFromDrive:', err);
    if (err.message && err.message.includes('401')) {
      drive.token = null;
      drive.status = 'disconnected';
      drive.errorDetail = 'Sesión expirada';
    } else {
      drive.status = 'error';
      drive.errorDetail = err.message || 'Error desconocido';
    }
    notify();
  }
}

export async function saveToDrive() {
  if (!drive.token || drive.status === 'disconnected') return;
  try {
    const fileId = drive.fileId || await findOrCreateDriveFile();
    if (!fileId) return;
    const body = JSON.stringify({
      queries: state.queries,
      categories: state.categories,
      databases: state.databases,
      savedAt: new Date().toISOString(),
    });
    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${drive.token}`,
          'Content-Type': 'application/json',
        },
        body,
      }
    );
    if (!res.ok) {
      if (res.status === 401) {
        drive.token = null;
        drive.status = 'disconnected';
        drive.errorDetail = 'Sesión expirada';
      } else {
        drive.status = 'error';
        drive.errorDetail = `HTTP ${res.status}`;
      }
      notify();
      return;
    }
    drive.status = 'connected';
    drive.errorDetail = '';
    notify();
  } catch (err) {
    console.error('saveToDrive:', err);
    drive.status = 'error';
    drive.errorDetail = err.message || 'Error de red';
    notify();
  }
}

export function scheduleDriveSync() {
  clearTimeout(drive.syncTimer);
  drive.syncTimer = setTimeout(() => saveToDrive(), DRIVE_SYNC_DEBOUNCE_MS);
}

/**
 * Sync síncrono al cerrar la pestaña, usando fetch keepalive.
 * No espera respuesta, pero el navegador completa el envío.
 */
export function flushOnUnload() {
  if (!drive.token || drive.status === 'disconnected' || !drive.fileId) return;
  // Si hay un sync pendiente, lo cancelamos y enviamos ya
  clearTimeout(drive.syncTimer);
  try {
    fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${drive.fileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${drive.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          queries: state.queries,
          categories: state.categories,
          databases: state.databases,
          savedAt: new Date().toISOString(),
        }),
        keepalive: true,
      }
    );
  } catch (err) {
    // Sin chance de reportar al usuario, ya se está cerrando
    console.warn('flushOnUnload falló:', err);
  }
}
