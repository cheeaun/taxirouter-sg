var helpers = require('@turf/helpers');

module.exports = {
  pointsWithinPolygon: require('@turf/points-within-polygon').default,
  nearestPoint: require('@turf/nearest-point').default,
  circle: require('@turf/circle').default,
  multiPoint: helpers.multiPoint,
  point: helpers.point,
  points: helpers.points,
  polygon: helpers.polygon,
};