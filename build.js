const fs = require('fs');
const url = process.env.EMBED_URL || 'https://ritesh0997-hamster09.hf.space';

const content = `
/embed/ani/* /embed/player 200
/embed/url/* /embed/player 200
`.trim();

fs.writeFileSync('public/_redirects', content);
console.log('Successfully generated public/_redirects');
