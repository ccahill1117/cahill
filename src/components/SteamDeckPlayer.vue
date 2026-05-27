<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const containerRef = ref<HTMLDivElement | null>(null)
const hoveredButton = ref<string | null>(null)

let renderer: THREE.WebGLRenderer
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let controls: OrbitControls
let animationId: number
let mouseDownPos = { x: 0, y: 0 }

const interactableMeshes: THREE.Mesh[] = []
const raycaster = new THREE.Raycaster()
const mouse = new THREE.Vector2()

// ─── Material helpers ───────────────────────────────────────────────────────

function mat(color: number, roughness = 0.7, metalness = 0.2) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness })
}

// ─── Geometry builders ──────────────────────────────────────────────────────

function addMesh(
  parent: THREE.Group | THREE.Scene,
  geo: THREE.BufferGeometry,
  material: THREE.MeshStandardMaterial,
  position: [number, number, number],
  rotation?: [number, number, number],
): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, material)
  mesh.position.set(...position)
  if (rotation) mesh.rotation.set(...rotation)
  mesh.castShadow = true
  parent.add(mesh)
  return mesh
}

// ─── Geometry builders ──────────────────────────────────────────────────────

function addButton(
  parent: THREE.Group,
  name: string,
  geo: THREE.BufferGeometry,
  material: THREE.MeshStandardMaterial,
  position: [number, number, number],
  rotation?: [number, number, number],
): THREE.Mesh {
  const mesh = addMesh(parent, geo, material, position, rotation)
  mesh.name = name
  interactableMeshes.push(mesh)
  return mesh
}

// ─── Steam Deck builder ─────────────────────────────────────────────────────

function buildSteamDeck(): THREE.Group {
  const g = new THREE.Group()

  const BODY_COLOR    = 0x3c3c54
  const GRIP_COLOR    = 0x2c2c40
  const BUTTON_COLOR  = 0x585870
  const STICK_COLOR   = 0x646480
  const PAD_COLOR     = 0x484860
  const SCREEN_COLOR  = 0x060612
  const TRIGGER_COLOR = 0x404058

  // ── Body ────────────────────────────────────────────────────────────────

  addMesh(g, new THREE.BoxGeometry(3.3, 1.15, 0.36), mat(BODY_COLOR), [0, 0.05, 0])
  addMesh(g, new THREE.BoxGeometry(0.58, 0.5, 0.42), mat(GRIP_COLOR), [-1.36, -0.52, 0])
  addMesh(g, new THREE.BoxGeometry(0.58, 0.5, 0.42), mat(GRIP_COLOR), [1.36, -0.52, 0])

  // ── Screen ──────────────────────────────────────────────────────────────

  addMesh(g, new THREE.BoxGeometry(1.26, 0.82, 0.02), mat(0x080810), [0, 0.12, 0.19])

  const screenMat = new THREE.MeshStandardMaterial({
    color: SCREEN_COLOR,
    emissive: new THREE.Color(0x0a1a3a),
    emissiveIntensity: 0.8,
    roughness: 0.1,
    metalness: 0,
  })
  addMesh(g, new THREE.BoxGeometry(1.14, 0.7, 0.01), screenMat, [0, 0.12, 0.205])

  // ── Shoulder buttons & triggers (top edge) ───────────────────────────────

  addButton(g, 'L1 Bumper',
    new THREE.BoxGeometry(0.48, 0.1, 0.16), mat(BUTTON_COLOR),
    [-1.05, 0.625, 0.05])

  addButton(g, 'R1 Bumper',
    new THREE.BoxGeometry(0.48, 0.1, 0.16), mat(BUTTON_COLOR),
    [1.05, 0.625, 0.05])

  addButton(g, 'L2 Trigger',
    new THREE.BoxGeometry(0.48, 0.14, 0.28), mat(TRIGGER_COLOR),
    [-1.05, 0.72, -0.06])

  addButton(g, 'R2 Trigger',
    new THREE.BoxGeometry(0.48, 0.14, 0.28), mat(TRIGGER_COLOR),
    [1.05, 0.72, -0.06])

  // ── Left side controls ───────────────────────────────────────────────────

  // Left thumbstick — upper left
  addMesh(g, new THREE.CylinderGeometry(0.135, 0.135, 0.06, 24), mat(STICK_COLOR),
    [-1.25, 0.32, 0.21], [Math.PI / 2, 0, 0])
  addButton(g, 'Left Thumbstick',
    new THREE.CylinderGeometry(0.105, 0.105, 0.055, 24), mat(0x787898),
    [-1.25, 0.32, 0.25], [Math.PI / 2, 0, 0])

  // Left trackpad — center left
  addButton(g, 'Left Trackpad',
    new THREE.CylinderGeometry(0.175, 0.175, 0.03, 32), mat(PAD_COLOR),
    [-0.95, 0.0, 0.205], [Math.PI / 2, 0, 0])

  // D-pad cross base (non-interactable visual)
  addMesh(g, new THREE.BoxGeometry(0.33, 0.11, 0.04), mat(BUTTON_COLOR), [-1.2, -0.32, 0.21])
  addMesh(g, new THREE.BoxGeometry(0.11, 0.33, 0.04), mat(BUTTON_COLOR), [-1.2, -0.32, 0.21])

  // D-pad hit targets
  for (const [name, dx, dy] of [
    ['D-Pad Up',    0,      0.12],
    ['D-Pad Down',  0,     -0.12],
    ['D-Pad Left', -0.12,   0   ],
    ['D-Pad Right', 0.12,   0   ],
  ] as [string, number, number][]) {
    addButton(g, name,
      new THREE.BoxGeometry(0.1, 0.1, 0.05), mat(0x484864),
      [-1.2 + dx, -0.32 + dy, 0.225])
  }

  // ── Right side controls ──────────────────────────────────────────────────

  // ABXY — Xbox layout: Y top, X left, B right, A bottom
  for (const [name, dx, dy, color] of [
    ['Y Button',  0,      0.13, 0x7a7a20],
    ['X Button', -0.13,   0,    0x20387a],
    ['B Button',  0.13,   0,    0x7a2020],
    ['A Button',  0,     -0.13, 0x207a30],
  ] as [string, number, number, number][]) {
    addButton(g, name,
      new THREE.CylinderGeometry(0.068, 0.068, 0.055, 20), mat(color, 0.4, 0.3),
      [1.15 + dx, 0.25 + dy, 0.21], [Math.PI / 2, 0, 0])
  }

  // Right trackpad — center right
  addButton(g, 'Right Trackpad',
    new THREE.CylinderGeometry(0.175, 0.175, 0.03, 32), mat(PAD_COLOR),
    [0.85, -0.04, 0.205], [Math.PI / 2, 0, 0])

  // Right thumbstick — lower right
  addMesh(g, new THREE.CylinderGeometry(0.135, 0.135, 0.06, 24), mat(STICK_COLOR),
    [1.12, -0.33, 0.21], [Math.PI / 2, 0, 0])
  addButton(g, 'Right Thumbstick',
    new THREE.CylinderGeometry(0.105, 0.105, 0.055, 24), mat(0x787898),
    [1.12, -0.33, 0.25], [Math.PI / 2, 0, 0])

  return g
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

onMounted(() => {
  if (!containerRef.value) return
  const container = containerRef.value
  const w = container.clientWidth
  const h = container.clientHeight

  // Scene & fog
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0a0a14)
  scene.fog = new THREE.FogExp2(0x0a0a14, 0.08)

  // Camera
  camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100)
  camera.position.set(0, 0.8, 5.5)

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(w, h)
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  container.appendChild(renderer.domElement)

  // Orbit controls
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.06
  controls.minDistance = 3
  controls.maxDistance = 12
  controls.target.set(0, 0, 0)

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.9))

  const key = new THREE.DirectionalLight(0xffffff, 2.2)
  key.position.set(3, 6, 6)
  key.castShadow = true
  scene.add(key)

  const fill = new THREE.DirectionalLight(0x8899ff, 0.7)
  fill.position.set(-4, -2, 3)
  scene.add(fill)

  const rim = new THREE.DirectionalLight(0xffffff, 0.5)
  rim.position.set(0, -4, -4)
  scene.add(rim)

  // Build the model
  const deck = buildSteamDeck()
  scene.add(deck)

  // Render loop
  const animate = () => {
    animationId = requestAnimationFrame(animate)
    controls.update()
    renderer.render(scene, camera)
  }
  animate()

  // Events
  window.addEventListener('resize', onResize)
  renderer.domElement.addEventListener('mousedown', onMouseDown)
  renderer.domElement.addEventListener('mouseup', onMouseUp)
  renderer.domElement.addEventListener('mousemove', onMouseMove)
})

