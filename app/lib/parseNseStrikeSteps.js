// Parse NSE CSV and generate symbol -> strike step mapping
// Run: node app/lib/parseNseStrikeSteps.js

const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, '../data/NSE_FO_SosScheme.csv');
const outputPath = path.join(__dirname, 'nseStrikeSteps.js');

const lines = fs.readFileSync(csvPath, 'utf-8').split('\n');

// Skip first line (date) and header
const dataLines = lines.slice(2).filter(l => l.trim());

const strikeSteps = {};

for (const line of dataLines) {
  const cols = line.split(',');
  if (cols.length < 4) continue;

  const symbol = cols[0].trim();
  const monthType = cols[1].trim();
  const symbolType = cols[2].trim();
  const stepValue = parseInt(cols[3].trim(), 10);

  // Only take M1 (current month) and EQUITY, first occurrence per symbol
  if (monthType === 'M1' && symbolType === 'EQUITY' && !strikeSteps[symbol]) {
    strikeSteps[symbol] = stepValue;
  }
}

// Generate JS module
const output = `// Auto-generated from NSE_FO_SosScheme.csv
// Symbol -> strike step mapping for current month (M1)
export const nseStrikeSteps = ${JSON.stringify(strikeSteps, null, 2)};
`;

fs.writeFileSync(outputPath, output, 'utf-8');
console.log(`✅ Generated ${outputPath} with ${Object.keys(strikeSteps).length} symbols`);
