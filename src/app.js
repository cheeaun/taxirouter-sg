// https://github.com/parcel-bundler/parcel/issues/3375#issuecomment-599160200
import 'regenerator-runtime/runtime';

const mapboxgl = require('mapbox-gl');

const taxiStandsOnMap = require('url:../data/taxi-stands.json');

const helpers = require('@turf/helpers');
const pointsWithinPolygon = require('@turf/points-within-polygon').default;
const nearestPoint = require('@turf/nearest-point').default;
const circle = require('@turf/circle').default;
const multiPoint = helpers.multiPoint;
const point = helpers.point;
const points = helpers.points;
const featureCollection = helpers.featureCollection;

const TEST_MODE = location.hash == '#testmode';

const sgPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [103.569831, 1.198452],
      [103.719863, 1.145934],
      [104.134597, 1.276368],
      [104.078979, 1.358057],
      [104.094429, 1.39135],
      [104.083442, 1.426015],
      [104.041557, 1.446265],
      [103.971519, 1.422926],
      [103.936843, 1.430477],
      [103.896675, 1.426358],
      [103.868179, 1.455531],
      [103.811531, 1.47887],
      [103.759689, 1.446951],
      [103.725357, 1.45965],
      [103.675231, 1.43082],
      [103.659439, 1.406795],
      [103.61721, 1.323391],
      [103.569831, 1.198452],
    ],
  ],
};

function $(id) {
  return document.getElementById(id);
}

// https://stackoverflow.com/a/2901298/20838
function numberWithCommas(x) {
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function round(num, precision = 6) {
  const multiplier = Math.pow(10, precision || 0);
  return Math.round(num * multiplier) / multiplier;
}

// https://stackoverflow.com/a/21829819/20838
// http://w3c.github.io/deviceorientation/spec-source-orientation.html#worked-example
const degtorad = Math.PI / 180; // Degree-to-Radian conversion
function compassHeading(alpha, beta, gamma) {
  const _x = beta ? beta * degtorad : 0; // beta value
  const _y = gamma ? gamma * degtorad : 0; // gamma value
  const _z = alpha ? alpha * degtorad : 0; // alpha value

  const cX = Math.cos(_x);
  const cY = Math.cos(_y);
  const cZ = Math.cos(_z);
  const sX = Math.sin(_x);
  const sY = Math.sin(_y);
  const sZ = Math.sin(_z);

  // Calculate Vx and Vy components
  const Vx = -cZ * sY - sZ * sX * cY;
  const Vy = -sZ * sY + cZ * sX * cY;

  // Calculate compass heading
  let compassHeading = Math.atan(Vx / Vy);

  // Convert compass heading to use whole unit circle
  if (Vy < 0) {
    compassHeading += Math.PI;
  } else if (Vx < 0) {
    compassHeading += 2 * Math.PI;
  }

  return compassHeading * (180 / Math.PI); // Compass Heading (in degrees)
}

const $infoTaxis = $('info-taxis');
const $location = $('location');
const walkingDistance = 80 * 2; // meters, via https://en.wikipedia.org/wiki/Walking_distance_measure
const emptyGeojson = {
  type: 'geojson',
  buffer: 16,
  tolerance: 1,
  data: { type: 'Feature' },
};
let taxisOnMap;
let walkingCircle;
let currentLocation;

const $about = $('about');
const $aboutOkay = $('about-okay');

const $header = $('heading');
const toggleAbout = function () {
  $about.classList.toggle('show');
};
$header.addEventListener('click', toggleAbout, false);
$aboutOkay.addEventListener('click', toggleAbout, false);
if (window.localStorage && !localStorage.getItem('taxirouter-sg:about')) {
  $about.classList.add('show');
  localStorage.setItem('taxirouter-sg:about', '1');
}

let firstFetch = true;
function fetchTaxis(fn) {
  fetch(
    'https://api.data.gov.sg/v1/transport/taxi-availability' +
      (firstFetch ? '' : '?' + +new Date()),
  )
    .then(function (res) {
      return res.json();
    })
    .then(fn);
  firstFetch = false;
}

mapboxgl.accessToken =
  'pk.eyJ1IjoiY2hlZWF1biIsImEiOiJjam95aHNtajAyYng2M3FrZm96Mjd4MDlzIn0.O0ulrgNkC_GiuqN8q-Mhog';
const maxBoundsLike = [
  [103.6017, 1.2334], // sw
  [104.0381, 1.4738], // ne
];
const maxBounds = mapboxgl.LngLatBounds.convert(maxBoundsLike);
const map = (window.$map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/cheeaun/ckda1ntp40s491iog8ebl4236?optimize=true',
  boxZoom: false,
  bounds: maxBoundsLike,
  minZoom: 8,
  renderWorldCopies: false,
}));
map.addControl(new mapboxgl.NavigationControl(), 'top-right');

