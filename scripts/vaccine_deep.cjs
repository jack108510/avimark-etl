const fs = require('fs');
const dir = 'C:\\AVImark\\';
const fd = fs.openSync(dir + 'VACCINE.V2$', 'r');
const buf = Buffer.alloc(152 * 20);
fs.readSync(fd, buf, 0, 152 * 20, 0);
fs.closeSync(fd);

const epoch = new Date(1899, 11, 30).getTime();

for (let r = 0; r < 5; r++) {
  const off = r * 152;
  const b = buf.subarray(off, off + 152);
  
  const d = b.readDoubleLE(21);
  let date = null;
  if (d > 30000 && d < 55000) {
    const ms = epoch + d * 86400000;
    date = new Date(ms).toISOString().substring(0, 10);
  }
  
  // String scan
  let strings = [];
  let run = '', start = 0;
  for (let i = 0; i < 152; i++) {
    const c = b[i];
    if (c >= 32 && c <= 126) { if (!run.length) start = i; run += String.fromCharCode(c); }
    else { if (run.length >= 2) strings.push('@' + start + ':"' + run + '"'); run = ''; }
  }
  if (run.length >= 2) strings.push('@' + start + ':"' + run + '"');
  
  console.log('Rec ' + r + ': date=' + date + ' strings: ' + strings.join(' '));
  
  // Hex of first 100 bytes
  const hex = [];
  for (let i = 0; i < Math.min(152, 100); i++) {
    if (i % 16 === 0) hex.push('\n  ' + i.toString(16).padStart(4, '0') + ': ');
    hex.push(b[i].toString(16).padStart(2, '0'));
  }
  console.log('Hex:' + hex.join(' '));
}
