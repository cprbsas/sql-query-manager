// Parser CSV — soporta saltos de línea dentro de campos entre comillas y escape de comilla doble

/**
 * Parsea contenido CSV completo en filas.
 * Soporta:
 *  - Campos entre comillas con saltos de línea internos
 *  - Comillas escapadas con doble comilla ("")
 *  - Campos sin comillas
 * @param {string} text Contenido completo del CSV
 * @returns {string[][]} Array de filas, cada fila es un array de campos
 */
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') {
      row.push(field);
      // Solo agregamos la fila si no es completamente vacía
      if (row.some(c => c.trim() !== '')) rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += ch;
    i++;
  }

  // Última fila si no terminó en newline
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.some(c => c.trim() !== '')) rows.push(row);
  }

  return rows;
}

/**
 * Compatibilidad: parsea una sola línea (legacy).
 * Ahora delega al parser completo y devuelve la primera fila.
 */
export function parseCSVLine(line) {
  const rows = parseCSV(line);
  return rows.length ? rows[0].map(c => c.trim()) : [];
}
