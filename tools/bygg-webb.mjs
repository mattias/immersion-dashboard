// Copies the web app into dist/ for the Windows app. GitHub Pages serves the repository root directly.
import { cp, rm, mkdir } from 'node:fs/promises';
const FILER = ['index.html', 'manifest.webmanifest', 'sw.js', 'config.js', 'css', 'js', 'vendor', 'icons'];
await rm('dist', { recursive: true, force: true });
await mkdir('dist');
for (const f of FILER) await cp(f, 'dist/' + f, { recursive: true });
console.log('dist/ ready');
