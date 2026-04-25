// Render principal — todo via event delegation, nada de onclick inline

import { state } from '../state.js';
import { esc } from '../utils.js';
import { getDriveStatusInfo, connectDrive, onDriveStatusChange } from '../drive.js';
import {
  renderQueryList, renderSortBar, handleSearch,
  setSort, copyQuerySQL, deleteQuery, openCreateModal, viewQuery,
} from './queries.js';
import {
  renderCategoriesPanel, addCategory, editCategoryPrompt, deleteCategory,
} from './categories.js';
import {
  renderDatabasesPanel, addDatabase, editDatabasePrompt, deleteDatabase,
} from './databases.js';
import { openImportModal, openBatchModal } from './import.js';
import { exportBackup, importBackup, resetAll } from './backup.js';

let appRoot = null;
let initialized = false;

export function render() {
  if (!appRoot) appRoot = document.getElementById('app');

  let tabContent = '';
  if (state.activeTab === 'queries') {
    tabContent = `
      <div class="search-wrap">
        <span class="search-prefix" aria-hidden="true">›_</span>
        <input class="search-input" id="search-input" type="search"
          placeholder="buscar por nombre, sql, categoría..."
          value="${esc(state.search)}"
          aria-label="Buscar consultas">
      </div>
      <div class="sort-bar" id="sort-bar" role="group" aria-label="Ordenar por">${renderSortBar()}</div>
      <div id="queries-list" role="list">${renderQueryList()}</div>
    `;
  } else if (state.activeTab === 'categories') {
    tabContent = renderCategoriesPanel();
  } else if (state.activeTab === 'databases') {
    tabContent = renderDatabasesPanel();
  }

  const drv = getDriveStatusInfo();

  appRoot.innerHTML = `
    <header class="header" role="banner">
      <div class="header-left">
        <div class="header-logo">
          <span class="header-logo-bracket">[</span>SQL<span class="header-logo-bracket">]</span>
          Biblioteca de consultas<span class="cursor" aria-hidden="true"></span>
        </div>
        <div class="header-meta">
          ${state.queries.length} consultas · ${state.categories.length} cats · ${state.databases.length} bds
        </div>
      </div>
      <div class="header-actions">
        <button id="drive-btn" type="button" class="drive-btn ${drv.cls}"
          data-action="connect-drive" title="${esc(drv.title)}" aria-label="${esc(drv.label)}">
          <span class="drive-dot" aria-hidden="true"></span>${esc(drv.label)}
        </button>
        <button type="button" class="btn btn-primary" data-action="new">+ nueva</button>
        <button type="button" class="btn" data-action="import">importar</button>
        <button type="button" class="btn" data-action="batch">lote</button>
        <button type="button" class="btn" data-action="backup">backup</button>
        <label class="btn restore-label" for="restore-file" style="cursor:pointer">restaurar
          <input id="restore-file" type="file" accept=".json" data-action="restore" style="display:none">
        </label>
        <button type="button" class="btn btn-danger btn-sm-text" data-action="reset">reset</button>
      </div>
    </header>
    <div class="body">
      <aside class="sidebar" role="navigation" aria-label="Navegación">
        ${['queries','categories','databases'].map(id => {
          const labels = { queries: 'consultas', categories: 'categorías', databases: 'bases de datos' };
          const icons = { queries: '▸', categories: '◈', databases: '◉' };
          const count = { queries: state.queries.length, categories: state.categories.length, databases: state.databases.length };
          const active = state.activeTab === id;
          return `<button type="button" class="sidebar-btn ${active ? 'active' : ''}"
            data-action="tab" data-tab="${id}"
            aria-pressed="${active}">
            <span class="sidebar-icon" aria-hidden="true">${icons[id]}</span>${labels[id]}<span class="sidebar-count">${count[id]}</span>
          </button>`;
        }).join('')}
        <div class="sidebar-label">Filtrar</div>
        <div class="sidebar-filters">
          <label class="label" for="filter-cat">Categoría</label>
          <select id="filter-cat" data-action="filter-cat">
            <option value="">todas</option>
            ${state.categories.map(c =>
              `<option value="${esc(c)}" ${state.filterCat === c ? 'selected' : ''}>${esc(c)}</option>`
            ).join('')}
          </select>
          <label class="label" for="filter-db">Base de datos</label>
          <select id="filter-db" data-action="filter-db">
            <option value="">todas</option>
            ${state.databases.map(d =>
              `<option value="${esc(d)}" ${state.filterDb === d ? 'selected' : ''}>${esc(d)}</option>`
            ).join('')}
          </select>
        </div>
      </aside>
      <main class="main" role="main" style="animation:fadeIn .2s ease">${tabContent}</main>
    </div>
  `;

  // Listeners se inicializan una sola vez (event delegation)
  if (!initialized) {
    setupGlobalListeners();
    initialized = true;
  }
}

