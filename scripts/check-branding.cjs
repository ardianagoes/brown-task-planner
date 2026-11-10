const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const compatibilityKeys = ['deadline-desk.tasks.v1', 'deadline-desk.migration-owner.v1', 'deadline-desk.migration-key.v1'];
const files = [];
function walk(directory) {
  for (const item of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const name = path.join(directory, item.name);
    if (item.isDirectory()) walk(name); else if (/\.(tsx?|svg)$/.test(item.name)) files.push(name);
  }
}
['app', 'components', 'lib'].forEach(walk);
files.push('README.md', 'docs/EMAIL_AUTH_SETUP.md', 'docs/DEVELOPMENT.md', '.env.example', 'package.json');
const failures = [];
for (const file of files) {
  let text = fs.readFileSync(path.join(root, file), 'utf8');
  for (const key of compatibilityKeys) text = text.replaceAll(key, 'PRESERVED_STORAGE_IDENTIFIER');
  // Operator guides must name the verified former-domain redirect to explain
  // canonical-origin drift; it is not a current product/deployment link.
  if (file.startsWith('docs/')) text = text.replaceAll('https://brown-task-planner.vercel.app', 'VERIFIED_LEGACY_REDIRECT');
  if (/deadline[\s-]*desk|brown-task-planner|deadline-tracker/i.test(text)) failures.push(file);
}
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8').replace(/```[\s\S]*?```/g, '');
const words = readme.trim().split(/\s+/).length;
if (words < 200 || words > 300) failures.push('README word count: ' + words);
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
if (pkg.name !== 'due-drop' || lock.name !== pkg.name || lock.packages[''].name !== pkg.name) failures.push('Package names do not match due-drop');
if (failures.length) { console.error('Branding review failed:\n' + failures.join('\n')); process.exitCode = 1; }
else console.log(`Branding checks passed in ${files.length} current files; README ${words} words excluding commands. Historical records and storage identifiers preserved.`);
