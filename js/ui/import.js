// Importación de queries: archivo individual y batch CSV

import { state, saveState } from '../state.js';
import { esc, genId, formatBytes } from '../utils.js';
import { highlightSQL } from '../sql.js';
import { parseCSV } from '../csv.js';
import { MAX_IMPORT_FILE_SIZE, MAX_BATCH_FILE_SIZE } from '../config.js';
import { openModal, closeModal } from './modal.js';
import { showToast } from './toast.js';

// ─── Import individual ───
let _importContent = '';
let _importDBs = [];

export function openImportModal(rerender) {
  _importContent = '';
  _importDBs = [];
  const html = `
    <div class="form-group">
      <label class="label" for="import-file">Archivo (.sql, .csv, .txt) — máx. ${formatBytes(MAX_IMPORT_FILE_SIZE)}</label>
      <label class="file-upload" id="import-file-label" for="import-file">⇧ seleccionar archivo
        <input id="import-file" type="file" accept=".sql,.csv,.txt" data-action="import-file" style="display:none">
      </label>
    </div>
    <div id="import-form-area"></div>
  `;
  const overlay = openModal('Importar consulta', html, 700);

  overlay.addEventListener('change', e => {
    if (e.target.dataset.action === 'import-file') handleImportFile(e, rerender);
  });
  overlay.addEventListener('click', e => {
    const action = e.target.dataset.action;
    if (action === 'cancel-import') closeModal();
    else if (action === 'save-import') saveImportQuery(rerender);
    else if (action === 'add-cat-import') addCatInImport();
    else if (action === 'add-db-import') addDBInImport();
    else if (action === 'toggle-imp-db') toggleImportDB(e.target.dataset.db);
  });
  overlay.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      if (e.target.id === 'imp-newcat') { e.preventDefault(); addCatInImport(); }
      else if (e.target.id === 'imp-newdb') { e.preventDefault(); addDBInImport(); }
    }
  });
}

function handleImportFile(e, rerender) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > MAX_IMPORT_FILE_SIZE) {
    showToast(`Archivo demasiado grande (${formatBytes(file.size)}). Máx: ${formatBytes(MAX_IMPORT_FILE_SIZE)}`, 'error');
    e.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => showToast('Error leyendo archivo', 'error');
  reader.onload = ev => {
    _importContent = ev.target.result;
    const name = file.name.replace(/\.(sql|csv|txt)$/i, '');
    document.getElementById('import-file-label').textContent = '✓ cargado — clic para cambiar';
    document.getElementById('import-form-area').innerHTML = renderImportForm(name);
  };
  reader.readAsText(file);
}

function renderImportForm(name) {
  return `
    <div class="form-group">
      <label class="label">Vista previa</label>
      <div class="sql-preview"><code class="sql-code sql-code-sm">${highlightSQL(_importContent)}</code></div>
    </div>
    <div class="form-group">
      <label class="label" for="imp-name">Nombre *</label>
      <input id="imp-name" type="text" value="${esc(name)}">
    </div>
    <div class="form-group">
      <label class="label" for="imp-desc">Descripción</label>
      <input id="imp-desc" type="text" placeholder="Opcional">
    </div>
    <div class="form-group">
      <label class="label" for="imp-cat">Categoría *</label>
      <div class="form-row">
        <select id="imp-cat">
          <option value="">seleccionar...</option>
          ${state.categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
        </select>
        <input id="imp-newcat" type="text" placeholder="nueva" aria-label="Nueva categoría">
        <button type="button" class="btn" data-action="add-cat-import">+</button>
      </div>
    </div>
    <div class="form-group">
      <label class="label">Bases de datos</label>
      <div class="db-pills" id="imp-db-pills" role="group">${renderImportDBPills()}</div>
      <div class="form-row">
        <input id="imp-newdb" type="text" placeholder="nueva bd" aria-label="Nueva base de datos">
        <button type="button" class="btn" data-action="add-db-import">+</button>
      </div>
    </div>
    <div class="form-actions">
      <button type="button" class="btn" data-action="cancel-import">cancelar</button>
      <button type="button" class="btn btn-primary" data-action="save-import">importar</button>
    </div>
  `;
}

