import { readFileSync } from 'node:fs';

const jsonrepairLicense = readFileSync(new URL('./src/vendor/jsonrepair/LICENSE.md', import.meta.url), 'utf8');

export default {
  build: {
    lib: { entry: 'src/runtime.js', formats: ['es'], fileName: () => 'runtime.js' },
    outDir: 'dist',
    emptyOutDir: true,
    codeSplitting: false,
    modulePreload: false,
    rolldownOptions: { output: { banner: `/*! jsonrepair 3.15.0 — https://github.com/josdejong/jsonrepair\n${jsonrepairLicense}\n*/` } },
  },
};
