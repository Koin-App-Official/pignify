/**
 * Performance guardrail (Stage 4 of the RN perf audit): exports the
 * production iOS JS bundle and fails if it exceeds the budget in
 * bundle-size-budget.json. Catches the class of regression that's invisible
 * in a diff — an accidentally-eager import of a heavy library, a dependency
 * bump that triples in size, etc.
 *
 * Usage:
 *   node scripts/check-bundle-size.mjs
 *
 * Exits non-zero (failing CI) if the bundle is over budget. Writes a summary
 * to $GITHUB_STEP_SUMMARY when running in GitHub Actions.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const budget = JSON.parse(readFileSync(new URL('../bundle-size-budget.json', import.meta.url)));

function formatMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function checkPlatform(platform) {
  const config = budget[platform];
  if (!config) return null;

  const workDir = mkdtempSync(join(tmpdir(), `piggy-bundle-size-${platform}-`));
  const bundleOutput = join(workDir, 'main.jsbundle');
  const assetsDest = join(workDir, 'assets');

  try {
    execFileSync(
      'npx',
      [
        'expo',
        'export:embed',
        '--platform', platform,
        '--dev', 'false',
        '--minify', 'true',
        '--entry-file', 'node_modules/expo-router/entry.js',
        '--bundle-output', bundleOutput,
        '--assets-dest', assetsDest,
        '--reset-cache',
      ],
      { stdio: 'inherit' }
    );

    const bytes = statSync(bundleOutput).size;
    const overBudget = bytes > config.maxBytes;
    const deltaFromBaseline = config.baselineBytes ? bytes - config.baselineBytes : null;

    return { platform, bytes, config, overBudget, deltaFromBaseline };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

const results = ['ios', 'android'].map(checkPlatform).filter(Boolean);

let anyOverBudget = false;
const reportLines = ['## Bundle size report', ''];

for (const r of results) {
  const status = r.overBudget ? '❌ OVER BUDGET' : '✅ within budget';
  const deltaStr =
    r.deltaFromBaseline == null
      ? ''
      : ` (${r.deltaFromBaseline >= 0 ? '+' : ''}${formatMB(r.deltaFromBaseline)} vs baseline)`;
  const line = `${r.platform}: ${formatMB(r.bytes)} / ${formatMB(r.config.maxBytes)} budget — ${status}${deltaStr}`;
  console.log(line);
  reportLines.push(`- ${line}`);
  if (r.overBudget) anyOverBudget = true;
}

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, reportLines.join('\n') + '\n');
}

if (anyOverBudget) {
  console.error(
    '\nBundle size exceeded budget. Check for a newly-eager import of a heavy library ' +
    '(react-native-calendars, rive-react-native, etc.), or update bundle-size-budget.json ' +
    'deliberately if the growth is expected and justified.'
  );
  process.exit(1);
}