class PitchControl {
  onAdd(map) {
    this._map = map;
    const container = document.createElement('div');
    container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
    container.innerHTML =
      '<button class="mapboxgl-ctrl-icon mapboxgl-ctrl-custom-pitch" type="button"><span>3D</span></button>';
    container.onclick = function () {
      const pitch = map.getPitch();
      map.easeTo({ pitch: pitch < 10 ? 60 : 0 });
    };
    map.on('pitchend', this.onPitch.bind(this));
    this._container = container;
    return this._container;
  }
  onPitch() {
    const pitch = map.getPitch();
    this._container.classList.toggle('active', !!pitch);
  }
  onRemove() {
    this._container.parentNode.removeChild(this._container);
    this._map.off('pitchend', this.onPitch.bind(this));
    this._map = undefined;
  }
}
map.addControl(new PitchControl(), 'top-right');

map.once('styledata', () => {
  const layers = map.getStyle().layers;
  // console.log(layers);

  layers.forEach((l) => {
    const isTrafficLayer = /^traffic/i.test(l.id);
    if (isTrafficLayer) {
      map.setLayerZoomRange(l.id, 15, 24);
      map.setLayoutProperty(l.id, 'visibility', 'visible', { validate: false });
      return;
    }

    // No need `tunnel`, already hidden from source
    const isRoadLayer = /^(road|bridge|tunnel)/i.test(l.id);
    if (isRoadLayer && l.minzoom < 10) {
      const newMinZoom =
        l.minzoom < 15 ? Math.max(Math.min(16, l.minzoom + 4), 11) : l.minzoom;
      map.setLayerZoomRange(l.id, newMinZoom, l.maxzoom);
    }

    if (
      (l.type === 'symbol' || l.type === 'line') &&
      l.layout?.visibility !== 'none'
    ) {
      const filter = map.getFilter(l.id);
      // within only works for Point or LineString
      let newFilter = ['within', sgPolygon];
      if (filter) {
        if (filter[0] === 'all') {
          newFilter = [...filter, newFilter];
        } else {
          newFilter = ['all', newFilter, filter];
        }
      }
      map.setFilter(l.id, newFilter, { validate: false });
    }
  });
});

