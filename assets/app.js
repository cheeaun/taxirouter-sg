var $ = function(id){ return document.getElementById(id); };
var $map = $('map');
var $infoTaxis = $('info-taxis');

var map;
var taxisOnMap = {};
var markersVisible = false;
var currentLocation;
var mapBounds = {
  south: 1.2513146,
  west: 103.67828510000004,
  north: 1.4490928,
  east: 103.99178865,
};
var fiveMinDistance = 80 * 5; // meters, via https://en.wikipedia.org/wiki/Walking_distance_measure

var $about = $('about');
var $aboutOkay = $('about-okay');

var $header = $('heading');
var toggleAbout = function(){
  $about.classList.toggle('show');
};
$header.addEventListener('click', toggleAbout, false);
$aboutOkay.addEventListener('click', toggleAbout, false);
if (window.localStorage && !localStorage['taxirouter-sg:about']){
  $about.classList.add('show');
  localStorage['taxirouter-sg:about'] = 1;
}

function renderTaxiStands(){
  var icon = {
    url: 'assets/taxi-stand.png',
    size: new google.maps.Size(30, 46),
    scaledSize: new google.maps.Size(15, 23),
    anchor: new google.maps.Point(7.5, 23),
  };
  _.forEach(taxiStandsOnMap, function(stand){
    var lat = stand[0], lng = stand[1];
    new google.maps.Marker({
      position: new google.maps.LatLng(lat, lng),
      icon: icon,
      map: map,
      clickable: false,
      zIndex: (90-lat)*100,
    });
  });
};

function renderTaxis(){
  $infoTaxis.className = 'loading';
  fetch('https://api.data.gov.sg/v1/transport/taxi-availability', {
    headers: { 'api-key': 'QSlWniO8ADQu2BmiVAEueFIxHF4GcaQ9' }
  })
  .then(function(response){
    return response.json();
  })
  .then(function(response){
    $infoTaxis.className = '';
    if (!response || !response.features) throw Error(response);
    var taxiKeys = response.features[0].geometry.coordinates.map(function(c){
      return '' + c[1] + ',' + c[0]; // lat,lng
    });

    // 1. Diff with taxis on map, get added and removed
    var added = [], removed = [];
    var taxisOnMapKeys = Object.keys(taxisOnMap);
    if (!taxisOnMap || !taxisOnMapKeys.length){
      added = taxiKeys;
    } else {
      var q = d3_queue.queue(50);
      _.forEach(taxisOnMapKeys, function(key){
        if (taxiKeys.indexOf(key) < 0){
          removed.push(key);
        } else {
          q.defer(function(done){
            taxisOnMap[key].setOpacity(.5);
            setTimeout(done, 1);
          });
        }
      });
      _.forEach(taxiKeys, function(key){
        if (!taxisOnMap[key]){
          added.push(key);
        }
      });
    }

    // 2. Get rid of excess removed markers
    if (removed.length > added.length){
      _.forEach(removed.splice(added.length), function(key){
        taxisOnMap[key].setMap(null);
        delete taxisOnMap[key];
      });
    }

    // 3. Plot the added markers
    markersVisible = map.getZoom() >= 13;
    var icon = {
      url: 'assets/taxi.png',
      size: new google.maps.Size(18, 16),
      scaledSize: new google.maps.Size(9, 8),
      anchor: new google.maps.Point(4.5, 4),
    };
    var q = d3_queue.queue(50);
    _.forEach(added, function(key, i){
      if (taxisOnMap[key]){
        // For some reason, there are multiple taxis located on the SAME POSITION
        // So here, we just draw one taxi per lat,lng (unique key)
        // console.log('MULTI TAXI', key);
        return;
      }
      q.defer(function(done){
        var coord = key.split(',');
        var position = new google.maps.LatLng(coord[0], coord[1]);
        var removedKey = removed[i];
        if (removedKey){
          var m = taxisOnMap[removedKey];
          m.setPosition(position);
          m.setVisible(markersVisible);
          m.setOpacity(1);
          taxisOnMap[key] = m;
          delete taxisOnMap[removedKey];
          done();
        } else {
          taxisOnMap[key] = new google.maps.Marker({
            position: position,
            icon: icon,
            clickable: false,
            map: map,
            zIndex: 1,
            visible: markersVisible,
          });
          setTimeout(done, 1);
        }
      });
    });

    q.awaitAll(function(){
      renderTaxisInfo();
      setTimeout(renderTaxis, 1000*60); // 60 seconds
    });
  }).catch(function(e){
    console.error(e);
    setTimeout(renderTaxis, 1000*10); // 10 seconds
    $infoTaxis.className = '';
  });
};