function setupGlobalListeners() {
  // Click delegation
  document.addEventListener('click', e => {
    // Ignorar clicks dentro de modales — esos los gestionan los listeners propios del modal
    if (e.target.closest('.modal-overlay')) return;

    const target = e.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;

    switch (action) {
      case 'connect-drive': connectDrive(); break;
      case 'new': openCreateModal(null, render); break;
      case 'import': openImportModal(render); break;
      case 'batch': openBatchModal(render); break;
      case 'backup': exportBackup(); break;
      case 'reset': resetAll(render); break;
      case 'tab': {
        state.activeTab = target.dataset.tab;
        state.filterCat = '';
        state.filterDb = '';
        render();
        break;
      }
      case 'view': viewQuery(target.dataset.id); break;
      case 'copy': {
        e.stopPropagation();
        copyQuerySQL(target.dataset.id, target);
        break;
      }
      case 'edit': {
        e.stopPropagation();
        openCreateModal(target.dataset.id, render);
        break;
      }
      case 'delete': {
        e.stopPropagation();
        deleteQuery(target.dataset.id, render);
        break;
      }
      case 'add-cat': addCategory(render); break;
      case 'edit-cat': editCategoryPrompt(parseInt(target.dataset.idx, 10), render); break;
      case 'delete-cat': deleteCategory(parseInt(target.dataset.idx, 10), render); break;
      case 'add-db': addDatabase(render); break;
      case 'edit-db': editDatabasePrompt(parseInt(target.dataset.idx, 10), render); break;
      case 'delete-db': deleteDatabase(parseInt(target.dataset.idx, 10), render); break;
      // Sort bar
      default: {
        if (target.classList.contains('sort-btn') && target.dataset.sortField) {
          setSort(target.dataset.sortField);
        }
      }
    }
  });

  // Input/change delegation — también ignora dentro de modales
  document.addEventListener('input', e => {
    if (e.target.closest('.modal-overlay')) return;
    if (e.target.id === 'search-input') handleSearch(e.target);
  });

  document.addEventListener('change', e => {
    if (e.target.closest('.modal-overlay')) return;
    const action = e.target.dataset.action;
    if (action === 'filter-cat') {
      state.filterCat = e.target.value;
      state.activeTab = 'queries';
      render();
    } else if (action === 'filter-db') {
      state.filterDb = e.target.value;
      state.activeTab = 'queries';
      render();
    } else if (action === 'restore') {
      importBackup(e, render);
    }
  });

  // Activación de query-card por teclado (Enter/Space)
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.query-card');
    if (card && card.dataset.action === 'view') {
      e.preventDefault();
      viewQuery(card.dataset.id);
    }
  });

  // Evento custom: editar desde la vista
  window.addEventListener('sqllib:edit-query', e => {
    openCreateModal(e.detail.id, render);
  });

  // Re-render del botón de Drive cuando cambia su estado
  onDriveStatusChange(() => {
    const btn = document.getElementById('drive-btn');
    if (!btn) return;
    const info = getDriveStatusInfo();
    btn.className = `drive-btn ${info.cls}`;
    btn.title = info.title;
    btn.setAttribute('aria-label', info.label);
    btn.innerHTML = `<span class="drive-dot" aria-hidden="true"></span>${esc(info.label)}`;
  });
}
