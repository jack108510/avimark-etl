import { open } from 'lmdb';

try {
  console.log('Opening LMDB...');
  const db = open({ 
    path: 'db_copy', 
    readOnly: true,
    mapSize: 2 * 1024 * 1024 * 1024
  });
  console.log('Opened!');
  console.log('Stat:', JSON.stringify(db.env.stat()));
  db.close();
} catch(e) {
  console.error('Error:', e.message);
  
  // Maybe it's not LMDB. Let me check the actual file header more carefully.
  import('fs').then(fs => {
    const fd = fs.openSync('db_copy/AVImark.db$', 'r');
    const buf = Buffer.alloc(256);
    fs.readSync(fd, buf, 0, 256, 0);
    fs.closeSync(fd);
    
    // Check for LMDB magic: page header starts with page number (0), then flags
    console.log('Byte 16-19 (potential magic):', buf.readUInt32LE(16).toString(16));
    
    // Actually check page 0 structure for Firebird
    // Firebird ODS header at page 0: first 4 bytes = page type (1 = header)
    const pageType = buf.readUInt32LE(0);
    console.log('Page type (offset 0):', pageType);
    console.log('Potential page size at offset 36:', buf.readUInt32LE(36));
    console.log('Byte 10-11:', buf.readUInt16LE(10));
    
    // Show hex of first 64 again
    const hex = Array.from(buf.subarray(0, 64)).map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log('Raw hex:', hex);
  });
}
