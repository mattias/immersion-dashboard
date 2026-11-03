process.env.TZ = 'Europe/Stockholm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import initSqlJs from 'sql.js';
import { lasAnki, lasAnkiConnect, lasGsm, lasLasare, lasMpv, Kallfel } from '../js/sources.js';
import { laggPaWal, oppna, rader } from '../js/sqlite.js';
import { nodeMapp } from '../tools/nodedir.mjs';

const SQL = await initSqlJs();
const ms = s => new Date(s).getTime();
const tmp = await mkdtemp(join(tmpdir(), 'immersion-'));
test.after(() => rm(tmp, { recursive: true, force: true }));
const fixtur = async n => new Uint8Array(await readFile(new URL('./fixtures/' + n, import.meta.url)));

test('committed WAL frames are applied', async () => {
  const db = await fixtur('wal.db'), wal = await fixtur('wal.db-wal');
  const utan = oppna(SQL, db.slice(), null), med = oppna(SQL, db.slice(), wal);
  assert.equal(rader(utan, 'select count(*) from t')[0][0], 1);
  assert.equal(rader(med, 'select count(*) from t')[0][0], 301);
  assert.equal(rader(med, "select count(*) from t where namn = 'ej committad'")[0][0], 0);
});

test('a WAL file with a broken checksum is ignored', async () => {
  const db = await fixtur('wal.db'), wal = await fixtur('wal.db-wal');
  wal[100] ^= 0xff;
  assert.equal(laggPaWal(db, wal), db);
});

async function ankiSamling(dir) {
  const db = new SQL.Database();
  db.run(`create table decks (id integer primary key, name text); create table notes (id integer primary key);
    create table cards (id integer primary key, nid integer, did integer, odid integer);
    create table revlog (id integer primary key, cid integer, ease integer, time integer, type integer);`);
  db.run("insert into decks values (1, '日本語\x1fMining'), (2, 'Kanji')");
  const nid = ms('2026-11-02T09:00:00+01:00');
  db.run('insert into notes values (?), (?)', [nid, nid + 1]);
  db.run('insert into cards values (10, ?, 1, 0), (11, ?, 2, 0)', [nid, nid + 1]);
  db.run('insert into revlog values (?, 10, 3, 60000, 0), (?, 11, 1, 30000, 1)', [ms('2026-11-02T10:00:00+01:00'), ms('2026-11-03T02:00:00+01:00')]);
  await mkdir(join(dir, 'User 1'), { recursive: true });
  await writeFile(join(dir, 'User 1', 'collection.anki2'), db.export());
}

test('Anki: finds the profile under Anki2 and counts reviews and mined notes', async () => {
  const dir = join(tmp, 'Anki2');
  await ankiSamling(dir);
  const r = await lasAnki(nodeMapp(dir), { rollover: 4, mining: 'Mining', wal: true, profil: '' }, SQL);
  assert.equal(r.profil, 'User 1');
  assert.deepEqual(r.anki, { '2026-11-02': { r: 2, m: 1.5, n: 1, ok: 0, t: 1, d: { Mining: 1, Kanji: 1 } } });
  assert.deepEqual(r.minade, { '2026-11-02': 1 });
});

test('Anki: without a chosen profile, the most recently used one is read', async () => {
  const dir = join(tmp, 'Anki2-flera');
  await ankiSamling(dir);
  await mkdir(join(dir, 'Annan'), { recursive: true });
  await writeFile(join(dir, 'Annan', 'collection.anki2'), new SQL.Database().export());
  const gammal = new Date('2026-01-01');
  await utimes(join(dir, 'Annan', 'collection.anki2'), gammal, gammal);
  const r = await lasAnki(nodeMapp(dir), { rollover: 4, mining: 'Mining', profil: '' }, SQL);
  assert.equal(r.profil, 'User 1');
  assert.deepEqual(r.profiler, ['Annan', 'User 1']);
});

test('Anki: a folder without a collection gives a clear error', async () => {
  await mkdir(join(tmp, 'tom'), { recursive: true });
  await assert.rejects(lasAnki(nodeMapp(join(tmp, 'tom')), { rollover: 4, mining: 'Mining' }, SQL), Kallfel);
});

test('AnkiConnect: only existing deck names are asked for', async () => {
  const fragor = [];
  const svar = { deckNames: ['日本語', '日本語::Mining'], deckNamesAndIds: { '日本語': 1, '日本語::Mining': 2 }, findNotes: [ms('2026-11-02T09:00:00+01:00')] };
  const hamta = async (_, init) => {
    const { action, params } = JSON.parse(init.body);
    fragor.push(action === 'cardReviews' ? params.deck : action);
    const kort = [[ms('2026-11-02T10:00:00+01:00'), 10, 0, 3, 1, 0, 2500, 6000, 0]];
    const result = action === 'cardReviews' ? (params.deck === '日本語::Mining' ? kort : []) : svar[action];
    return { status: 200, json: async () => ({ result, error: null }) };
  };
  const r = await lasAnkiConnect({ url: 'http://127.0.0.1:8765', rollover: 4, mining: 'Mining' }, hamta);
  assert.deepEqual(fragor, ['deckNames', 'deckNamesAndIds', '日本語', '日本語::Mining', 'findNotes']);
  assert.deepEqual(r.anki['2026-11-02'], { r: 1, m: 0.1, n: 1, ok: 0, t: 0, d: { Mining: 1 } });
  assert.deepEqual(r.minade, { '2026-11-02': 1 });
});

