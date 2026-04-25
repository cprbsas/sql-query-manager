// Backup: export, import (restore) y reset

import { state, saveState, resetState, replaceFromBackup } from '../state.js';
import { isValidBackup, formatBytes } from '../utils.js';
import { MAX_IMPORT_FILE_SIZE } from '../config.js';
import { confirmDialog } from './confirm.js';
import { showToast } from './toast.js';
import { isDriveConnected } from '../drive.js';

export function exportBackup() {
  const data = JSON.stringify({
    queries: state.queries,
    categories: state.categories,
    databases: state.databases,
    exportedAt: new Date().toISOString(),
  }, null, 2);

  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const now = new Date();
  const dt = now.toISOString().slice(0, 10);
  const hr = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
  a.download = `sql_queries_backup_${dt}_${hr}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showToast('backup exportado');
}

export function importBackup(e, rerender) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > MAX_IMPORT_FILE_SIZE) {
    showToast(`Archivo demasiado grande (${formatBytes(file.size)})`, 'error');
    e.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => showToast('Error leyendo archivo', 'error');
  reader.onload = async (ev) => {
    let data;
    try {
      data = JSON.parse(ev.target.result);
    } catch {
      showToast('error al parsear JSON', 'error');
      return;
    }
    if (!isValidBackup(data)) {
      showToast('formato de backup inválido', 'error');
      return;
    }
    const ok = await confirmDialog(
      `Esto reemplazará todos tus datos locales actuales con ${data.queries.length} consultas del backup. ¿Continuar?`,
      { title: 'Restaurar backup', confirmText: 'Restaurar', danger: true }
    );
    if (!ok) return;

    const result = replaceFromBackup(data, { regenerateIds: true });
    // replaceFromBackup puede devolver Promise si regenerateIds=true
    if (result && typeof result.then === 'function') {
      await result;
    }
    saveState();
    rerender();
    showToast(`${data.queries.length} consultas restauradas`);
  };
  reader.readAsText(file);
  e.target.value = '';
}

export async function resetAll(rerender) {
  const driveWarning = isDriveConnected()
    ? '\n\nNota: los datos en Google Drive NO se borrarán. Al sincronizar volverán a bajarse.'
    : '';
  const ok = await confirmDialog(
    `¿Eliminar TODOS los datos locales?${driveWarning}`,
    { title: 'Reset total', confirmText: 'Eliminar todo', danger: true }
  );
  if (!ok) return;
  resetState();
  rerender();
  showToast('datos reiniciados', 'warn');
}
