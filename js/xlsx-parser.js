// Parser de diccionarios de bases de datos en Excel.
// SheetJS se carga dinámicamente desde CDN (no se incluye en el bundle).
//
// Formato esperado por hoja:
//   - Filas iniciales con metadata (Table ID, Entity Name, Sub System, Storage Period, Incr Volume)
//   - Una fila de cabecera con: No | Attribute Name | Column Name | DataType(Length) | Nullable | PK | FK | Default | Description
//   - Filas de columnas hasta encontrar fila vacía o sección "INDEX"
//   - Sección "INDEX" con cabecera: No | Index Name | Index Column | Uniq | Partition | LOCAL
//   - Filas de índices

import { SHEETJS_CDN } from './config.js';

let sheetJsPromise = null;

/**
 * Carga SheetJS dinámicamente desde CDN, una sola vez.
 * Devuelve el objeto global XLSX.
 */
export function loadSheetJS() {
  if (sheetJsPromise) return sheetJsPromise;
  if (typeof window !== 'undefined' && window.XLSX) {
    sheetJsPromise = Promise.resolve(window.XLSX);
    return sheetJsPromise;
  }
  sheetJsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SHEETJS_CDN;
    script.async = true;
    script.onload = () => {
      if (window.XLSX) resolve(window.XLSX);
      else reject(new Error('SheetJS cargado pero window.XLSX no está disponible'));
    };
    script.onerror = () => reject(new Error('No se pudo cargar SheetJS desde CDN'));
    document.head.appendChild(script);
  });
  return sheetJsPromise;
}

// ─── Helpers ───

