// CRUD y vistas de queries

import { state, saveState } from '../state.js';
import { genId, esc, formatDate, debounce, compareStrings } from '../utils.js';
import { highlightSQL, formatSQL } from '../sql.js';
import { SORT_OPTIONS, SEARCH_DEBOUNCE_MS } from '../config.js';
import { openModal, closeModal } from './modal.js';
import { confirmDialog } from './confirm.js';
import { showToast } from './toast.js';

// ─── Filtrado y orden ───
export function getFiltered() {
  const search = state.search ? state.search.toLowerCase() : '';
  return state.queries.filter(q => {
    if (state.filterCat && q.category !== state.filterCat) return false;
    if (state.filterDb && !q.databases.includes(state.filterDb)) return false;
    if (search) {
      return (
        q.name.toLowerCase().includes(search) ||
        q.sql.toLowerCase().includes(search) ||
        q.category.toLowerCase().includes(search) ||
        q.databases.some(d => d.toLowerCase().includes(search))
      );
    }
    return true;
  });
}

export function getSorted(queries) {
  return [...queries].sort((a, b) => {
    const f = state.sortField;
    const dir = state.sortDir === 'asc' ? 1 : -1;
    if (f === 'createdAt') {
      const va = a[f] ? new Date(a[f]).getTime() : 0;
      const vb = b[f] ? new Date(b[f]).getTime() : 0;
      return (va - vb) * dir;
    }
    return compareStrings(a[f] || '', b[f] || '') * dir;
  });
}

// ─── Sort bar ───
export function setSort(field) {
  if (state.sortField === field) {
    state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    state.sortField = field;
    state.sortDir = field === 'createdAt' ? 'desc' : 'asc';
  }
  refreshList();
  refreshSortBar();
}

export function renderSortBar() {
  const di = state.sortDir === 'asc' ? '↑' : '↓';
  const count = getFiltered().length;
  const buttons = SORT_OPTIONS.map(o => {
    const active = state.sortField === o.field;
    return `<button class="sort-btn ${active ? 'active' : ''}" type="button"
      data-sort-field="${o.field}"
      aria-pressed="${active}">${o.label}${active ? ` <span class="sort-dir">${di}</span>` : ''}</button>`;
  }).join('');
  return `${buttons}<span class="result-count">${count} resultado${count !== 1 ? 's' : ''}</span>`;
}

function refreshList() {
  const el = document.getElementById('queries-list');
  if (el) el.innerHTML = renderQueryList();
}
function refreshSortBar() {
  const el = document.getElementById('sort-bar');
  if (el) el.innerHTML = renderSortBar();
}

// ─── Lista de queries ───
export function renderQueryList() {
  const filtered = getSorted(getFiltered());
  if (filtered.length === 0) {
    return `<div class="empty">
      <div class="empty-icon">SELECT * FROM queries WHERE 1=0;</div>
      <p class="empty-title">sin resultados</p>
      <p class="empty-desc">crea o importa tu primera consulta</p>
    </div>`;
  }
  const isFiltering = state.search || state.filterCat || state.filterDb;
  return filtered.map((q, idx) => {
    const dateStr = formatDate(q.createdAt);
    const anim = isFiltering ? '' : `animation:slideUp .25s ease ${idx * 0.025}s both`;
    return `<div class="query-card"
      role="button" tabindex="0"
      style="${anim}"
      data-action="view" data-id="${esc(q.id)}"
      aria-label="Ver consulta ${esc(q.name)}">
      <div class="card-header">
        <div>
          <div class="card-title">${esc(q.name)}</div>
          ${q.description ? `<div class="card-desc">${esc(q.description)}</div>` : ''}
          ${dateStr ? `<div class="card-date">${dateStr}</div>` : ''}
        </div>
        <div class="card-actions">
          <button class="btn btn-sm" type="button" data-action="copy" data-id="${esc(q.id)}" aria-label="Copiar SQL">copy</button>
          <button class="btn btn-sm" type="button" data-action="edit" data-id="${esc(q.id)}" aria-label="Editar consulta">edit</button>
          <button class="btn btn-sm btn-danger" type="button" data-action="delete" data-id="${esc(q.id)}" aria-label="Eliminar consulta">del</button>
        </div>
      </div>
      <div class="card-sql"><code class="sql-code">${highlightSQL(q.sql)}</code></div>
      <div class="card-tags">
        <span class="tag tag-purple">${esc(q.category)}</span>
        ${q.databases.map(d => `<span class="tag tag-green">${esc(d)}</span>`).join('')}
      </div>
    </div>`;
  }).join('');
}

// ─── Búsqueda con debounce ───
const debouncedSearch = debounce(input => {
  state.search = input.value;
  refreshList();
  refreshSortBar();
  updateClearButton(input);
}, SEARCH_DEBOUNCE_MS);

export function handleSearch(input) {
  debouncedSearch(input);
}