onUnmounted(() => {
  cancelAnimationFrame(animationId)
  window.removeEventListener('resize', onResize)
  renderer?.dispose()
})

// ─── Event handlers ──────────────────────────────────────────────────────────

function onResize() {
  if (!containerRef.value) return
  const w = containerRef.value.clientWidth
  const h = containerRef.value.clientHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
}

function onMouseDown(e: MouseEvent) {
  mouseDownPos = { x: e.clientX, y: e.clientY }
}

function onMouseUp(e: MouseEvent) {
  // Ignore drags — only fire on clean clicks
  if (Math.abs(e.clientX - mouseDownPos.x) > 5 || Math.abs(e.clientY - mouseDownPos.y) > 5) return

  const rect = containerRef.value!.getBoundingClientRect()
  mouse.set(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  )

  raycaster.setFromCamera(mouse, camera)
  const hits = raycaster.intersectObjects(interactableMeshes)
  if (hits.length > 0) {
    console.log('hi ' + hits[0].object.name)
  }
}

function onMouseMove(e: MouseEvent) {
  const rect = containerRef.value!.getBoundingClientRect()
  mouse.set(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  )

  raycaster.setFromCamera(mouse, camera)
  const hits = raycaster.intersectObjects(interactableMeshes)

  if (hits.length > 0) {
    renderer.domElement.style.cursor = 'pointer'
    hoveredButton.value = hits[0].object.name
  } else {
    renderer.domElement.style.cursor = 'grab'
    hoveredButton.value = null
  }
}
</script>

<template>
  <div class="viewer-wrapper">
    <div ref="containerRef" class="canvas-container" />
    <div v-if="hoveredButton" class="button-tooltip">
      {{ hoveredButton }}
    </div>
    <div class="instructions">Drag to rotate · Scroll to zoom</div>
  </div>
</template>

<style scoped>
.viewer-wrapper {
  position: relative;
  width: 100%;
  height: 100vh;
  background: #0a0a14;
  overflow: hidden;
}

.canvas-container {
  width: 100%;
  height: 100%;
}

.canvas-container :deep(canvas) {
  cursor: grab;
  display: block;
}

.button-tooltip {
  position: absolute;
  bottom: 56px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #d0d0ff;
  font-family: monospace;
  font-size: 13px;
  letter-spacing: 0.05em;
  padding: 6px 14px;
  border-radius: 999px;
  pointer-events: none;
  white-space: nowrap;
}

.instructions {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  color: rgba(255, 255, 255, 0.25);
  font-family: monospace;
  font-size: 12px;
  letter-spacing: 0.08em;
  pointer-events: none;
  white-space: nowrap;
}
</style>
