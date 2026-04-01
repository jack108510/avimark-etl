# Avimark ETL — V2$ Parser to Supabase

## Goal
Build a Node.js ETL that reads Avimark Classic V2$ binary flat files and syncs them to a Supabase PostgreSQL database (read-only extraction for now).

## Avimark Data Location
All data files are in `C:\AVImark\`

## V2$ File Format
Proprietary fixed-record binary flat files. Each file has fixed-size records containing ASCII text fields with null-byte padding. Files are locked by the running AVImark server process, so they MUST be opened with `FileShare.ReadWrite` equivalent (i.e., `fs.open` with appropriate flags, or use `fs.createReadStream` which handles sharing).

## Known Record Structures

### CLIENT.V2$ (512 bytes/record, ~14,073 records)
- Offset 40, len 20: Last name
- Offset 62, len 35: Address
- Offset 132, len 20: City
- Offset 153, len 3: Province
- Offset 156, len 10: Postal code
- Offset 170, len 13: Phone (format: 780.779-7350)
- Offset 183, len 20: First name
- Note: first ~40 bytes are binary header (record pointers/flags)

### ANIMAL.V2$ (392 bytes/record, ~26,916 records)
- Offset 41, len 20: Name
- Offset 106, len 9: Breed (partial, may need adjustment)
- Offset 115, len 12: Species (contains "Feline" or "Canine" etc.)
- Offset 148, len 8: Weight
- Offset 166, len 12: Color
- Note: Species field contains text like "Feline", "Canine" with null padding

### USER.V2$ (6110 bytes/record, ~191 records)
- Offset 41, len 1: Type flag (D=Doctor, A=Admin/Other)
- Offset 43, len 5: Code (e.g., "CC", "AC", "NB")
- Offset 48, len 25: First name
- Offset 103, len 10: Some additional field
- Offset ~130: DVM number (4 digits when present)
- Offset ~155: Title prefix (e.g., "DR. CC")
- Offset ~220: Last name / title (e.g., "CATARIG, DVM")
- Note: Record structure is complex — lots of padding

### TREAT.V2$ (1024 bytes/record, ~724 records)
Treatment/service catalog.
- Offset 41, len 8: Treatment code (e.g., "100", "ANEX", "FLU")
- After the code pattern `\d{2,6}\.{2,5}[AD]\.\.`: service name follows
- Name is ~50 chars after the code marker

### PRICE.V2$ (108 bytes/record, ~12,674 records)
- Offset 43, len 8: Treatment/item code
- Offset 58, len 8: Price as Delphi currency (int64 / 10000)
- Note: Multiple price records can exist per code

### AUDIT.V2$ (~170 bytes/record, ~19,891 records with AUD01 type)
Contains audit trail entries. Key format:
- AUD01: Price/treatment changes — contains text like "Item/Treatment: REEX, 09-28-13, Old: 42.00, New: 0.00"
- AUD02: Service line entries — "Amount:27.00,Code:1013,Rabies 1 Year"
- AUD03: Date entries
- Record contains workstation name, user code, date, and the audit text
- Date range: Sept 2013 to March 2026

### Other files of interest (parse later):
- ITEM.V2$ (549 bytes/record, ~5,008 records) — Product/medication catalog
- SERVICE.V2$ (256 bytes/record, ~625K records) — Individual service line items (invoiced services)
- APPOINT.V2$ — Appointments
- HOSPITAL.V2$ — Practice settings
- TABLE.V2$ — Lookup tables (breeds, species, colors, etc.)

## Critical File Access Notes
- Files are locked by AVImarkServer.exe — open with shared read access
- On Windows/Node.js use: `fs.openSync(path, 'r')` — Node already opens with FILE_SHARE_READ by default
- If that fails, try copying the file first then reading the copy
- All text is ASCII with null-byte padding

## Tech Stack
- Node.js (available on server: v24.14.0)
- @supabase/supabase-js for database writes
- No other dependencies needed — use built-in `fs` and `Buffer` for binary parsing

## Supabase Schema (suggested)
Tables to create:
- `clients` — id, first_name, last_name, address, city, province, postal_code, phone, raw_record_num
- `animals` — id, name, species, breed, color, weight, raw_record_num
- `users` — id, code, first_name, last_name, type, dvm_number, raw_record_num
- `treatments` — id, code, name, category, raw_record_num
- `prices` — id, treatment_code, price, raw_record_num
- `audit_log` — id, audit_type, workstation, date_text, description, old_value, new_value, item_code
- `sync_status` — table_name, last_sync, record_count, status

## Phase 1 (Build Now)
1. Binary parser module for each V2$ file type
2. Supabase client connection
3. ETL script that reads → parses → upserts
4. Basic CLI: `node etl.js --table clients` or `node etl.js --all`

## Phase 2 (Later)
- Scheduled sync via Windows Task Scheduler
- Incremental sync (detect changed records)
- REST API wrapper
- Dashboard
