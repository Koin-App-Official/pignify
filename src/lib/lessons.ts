/**
 * Local financial-literacy content for the "money quiz" mission (#67, Phase 4
 * of Missions v2). Deliberately static and local — no AI coach call, no
 * network, no per-plan quota. General financial literacy facts only, never
 * personalized or prescriptive advice (Piggy is not a licensed advisor).
 */

export interface Lesson {
  id: string;
  topic: string;
  question: string;
  /** Exactly 3 choices, per the plan's "one question, 3 options" spec. */
  options: readonly [string, string, string];
  correctIndex: 0 | 1 | 2;
  /** Shown after answering, correct or not — the actual teaching moment. */
  explanation: string;
}

export const LESSONS: readonly Lesson[] = [
  {
    id: 'emergency-fund',
    topic: 'Emergency fund',
    question: 'What is an emergency fund mainly for?',
    options: ['Covering unexpected expenses', 'Buying investments on a dip', 'Earning the highest interest rate'],
    correctIndex: 0,
    explanation: "It's cash set aside for surprises — a job loss, a medical bill, a car repair — kept easy to access rather than invested for growth.",
  },
  {
    id: 'apy',
    topic: 'APY',
    question: 'What does APY (Annual Percentage Yield) tell you?',
    options: ['Your monthly spending limit', 'The real yearly return including compounding', 'A one-time signup bonus'],
    correctIndex: 1,
    explanation: 'APY factors in compounding, so it reflects what you actually earn over a year — a more honest number than a flat interest rate.',
  },
  {
    id: 'needs-vs-wants',
    topic: 'Needs vs wants',
    question: 'Which of these is usually a "need" rather than a "want"?',
    options: ['Rent', 'Streaming subscriptions', 'Dining out'],
    correctIndex: 0,
    explanation: "Needs keep you housed, fed, and functioning. Wants improve life but aren't essential — the distinction is the backbone of most budgets.",
  },
  {
    id: '50-30-20',
    topic: 'The 50/30/20 rule',
    question: 'In the 50/30/20 budgeting rule, what does the 20% go toward?',
    options: ['Wants', 'Needs', 'Savings and debt payoff'],
    correctIndex: 2,
    explanation: 'The split is roughly 50% needs, 30% wants, 20% savings/debt — a simple starting framework, not a strict rule.',
  },
  {
    id: 'compound-interest',
    topic: 'Compound interest',
    question: 'Why does starting to save early matter so much?',
    options: ['Compound interest earns returns on your past returns too', 'Banks pay more to new savers', 'Prices only go up early in the year'],
    correctIndex: 0,
    explanation: 'Each period, interest is earned on your original amount AND everything it already earned — the growth accelerates the longer it runs.',
  },
  {
    id: 'budgeting-basics',
    topic: 'Budgeting',
    question: 'What is the main point of tracking every expense?',
    options: ['To feel guilty about spending', 'To see where money actually goes', 'To qualify for a loan'],
    correctIndex: 1,
    explanation: "Most people underestimate small recurring spending until they track it — the goal is visibility, not judgment.",
  },
  {
    id: 'credit-score',
    topic: 'Credit score',
    question: 'Which habit most consistently helps a credit score?',
    options: ['Paying bills on time', 'Opening many cards quickly', 'Carrying a balance on purpose'],
    correctIndex: 0,
    explanation: 'Payment history is typically the single biggest factor — consistent on-time payments matter more than any single trick.',
  },
  {
    id: 'diversification',
    topic: 'Diversification',
    question: 'What problem does diversification mainly solve?',
    options: ['Guaranteeing a profit', 'Reducing the impact of any one investment doing badly', 'Avoiding taxes entirely'],
    correctIndex: 1,
    explanation: "Spreading money across different assets means one bad performer doesn't sink the whole picture. It manages risk, not returns.",
  },
  {
    id: 'inflation',
    topic: 'Inflation',
    question: 'What does inflation do to cash sitting idle?',
    options: ['Nothing, cash value never changes', 'Slowly reduces its purchasing power', 'Increases its purchasing power'],
    correctIndex: 1,
    explanation: 'If prices rise faster than your cash earns interest, the same pile of money buys a little less each year.',
  },
  {
    id: 'debt-snowball',
    topic: 'Paying off debt',
    question: 'In the "debt snowball" method, which debt do you pay off first?',
    options: ['The smallest balance', 'The highest interest rate', 'Whichever is most recent'],
    correctIndex: 0,
    explanation: 'Snowball targets the smallest balance first for quick wins and momentum — a different debt method (avalanche) targets highest interest instead.',
  },
  {
    id: 'opportunity-cost',
    topic: 'Opportunity cost',
    question: 'What does "opportunity cost" mean when spending money?',
    options: ['The tax you pay on a purchase', 'What you give up by not using that money elsewhere', 'A store’s markup on an item'],
    correctIndex: 1,
    explanation: 'Every dollar spent one way is a dollar that can’t go toward something else — the real cost includes what you didn’t get to do instead.',
  },
  {
    id: 'net-worth',
    topic: 'Net worth',
    question: 'How is net worth calculated?',
    options: ['Monthly income minus expenses', 'What you own minus what you owe', 'Total savings account balance'],
    correctIndex: 1,
    explanation: "Net worth is a snapshot: everything you own (assets) minus everything you owe (debts). Income is a flow; net worth is a total.",
  },
  {
    id: 'automatic-savings',
    topic: 'Automating savings',
    question: 'Why do automatic transfers to savings tend to work well?',
    options: ['They remove the need to decide every time', 'They earn a legally guaranteed higher rate', 'They are required by most banks'],
    correctIndex: 0,
    explanation: 'Automating "pays yourself first" before you can spend it — it turns saving into a default instead of a decision you have to keep making.',
  },
  {
    id: 'high-yield-savings',
    topic: 'High-yield savings',
    question: 'What mainly distinguishes a high-yield savings account from a regular one?',
    options: ['It has no withdrawal limits at all', 'It pays a meaningfully higher interest rate', 'It doubles as a checking account'],
    correctIndex: 1,
    explanation: 'The core difference is the interest rate — often several times a standard savings account — usually offered by online-first banks.',
  },
  {
    id: 'index-funds',
    topic: 'Index funds',
    question: 'What does an index fund do?',
    options: ['Picks a handful of "winning" stocks', 'Tracks a broad market index as a whole', 'Guarantees a fixed annual return'],
    correctIndex: 1,
    explanation: 'Rather than betting on individual companies, an index fund holds a broad slice of the market, spreading risk across many holdings at once.',
  },
] as const;

/** FNV-1a — deterministic, dependency-free. Mirrors the hash in missions.ts (kept separate on purpose: lessons.ts stays a fully standalone module). */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The lesson assigned to a given calendar day — stable for that date (same
 * input always returns the same lesson), independent of completion state.
 * Cycles back through the list roughly every LESSONS.length days.
 *
 * Deliberately NOT completion-aware: keeping the day→lesson mapping fixed
 * means eligibility and verification (see missions.ts's money-quiz def) agree
 * on which lesson "today" means, even at the exact moment completing it
 * changes what would otherwise be excluded.
 */
export function lessonForDate(dateStr: string): Lesson {
  const index = hashSeed(dateStr) % LESSONS.length;
  return LESSONS[index];
}
