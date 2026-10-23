import {writeFile} from 'node:fs/promises';
const api=String(process.env.VITE_API_BASE||'').trim();
if(api){const u=new URL(api);if(u.protocol!=='https:')throw Error('VITE_API_BASE requiere HTTPS.');await writeFile('public/config.js','window.APP_CONFIG = '+JSON.stringify({apiBase:u.origin})+';\n');}
