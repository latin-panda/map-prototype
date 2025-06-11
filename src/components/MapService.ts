import Map from 'ol/Map';
import VectorSource from 'ol/source/Vector';
import { Feature } from 'ol';
import { fromLonLat } from 'ol/proj';
import { closestOnSegment, type Coordinate } from 'ol/coordinate';
import Polygon from 'ol/geom/Polygon';
import Point from 'ol/geom/Point';

export class MapService {
  static readonly MIN_DISTANCE = 6;
  static readonly DEFAULT_ZOOM = 16;

  static fitMap(map: Map, shapeDataSource: VectorSource) {
    map.getView().fit(shapeDataSource.getExtent(), { padding: [ 50, 50, 50, 50 ], maxZoom: this.DEFAULT_ZOOM });
  }

  static getShapeGeometry(shapeDataSource: VectorSource): Polygon {
    const shapes = shapeDataSource.getFeatures();
    if (!shapes.length) {
      throw new Error('No shape data available');
    }

    const geometry: Polygon | undefined = (shapes[ 0 ] as Feature<Polygon>)?.getGeometry();
    if (geometry?.getType() !== 'Polygon') {
      throw new Error('No geometry available');
    }

    return geometry;
  }

  static getGeometryContext(shapeDataSource: VectorSource): { geometry: Polygon, coordinates: Coordinate[] } {
    const geometry = this.getShapeGeometry(shapeDataSource);

    const coordinates = geometry?.getCoordinates()?.[ 0 ] ?? [];
    if (!coordinates.length) {
      throw new Error('No coordinates.');
    }

    return { geometry, coordinates };
  }

  static isClosestShapePoint(shapePoint: number[], point: number[]) {
    const distance = Math.sqrt(
      Math.pow(shapePoint[ 0 ] - point[ 0 ], 2) +
      Math.pow(shapePoint[ 1 ] - point[ 1 ], 2)
    );

    return distance <= this.MIN_DISTANCE;
  }

  static findPointInGeometry(point: Coordinate, shapeDataSource: VectorSource): Coordinate | undefined {
    const { coordinates } = this.getGeometryContext(shapeDataSource);
    return coordinates.find((shapePoint) => MapService.isClosestShapePoint(shapePoint, point));
  }

  static findPointInSegment(point: Coordinate, shapeDataSource: VectorSource): Coordinate | undefined {
    const { coordinates } = this.getGeometryContext(shapeDataSource);

    for (let i = 0; i < coordinates.length - 1; i++) {
      const startIdx = i;
      const endIdx = (i + 1) % (coordinates.length - 1); // Connect last point to first
      if (endIdx === coordinates.length - 1) {
        break;
      }

      const pointInSegment = closestOnSegment(point, [ coordinates[ startIdx ], coordinates[ endIdx ] ]);
      if (pointInSegment != null && MapService.isClosestShapePoint(pointInSegment, point)) {
        return pointInSegment;
      }
    }
  }

  static focusCurrentLocation(mapRef: Map | undefined) {
    if (!mapRef) {
      return;
    }

    if (!navigator.geolocation) {
      console.log('Geolocation is not supported by this browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = fromLonLat([ position.coords.longitude, position.coords.latitude ]);
        mapRef.getView().animate({ center: coords, zoom: this.DEFAULT_ZOOM, duration: 1000 });
      },
      (error) => console.error('Error getting location:', error.message),
      { enableHighAccuracy: true, timeout: 10 * 1000 }
    );
  };

  static focusShapeLocation(mapRef: Map | undefined, shapeDataSource: VectorSource) {
    if (!mapRef) {
      return;
    }

    const { coordinates } = this.getGeometryContext(shapeDataSource);
    mapRef.getView().animate({ center: coordinates[0], zoom: this.DEFAULT_ZOOM, duration: 1000 });
  }

  static movePoint(oldPointLocation: Coordinate, newPointLocation: Coordinate, shapeDataSource: VectorSource) {
    const { geometry, coordinates } = this.getGeometryContext(shapeDataSource);

    const [ longitude, latitude ] = fromLonLat(oldPointLocation);
    const updatedCoordinates = coordinates.map(([ lon, lat ]) => {
      if (lon === longitude && lat === latitude) {
        return fromLonLat(newPointLocation);
      }

      return [ lon, lat ];
    });

    geometry.setCoordinates([ updatedCoordinates ]);
  }

  static deletePoint(point: Coordinate, shapeDataSource: VectorSource) {
    const { geometry, coordinates } = this.getGeometryContext(shapeDataSource);
    if (coordinates.length <= 3) {
      throw new Error('Cannot delete point. A geometry needs at least 3 points to be a shape.');
    }

    const [ longitude, latitude ] = fromLonLat(point);
    const updatedCoordinates = coordinates.filter(([ lon, lat ]) => lon !== longitude && lat !== latitude);
    geometry.setCoordinates([ updatedCoordinates ]);
  }

  static setHover(point: Coordinate | undefined, hoverSource: VectorSource) {
    if (point == null) {
      return;
    }

    const pointFeature = new Feature(new Point(point));
    hoverSource.addFeature(pointFeature);
  }
}
