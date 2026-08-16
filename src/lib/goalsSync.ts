/**
 * Best-effort read-down for goal metadata from the Appwrite `goals` table.
 * Used once, right after a real login (LoginGate → onLoggedIn), and only when
 * local goals are empty — see authLock.ts. Never runs on an ordinary unlock,
 * and never touches local state once any local goal already exists: the
 * server row is a write-once snapshot from onboarding (nothing syncs local
 * edits back), so it can only ever be as fresh as local, never fresher.
 *
 * There is no server representation for saved progress or deposit history
 * (ONBOARDING_FIXES.md #3) — a restored goal always starts at zero saved
 * progress. This closes the "reinstall creates an orphaned duplicate goal"
 * half of that finding, not the "streak/XP/deposits are gone" half, which
 * needs its own schema + sync project.
 */
import { Query, type Models } from 'react-native-appwrite';
import { tablesDB, DATABASE_ID } from './appwrite';
import { createLogger } from './logger';
import type { Goal } from './store';

const log = createLogger('goalsSync');

type ServerGoalRow = Models.DefaultRow & {
  goal_name: string;
  price_cents: number;
  deadline: string;
  archived?: boolean;
  monthly_contribution_cents?: number;
  planning_mode?: 'contribution' | 'deadline';
};

function toClientGoal(row: ServerGoalRow, isPrimary: boolean): Goal {
  return {
    id: row.$id,
    template: '',
    icon: '🎯',
    name: row.goal_name,
    targetAmount: row.price_cents / 100,
    savedAmount: 0,
    deadline: row.deadline,
    createdAt: row.$createdAt,
    deposits: [],
    isPrimary,
    archived: row.archived ?? false,
    ...(row.planning_mode ? { planningMode: row.planning_mode } : {}),
    ...(row.monthly_contribution_cents != null
      ? { monthlyContribution: row.monthly_contribution_cents / 100 }
      : {}),
  };
}

/** Never throws; returns null on any failure so a hydrate attempt is skip-on-error. */
export async function fetchServerGoals(userId: string): Promise<Goal[] | null> {
  try {
    const res = await tablesDB.listRows<ServerGoalRow>({
      databaseId: DATABASE_ID,
      tableId: 'goals',
      queries: [Query.equal('user_id', userId)],
    });
    return res.rows.map((row, i) => toClientGoal(row, i === 0));
  } catch (err) {
    log.warn('fetchServerGoals failed:', err);
    return null;
  }
}
