<template>
  <v-app>
    <v-app-bar color="surface" density="comfortable" elevation="0" border>
      <v-app-bar-nav-icon class="d-lg-none" icon="mdi-menu" @click="drawer = !drawer" />
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

    <v-main class="app-main">
      <router-view />
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useDisplay } from "vuetify";
import { appNavItems } from "./app-navigation";

const display = useDisplay();
const isPermanent = computed(() => display.lgAndUp.value);
const drawer = ref(isPermanent.value);

// watch isPermanent: 入参为当前断点是否大屏；功能是大屏固定展开，中小屏自动收起为临时抽屉。
watch(
  isPermanent,
  (nextIsPermanent) => {
    drawer.value = nextIsPermanent;
  },
  {
    immediate: true
  }
);

const navItems = appNavItems();
</script>

<style scoped>
.app-main {
  min-width: 0;
}
</style>