function cellText(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function rowIsEmpty(row) {
  if (!row) return true;
  return row.every(c => cellText(c) === '');
}

function norm(s) {
  return cellText(s).toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Busca en una fila el índice de la celda cuyo texto normalizado coincide.
 */
function findLabelIdx(row, label) {
  if (!row) return -1;
  const target = norm(label);
  for (let i = 0; i < row.length; i++) {
    if (norm(row[i]) === target) return i;
  }
  return -1;
}

// Etiquetas conocidas de metadata — usadas para no "robar" el valor de la siguiente columna.
const META_LABELS = new Set([
  'table id', 'entity name', 'sub system', 'storage period', 'incr volume',
]);

/**
 * Para una fila tipo "Label | Value | Label2 | Value2", extrae el valor
 * inmediatamente a la derecha del label dado. Salta celdas vacías,
 * pero se detiene si encuentra otra etiqueta conocida (significa que
 * el valor de este label estaba vacío).
 */
function valueAfter(row, label) {
  const idx = findLabelIdx(row, label);
  if (idx < 0) return '';
  for (let j = idx + 1; j < row.length; j++) {
    const t = cellText(row[j]);
    if (t === '') continue;
    if (META_LABELS.has(norm(t))) return '';
    return t;
  }
  return '';
}

/**
 * ¿La fila contiene la cabecera de columnas?
 * Buscamos al menos "column name" en alguna celda — eso identifica la tabla de columnas.
 */
function isColumnsHeader(row) {
  if (!row) return false;
  return row.some(c => norm(c) === 'column name');
}

/**
 * ¿La fila contiene la cabecera de índices? Buscamos "index name" y "index column".
 */
function isIndexHeader(row) {
  if (!row) return false;
  const cells = row.map(norm);
  return cells.includes('index name') && cells.includes('index column');
}

/**
 * Marca la sección INDEX — una fila que solo dice "index".
 */
function isIndexSectionMarker(row) {
  if (!row) return false;
  const nonEmpty = row.map(cellText).filter(c => c !== '');
  return nonEmpty.length === 1 && norm(nonEmpty[0]) === 'index';
}

// ─── Parser principal de una hoja ───

function parseSheet(aoa, sheetName) {
  // Metadata: escaneamos las primeras filas hasta encontrar la cabecera de columnas
  const meta = {
    tableId: '',
    entityName: '',
    subSystem: '',
    storagePeriod: '',
    incrVolume: '',
  };

  let columnsHeaderIdx = -1;
  let columnsHeaderRow = null;

  // Limite de búsqueda de metadata: hasta donde aparezca el header de columnas
  for (let i = 0; i < aoa.length; i++) {
    const row = aoa[i];
    if (!meta.tableId)       meta.tableId       = valueAfter(row, 'Table ID');
    if (!meta.entityName)    meta.entityName    = valueAfter(row, 'Entity Name');
    if (!meta.subSystem)     meta.subSystem     = valueAfter(row, 'Sub System');
    if (!meta.storagePeriod) meta.storagePeriod = valueAfter(row, 'Storage Period');
    if (!meta.incrVolume)    meta.incrVolume    = valueAfter(row, 'Incr Volume');

    if (isColumnsHeader(row)) {
      columnsHeaderIdx = i;
      columnsHeaderRow = row;
      break;
    }
  }

  if (columnsHeaderIdx < 0) {
    // No se reconoce el formato — saltamos esta hoja
    return null;
  }

  // Construir mapa de columnas: nombre del header -> índice en la fila
  const headerMap = {};
  columnsHeaderRow.forEach((cell, idx) => {
    const key = norm(cell);
    if (key) headerMap[key] = idx;
  });

  const colKey = (...candidates) => {
    for (const c of candidates) {
      const k = norm(c);
      if (k in headerMap) return headerMap[k];
    }
    return -1;
  };

  const idxNo        = colKey('no');
  const idxAttr      = colKey('attribute name');
  const idxColName   = colKey('column name');
  const idxDataType  = colKey('datatype(length)', 'datetype(length)', 'data type', 'datatype', 'datetype');
  const idxNullable  = colKey('nullable');
  const idxPK        = colKey('pk');
  const idxFK        = colKey('fk');
  const idxDefault   = colKey('default');
  const idxDesc      = colKey('description');

  // Leer columnas hasta fila vacía, marcador INDEX o header de índices
  const columns = [];
  let cursor = columnsHeaderIdx + 1;
  while (cursor < aoa.length) {
    const row = aoa[cursor];
    if (rowIsEmpty(row) || isIndexSectionMarker(row) || isIndexHeader(row)) break;
    // Cada fila debe tener al menos un Column Name o Attribute Name no vacío
    const colName = idxColName >= 0 ? cellText(row[idxColName]) : '';
    const attrName = idxAttr >= 0 ? cellText(row[idxAttr]) : '';
    if (colName === '' && attrName === '') { cursor++; continue; }

    columns.push({
      no: idxNo >= 0 ? cellText(row[idxNo]) : '',
      attributeName: attrName,
      columnName: colName,
      dataType: idxDataType >= 0 ? cellText(row[idxDataType]) : '',
      nullable: idxNullable >= 0 ? cellText(row[idxNullable]) : '',
      pk: idxPK >= 0 ? cellText(row[idxPK]) : '',
      fk: idxFK >= 0 ? cellText(row[idxFK]) : '',
      default: idxDefault >= 0 ? cellText(row[idxDefault]) : '',
      description: idxDesc >= 0 ? cellText(row[idxDesc]) : '',
    });
    cursor++;
  }

  // Buscar sección INDEX
  const indexes = [];
  let indexHeaderRow = null;
  let indexHeaderIdx = -1;
  while (cursor < aoa.length) {
    if (isIndexHeader(aoa[cursor])) {
      indexHeaderRow = aoa[cursor];
      indexHeaderIdx = cursor;
      break;
    }
    cursor++;
  }

  if (indexHeaderRow) {
    const idxHeaderMap = {};
    indexHeaderRow.forEach((cell, idx) => {
      const key = norm(cell);
      if (key) idxHeaderMap[key] = idx;
    });
    const ik = (...c) => {
      for (const x of c) {
        const k = norm(x);
        if (k in idxHeaderMap) return idxHeaderMap[k];
      }
      return -1;
    };
    const iNo    = ik('no');
    const iName  = ik('index name');
    const iCols  = ik('index column');
    const iUniq  = ik('uniq', 'unique');
    const iPart  = ik('partition');
    const iLocal = ik('local');

    for (let r = indexHeaderIdx + 1; r < aoa.length; r++) {
      const row = aoa[r];
      if (rowIsEmpty(row)) break;
      const name = iName >= 0 ? cellText(row[iName]) : '';
      const cols = iCols >= 0 ? cellText(row[iCols]) : '';
      if (name === '' && cols === '') continue;
      indexes.push({
        no: iNo >= 0 ? cellText(row[iNo]) : '',
        name,
        columns: cols,
        unique: iUniq >= 0 ? cellText(row[iUniq]) : '',
        partition: iPart >= 0 ? cellText(row[iPart]) : '',
        local: iLocal >= 0 ? cellText(row[iLocal]) : '',
      });
    }
  }

  return {
    sheetName,
    tableId: meta.tableId,
    entityName: meta.entityName,
    subSystem: meta.subSystem,
    storagePeriod: meta.storagePeriod,
    incrVolume: meta.incrVolume,
    columns,
    indexes,
  };
}

// ─── Formato "Export" (orientado a filas por SECCION) ───
//
// Formato alternativo, con una única cabecera arriba y una fila por elemento.
// La columna SECCION distingue el tipo de fila:
//   ORDEN | SECCION | NOMBRE | POSICION | TIPO | LONGITUD | NULLABLE | TIENE_DEFAULT | DESCRIPCION
//   1 | TABLE           | TBABD170      |   |          |    |   |    | AB_WebRecharge
//   2 | COLUMN          | WEB_RELOAD_ID | 1 | VARCHAR2 | 36 | N | N  | WEB RELOAD ID
//   3 | PRIMARY KEY     | TBABD170_PK   | 1 | WEB_RELOAD_ID |  |   |    |
//   4 | INDEX NONUNIQUE | TBABD170_IX_01|   |          |    |   | NO | UPDAT_DATE + SYNC_STAT_CD
//
// Una misma hoja puede contener varias tablas (cada fila TABLE inicia una nueva).
// Se admiten cabeceras en español o inglés.

// Cabeceras conocidas -> clave interna. Se normaliza para comparar.
const EXPORT_HEADER_ALIASES = {
  'orden': 'orden',           'order': 'orden',
  'seccion': 'seccion',       'sección': 'seccion',      'section': 'seccion',
  'nombre': 'nombre',         'name': 'nombre',
  'posicion': 'posicion',     'posición': 'posicion',    'position': 'posicion',
  'tipo': 'tipo',             'type': 'tipo',            'datatype': 'tipo',
  'longitud': 'longitud',     'length': 'longitud',      'size': 'longitud',
  'nullable': 'nullable',     'nulo': 'nullable',        'nulable': 'nullable',
  'tiene_default': 'default',  'tiene default': 'default','has_default': 'default',
  'default': 'default',
  'descripcion': 'descripcion','descripción': 'descripcion','description': 'descripcion',
};

/**
 * Construye un mapa {claveInterna: indiceColumna} si la fila es una cabecera
 * del formato Export. Devuelve null si no lo es.
 * Requisito mínimo: contener SECCION y NOMBRE.
 */
function exportHeaderMap(row) {
  if (!row) return null;
  const map = {};
  row.forEach((cell, idx) => {
    const key = EXPORT_HEADER_ALIASES[norm(cell)];
    if (key && !(key in map)) map[key] = idx;
  });
  if ('seccion' in map && 'nombre' in map) return map;
  return null;
}

/**
 * Clasifica el valor de la columna SECCION.
 * -> 'table' | 'column' | 'pk' | 'index' | 'fk' | ''
 */
function classifySection(v) {
  const s = norm(v);
  if (s === '') return '';
  if (s === 'table' || s === 'tabla') return 'table';
  if (s === 'column' || s === 'columna') return 'column';
  if (s.includes('primary key') || s.includes('llave primaria') || s.includes('clave primaria')) return 'pk';
  if (s.includes('foreign key') || s.includes('llave foranea') || s.includes('clave foranea') || s.includes('foránea')) return 'fk';
  if (s.includes('index') || s.includes('indice') || s.includes('índice')) return 'index';
  return '';
}

/**
 * Compone "TIPO(LONGITUD)" a partir de las celdas correspondientes.
 * NUMBER + "15,0" -> "NUMBER(15,0)"; VARCHAR2 + "36" -> "VARCHAR2(36)".
 */
function composeDataType(tipo, longitud) {
  const t = cellText(tipo);
  const l = cellText(longitud);
  if (t === '') return l;
  if (l === '') return t;
  return `${t}(${l})`;
}

/**
 * Parsea una hoja en formato Export. Devuelve un array de tablas
 * (0, 1 o varias). Cada tabla usa el mismo shape que parseSheet.
 */
function parseExportSheet(aoa, sheetName, headerIdx, hmap) {
  const at = (row, key) => (key in hmap && row ? cellText(row[hmap[key]]) : '');
  const tables = [];
  let cur = null;

  const finish = () => {
    if (cur && (cur.columns.length || cur.tableId || cur.entityName)) tables.push(cur);
    cur = null;
  };

  const newTable = (id, entity) => ({
    sheetName: tables.length ? `${sheetName} (${(id || entity || tables.length + 1)})` : sheetName,
    tableId: id,
    entityName: entity,
    subSystem: '',
    storagePeriod: '',
    incrVolume: '',
    columns: [],
    indexes: [],
    // Índice temporal nombre-de-columna -> objeto columna, para marcar PK
    _byName: {},
  });

  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const row = aoa[i];
    if (rowIsEmpty(row)) continue;
    const kind = classifySection(at(row, 'seccion'));

    if (kind === 'table') {
      finish();
      cur = newTable(at(row, 'nombre'), at(row, 'descripcion'));
      continue;
    }

    // Si aparecen columnas/PK/índices sin una fila TABLE previa, abrimos una tabla implícita.
    if (!cur) cur = newTable('', '');

    if (kind === 'column') {
      const col = {
        no: at(row, 'posicion'),
        attributeName: at(row, 'descripcion'),
        columnName: at(row, 'nombre'),
        dataType: composeDataType(at(row, 'tipo'), at(row, 'longitud')),
        nullable: at(row, 'nullable'),
        pk: '',
        fk: '',
        default: at(row, 'default'),
        description: '',
      };
      cur.columns.push(col);
      if (col.columnName) cur._byName[norm(col.columnName)] = col;
    } else if (kind === 'pk') {
      // La columna que forma parte de la PK viene en TIPO (o POSICION referencia el orden).
      const colName = at(row, 'tipo') || at(row, 'nombre');
      const target = cur._byName[norm(colName)];
      if (target) target.pk = 'Y';
    } else if (kind === 'fk') {
      const colName = at(row, 'tipo') || at(row, 'nombre');
      const target = cur._byName[norm(colName)];
      if (target) target.fk = 'Y';
    } else if (kind === 'index') {
      const uniq = norm(at(row, 'seccion'));
      const isUnique = uniq.includes('unique') && !uniq.includes('nonunique')
        || uniq.includes('unico') || uniq.includes('único');
      cur.indexes.push({
        no: String(cur.indexes.length + 1),
        name: at(row, 'nombre'),
        columns: at(row, 'descripcion') || at(row, 'tipo'),
        unique: isUnique ? 'UNIQUE' : 'NONUNIQUE',
        partition: '',
        local: at(row, 'default'),
      });
    }
  }
  finish();

  // Limpiar el índice temporal antes de devolver.
  tables.forEach(t => { delete t._byName; });
  return tables;
}

// ─── Formato "Códigos comunes" (COMN_CD / COMN_DETAIL_CD) ───
//
// Tablas maestras de códigos comunes (ej. TBAED141 / AE_DetailCommonCode):
// una fila por cada código de detalle, con cabecera:
//   COMN_CD | COMN_DETAIL_CD | COMN_DETAIL_CD_NM | COMN_DETAIL_CD_DESC
// Se guarda como una tabla más, reutilizando el shape de columnas:
// attributeName = grupo, columnName = código de detalle,
// default = nombre, description = descripción.

function normKey(s) {
  return norm(s).replace(/[_\s]+/g, '');
}

const COMMON_CODE_ALIASES = {
  comncd: 'groupCd',
  comndetailcd: 'detailCd',
  comndetailcdnm: 'detailNm',
  comndetailcddesc: 'detailDesc',
};

/**
 * Construye un mapa {claveInterna: indiceColumna} si la fila es cabecera
 * del formato de códigos comunes. Requisito mínimo: COMN_CD + COMN_DETAIL_CD.
 */
function commonCodeHeaderMap(row) {
  if (!row) return null;
  const map = {};
  row.forEach((cell, idx) => {
    const key = COMMON_CODE_ALIASES[normKey(cell)];
    if (key && !(key in map)) map[key] = idx;
  });
  if ('groupCd' in map && 'detailCd' in map) return map;
  return null;
}

/**
 * Parsea una hoja de códigos comunes. Devuelve una sola tabla con una
 * "columna" por cada fila de código de detalle, o null si no hay filas.
 */
function parseCommonCodeSheet(aoa, sheetName, headerIdx, hmap) {
  const at = (row, key) => (key in hmap && row ? cellText(row[hmap[key]]) : '');
  const columns = [];
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const row = aoa[i];
    if (rowIsEmpty(row)) continue;
    const groupCd = at(row, 'groupCd');
    const detailCd = at(row, 'detailCd');
    if (!groupCd && !detailCd) continue;
    columns.push({
      no: String(columns.length + 1),
      attributeName: groupCd,
      columnName: detailCd,
      dataType: '',
      nullable: '',
      pk: '',
      fk: '',
      default: at(row, 'detailNm'),
      description: at(row, 'detailDesc'),
    });
  }
  if (columns.length === 0) return null;
  return {
    sheetName,
    tableId: '',
    entityName: '',
    subSystem: '',
    storagePeriod: '',
    incrVolume: '',
    columns,
    indexes: [],
  };
}