function updateClearButton(input) {
  const wrap = input.closest('.search-wrap');
  if (!wrap) return;
  let clearBtn = wrap.querySelector('.search-clear');
  if (state.search && !clearBtn) {
    const btn = document.createElement('button');
    btn.className = 'search-clear';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Limpiar búsqueda');
    btn.textContent = '×';
    btn.addEventListener('click', () => {
      state.search = '';
      input.value = '';
      input.focus();
      refreshList();
      refreshSortBar();
      btn.remove();
    });
    wrap.appendChild(btn);
  } else if (!state.search && clearBtn) {
    clearBtn.remove();
  }
}

// ─── Acciones de query ───
export function copyQuerySQL(id, btn) {
  const q = state.queries.find(x => x.id === id);
  if (!q) return;
  navigator.clipboard.writeText(q.sql).then(() => {
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '✓';
      btn.style.color = 'var(--green)';
      setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 1500);
    }
  }).catch(() => showToast('No se pudo copiar', 'error'));
}

export async function deleteQuery(id, rerender) {
  const ok = await confirmDialog('¿Eliminar esta consulta?', {
    title: 'Eliminar consulta', confirmText: 'Eliminar', danger: true,
  });
  if (!ok) return;
  state.queries = state.queries.filter(q => q.id !== id);
  saveState();
  rerender();
  showToast('consulta eliminada', 'warn');
}

// ─── Modal de creación/edición ───
let _editingId = null;
let _selectedDBs = [];

function renderDBPills() {
  return state.databases.map(db =>
    `<button type="button" class="db-pill ${_selectedDBs.includes(db) ? 'active' : ''}"
      data-db="${esc(db)}" data-action="toggle-db"
      aria-pressed="${_selectedDBs.includes(db)}">${esc(db)}</button>`
  ).join('');
}

export function openCreateModal(queryId, rerender) {
  _editingId = queryId || null;
  const q = queryId ? state.queries.find(x => x.id === queryId) : null;
  _selectedDBs = q ? [...q.databases] : [];

  const html = `
    <div class="form-group">
      <label class="label" for="q-name">Nombre *</label>
      <input id="q-name" type="text" value="${q ? esc(q.name) : ''}" placeholder="nombre descriptivo">
    </div>
    <div class="form-group">
      <label class="label" for="q-desc">Descripción</label>
      <input id="q-desc" type="text" value="${q ? esc(q.description || '') : ''}" placeholder="descripción breve (opcional)">
    </div>
    <div class="form-group">
      <label class="label" for="q-sql">SQL *</label>
      <textarea id="q-sql" placeholder="SELECT * FROM tabla...">${q ? esc(q.sql) : ''}</textarea>
      <button type="button" class="btn btn-sm" style="margin-top:6px" data-action="format-sql">✦ formatear</button>
    </div>
    <div class="form-group">
      <label class="label" for="q-cat">Categoría *</label>
      <div class="form-row">
        <select id="q-cat">
          <option value="">seleccionar...</option>
          ${state.categories.map(c =>
            `<option value="${esc(c)}" ${q && q.category === c ? 'selected' : ''}>${esc(c)}</option>`
          ).join('')}
        </select>
        <input id="q-newcat" type="text" placeholder="nueva cat." aria-label="Nueva categoría">
        <button type="button" class="btn" data-action="add-cat">+</button>
      </div>
    </div>
    <div class="form-group">
      <label class="label">Bases de datos</label>
      <div class="db-pills" id="db-pills-container" role="group" aria-label="Bases de datos">${renderDBPills()}</div>
      <div class="form-row">
        <input id="q-newdb" type="text" placeholder="nueva bd" aria-label="Nueva base de datos">
        <button type="button" class="btn" data-action="add-db">+</button>
      </div>
    </div>
    <div class="form-actions">
      <button type="button" class="btn" data-action="cancel">cancelar</button>
      <button type="button" class="btn btn-primary" data-action="save">${q ? 'guardar cambios' : 'crear consulta'}</button>
    </div>
  `;
  const overlay = openModal(q ? 'Editar consulta' : 'Nueva consulta', html, 700);

  // Wire up event handlers
  overlay.addEventListener('click', e => {
    const action = e.target.dataset.action;
    if (!action) return;
    if (action === 'cancel') closeModal();
    else if (action === 'save') saveQueryFromModal(rerender);
    else if (action === 'format-sql') {
      const ta = document.getElementById('q-sql');
      ta.value = formatSQL(ta.value);
    }
    else if (action === 'add-cat') addCategoryInModal();
    else if (action === 'add-db') addDatabaseInModal();
    else if (action === 'toggle-db') toggleDBInModal(e.target.dataset.db);
  });
  overlay.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.target.id === 'q-newcat' || e.target.id === 'q-newdb')) {
      e.preventDefault();
      if (e.target.id === 'q-newcat') addCategoryInModal();
      else addDatabaseInModal();
    }
  });
}

function toggleDBInModal(db) {
  if (_selectedDBs.includes(db)) _selectedDBs = _selectedDBs.filter(d => d !== db);
  else _selectedDBs.push(db);
  document.getElementById('db-pills-container').innerHTML = renderDBPills();
}

