const fs = require('fs');
const dir = 'C:\\AVImark\\';
const fd = fs.openSync(dir + 'FOLLOW.V2$', 'r');
const buf = Buffer.alloc(142 * 5);
fs.readSync(fd, buf, 0, 142 * 5, 0);
fs.closeSync(fd);

for (let r = 0; r < 3; r++) {
  const off = r * 142;
  const b = buf.subarray(off, off + 142);
  
  // String scan
  let strings = [];
  let run = '', start = 0;
  for (let i = 0; i < 142; i++) {
    const c = b[i];
    if (c >= 32 && c <= 126) { if (!run.length) start = i; run += String.fromCharCode(c); }
    else { if (run.length >= 2) strings.push('@' + start + ':"' + run + '"'); run = ''; }
  }
  if (run.length >= 2) strings.push('@' + start + ':"' + run + '"');
  console.log('Rec ' + r + ' strings: ' + strings.join(' '));
  
  // Hex
  const hex = [];
  for (let i = 0; i < 142; i++) {
    if (i % 16 === 0) hex.push('\n  ' + i.toString(16).padStart(4, '0') + ': ');
    hex.push(b[i].toString(16).padStart(2, '0'));
  }
  console.log('Hex:' + hex.join(' '));
}
