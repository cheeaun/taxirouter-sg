const fs = require('fs');

const DATASET_ID = 'd_fa1896e73ded89dd513788d501d45033';
const POLL_DOWNLOAD_URL = `https://api-open.data.gov.sg/v1/public/api/datasets/${DATASET_ID}/poll-download`;
const OUTPUT_PATH = 'data/taxi-stands.json';

function round(num, precision = 6) {
  const multiplier = Math.pow(10, precision || 0);
  return Math.round(num * multiplier) / multiplier;
}

async function main() {
  const response = await fetch(POLL_DOWNLOAD_URL);
  if (!response.ok) {
    throw new Error(
      `Download request failed: ${response.status} ${response.statusText}`,
    );
  }
  const result = await response.json();
  if (result.code !== 0) {
    throw new Error(result.errMsg || 'Failed to get download URL');
  }

  const download = await fetch(result.data.url);
  if (!download.ok) {
    throw new Error(
      `Dataset download failed: ${download.status} ${download.statusText}`,
    );
  }
  const geojson = await download.json();

  const coordinates = geojson.features
    .filter((feature) => feature.geometry && feature.geometry.coordinates)
    .map((feature) =>
      feature.geometry.coordinates.slice(0, 2).map((n) => round(n)),
    );

  const unique = [
    ...new Map(coordinates.map((c) => [c.join(','), c])).values(),
  ];

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(unique));
  console.log(`${OUTPUT_PATH} generated with ${unique.length} taxi stands.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
