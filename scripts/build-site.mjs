import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const sha256 = content => createHash('sha256').update(content).digest('hex');

async function canonicalPath(directory) {
  try { return await realpath(directory); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return path.join(await canonicalPath(path.dirname(directory)), path.basename(directory));
  }
}

async function listFiles(directory, prefix, jsonOnly = false) {
  if ((await lstat(path.join(directory, prefix))).isSymbolicLink()) {
    throw new Error(`No se permiten enlaces simbólicos en ${prefix}.`);
  }
  const files = [];
  for (const entry of await readdir(path.join(directory, prefix), { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
    const name = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await listFiles(directory, name, jsonOnly));
    else if (entry.isFile() && (!jsonOnly || entry.name.endsWith('.json'))) files.push(name);
  }
  return files;
}

export async function buildSite({ sourceDir = projectRoot, outputDir = path.join(projectRoot, '_site') } = {}) {
  sourceDir = await realpath(path.resolve(sourceDir));
  outputDir = await canonicalPath(path.resolve(outputDir));
  const sourceFromOutput = path.relative(outputDir, sourceDir);
  const outputFromSource = path.relative(sourceDir, outputDir);
  if ((!sourceFromOutput.startsWith(`..${path.sep}`) && sourceFromOutput !== '..') ||
      (!outputFromSource.startsWith(`..${path.sep}`) && outputFromSource !== '..' && outputFromSource !== '_site')) {
    throw new Error('La carpeta de salida no puede sobrescribir las fuentes del sitio.');
  }
  const names = ['index.html', 'manifest.webmanifest',
    ...await listFiles(sourceDir, 'assets'),
    ...await listFiles(sourceDir, 'pricing', true),
    ...await listFiles(sourceDir, 'data', true)].sort();
  const files = await Promise.all(names.map(async name => {
    if (!(await lstat(path.join(sourceDir, name))).isFile()) throw new Error(`No se permiten enlaces simbólicos en ${name}.`);
    const content = await readFile(path.join(sourceDir, name));
    if (name.endsWith('.json') || name === 'manifest.webmanifest') {
      try { JSON.parse(content.toString('utf8')); }
      catch (error) { throw new Error(`JSON inválido: ${name}`, { cause: error }); }
    }
    return { name, content };
  }));
  const worker = await readFile(path.join(sourceDir, 'scripts/service-worker.js'), 'utf8');
  const marker = 'const OFFLINE_CONFIG = null;';
  if (worker.split(marker).length !== 2) throw new Error('La plantilla del worker debe tener un marcador de configuración.');
  const assets = files.map(({ name, content }) => ({ url: name.split('/').map(encodeURIComponent).join('/'), sha256: sha256(content) }));
  const version = sha256(JSON.stringify(assets) + worker);
  await mkdir(outputDir, { recursive: true });
  const generatedWorker = worker.replace(marker, `const OFFLINE_CONFIG = ${JSON.stringify({ version, assets })};`);
  for (const { name, content } of [...files, { name: 'sw.js', content: generatedWorker }]) {
    const destination = path.join(outputDir, name);
    let directory = outputDir;
    for (const part of path.dirname(name).split(path.sep).filter(part => part !== '.')) {
      directory = path.join(directory, part);
      const stat = await lstat(directory).catch(error => { if (error.code !== 'ENOENT') throw error; });
      if (stat?.isSymbolicLink()) throw new Error('La salida contiene un enlace simbólico.');
      await mkdir(directory, { recursive: true });
    }
    const stat = await lstat(destination).catch(error => { if (error.code !== 'ENOENT') throw error; });
    if (stat?.isSymbolicLink()) throw new Error('La salida contiene un enlace simbólico.');
    await writeFile(destination, content);
  }
  return { version, assets };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const built = await buildSite({ outputDir: process.argv[2] || path.join(projectRoot, '_site') });
  console.log(`Sitio generado: ${built.assets.length} recursos, versión ${built.version.slice(0, 12)}.`);
}
