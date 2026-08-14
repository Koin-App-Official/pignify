import { describe, it, expect, beforeEach, vi } from 'vitest';

// The logger writes through a bare `__DEV__` global that only exists in the RN
// runtime; without it the error paths under test would throw ReferenceError.
(globalThis as Record<string, unknown>).__DEV__ = false;

const store = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (k: string) => store.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
    removeItem: vi.fn(async (k: string) => {
      store.delete(k);
    }),
  },
}));

const { saveDraft, loadDraft, clearDraft } = await import('./onboardingDraft');

const KEY = 'piggy-onboarding-draft';

const draft = {
  step: 4,
  firstName: 'Ada',
  country: 'PL',
  currency: 'PLN',
  goalName: 'Vacation',
  targetAmount: '5000',
  planningMode: 'contribution' as const,
  contributionInput: '250',
  targetDate: '2027-01-01T00:00:00.000Z',
  monthlyContribution: 250,
  monthlyIncome: '6000',
  incomeSkipped: false,
  dateOfBirth: '1995-04-02',
  ageBlocked: false,
  email: 'ada@example.com',
};

beforeEach(() => {
  store.clear();
  vi.useRealTimers();
});

describe('onboardingDraft', () => {
  it('round-trips a draft once the debounce elapses', async () => {
    vi.useFakeTimers();
    saveDraft(draft);
    // Nothing is written yet — the write is debounced.
    expect(store.has(KEY)).toBe(false);

    await vi.advanceTimersByTimeAsync(600);
    vi.useRealTimers();

    expect(await loadDraft()).toEqual(draft);
  });

  it('collapses rapid saves into a single write of the latest value', async () => {
    vi.useFakeTimers();
    saveDraft({ ...draft, firstName: 'A' });
    saveDraft({ ...draft, firstName: 'Ad' });
    saveDraft({ ...draft, firstName: 'Ada' });

    await vi.advanceTimersByTimeAsync(600);
    vi.useRealTimers();

    expect(store.size).toBe(1);
    expect((await loadDraft())?.firstName).toBe('Ada');
  });

  it('returns null when nothing has been stored', async () => {
    expect(await loadDraft()).toBeNull();
  });

  it('discards a draft written by an older version', async () => {
    // v2 is the version shipped before the notification step was inserted. Its
    // `step` indices are off by one from AccountFinalization onward, so
    // restoring one would drop the user onto the wrong screen.
    store.set(KEY, JSON.stringify({ ...draft, v: 2 }));
    expect(await loadDraft()).toBeNull();
  });

  it('discards unparseable content instead of throwing', async () => {
    store.set(KEY, 'not json');
    expect(await loadDraft()).toBeNull();
  });

  it('cancels a queued write when cleared, so the draft cannot resurrect', async () => {
    vi.useFakeTimers();
    saveDraft(draft);
    await clearDraft();

    // The debounce window for the pre-clear save now elapses.
    await vi.advanceTimersByTimeAsync(600);
    vi.useRealTimers();

    expect(store.has(KEY)).toBe(false);
    expect(await loadDraft()).toBeNull();
  });

  it('persists ageBlocked so a refused user cannot relaunch into a fresh gate', async () => {
    vi.useFakeTimers();
    saveDraft({ ...draft, step: 1, ageBlocked: true });
    await vi.advanceTimersByTimeAsync(600);
    vi.useRealTimers();

    expect(await loadDraft()).toMatchObject({ step: 1, ageBlocked: true });
  });
});
