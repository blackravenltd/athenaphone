#!/usr/bin/env node
//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//
// Fold Jest's JSON reports into the summary AthenaSIP's runner reads:
// {"passed":n,"failed":n,"skipped":n,"failures":["name: reason"]}
//
//   node scripts/athenasip-summary.js <out.json> <report.json>...
//
// A report that is missing or unreadable counts as one failure, so a suite
// that crashed before reporting cannot read as a pass.

const fs = require('node:fs');

const [out, ...reports] = process.argv.slice(2);
const summary = { passed: 0, failed: 0, skipped: 0, failures: [] };

for (const file of reports) {
  let report;
  try {
    report = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    summary.failed += 1;
    summary.failures.push(`${file}: no report (${error.message})`);
    continue;
  }
  summary.passed += report.numPassedTests;
  summary.failed += report.numFailedTests;
  summary.skipped += report.numPendingTests + report.numTodoTests;
  for (const suite of report.testResults) {
    for (const test of suite.assertionResults) {
      if (test.status === 'failed') {
        const reason = (test.failureMessages[0] || 'failed')
          .split('\n')[0]
          .slice(0, 300);
        summary.failures.push(`${test.fullName}: ${reason}`);
      }
    }
    // A file that failed to load has no assertion results of its own.
    if (suite.status === 'failed' && suite.assertionResults.length === 0) {
      summary.failed += 1;
      summary.failures.push(
        `${suite.name}: ${(suite.message || 'failed to run').split('\n')[0]}`,
      );
    }
  }
}

fs.writeFileSync(out, JSON.stringify(summary, null, 2) + '\n');
process.exit(summary.failed === 0 ? 0 : 1);
