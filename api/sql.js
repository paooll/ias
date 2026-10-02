/**
 * MediCare Pro — VULNERABLE SQL Query API (intentional security lab)
 * =========================================================================
 * ❌ String concatenation: the user's `id` is pasted straight into the query
 * ❌ Comments are stripped, so `--` terminates the rest of the statement
 * ❌ Stacked statements execute: INSERT / UPDATE / DELETE / DROP all run
 * ❌ Errors are returned to the client, so the attacker can see what failed
 *
 * This file ships with a small SQL interpreter so the injection is genuine
 * logic rather than a hardcoded "you were injected" response. It parses the
 * concatenated query and really mutates the in-memory tables, which is what
 * makes the write-injection lesson land.
 *
 * HONEST SCOPE — read this before presenting:
 *   There is no database in this app. `package.json` has no SQL driver
 *   (dotenv, express, firebase-admin only). `DB` below is a plain JavaScript
 *   object held in memory and wiped whenever the process restarts. So the
 *   injection is real code execution against a real data structure, but it is
 *   NOT a real SQL server. Say "against a real database this writes a row that
 *   survives restarts and is visible to every user" — do not claim the rows
 *   here are persisted hospital records.
 *
 * See SQLI-ATTACK-INSTRUCTIONS.md for the payloads and the secure pattern.
 */

// ---------------------------------------------------------------------------
// Seed data. Mutable, and shared across requests so injected writes are
// observable by the next lookup.
// ---------------------------------------------------------------------------
function seedDB() {
  return {
    patients: [
      { id: 1, name: 'Maria Santos',    diagnosis: 'Hypertension',            ssn: '123-45-6789', notes: 'Monthly checkups required. Medication: Amlodipine 5mg daily.' },
      { id: 2, name: 'Juan Dela Cruz',  diagnosis: 'Diabetes Type 2',         ssn: '987-65-4321', notes: 'Insulin dependent. Monitor fasting glucose daily. HbA1c quarterly.' },
      { id: 3, name: 'Ana Reyes',       diagnosis: 'Bronchial Asthma',        ssn: '456-78-9012', notes: 'Carry salbutamol inhaler. Avoid dust and allergens.' },
      { id: 4, name: 'Pedro Bautista',  diagnosis: 'Rheumatoid Arthritis',    ssn: '321-54-9870', notes: 'Physical therapy twice weekly. NSAIDs prescribed.' },
      { id: 5, name: 'Rosario Garcia',  diagnosis: 'Coronary Artery Disease', ssn: '654-32-1098', notes: 'Aspirin 75mg daily. Restrict strenuous activity.' },
    ],
    users: [
      { id: 1, username: 'admin',       password: 'admin123', role: 'Administrator', email: 'admin@medicare.ph' },
      { id: 2, username: 'doctor',      password: 'password1', role: 'Physician',     email: 'santos@medicare.ph' },
      { id: 3, username: 'nurse',       password: 'nurse123',  role: 'Nurse',         email: 'reyes@medicare.ph' },
      { id: 4, username: 'radiologist', password: 'xray2024',  role: 'Radiologist',   email: 'bautista@medicare.ph' },
    ],
  };
}

let DB = seedDB();

// ---------------------------------------------------------------------------
// Lexing helpers. All of these respect quoted strings so that a payload like
//   'x' OR name='a;b'
// does not get its semicolon treated as a statement break.
// ---------------------------------------------------------------------------

function stripComments(sql) {
  let out = '';
  let quote = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) {
      out += ch;
      if (ch === quote && sql[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; out += ch; continue; }
    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      out += ' '; continue;
    }
    if (ch === '#') {
      while (i < sql.length && sql[i] !== '\n') i++;
      out += ' '; continue;
    }
    if (ch === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i++; out += ' '; continue;
    }
    out += ch;
  }
  return out;
}

