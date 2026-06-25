<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import PlayerBar from '../components/PlayerBar.vue'
import VideoPlayerModal, { type VideoItem } from '../components/VideoPlayerModal.vue'
import { useAudioPlayer, fmtTime, type Track } from '../composables/useAudioPlayer'

const { play, currentTrack, isPlaying } = useAudioPlayer()

// ─── Library ─────────────────────────────────────────────────────────────────

interface VideoEntry extends VideoItem {
  type?: string
  year?: number | null
  duration?: number
}

const music  = ref<Track[]>([])
const videos = ref<VideoEntry[]>([])
const loading = ref(true)
const error   = ref<string | null>(null)

const LIBRARY_URL = `${import.meta.env.VITE_CDN_URL ?? 'https://cahill-media-library.s3.amazonaws.com'}/library.json`

onMounted(async () => {
  try {
    const res = await fetch(LIBRARY_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    music.value  = data.music  ?? []
    videos.value = data.videos ?? []
  } catch (e) {
    error.value = 'Could not load library'
    console.error(e)
  } finally {
    loading.value = false
  }
})

// ─── Navigation ──────────────────────────────────────────────────────────────

type Section = 'songs' | 'albums' | 'artists' | 'videos'
const activeSection = ref<Section>('songs')

// ─── Derived views ───────────────────────────────────────────────────────────

const albums = computed(() => {
  const map = new Map<string, { name: string; artist: string; artwork: string | null; tracks: Track[] }>()
  for (const t of music.value) {
    const key = `${t.album}__${t.artist}`
    if (!map.has(key)) map.set(key, { name: t.album, artist: t.artist, artwork: t.artwork ?? null, tracks: [] })
    map.get(key)!.tracks.push(t)
  }
  return [...map.values()]
})

const artists = computed(() => {
  const map = new Map<string, { name: string; artwork: string | null; tracks: Track[] }>()
  for (const t of music.value) {
    if (!map.has(t.artist)) map.set(t.artist, { name: t.artist, artwork: t.artwork ?? null, tracks: [] })
    map.get(t.artist)!.tracks.push(t)
  }
  return [...map.values()]
})

// ─── Playback ────────────────────────────────────────────────────────────────

function playTrack(track: Track) {
  play(track, music.value)
}

function playAlbum(tracks: Track[]) {
  if (tracks.length) play(tracks[0], tracks)
}

// ─── Video modal ─────────────────────────────────────────────────────────────

const activeVideo = ref<VideoEntry | null>(null)

// ─── Search ──────────────────────────────────────────────────────────────────

const query = ref('')

const filteredMusic = computed(() =>
  query.value
    ? music.value.filter(t =>
        [t.title, t.artist, t.album].some(s => s?.toLowerCase().includes(query.value.toLowerCase()))
      )
    : music.value
)

const filteredVideos = computed(() =>
  query.value
    ? videos.value.filter(v => v.title.toLowerCase().includes(query.value.toLowerCase()))
    : videos.value
)
</script>

<template>
  <div class="browser">

    <!-- ── Sidebar ─────────────────────────────────────────────────────── -->
    <aside class="sidebar">
      <div class="sidebar-logo">cahill<span class="dot">.</span></div>

      <nav>
        <p class="nav-heading">Library</p>
        <ul class="nav-list">
          <li
            v-for="item in [
              { id: 'songs',   label: 'Songs',   icon: '♪' },
              { id: 'albums',  label: 'Albums',  icon: '⬛' },
              { id: 'artists', label: 'Artists', icon: '👤' },
              { id: 'videos',  label: 'Videos',  icon: '▶' },
            ]"
            :key="item.id"
            class="nav-item"
            :class="{ active: activeSection === item.id }"
            @click="activeSection = item.id as Section"
          >
            <span class="nav-icon">{{ item.icon }}</span>
            {{ item.label }}
          </li>
        </ul>
      </nav>

      <div class="sidebar-footer">
        <RouterLink to="/player" class="deck-nav-btn">🎮 Steam Deck</RouterLink>
      </div>
    </aside>

    <!-- ── Main content ───────────────────────────────────────────────── -->
    <main class="content">

      <!-- Header bar -->
      <div class="content-header">
        <h1 class="section-title">
          {{ { songs: 'Songs', albums: 'Albums', artists: 'Artists', videos: 'Videos' }[activeSection] }}
        </h1>
        <input
          v-model="query"
          type="search"
          class="search-input"
          placeholder="Search…"
        />
      </div>

      <!-- Loading / error / empty states -->
      <div v-if="loading" class="state-msg">Loading library…</div>
      <div v-else-if="error" class="state-msg error">{{ error }}</div>

      <!-- ── Songs ── -->
      <template v-else-if="activeSection === 'songs'">
        <div v-if="!filteredMusic.length" class="state-msg">
          No tracks yet — drop MP3s in <code>public/media/music/</code> and run
          <code>node scripts/scan-library.mjs</code>
        </div>
        <table v-else class="song-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Title</th>
              <th>Artist</th>
              <th>Album</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(track, i) in filteredMusic"
              :key="track.id"
              class="song-row"
              :class="{ playing: currentTrack?.id === track.id }"
              @dblclick="playTrack(track)"
            >
              <td class="col-num">
                <span v-if="currentTrack?.id === track.id && isPlaying" class="playing-indicator">▶</span>
                <span v-else>{{ i + 1 }}</span>
              </td>
              <td class="col-title">
                <div class="title-cell">
                  <div class="thumb">
                    <img v-if="track.artwork" :src="track.artwork" alt="" />
                    <span v-else>♪</span>
                  </div>
                  {{ track.title }}
                </div>
              </td>
              <td class="col-secondary">{{ track.artist }}</td>
              <td class="col-secondary">{{ track.album }}</td>
              <td class="col-time">{{ fmtTime(track.duration ?? 0) }}</td>
            </tr>
          </tbody>
        </table>
      </template>

      <!-- ── Albums ── -->
      <template v-else-if="activeSection === 'albums'">
        <div v-if="!albums.length" class="state-msg">No albums yet.</div>
        <div v-else class="card-grid">
          <div
            v-for="album in albums"
            :key="`${album.name}__${album.artist}`"
            class="media-card"
            @click="playAlbum(album.tracks)"
          >
            <div class="card-art">
              <img v-if="album.artwork" :src="album.artwork" alt="" />
              <span v-else>💿</span>
            </div>
            <div class="card-title">{{ album.name }}</div>
            <div class="card-sub">{{ album.artist }}</div>
          </div>
        </div>
      </template>

      <!-- ── Artists ── -->
      <template v-else-if="activeSection === 'artists'">
        <div v-if="!artists.length" class="state-msg">No artists yet.</div>
        <div v-else class="card-grid">
          <div
            v-for="artist in artists"
            :key="artist.name"
            class="media-card"
            @click="playAlbum(artist.tracks)"
          >
            <div class="card-art round">
              <img v-if="artist.artwork" :src="artist.artwork" alt="" />
              <span v-else>👤</span>
            </div>
            <div class="card-title">{{ artist.name }}</div>
            <div class="card-sub">{{ artist.tracks.length }} tracks</div>
          </div>
        </div>
      </template>

      <!-- ── Videos ── -->
      <template v-else-if="activeSection === 'videos'">
        <div v-if="!filteredVideos.length" class="state-msg">
          No videos yet — drop files in <code>public/media/video/</code> and run
          <code>node scripts/scan-library.mjs</code>
        </div>
        <div v-else class="card-grid">
          <div
            v-for="video in filteredVideos"
            :key="video.id"
            class="media-card video-card"
            @click="activeVideo = video"
          >
            <div class="card-art video-thumb">
              <img v-if="video.thumbnail" :src="video.thumbnail" alt="" />
              <span v-else>🎬</span>
              <div class="play-overlay">▶</div>
            </div>
            <div class="card-title">{{ video.title }}</div>
            <div class="card-sub">{{ video.year ?? '' }}</div>
          </div>
        </div>
      </template>

    </main>

    <!-- ── Player bar ─────────────────────────────────────────────────── -->
    <PlayerBar />

    <!-- ── Video modal ────────────────────────────────────────────────── -->
    <VideoPlayerModal
      :video="activeVideo"
      @close="activeVideo = null"
    />

  </div>
