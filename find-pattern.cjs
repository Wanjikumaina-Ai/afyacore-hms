const fs = require('fs');

const filePath = './build/server/assets/index-B1LgkJuP.js';
const content = fs.readFileSync(filePath, 'utf8');

const patterns = ['__dirname', 'app/api', 'findRouteFiles', 'APP_ROOT'];

for (const p of patterns) {
  const idx = content.indexOf(p);
  if (idx !== -1) {
    console.log('\n=== Found: ' + p + ' ===');
    console.log(content.substring(Math.max(0, idx - 150), idx + 200));
    console.log('===');
  } else {
    console.log('NOT FOUND: ' + p);
  }
}