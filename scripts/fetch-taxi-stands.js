const fs = require('fs');

function round(num, precision = 6) {
  const multiplier = Math.pow(10, precision || 0);
  return Math.round(num * multiplier) / multiplier;
}

const geojson = JSON.parse(
  fs.readFileSync('data/lta-taxi-stop-geojson.geojson'),
);
const data = geojson.features.map((f) =>
  f.geometry.coordinates.slice(0, 2).map((n) => round(n)),
);

const dataFilePath = 'data/taxi-stands.json';
fs.writeFile(dataFilePath, JSON.stringify(data), (e) => {
  if (e) throw e;
  console.log(dataFilePath + ' generated.');
});
