import { createRoot } from 'react-dom/client'
import { Canvas } from '@react-three/fiber'
import { Scene } from './Scene'
import { UI } from './UI'
import { connectLive } from './sim'
import './style.css'

connectLive()

createRoot(document.getElementById('root')!).render(
  <>
    <Canvas
      shadows
      camera={{ fov: 46, near: 1, far: 280, position: [26, 24, 30] }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
    >
      <Scene />
    </Canvas>
    <UI />
  </>,
)
