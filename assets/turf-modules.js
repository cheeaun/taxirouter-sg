var helpers = require('@turf/helpers');

module.exports = {
  pointsWithinPolygon: require('@turf/points-within-polygon'),
  nearestPoint: require('@turf/nearest-point'),
  circle: require('@turf/circle'),
  multiPoint: helpers.multiPoint,
  point: helpers.point,
  points: helpers.points,
  polygon: helpers.polygon,
};