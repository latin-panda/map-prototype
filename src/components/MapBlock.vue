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
import { type Coordinate } from 'ol/coordinate';
import Point from 'ol/geom/Point';
import { MapService } from './MapService.ts';

const addPointImg = `${ import.meta.env.BASE_URL }images/add-points.svg`;
const editPointImg = `${ import.meta.env.BASE_URL }images/edit-points.svg`;
const deletePointImg = `${ import.meta.env.BASE_URL }images/delete-points.svg`;
const fullScreenImg = `${ import.meta.env.BASE_URL }images/full-screen.svg`;
const findMyLocationImg = `${ import.meta.env.BASE_URL }images/find-my-location.svg`;
const fitScreenImg = `${ import.meta.env.BASE_URL }images/fit-screen.svg`;
const undoImg = `${ import.meta.env.BASE_URL }images/undo.svg`;
const advancedImg = `${ import.meta.env.BASE_URL }images/advanced.svg`;
const pinImg = `${ import.meta.env.BASE_URL }images/pin.svg`;
const pasteImg = `${ import.meta.env.BASE_URL }images/paste.svg`;

const BORDER_SIZE = 4;
const PRIMARY_COLOR = '#3E9FCC';
const AREA_COLOR = 'rgba(62, 159, 204, 0.2)';
const SELECTED_COLOR = '#ffffff';

defineProps<{
  data: any[]; // Array of GeoJSON features (e.g., polygonForEdit)
}>();

