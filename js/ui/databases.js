// Panel de bases de datos

import { state, saveState } from '../state.js';
import { esc } from '../utils.js';
import { confirmDialog, promptDialog } from './confirm.js';
import { showToast } from './toast.js';

export function renderDatabasesPanel() {
  return `
    <h2 class="panel-title">// Bases de datos</h2>
    <div class="form-row" style="margin-bottom:14px">
      <input id="new-db-input" type="text" placeholder="nueva base de datos..." aria-label="Nueva base de datos">
      <button type="button" class="btn btn-primary" data-action="add-db" style="white-space:nowrap">+ crear</button>
    </div>
    ${state.databases.map((db, idx) => {
      const count = state.queries.filter(q => q.databases.includes(db)).length;
      return `<div class="item-row">
        <span class="tag tag-green">${esc(db)}</span>
        <span class="item-count">${count} ${count === 1 ? 'consulta' : 'consultas'}</span>
        <button type="button" class="btn btn-sm" data-action="edit-db" data-idx="${idx}">edit</button>
        <button type="button" class="btn btn-sm btn-danger" data-action="delete-db" data-idx="${idx}">del</button>
      </div>`;
    }).join('')}
  `;
}

export function addDatabase(rerender) {
  const input = document.getElementById('new-db-input');
  if (!input) return;
  const val = input.value.trim();
  if (val && !state.databases.includes(val)) {
    state.databases.push(val);
    saveState();
    rerender();
    showToast('base de datos agregada');
  }
}

export async function editDatabasePrompt(idx, rerender) {
  const oldName = state.databases[idx];
  const newName = await promptDialog('Nuevo nombre de la base de datos:', {
    title: 'Renombrar base de datos',
    defaultValue: oldName,
  });
  if (!newName) return;
  const trimmed = newName.trim();
  if (!trimmed || trimmed === oldName) return;
  if (state.databases.includes(trimmed)) {
    showToast('Esa base de datos ya existe', 'error');
    return;
  }
  state.databases[idx] = trimmed;
  state.queries.forEach(q => {
    q.databases = q.databases.map(d => d === oldName ? trimmed : d);
  });
  saveState();
  rerender();
  showToast('base de datos actualizada');
}

export async function deleteDatabase(idx, rerender) {
  const db = state.databases[idx];
  const count = state.queries.filter(q => q.databases.includes(db)).length;
  if (count > 0) {
    const ok = await confirmDialog(
      `${count} consultas asociadas a "${db}". ¿Eliminar la base de datos de todos modos?`,
      { title: 'Eliminar base de datos', confirmText: 'Eliminar', danger: true }
    );
    if (!ok) return;
  }
  state.databases.splice(idx, 1);
  saveState();
  rerender();
  showToast('base de datos eliminada', 'warn');
}
