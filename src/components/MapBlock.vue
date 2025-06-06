<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import Map from 'ol/Map';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import OSM from 'ol/source/OSM';
import GeoJSON from 'ol/format/GeoJSON';
import { Modify } from 'ol/interaction';
import Style from 'ol/style/Style';
import CircleStyle from 'ol/style/Circle';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import { Feature } from 'ol';
import { fromLonLat, toLonLat } from 'ol/proj';
import { closestOnSegment, type Coordinate } from 'ol/coordinate';
import Polygon from 'ol/geom/Polygon';
import Point from 'ol/geom/Point';

const BORDER_SIZE = 4;
const PRIMARY_COLOR = '#3E9FCC';
const AREA_COLOR = 'rgba(62, 159, 204, 0.2)';
const SELECTED_COLOR = '#ffffff';
const MIN_DISTANCE = 10;

const addPointImg = `${import.meta.env.BASE_URL}images/add-points.svg`;
const editPointImg = `${import.meta.env.BASE_URL}images/edit-points.svg`;
const deletePointImg = `${import.meta.env.BASE_URL}images/delete-points.svg`;

defineProps<{
  data: any[]; // Array of GeoJSON features (e.g., polygonForEdit)
}>();

const isAddMode = ref(false);
const latitudeInput = ref('');
const longitudeInput = ref('');

// Map reference
const mapContainer = ref<HTMLElement | undefined>(undefined);
const mapRef = ref<Map | undefined>(undefined);

// Vector source for polygons
const shapeDataSource = new VectorSource();

// Selected point coordinates
const selectedPoint = ref<{ lon: number; lat: number } | null>(null);
const selectedFeature = ref<Feature<Point> | null>(null);

// Vector source for points
const selectSource = new VectorSource();
const hoverSource = new VectorSource();

// Initialize map
onMounted(() => {
  if (!mapContainer.value) {
    return;
  }

  const map = createMap();
  map.set('data', mapContainer.value.dataset.data ? JSON.parse(mapContainer.value.dataset.data) : []);
  const modify = new Modify({
    source: shapeDataSource,
    insertVertexCondition: () => isAddMode.value,
    style: new Style({
      image: new CircleStyle({ // Hides original hover point style.
        radius: 0,
        fill: new Fill({ color: 'rgba(0, 0, 0, 0)' }),
        stroke: new Stroke({ color: 'rgba(0, 0, 0, 0)', width: 0 }),
      }),
    }),
  });
  modify.on('modifyend', (event) => selectPoint(event.mapBrowserEvent.coordinate));
  map.addInteraction(modify);

  map.on('click', (event) => selectPoint(event.coordinate));
  map.on('pointermove', (event) => hoverPoint(event.coordinate));

  mapRef.value = map;
});

onUnmounted(() => {
  if (mapRef.value == null) {
    return;
  }

  mapRef.value.setTarget(undefined);
  mapRef.value = undefined;
});

// Load initial polygon data
watch(
    () => mapRef.value,
    (newMap) => {
      if (newMap && shapeDataSource.getFeatures().length === 0) {
        const geojsonFormat = new GeoJSON();
        const features = geojsonFormat.readFeatures(
            { type: 'FeatureCollection', features: newMap.get('data') || [] },
            { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }
        );
        shapeDataSource.addFeatures(features);
        const extent = shapeDataSource.getExtent();
        newMap.getView().fit(extent, { padding: [ 50, 50, 50, 50 ], maxZoom: 18 });
      }
    },
    { immediate: true }
);

const createMap = () => {
  const mapProviderLayer = new TileLayer({ source: new OSM() });

  const areaLayer = new VectorLayer({
    source: shapeDataSource,
    style: new Style({
      fill: new Fill({ color: AREA_COLOR }),
      stroke: new Stroke({ color: PRIMARY_COLOR, width: BORDER_SIZE }),
    }),
  });

  const selectLayer = new VectorLayer({
    source: selectSource,
    style: new Style({
      image: new CircleStyle({
        radius: 11,
        fill: new Fill({ color: SELECTED_COLOR }),
        stroke: new Stroke({ color: PRIMARY_COLOR, width: BORDER_SIZE }),
      }),
    }),
  });

  const hoverLayer = new VectorLayer({
    source: hoverSource,
    style: new Style({
      image: new CircleStyle({
        radius: 8,
        fill: new Fill({ color: PRIMARY_COLOR }), // Yellow for hover
        stroke: new Stroke({ color: '#FFF', width: 1 }),
      }),
    }),
  });

  return new Map({
    target: mapContainer.value,
    layers: [
      mapProviderLayer,
      areaLayer,
      hoverLayer,
      selectLayer,
    ],
  });
};

