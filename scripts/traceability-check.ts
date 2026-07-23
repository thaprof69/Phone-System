import { readFile } from 'node:fs/promises';

const matrix = await readFile(
  'docs/architecture/Quantum_Parks_ElevenLabs_Architecture_Pack_v2.0/matrices/requirements-architecture-traceability.csv',
  'utf8',
);

const missing: string[] = [];
for (let number = 1; number <= 82; number += 1) {
  const id = `FR-${String(number).padStart(2, '0')}`;
  if (!matrix.includes(id)) missing.push(id);
}
for (let number = 1; number <= 18; number += 1) {
  const id = `NFR-${String(number).padStart(2, '0')}`;
  if (!matrix.includes(id)) missing.push(id);
}

if (missing.length > 0) {
  console.error(`Traceability matrix is missing: ${missing.join(', ')}`);
  process.exit(1);
}

console.log('Traceability contains FR-01–FR-82 and NFR-01–NFR-18.');
