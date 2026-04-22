/**
 * validate-changelog.mjs
 * 
 * Pre-build script that enforces changelog entries.
 * If source files have been modified but no changelog entry exists
 * for today, the build fails with a clear, actionable error.
 * 
 * Usage: node scripts/validate-changelog.mjs
 * Runs automatically via "prebuild" in package.json.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const changelogPath = resolve(__dirname, '..', 'public', 'changelog.json');

try {
  const raw = readFileSync(changelogPath, 'utf-8');
  const entries = JSON.parse(raw);

  if (!Array.isArray(entries) || entries.length === 0) {
    fail('changelog.json está vacío. Añade al menos una entrada.');
  }

  // Get today's date in YYYY-MM-DD
  const today = new Date().toISOString().split('T')[0];

  // Check if latest entry is from today
  const latest = entries[0]; // Entries are newest-first
  if (latest.date !== today) {
    fail(
      `La última entrada del changelog es del ${latest.date}, pero hoy es ${today}.\n` +
      `\n` +
      `  Añade una entrada a webapp/public/changelog.json:\n` +
      `  {\n` +
      `    "id": "mi_cambio",\n` +
      `    "date": "${today}",\n` +
      `    "tag": "feature|fix|improvement|refactor",\n` +
      `    "internal": false\n` +
      `    // Si tag es "fix", añade también:\n` +
      `    // "has_regression_test": true\n` +
      `  }\n` +
      `\n` +
      `  Y las traducciones en messages/es.json y messages/en.json:\n` +
      `  "changelog": { "entries": { "mi_cambio": { "title": "...", "body": "..." } } }\n`
    );
  }

  // ── Tag whitelist ────────────────────────────────────────────────────────
  // ONLY these exact strings are valid. "fixed", "bugfix", "fix:ui", etc. are rejected.
  // This prevents agents from accidentally bypassing the regression-test gate
  // by using a tag variant that the pre-commit hook doesn't recognize.
  // To add a new allowed tag, update this array AND the pre-commit hook condition.
  const ALLOWED_TAGS = ['feature', 'fix', 'improvement', 'refactor'];

  for (const entry of entries) {
    if (!ALLOWED_TAGS.includes(entry.tag)) {
      fail(
        `changelog.json — tag inválido en el entry "${entry.id}": "${entry.tag}"\n\n` +
        `  Tags permitidos: ${ALLOWED_TAGS.map(t => `"${t}"`).join(' | ')}\n\n` +
        `  ⚠️  Usar variantes como "fixed", "bugfix", "fix:ui", etc. está prohibido\n` +
        `  porque el pre-commit hook solo reconoce "fix" exacto para el gate de\n` +
        `  tests de regresión (ver AI_GUIDELINES.md § 6).`
      );
    }
  }

  // ── Fix entries must declare has_regression_test: true ───────────────────
  // "false" is not a valid value — see AI_GUIDELINES.md § 6.
  for (const entry of entries) {
    if (entry.tag === 'fix' && entry.has_regression_test !== true) {
      fail(
        `changelog.json — entry "${entry.id}" tiene tag "fix" pero le falta\n` +
        `has_regression_test: true\n\n` +
        `  Todo fix DEBE ir acompañado de su test de regresión.\n` +
        `  Si el bug no es testable (fix CSS/layout puro), usa tag: "improvement".\n` +
        `  Ver AI_GUIDELINES.md § 6.`
      );
    }
  }

  // Verify i18n keys exist for all non-internal entries
  const esMessages = JSON.parse(readFileSync(resolve(__dirname, '..', 'messages', 'es.json'), 'utf-8'));
  const enMessages = JSON.parse(readFileSync(resolve(__dirname, '..', 'messages', 'en.json'), 'utf-8'));

  const publicEntries = entries.filter(e => !e.internal);
  const missingKeys = [];

  for (const entry of publicEntries) {
    const esEntry = esMessages?.changelog?.entries?.[entry.id];
    const enEntry = enMessages?.changelog?.entries?.[entry.id];

    if (!esEntry?.title || !esEntry?.body) {
      missingKeys.push(`  ❌ ES falta: changelog.entries.${entry.id} (title + body)`);
    }
    if (!enEntry?.title || !enEntry?.body) {
      missingKeys.push(`  ❌ EN falta: changelog.entries.${entry.id} (title + body)`);
    }
  }

  if (missingKeys.length > 0) {
    fail(
      `Faltan traducciones de changelog:\n${missingKeys.join('\n')}\n` +
      `\n  Añade las claves en messages/es.json y messages/en.json dentro de "changelog.entries".`
    );
  }

  console.log(`✅ Changelog válido — ${publicEntries.length} entrada(s) pública(s), última: ${latest.date}`);

} catch (err) {
  if (err.code === 'ENOENT') {
    fail('No se encontró webapp/public/changelog.json. Crea el archivo.');
  }
  throw err;
}

function fail(msg) {
  console.error(`\n❌ CHANGELOG REQUERIDO\n${'─'.repeat(50)}\n${msg}\n${'─'.repeat(50)}\n`);
  process.exit(1);
}
