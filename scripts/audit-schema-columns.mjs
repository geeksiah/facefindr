import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCHEMA_PATH = path.join(ROOT, 'supabase', 'Schema structure.txt');
const TARGET_DIRS = [path.join(ROOT, 'apps', 'web', 'src'), path.join(ROOT, 'apps', 'admin', 'src')];
const FILE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

function loadSchemaColumns() {
  const raw = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const map = new Map();
  for (const row of parsed) {
    if (!row?.table_name || !row?.column_name) continue;
    const table = String(row.table_name);
    const col = String(row.column_name);
    if (!map.has(table)) map.set(table, new Set());
    map.get(table).add(col);
  }
  return map;
}

function collectFiles(dir, acc = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist') continue;
      collectFiles(full, acc);
      continue;
    }
    if (FILE_EXTENSIONS.has(path.extname(entry.name))) {
      acc.push(full);
    }
  }
  return acc;
}

function indexToLine(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

function extractObjectLiteral(text, startBraceIndex) {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let escaped = false;
  for (let i = startBraceIndex; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (!inDouble && !inBacktick && ch === "'" && !inSingle) {
      inSingle = true;
      continue;
    } else if (inSingle && ch === "'") {
      inSingle = false;
      continue;
    }
    if (!inSingle && !inBacktick && ch === '"' && !inDouble) {
      inDouble = true;
      continue;
    } else if (inDouble && ch === '"') {
      inDouble = false;
      continue;
    }
    if (!inSingle && !inDouble && ch === '`' && !inBacktick) {
      inBacktick = true;
      continue;
    } else if (inBacktick && ch === '`') {
      inBacktick = false;
      continue;
    }
    if (inSingle || inDouble || inBacktick) continue;

    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth === 0) {
      return text.slice(startBraceIndex, i + 1);
    }
  }
  return null;
}

function parseObjectKeys(objectLiteral) {
  const keys = new Set();
  const keyPattern = /(?:^|[,{]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g;
  let m;
  while ((m = keyPattern.exec(objectLiteral)) !== null) {
    keys.add(m[1]);
  }
  return [...keys];
}

function auditFile(filePath, schemaMap) {
  const text = fs.readFileSync(filePath, 'utf8');
  const findings = [];
  const fromRegex = /\.from\(\s*['"`]([A-Za-z0-9_]+)['"`]\s*\)/g;
  let fromMatch;
  while ((fromMatch = fromRegex.exec(text)) !== null) {
    const table = fromMatch[1];
    const columns = schemaMap.get(table);
    if (!columns) continue;

    const start = fromMatch.index;
    const nextFrom = text.indexOf('.from(', start + 6);
    const segmentEnd = nextFrom === -1 ? Math.min(text.length, start + 5000) : nextFrom;
    const segment = text.slice(start, segmentEnd);

    const argMethodRegex =
      /\.(?:eq|neq|gt|gte|lt|lte|like|ilike|is|contains|containedBy|overlaps|order)\(\s*['"`]([A-Za-z_][A-Za-z0-9_]*)['"`]/g;
    let methodMatch;
    while ((methodMatch = argMethodRegex.exec(segment)) !== null) {
      const column = methodMatch[1];
      if (!columns.has(column)) {
        findings.push({
          filePath,
          line: indexToLine(text, start + methodMatch.index),
          table,
          column,
          source: 'method-arg',
        });
      }
    }

    const mutRegex = /\.(?:insert|update|upsert)\(\s*\{/g;
    let mutMatch;
    while ((mutMatch = mutRegex.exec(segment)) !== null) {
      const braceIndex = start + mutMatch.index + mutMatch[0].length - 1;
      const objectLiteral = extractObjectLiteral(text, braceIndex);
      if (!objectLiteral) continue;
      const keys = parseObjectKeys(objectLiteral);
      for (const key of keys) {
        if (!columns.has(key)) {
          findings.push({
            filePath,
            line: indexToLine(text, braceIndex),
            table,
            column: key,
            source: 'mutation-key',
          });
        }
      }
    }
  }

  return findings;
}

function main() {
  const schemaMap = loadSchemaColumns();
  const files = TARGET_DIRS.flatMap((dir) => collectFiles(dir));
  const findings = [];

  for (const file of files) {
    findings.push(...auditFile(file, schemaMap));
  }

  const normalized = findings
    .filter((f) => !['metadata', 'variables'].includes(f.column))
    .map((f) => ({
      ...f,
      filePath: path.relative(ROOT, f.filePath).replace(/\\/g, '/'),
    }));

  const grouped = new Map();
  for (const item of normalized) {
    const key = `${item.table}:${item.column}:${item.source}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }

  const sorted = [...grouped.entries()]
    .map(([key, refs]) => ({ key, refs }))
    .sort((a, b) => b.refs.length - a.refs.length);

  console.log(`Schema audit findings: ${normalized.length}`);
  for (const { key, refs } of sorted.slice(0, 200)) {
    const [table, column, source] = key.split(':');
    const sample = refs[0];
    console.log(
      `${table}.${column} (${source}) x${refs.length} -> ${sample.filePath}:${sample.line}`
    );
  }
}

main();
