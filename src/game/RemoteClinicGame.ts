import * as THREE from 'three'
import { blockDefinitions, buildableBlocks, materialForBlock, type BlockId } from './blocks'
import type { GameState } from '../sim/types'

export type InteractionKind =
  | 'computer'
  | 'patient'
  | 'server'
  | 'generator'
  | 'cabinet'
  | 'research'
  | 'network'
  | 'vehicle'
  | 'none'

export interface InteractionTarget {
  kind: InteractionKind
  label: string
  id?: string
}

interface GameCallbacks {
  onTargetChange: (target: InteractionTarget | null) => void
  onInteract: (target: InteractionTarget) => void
  onBlockChange: (message: string) => void
}

interface VoxelRecord {
  id: BlockId
  mesh: THREE.Mesh
  buildable: boolean
}

const blockGeometry = new THREE.BoxGeometry(1, 1, 1)
const playerHeight = 1.72
const moveSpeed = 6.8

export class RemoteClinicGame {
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 300)
  private renderer: THREE.WebGLRenderer
  private clock = new THREE.Clock()
  private callbacks: GameCallbacks
  private container: HTMLElement
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2(0, 0)
  private keys = new Set<string>()
  private voxels = new Map<string, VoxelRecord>()
  private interactables: THREE.Object3D[] = []
  private npcs: THREE.Group[] = []
  private currentTarget: InteractionTarget | null = null
  private selectedBlockIndex = 0
  private yaw = -Math.PI / 2
  private pitch = 0
  private velocityY = 0
  private grounded = true
  private running = true
  private animationId = 0
  private gameState: GameState

  constructor(container: HTMLElement, state: GameState, callbacks: GameCallbacks) {
    this.container = container
    this.callbacks = callbacks
    this.gameState = state
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.setClearColor(0xbcd5df)
    this.container.appendChild(this.renderer.domElement)

    this.setupScene()
    this.setupEvents()
    this.resize()
    this.loop()
  }

  dispose() {
    this.running = false
    cancelAnimationFrame(this.animationId)
    window.removeEventListener('resize', this.resize)
    window.removeEventListener('keydown', this.keyDown)
    window.removeEventListener('keyup', this.keyUp)
    document.removeEventListener('mousemove', this.mouseMove)
    this.renderer.domElement.removeEventListener('click', this.canvasClick)
    this.renderer.domElement.removeEventListener('contextmenu', this.contextMenu)
    this.renderer.domElement.removeEventListener('mousedown', this.mouseDown)
    this.renderer.dispose()
    this.container.innerHTML = ''
  }

  updateState(state: GameState) {
    this.gameState = state
    this.scene.fog = new THREE.Fog(this.fogColorForWeather(state.weather), 38, state.weather === 'SEVERE_STORM' ? 96 : 140)
    this.renderer.setClearColor(this.fogColorForWeather(state.weather))
    for (const npc of this.npcs) {
      npc.visible = Number(npc.userData.queueIndex ?? 0) < Math.min(12, state.patients.length)
    }
    for (const object of this.interactables) {
      if (object.userData.kind === 'network') {
        const mesh = object as THREE.Mesh
        const material = mesh.material as THREE.MeshStandardMaterial
        material.emissive = new THREE.Color(state.connectivity === 'OFFLINE' ? 0x7d1f1f : 0x1b6f6d)
        material.emissiveIntensity = state.connectivity === 'OFFLINE' ? 0.9 : 0.45
      }
      if (object.userData.kind === 'server') {
        const mesh = object as THREE.Mesh
        const material = mesh.material as THREE.MeshStandardMaterial
        material.emissiveIntensity = state.ai.enabled ? 0.55 : 0.08
      }
    }
  }

  selectedBlock(): BlockId {
    return buildableBlocks[this.selectedBlockIndex]
  }

  private setupScene() {
    this.scene.background = new THREE.Color(0xbcd5df)
    this.scene.fog = new THREE.Fog(0xbcd5df, 40, 140)
    this.camera.position.set(-10, playerHeight, 19)
    this.camera.rotation.order = 'YXZ'

    const hemi = new THREE.HemisphereLight(0xe9f4f7, 0x354a3d, 1.8)
    this.scene.add(hemi)

    const sun = new THREE.DirectionalLight(0xfff1c7, 2.1)
    sun.position.set(24, 42, 18)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 120
    sun.shadow.camera.left = -62
    sun.shadow.camera.right = 62
    sun.shadow.camera.top = 62
    sun.shadow.camera.bottom = -62
    this.scene.add(sun)

    this.createTerrain()
    this.createCommunity()
    this.createClinic()
    this.createInfrastructure()
    this.createPatients()
    this.createSkyMarkers()
    this.updateCameraRotation()
  }

  private createTerrain() {
    for (let x = -34; x <= 34; x += 1) {
      for (let z = -34; z <= 34; z += 1) {
        const distance = Math.hypot(x + 8, z - 8)
        const ridge = Math.sin((x + this.seedOffset()) * 0.18) + Math.cos((z - this.seedOffset()) * 0.14)
        let id: BlockId = 'grass'
        let y = -0.5

        if (z < -22 || x > 25) id = 'snow'
        if (distance < 6) id = 'water'
        if (x > 14 && z > 16) id = 'stone'
        if (x < -23 && z > 18) id = 'ice'
        if (Math.abs(x) < 2 || Math.abs(z - 10) < 2) id = 'road'
        if (id === 'stone') y += Math.max(0, ridge) * 0.35

        this.addVoxel(id, x, y, z, false)
      }
    }

    for (let index = 0; index < 52; index += 1) {
      const angle = index * 1.91
      const radius = 16 + (index % 9) * 1.9
      const x = Math.round(Math.cos(angle) * radius - 6)
      const z = Math.round(Math.sin(angle) * radius + 6)
      if (Math.abs(x) < 8 && Math.abs(z) < 10) continue
      this.createTree(x, z)
    }
  }

  private createCommunity() {
    const buildings = [
      { x: -22, z: 14, w: 5, d: 5, id: 'wood' as BlockId },
      { x: -26, z: 4, w: 5, d: 4, id: 'wood' as BlockId },
      { x: 18, z: 8, w: 8, d: 5, id: 'concrete' as BlockId },
      { x: 24, z: -10, w: 10, d: 4, id: 'metal' as BlockId },
      { x: -18, z: -18, w: 7, d: 5, id: 'concrete' as BlockId },
    ]
    for (const building of buildings) {
      this.createSimpleBuilding(building.x, building.z, building.w, building.d, building.id)
    }
  }

  private createClinic() {
    this.createFloor(-8, -6, 18, 16, 'floor')

    for (let x = -8; x <= 9; x += 1) {
      this.addVoxel('wall', x, 0.5, -6, true)
      this.addVoxel('wall', x, 0.5, 9, true)
      this.addVoxel('roof', x, 3.5, -6, true)
      this.addVoxel('roof', x, 3.5, 9, true)
    }
    for (let z = -6; z <= 9; z += 1) {
      this.addVoxel('wall', -8, 0.5, z, true)
      this.addVoxel('wall', 9, 0.5, z, true)
      this.addVoxel('roof', -8, 3.5, z, true)
      this.addVoxel('roof', 9, 3.5, z, true)
    }

    for (let x = -7; x <= 8; x += 1) {
      for (let z = -5; z <= 8; z += 1) {
        if ((x + z) % 5 === 0) this.addVoxel('roof', x, 3.5, z, true)
      }
    }

    for (const z of [-1, 4]) {
      for (let x = -7; x <= 8; x += 1) {
        if (x !== -1 && x !== 4) this.addVoxel('wall', x, 0.5, z, true)
      }
    }
    for (const x of [-2, 3]) {
      for (let z = -5; z <= 8; z += 1) {
        if (z !== -3 && z !== 6) this.addVoxel('wall', x, 0.5, z, true)
      }
    }

    this.addInteractiveBlock('computer', -6.5, 0.8, -4.5, { kind: 'computer', label: 'Clinic computer: Health information system' })
    this.addInteractiveBlock('cabinet', -5.5, 0.8, 6.5, { kind: 'cabinet', label: 'Medical cabinet: supplies and pharmacy' })
    this.addInteractiveBlock('lab', 6.5, 0.8, 6.5, { kind: 'cabinet', label: 'Lab bench: diagnostics inventory' })
    this.addInteractiveBlock('exam', -4.5, 0.75, 2.2, { kind: 'patient', label: 'Exam room patient record', id: this.gameState.patients[1]?.id })
    this.addInteractiveBlock('bed', 5.7, 0.75, 2.2, { kind: 'patient', label: 'Exam room patient record', id: this.gameState.patients[2]?.id })
    this.addInteractiveBlock('server', 6.5, 0.9, -4.7, { kind: 'server', label: 'Local AI server: evidence and failures' })
    this.addInteractiveBlock('computer', 1, 0.8, 7.2, { kind: 'research', label: 'Research console: experiments and replay' })
    this.addInteractiveBlock('generator', 10.8, 0.8, -5.5, { kind: 'generator', label: 'Generator: power management' })
  }

  private createInfrastructure() {
    this.addInteractiveBlock('network', 14, 0.5, -12, { kind: 'network', label: 'Network tower: connectivity state' }, 1, 7, 1)
    this.addInteractiveBlock('solar', 12, 0.35, -1, { kind: 'generator', label: 'Solar array: power input' }, 4, 0.25, 2)
    this.addInteractiveBlock('battery', 12, 0.7, 2.2, { kind: 'generator', label: 'Battery bank: power reserve' }, 2, 1, 1.2)
    this.addInteractiveBlock('metal', -2, 0.35, -24, { kind: 'vehicle', label: 'Clinic vehicle: transportation route' }, 3, 0.7, 2)
  }

  private createPatients() {
    const positions = [
      [-5.4, -0.2],
      [-4.2, -0.2],
      [-6.8, 1.2],
      [-5.2, 1.3],
      [-3.8, 1.3],
      [-6.9, 2.6],
      [-5.2, 2.7],
      [-3.7, 2.6],
    ]

    positions.forEach(([x, z], index) => {
      const patient = this.gameState.patients[index]
      const group = new THREE.Group()
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.82, 0.28),
        new THREE.MeshStandardMaterial({ color: index % 2 === 0 ? 0x546f83 : 0x8c6758, roughness: 0.9 }),
      )
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.34, 0.34),
        new THREE.MeshStandardMaterial({ color: 0xc39872, roughness: 0.9 }),
      )
      body.position.y = 0.55
      head.position.y = 1.15
      group.add(body, head)
      group.position.set(x, 0.03, z)
      group.userData = { kind: 'patient', label: `Patient ${patient?.id ?? ''}: ${patient?.name ?? 'Synthetic patient'}`, id: patient?.id, queueIndex: index }
      this.scene.add(group)
      this.interactables.push(group)
      this.npcs.push(group)
    })
  }

  private createSkyMarkers() {
    const ringGeometry = new THREE.TorusGeometry(1.4, 0.04, 8, 48)
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xf2d77a, transparent: true, opacity: 0.45 })
    const ring = new THREE.Mesh(ringGeometry, ringMaterial)
    ring.position.set(1, 4.3, 7.2)
    ring.rotation.x = Math.PI / 2
    this.scene.add(ring)
  }

  private createFloor(x0: number, z0: number, width: number, depth: number, id: BlockId) {
    for (let x = x0; x < x0 + width; x += 1) {
      for (let z = z0; z < z0 + depth; z += 1) {
        this.addVoxel(id, x, 0, z, true)
      }
    }
  }

  private createSimpleBuilding(x0: number, z0: number, width: number, depth: number, id: BlockId) {
    this.createFloor(x0, z0, width, depth, 'concrete')
    for (let x = x0; x < x0 + width; x += 1) {
      this.addVoxel(id, x, 0.5, z0, true)
      this.addVoxel(id, x, 0.5, z0 + depth - 1, true)
      this.addVoxel('roof', x, 2.5, z0, true)
      this.addVoxel('roof', x, 2.5, z0 + depth - 1, true)
    }
    for (let z = z0; z < z0 + depth; z += 1) {
      this.addVoxel(id, x0, 0.5, z, true)
      this.addVoxel(id, x0 + width - 1, 0.5, z, true)
      this.addVoxel('roof', x0, 2.5, z, true)
      this.addVoxel('roof', x0 + width - 1, 2.5, z, true)
    }
  }

  private createTree(x: number, z: number) {
    this.addVoxel('wood', x, 0.5, z, true)
    this.addVoxel('grass', x, 1.5, z, true)
    this.addVoxel('grass', x + 1, 1.5, z, true)
    this.addVoxel('grass', x - 1, 1.5, z, true)
    this.addVoxel('grass', x, 1.5, z + 1, true)
    this.addVoxel('grass', x, 1.5, z - 1, true)
    this.addVoxel('snow', x, 2.5, z, true)
  }

  private addInteractiveBlock(
    id: BlockId,
    x: number,
    y: number,
    z: number,
    target: InteractionTarget,
    sx = 1,
    sy = 1,
    sz = 1,
  ) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), materialForBlock(id))
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.userData = target
    this.scene.add(mesh)
    this.interactables.push(mesh)
    return mesh
  }

  private addVoxel(id: BlockId, x: number, y: number, z: number, buildable: boolean) {
    const key = this.key(x, y, z)
    if (this.voxels.has(key)) return
    const mesh = new THREE.Mesh(blockGeometry, materialForBlock(id))
    mesh.position.set(x, y, z)
    mesh.castShadow = id !== 'water'
    mesh.receiveShadow = true
    mesh.userData = { blockId: id, buildable }
    this.scene.add(mesh)
    this.voxels.set(key, { id, mesh, buildable })
  }

  private removeVoxel(mesh: THREE.Mesh) {
    if (!mesh.userData.buildable) return
    const key = this.key(mesh.position.x, mesh.position.y, mesh.position.z)
    this.scene.remove(mesh)
    this.voxels.delete(key)
    this.callbacks.onBlockChange(`Removed ${blockDefinitions[mesh.userData.blockId as BlockId]?.label ?? 'block'}.`)
  }

  private placeVoxel() {
    const hit = this.centerHit()
    if (!hit) return
    const normal = hit.face?.normal.clone() ?? new THREE.Vector3(0, 1, 0)
    normal.transformDirection(hit.object.matrixWorld)
    const position = hit.object.position.clone().add(normal.round())
    if (position.distanceTo(this.camera.position) < 1.25) return
    const id = this.selectedBlock()
    this.addVoxel(id, Math.round(position.x), Math.round(position.y), Math.round(position.z), true)
    this.callbacks.onBlockChange(`Placed ${blockDefinitions[id].label}.`)
  }

  private centerHit() {
    this.raycaster.setFromCamera(this.pointer, this.camera)
    return this.raycaster.intersectObjects([...this.voxels.values()].map((item) => item.mesh), false)[0]
  }

  private setupEvents() {
    window.addEventListener('resize', this.resize)
    window.addEventListener('keydown', this.keyDown)
    window.addEventListener('keyup', this.keyUp)
    document.addEventListener('mousemove', this.mouseMove)
    this.renderer.domElement.addEventListener('click', this.canvasClick)
    this.renderer.domElement.addEventListener('contextmenu', this.contextMenu)
    this.renderer.domElement.addEventListener('mousedown', this.mouseDown)
  }

  private resize = () => {
    const width = Math.max(1, this.container.clientWidth)
    const height = Math.max(1, this.container.clientHeight)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
  }

  private keyDown = (event: KeyboardEvent) => {
    this.keys.add(event.code)
    if (event.code === 'KeyE' && this.currentTarget) this.callbacks.onInteract(this.currentTarget)
    if (event.code === 'Space' && this.grounded) {
      this.velocityY = 5
      this.grounded = false
    }
    if (event.code === 'KeyF') this.placeVoxel()
    if (event.code === 'KeyX') {
      const hit = this.centerHit()
      if (hit?.object instanceof THREE.Mesh) this.removeVoxel(hit.object)
    }
    if (event.code.startsWith('Digit')) {
      const digit = Number(event.code.replace('Digit', ''))
      if (digit >= 1 && digit <= buildableBlocks.length) {
        this.selectedBlockIndex = digit - 1
        this.callbacks.onBlockChange(`Selected ${blockDefinitions[this.selectedBlock()].label}.`)
      }
    }
  }

  private keyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code)
  }

  private mouseMove = (event: MouseEvent) => {
    const locked = document.pointerLockElement === this.renderer.domElement
    if (!locked && event.buttons !== 1) return
    this.yaw -= event.movementX * 0.002
    this.pitch -= event.movementY * 0.002
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.25, 1.25)
    this.updateCameraRotation()
  }

  private canvasClick = () => {
    if (document.pointerLockElement !== this.renderer.domElement) {
      void this.renderer.domElement.requestPointerLock?.()
    }
  }

  private contextMenu = (event: MouseEvent) => {
    event.preventDefault()
  }

  private mouseDown = (event: MouseEvent) => {
    if (event.button === 0 && event.altKey) this.placeVoxel()
    if (event.button === 2) {
      const hit = this.centerHit()
      if (hit?.object instanceof THREE.Mesh) this.removeVoxel(hit.object)
    }
  }

  private loop = () => {
    if (!this.running) return
    const delta = Math.min(0.05, this.clock.getDelta())
    this.update(delta)
    this.renderer.render(this.scene, this.camera)
    this.animationId = requestAnimationFrame(this.loop)
  }

  private update(delta: number) {
    this.movePlayer(delta)
    this.animateNpcs(delta)
    this.updateTarget()
  }

  private movePlayer(delta: number) {
    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw))
    const right = new THREE.Vector3(Math.sin(this.yaw + Math.PI / 2), 0, Math.cos(this.yaw + Math.PI / 2))
    const direction = new THREE.Vector3()

    if (this.keys.has('KeyW')) direction.add(forward)
    if (this.keys.has('KeyS')) direction.sub(forward)
    if (this.keys.has('KeyD')) direction.add(right)
    if (this.keys.has('KeyA')) direction.sub(right)

    if (direction.lengthSq() > 0) direction.normalize()
    const sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 1.7 : 1
    this.camera.position.addScaledVector(direction, moveSpeed * sprint * delta)

    this.velocityY -= 12 * delta
    this.camera.position.y += this.velocityY * delta
    if (this.camera.position.y <= playerHeight) {
      this.camera.position.y = playerHeight
      this.velocityY = 0
      this.grounded = true
    }

    this.camera.position.x = THREE.MathUtils.clamp(this.camera.position.x, -32, 32)
    this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z, -32, 32)
  }

  private animateNpcs(delta: number) {
    const time = performance.now() * 0.001
    for (const npc of this.npcs) {
      npc.rotation.y = Math.sin(time + Number(npc.userData.queueIndex)) * 0.08
      npc.position.y = Math.sin(time * 1.7 + Number(npc.userData.queueIndex)) * 0.015
    }
    const researchRing = this.scene.children.find((child) => child instanceof THREE.Mesh && child.geometry instanceof THREE.TorusGeometry)
    if (researchRing) researchRing.rotation.z += delta * 0.5
  }

  private updateTarget() {
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hits = this.raycaster.intersectObjects(this.interactables, true)
    const targetHit = hits.find((hit) => hit.distance < 5.2)
    const object = targetHit ? this.findInteractionObject(targetHit.object) : null
    const target = object?.userData.kind ? (object.userData as InteractionTarget) : null
    if (JSON.stringify(target) !== JSON.stringify(this.currentTarget)) {
      this.currentTarget = target
      this.callbacks.onTargetChange(target)
    }
  }

  private findInteractionObject(object: THREE.Object3D): THREE.Object3D | null {
    let current: THREE.Object3D | null = object
    while (current) {
      if (current.userData.kind) return current
      current = current.parent
    }
    return null
  }

  private updateCameraRotation() {
    this.camera.rotation.y = this.yaw
    this.camera.rotation.x = this.pitch
  }

  private key(x: number, y: number, z: number) {
    return `${Math.round(x)},${Math.round(y * 2) / 2},${Math.round(z)}`
  }

  private seedOffset() {
    return this.gameState.worldSeed
      .split('')
      .reduce((sum, char) => sum + char.charCodeAt(0), 0) % 31
  }

  private fogColorForWeather(weather: GameState['weather']) {
    if (weather === 'SEVERE_STORM') return 0x8fa2ab
    if (weather === 'STORM') return 0x9fb2b8
    if (weather === 'SNOW') return 0xc4d8df
    if (weather === 'RAIN') return 0x9fb9c2
    return 0xbcd5df
  }
}
