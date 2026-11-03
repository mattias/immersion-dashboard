// Opens an SQLite file with sql.js. Changes still in the -wal file are copied into the database first,
// so reviews from an Anki session that is still open are included.

const u32 = (b, i, le) => new DataView(b.buffer, b.byteOffset + i, 4).getUint32(0, le);

function summa(b, i, n, s1, s2, le) {
  const v = new DataView(b.buffer, b.byteOffset + i, n);
  for (let j = 0; j < n; j += 8) {
    s1 = (s1 + v.getUint32(j, le) + s2) >>> 0;
    s2 = (s2 + v.getUint32(j + 4, le) + s1) >>> 0;
  }
  return [s1, s2];
}

// Returns the database with every committed WAL frame applied.
export function laggPaWal(db, wal) {
  if (!wal || wal.length < 32) return db;
  const magi = u32(wal, 0, false);
  if (magi !== 0x377f0682 && magi !== 0x377f0683) return db;
  const le = magi === 0x377f0682, sida = u32(wal, 8, false), salt1 = u32(wal, 16, false), salt2 = u32(wal, 20, false);
  let [s1, s2] = summa(wal, 0, 24, 0, 0, le);
  if (s1 !== u32(wal, 24, false) || s2 !== u32(wal, 28, false)) return db;
  const sidor = new Map(), vantar = new Map();
  let storlek = 0;
  for (let i = 32; i + 24 + sida <= wal.length; i += 24 + sida) {
    if (u32(wal, i + 8, false) !== salt1 || u32(wal, i + 12, false) !== salt2) break;
    [s1, s2] = summa(wal, i, 8, s1, s2, le);
    [s1, s2] = summa(wal, i + 24, sida, s1, s2, le);
    if (s1 !== u32(wal, i + 16, false) || s2 !== u32(wal, i + 20, false)) break;
    vantar.set(u32(wal, i, false), i + 24);
    const efter = u32(wal, i + 4, false);
    // Only frames up to the last commit are valid.
    if (efter) {
      for (const [p, o] of vantar) sidor.set(p, o);
      vantar.clear();
      storlek = efter;
    }
  }
  if (!storlek) return db;
  const ut = new Uint8Array(storlek * sida);
  ut.set(db.subarray(0, Math.min(db.length, ut.length)));
  for (const [p, o] of sidor) if (p <= storlek) ut.set(wal.subarray(o, o + sida), (p - 1) * sida);
  return ut;
}

export function oppna(SQL, db, wal) {
  const b = laggPaWal(db, wal);
  // Marks the copy as a rollback-journal database, otherwise SQLite looks for a -wal file that is not there.
  if (b.length > 19 && b[18] === 2) { b[18] = 1; b[19] = 1; }
  return new SQL.Database(b);
}

export function rader(db, sql, param) {
  const st = db.prepare(sql), ut = [];
  if (param) st.bind(param);
  while (st.step()) ut.push(st.get());
  st.free();
  return ut;
}
