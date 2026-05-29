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
// Devuelve { groups: [{dictId, dictName, results: [...]}], totalTables: n }
// donde cada result es { tableIdx, table, matches, totalMatches }
function searchAllDictionaries(term) {
  const q = normalize(term);
  if (!q) return { groups: [], totalTables: 0 };

  const groups = [];
  let totalTables = 0;
  for (const dict of state.dictionaries) {
    const results = [];
    dict.tables.forEach((table, tableIdx) => {
      const matches = [];

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
          tableIdx,
          table,
          matches: matches.slice(0, 5),
          totalMatches: matches.length,
        });
      }
    });
    if (results.length > 0) {
      groups.push({ dictId: dict.id, dictName: dict.name, results });
      totalTables += results.length;
    }
  }
  return { groups, totalTables };
}

// ─── Render principal ───
// Render del shell (input + import + contenedor body). El body se actualiza
// por separado en handleDictSearch para no recrear el input al teclear.
export function renderDictionariesPanel() {
  const term = state.dictSearch || '';
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
      <button type="button" class="btn" data-action="dict-new-empty">+ vacío</button>
    </div>
    <div id="dict-body">${renderDictionariesBody()}</div>
  `;
}

/**
 * Render del contenido (lista o resultados) según el state actual.
 * Se llama solo desde handleDictSearch para actualizar sin tocar el input.
 */
function renderDictionariesBody() {
  const dicts = state.dictionaries;
  const term = state.dictSearch || '';
  const totalTables = dicts.reduce((s, d) => s + (d.tables ? d.tables.length : 0), 0);
  const meta = `<div class="dict-meta">${dicts.length} ${dicts.length === 1 ? 'diccionario' : 'diccionarios'} · ${totalTables} ${totalTables === 1 ? 'tabla' : 'tablas'}</div>`;

  if (dicts.length === 0) {
    return meta + `
      <div class="empty-state">
        <div class="empty-state-icon">◫</div>
        <p>No hay diccionarios importados.</p>
        <p class="empty-state-hint">Importa un archivo Excel donde cada hoja describa una tabla, o crea uno vacío.</p>
        <div style="margin-top:14px">
          <button type="button" class="btn btn-primary" data-action="dict-new-empty">+ diccionario vacío</button>
        </div>
      </div>
    `;
  }
  if (term.trim()) {
    const { groups, totalTables: matchedTables } = searchAllDictionaries(term);
    if (matchedTables === 0) {
      return meta + `<div class="empty-state"><p>Sin coincidencias para "<strong>${esc(term)}</strong>".</p></div>`;
    }
    const dictsWithMatches = groups.length;
    return meta + `
      <div class="dict-results-summary">
        ${matchedTables} ${matchedTables === 1 ? 'tabla coincide' : 'tablas coinciden'}
        ${dictsWithMatches > 1 ? ` en ${dictsWithMatches} diccionarios` : ''}
      </div>
      <div class="dict-results">
        ${groups.map(renderResultGroup).join('')}
      </div>
    `;
  }
  return meta + `
    <div class="dict-list">
      ${dicts.map(renderDictCard).join('')}
    </div>
  `;
}

/**
 * Actualiza solo el contenedor #dict-body. No toca el input ni el toolbar,
 * por eso no se pierde el foco ni teclas al buscar.
 */
function updateDictBody() {
  const body = document.getElementById('dict-body');
  if (body) body.innerHTML = renderDictionariesBody();
}

function renderDictCard(dict) {
  const tableCount = dict.tables ? dict.tables.length : 0;
  // Conteo total de columnas e índices a través de todas las tablas
  let totalCols = 0;
  let totalIdx = 0;
  const subSystems = new Set();
  (dict.tables || []).forEach(t => {
    totalCols += (t.columns || []).length;
    totalIdx += (t.indexes || []).length;
    if (t.subSystem) subSystems.add(t.subSystem);
  });
  const subList = Array.from(subSystems);
  return `
    <div class="dict-card" data-dict-id="${esc(dict.id)}">
      <div class="dict-card-header">
        <div>
          <div class="dict-card-title">${esc(dict.name)}</div>
          <div class="dict-card-meta">
            ${esc(dict.sourceFile || '')} · importado ${esc(formatDateTime(dict.importedAt))}
          </div>
        </div>
        <div class="dict-card-actions">
          <button type="button" class="btn btn-sm" data-action="dict-add-table" data-dict-id="${esc(dict.id)}">+ tabla</button>
          <button type="button" class="btn btn-sm" data-action="dict-rename" data-dict-id="${esc(dict.id)}">renombrar</button>
          <button type="button" class="btn btn-sm btn-danger" data-action="dict-delete" data-dict-id="${esc(dict.id)}">eliminar</button>
        </div>
      </div>
      <div class="dict-stats">
        <div class="dict-stat">
          <span class="dict-stat-num">${tableCount}</span>
          <span class="dict-stat-label">${tableCount === 1 ? 'tabla' : 'tablas'}</span>
        </div>
        <div class="dict-stat">
          <span class="dict-stat-num">${totalCols}</span>
          <span class="dict-stat-label">${totalCols === 1 ? 'columna' : 'columnas'}</span>
        </div>
        <div class="dict-stat">
          <span class="dict-stat-num">${totalIdx}</span>
          <span class="dict-stat-label">${totalIdx === 1 ? 'índice' : 'índices'}</span>
        </div>
        <div class="dict-stat">
          <span class="dict-stat-num">${subList.length}</span>
          <span class="dict-stat-label">${subList.length === 1 ? 'subsistema' : 'subsistemas'}</span>
        </div>
      </div>
      ${subList.length > 0 ? `
        <div class="dict-subsystems">
          ${subList.slice(0, 6).map(s => `<span class="dict-sub-chip">${esc(s)}</span>`).join('')}
          ${subList.length > 6 ? `<span class="dict-sub-more">+${subList.length - 6}</span>` : ''}
        </div>
      ` : ''}
      <div class="dict-card-hint">Empieza a escribir arriba para buscar tablas o columnas dentro de este diccionario.</div>
    </div>
  `;
}

function renderResultGroup(group) {
  return `
    <div class="dict-result-group">
      <div class="dict-result-group-head">
        <span class="dict-result-group-name">${esc(group.dictName)}</span>
        <span class="dict-result-group-count">${group.results.length} ${group.results.length === 1 ? 'tabla' : 'tablas'}</span>
      </div>
      <div class="dict-result-group-body">
        ${group.results.map(r => renderSearchResult(r, group.dictId)).join('')}
      </div>
    </div>
  `;
}

function renderSearchResult(r, dictId) {
  const t = r.table;
  return `
    <div class="dict-result-card">
      <div class="dict-result-head">
        <button type="button" class="dict-result-title-btn"
          data-action="dict-view-table" data-dict-id="${esc(dictId)}" data-table-idx="${r.tableIdx}">
          <span class="dict-result-id">${esc(t.tableId || t.sheetName)}</span>
          <span class="dict-result-name">${esc(t.entityName || '—')}</span>
        </button>
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

/**
 * Devuelve HTML con el término resaltado dentro del texto (case-insensitive,
 * insensible a acentos). El texto se escapa primero. Si no hay term, escapa y ya.
 */
function highlightText(text, term) {
  if (!term || !text) return esc(text);
  const normText = normalize(text);
  const normTerm = normalize(term);
  if (!normTerm || !normText.includes(normTerm)) return esc(text);

  // Como normalize cambia el largo (quita acentos), buscamos las posiciones de
  // los matches sobre el texto original con una regex tolerante a acentos.
  // Construimos un patrón que reemplaza cada char del term por una clase
  // que incluye sus variantes acentuadas más comunes.
  const accentMap = {
    a: '[aáàäâã]', e: '[eéèëê]', i: '[iíìïî]', o: '[oóòöôõ]', u: '[uúùüû]',
    n: '[nñ]', c: '[cç]',
  };
  let pattern = '';
  for (const ch of normTerm) {
    if (accentMap[ch]) pattern += accentMap[ch];
    else pattern += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  try {
    const re = new RegExp(pattern, 'gi');
    // Escapamos primero, luego aplicamos la regex sobre el texto ya escapado.
    // Como el texto escapado puede tener entidades HTML, hacemos el match
    // sobre el original y reconstruimos.
    const escaped = esc(text);
    return escaped.replace(re, m => `<mark class="dict-hl">${m}</mark>`);
  } catch {
    return esc(text);
  }
}

export function viewTable(dictId, tableIdx, highlightTerm = '') {
  const dict = state.dictionaries.find(d => d.id === dictId);
  if (!dict) return;
  const table = dict.tables[tableIdx];
  if (!table) return;
  const hl = highlightTerm;
  const h = (txt) => highlightText(txt, hl);

  const metaRows = [
    ['Table ID', table.tableId],
    ['Entity Name', table.entityName],
    ['Sheet', table.sheetName],
    ['Sub System', table.subSystem],
    ['Storage Period', table.storagePeriod],
    ['Incr Volume', table.incrVolume],
    ['Diccionario', dict.name],
  ].filter(([_, v]) => v);

  // Para detectar si una fila tiene match y poder destacarla
  const rowHasMatch = (c) => hl && (
    normalize(c.columnName).includes(normalize(hl)) ||
    normalize(c.attributeName).includes(normalize(hl)) ||
    normalize(c.description).includes(normalize(hl))
  );

  const content = `
    <div class="table-view">
      <div class="table-view-actions">
        <button type="button" class="btn btn-sm" data-action="dict-edit-table"
          data-dict-id="${esc(dictId)}" data-table-idx="${tableIdx}">editar</button>
        <button type="button" class="btn btn-sm btn-danger" data-action="dict-delete-table"
          data-dict-id="${esc(dictId)}" data-table-idx="${tableIdx}">eliminar tabla</button>
        ${table.manual ? '<span class="dict-table-manual-badge">manual</span>' : ''}
      </div>
      <div class="table-meta-grid">
        ${metaRows.map(([k, v]) => `
          <div class="table-meta-row">
            <span class="table-meta-key">${esc(k)}</span>
            <span class="table-meta-val">${h(v)}</span>
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
              <tr${rowHasMatch(c) ? ' class="dict-row-match"' : ''}>
                <td class="num">${esc(c.no)}</td>
                <td>${h(c.attributeName)}</td>
                <td class="mono">${h(c.columnName)}</td>
                <td class="mono">${esc(c.dataType)}</td>
                <td class="center">${esc(c.nullable)}</td>
                <td class="center">${c.pk ? `<span class="badge badge-pk">${esc(c.pk)}</span>` : ''}</td>
                <td class="center">${c.fk ? `<span class="badge badge-fk">${esc(c.fk)}</span>` : ''}</td>
                <td>${esc(c.default)}</td>
                <td>${h(c.description)}</td>
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
                  <td class="mono">${h(ix.name)}</td>
                  <td class="mono">${h(ix.columns)}</td>
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
// Actualiza el state y solo el body de resultados, sin re-renderizar el panel
// completo. Así el input nunca se recrea y no se pierden teclas.
let dictSearchDebounced = null;
export function handleDictSearch(input /*, rerender */) {
  if (!dictSearchDebounced) {
    dictSearchDebounced = debounce(val => {
      state.dictSearch = val;
      updateDictBody();
    }, SEARCH_DEBOUNCE_MS);
  }
  dictSearchDebounced(input.value);
}

// ─── Crear / editar tabla manualmente ───

const EMPTY_COL = () => ({
  no: '', attributeName: '', columnName: '', dataType: '',
  nullable: '', pk: '', fk: '', default: '', description: '',
});
const EMPTY_IDX = () => ({
  no: '', name: '', columns: '', unique: '', partition: '', local: '',
});

// State temporal del editor (vive solo mientras el modal está abierto)
let _editor = null;

function renderEditorRowsCols() {
  if (!_editor) return '';
  return _editor.columns.map((c, i) => `
    <tr data-row="${i}">
      <td class="num"><input type="text" data-col="no" value="${esc(c.no)}" maxlength="4"></td>
      <td><input type="text" data-col="attributeName" value="${esc(c.attributeName)}"></td>
      <td><input type="text" data-col="columnName" value="${esc(c.columnName)}" class="mono"></td>
      <td><input type="text" data-col="dataType" value="${esc(c.dataType)}" class="mono" placeholder="VARCHAR2(20)"></td>
      <td><input type="text" data-col="nullable" value="${esc(c.nullable)}" maxlength="3" class="center" placeholder="NN"></td>
      <td><input type="text" data-col="pk" value="${esc(c.pk)}" maxlength="4" class="center" placeholder="PK1"></td>
      <td><input type="text" data-col="fk" value="${esc(c.fk)}" maxlength="4" class="center" placeholder="FK"></td>
      <td><input type="text" data-col="default" value="${esc(c.default)}"></td>
      <td><input type="text" data-col="description" value="${esc(c.description)}"></td>
      <td class="center">
        <button type="button" class="btn btn-sm btn-danger" data-editor-action="del-col" data-row="${i}" title="Eliminar fila">×</button>
      </td>
    </tr>
  `).join('');
}

function renderEditorRowsIdx() {
  if (!_editor) return '';
  return _editor.indexes.map((ix, i) => `
    <tr data-row="${i}">
      <td class="num"><input type="text" data-col="no" value="${esc(ix.no)}" maxlength="4"></td>
      <td><input type="text" data-col="name" value="${esc(ix.name)}" class="mono"></td>
      <td><input type="text" data-col="columns" value="${esc(ix.columns)}" class="mono" placeholder="COL1 + COL2"></td>
      <td><input type="text" data-col="unique" value="${esc(ix.unique)}" maxlength="2" class="center"></td>
      <td><input type="text" data-col="partition" value="${esc(ix.partition)}" maxlength="4" class="center"></td>
      <td><input type="text" data-col="local" value="${esc(ix.local)}" maxlength="4" class="center"></td>
      <td class="center">
        <button type="button" class="btn btn-sm btn-danger" data-editor-action="del-idx" data-row="${i}" title="Eliminar fila">×</button>
      </td>
    </tr>
  `).join('');
}

function editorContent() {
  const m = _editor.meta;
  return `
    <div class="table-editor">
      <div class="form-grid">
        <label><span class="label">Table ID</span>
          <input type="text" id="ed-tableId" value="${esc(m.tableId)}" placeholder="TBAED141"></label>
        <label><span class="label">Entity Name</span>
          <input type="text" id="ed-entityName" value="${esc(m.entityName)}" placeholder="AE_DetailCommonCode"></label>
        <label><span class="label">Sub System</span>
          <input type="text" id="ed-subSystem" value="${esc(m.subSystem)}" placeholder="[FCZ]Administration System"></label>
        <label><span class="label">Storage Period</span>
          <input type="text" id="ed-storagePeriod" value="${esc(m.storagePeriod)}"></label>
        <label><span class="label">Incr Volume</span>
          <input type="text" id="ed-incrVolume" value="${esc(m.incrVolume)}"></label>
        <label><span class="label">Sheet (opcional)</span>
          <input type="text" id="ed-sheetName" value="${esc(m.sheetName)}" placeholder="hoja origen"></label>
      </div>

      <h3 class="table-section-title">Columnas
        <span class="table-section-count" id="ed-cols-count">${_editor.columns.length}</span>
        <button type="button" class="btn btn-sm" data-editor-action="add-col" style="margin-left:auto">+ columna</button>
      </h3>
      <div class="table-cols-wrap">
        <table class="table-cols editor-table">
          <thead>
            <tr>
              <th style="width:50px">#</th>
              <th>Attribute</th>
              <th>Column</th>
              <th>Tipo</th>
              <th>Null</th>
              <th>PK</th>
              <th>FK</th>
              <th>Default</th>
              <th>Descripción</th>
              <th style="width:40px"></th>
            </tr>
          </thead>
          <tbody id="ed-cols-body">${renderEditorRowsCols()}</tbody>
        </table>
      </div>

      <h3 class="table-section-title">Índices
        <span class="table-section-count" id="ed-idx-count">${_editor.indexes.length}</span>
        <button type="button" class="btn btn-sm" data-editor-action="add-idx" style="margin-left:auto">+ índice</button>
      </h3>
      <div class="table-cols-wrap">
        <table class="table-cols editor-table">
          <thead>
            <tr>
              <th style="width:50px">#</th>
              <th>Nombre</th>
              <th>Columnas</th>
              <th>Único</th>
              <th>Partition</th>
              <th>Local</th>
              <th style="width:40px"></th>
            </tr>
          </thead>
          <tbody id="ed-idx-body">${renderEditorRowsIdx()}</tbody>
        </table>
      </div>

      <div class="editor-actions">
        <button type="button" class="btn" data-editor-action="cancel">Cancelar</button>
        <button type="button" class="btn btn-primary" data-editor-action="save">Guardar tabla</button>
      </div>
    </div>
  `;
}

/**
 * Abre el editor — modo crear (tableIdx=null) o editar (tableIdx=number).
 */
export function openTableEditor(dictId, tableIdx, rerender) {
  const dict = state.dictionaries.find(d => d.id === dictId);
  if (!dict) return;
  const isNew = tableIdx === null || tableIdx === undefined;
  const src = isNew ? null : dict.tables[tableIdx];

  _editor = {
    dictId,
    tableIdx: isNew ? null : tableIdx,
    rerender,
    meta: {
      tableId:        src ? src.tableId : '',
      entityName:     src ? src.entityName : '',
      subSystem:      src ? src.subSystem : '',
      storagePeriod:  src ? src.storagePeriod : '',
      incrVolume:     src ? src.incrVolume : '',
      sheetName:      src ? src.sheetName : '',
    },
    columns: src ? src.columns.map(c => ({ ...c })) : [EMPTY_COL()],
    indexes: src ? (src.indexes || []).map(i => ({ ...i })) : [],
  };

  const title = isNew ? `Nueva tabla en ${dict.name}` : `Editar ${src.tableId || src.sheetName}`;
  openModal(title, editorContent(), 1200);
  setupEditorListeners();
}

function setupEditorListeners() {
  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;

  // Cambios en inputs de filas (cols / idx)
  overlay.addEventListener('input', e => {
    const tr = e.target.closest('tr[data-row]');
    if (!tr || !_editor) return;
    const tbody = tr.parentElement;
    const colKey = e.target.dataset.col;
    if (!colKey) return;
    const rowIdx = parseInt(tr.dataset.row, 10);
    if (tbody.id === 'ed-cols-body') {
      _editor.columns[rowIdx][colKey] = e.target.value;
    } else if (tbody.id === 'ed-idx-body') {
      _editor.indexes[rowIdx][colKey] = e.target.value;
    }
  });

  // Botones del editor
  overlay.addEventListener('click', e => {
    const btn = e.target.closest('[data-editor-action]');
    if (!btn || !_editor) return;
    const action = btn.dataset.editorAction;
    if (action === 'add-col') {
      const next = String(_editor.columns.length + 1);
      _editor.columns.push({ ...EMPTY_COL(), no: next });
      document.getElementById('ed-cols-body').innerHTML = renderEditorRowsCols();
      document.getElementById('ed-cols-count').textContent = _editor.columns.length;
    } else if (action === 'del-col') {
      const i = parseInt(btn.dataset.row, 10);
      _editor.columns.splice(i, 1);
      document.getElementById('ed-cols-body').innerHTML = renderEditorRowsCols();
      document.getElementById('ed-cols-count').textContent = _editor.columns.length;
    } else if (action === 'add-idx') {
      const next = String(_editor.indexes.length + 1);
      _editor.indexes.push({ ...EMPTY_IDX(), no: next });
      document.getElementById('ed-idx-body').innerHTML = renderEditorRowsIdx();
      document.getElementById('ed-idx-count').textContent = _editor.indexes.length;
    } else if (action === 'del-idx') {
      const i = parseInt(btn.dataset.row, 10);
      _editor.indexes.splice(i, 1);
      document.getElementById('ed-idx-body').innerHTML = renderEditorRowsIdx();
      document.getElementById('ed-idx-count').textContent = _editor.indexes.length;
    } else if (action === 'cancel') {
      _editor = null;
      closeModal();
    } else if (action === 'save') {
      saveEditor();
    }
  });
}

function saveEditor() {
  if (!_editor) return;
  const dict = state.dictionaries.find(d => d.id === _editor.dictId);
  if (!dict) return;

  // Leer metadata del DOM (los inputs de cols/idx ya están en _editor)
  const get = id => (document.getElementById(id)?.value || '').trim();
  const meta = {
    tableId:        get('ed-tableId'),
    entityName:     get('ed-entityName'),
    subSystem:      get('ed-subSystem'),
    storagePeriod:  get('ed-storagePeriod'),
    incrVolume:     get('ed-incrVolume'),
    sheetName:      get('ed-sheetName') || get('ed-tableId') || 'Tabla manual',
  };

  // Limpiar filas vacías
  const cleanCols = _editor.columns.filter(c => (c.columnName || c.attributeName || '').trim() !== '');
  const cleanIdx  = _editor.indexes.filter(i => (i.name || i.columns || '').trim() !== '');

  if (!meta.tableId && !meta.entityName) {
    showToast('Necesitas al menos Table ID o Entity Name', 'error');
    return;
  }
  if (cleanCols.length === 0) {
    showToast('Necesitas al menos una columna con nombre', 'error');
    return;
  }

  const newTable = {
    sheetName: meta.sheetName,
    tableId: meta.tableId,
    entityName: meta.entityName,
    subSystem: meta.subSystem,
    storagePeriod: meta.storagePeriod,
    incrVolume: meta.incrVolume,
    columns: cleanCols,
    indexes: cleanIdx,
    manual: true,
  };

  if (_editor.tableIdx === null) {
    dict.tables.push(newTable);
    showToast(`Tabla "${newTable.tableId || newTable.entityName}" agregada`);
  } else {
    dict.tables[_editor.tableIdx] = newTable;
    showToast('Tabla actualizada');
  }

  saveState();
  const rerender = _editor.rerender;
  _editor = null;
  closeModal();
  if (typeof rerender === 'function') rerender();
}

/**
 * Elimina una tabla específica del diccionario.
 */
export async function deleteTable(dictId, tableIdx, rerender) {
  const dict = state.dictionaries.find(d => d.id === dictId);
  if (!dict) return;
  const t = dict.tables[tableIdx];
  if (!t) return;
  const ok = await confirmDialog(
    `¿Eliminar la tabla "${t.tableId || t.entityName || t.sheetName}" de ${dict.name}?`,
    { title: 'Eliminar tabla', confirmText: 'Eliminar', danger: true }
  );
  if (!ok) return;
  dict.tables.splice(tableIdx, 1);
  saveState();
  rerender();
  showToast('tabla eliminada', 'warn');
}

/**
 * Crea un diccionario "manual" vacío para empezar a agregar tablas a mano.
 */
export async function newEmptyDictionary(rerender) {
  const name = await promptDialog('Nombre del diccionario:', {
    title: 'Nuevo diccionario',
    defaultValue: 'Diccionario manual',
  });
  if (!name) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  state.dictionaries.push({
    id: genId('dict'),
    name: trimmed,
    sourceFile: '(manual)',
    importedAt: new Date().toISOString(),
    tables: [],
  });
  saveState();
  rerender();
  showToast('diccionario creado');
}
