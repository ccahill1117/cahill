<script setup lang="ts">
import { useAudioPlayer, fmtTime } from '../composables/useAudioPlayer'

const {
  currentTrack,
  isPlaying,
  progress,
  currentTime,
  duration,
  volume,
  isLoading,
  toggle,
  next,
  prev,
  seek,
  setVolume,
} = useAudioPlayer()

function onProgressInput(e: Event) {
  seek(Number((e.target as HTMLInputElement).value) / 1000)
}

function onVolumeInput(e: Event) {
  setVolume(Number((e.target as HTMLInputElement).value) / 100)
}
</script>

<template>
  <footer class="player-bar" :class="{ active: !!currentTrack }">

    <!-- Left: artwork + track info -->
    <div class="track-info">
      <div class="artwork">
        <img v-if="currentTrack?.artwork" :src="currentTrack.artwork" alt="" />
        <div v-else class="artwork-placeholder">♪</div>
      </div>
      <div v-if="currentTrack" class="meta">
        <span class="track-title">{{ currentTrack.title }}</span>
        <span class="track-artist">{{ currentTrack.artist }}</span>
      </div>
      <div v-else class="meta empty">Nothing playing</div>
    </div>

    <!-- Center: controls + scrubber -->
    <div class="controls">
      <div class="buttons">
        <button class="ctrl-btn" :disabled="!currentTrack" @click="prev">⏮</button>
        <button class="ctrl-btn play-btn" :disabled="!currentTrack" @click="toggle">
          <span v-if="isLoading">⋯</span>
          <span v-else-if="isPlaying">⏸</span>
          <span v-else>▶</span>
        </button>
        <button class="ctrl-btn" :disabled="!currentTrack" @click="next">⏭</button>
      </div>

      <div class="scrubber">
        <span class="time">{{ fmtTime(currentTime) }}</span>
        <input
          type="range"
          class="progress-range"
          min="0"
          max="1000"
          :value="Math.round(progress * 1000)"
          :disabled="!currentTrack"
          @input="onProgressInput"
        />
        <span class="time">{{ fmtTime(duration) }}</span>
      </div>
    </div>

    <!-- Right: volume + player link -->
    <div class="extras">
      <span class="vol-icon">{{ volume > 0.5 ? '🔊' : volume > 0 ? '🔉' : '🔇' }}</span>
      <input
        type="range"
        class="volume-range"
        min="0"
        max="100"
        :value="Math.round(volume * 100)"
        @input="onVolumeInput"
      />
      <RouterLink to="/player" class="deck-link" title="Open Steam Deck player">🎮</RouterLink>
    </div>

  </footer>
</template>

<style scoped>
.player-bar {
  display: grid;
  grid-template-columns: 1fr 2fr 1fr;
  align-items: center;
  height: 90px;
  padding: 0 1.5rem;
  background: rgba(28, 28, 30, 0.92);
  backdrop-filter: blur(20px);
  border-top: 1px solid #2c2c2e;
  gap: 1rem;
}

/* ── Track info ── */
.track-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  overflow: hidden;
}

.artwork {
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  border-radius: 6px;
  overflow: hidden;
  background: #2c2c2e;
}
.artwork img { width: 100%; height: 100%; object-fit: cover; }
.artwork-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  color: #48484a;
}

.meta {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.meta.empty { color: #48484a; font-size: 0.85rem; }
.track-title {
  color: #fff;
  font-size: 0.88rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.track-artist {
  color: #8e8e93;
  font-size: 0.78rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Controls ── */
.controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
}

.buttons {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.ctrl-btn {
  background: none;
  border: none;
  color: #8e8e93;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 0.3rem 0.5rem;
  border-radius: 6px;
  transition: color 0.15s;
  line-height: 1;
}
.ctrl-btn:hover:not(:disabled) { color: #fff; }
.ctrl-btn:disabled { opacity: 0.3; cursor: default; }

.play-btn {
  background: #fc3c44;
  color: #fff;
  border-radius: 50%;
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  padding: 0;
}
.play-btn:hover:not(:disabled) { background: #ff5258; color: #fff; }
.play-btn:disabled { background: #48484a; }

.scrubber {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  max-width: 420px;
}

.time {
  color: #636366;
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  min-width: 2.8rem;
  text-align: center;
}

/* ── Range inputs ── */
input[type='range'] {
  -webkit-appearance: none;
  appearance: none;
  flex: 1;
  height: 3px;
  border-radius: 2px;
  background: #3a3a3c;
  outline: none;
  cursor: pointer;
}
input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  cursor: pointer;
}
input[type='range']:disabled { opacity: 0.3; cursor: default; }

.progress-range { accent-color: #fc3c44; }
.volume-range   { accent-color: #8e8e93; width: 80px; flex: none; }

/* ── Extras ── */
.extras {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  justify-content: flex-end;
}

.vol-icon { font-size: 0.9rem; cursor: default; }

.deck-link {
  font-size: 1.2rem;
  text-decoration: none;
  opacity: 0.6;
  transition: opacity 0.15s;
}
.deck-link:hover { opacity: 1; }
</style>
