const fs = require('fs');
const path = require('path');
const arr = JSON.parse(fs.readFileSync(path.join(__dirname, 'state', 'partner-detail-bodies.json'), 'utf8'));
console.log('keys:', arr.map((x) => x.key).join('\n  '));
const v = arr.find((x) => /virtual_seller/.test(x.key));
if (!v) {
  console.log('未找到 virtual_seller 项');
  process.exit(1);
}
console.log('targets:', JSON.stringify(v.body.dynamicTargets));
console.log('filters:', JSON.stringify(v.body.frontFilterList).slice(0, 1200));
console.log('sorts:', JSON.stringify(v.body.sorts));
console.log('page:', JSON.stringify(v.body.page));
console.log('compFrontFilterList:', JSON.stringify(v.body.compFrontFilterList ?? []).slice(0, 400));
