import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { initLocale } from './composables/useI18n';
import { router } from './router';
import './styles/tokens.css';
import './styles/base.css';

initLocale();

createApp(App).use(createPinia()).use(router).mount('#app');
