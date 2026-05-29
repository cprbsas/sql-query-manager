// Módulo de diccionarios de bases de datos.
// Permite importar Excel donde cada hoja es una tabla, y buscar por
// nombre de columna, nombre/ID de tabla o descripción.

import { state, saveState } from '../state.js';
import { esc, genId, formatBytes, formatDateTime, normalize, debounce } from '../utils.js';
import { MAX_DICT_FILE_SIZE, SEARCH_DEBOUNCE_MS } from '../config.js';
import { showToast } from './toast.js';
import { confirmDialog, promptDialog } from './confirm.js';
import { openModal, closeModal } from './modal.js';
import { parseExcelDictionary } from '../xlsx-parser.js';

// ─── Búsqueda ───
// Devuelve { tables: [...], total: number } donde cada item es
// { dictId, dictName, tableIdx, table, matches: [{type, text}] }
function searchAllDictionaries(term) {
  const q = normalize(term);
  if (!q) return { tables: [], total: 0 };

  const results = [];
  for (const dict of state.dictionaries) {
    dict.tables.forEach((table, tableIdx) => {
      const matches = [];

      // Match en metadata de tabla
      const metaFields = [
        { type: 'Table ID', text: table.tableId },
        { type: 'Entity Name', text: table.entityName },
        { type: 'Sheet', text: table.sheetName },
        { type: 'Sub System', text: table.subSystem },
      ];
      for (const f of metaFields) {
        if (f.text && normalize(f.text).includes(q)) {
          matches.push(f);
        }
      }

      // Match en columnas (nombre, descripción, attribute)
      for (const col of table.columns) {
        if (col.columnName && normalize(col.columnName).includes(q)) {
          matches.push({ type: 'Column', text: col.columnName, desc: col.description });
        } else if (col.attributeName && normalize(col.attributeName).includes(q)) {
          matches.push({ type: 'Attribute', text: col.attributeName, desc: col.description });
        } else if (col.description && normalize(col.description).includes(q)) {
          matches.push({ type: 'Description', text: col.description, column: col.columnName });
        }
      }

      if (matches.length > 0) {
        results.push({
          dictId: dict.id,
          dictName: dict.name,
          tableIdx,
          table,
          matches: matches.slice(0, 5), // máx 5 matches mostrados por tabla
          totalMatches: matches.length,
        });
      }
    });
  }
  return { tables: results, total: results.length };
}

// ─── Render principal ───
export function renderDictionariesPanel() {
  const dicts = state.dictionaries;
  const term = state.dictSearch || '';

  let body = '';

  if (dicts.length === 0) {
    body = `
      <div class="empty-state">
        <div class="empty-state-icon">◫</div>
        <p>No hay diccionarios importados.</p>
        <p class="empty-state-hint">Importa un archivo Excel donde cada hoja describa una tabla.</p>
      </div>
    `;
  } else if (term.trim()) {
    const { tables, total } = searchAllDictionaries(term);
    if (total === 0) {
      body = `<div class="empty-state"><p>Sin coincidencias para "<strong>${esc(term)}</strong>".</p></div>`;
    } else {
      body = `
        <div class="dict-results-summary">${total} ${total === 1 ? 'tabla coincide' : 'tablas coinciden'}</div>
        <div class="dict-results">
          ${tables.map(renderSearchResult).join('')}
        </div>
      `;
    }
  } else {
    body = `
      <div class="dict-list">
        ${dicts.map(renderDictCard).join('')}
      </div>
    `;
  }

  const totalTables = dicts.reduce((s, d) => s + (d.tables ? d.tables.length : 0), 0);

  return `
    <h2 class="panel-title">// Diccionarios de bases de datos</h2>
    <div class="dict-toolbar">
      <div class="search-wrap dict-search-wrap">
        <span class="search-prefix" aria-hidden="true">›_</span>
        <input class="search-input" id="dict-search-input" type="search"
          placeholder="buscar columna, tabla, descripción..."
          value="${esc(term)}"
          aria-label="Buscar en diccionarios">
      </div>
      <label class="btn btn-primary dict-import-label" for="dict-import-file" style="cursor:pointer">
        + importar Excel
        <input id="dict-import-file" type="file" accept=".xlsx,.xlsm,.xls"
          data-action="dict-import" style="display:none">
      </label>
    </div>
    <div class="dict-meta">${dicts.length} ${dicts.length === 1 ? 'diccionario' : 'diccionarios'} · ${totalTables} ${totalTables === 1 ? 'tabla' : 'tablas'}</div>
    ${body}
  `;
}