function renderImportDBPills() {
  return state.databases.map(db =>
    `<button type="button" class="db-pill ${_importDBs.includes(db) ? 'active' : ''}"
      data-db="${esc(db)}" data-action="toggle-imp-db"
      aria-pressed="${_importDBs.includes(db)}">${esc(db)}</button>`
  ).join('');
}

function toggleImportDB(db) {
  if (_importDBs.includes(db)) _importDBs = _importDBs.filter(d => d !== db);
  else _importDBs.push(db);
  document.getElementById('imp-db-pills').innerHTML = renderImportDBPills();
}

function addCatInImport() {
  const v = document.getElementById('imp-newcat').value.trim();
  if (!v) return;
  if (state.categories.includes(v)) {
    document.getElementById('imp-cat').value = v;
    document.getElementById('imp-newcat').value = '';
    return;
  }
  state.categories.push(v);
  saveState();
  const sel = document.getElementById('imp-cat');
  const opt = document.createElement('option');
  opt.value = v;
  opt.textContent = v;
  sel.appendChild(opt);
  sel.value = v;
  document.getElementById('imp-newcat').value = '';
  showToast(`categoría '${v}' creada`);
}

function addDBInImport() {
  const v = document.getElementById('imp-newdb').value.trim();
  if (v && !state.databases.includes(v)) {
    state.databases.push(v);
    _importDBs.push(v);
    saveState();
    document.getElementById('imp-db-pills').innerHTML = renderImportDBPills();
    document.getElementById('imp-newdb').value = '';
  }
}

function saveImportQuery(rerender) {
  const name = document.getElementById('imp-name').value.trim();
  const desc = document.getElementById('imp-desc').value.trim();
  let cat = document.getElementById('imp-cat').value;
  const newCatVal = document.getElementById('imp-newcat')?.value.trim() || '';
  if (!cat && newCatVal) {
    if (!state.categories.includes(newCatVal)) state.categories.push(newCatVal);
    cat = newCatVal;
  }
  if (!name || !_importContent.trim() || !cat) {
    showToast('completa nombre y categoría', 'error');
    return;
  }
  state.queries.push({
    id: genId(),
    name, description: desc,
    sql: _importContent.trim(),
    category: cat,
    databases: [..._importDBs],
    createdAt: new Date().toISOString(),
  });
  saveState();
  closeModal();
  rerender();
  showToast('consulta importada');
}

// ─── Import batch CSV ───
let _batchRows = [];

export function openBatchModal(rerender) {
  _batchRows = [];
  const html = `
    <p class="batch-hint">CSV con columnas: <span class="hint-amber">nombre, categoria, base_de_datos, consulta_sql</span>. Múltiples BDs con <span class="hint-cyan">;</span></p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button type="button" class="btn btn-primary" data-action="download-template">↓ plantilla</button>
      <label class="btn batch-upload" for="batch-file" style="cursor:pointer">⇧ cargar CSV
        <input id="batch-file" type="file" accept=".csv" data-action="batch-file" style="display:none">
      </label>
    </div>
    <div id="batch-preview-area"></div>
  `;
  const overlay = openModal('Importación por lote', html, 900);

  overlay.addEventListener('change', e => {
    if (e.target.dataset.action === 'batch-file') handleBatchFile(e);
  });
  overlay.addEventListener('click', e => {
    const action = e.target.dataset.action;
    if (action === 'download-template') downloadTemplate();
    else if (action === 'batch-back') { _batchRows = []; document.getElementById('batch-preview-area').innerHTML = ''; }
    else if (action === 'batch-import') importBatch(rerender);
  });
  overlay.addEventListener('input', e => {
    const idx = e.target.dataset.batchIdx;
    if (idx === undefined) return;
    const field = e.target.dataset.batchField;
    const i = parseInt(idx, 10);
    if (e.target.type === 'checkbox') _batchRows[i].include = e.target.checked;
    else if (field) _batchRows[i][field] = e.target.value;
    if (e.target.type === 'checkbox') renderBatchPreview();
  });
}

