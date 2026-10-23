import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let esbuild;try{esbuild=require('esbuild')}catch{esbuild=createRequire(require.resolve('vite'))('esbuild')}
const {build}=esbuild;
await build({entryPoints:['portable/worker.ts'],outfile:'worker/dist/worker.js',bundle:true,format:'esm',platform:'neutral',target:'es2022',external:['cloudflare:workers','node:async_hooks'],conditions:['workerd','worker','browser'],logLevel:'info'});
