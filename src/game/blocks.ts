import * as THREE from 'three'

export type BlockId =
  | 'grass'
  | 'dirt'
  | 'stone'
  | 'snow'
  | 'ice'
  | 'water'
  | 'wood'
  | 'concrete'
  | 'metal'
  | 'glass'
  | 'road'
  | 'wall'
  | 'floor'
  | 'roof'
  | 'computer'
  | 'server'
  | 'battery'
  | 'solar'
  | 'generator'
  | 'network'
  | 'cabinet'
  | 'lab'
  | 'pharmacy'
  | 'bed'
  | 'exam'
  | 'storage'

export interface BlockDefinition {
  id: BlockId
  label: string
  color: string
  roughness: number
  metalness: number
  transparent?: boolean
  opacity?: number
  collision: boolean
  category: 'terrain' | 'building' | 'infrastructure' | 'medical' | 'utility'
}

export const blockDefinitions: Record<BlockId, BlockDefinition> = {
  grass: def('grass', 'Moss Grass', '#4f8a5b', 'terrain'),
  dirt: def('dirt', 'Packed Soil', '#7b5f46', 'terrain'),
  stone: def('stone', 'Ridge Stone', '#74797f', 'terrain'),
  snow: def('snow', 'Snow Crust', '#dfe9ef', 'terrain'),
  ice: def('ice', 'Blue Ice', '#98c9d9', 'terrain', { transparent: true, opacity: 0.76 }),
  water: def('water', 'Cold Water', '#2b7a86', 'terrain', { transparent: true, opacity: 0.72, collision: false }),
  wood: def('wood', 'Pine Timber', '#8b6a43', 'building'),
  concrete: def('concrete', 'Clinic Concrete', '#b8c0bc', 'building'),
  metal: def('metal', 'Brushed Metal', '#7b8d90', 'building', { metalness: 0.25 }),
  glass: def('glass', 'Thick Glass', '#9bd3dd', 'building', { transparent: true, opacity: 0.42, collision: false }),
  road: def('road', 'Gravel Road', '#575b58', 'terrain'),
  wall: def('wall', 'White Wall Block', '#d7ddd6', 'building'),
  floor: def('floor', 'Clinic Floor', '#8db6aa', 'building'),
  roof: def('roof', 'Weather Roof', '#3d5965', 'building'),
  computer: def('computer', 'Clinic Computer', '#25323a', 'infrastructure', { metalness: 0.15 }),
  server: def('server', 'Local AI Server', '#2a3c55', 'infrastructure', { metalness: 0.2 }),
  battery: def('battery', 'Battery Bank', '#6f8a4b', 'utility'),
  solar: def('solar', 'Solar Panel', '#233b5e', 'utility', { metalness: 0.25 }),
  generator: def('generator', 'Generator', '#7f6a3b', 'utility', { metalness: 0.2 }),
  network: def('network', 'Network Tower', '#6f7d86', 'utility', { metalness: 0.35 }),
  cabinet: def('cabinet', 'Medical Cabinet', '#7aa5a1', 'medical'),
  lab: def('lab', 'Lab Equipment', '#856db2', 'medical'),
  pharmacy: def('pharmacy', 'Pharmacy Shelf', '#b29b5f', 'medical'),
  bed: def('bed', 'Clinic Bed', '#d9d1c2', 'medical'),
  exam: def('exam', 'Exam Table', '#7fa7b7', 'medical'),
  storage: def('storage', 'Supply Storage', '#a36f52', 'medical'),
}

export const buildableBlocks: BlockId[] = [
  'wall',
  'floor',
  'glass',
  'wood',
  'concrete',
  'storage',
  'solar',
  'battery',
  'server',
]

export function materialForBlock(id: BlockId): THREE.MeshStandardMaterial {
  const block = blockDefinitions[id]
  const options: THREE.MeshStandardMaterialParameters = {
    color: block.color,
    roughness: block.roughness,
    metalness: block.metalness,
  }
  if (block.transparent !== undefined) options.transparent = block.transparent
  if (block.opacity !== undefined) options.opacity = block.opacity
  return new THREE.MeshStandardMaterial(options)
}

function def(
  id: BlockId,
  label: string,
  color: string,
  category: BlockDefinition['category'],
  options: Partial<BlockDefinition> = {},
): BlockDefinition {
  return {
    id,
    label,
    color,
    category,
    roughness: 0.82,
    metalness: 0,
    collision: true,
    ...options,
  }
}
