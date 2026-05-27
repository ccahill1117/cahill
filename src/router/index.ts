import { createRouter, createWebHistory } from 'vue-router'
import MusicBrowserView from '../views/MusicBrowserView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: MusicBrowserView,
    },
    {
      path: '/player',
      name: 'player',
      component: () => import('../views/HomeView.vue'),
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('../views/AboutView.vue'),
    },
  ],
})

export default router
