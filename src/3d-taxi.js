const MODEL_URI = new URL('../assets/taxi-3d-4.glb', import.meta.url).href;
const MODEL_ID = 'taxi-3d-model';
const SOURCE_ID = 'taxi-3d-data';
const LAYER_ID = 'taxi-3d';
const STATIONARY_LAYER_ID = 'taxi-3d-stationary';
const TAXI_LAYER_ID = 'taxis';
const MIN_ZOOM = 12;
const MIN_PITCH = 10;
const MAX_TAXIS = 3000;
const MAX_ROAD_DISTANCE = 50;
const CELL_SIZE = 100;

let map;
let taxiCoordinates = [];
let layerAdded = false;
let modelAdded = false;
let stationaryKeys = new Set();
let needsRetry = false;
const bearingCache = new Map();

function stableBearing([lng, lat]) {
  const x = Math.sin(lng * 12.9898 + lat * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 360;
}

function zoomTier(zoom) {
  if (zoom >= 17) return 3;
  if (zoom >= 15) return 2;
  if (zoom >= 13) return 1;
  return 0;
}

function cellKey(cx, cy) {
  return cx + ',' + cy;
}

function getRoadGrid(refLng, refLat, kx, ky) {
  const features = map.querySourceFeatures('composite', {
    sourceLayer: 'road',
    filter: [
      'any',
      ['==', ['geometry-type'], 'LineString'],
      ['==', ['geometry-type'], 'MultiLineString'],
    ],
    validate: false,
  });

  const grid = new Map();
  const addLine = (coords) => {
    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i];
      const b = coords[i + 1];
      const x1 = (a[0] - refLng) * kx;
      const y1 = (a[1] - refLat) * ky;
      const x2 = (b[0] - refLng) * kx;
      const y2 = (b[1] - refLat) * ky;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len2 = dx * dx + dy * dy;
      if (len2 < 1) continue;
      const segment = {
        x1,
        y1,
        dx,
        dy,
        len2,
        bearing: (Math.atan2(dx, dy) * 180) / Math.PI,
      };
      const keys = new Set();
      const addCell = (x, y) => {
        keys.add(
          cellKey(
            Math.floor(x / CELL_SIZE),
            Math.floor(y / CELL_SIZE),
          ),
        );
      };
      addCell(x1, y1);
      addCell(x2, y2);
      addCell(x1 + dx / 2, y1 + dy / 2);
      for (const key of keys) {
        let list = grid.get(key);
        if (!list) grid.set(key, (list = []));
        list.push(segment);
      }
    }
  };

  for (const feature of features) {
    const { type, coordinates } = feature.geometry;
    if (type === 'LineString') {
      addLine(coordinates);
    } else if (type === 'MultiLineString') {
      coordinates.forEach(addLine);
    }
  }
  return grid;
}

function nearestBearing(grid, x, y) {
  const cx = Math.floor(x / CELL_SIZE);
  const cy = Math.floor(y / CELL_SIZE);
  const maxDist2 = MAX_ROAD_DISTANCE * MAX_ROAD_DISTANCE;
  let bestDist2 = Infinity;
  let bearing;

  for (let ring = 0; ring <= 1; ring++) {
    for (let ix = cx - ring; ix <= cx + ring; ix++) {
      for (let iy = cy - ring; iy <= cy + ring; iy++) {
        if (ring === 1 && Math.abs(ix - cx) !== 1 && Math.abs(iy - cy) !== 1) {
          continue;
        }
        const list = grid.get(cellKey(ix, iy));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const s = list[i];
          let t = ((x - s.x1) * s.dx + (y - s.y1) * s.dy) / s.len2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = x - (s.x1 + t * s.dx);
          const ey = y - (s.y1 + t * s.dy);
          const d2 = ex * ex + ey * ey;
          if (d2 < bestDist2) {
            bestDist2 = d2;
            bearing = s.bearing;
          }
        }
      }
    }
    if (bestDist2 <= maxDist2) break;
  }

  return bestDist2 <= maxDist2 ? bearing : null;
}

