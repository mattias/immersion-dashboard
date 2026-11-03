process.env.TZ = 'Europe/Stockholm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { avrunda, norm, dagMedByte, kombinera, ankiDagar, gsmResultat, mokuroResultat, mokuroTitel, mpvResultat, webbResultat, nyttResultat, rent, ttuResultat, hoshiResultat } from '../js/calc.js';

const ms = s => new Date(s).getTime();

test('rounds like Python', () => {
  // Python: round(31.95, 1) == 31.9 because 31.95 is stored as 31.9499..., and round(2.25, 1) == 2.2 (tie to even).
  assert.deepEqual([31.95, 2.25, 2.35, 0.05, 48.55, -2.25, 1.15, 7].map(x => avrunda(x, 1)), [31.9, 2.2, 2.4, 0.1, 48.5, -2.2, 1.1, 7]);
});

test('normalises titles across width and spaces', () => {
  assert.equal(norm('ＮＨＫに　ようこそ !'), norm('NHKにようこそ!'));
});

test('Anki day changes at the rollover hour', () => {
  assert.equal(dagMedByte(ms('2026-11-03T03:59:00+01:00'), 4), '2026-11-02');
  assert.equal(dagMedByte(ms('2026-11-03T04:00:00+01:00'), 4), '2026-11-03');
  assert.equal(dagMedByte(ms('2026-11-01T00:30:00+01:00'), 4), '2026-10-31');
});

test('the same book in two readers counts once, the larger entry wins', () => {
  const a = nyttResultat(), b = nyttResultat();
  ttuResultat(a, [{ dateKey: '2026-11-01', title: '本 好き', charactersRead: 1000, readingTime: 600 }], 'ttu');
  ttuResultat(b, [{ dateKey: '2026-11-01', title: '本好き', charactersRead: 1500, readingTime: 700 }], 'yatsu');
  const d = kombinera([rent(a), rent(b)]);
  assert.equal(d['2026-11-01'].akt.length, 1);
  assert.deepEqual(d['2026-11-01'].akt[0], { k: 'bok', t: '本好き', c: 1500, m: 11.7, s: 'yatsu' });
});

test('tiny entries are dropped', () => {
  const r = nyttResultat();
  r.lagg('2026-11-01', 'bok', 'x', 0, 0.4, 'ttu');
  assert.deepEqual(kombinera([rent(r)]), {});
});

test('Anki reviews per day', () => {
  const lekar = new Map([[1, '日本語::Mining'], [2, 'Filtered']]);
  const rader = [
    [ms('2026-11-02T10:00:00+01:00'), 10, 3, 6000, 0, 1, 0],
    [ms('2026-11-02T11:00:00+01:00'), 10, 1, 6000, 1, 1, 0],
    [ms('2026-11-02T12:00:00+01:00'), 11, 3, 6000, 1, 2, 1],
    [ms('2026-11-02T12:00:01+01:00'), 11, 0, 0, 1, 2, 1], // rescheduled, not a review
    [ms('2026-11-02T12:00:02+01:00'), 12, 3, 6000, 4, 1, 0], // manual
    [ms('2026-11-02T13:00:00+01:00'), 99, 3, 3000, 1, null, null]
  ];
  assert.deepEqual(ankiDagar(rader, lekar, 4), { '2026-11-02': { r: 4, m: 0.4, n: 1, ok: 2, t: 3, d: { Mining: 3, 'Deleted cards': 1 } } });
});

test('GSM: rollup up to the last rolled-up day, lines after it, speed cap and pauses', () => {
  const namn = new Map([[1, 'ゲーム'], [2, 'Discord']]);
  const rollup = [['2026-11-01', 1, 96000, 300], ['2026-11-01', 2, 500, 600]];
  const t0 = ms('2026-11-02T20:00:00+01:00') / 1000;
  const lines = [[1, t0, 10], [1, t0 + 60, 20], [1, t0 + 1000, 30], [2, t0, 99]];
  const r = gsmResultat(namn, rollup, lines, { bort: ['Discord'], maxFart: 20000, paus: 180 });
  assert.deepEqual(r.akt, [['2026-11-01', 'spel', 'ゲーム', 1666, 5, 'GSM'], ['2026-11-02', 'spel', 'ゲーム', 60, 4, 'GSM']]);
});

