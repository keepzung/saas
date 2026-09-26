const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'state', 'partner-shell-js');
const files = fs.readdirSync(dir).filter((f) => f.startsWith('js_'));
const routes = new Set();
for (const f of files) {
  const t = fs.readFileSync(path.join(dir, f), 'utf8');
  const re = /["'](\/partner\/[a-zA-Z0-9\-_/]+)["']/g;
  let m;
  while ((m = re.exec(t))) routes.add(m[1]);
}
const list = [...routes].sort();
console.log('total:', list.length);
for (const r of list) {
  if (/report|note|effect|data|ad|sub/i.test(r)) console.log('★', r);
}