function splitStatements(sql) {
  const parts = [];
  let buf = '';
  let quote = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) {
      buf += ch;
      if (ch === quote && sql[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; buf += ch; continue; }
    if (ch === ';') {
      if (buf.trim()) parts.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

/** Split on `delim` at nesting depth 0, ignoring delimiters inside quotes. */
function splitTop(str, delim = ',') {
  const out = [];
  let buf = '';
  let depth = 0;
  let quote = null;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (quote) {
      buf += ch;
      if (ch === quote && str[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; buf += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === delim && depth === 0) { out.push(buf.trim()); buf = ''; continue; }
    buf += ch;
  }
  if (buf.trim() !== '') out.push(buf.trim());
  return out;
}

/** Split on a bare keyword at depth 0, outside quotes. Used for UNION. */
function splitOnKeyword(str, kw) {
  const out = [];
  let buf = '';
  let quote = null;
  const low = str.toLowerCase();
  const target = kw.toLowerCase();
  let i = 0;
  while (i < str.length) {
    const ch = str[i];
    if (quote) {
      buf += ch;
      if (ch === quote && str[i - 1] !== '\\') quote = null;
      i++;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; buf += ch; i++; continue; }
    if (
      low.startsWith(target, i) &&
      !/[\w]/.test(str[i - 1] || '') &&
      !/[\w]/.test(str[i + target.length] || '')
    ) {
      out.push(buf);
      buf = '';
      i += target.length;
      continue;
    }
    buf += ch;
    i++;
  }
  out.push(buf);
  return out.filter((s) => s.trim().length);
}

/** Index of the first bare occurrence of `kw` outside quotes, or -1. */
function findKeyword(str, kw) {
  const low = str.toLowerCase();
  const target = kw.toLowerCase();
  let quote = null;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (quote) {
      if (ch === quote && str[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (
      low.startsWith(target, i) &&
      !/[\w]/.test(str[i - 1] || '') &&
      !/[\w]/.test(str[i + target.length] || '')
    ) {
      return i;
    }
  }
  return -1;
}

/** Split around the earliest of `kws`: head before it, tail after it. */
function cutKeyword(str, kws) {
  let best = null;
  for (const kw of kws) {
    const idx = findKeyword(str, kw);
    if (idx === -1) continue;
    if (best === null || idx < best.idx) best = { idx, kw };
  }
  if (!best) return { head: str, kw: null, tail: null };
  return { head: str.slice(0, best.idx), kw: best.kw, tail: str.slice(best.idx + best.kw.length) };
}

function unquote(value) {
  const v = String(value).trim();
  if (v.length >= 2 && ((v[0] === "'" && v[v.length - 1] === "'") || (v[0] === '"' && v[v.length - 1] === '"'))) {
    return v.slice(1, -1).replace(/''/g, "'");
  }
  return v;
}

function ident(name) {
  return String(name).trim().replace(/`/g, '');
}

// ---------------------------------------------------------------------------
// Expression evaluator for WHERE / ON clauses.
// Recursive descent: OR < AND < comparison < primary
// ---------------------------------------------------------------------------

function tokenizeExpr(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      let value = '';
      while (j < src.length) {
        if (src[j] === ch) {
          if (src[j + 1] === ch) { value += ch; j += 2; continue; }
          break;
        }
        value += src[j];
        j++;
      }
      tokens.push({ type: 'str', value });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      tokens.push({ type: 'num', value: parseFloat(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_.]/.test(src[j])) j++;
      tokens.push({ type: 'word', value: src.slice(i, j) });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '<>' || two === '!=' || two === '||') {
      tokens.push({ type: 'op', value: two });
      i += 2;
      continue;
    }
    tokens.push({ type: 'op', value: ch });
    i++;
  }
  return tokens;
}

function truthy(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim();
  return s !== '' && s !== '0' && s.toLowerCase() !== 'false';
}

function compare(a, op, b) {
  const asNum = typeof a === 'number' ? a : (a !== '' && !Number.isNaN(Number(a)) ? Number(a) : null);
  const bsNum = typeof b === 'number' ? b : (b !== '' && !Number.isNaN(Number(b)) ? Number(b) : null);
  const x = asNum !== null && bsNum !== null ? asNum : String(a);
  const y = asNum !== null && bsNum !== null ? bsNum : String(b);
  switch (op) {
    case '=':  return x === y;
    case '!=': case '<>': return x !== y;
    case '<':  return x < y;
    case '>':  return x > y;
    case '<=': return x <= y;
    case '>=': return x >= y;
    default:   return false;
  }
}

function evalCondition(clause, row) {
  const tokens = tokenizeExpr(clause);
  let p = 0;

  const isWord = (kw) => tokens[p] && tokens[p].type === 'word' && String(tokens[p].value).toUpperCase() === kw;

  function primary() {
    const t = tokens[p];
    if (!t) return null;
    if (t.type === 'op' && t.value === '(') {
      p++;
      const v = orExpr();
      if (tokens[p] && tokens[p].value === ')') p++;
      return v;
    }
    if (t.type === 'op' && String(t.value).toUpperCase() === 'NOT') {
      p++;
      return !truthy(orExpr());
    }
    p++;
    if (t.type === 'str') return t.value;
    if (t.type === 'num') return t.value;
    const word = String(t.value);
    const up = word.toUpperCase();
    if (up === 'TRUE') return 1;
    if (up === 'FALSE' || up === 'NULL') return 0;
    if (row && Object.prototype.hasOwnProperty.call(row, word)) return row[word];
    // Unknown identifier: treat as a bare literal so `1=1` style payloads work.
    return word;
  }

  function comparison() {
    let left = primary();
    while (tokens[p] && tokens[p].type === 'op' && ['=', '!=', '<>', '<', '>', '<=', '>='].includes(tokens[p].value)) {
      const op = tokens[p].value;
      p++;
      left = compare(left, op, primary());
    }
    return left;
  }

  function andExpr() {
    let left = comparison();
    while (isWord('AND')) {
      p++;
      const right = comparison();
      left = truthy(left) && truthy(right);
    }
    return left;
  }

  function orExpr() {
    let left = andExpr();
    while (isWord('OR')) {
      p++;
      const right = andExpr();
      left = truthy(left) || truthy(right);
    }
    return left;
  }

  return truthy(orExpr());
}

// ---------------------------------------------------------------------------
// Clause parsing
// ---------------------------------------------------------------------------

function parseOrderBy(text) {
  const m = /^\s*([\w`]+)\s*(asc|desc)?/i.exec(text || '');
  if (!m) return null;
  return { column: ident(m[1]), desc: String(m[2] || '').toLowerCase() === 'desc' };
}

function parseClauses(str) {
  const out = { where: null, orderBy: null, limit: null };
  let rest = (str || '').trim();
  for (let guard = 0; guard < 10 && rest; guard++) {
    const cut = cutKeyword(rest, ['where', 'order by', 'limit']);
    if (!cut.kw) break;
    const kw = cut.kw.toLowerCase();
    rest = (cut.tail || '').trim();

    if (kw === 'where') {
      const next = cutKeyword(rest, ['order by', 'limit']);
      out.where = (next.kw ? next.head : rest).trim();
      rest = next.kw ? (next.tail || '').trim() : '';
      if (next.kw && next.kw.toLowerCase() === 'limit') {
        out.limit = parseInt(rest, 10);
        rest = '';
      } else if (next.kw) {
        const after = cutKeyword(rest, ['limit']);
        out.orderBy = parseOrderBy(after.head);
        rest = after.kw ? (after.tail || '').trim() : '';
        if (after.kw) out.limit = parseInt(rest, 10);
      }
      break;
    }

    if (kw === 'limit') {
      out.limit = parseInt(rest, 10);
      break;
    }

    const after = cutKeyword(rest, ['limit']);
    out.orderBy = parseOrderBy(after.head);
    rest = after.kw ? (after.tail || '').trim() : '';
    if (after.kw) out.limit = parseInt(rest, 10);
    break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Statement execution
// ---------------------------------------------------------------------------

function runSelect(segment) {
  let s = segment.trim();
  if (!/^select\s+/i.test(s)) return { error: 'Not a SELECT statement' };
  s = s.replace(/^select\s+/i, '');

  const fromCut = cutKeyword(s, ['from']);
  if (!fromCut.kw) return { error: 'Missing FROM clause' };

  const selectList = fromCut.head.trim();
  const rest = (fromCut.tail || '').trim();

  // table name is the first token after FROM
  const tableMatch = /^([\w`]+)/.exec(rest);
  if (!tableMatch) return { error: 'Missing table name' };
  const tableName = ident(tableMatch[1]);
  const clauses = parseClauses(rest.slice(tableMatch[1].length));

  if (!(tableName in DB)) return { error: `Table "${tableName}" does not exist` };
  const rows = DB[tableName];
  if (rows === null) return { error: `Table "${tableName}" does not exist` };

  

  const star = selectList === '*';
  const items = star ? null : splitTop(selectList).map((c) => ident(c.split(/\s+as\s+/i)[0]));

  let columns;
  if (star) {
    columns = [];
    for (const r of rows) for (const k of Object.keys(r)) if (!columns.includes(k)) columns.push(k);
  } else {
    columns = items;
  }

  // COUNT(*) mixed with other select items (the classic blind-injection
  // probe) collapses the result to a single aggregate row.
  const isAggregate = !!items && items.some((it) => /^count\s*\(\s*\*\s*\)$/i.test(it));

  let selected = rows.map((r) => {
    if (star) return { ...r };
    const out = {};
    for (const c of columns) out[c] = r[c];
    return out;
  });

  if (clauses.where) {
    // Project first so the WHERE clause can reference selected columns only.
    selected = selected.filter((r) => evalCondition(clauses.where, r));
  }

  if (isAggregate) {
    const sample = selected[0] || {};
    const row = {};
    columns.forEach((c) => {
      if (/^count\s*\(\s*\*\s*\)$/i.test(c)) row[c] = selected.length;
      else if (/^-?\d+(\.\d+)?$/.test(c)) row[c] = Number(c);
      else row[c] = sample[c];
    });
    return { columns, rows: [row] };
  }

  if (clauses.orderBy && selected.length) {
    const { column, desc } = clauses.orderBy;
    selected = selected.slice().sort((a, b) => {
      const x = a[column];
      const y = b[column];
      if (x === y) return 0;
      if (x === undefined || x === null) return 1;
      if (y === undefined || y === null) return -1;
      return (x > y ? 1 : -1) * (desc ? -1 : 1);
    });
  }

  if (clauses.limit && clauses.limit > 0) selected = selected.slice(0, clauses.limit);

  return { columns, rows: selected };
}

function runSelectStatement(statement) {
  const segments = splitOnKeyword(statement, 'union');
  let columns = null;
  const rows = [];
  for (const raw of segments) {
    // Drop a trailing `ALL` from `UNION ALL SELECT ...`
    const segment = raw.replace(/^\s*all\s+/i, '');
    const part = runSelect(segment);
    if (part.error) return part;
    if (columns === null) {
      columns = part.columns;
    } else if (part.columns.length !== columns.length) {
      return {
        error:
          `UNION queries have an incompatible number of columns: ` +
          `the first query has ${columns.length}, this one has ${part.columns.length}`,
      };
    }
    rows.push(...part.rows);
  }
  return { columns, rows };
}

function runInsert(statement) {
  const m = /^insert\s+into\s+([\w`]+)\s*(?:\(([^)]*)\))?\s*values\s*\(([\s\S]*)\)$/i.exec(statement.trim());
  if (!m) return { error: 'Malformed INSERT statement' };

  const tableName = ident(m[1]);
  if (!(tableName in DB)) return { error: `Table "${tableName}" does not exist` };
  if (DB[tableName] === null) return { error: `Table "${tableName}" does not exist` };

  const values = splitTop(m[3]).map(unquote);
  const columns = m[2] ? splitTop(m[2]).map(ident) : Object.keys(DB[tableName][0] || {});
  if (columns.length !== values.length) {
    return { error: `Column count (${columns.length}) does not match value count (${values.length})` };
  }

  const row = {};
  columns.forEach((c, i) => { row[c] = values[i]; });

  // AUTO_INCREMENT stand-in: assign the next id when one was not supplied.
  if (row.id === undefined || row.id === '') {
    const ids = DB[tableName].map((r) => Number(r.id)).filter((n) => !Number.isNaN(n));
    row.id = String((ids.length ? Math.max(...ids) : 0) + 1);
  }

  DB[tableName].push(row);
  return { columns, rows: [row], affected: 1, note: `INSERT INTO ${tableName} — 1 row added` };
}

function runUpdate(statement) {
  const head = /^update\s+([\w`]+)\s+set\s+([\s\S]*)$/i.exec(statement.trim());
  if (!head) return { error: 'Malformed UPDATE statement' };

  const tableName = ident(head[1]);
  if (!(tableName in DB)) return { error: `Table "${tableName}" does not exist` };
  if (DB[tableName] === null) return { error: `Table "${tableName}" does not exist` };

  const setCut = cutKeyword(head[2], ['where']);
  const assignments = splitTop(setCut.head);
  const where = setCut.kw ? (setCut.tail || '').trim() : null;

  const targets = DB[tableName].filter((r) => !where || evalCondition(where, r));
  for (const row of targets) {
    for (const assignment of assignments) {
      const eq = assignment.indexOf('=');
      if (eq === -1) return { error: `Malformed assignment: ${assignment}` };
      const column = ident(assignment.slice(0, eq));
      row[column] = unquote(assignment.slice(eq + 1));
    }
  }
  return { columns: Object.keys(targets[0] || {}), rows: targets, affected: targets.length,
           note: `UPDATE ${tableName} — ${targets.length} row(s) modified` };
}

function runDelete(statement) {
  const m = /^delete\s+from\s+([\w`]+)(?:\s+where\s+([\s\S]*))?$/i.exec(statement.trim());
  if (!m) return { error: 'Malformed DELETE statement' };

  const tableName = ident(m[1]);
  if (!(tableName in DB)) return { error: `Table "${tableName}" does not exist` };
  if (DB[tableName] === null) return { error: `Table "${tableName}" does not exist` };

  const where = m[2] ? m[2].trim() : null;
  const removed = DB[tableName].filter((r) => !where || evalCondition(where, r));
  DB[tableName] = DB[tableName].filter((r) => where && !evalCondition(where, r));
  return { columns: [], rows: removed, affected: removed.length,
           note: `DELETE FROM ${tableName} — ${removed.length} row(s) removed` };
}

function runDrop(statement) {
  const m = /^drop\s+table\s+(?:if\s+exists\s+)?([\w`]+)/i.exec(statement.trim());
  if (!m) return { error: 'Malformed DROP statement' };
  const tableName = ident(m[1]);
  if (!(tableName in DB)) return { error: `Table "${tableName}" does not exist` };
  const count = Array.isArray(DB[tableName]) ? DB[tableName].length : 0;
  DB[tableName] = null;
  return { columns: [], rows: [], affected: count, note: `DROP TABLE ${tableName} — table removed` };
}

function runCreate(statement) {
  const m = /^create\s+table\s+(?:if\s+not\s+exists\s+)?([\w`]+)/i.exec(statement.trim());
  if (!m) return { error: 'Malformed CREATE TABLE statement' };
  const tableName = ident(m[1]);
  DB[tableName] = Array.isArray(DB[tableName]) ? DB[tableName] : [];
  return { columns: [], rows: [], affected: 0, note: `CREATE TABLE ${tableName} — table present` };
}

// ---------------------------------------------------------------------------
// Execute a whole (possibly stacked) query
// ---------------------------------------------------------------------------

function executeQuery(sql) {
  const cleaned = stripComments(sql);
  const statements = splitStatements(cleaned);
  const effects = [];
  let columns = [];
  let rows = [];

  for (const statement of statements) {
    if (/^select\b/i.test(statement)) {
      const result = runSelectStatement(statement);
      if (result.error) {
        effects.push({ statement, error: result.error });
        continue;
      }
      columns = result.columns.length ? result.columns : columns;
      rows = rows.concat(result.rows);
      continue;
    }

    let result;
    if (/^insert\b/i.test(statement))       result = runInsert(statement);
    else if (/^update\b/i.test(statement))  result = runUpdate(statement);
    else if (/^delete\b/i.test(statement))  result = runDelete(statement);
    else if (/^drop\b/i.test(statement))    result = runDrop(statement);
    else if (/^create\b/i.test(statement))  result = runCreate(statement);
    else result = { error: `Unsupported statement: ${statement.slice(0, 60)}` };

    if (result.error) {
      effects.push({ statement, error: result.error });
      continue;
    }
    if (result.note) effects.push({ statement, note: result.note });
    // Writes surface the affected rows so the change is visible immediately.
    if (result.rows && result.rows.length) {
      columns = columns.length ? columns : Object.keys(result.rows[0]);
      rows = rows.concat(result.rows);
    }
  }

  // Report the columns actually present on the returned rows. For a UNION the
  // row shape comes from the injected branch, not from the leading SELECT.
  if (rows.length && rows[0] && Object.keys(rows[0]).length) {
    columns = Object.keys(rows[0]);
  }

  return { statements, columns, rows, effects };
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

function tableState() {
  const state = {};
  for (const key of Object.keys(DB)) {
    state[key] = DB[key] === null ? null : DB[key].length;
  }
  return state;
}

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Lab reset: /api/sql?reset=1 reseeds the tables. Stands in for the
  // `npm run reset:patients` script, since an injected DROP otherwise sticks
  // until the process restarts.
  if (req.query.reset) {
    DB = seedDB();
    return res.status(200).json({
      reset: true,
      query: '-- lab data restored',
      executed: [],
      results: [],
      columns: [],
      rowCount: 0,
      effects: [{ note: 'patients and users reseeded' }],
      tables: tableState(),
      note: '✅ Lab data restored to its seeded state.',
    });
  }

  const rawId = req.query.id || '';

  // ❌ VULNERABLE — the user input is pasted directly into the SQL text.
  // The secure version binds it: db.execute('SELECT ... WHERE id = ?', [rawId]).
  const query = `SELECT id, name, diagnosis FROM patients WHERE id = '${rawId}'`;

  const { statements, columns, rows, effects } = executeQuery(query);

  const wrote = effects.some((e) => e.note && /^(INSERT|UPDATE|DELETE|DROP|CREATE)/.test(e.note));

  return res.status(200).json({
    query,                 // Shows the attacker exactly what was executed.
    executed: statements,   // After comment stripping — proves `--` worked.
    results: rows,
    columns,
    rowCount: rows.length,
    effects,
    tables: tableState(),
    note: wrote
      ? '⚠ Statement executed — the in-memory tables were modified.'
      : rows.length
        ? '❌ Unsanitized input was concatenated into the query. Note what the attacker could read.'
        : 'No rows matched.',
  });
};