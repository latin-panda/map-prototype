<script setup lang="ts">
import MapBlock from './components/MapBlock.vue';
import { ref } from 'vue';

const mapRef = ref(null);

const polygonForEdit = [
  {
    id: 'a30d657a-f828-4b84-8642-9185d92a94cf',
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [12.491687656, 41.890927296],
          [12.491101635, 41.890152859],
          [12.492450996, 41.88940696],
          [12.493542068, 41.89005839],
          [12.492947917, 41.890827649],
          [12.491687656, 41.890927296],
        ],
      ],
    },
    properties: { mode: 'polygon' },
  },
];

const getData = () => {
  if (!mapRef.value) {
    return;
  }

  // @ts-ignore
  const geometries = mapRef.value.getQuestionValue();
  console.log('Geometries:', JSON.stringify(geometries));
};
</script>

<template>
  <div class="container">
    <div class="form-card header">
      <h1 class="form-title">Geo Workshop</h1>
    </div>
    <div class="form-card">
      <div class="form-section">
        <label class="form-label">
          <span class="required-asterisk">*</span> What is your location?
        </label>
        <MapBlock ref="mapRef" :data="polygonForEdit" />
      </div>
    </div>
    <div class="form-card footer">
      <button class="form-button" @click="getData">Submit</button>
    </div>
  </div>
</template>

<style scoped>
.container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: #f1f5f9;
  padding: 16px;
  font-family: Arial, sans-serif;
}
.form-card {
  background-color: white;
  border-radius: 6px;
  width: 900px;
  padding: 20px;
  margin: 0 auto;
}
.form-card.header {
  margin-bottom: 15px;
}
.form-card.footer {
  background-color: transparent;
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
  padding-right: 0;
}
.form-title {
  font-size: 24px;
  font-weight: bold;
  color: #333;
  margin-bottom: 16px;
  text-align: center;
  overflow-wrap: break-word;
}
.form-section {
  margin-bottom: 20px;
}
.form-label {
  font-size: 18px;
  font-weight: 300;
  color: #333;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 20px;
  margin-top: 10px;
}
.required-asterisk {
  color: red;
  font-size: 16px;
}
.form-button {
  width: 100px;
  padding: 12px;
  background-color: #3e9fcc;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}
.form-button:hover {
  background-color: #3488af;
}
@media (max-width: 600px) {
  .form-card {
    padding: 16px;
    width: calc(100% - 32px);
  }
  .form-button {
    padding: 10px;
  }
}
</style>
