const fs = require('fs');
const mimeDb = require('mime-db');

fs.writeFileSync('mime-db.json', JSON.stringify(mimeDb));
