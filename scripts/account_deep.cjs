const fs = require('fs');
const dir = 'C:\\AVImark\\';
const stat = fs.statSync(dir + 'ACCOUNT.V2$');
const total = Math.floor(stat.size / 256);
const midStart = Math.floor(total / 2) * 256;
const fd = fs.openSync(dir + 'ACCOUNT.V2$', 'r');
const buf = Buffer.alloc(256 * 10);
fs.readSync(fd, buf, 0, 256 * 10, midStart);
fs.closeSync(fd);

for (let r = 0; r < 5; r++) {
  const off = r * 256;
  const b = buf.subarray(off, off + 256);
  const descLen = Math.min(b[57] || 0, 50);
  let desc = '';
  if (descLen > 0) {
    for (let i = 0; i < descLen; i++) {
      const c = b[58 + i];
      if (c >= 32 && c <= 126) desc += String.fromCharCode(c);
    }
  }
  // Check for non-zero int32 values
  const fields = [];
  for (let i = 90; i < 250; i += 4) {
    const v = b.readInt32LE(i);
    if (v !== 0 && Math.abs(v) < 10000000) fields.push('@' + i + '=' + v);
  }
  // Also check currency at key spots
  const c118 = b.readInt32LE(118);
  console.log('Rec ' + (Math.floor(total/2)+r) + ': @49=' + String.fromCharCode(b[49]) + ' desc=' + JSON.stringify(desc.trim()) + ' @118=' + c118 + ' fields: ' + fields.join(' '));
}

// Also check first few non-"Balance" records (skip the first 20 which are balance entries)
console.log('\n--- Records 200-210 ---');
const fd2 = fs.openSync(dir + 'ACCOUNT.V2$', 'r');
const buf2 = Buffer.alloc(256 * 20);
fs.readSync(fd2, buf2, 0, 256 * 20, 200 * 256);
fs.closeSync(fd2);

for (let r = 0; r < 15; r++) {
  const off = r * 256;
  const b = buf2.subarray(off, off + 256);
  if (b[0] === 0xFF) { console.log('Rec ' + (200+r) + ': DELETED'); continue; }
  const descLen = Math.min(b[57] || 0, 50);
  let desc = '';
  if (descLen > 0) {
    for (let i = 0; i < descLen; i++) {
      const c = b[58 + i];
      if (c >= 32 && c <= 126) desc += String.fromCharCode(c);
    }
  }
  const fields = [];
  for (let i = 90; i < 180; i += 2) {
    const v = b.readInt16LE(i);
    if (v !== 0 && Math.abs(v) < 30000) fields.push('@' + i + '=' + v);
  }
  console.log('Rec ' + (200+r) + ': @28=' + b.readUInt16LE(28) + ' @49=' + String.fromCharCode(b[49]) + ' desc=' + JSON.stringify(desc.trim()) + ' fields: ' + fields.join(' '));
}
