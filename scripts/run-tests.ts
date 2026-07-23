// Runs every test suite and summarizes.  →  npm test
import { spawnSync } from 'node:child_process';

const SUITES = [
  'test-gestures.ts',
  'test-algebra.ts',
  'test-project.ts',
  'test-path.ts',
  'test-labels.ts',
  'test-api.ts',
  'test-data-files.ts',
];

let failed = 0;
for (const suite of SUITES) {
  console.log(`\n━━ ${suite} ${'━'.repeat(Math.max(0, 44 - suite.length))}`);
  const res = spawnSync('npx', ['tsx', `scripts/${suite}`], { stdio: 'inherit' });
  if (res.status !== 0) failed++;
}

console.log(`\n${'═'.repeat(50)}`);
if (failed === 0) {
  console.log(`ALL ${SUITES.length} SUITES PASSED`);
} else {
  console.log(`${failed} of ${SUITES.length} suites FAILED`);
  process.exit(1);
}