test('GSM database', async () => {
  const dir = join(tmp, 'GameSentenceMiner');
  await mkdir(dir, { recursive: true });
  const db = new SQL.Database();
  db.run(`create table games (id integer, title_original text);
    create table game_daily_rollup (date text, game_id integer, total_characters integer, total_reading_time_seconds real);
    create table game_lines (game_id integer, timestamp real, line_text text);`);
  db.run("insert into games values (1, '翠の海'); insert into game_daily_rollup values ('2026-11-01', 1, 3000, 1800)");
  const t = ms('2026-11-02T20:00:00+01:00') / 1000;
  db.run('insert into game_lines values (1, ?, ?), (1, ?, ?)', [t, 'あいう', t + 10, 'えお']);
  await writeFile(join(dir, 'gsm.db'), db.export());
  const r = await lasGsm(nodeMapp(dir), { bort: [], maxFart: 20000, paus: 180 }, SQL);
  assert.deepEqual(r.akt, [['2026-11-01', 'spel', '翠の海', 3000, 30, 'GSM'], ['2026-11-02', 'spel', '翠の海', 5, 10 / 60, 'GSM']]);
});

test('Google Drive folder with ttu, yatsu and Hoshi', async () => {
  const dir = join(tmp, 'Drive');
  await mkdir(join(dir, 'ttu-reader-data', 'Book'), { recursive: true });
  await mkdir(join(dir, 'yatsu-reader-data', 'Book'), { recursive: true });
  await mkdir(join(dir, 'Hoshi Reader', 'state'), { recursive: true });
  await writeFile(join(dir, 'ttu-reader-data', 'Book', 'statistics_1.json'), JSON.stringify([{ dateKey: '2026-11-02', title: 'Book', charactersRead: 100, readingTime: 120 }]));
  await writeFile(join(dir, 'yatsu-reader-data', 'Book', 'statistics_1.json'), '﻿' + JSON.stringify([{ dateKey: '2026-11-02', title: 'Book', charactersRead: 200, readingTime: 240 }]));
  const hoshi = { metadata: { value: { title: 'カラフル' } }, sessions: { a: { value: { startedAt: ms('2026-11-02T08:00:00+01:00'), readingTime: 60, charactersRead: 50 } } } };
  await writeFile(join(dir, 'Hoshi Reader', 'state', 'カラフル.b64'), Buffer.from(JSON.stringify(hoshi)).toString('base64'));
  await writeFile(join(dir, 'Hoshi Reader', 'state', '.shelves.json'), '{}');
  await mkdir(join(dir, 'mokuro-reader'), { recursive: true });
  const t = ms('2026-11-02T20:00:00+01:00');
  await writeFile(join(dir, 'mokuro-reader', 'volume-data.json'), JSON.stringify({ a: { volume_title: 'マンガ', chars: 300, timeReadInMinutes: 2, recentPageTurns: [[t, 1, 0], [t + 60e3, 2, 300]] } }));
  const r = await lasLasare(nodeMapp(dir), { ttu: true, yatsu: true, hoshi: true, mokuro: true, paus: 180, maxFart: 20000 });
  assert.deepEqual(r.akt.map(a => [...a.slice(0, 4), a[5]]), [['2026-11-02', 'bok', 'Book', 100, 'ttu'], ['2026-11-02', 'bok', 'Book', 200, 'yatsu'], ['2026-11-02', 'bok', 'カラフル', 50, 'Hoshi'], ['2026-11-02', 'manga', 'マンガ', 300, 'Mokuro']]);
  const baraTtu = await lasLasare(nodeMapp(dir), { ttu: true, yatsu: false, hoshi: false });
  assert.equal(baraTtu.akt.length, 1);
  await assert.rejects(lasLasare(nodeMapp(join(tmp, 'Anki2')), { ttu: true, yatsu: true, hoshi: true }), Kallfel);
});

test('immersion-mpv reads only stats.jsonl', async () => {
  const dir = join(tmp, 'immersion-mpv');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'stats.jsonl'), JSON.stringify({ date: '2026-11-02', file: 'a.mkv', title: 'A', seconds: 120, chars: 10 }) + '\n');
  await writeFile(join(dir, 'secrets.json'), 'not json, never read');
  const r = await lasMpv(nodeMapp(dir));
  assert.deepEqual(r.akt, [['2026-11-02', 'titta', 'A', 10, 2, 'mpv']]);
});

test('sleep CSV from garmin.py', async () => {
  const { lasSomn } = await import('../js/sources.js');
  const csv = [String.fromCharCode(0xfeff) + 'datum,somnade,vaknade,timmar,djup_min,poang', '2026-11-01,23:26,06:50,7.02,97,79', '2026-11-02,,,,,', '2026-11-03,00:10,07:00,6.5,80,', ''].join(String.fromCharCode(13, 10));
  const r = await lasSomn({ text: async () => csv });
  assert.deepEqual(r.somn, { '2026-11-01': { h: 7.02, p: 79, in: '23:26', ut: '06:50' }, '2026-11-03': { h: 6.5, p: null, in: '00:10', ut: '07:00' } });
  await assert.rejects(lasSomn({ text: async () => 'a,b' }), Kallfel);
});