const getShapeGeometry = (): Polygon | undefined => {
  const shapes = shapeDataSource.getFeatures();
  if (!shapes.length) {
    console.log('No shape data available');
    return;
  }

  const geometry: Polygon | undefined = (shapes[ 0 ] as Feature<Polygon>)?.getGeometry();
  if (geometry?.getType() !== 'Polygon') {
    console.log('No geometry available');
    return;
  }

  return geometry;
};

const isClosestShapePoint = (shapePoint: number[], point: number[]) => {
  const distance = Math.sqrt(
      Math.pow(shapePoint[ 0 ] - point[ 0 ], 2) +
      Math.pow(shapePoint[ 1 ] - point[ 1 ], 2)
  );

  return distance <= MIN_DISTANCE;
};

const hoverPoint = (clickedPoint: number[]) => {
  hoverSource.clear();

  const setHover = (pointToHover: Coordinate) => {
    const pointFeature = new Feature(new Point(pointToHover));
    hoverSource.addFeature(pointFeature);
  };
  const geometry = getShapeGeometry();
  const coordinates = geometry?.getCoordinates()?.[ 0 ] ?? [];

  if (!isAddMode.value) {
    const shapePoint = coordinates.find((shapePoint) => isClosestShapePoint(shapePoint, clickedPoint));
    shapePoint != null && setHover(shapePoint);
    return;
  }

  for (let i = 0; i < coordinates.length - 1; i++) {
    const startIdx = i;
    const endIdx = i + 1;
    if (endIdx === coordinates.length - 1) {
      break;
    }

    const point = closestOnSegment(clickedPoint, [ coordinates[ startIdx ], coordinates[ endIdx ] ]);
    if (point != null && isClosestShapePoint(point, clickedPoint)) {
      setHover(point);
      return;
    }
  }
};

const selectPoint = (clickedPoint: number[]) => {
  hoverSource.clear();
  const geometry = getShapeGeometry();
  const coordinates = geometry?.getCoordinates()?.[ 0 ] ?? [];
  const shapePoint = coordinates.find((shapePoint) => isClosestShapePoint(shapePoint, clickedPoint));
  if (!shapePoint) {
    return console.log('Point is not from the shape');
  }

  const [ lon, lat ] = toLonLat(shapePoint);
  setPointSelected(lon, lat);
  longitudeInput.value = lon.toString();
  latitudeInput.value = lat.toString();
};

const setPointSelected = (lon: number, lat: number) => {
  selectedPoint.value = { lon, lat };

  if (selectedFeature.value) {
    selectSource.removeFeature(selectedFeature.value as Feature<Point>);
  }

  const newPointCoordinates = fromLonLat([ lon, lat ]);
  const pointFeature = new Feature(new Point(newPointCoordinates));
  selectSource.addFeature(pointFeature);
  selectedFeature.value = pointFeature;
};

const deletePoint = () => {
  if (selectedPoint.value == null) {
    return console.log('No selected point');
  }

  const geometry = getShapeGeometry();
  const coordinates = geometry?.getCoordinates()?.[ 0 ];
  if (!coordinates || coordinates.length <= 3) {
    return console.log('Not enough points. A geometry needs at least 3 points to be a shape.');
  }

  const [ selectedPointLon, selectedPointLat ] = fromLonLat([ selectedPoint.value.lon, selectedPoint.value.lat ]);
  const updatedCoordinates = coordinates.filter(([ lon, lat ]) => lon !== selectedPointLon && lat !== selectedPointLat);
  geometry.setCoordinates([ updatedCoordinates ]);

  if (selectedFeature.value) {
    selectSource.removeFeature(selectedFeature.value as Feature<Point>);
  }
  selectedPoint.value = null;
  selectedFeature.value = null;
  longitudeInput.value = '';
  latitudeInput.value = '';
};

const movePoint = (newLon: number, newLat: number) => {
  if (isNaN(newLon) || isNaN(newLat)) {
    return;
  }

  if (selectedPoint.value == null) {
    return console.log('No selected point');
  }

  const geometry = getShapeGeometry();
  const coordinates = geometry?.getCoordinates()?.[ 0 ] ?? [];
  if (!coordinates.length) {
    return console.log('No coordinates available');
  }

  const [ selectedPointLon, selectedPointLat ] = fromLonLat([ selectedPoint.value.lon, selectedPoint.value.lat ]);
  geometry?.setCoordinates([ coordinates.map(([ lon, lat ]) => {
    if (lon === selectedPointLon && lat === selectedPointLat) {
      return fromLonLat([ newLon, newLat ]);
    }

    return [ lon, lat ];
  }) ]);

  setPointSelected(newLon, newLat);
};