const history = ref<Coordinate[][][]>([]);
const isEditMode = ref(false);
const isFullScreen = ref(false);
const showPointDataSection = ref(false);
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
    insertVertexCondition: () => isEditMode.value,
    style: new Style({
      image: new CircleStyle({ // Hides original hover point style.
        radius: 0,
        fill: new Fill({ color: 'rgba(0, 0, 0, 0)' }),
        stroke: new Stroke({ color: 'rgba(0, 0, 0, 0)', width: 0 }),
      }),
    }),
  });

  modify.on('modifystart', () => clearSelection());

  modify.on('modifyend', onModifyEnd);
  watchEditMode(modify);
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
      if (!newMap || shapeDataSource.getFeatures().length !== 0) {
        return;
      }

      try {
        const geojsonFormat = new GeoJSON();
        const features = geojsonFormat.readFeatures(
            { type: 'FeatureCollection', features: newMap.get('data') || [] },
            { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }
        );
        shapeDataSource.addFeatures(features);
        // @ts-ignore
        MapService.fitMap(newMap, shapeDataSource);
        pushHistoryState(MapService.getGeometryContext(shapeDataSource).coordinates);
      } catch (error) {
        console.error(error);
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
        fill: new Fill({ color: PRIMARY_COLOR }),
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

// @ts-ignore
const onModifyEnd = (event) => {
  try {
    pushHistoryState(MapService.getGeometryContext(shapeDataSource).coordinates);
    selectPoint(event.mapBrowserEvent.coordinate);
  } catch (error) {
    console.error(error);
  }
};

const watchEditMode = (modify: Modify) => {
  modify.setActive(isEditMode.value);
  watch(isEditMode, (newValue) => modify.setActive(newValue));
}

const hoverPoint = (clickedPoint: Coordinate) => {
  try {
    hoverSource.clear();

    if (!isEditMode.value) {
      const point = MapService.findPointInGeometry(clickedPoint, shapeDataSource);
      MapService.setHover(point, hoverSource);
      return;
    }

    const point = MapService.findPointInSegment(clickedPoint, shapeDataSource);
    MapService.setHover(point, hoverSource);
  } catch (error) {
    console.log(error);
  }
};

const selectPoint = (clickedPoint: Coordinate) => {
  try {
    hoverSource.clear();
    const shapePoint = MapService.findPointInGeometry(clickedPoint, shapeDataSource);
    if (!shapePoint) {
      return;
    }

    const [ lon, lat ] = toLonLat(shapePoint);
    setPointSelected(lon, lat);
    longitudeInput.value = lon.toString();
    latitudeInput.value = lat.toString();
  } catch (error) {
    console.error(error);
  }
};

const setPointSelected = (lon: number, lat: number) => {
  selectedPoint.value = { lon, lat };

  if (selectedFeature.value) {
    selectSource.removeFeature(selectedFeature.value as Feature<Point>);
  }

  const pointFeature = new Feature(new Point(fromLonLat([ lon, lat ])));
  selectSource.addFeature(pointFeature);
  selectedFeature.value = pointFeature;
};

const pushHistoryState = (coordinates: Coordinate[]) => {
  history.value.push([ coordinates.slice() ]);
};

const clearSelection = () => {
  if (selectedFeature.value) {
    selectSource.removeFeature(selectedFeature.value as Feature<Point>);
  }

  selectedPoint.value = null;
  selectedFeature.value = null;
  longitudeInput.value = '';
  latitudeInput.value = '';
  hoverSource.clear();
};

const deletePoint = () => {
  if (!isEditMode.value) {
    return;
  }

  if (selectedPoint.value == null) {
    return console.log('No selected point');
  }

  try {
    const point = [selectedPoint.value.lon, selectedPoint.value.lat];
    MapService.deletePoint(point, shapeDataSource);
    pushHistoryState(MapService.getGeometryContext(shapeDataSource).coordinates);
    clearSelection();
  } catch (error) {
    console.error(error);
  }
};

const movePoint = (newLon: number, newLat: number) => {
  if (isNaN(newLon) || isNaN(newLat) || !isEditMode.value) {
    return;
  }

  try {
    if (selectedPoint.value == null) {
      throw new Error('No selected point');
    }
    const point = [selectedPoint.value.lon, selectedPoint.value.lat];
    pushHistoryState(MapService.getGeometryContext(shapeDataSource).coordinates);
    MapService.movePoint(point, [ newLon, newLat ], shapeDataSource);
    setPointSelected(newLon, newLat);
  } catch (error) {
    console.error(error);
  }
};

const undo = () => {
  if (history.value.length <= 1) {
    alert('No more actions to undo');
    return;
  }

  try {
    // Remove the current state
    history.value.pop();
    const previousState = history.value[ history.value.length - 1 ];
    const geometry = MapService.getShapeGeometry(shapeDataSource);
    if (previousState) {
      geometry.setCoordinates(previousState);
    }

    clearSelection();
  } catch (error) {
    console.error(error);
  }
};

// @ts-ignore
const focusCurrentLocation = () => MapService.focusCurrentLocation(mapRef.value);
// @ts-ignore
const focusShapeLocation = () => MapService.focusShapeLocation(mapRef.value, shapeDataSource);

const getQuestionValue = () => {
  const geojsonFormat = new GeoJSON();
  const features = shapeDataSource.getFeatures();
  console.log('Exporting geometries:', features.length);

  // TODO: needs work to return proper values
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
  <div :class="{
          'map-block-component': true,
          'map-full-screen': isFullScreen,
        }">
    <div
        ref="mapContainer"
        class="map-container"
        :data-data="JSON.stringify(data)"
    />
    <div class="info-bar">
      <div class="info-location">
        <img v-if="latitudeInput.length || longitudeInput.length" style="margin-right: 10px" :src="pinImg" alt="Point data"/>
        <span v-if="latitudeInput.length">Latitude: {{ latitudeInput }}&nbsp;</span>
        <span v-if="longitudeInput.length">Longitude: {{ longitudeInput }}</span>
      </div>
      <button @click="showPointDataSection = !showPointDataSection">
        <img :src="advancedImg" alt="Advanced actions" style="margin-right: 10px;"/>
        <span>Advanced</span>
      </button>
    </div>

    <div class="side-bar">
      <button :class="{'active-btn': isFullScreen}" @click="() => isFullScreen=!isFullScreen">
        <img :src="fullScreenImg" style="width: 16px;" alt="Full-screen map"/>
      </button>
      <button @click="focusShapeLocation">
        <img :src="fitScreenImg" alt="Fit my screen"/>
      </button>
      <button @click="focusCurrentLocation">
        <img :src="findMyLocationImg" style="width: 20px;" alt="Find my location"/>
      </button>
    </div>

    <div class="tool-bar">
      <button :class="{'active-btn': !isEditMode}" @click="() => isEditMode=false">
        <img :src="editPointImg" alt="Edit Points"/>
      </button>
      <button :class="{'active-btn': isEditMode}" @click="() => isEditMode=true">
        <img :src="addPointImg" alt="Add Points"/>
      </button>
      <button @click="deletePoint"><img :src="deletePointImg" alt="Delete Point"/></button>
      <button @click="undo"><img :src="undoImg" alt="Undo change"/></button>
    </div>

    <div v-if="showPointDataSection" class="inputs-container">
      <div class="box">
        <label for="latitude">Latitude</label>
        <input
            id="latitude"
            type="text"
            v-model="latitudeInput"
            :disabled="!selectedPoint || !isEditMode"
            @change="() => movePoint(Number(longitudeInput), Number(latitudeInput))"/>
      </div>
      <div class="box">
        <label for="accuracy">Accuracy</label>
        <input id="accuracy" type="text" disabled/>
      </div>
      <div class="box">
        <label for="longitude">Longitude</label>
        <input
            id="longitude"
            type="text"
            v-model="longitudeInput"
            :disabled="!selectedPoint || !isEditMode"
            @change="() => movePoint(Number(longitudeInput), Number(latitudeInput))"/>
      </div>
      <div class="box">
        <label for="altitude">Altitude</label>
        <input id="altitude" type="text" disabled/>
      </div>

      <a style="text-decoration: none; cursor:pointer; font-size: 14px; color:#6B7280; margin-top:10px">
        <img style="margin-right: 10px" :src="pasteImg" alt="Paste data"/><strong>Paste location data</strong>
      </a>
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
  border-radius: 6px 6px 0 0;
  overflow: hidden;
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
  height: 36px;
  min-width: 250px;
}

