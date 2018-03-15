function $(id){ return document.getElementById(id); };

// https://gist.github.com/nmsdvid/8807205
function debounce(a,b,c){var d;return function(){var e=this,f=arguments;clearTimeout(d),d=setTimeout(function(){d=null,c||a.apply(e,f)},b),c&&!d&&a.apply(e,f)}}

// https://stackoverflow.com/a/2901298/20838
function numberWithCommas(x){ return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

// https://stackoverflow.com/a/21829819/20838
// http://w3c.github.io/deviceorientation/spec-source-orientation.html#worked-example
var degtorad = Math.PI / 180; // Degree-to-Radian conversion
function compassHeading(alpha, beta, gamma){
  var _x = beta  ? beta  * degtorad : 0; // beta value
  var _y = gamma ? gamma * degtorad : 0; // gamma value
  var _z = alpha ? alpha * degtorad : 0; // alpha value

  var cX = Math.cos( _x );
  var cY = Math.cos( _y );
  var cZ = Math.cos( _z );
  var sX = Math.sin( _x );
  var sY = Math.sin( _y );
  var sZ = Math.sin( _z );

  // Calculate Vx and Vy components
  var Vx = - cZ * sY - sZ * sX * cY;
  var Vy = - sZ * sY + cZ * sX * cY;

  // Calculate compass heading
  var compassHeading = Math.atan( Vx / Vy );

  // Convert compass heading to use whole unit circle
  if( Vy < 0 ) {
    compassHeading += Math.PI;
  } else if( Vx < 0 ) {
    compassHeading += 2 * Math.PI;
  }

  return compassHeading * ( 180 / Math.PI ); // Compass Heading (in degrees)
}

var $infoTaxis = $('info-taxis');
var $location = $('location');
var fiveMinDistance = 80 * 5; // meters, via https://en.wikipedia.org/wiki/Walking_distance_measure
var emptyGeojson = {
  type: 'geojson',
  data: { type: 'Feature' },
};
var taxisOnMap;
var fiveMinCircle;
var currentLocation;

var $about = $('about');
var $aboutOkay = $('about-okay');

var $header = $('heading');
var toggleAbout = function(){
  $about.classList.toggle('show');
};
$header.addEventListener('click', toggleAbout, false);
$aboutOkay.addEventListener('click', toggleAbout, false);
if (window.localStorage && !localStorage.getItem('taxirouter-sg:about')){
  $about.classList.add('show');
  localStorage.setItem('taxirouter-sg:about', 1);
}

function fetchTaxis(fn){
  var xhr = new XMLHttpRequest();
  xhr.onload = function(){
    fn(JSON.parse(this.responseText));
  };
  xhr.open('GET', 'https://api.data.gov.sg/v1/transport/taxi-availability');
  xhr.setRequestHeader('api-key', 'QSlWniO8ADQu2BmiVAEueFIxHF4GcaQ9');
  xhr.send();
};

mapboxgl.accessToken = 'pk.eyJ1IjoiY2hlZWF1biIsImEiOiIwMTkyNjRiOWUzOTMyZThkYTE3YjMyMWFiZGU2OTZlNiJ9.XsOEKtyctGiNGNsmVhetYg';
var map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/navigation-preview-night-v2',
  logoPosition: 'top-right',
  attributionControl: false,
  boxZoom: false,
});
map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'top-right');
map.addControl(new mapboxgl.NavigationControl(), 'top-right');

function PitchControl(){};
PitchControl.prototype.onAdd = function(map){
  this._map = map;
  var container = document.createElement('div');
  container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
  container.innerHTML = '<button class="mapboxgl-ctrl-icon mapboxgl-ctrl-custom-pitch" type="button"><span>3D</span></button>'
  container.onclick = function(){
    var pitch = map.getPitch();
    var nextPitch = 0;
    if (pitch < 30){
      nextPitch = 30;
    } else if (pitch < 45){
      nextPitch = 45;
    } else if (pitch < 60){
      nextPitch = 60;
    }
    map.easeTo({ pitch: nextPitch });
  };
  map.on('pitchend', this.onPitch.bind(this));
  this._container = container;
  return this._container;
};
PitchControl.prototype.onPitch = function(){
  var pitch = map.getPitch();
  this._container.classList.toggle('active', !!pitch);
  var text = this._container.getElementsByTagName('span')[0];
  text.style.transform = 'rotate3d(1,0,0,' + pitch + 'deg)';
}
PitchControl.prototype.onRemove = function(){
  this._container.parentNode.removeChild(this._container);
  this._map.off('pitchend', this.onPitch.bind(this));
  this._map = undefined;
};
map.addControl(new PitchControl(), 'top-right');

