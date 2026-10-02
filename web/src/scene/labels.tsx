import {useMemo} from 'react'
import * as THREE from 'three'
import {ui,go,CLICK_MOVE_MAX,type Room} from '../sim'

/* floor etch — larger + higher contrast for ¾ cam readability (Elon UI) */
const etchLabel=(name:string,accent:string)=>{const c=document.createElement('canvas');c.width=1024;c.height=256;const x=c.getContext('2d')!
 x.clearRect(0,0,1024,256)
 /* recessed plate — darker fill for contrast on parquet */
 x.fillStyle='rgba(22,18,14,.62)';x.beginPath();x.roundRect(20,28,984,200,20);x.fill()
 x.strokeStyle='rgba(8,6,4,.7)';x.lineWidth=4;x.beginPath();x.roundRect(22,30,980,196,18);x.stroke()
 x.strokeStyle='rgba(255,248,235,.38)';x.lineWidth=2.5;x.beginPath();x.roundRect(30,38,964,180,14);x.stroke()
 /* accent pip */
 x.fillStyle=accent;x.globalAlpha=.95;x.beginPath();x.arc(88,128,12,0,Math.PI*2);x.fill();x.globalAlpha=1
 x.fillStyle='rgba(255,255,255,.45)';x.beginPath();x.arc(84,123,4,0,Math.PI*2);x.fill()
 x.font='800 96px "Plus Jakarta Sans", system-ui, sans-serif'
 x.textAlign='center';x.textBaseline='middle'
 x.letterSpacing='0.1em' as any
 const label=name.toUpperCase()
 /* carved shadow + highlight + near-black ink */
 x.fillStyle='rgba(255,252,245,.5)';x.fillText(label,516,112)
 x.fillStyle='rgba(4,2,0,.85)';x.fillText(label,508,140)
 x.fillStyle='rgba(252,248,240,.96)';x.fillText(label,512,126)
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;t.premultiplyAlpha=true;return t}
const RoomLabel=({r}:{r:Room})=>{
 const map=useMemo(()=>etchLabel(r.n,r.c),[r.n,r.c])
 return <mesh rotation={[-Math.PI/2,0,0]} position={[r.x,.14,r.z]} receiveShadow
  onClick={e=>{e.stopPropagation();if(ui.moved<CLICK_MOVE_MAX&&ui.sel)go(ui.sel,r)}}>
  <planeGeometry args={[6.6,1.7]}/>
  <meshStandardMaterial map={map} transparent depthWrite={false} roughness={.86} metalness={.06} polygonOffset polygonOffsetFactor={-2}/>
 </mesh>}

const initTex=(letter:string)=>{
 const c=document.createElement('canvas');c.width=128;c.height=64;const x=c.getContext('2d')!
 x.clearRect(0,0,128,64)
 x.fillStyle='rgba(0,0,0,.22)';x.fillRect(0,14,128,36)
 x.fillStyle='rgba(255,255,255,.18)';x.fillRect(0,14,128,1)
 x.fillStyle='rgba(255,255,255,.10)';x.fillRect(0,49,128,1)
 x.font='700 32px "Plus Jakarta Sans", system-ui, sans-serif'
 x.textAlign='center';x.textBaseline='middle'
 x.fillStyle='rgba(0,0,0,.35)';x.fillText(letter,65,33)
 x.fillStyle='rgba(255,255,255,.78)';x.fillText(letter,64,31)
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t}

export { etchLabel, RoomLabel, initTex }