.inputs-container label {
  background-color: #F3F4F6;
  padding: 0.75rem 1rem;
  color: #374151;
  font-weight: 500;
  font-size: 14px;
  min-width: 62px;
  display: flex;
  align-items: center;
  border-right: 1px solid #d1d5db;
  white-space: nowrap;
}

.inputs-container input {
  border: none;
  padding: 0.75rem 1rem;
  font-size: 14px;
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

  button {
    border-radius: 6px;
  }
}

.side-bar {
  position: absolute;
  right: 18px;
  top: 20px;
  display: flex;
  flex-direction: column;
  flex-wrap: nowrap;
  align-items: center;
  background: #fff;
  overflow: hidden;
  border-radius: 6px;
  box-shadow: rgba(0, 0, 0, 0.3) 0px 0px 10px;
}

.side-bar,
.tool-bar {
  button {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 38px;
    width: 38px;
    font-size: 24px;
    font-weight: 300;
    cursor: pointer;
  }

  button,
  button:hover,
  button:active,
  button:focus {
    border: none;
    background: #fff;
    outline: none;
  }

  button.active-btn {
    background: rgba(233, 248, 255, 1);
  }

  button:hover {
    background: #f1f3f6;
  }
}

.info-bar {
  height: fit-content;
  background: #F8FAFC;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  flex-wrap: wrap;
  border-radius: 0 0 6px 6px;
  padding: 15px 23px;
  font-size: 14px;

  .info-location {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    flex-grow: 2;
  }

  button {
    font-size: 14px;
    border-radius: 6px;
    border: 1px solid #64748B;
    padding: 10px 20px;
    background: #FFFFFF;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
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
  background: #fff;
  border-radius: 6px;
  overflow: hidden;

  button,
  button:hover,
  button:focus,
  button:active {
    height: 38px;
    width: 38px;
    border: none;
    background: #fff;
    font-size: 24px;
    font-weight: 300;
    cursor: pointer;
  }

  button:hover {
    background: #f1f3f6;
  }
}

.side-bar,
.ol-zoom {
  button {
    border-radius: unset;
  }

  button:not(:first-child) {
    border-top: 1px solid #d1d5db;
  }
}

.map-full-screen {
  .map-container {
    position: fixed;
    width: 100vw;
    height: 100vh;
    top: 0;
    left: 0;
  }

  .tool-bar,
  .side-bar,
  .ol-zoom {
    position: fixed;
  }

  .tool-bar,
  .ol-zoom {
    top: unset;
    bottom: 20px;
  }
}


@media (max-width: 600px) {
  .info-bar,
  .info-location {
    align-items: center;
    flex-direction: column;
    gap: 15px;
  }
}
</style>
