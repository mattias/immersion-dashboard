import test from 'node:test';
import assert from 'node:assert/strict';
import { garminSkript, garminNatter } from '../js/garmin.js';

test('the Garmin page script is valid JavaScript with the dates filled in', () => {
  const s = garminSkript('2026-11-01', '2026-11-03');
  assert.doesNotThrow(() => new Function(s));
  assert.match(s, /\("2026-11-01", "2026-11-03"\)$/);
  assert.match(garminSkript(null, '2026-11-03'), /\(null, "2026-11-03"\)$/);
});

test('Garmin nights get the same form as garmin.py writes', () => {
  // Garmin's "local" timestamps are local clock time written as if it were UTC.
  const natter = { '2025-11-01': { s: 25272, p: 79, in: Date.parse('2025-10-31T23:26:00Z'), ut: Date.parse('2025-11-01T06:50:00Z') } };
  assert.deepEqual(garminNatter(natter), { '2025-11-01': { h: 7.02, p: 79, in: '23:26', ut: '06:50' } });
});
