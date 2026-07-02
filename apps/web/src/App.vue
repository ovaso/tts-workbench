<template>
  <v-app>
    <v-app-bar color="surface" density="comfortable" elevation="0" border>
      <v-app-bar-nav-icon class="d-sm-none" icon="mdi-menu" @click="drawer = !drawer" />
      <v-app-bar-title>TTS Workbench</v-app-bar-title>
    </v-app-bar>

    <v-navigation-drawer v-model="drawer" :permanent="isPermanent" width="236">
      <v-list nav density="compact">
        <v-list-item
          v-for="item in navItems"
          :key="item.to"
          :prepend-icon="item.icon"
          :title="item.title"
          :to="item.to"
          rounded="lg"
        />
      </v-list>
    </v-navigation-drawer>

    <v-main>
      <router-view />
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useDisplay } from "vuetify";

const display = useDisplay();
const drawer = ref(true);
const isPermanent = display.smAndUp;

const navItems = [
  {
    title: "Synthesize",
    icon: "mdi-waveform",
    to: "/synthesize"
  },
  {
    title: "Providers",
    icon: "mdi-server",
    to: "/providers"
  },
  {
    title: "Runs",
    icon: "mdi-history",
    to: "/runs"
  }
];
</script>
