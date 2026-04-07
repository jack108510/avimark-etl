/**
 * vetlogic_explore.js
 * Connect to VETLOGIC.FDB and find inventory/cost tables
 */

import Firebird from 'node-firebird';

// Use Avimark's own Firebird 2.5 client
process.env.FIREBIRD_LIB_PATH = 'C:\\AVImark\\fbclient.dll';

const options = {
  host: '127.0.0.1',
  port: 3050,
  database: 'C:\\AVImark\\VetLogicClient\\VETLOGIC.FDB',
  user: 'SYSDBA',
  password: 'masterkey',
  lowercase_keys: false,
  role: null,
  pageSize: 4096,
};

console.log('Connecting to VETLOGIC.FDB...');

Firebird.attach(options, (err, db) => {
  if (err) {
    console.error('Connection error:', err.message);
    // Try without host (embedded)
    const opts2 = { ...options, host: undefined };
    Firebird.attach(opts2, (err2, db2) => {
      if (err2) { console.error('Embedded error:', err2.message); process.exit(1); }
      explore(db2);
    });
    return;
  }
  explore(db);
});

function explore(db) {
  console.log('Connected!');

  // List all tables
  db.query(
    `SELECT RDB$RELATION_NAME FROM RDB$RELATIONS 
     WHERE RDB$SYSTEM_FLAG = 0 
     ORDER BY RDB$RELATION_NAME`,
    (err, rows) => {
      if (err) { console.error('Tables error:', err.message); db.detach(); return; }
      
      const tables = rows.map(r => r.RDB$RELATION_NAME.trim());
      console.log(`\nTables found (${tables.length}):`);
      tables.forEach(t => console.log('  ' + t));

      // Look for cost/inventory/purchase related tables
      const interesting = tables.filter(t => 
        /ITEM|COST|PRICE|INVENT|PURCHAS|ORDER|RECEIV|VENDOR|PRODUCT|STOCK/i.test(t)
      );
      
      if (interesting.length === 0) {
        console.log('\nNo obvious cost/inventory tables. Checking all table columns...');
        checkAllTables(db, tables);
      } else {
        console.log(`\nInteresting tables: ${interesting.join(', ')}`);
        sampleTables(db, interesting, () => db.detach());
      }
    }
  );
}

function sampleTables(db, tables, done) {
  if (tables.length === 0) { done(); return; }
  const table = tables[0];
  const rest = tables.slice(1);
  
  db.query(`SELECT FIRST 3 * FROM "${table}"`, (err, rows) => {
    if (err) {
      console.log(`\n${table}: ERROR - ${err.message}`);
    } else {
      console.log(`\n${table} (${rows.length} sample rows):`);
      if (rows.length > 0) {
        console.log('  Columns:', Object.keys(rows[0]).join(', '));
        rows.forEach((r, i) => console.log(`  Row ${i}:`, JSON.stringify(r).substring(0, 200)));
      }
    }
    sampleTables(db, rest, done);
  });
}

function checkAllTables(db, tables) {
  // Query columns for tables that might have cost data
  db.query(
    `SELECT RDB$RELATION_NAME, RDB$FIELD_NAME 
     FROM RDB$RELATION_FIELDS 
     WHERE RDB$SYSTEM_FLAG = 0
     AND (RDB$FIELD_NAME CONTAINING 'COST' OR RDB$FIELD_NAME CONTAINING 'PRICE' 
          OR RDB$FIELD_NAME CONTAINING 'ITEM' OR RDB$FIELD_NAME CONTAINING 'ORDER')
     ORDER BY RDB$RELATION_NAME, RDB$FIELD_NAME`,
    (err, rows) => {
      if (err) { console.error(err.message); db.detach(); return; }
      console.log(`\nColumns with COST/PRICE/ITEM/ORDER (${rows.length}):`);
      rows.forEach(r => {
        console.log(`  ${r.RDB$RELATION_NAME?.trim()}.${r.RDB$FIELD_NAME?.trim()}`);
      });
      db.detach();
    }
  );
}
