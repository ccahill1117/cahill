/**
 * useAudioPlayer — singleton Howler-backed audio player
 *
 * State lives at module level so it's shared across all components that
 * import this composable (play queue, current track, etc. survive navigation).
 */
import { ref } from 'vue'
import { Howl } from 'howler'

export interface Track {
  id: string
  title: string
  artist: string
  album: string
  src: string
  artwork?: string | null
  duration?: number
  genre?: string | null
  year?: number | null
}

// ─── Shared state ────────────────────────────────────────────────────────────

const currentTrack  = ref<Track | null>(null)
const isPlaying     = ref(false)
const progress      = ref(0)          // 0–1
const currentTime   = ref(0)          // seconds
const duration      = ref(0)          // seconds
const volume        = ref(0.8)
const queue         = ref<Track[]>([])
const currentIndex  = ref(-1)
const isLoading     = ref(false)

let howl: Howl | null = null
let ticker: ReturnType<typeof setInterval> | null = null

// ─── Internal helpers ────────────────────────────────────────────────────────

function clearHowl() {
  if (ticker) { clearInterval(ticker); ticker = null }
  if (howl)   { howl.stop(); howl.unload(); howl = null }
  isPlaying.value = false
  isLoading.value = false
}

function startTicker() {
  if (ticker) clearInterval(ticker)
  ticker = setInterval(() => {
    if (!howl || !isPlaying.value) return
    const t = howl.seek() as number
    const d = howl.duration() || 1
    currentTime.value = t
    progress.value    = t / d
  }, 250)
}

// ─── Public API ──────────────────────────────────────────────────────────────

function play(track: Track, newQueue?: Track[]) {
  clearHowl()

  if (newQueue) {
    queue.value        = newQueue
    currentIndex.value = newQueue.findIndex(t => t.id === track.id)
  }

  currentTrack.value = track
  progress.value     = 0
  currentTime.value  = 0
  duration.value     = 0
  isLoading.value    = true

  howl = new Howl({
    src:   [track.src],
    html5: true,
    volume: volume.value,

    onload() {
      duration.value  = howl?.duration() ?? 0
      isLoading.value = false
    },
    onplay() {
      isPlaying.value = true
      isLoading.value = false
      startTicker()
    },
    onpause()  { isPlaying.value = false },
    onstop()   { isPlaying.value = false },
    onend()    { isPlaying.value = false; next() },
    onloaderror(_, err) {
      console.error('[Howler] load error:', err)
      isLoading.value = false
    },
  })

  howl.play()
}

function pause()  { howl?.pause() }
function resume() { howl?.play()  }

function toggle() {
  if (!currentTrack.value) return
  isPlaying.value ? pause() : resume()
}

function seek(ratio: number) {
  if (!howl) return
  const t = ratio * (howl.duration() || 0)
  howl.seek(t)
  progress.value   = ratio
  currentTime.value = t
}

function setVolume(v: number) {
  volume.value = Math.max(0, Math.min(1, v))
  howl?.volume(volume.value)
}

function next() {
  if (!queue.value.length) return
  const idx = (currentIndex.value + 1) % queue.value.length
  currentIndex.value = idx
  play(queue.value[idx])
}

function prev() {
  if (!queue.value.length) return
  // If >3 s in, restart current track instead
  if (howl && (howl.seek() as number) > 3) { seek(0); return }
  const idx = (currentIndex.value - 1 + queue.value.length) % queue.value.length
  currentIndex.value = idx
  play(queue.value[idx])
}

/** Format seconds → m:ss */
export function fmtTime(s: number) {
  if (!s || isNaN(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

export function useAudioPlayer() {
  return {
    currentTrack,
    isPlaying,
    progress,
    currentTime,
    duration,
    volume,
    queue,
    currentIndex,
    isLoading,
    play,
    pause,
    resume,
    toggle,
    seek,
    setVolume,
    next,
    prev,
  }
}