const getQuestionValue = () => {
  // TODO: needs work to return proper values
  const geojsonFormat = new GeoJSON();
  const features = shapeDataSource.getFeatures();
  console.log('Exporting geometries:', features.length);
  return geojsonFormat.writeFeatures(features, {
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857',
  });
};

defineExpose({
  getQuestionValue,
});
</script>

<template>
  <div class="map-block-component">
    <div
        ref="mapContainer"
        class="map-container"
        :data-data="JSON.stringify(data)"
    />

    <div class="tool-bar">
      <button :class="{'active-btn': isAddMode}" @click="() => isAddMode=true"><img :src="addPointImg" alt="Add Points"/></button>
      <button :class="{'active-btn': !isAddMode}" @click="() => isAddMode=false"><img :src="editPointImg" alt="Edit Points"/></button>
      <button @click="deletePoint"><img :src="deletePointImg" alt="Delete Point"/></button>
    </div>

    <div class="inputs-container">
      <div class="box">
        <label for="accuracy">Accuracy</label>
        <input id="accuracy" type="text" disabled/>
      </div>
      <div class="box">
        <label for="latitude">Latitude</label>
        <input
            id="latitude"
            type="text"
            v-model="latitudeInput"
            :disabled="!selectedPoint"
            @change="() => movePoint(Number(longitudeInput), Number(latitudeInput))" />
      </div>
      <div class="box">
        <label for="altitude">Altitude</label>
        <input id="altitude" type="text" disabled/>
      </div>
      <div class="box">
        <label for="longitude">Longitude</label>
        <input
            id="longitude"
            type="text"
            v-model="longitudeInput"
            :disabled="!selectedPoint"
            @change="() => movePoint(Number(longitudeInput), Number(latitudeInput))" />
      </div>
    </div>
  </div>
</template>

<style>
.map-block-component {
  position: relative;
}

.map-container {
  width: 100%;
  height: 400px;
}

.inputs-container {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin: 1rem auto;
}

.inputs-container .box {
  display: flex;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  overflow: hidden;
  background-color: #f9fafb;
  flex: 1 1 calc(50% - 1rem);
  height: 48px;
  min-width: 250px;
}

.inputs-container label {
  background-color: #e5e7eb;
  padding: 0.75rem 1rem;
  color: #374151;
  font-weight: 500;
  display: flex;
  align-items: center;
  border-right: 1px solid #d1d5db;
  white-space: nowrap;
}

.inputs-container input {
  border: none;
  padding: 0.75rem 1rem;
  font-size: 1rem;
  width: 100%;
  color: #374151;
  background-color: #fff;
}

.inputs-container input:disabled {
  background-color: #f9fafb;
}

.inputs-container input:focus-visible {
  outline: none;
}

.tool-bar {
  position: absolute;
  z-index: 10;
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  justify-content: flex-start;
  align-items: center;
  background: #fff;
  border-radius: 6px;
  padding: 10px;
  gap: 10px;
  box-shadow: rgba(0, 0, 0, 0.3) 0px 0px 10px;
  top: 329px;
  left: 18px;
}

.tool-bar button {
  vertical-align: middle;
}

.tool-bar button,
.tool-bar button:hover,
.tool-bar button:focus,
.tool-bar button:active {
  border: none;
  background: transparent;
  outline: none;
  cursor: pointer;
  height: 38px;
  width: 38px;
}

.tool-bar button.active-btn {
  background: rgba(233, 248, 255, 1);
}

.tool-bar button:active {
  background: #f1f3f6;
}

/** override map ol **/
.ol-rotate,
.ol-attribution,
.ol-attribution button {
  display: none;
}

.ol-zoom {
  position: absolute;
  right: 18px;
  top: 302px;
  display: flex;
  flex-direction: column;
  flex-wrap: nowrap;
  align-items: center;
  box-shadow: rgba(0, 0, 0, 0.3) 0px 0px 10px;
}

.ol-zoom button,
.ol-zoom button:hover,
.ol-zoom button:focus,
.ol-zoom button:active {
  height: 38px;
  width: 38px;
  border-radius: 6px;
  border: none;
  background: #fff;
  font-size: 24px;
  font-weight: 300;
  cursor: pointer;
}

.ol-zoom button:active {
  background: #f1f3f6;
}

.ol-zoom button:first-child {
  border-radius: 6px 6px 0 0;
}

.ol-zoom button:not(:first-child) {
  border-radius: 0 0 6px 6px;
  border-top: 1px solid #d1d5db;
}

</style>
