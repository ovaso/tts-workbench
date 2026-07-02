import { createRouter, createWebHistory } from "vue-router";
import ProvidersPage from "../pages/ProvidersPage.vue";
import RunDetailPage from "../pages/RunDetailPage.vue";
import RunsPage from "../pages/RunsPage.vue";
import SynthesizePage from "../pages/SynthesizePage.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      redirect: "/synthesize"
    },
    {
      path: "/providers",
      name: "providers",
      component: ProvidersPage
    },
    {
      path: "/synthesize",
      name: "synthesize",
      component: SynthesizePage
    },
    {
      path: "/runs",
      name: "runs",
      component: RunsPage
    },
    {
      path: "/runs/:runId",
      name: "run-detail",
      component: RunDetailPage,
      props: true
    }
  ]
});
