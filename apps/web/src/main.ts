import "@mdi/font/css/materialdesignicons.css";
import "vuetify/styles";
import { createPinia } from "pinia";
import { createApp } from "vue";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import App from "./App.vue";
import { router } from "./router";
import "./styles.css";

const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: "workbench",
    themes: {
      workbench: {
        dark: false,
        colors: {
          background: "#f7f8fb",
          surface: "#ffffff",
          primary: "#2454a6",
          secondary: "#217c66",
          accent: "#9b4b36",
          error: "#b42318",
          info: "#315f72",
          success: "#287b4b",
          warning: "#a15c07"
        }
      }
    }
  }
});

createApp(App).use(createPinia()).use(router).use(vuetify).mount("#app");