</template>

<style scoped>
/* ── Layout ── */
.browser {
  display: grid;
  grid-template-columns: 220px 1fr;
  grid-template-rows: 1fr 90px;
  height: 100vh;
  overflow: hidden;
  background: #1c1c1e;
  color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif;
}

.sidebar   { grid-column: 1; grid-row: 1; }
.content   { grid-column: 2; grid-row: 1; }
/* PlayerBar spans full width on row 2 */
:deep(.player-bar) { grid-column: 1 / -1; grid-row: 2; }

/* ── Sidebar ── */
.sidebar {
  background: #161618;
  border-right: 1px solid #2c2c2e;
  display: flex;
  flex-direction: column;
  padding: 1.5rem 0;
  overflow-y: auto;
}

.sidebar-logo {
  font-size: 1.3rem;
  font-weight: 700;
  color: #fff;
  padding: 0 1.2rem 1.5rem;
  letter-spacing: -0.02em;
}
.dot { color: #fc3c44; }

.nav-heading {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #48484a;
  padding: 0 1.2rem 0.4rem;
}

.nav-list { list-style: none; padding: 0; margin: 0; }

.nav-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 1.2rem;
  color: #8e8e93;
  font-size: 0.9rem;
  cursor: pointer;
  border-radius: 6px;
  margin: 0 0.5rem;
  transition: background 0.1s, color 0.1s;
}
.nav-item:hover  { background: #2c2c2e; color: #fff; }
.nav-item.active { background: #2c2c2e; color: #fff; font-weight: 600; }
.nav-icon { font-size: 0.85rem; width: 1.2rem; text-align: center; }

.sidebar-footer {
  margin-top: auto;
  padding: 1rem 1.2rem 0;
}

.deck-nav-btn {
  display: block;
  text-align: center;
  padding: 0.55rem 1rem;
  background: #2c2c2e;
  color: #8e8e93;
  border-radius: 8px;
  font-size: 0.85rem;
  text-decoration: none;
  transition: background 0.15s, color 0.15s;
}
.deck-nav-btn:hover { background: #3a3a3c; color: #fff; }

/* ── Content ── */
.content {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.content-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem 2rem 1rem;
  position: sticky;
  top: 0;
  background: rgba(28, 28, 30, 0.92);
  backdrop-filter: blur(12px);
  z-index: 10;
  border-bottom: 1px solid #2c2c2e;
}

.section-title {
  font-size: 1.6rem;
  font-weight: 700;
  color: #fff;
}

.search-input {
  background: #2c2c2e;
  border: 1px solid #3a3a3c;
  border-radius: 8px;
  color: #fff;
  padding: 0.4rem 0.9rem;
  font-size: 0.85rem;
  outline: none;
  width: 200px;
  transition: border-color 0.15s;
}
.search-input::placeholder { color: #48484a; }
.search-input:focus { border-color: #636366; }

/* ── State messages ── */
.state-msg {
  padding: 3rem 2rem;
  color: #48484a;
  font-size: 0.95rem;
  line-height: 1.8;
}
.state-msg code {
  background: #2c2c2e;
  padding: 0.1em 0.4em;
  border-radius: 4px;
  font-family: monospace;
  color: #8e8e93;
}
.state-msg.error { color: #ff453a; }

/* ── Song table ── */
.song-table {
  width: 100%;
  border-collapse: collapse;
  padding: 0 1.5rem;
}

.song-table thead th {
  text-align: left;
  padding: 0.5rem 0.8rem;
  color: #48484a;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid #2c2c2e;
}

.song-row {
  cursor: pointer;
  transition: background 0.1s;
}
.song-row:hover { background: #2c2c2e; }
.song-row.playing { background: rgba(252, 60, 68, 0.08); }
.song-row.playing .col-title { color: #fc3c44; }

.song-row td {
  padding: 0.55rem 0.8rem;
  font-size: 0.88rem;
  border-bottom: 1px solid #1c1c1e;
}

.col-num { color: #636366; width: 2.5rem; text-align: center; font-size: 0.8rem; }
.col-secondary { color: #8e8e93; }
.col-time { color: #636366; text-align: right; font-variant-numeric: tabular-nums; }

.title-cell {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  color: #fff;
}

.thumb {
  width: 36px;
  height: 36px;
  border-radius: 4px;
  background: #2c2c2e;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: #48484a;
  font-size: 0.9rem;
}
.thumb img { width: 100%; height: 100%; object-fit: cover; }

.playing-indicator { color: #fc3c44; }

/* ── Card grid ── */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 1.2rem;
  padding: 1.5rem 2rem;
}

.media-card {
  cursor: pointer;
  transition: transform 0.15s;
}
.media-card:hover { transform: translateY(-2px); }
.media-card:hover .play-overlay { opacity: 1; }

.card-art {
  aspect-ratio: 1;
  border-radius: 8px;
  background: #2c2c2e;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.5rem;
  margin-bottom: 0.6rem;
  position: relative;
}
.card-art.round { border-radius: 50%; }
.card-art img   { width: 100%; height: 100%; object-fit: cover; }

.video-thumb .play-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  color: #fff;
  opacity: 0;
  transition: opacity 0.15s;
}

.card-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-sub {
  font-size: 0.78rem;
  color: #8e8e93;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
