'use strict';

// Test helper: load an ES-module browser file into a jsdom window by
// stripping import/export syntax and binding exports to window. Keeps the
// frontend tests script-compatible without needing a module loader.

const fs = require('fs');
const path = require('path');

const PUBLIC_JS = path.join(__dirname, '..', '..', 'src', 'public', 'js');

function transformModule(src) {
  const exportedNames = [];
  let out = src;

  // `import Foo from '...'` -> `const Foo = window.Foo;`
  out = out.replace(
    /^import\s+(\w+)\s+from\s+['"][^'"]+['"];?\s*$/gm,
    'const $1 = window.$1;',
  );

  // `import { A, B } from '...'` -> `const { A, B } = window;`
  out = out.replace(
    /^import\s+\{\s*([^}]+)\s*\}\s+from\s+['"][^'"]+['"];?\s*$/gm,
    'const { $1 } = window;',
  );

  // `export const X = ...` -> `const X = ...;` and remember X
  out = out.replace(/^export\s+const\s+(\w+)\s*=/gm, (_, name) => {
    exportedNames.push(name);
    return `const ${name} =`;
  });

  // `export class X` -> `class X` and remember X
  out = out.replace(/^export\s+class\s+(\w+)/gm, (_, name) => {
    exportedNames.push(name);
    return `class ${name}`;
  });

  // `export default X;` -> drop the line and remember X
  out = out.replace(/^export\s+default\s+(\w+);?\s*$/gm, (_, name) => {
    exportedNames.push(name);
    return '';
  });

  const assignments = exportedNames.map((n) => `window.${n} = ${n};`).join('\n');
  return out + '\n' + assignments;
}

function loadModule(domInstance, relPath) {
  const abs = path.isAbsolute(relPath) ? relPath : path.join(PUBLIC_JS, relPath);
  const src = fs.readFileSync(abs, 'utf8');
  domInstance.window.eval(transformModule(src));
}

module.exports = { loadModule, transformModule, PUBLIC_JS };
