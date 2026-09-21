/**
 * Client <-> Appwrite `incomes` sync (#191 Phase 5, fixes bug B4 — income was
 * previously lost on reinstall, since nothing read the server row back the
 * way goalsSync.ts already does for goals).
 *
 * Write side modelled on device.ts's registerDevice: every write is
 * best-effort and fire-and-forget — local state is the source of truth for
 * the UI, and a failed sync must never block the user from editing their own
 * income. Read side modelled on goalsSync.ts's fetchServerGoals.
 *
 * Pure mapping (cents <-> float, row -> IncomeSource) lives in
 * incomeMapping.ts, not here — see that file's header for why this module
 * itself can't be imported under vitest.
 */
import { Query, Permission, Role } from 'react-native-appwrite';
import { tablesDB, DATABASE_ID } from './appwrite';
import { createLogger } from './logger';
import type { IncomeSource } from './income';
import { toClientIncome, toServerIncomeData, type ServerIncomeRow } from './incomeMapping';

const log = createLogger('incomeSync');

const INCOMES_TABLE = 'incomes';

/**
 * Upsert one income row for the authenticated user — called whenever an
 * income is created or edited (Profile's income list, Phase 6). Uses the
 * income's own client-generated id as the row id, so the server row and the
 * local one are always the same record (also what keeps CLAUDE_onboarding's
 * `incomeId`-seeded row from Phase 4 as a single row rather than a duplicate).
 *
 * `created_at` is (re)written on every push — the same simplification
 * device.ts already makes for `registered_at` (upsertRow always replaces the
 * full row), and nothing server-side orders incomes by creation time.
 */
export async function pushIncome(userId: string, income: IncomeSource): Promise<void> {
  try {
    await tablesDB.upsertRow({
      databaseId: DATABASE_ID,
      tableId: INCOMES_TABLE,
      rowId: income.id,
      data: {
        ...toServerIncomeData(userId, income),
        created_at: new Date().toISOString(),
      },
      permissions: [
        Permission.read(Role.user(userId)),
        Permission.update(Role.user(userId)),
        Permission.delete(Role.user(userId)),
      ],
    });
  } catch (err) {
    log.warn('pushIncome failed (non-fatal):', err);
  }
}

/**
 * Archives an income row server-side (downgrade retention, Phase 9 — C4/C7:
 * archived, never deleted). A partial patch rather than a full upsert, so it
 * can't clobber fields this module doesn't otherwise know about.
 */
export async function archiveIncome(incomeId: string): Promise<void> {
  try {
    await tablesDB.updateRow({
      databaseId: DATABASE_ID,
      tableId: INCOMES_TABLE,
      rowId: incomeId,
      data: { archived: true },
    });
  } catch (err) {
    log.warn('archiveIncome failed (non-fatal):', err);
  }
}

/**
 * Removes an income row server-side — the explicit user-initiated "remove
 * this income" path (Profile, Phase 6). Distinct from archiveIncome: this is
 * a real delete, only ever reached by direct user action, never by a
 * downgrade (which must archive, not delete — C4/C7).
 */
export async function deleteIncome(incomeId: string): Promise<void> {
  try {
    await tablesDB.deleteRow({
      databaseId: DATABASE_ID,
      tableId: INCOMES_TABLE,
      rowId: incomeId,
    });
  } catch (err) {
    log.warn('deleteIncome failed (non-fatal):', err);
  }
}

/** Never throws; returns null on any failure so a hydrate attempt is skip-on-error. */
export async function fetchServerIncomes(userId: string): Promise<IncomeSource[] | null> {
  try {
    const res = await tablesDB.listRows<ServerIncomeRow>({
      databaseId: DATABASE_ID,
      tableId: INCOMES_TABLE,
      queries: [Query.equal('user_id', userId)],
    });
    return res.rows.map(toClientIncome);
  } catch (err) {
    log.warn('fetchServerIncomes failed:', err);
    return null;
  }
}