function renderDictCard(dict) {
  const tableCount = dict.tables ? dict.tables.length : 0;
  return `
    <div class="dict-card" data-dict-id="${esc(dict.id)}">
      <div class="dict-card-header">
        <div>
          <div class="dict-card-title">${esc(dict.name)}</div>
          <div class="dict-card-meta">
            ${tableCount} ${tableCount === 1 ? 'tabla' : 'tablas'} · importado ${esc(formatDateTime(dict.importedAt))}
          </div>
        </div>
        <div class="dict-card-actions">
          <button type="button" class="btn btn-sm" data-action="dict-rename" data-dict-id="${esc(dict.id)}">renombrar</button>
          <button type="button" class="btn btn-sm btn-danger" data-action="dict-delete" data-dict-id="${esc(dict.id)}">eliminar</button>
        </div>
      </div>
      <div class="dict-tables-grid">
        ${(dict.tables || []).map((t, idx) => `
          <button type="button" class="dict-table-chip"
            data-action="dict-view-table" data-dict-id="${esc(dict.id)}" data-table-idx="${idx}"
            title="${esc(t.entityName || t.sheetName)}">
            <span class="dict-table-id">${esc(t.tableId || t.sheetName)}</span>
            <span class="dict-table-name">${esc(t.entityName || '—')}</span>
            <span class="dict-table-cols">${t.columns.length} col</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function renderSearchResult(r) {
  const t = r.table;
  return `
    <div class="dict-result-card">
      <div class="dict-result-head">
        <button type="button" class="dict-result-title-btn"
          data-action="dict-view-table" data-dict-id="${esc(r.dictId)}" data-table-idx="${r.tableIdx}">
          <span class="dict-result-id">${esc(t.tableId || t.sheetName)}</span>
          <span class="dict-result-name">${esc(t.entityName || '—')}</span>
        </button>
        <span class="dict-result-dict">${esc(r.dictName)}</span>
      </div>
      <div class="dict-result-matches">
        ${r.matches.map(m => `
          <div class="dict-match">
            <span class="dict-match-type">${esc(m.type)}</span>
            <span class="dict-match-text">${esc(m.text)}</span>
            ${m.desc ? `<span class="dict-match-desc">${esc(m.desc)}</span>` : ''}
            ${m.column ? `<span class="dict-match-desc">en col. ${esc(m.column)}</span>` : ''}
          </div>
        `).join('')}
        ${r.totalMatches > r.matches.length
          ? `<div class="dict-match-more">+ ${r.totalMatches - r.matches.length} más</div>`
          : ''}
      </div>
    </div>
  `;
}

// ─── Ficha completa de la tabla (modal) ───
export function viewTable(dictId, tableIdx) {
  const dict = state.dictionaries.find(d => d.id === dictId);
  if (!dict) return;
  const table = dict.tables[tableIdx];
  if (!table) return;

  const metaRows = [
    ['Table ID', table.tableId],
    ['Entity Name', table.entityName],
    ['Sheet', table.sheetName],
    ['Sub System', table.subSystem],
    ['Storage Period', table.storagePeriod],
    ['Incr Volume', table.incrVolume],
    ['Diccionario', dict.name],
  ].filter(([_, v]) => v);

  const content = `
    <div class="table-view">
      <div class="table-meta-grid">
        ${metaRows.map(([k, v]) => `
          <div class="table-meta-row">
            <span class="table-meta-key">${esc(k)}</span>
            <span class="table-meta-val">${esc(v)}</span>
          </div>
        `).join('')}
      </div>

      <h3 class="table-section-title">Columnas <span class="table-section-count">${table.columns.length}</span></h3>
      <div class="table-cols-wrap">
        <table class="table-cols">
          <thead>
            <tr>
              <th>#</th>
              <th>Attribute</th>
              <th>Column</th>
              <th>Tipo</th>
              <th>Null</th>
              <th>PK</th>
              <th>FK</th>
              <th>Default</th>
              <th>Descripción</th>
            </tr>
          </thead>
          <tbody>
            ${table.columns.map(c => `
              <tr>
                <td class="num">${esc(c.no)}</td>
                <td>${esc(c.attributeName)}</td>
                <td class="mono">${esc(c.columnName)}</td>
                <td class="mono">${esc(c.dataType)}</td>
                <td class="center">${esc(c.nullable)}</td>
                <td class="center">${c.pk ? `<span class="badge badge-pk">${esc(c.pk)}</span>` : ''}</td>
                <td class="center">${c.fk ? `<span class="badge badge-fk">${esc(c.fk)}</span>` : ''}</td>
                <td>${esc(c.default)}</td>
                <td>${esc(c.description)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      ${table.indexes && table.indexes.length > 0 ? `
        <h3 class="table-section-title">Índices <span class="table-section-count">${table.indexes.length}</span></h3>
        <div class="table-cols-wrap">
          <table class="table-cols">
            <thead>
              <tr>
                <th>#</th>
                <th>Nombre</th>
                <th>Columnas</th>
                <th>Único</th>
                <th>Partition</th>
                <th>Local</th>
              </tr>
            </thead>
            <tbody>
              ${table.indexes.map(ix => `
                <tr>
                  <td class="num">${esc(ix.no)}</td>
                  <td class="mono">${esc(ix.name)}</td>
                  <td class="mono">${esc(ix.columns)}</td>
                  <td class="center">${esc(ix.unique)}</td>
                  <td class="center">${esc(ix.partition)}</td>
                  <td class="center">${esc(ix.local)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
    </div>
  `;

  const title = `${table.tableId || table.sheetName} — ${table.entityName || ''}`.trim();
  openModal(title, content, 1100);
}

// ─── Acciones ───

export async function importDictionary(e, rerender) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > MAX_DICT_FILE_SIZE) {
    showToast(`Archivo demasiado grande (${formatBytes(file.size)})`, 'error');
    return;
  }
  showToast('Procesando Excel…');
  try {
    const dict = await parseExcelDictionary(file);
    if (!dict.tables.length) {
      showToast('Ninguna hoja del Excel tiene formato reconocible (falta cabecera con "Column Name").', 'error');
      return;
    }
    dict.id = genId('dict');
    state.dictionaries.push(dict);
    saveState();
    rerender();
    showToast(`${dict.tables.length} tablas importadas desde ${dict.sourceFile}`);
  } catch (err) {
    console.error('Error parseando Excel:', err);
    showToast(`Error: ${err.message || 'No se pudo parsear el Excel'}`, 'error');
  }
}

export async function renameDictionary(dictId, rerender) {
  const dict = state.dictionaries.find(d => d.id === dictId);
  if (!dict) return;
  const newName = await promptDialog('Nuevo nombre del diccionario:', {
    title: 'Renombrar diccionario',
    defaultValue: dict.name,
  });
  if (!newName) return;
  const trimmed = newName.trim();
  if (!trimmed || trimmed === dict.name) return;
  dict.name = trimmed;
  saveState();
  rerender();
  showToast('diccionario renombrado');
}

export async function deleteDictionary(dictId, rerender) {
  const dict = state.dictionaries.find(d => d.id === dictId);
  if (!dict) return;
  const ok = await confirmDialog(
    `¿Eliminar el diccionario "${dict.name}" (${dict.tables.length} tablas)?`,
    { title: 'Eliminar diccionario', confirmText: 'Eliminar', danger: true }
  );
  if (!ok) return;
  state.dictionaries = state.dictionaries.filter(d => d.id !== dictId);
  saveState();
  rerender();
  showToast('diccionario eliminado', 'warn');
}

// ─── Búsqueda con debounce ───
let dictSearchDebounced = null;
export function handleDictSearch(input, rerender) {
  if (!dictSearchDebounced) {
    dictSearchDebounced = debounce(val => {
      state.dictSearch = val;
      rerender();
      // Restaurar foco después del re-render
      setTimeout(() => {
        const el = document.getElementById('dict-search-input');
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      }, 0);
    }, SEARCH_DEBOUNCE_MS);
  }
  dictSearchDebounced(input.value);
}