function update() {
  if (!map || !layerAdded) return;

  const is3D = map.getZoom() >= MIN_ZOOM && map.getPitch() >= MIN_PITCH;

  if (map.getLayer(LAYER_ID)) {
    map.setLayoutProperty(LAYER_ID, 'visibility', is3D ? 'visible' : 'none');
  }
  if (map.getLayer(STATIONARY_LAYER_ID)) {
    map.setLayoutProperty(
      STATIONARY_LAYER_ID,
      'visibility',
      is3D ? 'visible' : 'none',
    );
  }
  if (map.getLayer(TAXI_LAYER_ID)) {
    map.setLayoutProperty(
      TAXI_LAYER_ID,
      'visibility',
      is3D ? 'none' : 'visible',
    );
  }

  if (!is3D) return;

  needsRetry = false;
  const center = map.getCenter();
  const refLng = center.lng;
  const refLat = center.lat;
  const kx = Math.cos((refLat * Math.PI) / 180) * 111320;
  const ky = 110540;
  const bounds = map.getBounds();
  const candidates = [];

  for (let i = 0; i < taxiCoordinates.length; i++) {
    const c = taxiCoordinates[i];
    const x = (c[0] - refLng) * kx;
    const y = (c[1] - refLat) * ky;
    candidates.push({
      c,
      x,
      y,
      key: c[0] + ',' + c[1],
      inView: bounds.contains(c),
    });
    if (candidates.length >= MAX_TAXIS) break;
  }

  const tier = zoomTier(map.getZoom());
  let needsRoads = false;
  for (let i = 0; i < candidates.length; i++) {
    const p = candidates[i];
    const cached = bearingCache.get(p.key);
    if (p.inView && (!cached || cached.tier < tier)) {
      needsRoads = true;
      break;
    }
  }

  const grid = needsRoads ? getRoadGrid(refLng, refLat, kx, ky) : null;
  const features = new Array(candidates.length);

  for (let i = 0; i < candidates.length; i++) {
    const p = candidates[i];
    const cached = bearingCache.get(p.key);
    let bearing;
    if (cached && cached.tier >= tier) {
      bearing = cached.bearing;
    } else if (p.inView) {
      bearing = nearestBearing(grid, p.x, p.y);
      if (bearing == null) {
        bearing = stableBearing(p.c);
        bearingCache.delete(p.key);
        needsRetry = true;
      } else {
        bearingCache.set(p.key, { bearing, tier });
      }
    } else if (cached) {
      bearing = cached.bearing;
    } else {
      bearing = stableBearing(p.c);
    }
    features[i] = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: p.c },
      properties: {
        rotation: [0, 0, bearing + 180],
        stationary: stationaryKeys.has(p.key),
      },
    };
  }

  if (bearingCache.size > 10000) bearingCache.clear();

  const source = map.getSource(SOURCE_ID);
  if (source) {
    source.setData({ type: 'FeatureCollection', features });
  }
}

export function render(m) {
  map = m;

  if (!modelAdded) {
    modelAdded = true;
    try {
      map.addModel(MODEL_ID, MODEL_URI);
    } catch (e) {
      // Model already registered by the style.
    }
  }

  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }

  if (!map.getLayer(LAYER_ID)) {
    const layout = {
      visibility: 'none',
      'model-id': MODEL_ID,
      'model-allow-density-reduction': false,
    };
    const paint = {
      'model-ambient-occlusion-intensity': 0,
      'model-receive-shadows': false,
      'model-cast-shadows': false,
      'model-rotation': ['get', 'rotation'],
      'model-scale': [
        'interpolate',
        ['linear'],
        ['zoom'],
        12,
        ['literal', [47.7, 47.7, 47.7]],
        13,
        ['literal', [28.6, 28.6, 28.6]],
        14,
        ['literal', [17.2, 17.2, 17.2]],
        15,
        ['literal', [10.3, 10.3, 10.3]],
        16,
        ['literal', [6.25, 6.25, 6.25]],
        17,
        ['literal', [4, 4, 4]],
        18,
        ['literal', [2.75, 2.75, 2.75]],
        19,
        ['literal', [1.9, 1.9, 1.9]],
      ],
    };

    map.addLayer(
      {
        id: LAYER_ID,
        type: 'model',
        source: SOURCE_ID,
        minzoom: MIN_ZOOM,
        filter: ['==', ['get', 'stationary'], false],
        layout,
        paint,
      },
      'building-extrusion',
    );
    map.addLayer(
      {
        id: STATIONARY_LAYER_ID,
        type: 'model',
        source: SOURCE_ID,
        minzoom: MIN_ZOOM,
        filter: ['==', ['get', 'stationary'], true],
        layout,
        paint: {
          ...paint,
          'model-color': '#ff3b30',
          'model-color-mix-intensity': 0.8,
        },
      },
      'building-extrusion',
    );
  }

  layerAdded = true;
  map.on('moveend', update);
  map.on('sourcedata', (e) => {
    if (!needsRetry) return;
    if (e.sourceId === 'composite' && e.isSourceLoaded) update();
  });
  update();
}

export function setData(m, taxisOnMap, stationary = []) {
  map = m;
  taxiCoordinates = taxisOnMap.features[0].geometry.coordinates;
  stationaryKeys = new Set(stationary.map((c) => c[0] + ',' + c[1]));
  update();
}