test('Hoshi sessions are summed per day', () => {
  const r = nyttResultat();
  hoshiResultat(r, { metadata: { value: { title: 'カラフル' } }, sessions: {
    a: { value: { startedAt: ms('2026-11-02T08:00:00+01:00'), readingTime: 600, charactersRead: 1000 } },
    b: { value: { startedAt: ms('2026-11-02T21:00:00+01:00'), readingTime: 300, charactersRead: 400 } },
    c: { value: { startedAt: ms('2026-11-02T22:00:00+01:00'), readingTime: 0, charactersRead: 50 } } } });
  assert.deepEqual(r.akt, [['2026-11-02', 'bok', 'カラフル', 1400, 15, 'Hoshi']]);
});

test('Mokuro titles lose release tags', () => {
  assert.equal(mokuroTitel('[Group] よつばと! 第01巻 (2003)'), 'よつばと! 第01巻');
  assert.equal(mokuroTitel('[x]'), '[x]');
});

test('Mokuro: paging back is not new text, the rest goes on the last day', () => {
  const t = ms('2026-11-02T20:00:00+01:00');
  const vol = {
    a: { volume_title: 'マンガ 1', chars: 900, timeReadInMinutes: 30, recentPageTurns: [[t, 1, 0], [t + 60e3, 2, 300], [t + 120e3, 1, 0], [t + 180e3, 2, 300], [t + 240e3, 3, 500]] },
    b: { volume_title: 'gone', deletedOn: 1 }
  };
  const r = mokuroResultat(vol, { paus: 180, maxFart: 20000 });
  assert.deepEqual(r.akt, [['2026-11-02', 'manga', 'マンガ 1', 900, 30, 'Mokuro']]);
});

test('immersion-mpv lines are increments, summed per file', () => {
  const rader = [
    { date: '2026-11-02', file: '[Sub] Show - 03 (1080p).mkv', title: 'Show - 03', seconds: 50, chars: 100, episode: 3 },
    { date: '2026-11-02', file: '[Sub] Show - 03 (1080p).mkv', title: 'Show', anilist_id: 1, seconds: 40, chars: 50, episode: 3 },
    { date: '2026-11-02', file: 'clip.mp4', title: 'clip.mp4', seconds: 30, chars: 0 }
  ].map(x => JSON.stringify(x)).join('\n');
  const d = kombinera([mpvResultat(rader)]);
  assert.deepEqual(d['2026-11-02'].akt, [{ k: 'titta', t: 'Show', c: 150, m: 1.5, s: 'mpv', e: [3] }, { k: 'titta', t: 'clip', c: 0, m: 0.5, s: 'mpv' }]);
});

test('Immersion Web entries are summed per site and series', () => {
  const fil = JSON.stringify({ app: 'immersion-web', version: 1, entries: [
    { date: '2026-11-03', site: 'netflix', id: '1', series: 'Frieren', title: 'A', episode: 3, seconds: 1440, active: 1440, chars: 300 },
    { date: '2026-11-03', site: 'netflix', id: '2', series: 'Frieren', title: 'B', episode: 4, seconds: 1380, active: 600, chars: 250 },
    { date: '2026-11-03', site: 'netflix', id: '3', series: 'Frieren', title: 'C', episode: 5, seconds: 30, active: 30, chars: 5 },
    { date: '2026-11-03', site: 'youtube', id: 'x', series: 'ANNnewsCH', title: 'ニュース', episode: null, seconds: 600, active: 0, chars: 0 },
    { date: '2026-11-04', site: 'twitch', id: 'stylishnoob4', series: 'stylishnoob4', title: '配信', episode: null, seconds: 20, active: 20, chars: 0 }
  ] });
  const r = webbResultat(fil);
  assert.deepEqual(r.akt, [
    ['2026-11-03', 'titta', 'Frieren', 555, 47.5, 'Netflix', [3, 4]],
    ['2026-11-03', 'titta', 'ANNnewsCH', 0, 10, 'YouTube']
  ]);
  // The same show watched in mpv the same day counts once, the larger entry.
  const d = kombinera([r, mpvResultat(JSON.stringify({ date: '2026-11-03', file: 'f.mkv', title: 'Frieren', anilist_id: 1, seconds: 600, chars: 100, episode: 3 }))]);
  assert.deepEqual(d['2026-11-03'].akt.map(a => [a.t, a.s]), [['Frieren', 'Netflix'], ['ANNnewsCH', 'YouTube']]);
  assert.throws(() => webbResultat('{"app":"something else"}'));
});