function renderTaxisInfo(){
  var taxisOnMapKeys = Object.keys(taxisOnMap);
  if (currentLocation){
    var taxiCountAround = 0;
    _.forEach(taxisOnMapKeys, function(key){
      var coord = key.split(',');
      var taxiPos = new google.maps.LatLng(coord[0], coord[1]);
      var distance = google.maps.geometry.spherical.computeDistanceBetween(currentLocation, taxiPos);
      if (distance <= fiveMinDistance) taxiCountAround++;
    });

    var nearestTaxiStand;
    var shortestDistance = Infinity;
    _.forEach(taxiStandsOnMap, function(stand){
      var taxiStandPos = new google.maps.LatLng(stand[0], stand[1]);
      var distance = google.maps.geometry.spherical.computeDistanceBetween(currentLocation, taxiStandPos);
      if (distance < shortestDistance){
        shortestDistance = distance;
        nearestTaxiStand = taxiStandPos;
      }
    });

    if (taxiCountAround){
      $infoTaxis.innerHTML = '<b>' + taxiCountAround + ' available taxis</b> around you.';
    }
    if (nearestTaxiStand){
      var minutes = Math.ceil(shortestDistance/80);
      $infoTaxis.innerHTML += '<br>Nearest taxi stand is about <b>' + minutes + ' minute' + (minutes == 1 ? '' : 's') +  '</b> walk away.'
    }
  } else {
    $infoTaxis.innerHTML = taxisOnMapKeys.length + ' available taxis!';
  }
}

function initMap(){
  map = new google.maps.Map($map, {
    backgroundColor: '#B3D1FF',
    disableDefaultUI: true,
    keyboardShortcuts: true,
    maxZoom: 16,
    styles: [
      {
        featureType: 'poi.business',
        stylers: [{visibility: 'off'}]
      },
    ]
  });
  map.fitBounds(mapBounds);
  var $boundsWarning = $('bounds-warning');
  map.addListener('bounds_changed', function(){
    var bounds = map.getBounds();
    if (!bounds) return;
    if (bounds.intersects(mapBounds)){
      $boundsWarning.classList.remove('visible');
    } else {
      $boundsWarning.classList.add('visible');
    }
  });
  $('back-sg').addEventListener('click', function(){
    $boundsWarning.classList.remove('visible');
    map.fitBounds(mapBounds);
  }, false);

  renderTaxiStands();
  renderTaxis();

  map.addListener('zoom_changed', function(){
    var visible = map.getZoom() >= 13;
    if (markersVisible != visible){
      _.forEach(taxisOnMap, function(t){
        t.setVisible(visible);
      });
      markersVisible = visible;
    }
  });

  if (navigator.geolocation){
    var LocationMarker = _LocationMarker(google);
    var locationMarker = new LocationMarker({
      visible: false,
      map: map,
    });
    var locationCircle = new google.maps.Circle({
      strokeColor: '#4285f4',
      strokeOpacity: .5,
      strokeWeight: 3,
      fillColor: '#4285f4',
      fillOpacity: .1,
      map: map,
      radius: fiveMinDistance,
      clickable: false,
      visible: false,
    });

    var $nearestStation = $('nearest-station');
    var $location = $('location');
    $location.style.display = 'block';

    var watching = false;
    var watch;

    var unwatch = function(){
      navigator.geolocation.clearWatch(watch);
      watching = false;
      currentLocation = false;
      locationMarker.setVisible(false);
      locationCircle.setVisible(false);
      $location.classList.remove('active');
      $nearestStation.classList.remove('show');
      renderTaxisInfo();
    };

    $location.addEventListener('click', function(){
      $location.classList.add('active');
      if (watching){
        var markerLocation = locationMarker.getPosition();
        if (markerLocation.equals(map.getCenter())){
          if (map.getZoom() < 16) map.setZoom(16);
        } else {
          map.panTo(markerLocation);
        }
      } else {
        watch = navigator.geolocation.watchPosition(function(position){
          var coords = position.coords;
          currentLocation = new google.maps.LatLng(coords.latitude, coords.longitude);
          // currentLocation = new google.maps.LatLng(1.2853783884559036, 103.84543418884277);
          locationMarker.setPosition(currentLocation);
          locationMarker.setRadius(coords.accuracy);
          locationMarker.setVisible(true);
          locationCircle.setCenter(currentLocation);
          locationCircle.setVisible(true);

          if (!watching) map.panTo(currentLocation);
          watching = true;
          sessionStorage['taxirouter-sg:watch-location'] = 1;

          // Make sure current location is in Singapore first
          var bounds = new google.maps.LatLngBounds(
            new google.maps.LatLng(mapBounds.south, mapBounds.west),
            new google.maps.LatLng(mapBounds.north, mapBounds.east)
          );
          if (!bounds.contains(currentLocation)){
            unwatch();
            return;
          }

          renderTaxisInfo();
        }, function(e){
          unwatch();
          alert('Unable to get your location. Please try again.');
        }, {
          enableHighAccuracy: true,
          timeout: 60*1000, // 1 min timeout
          maximumAge: 5*1000 // 5-second cache
        });
      }
    }, false);

    // Always show current location
    if (sessionStorage['taxirouter-sg:watch-location']) setTimeout(function(){
      $location.click();
    }, 1000);

    map.addListener('dragstart', function(){
      $location.classList.remove('active');
    });

    if (window.DeviceOrientationEvent){
      window.addEventListener('deviceorientation', function(e){
        if (!watching) return;
        if (!e || e.alpha === null) return;
        locationMarker.drawCompass();
        locationMarker.setCompassHeading(e.webkitCompassHeading || e.alpha);
      }, false);
    }
  }
}
