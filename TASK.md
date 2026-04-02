# Task: Parse ALL Avimark V2$ files into Supabase

## Goal
Reverse-engineer every V2$ binary file in C:\AVImark that has data (>0 bytes) and create parsers + Supabase tables for them.

## Already Done (8 tables)
These parsers exist in src/parsers/ and tables exist in Supabase:
- clients (CLIENT.V2$, 512 bytes/rec, 13,967 rows)
- animals (ANIMAL.V2$, 392 bytes/rec, 26,687 rows)
- users (USER.V2$, 6110 bytes/rec, 190 rows)
- treatments (TREAT.V2$, 1024 bytes/rec, 722 rows)
- prices (PRICE.V2$, 108 bytes/rec, 2,370 rows)
- audit_log (AUDIT.V2$, variable-length, 38,998 rows)
- services (SERVICE.V2$, 256 bytes/rec, 622,881 rows)
- items (ITEM.V2$, 549 bytes/rec, 4,998 rows)

## What to Do

### Phase 1: Discover record sizes
For each V2$ file with data >0 bytes that we haven't parsed yet:
1. Get file size
2. Try common record sizes (32, 48, 64, 80, 96, 108, 112, 128, 160, 192, 224, 256, 320, 384, 512, 1024, 2048, 4096, 6110) 
3. Find which one divides evenly
4. For variable-length files (like LOG*.V2$, MEMO files), note them separately — they need pattern-based parsing

### Phase 2: Decode fields for each fixed-record file
For each file:
1. Read a sample of records (first 5, middle 5, last 5)
2. Look for:
   - Pascal-style strings (length byte + ASCII text)
   - Delphi TDateTime doubles (value 35000-47000 → dates 1995-2028)
   - Delphi currency (int64/10000)
   - Foreign keys (int32 values in ranges matching other tables)
   - Flags/enums (small int values 0-10)
3. Create a parser subclass in src/parsers/
4. Name fields descriptively based on the table name and content

### Phase 3: Create Supabase tables
For each new parser, create the corresponding Supabase table via SQL. Use:
- `record_num` as primary key (integer, the record index)
- Appropriate column types (text, numeric, integer, timestamp, boolean)
- Create tables via the Supabase REST API or generate SQL migration files in migrations/

### Phase 4: Register in ETL
Add each new parser to:
- src/parsers/index.js (export)
- src/etl.js TABLES config

### Priority Order (by data value)
1. **VISIT.V2$** (11 MB, 256 bytes/rec, 46K records) — visits with dates at @21 (TDateTime double) and doctor initials at @45
2. **ACCOUNT.V2$** (129 MB) — financial accounts
3. **APPOINT.V2$** (45 MB) — appointments  
4. **MEDICAL.V2$** (13 MB) — medical records
5. **PRESCRIP.V2$** (22 MB) — prescriptions
6. **VACCINE.V2$** (5 MB) — vaccine records
7. **FOLLOW.V2$** (3.5 MB) — follow-ups
8. **DIAGNOSE.V2$** (0.5 MB) — diagnoses
9. **PROBLEM.V2$** (0.13 MB) — problem list
10. **VENDOR.V2$** (0.14 MB) — vendors
11. **PROC.V2$** (100 MB) — procedures
12. **USAGE.V2$** (11 MB) — inventory usage
13. **QUOTE.V2$** / **QUOTAIL.V2$** — estimates
14. **REQ.V2$** / **REQENTRY.V2$** — lab requisitions
15. **ANALYTE.V2$** (89 MB) — lab results
16. **VARIANCE.V2$** (25 MB) — price variances
17. All remaining non-zero, non-LOG, non-MEMO files
18. MEMO files (SERVMEMO, MDCLMEMO, ANMLMEMO, etc.) — variable length, lower priority
19. LOG files — variable length transaction logs, lowest priority

## Architecture Notes

### Existing patterns (follow these):
- Base class: `V2Parser` in src/parsers/base.js
- Subclass per table, override `parseRecord(buf, index)`
- Return object with `record_num: index` + decoded fields
- Use `this.extractString(buf, offset, length)` for ASCII fields
- Use `this.extractCurrency(buf, offset)` for Delphi currency (int64/10000)
- Use `this.extractDouble(buf, offset)` for doubles
- For Pascal strings: read length byte at offset, then string at offset+1
- For Delphi TDateTime: `readDoubleLE(offset)`, value is days since 1899-12-30
- Supabase upsert uses `record_num` as conflict key
- Batch size 500 for upserts

### Supabase connection
- URL and service key in .env file (already configured)
- Use src/supabase.js helpers

### Known quirks
- AVImark server locks files but Windows allows shared reads
- Some files have "deleted" records (all zeros or first byte = 0xFF) — skip those
- Date fields: Delphi TDateTime double, convert to ISO date string for Supabase
- Currency: int64/10000, store as numeric in Supabase  
- Many tables have @28 as a flags/type field
- @4 is often a foreign key (animal_id, client_id, etc.)

### Creating Supabase tables
Generate SQL in migrations/ folder. To execute, either:
- Use the Supabase JS client: `supabase.rpc('exec_sql', { sql: '...' })` 
- Or write a migrate.js script that reads migration files and executes them
- Table names should be lowercase, snake_case versions of the V2$ filename
- Include `record_num INTEGER PRIMARY KEY` on every table
- Add `created_at TIMESTAMPTZ DEFAULT now()` for tracking

### For variable-length files (MEMO, LOG)
- These don't have fixed record sizes
- MEMO files typically store text blobs linked to other records
- LOG files are transaction logs with mixed record types
- Skip these for now unless you can identify a clear pattern
- If a file isn't evenly divisible by any reasonable record size, mark it as variable-length and skip

## Output
- New parser files in src/parsers/
- Updated src/parsers/index.js
- Updated src/etl.js  
- SQL migrations in migrations/
- A migrate.js script to create tables
- Test by running: `node src/etl.js --dry-run --table <name>` for each new table

## Do NOT:
- Modify existing parsers (they work)
- Delete any existing files
- Change .env or Supabase credentials
- Push to any remote (no git push)