function downloadTemplate() {
  const csv = [
    'nombre,categoria,base_de_datos,consulta_sql',
    '"Ventas mensuales","Reportes","Oracle_Prod","SELECT month, SUM(amount) FROM sales GROUP BY month"',
    '"Usuarios activos","General","MySQL_Dev","SELECT COUNT(*) FROM users WHERE active = 1"',
  ].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'plantilla_importacion_sql.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function handleBatchFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > MAX_BATCH_FILE_SIZE) {
    showToast(`Archivo demasiado grande (${formatBytes(file.size)}). Máx: ${formatBytes(MAX_BATCH_FILE_SIZE)}`, 'error');
    e.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => showToast('Error leyendo archivo', 'error');
  reader.onload = ev => {
    const rows = parseCSV(ev.target.result);
    if (rows.length < 2) {
      showToast('archivo vacío o sin filas válidas', 'error');
      return;
    }
    // Saltamos header
    _batchRows = rows.slice(1)
      .map(c => ({
        name: c[0] || '',
        category: c[1] || '',
        database: c[2] || '',
        sql: c[3] || '',
        include: true,
      }))
      .filter(r => r.sql.trim());
    if (_batchRows.length === 0) {
      showToast('No se encontraron consultas válidas', 'error');
      return;
    }
    renderBatchPreview();
  };
  reader.readAsText(file);
}

function renderBatchPreview() {
  const validCount = _batchRows.filter(r => r.include).length;
  const html = `
    <p class="batch-summary"><span class="hint-green">${_batchRows.length}</span> consultas encontradas — <span class="hint-amber">${validCount}</span> seleccionadas.</p>
    <div class="batch-table-wrap">
      <table class="batch-table">
        <thead><tr><th>✓</th><th>Nombre</th><th>Categoría</th><th>BD</th><th>SQL</th></tr></thead>
        <tbody>
          ${_batchRows.map((r, i) => `
            <tr style="opacity:${r.include ? 1 : 0.4}">
              <td><input type="checkbox" ${r.include ? 'checked' : ''} data-batch-idx="${i}" aria-label="Incluir fila ${i + 1}"></td>
              <td><input type="text" value="${esc(r.name)}" data-batch-idx="${i}" data-batch-field="name"></td>
              <td><input type="text" value="${esc(r.category)}" data-batch-idx="${i}" data-batch-field="category"></td>
              <td><input type="text" value="${esc(r.database)}" data-batch-idx="${i}" data-batch-field="database"></td>
              <td style="max-width:220px"><div class="batch-sql-preview"><code class="sql-code sql-code-sm">${highlightSQL(r.sql)}</code></div></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div class="form-actions" style="margin-top:14px">
      <button type="button" class="btn" data-action="batch-back">← volver</button>
      <button type="button" class="btn btn-primary" data-action="batch-import">importar ${validCount} consultas</button>
    </div>
  `;
  document.getElementById('batch-preview-area').innerHTML = html;
}

function importBatch(rerender) {
  const toImport = _batchRows.filter(r => r.include && r.name.trim() && r.sql.trim());
  if (!toImport.length) {
    showToast('sin consultas válidas', 'error');
    return;
  }
  toImport.forEach(r => {
    if (r.category && !state.categories.includes(r.category)) state.categories.push(r.category);
    const dbs = r.database.split(';').map(d => d.trim()).filter(Boolean);
    dbs.forEach(d => { if (!state.databases.includes(d)) state.databases.push(d); });
    state.queries.push({
      id: genId(),
      name: r.name.trim(),
      description: '',
      sql: r.sql.trim(),
      category: r.category || 'General',
      databases: dbs,
      createdAt: new Date().toISOString(),
    });
  });
  saveState();
  closeModal();
  rerender();
  showToast(`${toImport.length} consultas importadas`);
}