/**
 * Parsea un File (Excel) y devuelve un objeto diccionario con todas las tablas.
 * Detecta automáticamente el formato de cada hoja:
 *   - "Export" (orientado a filas, con columna SECCION) -> puede dar varias tablas.
 *   - "Diccionario" clásico (metadata + cabecera Column Name + INDEX) -> una tabla.
 * { name, sourceFile, importedAt, tables: [...] }
 */
export async function parseExcelDictionary(file) {
  const XLSX = await loadSheetJS();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const tables = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    // header:1 -> array de arrays; defval:'' para celdas vacías
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: true, raw: false });
    if (!aoa || aoa.length === 0) continue;

    // ¿Es formato Export? Buscar cabecera con SECCION + NOMBRE en las primeras filas.
    let exportHeaderIdx = -1;
    let exportMap = null;
    const scanLimit = Math.min(aoa.length, 15);
    for (let i = 0; i < scanLimit; i++) {
      const hm = exportHeaderMap(aoa[i]);
      if (hm) { exportHeaderIdx = i; exportMap = hm; break; }
    }

    if (exportHeaderIdx >= 0) {
      const exportTables = parseExportSheet(aoa, sheetName, exportHeaderIdx, exportMap);
      exportTables.forEach(t => tables.push(t));
      continue;
    }

    // ¿Es formato de códigos comunes? (COMN_CD / COMN_DETAIL_CD)
    let commonCodeHeaderIdx = -1;
    let commonCodeMap = null;
    for (let i = 0; i < scanLimit; i++) {
      const hm = commonCodeHeaderMap(aoa[i]);
      if (hm) { commonCodeHeaderIdx = i; commonCodeMap = hm; break; }
    }

    if (commonCodeHeaderIdx >= 0) {
      const t = parseCommonCodeSheet(aoa, sheetName, commonCodeHeaderIdx, commonCodeMap);
      if (t) tables.push(t);
      continue;
    }

    // Formato clásico
    const parsed = parseSheet(aoa, sheetName);
    if (parsed) tables.push(parsed);
  }
  return {
    name: file.name.replace(/\.(xlsx|xlsm|xls)$/i, ''),
    sourceFile: file.name,
    importedAt: new Date().toISOString(),
    tables,
  };
}
