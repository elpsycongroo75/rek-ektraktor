// Script to convert Node.js parsers to browser-compatible versions
const fs = require('fs');
const path = require('path');

const srcDir = 'C:/Users/elpsy/Downloads/pdf-extractor/parsers';
const destDir = 'C:/Users/elpsy/Downloads/rekbank-vercel/js/parsers';

// Convert base-parser
let base = fs.readFileSync(path.join(srcDir, 'base-parser.js'), 'utf8');
base = base.replace(/^const .+ = require.+$/gm, '');
base = base.replace(/module\.exports\s*=\s*\w+;?\s*$/m, '');
fs.writeFileSync(path.join(destDir, 'base-parser.js'), base.trim() + '\n');
console.log('✓ base-parser.js');

// Convert each parser
const parsers = ['bca-parser', 'bni-parser', 'bsi-parser', 'danamon-parser', 'mandiri-parser', 'bankjakarta-parser'];
const classNames = {
    'bca-parser': 'BCAParser',
    'bni-parser': 'BNIParser', 
    'bsi-parser': 'BSIParser',
    'danamon-parser': 'DanamonParser',
    'mandiri-parser': 'MandiriParser',
    'bankjakarta-parser': 'BankJakartaParser'
};
const keys = {
    'bca-parser': 'bca',
    'bni-parser': 'bni',
    'bsi-parser': 'bsi',
    'danamon-parser': 'danamon',
    'mandiri-parser': 'mandiri',
    'bankjakarta-parser': 'bankjakarta'
};

for (const p of parsers) {
    let code = fs.readFileSync(path.join(srcDir, p + '.js'), 'utf8');
    code = code.replace(/^const .+ = require.+$/gm, '');
    code = code.replace(/module\.exports\s*=\s*\w+;?\s*$/m, '');
    // Remove fs debug calls
    code = code.replace(/.*require\(['"]fs['"]\)\.writeFileSync.*/g, '');
    fs.writeFileSync(path.join(destDir, p + '.js'), code.trim() + '\n');
    console.log('✓ ' + p + '.js');
}

// Create index.js that registers all parsers
const lines = ['// Parser registry - loaded after all parser scripts'];
lines.push('window.Parsers = {');
for (const p of parsers) {
    const comma = p === parsers[parsers.length - 1] ? '' : ',';
    lines.push(`    ${keys[p]}: new ${classNames[p]}()${comma}`);
}
lines.push('};');
fs.writeFileSync(path.join(destDir, 'index.js'), lines.join('\n') + '\n');
console.log('✓ index.js');
console.log('Done!');
