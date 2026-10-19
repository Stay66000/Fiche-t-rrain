import { cp, mkdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';
await rm('docs', { recursive: true, force: true });
await mkdir('docs', { recursive: true });
await cp('public', 'docs', { recursive: true });
await build({ entryPoints: ['src/account.js'], bundle: true, format: 'esm', target: ['es2022'], outfile: 'docs/account.js', minify: true, legalComments: 'eof' });
console.log('Site statique généré dans docs/.');
