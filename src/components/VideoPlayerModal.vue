<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import videojs from 'video.js'
import 'video.js/dist/video-js.css'

export interface VideoItem {
  id: string
  title: string
  src: string
  thumbnail?: string | null
  type?: string
  year?: number | null
  duration?: number
}

const props = defineProps<{ video: VideoItem | null }>()
const emit  = defineEmits<{ close: [] }>()

const videoEl = ref<HTMLVideoElement | null>(null)
let player: ReturnType<typeof videojs> | null = null

async function initPlayer() {
  await nextTick()
  if (!videoEl.value || !props.video) return

  player = videojs(videoEl.value, {
    controls:   true,
    autoplay:   true,
    fluid:      true,
    responsive: true,
    playbackRates: [0.5, 1, 1.25, 1.5, 2],
    sources: [{ src: props.video.src, type: detectType(props.video.src) }],
  })
}

function detectType(src: string) {
  if (src.includes('.m3u8')) return 'application/x-mpegURL'
  if (src.includes('.mp4'))  return 'video/mp4'
  if (src.includes('.webm')) return 'video/webm'
  if (src.includes('.mkv'))  return 'video/x-matroska'
  return 'video/mp4'
}

watch(() => props.video, async (v) => {
  if (!v) { player?.pause(); return }
  if (player) {
    player.src({ src: v.src, type: detectType(v.src) })
    player.play()
  } else {
    await initPlayer()
  }
})

onMounted(() => { if (props.video) initPlayer() })
onBeforeUnmount(() => { player?.dispose(); player = null })

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="video"
        class="video-overlay"
        @click.self="emit('close')"
        @keydown="onKeydown"
      >
        <div class="video-wrap">
          <div class="video-header">
            <span class="video-title">{{ video.title }}</span>
            <button class="close-btn" @click="emit('close')">✕</button>
          </div>
          <video ref="videoEl" class="video-js vjs-default-skin vjs-big-play-centered vjs-16-9" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.video-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.video-wrap {
  width: 100%;
  max-width: 960px;
  background: #1c1c1e;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 32px 80px rgba(0,0,0,0.7);
}

.video-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.9rem 1.2rem;
  border-bottom: 1px solid #2c2c2e;
}

.video-title {
  color: #fff;
  font-size: 0.95rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.close-btn {
  background: none;
  border: none;
  color: #8e8e93;
  font-size: 1rem;
  cursor: pointer;
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
  flex-shrink: 0;
  transition: color 0.15s;
}
.close-btn:hover { color: #fff; }

/* Transition */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* Video.js skin tweaks */
:deep(.video-js) { border-radius: 0; }
:deep(.vjs-control-bar) { background: rgba(0,0,0,0.7); }
</style>
