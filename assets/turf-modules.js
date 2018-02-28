var helpers = require('@turf/helpers');

module.exports = Object.assign({
  pointsWithinPolygon: require('@turf/points-within-polygon'),
  nearestPoint: require('@turf/nearest-point'),
  circle: require('@turf/circle'),
}, helpers);