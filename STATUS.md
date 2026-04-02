# Avimark ETL — Status Report

## Completed: 17 Tables Populated (~2.1M rows)

| Table | Source File | Records | Rec Size | Status |
|-------|------------|---------|----------|--------|
| clients | CLIENT.V2$ | 13,967 | 512 | ✅ |
| animals | ANIMAL.V2$ | 26,687 | 392 | ✅ |
| users | USER.V2$ | 190 | 6110 | ✅ |
| treatments | TREAT.V2$ | 722 | 1024 | ✅ |
| prices | PRICE.V2$ | 2,370 | 108 | ✅ |
| audit_log | AUDIT.V2$ | 38,998 | variable | ✅ |
| services | SERVICE.V2$ | 622,881 | 256 | ✅ |
| items | ITEM.V2$ | 4,998 | 549 | ✅ |
| visits | VISIT.V2$ | 46,182 | 256 | ✅ NEW |
| accounts | ACCOUNT.V2$ | 526,721 | 256 | ✅ NEW |
| procedures | PROC.V2$ | 407,606 | 256 | ✅ NEW |
| variances | VARIANCE.V2$ | 238,808 | 108 | ✅ NEW |
| whiteboard | WBOARD.V2$ | 160,457 | 256 | ✅ NEW |
| categories | CATEGORY.V2$ | 27 | 184 | ✅ NEW |
| lookup_tables | TABLE.V2$ | 49 | 128 | ✅ NEW |
| resources | RESOURCE.V2$ | 131 | 160 | ✅ NEW |
| estimates | ESTIMATE.V2$ | 122 | 128 | ✅ NEW |

## Pending: 12 Tables (parsers ready, need Supabase tables created)

Run `migrations/002_missing_tables.sql` in the Supabase SQL editor, then `node src/etl.js --all`.

| Table | Source File | Est. Records | Rec Size | Parser |
|-------|------------|-------------|----------|--------|
| vendors | VENDOR.V2$ | 391 | 377 | ✅ vendors.js |
| problems | PROBLEM.V2$ | 799 | 167 | ✅ problems.js |
| appointments | APPOINT.V2$ | 106,123 | 449 | ✅ appointments.js |
| medical | MEDICAL.V2$ | 52,717 | 256 | ✅ medical.js |
| prescriptions | PRESCRIP.V2$ | 75,071 | 310 | ✅ prescriptions.js |
| vaccines | VACCINE.V2$ | 32,121 | 152 | ✅ vaccines.js |
| followups | FOLLOW.V2$ | 25,695 | 142 | ✅ followups.js |
| diagnoses | DIAGNOSE.V2$ | 6,137 | 85 | ✅ diagnoses.js |
| usage_records | USAGE.V2$ | 176,501 | 63 | ✅ usage.js |
| quotes | QUOTE.V2$ | 16,561 | 140 | ✅ quotes.js |
| quote_details | QUOTAIL.V2$ | 124,419 | 255 | ✅ quote_details.js |
| prob_history | PROBHIST.V2$ | 19,472 | 48 | ✅ probhist.js |

## Skipped (variable-length or low priority)

These V2$ files don't have fixed record sizes or are LOG/MEMO files:

- **MEMO files**: SERVMEMO, MDCLMEMO, ANMLMEMO, FLWUMEMO, LSTSMEMO, GLOSMEMO — variable length text blobs
- **LOG files**: LOG001-LOG151 + WP variants — transaction logs, variable length
- **MEDABNRM.V2$** (200MB) — variable length, abnormal results
- **WP.V2$** (102MB) — variable length, word processing
- **ANALYTE.V2$** (93MB) — variable length, lab results
- **CLIENTX.V2$** (4MB) — variable, client extensions
- **SERVICEX.V2$** (36MB) — service extensions (200 bytes/rec, 182K records — could be parsed later)
- **ATTACH.V2$** — variable, file attachments
- **REQENTRY.V2$** / **REQ.V2$** — variable, lab requisitions
- Other small reference tables: OPTION, TASK, PO, SPLIT, QA, GRANT, etc.

## Record Size Discovery

Key record sizes verified by TDateTime date scanning:

| File | Size | Verified | Method |
|------|------|----------|--------|
| VISIT.V2$ | 256 | ✅ | Date spacing 256 |
| ACCOUNT.V2$ | 256 | ✅ | Date spacing 256 |
| MEDICAL.V2$ | 256 | ✅ | Date spacing 256 |
| PROC.V2$ | 256 | ✅ | Date spacing 256 |
| WBOARD.V2$ | 256 | ✅ | Date spacing 256 |
| VACCINE.V2$ | 152 | ✅ | Date spacing 152 (NOT 72) |
| FOLLOW.V2$ | 142 | ✅ | Date spacing 142 (NOT 90) |
| VARIANCE.V2$ | 108 | ✅ | Date spacing 108 (NOT 96) |
| CATEGORY.V2$ | 184 | ✅ | Date spacing 184 (NOT 72) |
| TABLE.V2$ | 128 | ✅ | Date spacing 128 (NOT 56) |
| APPOINT.V2$ | 449 | ✅ | Only factor that divides file size |
| PRESCRIP.V2$ | 310 | ✅ | Divides evenly |
| VENDOR.V2$ | 377 | ✅ | Divides evenly, strings visible |
| PROBLEM.V2$ | 167 | ✅ | Divides evenly, strings visible |
| DIAGNOSE.V2$ | 85 | ✅ | Divides evenly |
| USAGE.V2$ | 63 | ✅ | Divides evenly |
| QUOTE.V2$ | 140 | ✅ | Divides evenly, strings visible |
| QUOTAIL.V2$ | 255 | ✅ | Divides evenly, strings visible |
| PROBHIST.V2$ | 48 | ✅ | Divides evenly |

## Common V2$ Binary Record Structure

All fixed-record V2$ files share a consistent header:

```
@0:      Status byte (0x00=active, 0xFF=deleted)
@1-20:   Hash/checksum (20 bytes, appears random)
@21-28:  TDateTime double (Delphi date: days since 1899-12-30)
@28+:    Flags/type fields (varies by table)
@40+:    Table-specific data (Pascal strings, int32 refs, etc.)
```

- **Pascal strings**: Length byte at offset, then ASCII chars
- **Delphi TDateTime**: IEEE 754 double, value 35000-47000 = years 1995-2028
- **Delphi Currency**: Int64/10000 (8 bytes)
- **Foreign keys**: Int32LE, values match record_num in other tables

## How to Run

```bash
# Dry run (parse only, no DB write)
node src/etl.js --dry-run --all

# Sync one table
node src/etl.js --table visits

# Sync all tables
node src/etl.js --all

# Check status
node scripts/status.js
```
