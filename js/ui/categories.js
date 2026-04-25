// Panel de categorías

import { state, saveState } from '../state.js';
import { esc } from '../utils.js';
import { confirmDialog, promptDialog } from './confirm.js';
import { showToast } from './toast.js';

export function renderCategoriesPanel() {
  return `
    <h2 class="panel-title">// Categorías</h2>
    <div class="form-row" style="margin-bottom:14px">
      <input id="new-cat-input" type="text" placeholder="nueva categoría..." aria-label="Nueva categoría">
      <button type="button" class="btn btn-primary" data-action="add-cat" style="white-space:nowrap">+ crear</button>
    </div>
    ${state.categories.map((cat, idx) => {
      const count = state.queries.filter(q => q.category === cat).length;
      return `<div class="item-row">
        <span class="tag tag-purple">${esc(cat)}</span>
        <span class="item-count">${count} ${count === 1 ? 'consulta' : 'consultas'}</span>
        <button type="button" class="btn btn-sm" data-action="edit-cat" data-idx="${idx}">edit</button>
        <button type="button" class="btn btn-sm btn-danger" data-action="delete-cat" data-idx="${idx}">del</button>
      </div>`;
    }).join('')}
  `;
}

export function addCategory(rerender) {
  const input = document.getElementById('new-cat-input');
  if (!input) return;
  const val = input.value.trim();
  if (val && !state.categories.includes(val)) {
    state.categories.push(val);
    saveState();
    rerender();
    showToast('categoría creada');
  }
}

export async function editCategoryPrompt(idx, rerender) {
  const oldName = state.categories[idx];
  const newName = await promptDialog('Nuevo nombre de la categoría:', {
    title: 'Renombrar categoría',
    defaultValue: oldName,
  });
  if (!newName) return;
  const trimmed = newName.trim();
  if (!trimmed || trimmed === oldName) return;
  if (state.categories.includes(trimmed)) {
    showToast('Esa categoría ya existe', 'error');
    return;
  }
  state.categories[idx] = trimmed;
  state.queries.forEach(q => {
    if (q.category === oldName) q.category = trimmed;
  });
  saveState();
  rerender();
  showToast('categoría actualizada');
}

export async function deleteCategory(idx, rerender) {
  const cat = state.categories[idx];
  const count = state.queries.filter(q => q.category === cat).length;
  if (count > 0) {
    const ok = await confirmDialog(
      `${count} consultas asociadas a "${cat}". ¿Eliminar la categoría de todos modos?`,
      { title: 'Eliminar categoría', confirmText: 'Eliminar', danger: true }
    );
    if (!ok) return;
  }
  state.categories.splice(idx, 1);
  saveState();
  rerender();
  showToast('categoría eliminada', 'warn');
}