var maxBoundsLike = [
  [ 103.6016626883025, 1.233357600011331 ], // sw
  [ 104.0381760444838, 1.473818072475055 ] // ne
];
var maxBounds = mapboxgl.LngLatBounds.convert(maxBoundsLike);
map.fitBounds(maxBounds, { animate: false });

map.on('load', function(){
  var layers = map.getStyle().layers;
  // Find the index of the first symbol layer in the map style
  var labelLayerId;
  for (var i=0; i<layers.length; i++){
    if (layers[i].type === 'symbol' && layers[i].layout['text-field']){
      labelLayerId = layers[i].id;
      break;
    }
  }

  map.addSource('taxis', emptyGeojson);
  map.addLayer({
    id: 'taxis-heat',
    type: 'heatmap',
    source: 'taxis',
    maxzoom: 15,
    paint: {
      'heatmap-radius': 11,
      'heatmap-weight': .1,
      'heatmap-intensity': .5,
      'heatmap-color': [
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        0, 'rgba(0,0,255,0)',
        .1, 'yellow',
        .5, 'orange',
        1, 'orangered'
      ],
    }
  }, labelLayerId);

  var taxiLayout = {
    'icon-padding': 0,
    'icon-size': [
      'interpolate', ['linear'], ['zoom'],
      16, .5,
      22, 1.5
    ],
    'icon-allow-overlap': [
      'step', ['zoom'],
      false,
      15, true
    ],
    'icon-ignore-placement': [
      'step', ['zoom'],
      false,
      15, true
    ],
  };
  map.addSource('taxis-moving', emptyGeojson);
  map.addLayer({
    id: 'taxis-moving',
    type: 'symbol',
    source: 'taxis-moving',
    minzoom: 12,
    layout: taxiLayout,
  }, labelLayerId);
  map.loadImage('assets/taxi.png', function(e, image){
    if (e) throw e;
    map.addImage('taxi', image);
    map.setLayoutProperty('taxis-moving', 'icon-image', 'taxi');
  });
  map.addSource('taxis-stationary', emptyGeojson);
  map.addLayer({
    id: 'taxis-stationary',
    type: 'symbol',
    source: 'taxis-stationary',
    minzoom: 12,
    layout: taxiLayout,
  }, labelLayerId);
  map.loadImage('assets/taxi-stationary.png', function(e, image){
    if (e) throw e;
    map.addImage('taxi-stationary', image);
    map.setLayoutProperty('taxis-stationary', 'icon-image', 'taxi-stationary');
  });

  map.addSource('taxi-stands', {
    type: 'geojson',
    data: turf.multiPoint(taxiStandsOnMap),
  });
  map.addLayer({
    id: 'taxi-stands',
    type: 'symbol',
    source: 'taxi-stands',
    minzoom: 13,
    layout: {
      'icon-padding': 0,
      'icon-size': [
        'interpolate', ['linear'], ['zoom'],
        16, .5,
        22, 1.5
      ],
      'icon-allow-overlap': [
        'step', ['zoom'],
        false,
        15, true
      ],
      'icon-ignore-placement': [
        'step', ['zoom'],
        false,
        15, true
      ],
      'icon-anchor': 'bottom',
    },
  }, labelLayerId);
  map.loadImage('assets/taxi-stand.png', function(e, image){
    if (e) throw e;
    map.addImage('taxi-stand', image);
    map.setLayoutProperty('taxi-stands', 'icon-image', 'taxi-stand');
  });

  var taxisSourceLoad = function(e){
    if (map.isSourceLoaded('taxis-moving') && map.isSourceLoaded('taxis-stationary')){
      requestAnimationFrame(function(){
        map.addLayer({
          id: '3d-buildings',
          source: 'composite',
          'source-layer': 'building',
          filter: ['==', 'extrude', 'true'],
          type: 'fill-extrusion',
          minzoom: 15,
          paint: {
            'fill-extrusion-opacity': [
              'interpolate', ['linear'], ['zoom'],
              15, 0,
              15.2, .3
            ],
            'fill-extrusion-color': '#666',
            'fill-extrusion-height': [
              'interpolate', ['linear'], ['zoom'],
              15, 0,
              15.05, ['get', 'height']
            ],
            'fill-extrusion-base': [
              'interpolate', ['linear'], ['zoom'],
              15, 0,
              15.05, ['get', 'min_height']
            ],
          }
        }, labelLayerId);
      });
      map.off('sourcedata', taxisSourceLoad);
    }
  };
  map.on('sourcedata', taxisSourceLoad);

  var renderTaxisInfo = function(){
    $infoTaxis.className = 'loaded';
    if (currentLocation && sticking){
      var taxiCountAround = turf.pointsWithinPolygon(turf.points(taxisOnMap.features[0].geometry.coordinates), fiveMinCircle).features.length;
      var nearestTaxiStand = turf.nearestPoint(turf.point(currentLocation), turf.points(taxiStandsOnMap));
      if (taxiCountAround){
        $infoTaxis.innerHTML = '<b>' + numberWithCommas(taxiCountAround) + ' available taxis</b> around you.';
        if (nearestTaxiStand){
          var minutes = Math.ceil(nearestTaxiStand.properties.distanceToPoint*1000/80);
          $infoTaxis.innerHTML += '<br>Nearest taxi stand is about <b>' + minutes + ' minute' + (minutes == 1 ? '' : 's') +  '</b> walk&nbsp;away.'
        }
      }
    } else {
      var taxiCount = taxisOnMap.features[0].properties.taxi_count;
      $infoTaxis.innerHTML = '<b>' + numberWithCommas(taxiCount) + '</b> available taxis!';
    }
  }

  var renderTaxis = function(){
    requestAnimationFrame(function(){
      $infoTaxis.className = '';
      fetchTaxis(function(data){
        map.getSource('taxis').setData(data);
        if (taxisOnMap){
          var taxisOnMapStr = taxisOnMap.features[0].geometry.coordinates.toString();
          var movingTaxis = [];
          var stationaryTaxis = data.features[0].geometry.coordinates.filter(function(c){
            var isStationary = taxisOnMapStr.includes(c.toString());
            if (!isStationary) movingTaxis.push(c);
            return isStationary;
          });
          map.getSource('taxis-stationary').setData(turf.multiPoint(stationaryTaxis));
          map.getSource('taxis-moving').setData(turf.multiPoint(movingTaxis));
        } else {
          map.getSource('taxis-moving').setData(data);
        }
        taxisOnMap = data;
        renderTaxisInfo();
      });

      setTimeout(renderTaxis, 1000*60); // every minute
    });
  };
  renderTaxis();

  if (navigator.geolocation){
    map.addSource('current-location-accuracy-radius', emptyGeojson);
    map.addLayer({
      id: 'current-location-accuracy-radius',
      type: 'fill',
      source: 'current-location-accuracy-radius',
      layout: {
        visibility: 'none',
      },
      paint: {
        'fill-color': 'rgba(66, 133, 244, .2)',
      },
    });

    map.addSource('current-location-fivemin-radius', emptyGeojson);
    map.addLayer({
      id: 'current-location-fivemin-radius',
      type: 'line',
      source: 'current-location-fivemin-radius',
      minzoom: 13,
      layout: {
        visibility: 'none',
        'line-cap': 'round',
      },
      paint: {
        'line-width': 3,
        'line-dasharray': [1, 3],
        'line-color': 'rgba(66, 133, 244, .75)',
      },
    });
    map.addLayer({
      id: 'current-location-fivemin-radius-walk',
      type: 'symbol',
      source: 'current-location-fivemin-radius',
      minzoom: 13,
      layout: {
        visibility: 'none',
      },
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': Math.min(window.innerWidth, window.innerHeight),
        'text-field': '{title}',
        'text-size': 14,
        'text-pitch-alignment': 'viewport',
        'text-anchor': 'bottom',
        'text-justify': 'left',
      },
      paint: {
        'text-color': '#4285f4',
        'text-halo-color': 'rgba(0,0,0,.5)',
        'text-halo-width': 1,
      },
    });

    map.addSource('current-location-marker', emptyGeojson);
    map.addLayer({
      id: 'current-location-marker',
      type: 'circle',
      source: 'current-location-marker',
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

    map.loadImage('assets/location-viewport.png', function(e, image){
      if (e) throw e;
      map.addImage('location-viewport', image);
      map.addLayer({
        id: 'current-location-viewport',
        type: 'symbol',
        source: 'current-location-marker',
        layout: {
          visibility: 'none',
          'icon-ignore-placement': true,
          'icon-allow-overlap': true,
          'icon-image': 'location-viewport',
          'icon-size': .5,
          'icon-anchor': 'bottom',
          'icon-rotation-alignment': 'map',
        },
      }, 'current-location-marker');
    });

    $location.style.display = 'block';

    var sticking = false;
    var watching = false;
    var compassing = false;
    var watch, geoWatch;
    var unstickTimeout;

    var unwatch = function(){
      navigator.geolocation.clearWatch(geoWatch);
      console.log('GEOLOCATION clear watch');
      watching = sticking = compassing = currentLocation = false;
      map.setLayoutProperty('current-location-accuracy-radius', 'visibility', 'none');
      map.setLayoutProperty('current-location-fivemin-radius', 'visibility', 'none');
      map.setLayoutProperty('current-location-fivemin-radius-walk', 'visibility', 'none');
      map.setLayoutProperty('current-location-marker', 'visibility', 'none');
      map.setLayoutProperty('current-location-viewport', 'visibility', 'none');
      $location.classList.remove('locating', 'active');
      sessionStorage.removeItem('taxirouter-sg:watch-location');
      renderTaxisInfo();
    };

    var unstick = function(){
      $location.classList.remove('active', 'compass');
      compassing = false;
      sticking = false;
      renderTaxisInfo();
      unstickTimeout = setTimeout(unwatch, 5*60*1000); // 5 minutes
    };

    var watch = function(){
      if (watching){
        var bounds = mapboxgl.LngLat.convert(currentLocation).toBounds(fiveMinDistance);
        if (sticking){
          if (compassing){
            map.stop().fitBounds(bounds, { padding: 50, pitch: 0 });
          } else {
            var bearing = map.getLayoutProperty('current-location-viewport', 'icon-rotate') || 0;
            var pitch = map.getPitch();
            map.stop().easeTo({
              center: currentLocation,
              zoom: 18,
              pitch: pitch >= 30 ? pitch : 45,
              bearing: bearing,
            });
          }
          compassing = !compassing;
          $location.classList.toggle('compass', compassing);
        } else {
          map.stop().fitBounds(bounds, { padding: 50, pitch: 0 });
        }
        renderTaxisInfo();
      } else {
        $location.classList.add('locating');
        geoWatch = navigator.geolocation.watchPosition(function(position){
          $location.classList.remove('locating');

          var coords = position.coords;
          var lnglat = [coords.longitude, coords.latitude];
          if (location.hash == '#test-geolocation'){
            lnglat = [103.843567, 1.28434]; // Chinatown
          }
          if (''+lnglat === ''+currentLocation) return; // No idea why

          currentLocation = lnglat;
          console.log('GEOLOCATION start watch', currentLocation);

          // Make sure current location is in Singapore first
          var extendedMaxBounds = maxBounds.extend(currentLocation);
          if (maxBounds.toString() !== extendedMaxBounds.toString()){
            unwatch();
            return;
          }

          var radius = coords.accuracy;
          var accuracyCircle = turf.circle(currentLocation, radius/1000);
          fiveMinCircle = turf.circle(currentLocation, fiveMinDistance/1000, {
            properties: { title: '5 mins walk' },
          });
          map.getSource('current-location-accuracy-radius').setData(accuracyCircle);
          map.getSource('current-location-fivemin-radius').setData(fiveMinCircle);
          map.getSource('current-location-marker').setData(turf.point(lnglat));

          map.setLayoutProperty('current-location-accuracy-radius', 'visibility', 'visible');
          map.setLayoutProperty('current-location-fivemin-radius', 'visibility', 'visible');
          map.setLayoutProperty('current-location-fivemin-radius-walk', 'visibility', 'visible');
          map.setLayoutProperty('current-location-marker', 'visibility', 'visible');
          map.setLayoutProperty('current-location-viewport', 'visibility', 'visible');

          if (!watching){
            var bounds = mapboxgl.LngLat.convert(lnglat).toBounds(fiveMinDistance);
            map.fitBounds(bounds, { padding: 50, pitch: 0 });
            watching = true;
            sticking = true;
            sessionStorage.setItem('taxirouter-sg:watch-location', 1);
          } else if (sticking && !map.isMoving()){
            map.panTo(lnglat);
          }

          renderTaxisInfo();
        }, function(e){
          unwatch();
          setTimeout(watch, 1000); // Retry watch
        }, {
          enableHighAccuracy: true,
          timeout: 60*1000, // 1 min timeout
          maximumAge: 5*1000 // 5-second cache
        });
      }

      $location.classList.add('active');
      sticking = true;
      clearTimeout(unstickTimeout);
      renderTaxisInfo();

      map.once('dragstart', unstick);
    };

    $location.addEventListener('click', watch, false);

    // Always show current location
    if (sessionStorage.getItem('taxirouter-sg:watch-location')){
      var dataLoad = debounce(function(data){
        requestAnimationFrame(watch);
        map.off('data', dataLoad);
      }, 2000);
      map.on('data', dataLoad);
    }

    if (window.DeviceOrientationEvent){
      // https://developers.google.com/web/updates/2016/03/device-orientation-changes
      // https://stackoverflow.com/a/47870694/20838
      var deviceorientation = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
      window.addEventListener(deviceorientation, function(e){
        if (!watching) return;
        if (!e || e.alpha === null) return;
        var heading = e.compassHeading || e.webkitCompassHeading || compassHeading(e.alpha, e.beta, e.gamma);
        if (map.getLayer('current-location-viewport')){
          map.setLayoutProperty('current-location-viewport', 'visibility', 'visible');
          map.setLayoutProperty('current-location-viewport', 'icon-rotate', heading);
          if (compassing && !map.isMoving()){
            map.easeTo({
              center: currentLocation,
              bearing: heading,
            });
          }
        }
      }, false);
    }
  }

  // Create fake polygon on top so that can detect bounds easily
  map.addLayer({
    id: 'max-bounds',
    type: 'fill',
    source: {
      type: 'geojson',
      data: turf.polygon([[
        maxBounds.getNorthWest().toArray(),
        maxBounds.getNorthEast().toArray(),
        maxBounds.getSouthEast().toArray(),
        maxBounds.getSouthWest().toArray(),
        maxBounds.getNorthWest().toArray()
      ]]),
    },
    paint: {
      'fill-opacity': 0,
    },
  });
  var $boundsWarning = $('bounds-warning');
  var showHideBoundsWarning = debounce(function(){
    var hasFeatures = !!map.queryRenderedFeatures({layers: ['max-bounds']}).length;
    if (hasFeatures){
      $boundsWarning.classList.remove('visible');
    } else {
      $boundsWarning.classList.add('visible');
    }
  }, 600);
  map.on('render', showHideBoundsWarning);
  $('back-sg').addEventListener('click', function(){
    $boundsWarning.classList.remove('visible');
    map.fitBounds(maxBounds, { animate: false });
  }, false);
});

$('map').addEventListener('touchmove', function(e){
  e.preventDefault();
}, false);