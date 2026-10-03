import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { initLocale } from './composables/useI18n';
import { router } from './router';
import { installCaptureListeners } from './mobile/capture';
import './styles/design-tokens.css';
import './styles/tokens.css';
import './styles/base.css';

initLocale();
// Before routing, so a share handed over during startup is not missed.
installCaptureListeners();

createApp(App).use(createPinia()).use(router).mount('#app');
