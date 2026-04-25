// SQL highlighting y formatting — funciones puras

import { SQL_KEYWORDS } from './config.js';
import { esc } from './utils.js';

/**
 * Convierte una cadena SQL en HTML con tokens coloreados.
 * Cada token se escapa con esc() antes de insertarse.
 */
export function highlightSQL(sql) {
  if (!sql) return '<span class="sql-comment">-- sin consulta</span>';
  // Tokeniza preservando: identificadores, strings con escape doble, comentarios de línea, saltos, operadores, espacios
  const tokens = sql
    .split(/(\b\w+\b|'(?:[^']|'')*'|"[^"]*"|--[^\n]*|\n|[^\w\s'"-]+|\s+)/g)
    .filter(Boolean);

  return tokens.map(token => {
    if (/^--/.test(token)) return `<span class="sql-comment">${esc(token)}</span>`;
    if (/^['"]/.test(token)) return `<span class="sql-string">${esc(token)}</span>`;
    if (SQL_KEYWORDS.has(token.toUpperCase())) return `<span class="sql-keyword">${esc(token)}</span>`;
    if (/^\d+(\.\d+)?$/.test(token)) return `<span class="sql-number">${esc(token)}</span>`;
    if (/^[^\w\s]/.test(token)) return `<span class="sql-operator">${esc(token)}</span>`;
    return `<span class="sql-default">${esc(token)}</span>`;
  }).join('');
}

const MAJOR_KW = new Set([
  'SELECT','FROM','WHERE','ORDER','GROUP','HAVING','LIMIT','OFFSET',
  'UNION','INTERSECT','EXCEPT','MINUS','INSERT','UPDATE','DELETE',
  'SET','VALUES','INTO','CREATE','ALTER','DROP','WITH','MERGE','USING','MATCHED',
]);
const JOIN_KW = new Set(['JOIN','INNER','LEFT','RIGHT','FULL','CROSS','OUTER','NATURAL']);
const SUB_KW = new Set(['AND','OR','ON']);

const INDENT = '       ';
const SUB_INDENT = '        ';

function isMajorKeyword(t) { return t && MAJOR_KW.has(t.toUpperCase()); }
function isJoinStart(t) { return t && JOIN_KW.has(t.toUpperCase()); }
function isSubKw(t) { return t && SUB_KW.has(t.toUpperCase()); }

function tokenize(s) {
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === ' ' || s[i] === '\n') { i++; continue; }
    // String literal con escape de comilla doble ''
    if (s[i] === "'") {
      let j = i + 1;
      while (j < s.length && (s[j] !== "'" || s[j + 1] === "'")) {
        if (s[j] === "'" && s[j + 1] === "'") j += 2; else j++;
      }
      tokens.push(s.substring(i, j + 1));
      i = j + 1;
      continue;
    }
    if (s[i] === '(' || s[i] === ')') { tokens.push(s[i]); i++; continue; }
    if (s[i] === ',') { tokens.push(','); i++; continue; }
    if (s[i] === ';') { tokens.push(';'); i++; continue; }
    // Operadores compuestos
    if ('=<>!+-*/|&'.includes(s[i])) {
      let j = i;
      while (j < s.length && '=<>!+-*/|&'.includes(s[j])) j++;
      tokens.push(s.substring(i, j));
      i = j;
      continue;
    }
    // Identificador / palabra
    let j = i;
    while (
      j < s.length &&
      s[j] !== ' ' && s[j] !== '\n' &&
      s[j] !== '(' && s[j] !== ')' &&
      s[j] !== ',' && s[j] !== ';' &&
      s[j] !== "'" &&
      !'=<>!+-*/|&'.includes(s[j])
    ) j++;
    if (j > i) { tokens.push(s.substring(i, j)); i = j; }
    else i++;
  }
  return tokens;
}

function collectJoin(tokens, start) {
  const parts = [];
  let i = start;
  while (i < tokens.length && JOIN_KW.has(tokens[i].toUpperCase())) {
    parts.push(tokens[i].toUpperCase());
    i++;
  }
  return { phrase: parts.join(' '), consumed: i - start };
}

function formatBlock(tokens, baseIndent) {
  const lines = [];
  let currentLine = '';
  let i = 0;
  let selectIndent = baseIndent + INDENT;

  const pushLine = () => {
    if (currentLine.trim()) lines.push(currentLine);
    currentLine = '';
  };

  while (i < tokens.length) {
    const t = tokens[i];
    const tUp = t.toUpperCase();

    // Subconsulta entre paréntesis
    if (t === '(') {
      let depth = 1;
      let j = i + 1;
      while (j < tokens.length && depth > 0) {
        if (tokens[j] === '(') depth++;
        if (tokens[j] === ')') depth--;
        j++;
      }
      const innerTokens = tokens.slice(i + 1, j - 1);
      const isSub = innerTokens.length > 0 && innerTokens[0].toUpperCase() === 'SELECT';
      if (isSub) {
        const subFormatted = formatBlock(innerTokens, baseIndent + SUB_INDENT);
        currentLine += '(';
        pushLine();
        lines.push(...subFormatted.split('\n'));
        currentLine = baseIndent + ')';
        if (
          j < tokens.length &&
          tokens[j] !== ',' && tokens[j] !== ')' &&
          !isMajorKeyword(tokens[j]) && !isJoinStart(tokens[j]) && !isSubKw(tokens[j]) &&
          tokens[j] !== ';'
        ) {
          currentLine += ' ' + tokens[j];
          j++;
        }
      } else {
        currentLine += '(' + innerTokens.join(' ') + ')';
      }
      i = j;
      continue;
    }
    if (t === ')') { currentLine += ')'; i++; continue; }
    if (t === ',') { currentLine += ','; pushLine(); currentLine = selectIndent; i++; continue; }
    if (t === ';') { currentLine += ';'; pushLine(); i++; continue; }

    if (isMajorKeyword(t)) {
      pushLine();
      if (tUp === 'ORDER' || tUp === 'GROUP') {
        if (i + 1 < tokens.length && tokens[i + 1].toUpperCase() === 'BY') {
          currentLine = baseIndent + tUp + ' BY';
          selectIndent = baseIndent + ' '.repeat(tUp.length + 4);
          i += 2;
          continue;
        }
      }
      currentLine = baseIndent + tUp;
      selectIndent = baseIndent + ' '.repeat(tUp.length + 1);
      i++;
      continue;
    }

    if (isJoinStart(t)) {
      pushLine();
      const { phrase, consumed } = collectJoin(tokens, i);
      currentLine = baseIndent + phrase;
      selectIndent = baseIndent + ' '.repeat(phrase.length + 1);
      i += consumed;
      continue;
    }

    if (isSubKw(t)) {
      pushLine();
      currentLine = baseIndent + tUp + ' '.repeat(Math.max(1, 5 - tUp.length));
      i++;
      continue;
    }

    if (currentLine.trim()) currentLine += ' ' + t;
    else currentLine = (currentLine || baseIndent) + t;
    i++;
  }

  pushLine();
  return lines.join('\n');
}

/**
 * Formatea SQL en múltiples líneas con indentación.
 */
export function formatSQL(sql) {
  if (!sql || !sql.trim()) return sql;
  let input = sql.replace(/\r\n/g, '\n').replace(/\t/g, ' ');
  input = input.replace(/  +/g, ' ').trim();
  return formatBlock(tokenize(input), '');
}