function addCategoryInModal() {
  const input = document.getElementById('q-newcat');
  const val = input.value.trim();
  if (!val) return;
  if (state.categories.includes(val)) {
    document.getElementById('q-cat').value = val;
    input.value = '';
    return;
  }
  state.categories.push(val);
  saveState();
  const select = document.getElementById('q-cat');
  const opt = document.createElement('option');
  opt.value = val;
  opt.textContent = val;
  select.appendChild(opt);
  select.value = val;
  input.value = '';
  showToast(`categoría '${val}' creada`);
}

function addDatabaseInModal() {
  const input = document.getElementById('q-newdb');
  const val = input.value.trim();
  if (val && !state.databases.includes(val)) {
    state.databases.push(val);
    _selectedDBs.push(val);
    saveState();
    document.getElementById('db-pills-container').innerHTML = renderDBPills();
    input.value = '';
  }
}

function saveQueryFromModal(rerender) {
  const name = document.getElementById('q-name').value.trim();
  const desc = document.getElementById('q-desc').value.trim();
  const sql = document.getElementById('q-sql').value.trim();
  let cat = document.getElementById('q-cat').value;
  const newCatInput = document.getElementById('q-newcat');
  const newCatVal = newCatInput ? newCatInput.value.trim() : '';

  if (!cat && newCatVal) {
    if (!state.categories.includes(newCatVal)) state.categories.push(newCatVal);
    cat = newCatVal;
  }
  if (!name || !sql || !cat) {
    showToast('completa nombre, sql y categoría', 'error');
    return;
  }

  const newDbInput = document.getElementById('q-newdb');
  const newDbVal = newDbInput ? newDbInput.value.trim() : '';
  if (newDbVal) {
    if (!state.databases.includes(newDbVal)) state.databases.push(newDbVal);
    if (!_selectedDBs.includes(newDbVal)) _selectedDBs.push(newDbVal);
  }

  if (_editingId) {
    const q = state.queries.find(x => x.id === _editingId);
    if (q) Object.assign(q, {
      name, description: desc, sql, category: cat,
      databases: [..._selectedDBs],
      updatedAt: new Date().toISOString(),
    });
    showToast('consulta actualizada');
  } else {
    state.queries.push({
      id: genId(),
      name, description: desc, sql, category: cat,
      databases: [..._selectedDBs],
      createdAt: new Date().toISOString(),
    });
    showToast('consulta creada');
  }
  saveState();
  closeModal();
  rerender();
}

// ─── Vista de query ───
let _viewFormatted = false;

export function viewQuery(id) {
  const q = state.queries.find(x => x.id === id);
  if (!q) return;
  _viewFormatted = false;

  const html = `
    ${q.description ? `<p class="view-description">${esc(q.description)}</p>` : ''}
    <div class="card-tags" style="margin-bottom:12px">
      <span class="tag tag-purple">${esc(q.category)}</span>
      ${q.databases.map(d => `<span class="tag tag-green">${esc(d)}</span>`).join('')}
    </div>
    <div class="sql-viewer" id="sql-viewer-content"><code class="sql-code">${highlightSQL(q.sql)}</code></div>
    <div class="form-actions">
      <button type="button" class="btn btn-sm" id="format-toggle-btn" data-action="toggle-format">✦ formatear</button>
      <button type="button" class="btn btn-sm" data-action="copy-view">copy</button>
      <div style="flex:1"></div>
      <button type="button" class="btn btn-primary btn-sm" data-action="edit-from-view">edit</button>
    </div>
  `;
  const overlay = openModal(q.name, html, 750);

  overlay.addEventListener('click', e => {
    const action = e.target.dataset.action;
    if (!action) return;
    if (action === 'toggle-format') toggleFormat(id);
    else if (action === 'copy-view') copyViewSQL(id);
    else if (action === 'edit-from-view') {
      closeModal();
      // Reabre como editor — el rerender se pasa cuando openCreateModal reciba el contexto
      // Lo simple: expone un evento global
      window.dispatchEvent(new CustomEvent('sqllib:edit-query', { detail: { id } }));
    }
  });
}

function toggleFormat(id) {
  const q = state.queries.find(x => x.id === id);
  if (!q) return;
  _viewFormatted = !_viewFormatted;
  const sql = _viewFormatted ? formatSQL(q.sql) : q.sql;
  document.getElementById('sql-viewer-content').innerHTML = `<code class="sql-code">${highlightSQL(sql)}</code>`;
  document.getElementById('format-toggle-btn').textContent = _viewFormatted ? '⟲ original' : '✦ formatear';
}

function copyViewSQL(id) {
  const q = state.queries.find(x => x.id === id);
  if (!q) return;
  const sql = _viewFormatted ? formatSQL(q.sql) : q.sql;
  navigator.clipboard.writeText(sql).then(() => showToast('copiado'));
}
