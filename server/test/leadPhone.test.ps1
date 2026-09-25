# Run from the repository root: powershell -File server/test/leadPhone.test.ps1
# Tests run against an isolated in-memory SQLite database, never the CRM database.
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class PhoneTestSqlite {
  [DllImport("winsqlite3", CallingConvention=CallingConvention.Cdecl)]
  public static extern int sqlite3_open([MarshalAs(UnmanagedType.LPStr)] string name, out IntPtr db);
  [DllImport("winsqlite3", CallingConvention=CallingConvention.Cdecl)]
  public static extern int sqlite3_exec(IntPtr db, [MarshalAs(UnmanagedType.LPStr)] string sql, IntPtr callback, IntPtr data, out IntPtr error);
  [DllImport("winsqlite3", CallingConvention=CallingConvention.Cdecl)]
  public static extern void sqlite3_free(IntPtr value);
  [DllImport("winsqlite3", CallingConvention=CallingConvention.Cdecl)]
  public static extern int sqlite3_close(IntPtr db);
}
'@
$testDb = [IntPtr]::Zero
if ([PhoneTestSqlite]::sqlite3_open(':memory:', [ref]$testDb) -ne 0) { throw 'Could not open test database' }
function Invoke-TestSql([string]$Sql, [switch]$Duplicate) {
  $sqliteError = [IntPtr]::Zero
  $result = [PhoneTestSqlite]::sqlite3_exec($testDb, $Sql, [IntPtr]::Zero, [IntPtr]::Zero, [ref]$sqliteError)
  $message = if ($sqliteError -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::PtrToStringAnsi($sqliteError) } else { '' }
  if ($sqliteError -ne [IntPtr]::Zero) { [PhoneTestSqlite]::sqlite3_free($sqliteError) }
  if ($Duplicate) {
    if ($result -eq 0 -or !$message.Contains('DUPLICATE_LEAD_PHONE')) { throw "Expected duplicate rejection; got: $result $message" }
  } elseif ($result -ne 0) { throw "SQL failed: $message`n$Sql" }
}
try {
  $schema = node --input-type=module -e "import {leadPhoneSchema} from './server/src/utils/leadPhone.js'; console.log(JSON.stringify(leadPhoneSchema));"
  if ($LASTEXITCODE -ne 0) { throw 'Could not load schema' }
  $statements = $schema | ConvertFrom-Json
  Invoke-TestSql "CREATE TABLE leads(id INTEGER PRIMARY KEY,phone TEXT,phone_key TEXT,note TEXT); CREATE TABLE assertions(value INTEGER CHECK(value=1)); INSERT INTO leads(phone) VALUES('9876543210'),('+91 98765-43210');"
  foreach ($statement in $statements) { Invoke-TestSql $statement }
  Invoke-TestSql "INSERT INTO assertions SELECT COUNT(*)=2 FROM leads WHERE phone_key='9876543210';"
  foreach ($phone in @('9876543210', '+91 (98765) 43210', '09876543210', '0091-9876543210')) {
    Invoke-TestSql "INSERT INTO leads(phone) VALUES('$phone');" -Duplicate
  }
  Invoke-TestSql "INSERT INTO leads(id,phone) VALUES(3,'9123456789'); UPDATE leads SET phone='+91 91234 56789' WHERE id=3; INSERT INTO assertions SELECT phone_key='9123456789' FROM leads WHERE id=3;"
  Invoke-TestSql "UPDATE leads SET phone='09876543210' WHERE id=3;" -Duplicate
  # Legacy duplicates can still edit unrelated details and reformat their own number.
  Invoke-TestSql "UPDATE leads SET note='Edited',phone='(98765) 43210' WHERE id=1;"
  Invoke-TestSql "INSERT INTO leads(phone) VALUES(NULL),(''),('   ');"
  Invoke-TestSql "INSERT INTO leads(phone) VALUES('9000000001'),('+91 9000000001');" -Duplicate
  Invoke-TestSql "INSERT INTO assertions SELECT COUNT(*)=0 FROM leads WHERE phone_key='9000000001';"
  Invoke-TestSql "UPDATE leads SET phone='9000000002' WHERE id=3; INSERT INTO leads(phone) VALUES('9123456789');"
  Invoke-TestSql "INSERT INTO leads(phone) VALUES('+1 (202) 555-0123');"
  Invoke-TestSql "INSERT INTO leads(phone) VALUES('0012025550123');" -Duplicate
  foreach ($statement in $statements) { Invoke-TestSql $statement }
  Invoke-TestSql "INSERT INTO leads(phone) VALUES('+91 9876543210');" -Duplicate
  Write-Output 'PASS: legacy migration, number formats, create/update, self-edit, blank phones, atomic duplicate rejection, phone changes, international numbers, repeated migration'
} finally {
  [void][PhoneTestSqlite]::sqlite3_close($testDb)
}
