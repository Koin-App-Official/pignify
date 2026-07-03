/**
 * Idempotent TablesDB provisioning for the subscription & entitlement system.
 *
 * Targets the EXISTING database `piggnify_mobile_db` and creates only the new,
 * additive tables defined in schema.mjs. Existing tables are never touched.
 *
 * Usage:
 *   node scripts/appwrite/setup.mjs            # DRY RUN (default) — prints the plan, no writes
 *   node scripts/appwrite/setup.mjs --apply    # APPLY — creates tables/columns/indexes + seeds plans
 *
 * Dry run needs no credentials. Apply needs a server API key (never the client) —
 * see .env.appwrite.example. Apply is safe to re-run: 409 conflicts are ignored.
 */
import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { tables, PLAN_SEED, DEFAULT_DATABASE_ID } from './schema.mjs';

loadEnv({ path: '.env.appwrite.local', override: true });

const APPLY = process.argv.includes('--apply');
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || DEFAULT_DATABASE_ID;
const { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY } = process.env;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isConflict = (e) => e?.code === 409 || /already exists/i.test(e?.message || '');

/** Human-readable description of a column for the dry-run plan. */
function describeColumn(a) {
  const flags = [
    a.required ? 'required' : 'optional',
    a.array ? 'array' : null,
    a.default !== undefined ? `default=${JSON.stringify(a.default)}` : null,
    a.size ? `size=${a.size}` : null,
    a.elements ? `enum[${a.elements.join('|')}]` : null,
  ].filter(Boolean);
  return `${a.key} : ${a.type} (${flags.join(', ')})`;
}

function printPlan() {
  console.log('────────────────────────────────────────────────────────────');
  console.log(' DRY RUN — subscription/entitlement provisioning plan');
  console.log('────────────────────────────────────────────────────────────');
  console.log(` Database : ${DATABASE_ID} (existing; not created)`);
  console.log(` New tables: ${tables.length}`);
  let cols = 0, idx = 0;
  for (const t of tables) {
    cols += t.columns.length;
    idx += (t.indexes ?? []).length;
    console.log(`\n  ▶ createTable "${t.id}" (${t.name})`);
    console.log(`      permissions: ${JSON.stringify(t.permissions ?? [])}, rowSecurity: ${t.rowSecurity ?? false}`);
    for (const a of t.columns) console.log(`      + column ${describeColumn(a)}`);
    for (const i of t.indexes ?? []) {
      console.log(`      ⚲ index ${i.key} [${i.type}] on (${i.columns.join(', ')})`);
    }
  }
  console.log(`\n  ▶ seed "plans": upsert ${PLAN_SEED.length} rows → ${PLAN_SEED.map((p) => p.plan_id).join(', ')}`);
  console.log(`\n Totals: ${tables.length} tables, ${cols} columns, ${idx} indexes, ${PLAN_SEED.length} seed rows.`);
  console.log('\n NOTE (naming seam): catalog seeds canonical ids beginner/medium/family;');
  console.log('      live users.plan currently holds "free" (= beginner). Mapping is unresolved.');
  console.log('\n No changes made. Re-run with --apply to provision.');
  console.log('────────────────────────────────────────────────────────────');
}

async function createColumn(db, tableId, a) {
  // Appwrite forbids a default on required columns; pass default only when optional.
  const def = a.required ? undefined : a.default;
  const array = a.array ?? false;
  switch (a.type) {
    case 'string':
      return db.createStringColumn(DATABASE_ID, tableId, a.key, a.size, a.required, def, array);
    case 'integer':
      return db.createIntegerColumn(DATABASE_ID, tableId, a.key, a.required, undefined, undefined, def, array);
    case 'float':
      return db.createFloatColumn(DATABASE_ID, tableId, a.key, a.required, undefined, undefined, def);
    case 'boolean':
      return db.createBooleanColumn(DATABASE_ID, tableId, a.key, a.required, def, array);
    case 'datetime':
      return db.createDatetimeColumn(DATABASE_ID, tableId, a.key, a.required, def, array);
    case 'enum':
      return db.createEnumColumn(DATABASE_ID, tableId, a.key, a.elements, a.required, def, array);
    default:
      throw new Error(`Unknown column type: ${a.type}`);
  }
}

async function waitForColumns(db, tableId, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { columns } = await db.listColumns(DATABASE_ID, tableId);
    if (columns.every((c) => c.status === 'available')) return;
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for columns in "${tableId}"`);
}

async function apply() {
  if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID || !APPWRITE_API_KEY) {
    console.error('✗ Missing credentials. Copy .env.appwrite.example → .env.appwrite.local and fill it in.');
    process.exit(1);
  }
  const { Client, TablesDB } = await import('node-appwrite');
  const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID)
    .setKey(APPWRITE_API_KEY);
  const db = new TablesDB(client);

  // Verify the target database exists; do NOT create it.
  await db.get(DATABASE_ID);
  console.log(`✓ database "${DATABASE_ID}" found\n`);

  for (const t of tables) {
    try {
      await db.createTable(DATABASE_ID, t.id, t.name, t.permissions ?? [], t.rowSecurity ?? false);
      console.log(`✓ table "${t.id}" created`);
    } catch (e) {
      if (isConflict(e)) console.log(`• table "${t.id}" exists`);
      else throw e;
    }
    for (const a of t.columns) {
      try {
        await createColumn(db, t.id, a);
        console.log(`  ✓ column ${t.id}.${a.key}`);
      } catch (e) {
        if (isConflict(e)) console.log(`  • column ${t.id}.${a.key} exists`);
        else throw e;
      }
    }
    await waitForColumns(db, t.id);
    for (const i of t.indexes ?? []) {
      try {
        await db.createIndex(DATABASE_ID, t.id, i.key, i.type, i.columns, i.orders);
        console.log(`  ⚲ index ${t.id}.${i.key}`);
      } catch (e) {
        if (isConflict(e)) console.log(`  • index ${t.id}.${i.key} exists`);
        else throw e;
      }
    }
  }

  for (const plan of PLAN_SEED) {
    await db.upsertRow(DATABASE_ID, 'plans', plan.plan_id, plan);
    console.log(`✓ seeded plan "${plan.plan_id}"`);
  }

  console.log('\n✅ Provisioning complete.');
}

if (APPLY) {
  apply().catch((e) => {
    console.error('\n✗ Apply failed:', e.message || e);
    process.exit(1);
  });
} else {
  printPlan();
}