map.once('load', function () {
  // const layers = map.getStyle().layers;
  // console.log(layers);
  // Find the index of the first symbol layer in the map style
  // const labelLayerId = layers.find(
  //   (l) => l.type === 'symbol' && l.layout['text-field'],
  // );

  map.addSource('taxis', emptyGeojson);
  map.addLayer({
    id: 'taxis',
    type: 'symbol',
    source: 'taxis',
    minzoom: 10,
    layout: {
      'icon-padding': 1,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.1, 18, 1],
      // 'icon-ignore-placement': true,
      'icon-allow-overlap': true,
      'icon-image': [
        'case',
        ['to-boolean', ['get', 'stationary']],
        'taxi-stationary',
        'taxi',
      ],
      'symbol-sort-key': ['case', ['to-boolean', ['get', 'stationary']], 1, 2],
    },
  });
  map.addLayer({
    id: 'taxis-heat',
    type: 'heatmap',
    source: 'taxis',
    maxzoom: 13,
    paint: {
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 0.5, 10, 2],
      'heatmap-color': [
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        0,
        'transparent',
        0.5,
        '#fdc100',
        1,
        'lightyellow',
      ],
    },
  });

  map.addSource('taxi-stands', {
    type: 'geojson',
    buffer: 0,
    data: multiPoint(taxiStandsOnMap),
  });
  map.addLayer({
    id: 'taxi-stands',
    type: 'symbol',
    source: 'taxi-stands',
    minzoom: 15,
    layout: {
      'icon-padding': 0,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.25, 18, 1],
      'icon-anchor': 'bottom',
      'icon-image': 'taxi-stand',
      'icon-allow-overlap': ['step', ['zoom'], false, 16, true],
    },
  });

  setTimeout(() => {
    map.addImage('taxi', $('img-taxi'));
    map.addImage('taxi-stationary', $('img-taxi-stationary'));
    map.addImage('taxi-stand', $('img-taxi-stand'));
  }, 300);

  let sticking = false;
  let watching = false;
  let compassing = false;
  let compassingTransition = false; // The transition duration when switching from watching to compassing
  let geoWatch;
  let unstickTimeout;

  const renderTaxisInfo = function () {
    $infoTaxis.className = 'loaded';
    if (currentLocation && sticking) {
      const taxiCountAround = pointsWithinPolygon(
        points(taxisOnMap.features[0].geometry.coordinates),
        walkingCircle,
      ).features.length;
      const nearestTaxiStand = nearestPoint(
        point(currentLocation),
        points(taxiStandsOnMap),
      );
      if (taxiCountAround) {
        $infoTaxis.innerHTML =
          '<b>' +
          numberWithCommas(taxiCountAround) +
          ' available taxis</b> around you.';
        if (nearestTaxiStand) {
          const minutes = Math.ceil(
            (nearestTaxiStand.properties.distanceToPoint * 1000) / 80,
          );
          $infoTaxis.innerHTML +=
            '<br>Nearest taxi stand is about <b>' +
            minutes +
            ' minute' +
            (minutes == 1 ? '' : 's') +
            '</b> walk&nbsp;away.';
        }
      }
    } else {
      const taxiCount = taxisOnMap.features[0].properties.taxi_count;
      $infoTaxis.innerHTML =
        '<b>' + numberWithCommas(taxiCount) + '</b> available taxis!';
    }
  };

  const renderTaxis = function () {
    requestAnimationFrame(function () {
      $infoTaxis.className = '';
      fetchTaxis(function (data) {
        if (taxisOnMap) {
          const taxisOnMapStr = taxisOnMap.features[0].geometry.coordinates.toString();
          const stationaryTaxis = [];
          const movingTaxis = [];
          const { coordinates } = data.features[0].geometry;
          for (let i = 0, l = coordinates.length; i < l; i++) {
            const c = coordinates[i];
            const isStationary = taxisOnMapStr.includes(c.toString());
            if (isStationary) {
              stationaryTaxis.push(c);
            } else {
              movingTaxis.push(c);
            }
          }
          const collection = featureCollection([
            multiPoint(stationaryTaxis, { stationary: true }),
            multiPoint(movingTaxis, { stationary: false }),
          ]);
          map.getSource('taxis').setData(collection);
        } else {
          map.getSource('taxis').setData(data);
        }
        taxisOnMap = data;
        renderTaxisInfo();
      });

      setTimeout(renderTaxis, 1000 * 60); // every minute
    });
  };
  renderTaxis();

  if (navigator.geolocation) {
    map.addSource('current-location', emptyGeojson);
    map.addLayer({
      id: 'current-location-accuracy-radius',
      type: 'fill',
      source: 'current-location',
      filter: ['==', ['get', 'type'], 'accuracy'],
      minzoom: 15,
      layout: {
        visibility: 'none',
      },
      paint: {
        'fill-color': 'rgba(66, 133, 244, .05)',
      },
    });

    map.addLayer(
      {
        id: 'current-location-walking-radius',
        type: 'line',
        source: 'current-location',
        filter: ['==', ['get', 'type'], 'walking'],
        minzoom: 14,
        layout: {
          visibility: 'none',
          'line-cap': 'round',
        },
        paint: {
          'line-width': 3,
          'line-dasharray': [1, 3],
          'line-color': 'rgba(66, 133, 244, .75)',
        },
      },
      'building-extrusion',
    );

    map.addLayer(
      {
        id: 'current-location-walking-radius-label',
        type: 'symbol',
        source: 'current-location',
        filter: ['==', ['get', 'type'], 'walking'],
        minzoom: 14,
        layout: {
          visibility: 'none',
          'symbol-placement': 'line',
          'symbol-spacing': Math.min(window.innerWidth, window.innerHeight),
          'text-field': '2-min walk',
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
          'text-size': 14,
          'text-letter-spacing': 0.1,
          'text-pitch-alignment': 'viewport',
          'text-anchor': 'bottom',
        },
        paint: {
          'text-color': '#8ab4f8',
          'text-halo-color': 'rgba(0,0,0,.5)',
          'text-halo-width': 2,
        },
      },
      'building-extrusion',
    );

    map.addLayer({
      id: 'current-location-marker',
      type: 'circle',
      source: 'current-location',
      filter: ['==', ['get', 'type'], 'marker'],
      layout: {
        visibility: 'none',
      },
      paint: {
        'circle-radius': 6,
        'circle-color': '#4285f4',
        'circle-stroke-width': 3,
        'circle-stroke-color': '#fff',
        'circle-pitch-alignment': 'map',
      },
    });

    map.addLayer(
      {
        id: 'current-location-viewport',
        type: 'symbol',
        source: 'current-location',
        filter: ['==', ['get', 'type'], 'marker'],
        layout: {
          visibility: 'none',
          'icon-ignore-placement': true,
          'icon-allow-overlap': true,
          'icon-image': 'location-viewport',
          'icon-size': 0.5,
          'icon-anchor': 'bottom',
          'icon-rotation-alignment': 'map',
        },
      },
      'current-location-marker',
    );

    setTimeout(() => {
      map.loadImage(
        require('url:../assets/location-viewport.png'),
        (e, image) => {
          if (e) throw e;
          map.addImage('location-viewport', image);
        },
      );
    }, 300);

    $location.style.display = 'block';

    const unwatch = function () {
      navigator.geolocation.clearWatch(geoWatch);
      console.log('GEOLOCATION clear watch');
      watching = sticking = compassing = compassingTransition = currentLocation = false;

      map.scrollZoom.disable();
      map.touchZoomRotate.disable();
      map.scrollZoom.enable();
      map.touchZoomRotate.enable();

      [
        'current-location-accuracy-radius',
        'current-location-walking-radius',
        'current-location-walking-radius-label',
        'current-location-marker',
        'current-location-viewport',
      ].forEach((l) => {
        map.setLayoutProperty(l, 'visibility', 'none', { validate: false });
      });

      $location.classList.remove('locating', 'active');
      sessionStorage.removeItem('taxirouter-sg:watch-location');
      renderTaxisInfo();
    };

    const unstick = function () {
      $location.classList.remove('active', 'compass');
      compassing = compassingTransition = sticking = false;

      map.scrollZoom.disable();
      map.touchZoomRotate.disable();
      map.scrollZoom.enable();
      map.touchZoomRotate.enable();

      renderTaxisInfo();
      unstickTimeout = setTimeout(unwatch, 5 * 60 * 1000); // 5 minutes
    };
    map.on('dragstart', (e) => {
      if (!e.originalEvent) return;
      const { touches } = e.originalEvent;
      if (touches) {
        if (touches.length === 1) unstick();
      } else {
        unstick();
      }
    });

    const watch = function () {
      if (watching) {
        const bounds = mapboxgl.LngLat.convert(currentLocation).toBounds(
          walkingDistance,
        );
        if (sticking) {
          compassingTransition = true;
          if (compassing) {
            map.stop().fitBounds(bounds, { padding: 50, pitch: 0 });
          } else {
            const bearing =
              map.getLayoutProperty(
                'current-location-viewport',
                'icon-rotate',
              ) || 0;
            const pitch = map.getPitch();
            map.stop().easeTo({
              center: currentLocation,
              zoom: 18,
              pitch: pitch >= 45 ? pitch : 60,
              bearing: bearing,
            });
          }
          map.once('moveend', () => {
            compassingTransition = false;
          });
          compassing = !compassing;
          $location.classList.toggle('compass', compassing);
        } else {
          map.stop().fitBounds(bounds, { padding: 50, pitch: 0 });
        }
        renderTaxisInfo();
      } else {
        $location.classList.add('locating');
        const currentLocationSource = map.getSource('current-location');
        let rafID;

        function watchPosition(position) {
          $location.classList.remove('locating');

          const { longitude, latitude, accuracy: radius } = position.coords;
          let lnglat = [longitude, latitude];
          if ('' + lnglat === '' + currentLocation) return; // No idea why

          currentLocation = lnglat;
          // console.log('CURRENT LOCATION', currentLocation);

          // Make sure current location is in Singapore first
          const extendedMaxBounds = maxBounds.extend(currentLocation);
          if (maxBounds.toString() !== extendedMaxBounds.toString()) {
            unwatch();
            return;
          }

          cancelAnimationFrame(rafID);
          rafID = requestAnimationFrame(() => {
            const accuracyCircle = circle(currentLocation, radius / 1000, {
              properties: { type: 'accuracy' },
            });
            walkingCircle = circle(currentLocation, walkingDistance / 1000, {
              properties: { type: 'walking' },
            });
            currentLocationSource.setData(
              featureCollection([
                accuracyCircle,
                walkingCircle,
                point(lnglat, { type: 'marker' }),
              ]),
            );

            [
              'current-location-accuracy-radius',
              'current-location-walking-radius',
              'current-location-walking-radius-label',
              'current-location-marker',
            ].forEach((l) => {
              map.setLayoutProperty(l, 'visibility', 'visible', {
                validate: false,
              });
            });

            if (!watching) {
              const bounds = mapboxgl.LngLat.convert(lnglat).toBounds(
                walkingDistance,
              );
              const highZoomLevel = map.getZoom() > 14;
              map.fitBounds(bounds, {
                padding: 50,
                pitch: 0,
                animate: highZoomLevel,
              });
              watching = true;
              sticking = true;
              sessionStorage.setItem('taxirouter-sg:watch-location', '1');
            } else if (sticking) {
              map.panTo(lnglat);
            }

            renderTaxisInfo();
          });
        }

        if (TEST_MODE) {
          // Chinatown
          setInterval(() => {
            const pos = {
              coords: {
                longitude: 103.84356 + Math.random() / 10000,
                latitude: 1.28434 + Math.random() / 10000,
                accuracy: Math.random() * 100,
              },
            };
            watchPosition(pos);
          }, 10000);
        } else {
          geoWatch = navigator.geolocation.watchPosition(
            watchPosition,
            function (e) {
              unwatch();
              setTimeout(watch, 1000); // Retry watch
            },
            {
              enableHighAccuracy: true,
              timeout: 60 * 1000, // 1 min timeout
              maximumAge: 5 * 1000, // 5-second cache
            },
          );
        }
      }

      $location.classList.add('active');
      sticking = true;
      clearTimeout(unstickTimeout);

      map.scrollZoom.disable();
      map.touchZoomRotate.disable();
      map.scrollZoom.enable({ around: 'center' });
      map.touchZoomRotate.enable({ around: 'center' });

      renderTaxisInfo();
    };

    function attachOrientation() {
      let touchingMap = false;
      map.on('touchstart', (e) => {
        if (e.originalEvent) {
          touchingMap = true;
        }
      });
      map.on('touchend', () => {
        touchingMap = false;
      });
      map.on('touchcancel', () => {
        touchingMap = false;
      });

      // https://developers.google.com/web/updates/2016/03/device-orientation-changes
      // https://stackoverflow.com/a/47870694/20838
      const deviceorientation =
        'ondeviceorientationabsolute' in window && !TEST_MODE // Chrome Dev Tools Sensor doesn't like `deviceorientationabsolute`
          ? 'deviceorientationabsolute'
          : 'deviceorientation';
      let rafID;
      let prevBearing;
      let prevPitch;
      window.addEventListener(
        deviceorientation,
        function (e) {
          if (!watching) return;
          if (touchingMap) return;
          if (!map.getLayer('current-location-viewport')) return;
          const bearing = round(
            (e && e.alpha && e.compassHeading) ||
              e.webkitCompassHeading ||
              compassHeading(e.alpha, e.beta, e.gamma),
            1,
          );
          const pitch = round(Math.min(60, Math.max(0, e.beta)), 1);
          if (bearing) {
            if (bearing === prevBearing && pitch === prevPitch) return;
            prevBearing = bearing;
            prevPitch = pitch;
            // console.log('BEARING + PITCH', bearing, pitch);
            cancelAnimationFrame(rafID);
            rafID = requestAnimationFrame(() => {
              map.setLayoutProperty(
                'current-location-viewport',
                'visibility',
                'visible',
                { validate: false },
              );
              map.setLayoutProperty(
                'current-location-viewport',
                'icon-rotate',
                bearing,
                { validate: false },
              );
              if (compassing && !compassingTransition) {
                map.jumpTo({
                  // center: currentLocation,
                  bearing,
                  pitch,
                });
              }
            });
          } else {
            map.setLayoutProperty(
              'current-location-viewport',
              'visibility',
              'none',
              { validate: false },
            );
          }
        },
        false,
      );
    }

    let orientationGranted = false;
    $location.addEventListener(
      'click',
      () => {
        watch();
        if (window.DeviceOrientationEvent && !orientationGranted) {
          if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
              .then(function (permissionState) {
                if (permissionState === 'granted') {
                  attachOrientation();
                }
              })
              .catch(console.error);
          } else {
            attachOrientation();
          }
        }
      },
      false,
    );

    // Always show current location
    if (sessionStorage.getItem('taxirouter-sg:watch-location')) {
      map.once('idle', watch);
    }
  }
});

if ('serviceWorker' in navigator && !TEST_MODE) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js');
  });
}
