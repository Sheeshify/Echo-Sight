import * as THREE from 'three';
import { SVGRenderer } from '../node_modules/three/examples/jsm/renderers/SVGRenderer.js';

const theme = document.body.dataset.theme || 'hub';
const palette = {
  hub: { bg: 0x061920, accent: 0x58d7c2, light: 0x56d8d2 },
  abyss: { bg: 0x031b26, accent: 0x42d9cc, light: 0x5be2db },
  orbit: { bg: 0x090b20, accent: 0xaaa0ff, light: 0x8877ff },
  neon: { bg: 0x150915, accent: 0xff50b8, light: 0x38d8ff },
  alpine: { bg: 0x091720, accent: 0xcce7d2, light: 0x8fd4e9 },
  sonic: { bg: 0x160e24, accent: 0xe4a0ff, light: 0xc67aff }
}[theme];
const canvas = document.querySelector('#world');
const scene = new THREE.Scene();
scene.background = new THREE.Color(palette.bg);
scene.fog = new THREE.FogExp2(palette.bg, theme === 'neon' ? .034 : .025);
const camera = new THREE.PerspectiveCamera(53, innerWidth / innerHeight, .1, 180);
camera.position.set(0, 1.3, 12);
let renderer;
let usingSVG = false;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
} catch {
  // Keep the Three.js scene available in browsers that block WebGL (including previews).
  usingSVG = true;
  renderer = new SVGRenderer();
  renderer.setQuality('low');
  renderer.domElement.classList.add('svg-world');
  document.body.insertBefore(renderer.domElement, canvas.nextSibling);
  canvas.style.display = 'none';
}
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
scene.add(new THREE.HemisphereLight(0x9fc5dc, 0x061018, 1.15));
const key = new THREE.DirectionalLight(0xc1e8ff, 1.6); key.position.set(-4, 8, 6); scene.add(key);
const world = new THREE.Group(); world.position.x = innerWidth < 640 ? 1.1 : 2.2; scene.add(world);
const materials = {};
function mat(color, roughness=.65, metalness=.08, emissive=0x000000, power=0) {
  const key = [color,roughness,metalness,emissive,power].join(':');
  if (!materials[key]) materials[key] = new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity: power });
  return materials[key];
}
function addMesh(geometry, material, parent=world, x=0, y=0, z=0) {
  const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x,y,z); parent.add(mesh); return mesh;
}
function seeded(n) { const x = Math.sin(n * 127.1 + 91.7) * 43758.5453; return x - Math.floor(x); }
function addStars(count, spread, zDepth=55) {
  const vertices = [];
  for (let i=0;i<count;i++) vertices.push((seeded(i+3)-.5)*spread,(seeded(i+83)-.48)*spread*.72,-seeded(i+211)*zDepth);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices,3));
  const pts = new THREE.Points(geo,new THREE.PointsMaterial({ color: 0xb9d9ff, size: .055, transparent:true, opacity:.8, sizeAttenuation:true }));
  scene.add(pts); return pts;
}
const animated = [];
function addFloat(obj, amplitude=.3, speed=.7) { animated.push({obj, amplitude, speed, y:obj.position.y, phase:Math.random()*6.28}); return obj; }

function buildOcean() {
  scene.fog.density = .029;
  const seabed = addMesh(new THREE.PlaneGeometry(100,80,usingSVG?24:60,usingSVG?20:50), mat(0x092c33,.94,0,0x001f26,.28), world,0,-4.5,-20);
  seabed.rotation.x=-Math.PI/2;
  const ground = seabed.geometry.attributes.position;
  for(let i=0;i<ground.count;i++){const x=ground.getX(i), y=ground.getY(i); ground.setZ(i,Math.sin(x*.45)*.4+Math.cos(y*.3)*.33+seeded(i)*.18)}
  seabed.geometry.computeVertexNormals();
  for(let i=0;i<(usingSVG?34:62);i++){
    const x=(seeded(i+6)-.5)*32,z=-10-seeded(i+46)*25,r=.3+seeded(i+86)*1.4;
    const rock=addMesh(new THREE.DodecahedronGeometry(r,usingSVG?0:1),mat(i%4===0?0x1a5c60:0x123c47,.94,0, i%7===0?0x21bda9:0x00130e,.8),world,x,-4.1+seeded(i+26)*.35,z);
    rock.rotation.set(seeded(i+90),seeded(i+100),seeded(i+120)); rock.scale.y=.55+seeded(i+66)*.5;
  }
  for(let i=0;i<(usingSVG?18:29);i++){
    const x=(seeded(i+210)-.5)*24,y=-2+seeded(i+330)*7,z=-5-seeded(i+240)*24;
    const fish=new THREE.Group(); world.add(fish); fish.position.set(x,y,z);
    const c = i%3===0?0x56dbce:i%3===1?0xe0a173:0x6aa6a7;
    const body=addMesh(new THREE.SphereGeometry(.22+seeded(i+370)*.2,12,8),mat(c,.35,.12,i%4===0?c:0x000000,.5),fish);
    body.scale.set(1.65,.78,.62);
    const tail=addMesh(new THREE.ConeGeometry(.13,.36,4),mat(c,.45,.1,c,.22),fish,-.45,0,0); tail.rotation.z=Math.PI/2;
    fish.rotation.y=seeded(i+300)*Math.PI*2; animated.push({obj:fish,amplitude:.27,speed:.3+seeded(i+99)*.5,y,phase:seeded(i+88)*6.28,fish:true});
  }
  for(let i=0;i<(usingSVG?48:95);i++){
    const bubble=addMesh(new THREE.SphereGeometry(.025+seeded(i+700)*.05,8,8),new THREE.MeshBasicMaterial({color:i%5===0?0x84ffe1:0xb9f8f0,transparent:true,opacity:.23+seeded(i+800)*.48}),world,(seeded(i+710)-.5)*28,-4+seeded(i+720)*14,-6-seeded(i+730)*36);
    animated.push({obj:bubble,amplitude:7,speed:.24+seeded(i+740)*.4,y:bubble.position.y,phase:seeded(i+750)*10,bubble:true});
  }
  for(let i=0;i<5;i++){
    const beam=addMesh(new THREE.CylinderGeometry(.15,1.8,17,16,1,true),new THREE.MeshBasicMaterial({color:0x56d7d8,transparent:true,opacity:.045,side:THREE.DoubleSide,depthWrite:false}),world,-10+i*5,2,-13-i);
    beam.rotation.z=(seeded(i+990)-.5)*.4; beam.rotation.x=-.08;
  }
  for(let i=0;i<4;i++){const plant=addMesh(new THREE.ConeGeometry(.34+seeded(i+50)*.35,1.9+seeded(i+60),6),mat(0x167c76,.55,.06,0x00a58e,.9),world,-9+i*5,-3.4,-12-i*2);addFloat(plant,.13,.4)}
  const glow=new THREE.PointLight(0x26c8bd,45,26);glow.position.set(0,2,-12);scene.add(glow);
}
function canvasTexture(kind) {
  const c=document.createElement('canvas');c.width=512;c.height=256;const ctx=c.getContext('2d');
  if(kind==='planet'){ctx.fillStyle='#564f92';ctx.fillRect(0,0,512,256);for(let i=0;i<30;i++){ctx.fillStyle=['#8275b4','#6b639d','#a492c3','#393a79'][i%4];ctx.globalAlpha=.3+seeded(i+12)*.45;ctx.beginPath();ctx.ellipse(seeded(i+42)*512,seeded(i+52)*256,30+seeded(i+62)*120,3+seeded(i+72)*14,0,0,6.28);ctx.fill()}ctx.globalAlpha=1;}
  else{ctx.fillStyle='#c97942';ctx.fillRect(0,0,512,256);for(let i=0;i<80;i++){ctx.fillStyle=i%2?'#e09b58':'#8e4c3b';ctx.globalAlpha=.2+seeded(i+232)*.4;ctx.beginPath();ctx.ellipse(seeded(i+242)*512,seeded(i+252)*256,10+seeded(i+262)*60,2+seeded(i+272)*9,0,0,6.28);ctx.fill()}ctx.globalAlpha=1;}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
function buildSpace() {
  addStars(usingSVG?420:1300,110,90);
  const sunMat=new THREE.MeshBasicMaterial({color:0xffc378});
  const sun=addMesh(new THREE.SphereGeometry(1.15,usingSVG?24:40,usingSVG?16:32),sunMat,world,5.5,2,-15);
  const glow=addMesh(new THREE.SphereGeometry(1.7,32,24),new THREE.MeshBasicMaterial({color:0xffa04e,transparent:true,opacity:.1}),world,5.5,2,-15);
  addFloat(glow,.12,.5);
  const planet=addMesh(new THREE.SphereGeometry(2.45,usingSVG?32:64,usingSVG?24:48),new THREE.MeshStandardMaterial({map:canvasTexture('planet'),roughness:.82,metalness:.04}),world,-2.2,-.2,-13);
  planet.rotation.z=.35;
  const ring=addMesh(new THREE.TorusGeometry(3.45,.075,3,usingSVG?80:160),mat(0xc7b4ff,.35,.65,0x52429a,.4),world,-2.2,-.2,-13);ring.rotation.set(1.2,.35,.2);
  const halo=addMesh(new THREE.TorusGeometry(4.5,.012,4,usingSVG?80:160),new THREE.MeshBasicMaterial({color:0x786bce,transparent:true,opacity:.35}),world,-2.2,-.2,-13);halo.rotation.set(1.2,.35,.2);
  const moon=addMesh(new THREE.SphereGeometry(.58,32,24),new THREE.MeshStandardMaterial({map:canvasTexture('moon'),roughness:.9}),world,2,1,-9);
  const orbit=new THREE.Group();scene.add(orbit);orbit.position.set(-2.2,-.2,-13);orbit.add(moon);moon.position.set(5,0,0);animated.push({obj:orbit,amplitude:0,speed:.15,y:0,phase:0,rotation:true});
  const ring2=addMesh(new THREE.TorusGeometry(5.2,.012,3,usingSVG?72:140),new THREE.MeshBasicMaterial({color:0x5e64c7,transparent:true,opacity:.55}),world,-2.2,-.2,-13);ring2.rotation.x=1.22;ring2.rotation.y=.4;
  const light=new THREE.PointLight(0xffc07a,48,50);light.position.set(5,2,-15);scene.add(light);
}
function buildCity() {
  scene.fog.density=.038;
  const ground=addMesh(new THREE.PlaneGeometry(100,100),mat(0x180c1d,.32,.55,0x210c1c,.5),world,0,-3.7,-18);ground.rotation.x=-Math.PI/2;
  for(let i=0;i<(usingSVG?64:115);i++){
    const lane=(i%2===0?-1:1),x=(seeded(i+5)-.5)*46,z=-8-seeded(i+105)*38;
    const w=.5+seeded(i+205)*1.6,h=2+seeded(i+305)*9,d=.7+seeded(i+405)*1.4;
    const building=addMesh(new THREE.BoxGeometry(w,h,d),mat(i%6===0?0x282033:i%3===0?0x18172b:0x141522,.48,.38,i%10===0?0x46183d:0x060813,.42),world,x,-3.7+h/2,z);
    building.rotation.y=(seeded(i+505)-.5)*.1;
    const sides=[-1,1];
    for(let y=0;y<Math.min(12,Math.floor(h*1.5));y++) for(let col=0;col<Math.max(1,Math.floor(w*1.8));col++){
      if(seeded(i*91+y*23+col*7)>.68)continue;
      const winCol=seeded(i*13+y*31+col*17)>.55?0x4ee7f3:0xff50b8;
      const win=addMesh(new THREE.BoxGeometry(.08,.12,.018),new THREE.MeshBasicMaterial({color:winCol}),world,x-w/2+.15+col*.27,-3.7+.35+y*.49,z+d/2+.012);
      win.material.transparent=true;win.material.opacity=.34+seeded(i+y*9+col)*.55;
    }
    if(i%9===0){const sign=addMesh(new THREE.BoxGeometry(.12,.08+seeded(i)*.3,.1),new THREE.MeshBasicMaterial({color:i%2?0xff46bf:0x42e6ff}),world,x+w*.55,-3.4+h*.68,z+d*.42);sign.rotation.z=seeded(i+15)*.24;}
  }
  for(let i=0;i<17;i++){
    const path=addMesh(new THREE.BoxGeometry(.035,.012,19),new THREE.MeshBasicMaterial({color:i%2?0xff43b5:0x36dcf0,transparent:true,opacity:.4}),world,-12+i*1.5,-3.64,-19);
    path.position.x += Math.sin(i)*.14;
  }
  const light1=new THREE.PointLight(0xf5229d,62,24);light1.position.set(-4,3,-13);scene.add(light1);
  const light2=new THREE.PointLight(0x23c9ee,52,28);light2.position.set(7,2,-17);scene.add(light2);
  addStars(usingSVG?120:250,70,55);
}
function buildAlpine() {
  addStars(usingSVG?220:450,90,75);
  const ground=addMesh(new THREE.PlaneGeometry(100,90),mat(0x213b48,.9,.05),world,0,-3.7,-19);ground.rotation.x=-Math.PI/2;
  const colors=[0x243b4a,0x304552,0x1d3544,0x344b59];
  for(let i=0;i<(usingSVG?19:30);i++){
    const x=(seeded(i+2)-.5)*43,z=-12-seeded(i+42)*23,h=5+seeded(i+82)*12,r=3+seeded(i+122)*5;
    const mountain=addMesh(new THREE.ConeGeometry(r,h,5),mat(colors[i%4],.95,.03),world,x,-4+h/2-1,z);mountain.rotation.y=seeded(i+162)*6.28;mountain.scale.z=.72+seeded(i+202)*.5;
    const cap=addMesh(new THREE.ConeGeometry(r*.43,h*.35,5),mat(0xdde9e7,.86,.02),world,x,-4+h*.83,z);cap.rotation.y=mountain.rotation.y;
  }
  for(let i=0;i<(usingSVG?40:64);i++){
    const x=(seeded(i+311)-.5)*36,z=-5-seeded(i+411)*30,y=-3.6+seeded(i+511)*.12;
    const treeH=1.1+seeded(i+611)*2.2;
    addMesh(new THREE.CylinderGeometry(.05,.1,treeH*.25,6),mat(0x5a4e42,.95),world,x,y+treeH*.12,z);
    const tree=addMesh(new THREE.ConeGeometry(.35+treeH*.18,treeH,7),mat(i%3?0x224b4b:0x2d5e58,.9,0,0x071b18,.1),world,x,y+treeH*.61,z);tree.rotation.y=seeded(i+711)*6.28;
  }
  const lake=addMesh(new THREE.PlaneGeometry(14,5),new THREE.MeshStandardMaterial({color:0x4d99ac,roughness:.16,metalness:.3,transparent:true,opacity:.78}),world,-1,-3.57,-9);lake.rotation.x=-Math.PI/2;
  const moon=addMesh(new THREE.SphereGeometry(.9,32,24),new THREE.MeshBasicMaterial({color:0xe3eee5}),world,6,6,-22);
  addMesh(new THREE.SphereGeometry(1.25,28,20),new THREE.MeshBasicMaterial({color:0xe9f1ed,transparent:true,opacity:.08}),world,6,6,-22);
  const light=new THREE.PointLight(0x91d9f0,38,36);light.position.set(-2,5,-12);scene.add(light);
}
function buildSonic() {
  addStars(500,78,60);
  const center=new THREE.Group();center.position.set(1,0,-10);world.add(center);
  const core=addMesh(new THREE.IcosahedronGeometry(1.1,3),new THREE.MeshStandardMaterial({color:0x9a5de3,roughness:.24,metalness:.45,emissive:0x612d99,emissiveIntensity:1.2,wireframe:true}),center);
  const orb=addMesh(new THREE.SphereGeometry(.75,usingSVG?24:48,usingSVG?16:32),new THREE.MeshPhysicalMaterial({color:0xb57cff,roughness:.12,metalness:.22,transmission:.15,emissive:0x481887,emissiveIntensity:.6}),center);
  const glow=addMesh(new THREE.SphereGeometry(1.35,32,28),new THREE.MeshBasicMaterial({color:0xae70ff,transparent:true,opacity:.08}),center);
  for(let j=0;j<5;j++){const ring=addMesh(new THREE.TorusGeometry(2.1+j*.58,.016,4,usingSVG?64:128),new THREE.MeshBasicMaterial({color:j%2?0xf68be1:0x79e0ff,transparent:true,opacity:.48-j*.04}),center);ring.rotation.x=1.0+j*.17;ring.rotation.y=j*.32;animated.push({obj:ring,amplitude:0,speed:.12+j*.035,y:0,phase:j,rotation:true});}
  for(let i=0;i<(usingSVG?52:84);i++){
    const angle=i/84*Math.PI*2,radius=2.5+seeded(i+28)*2.8,h=.4+seeded(i+128)*3.4;
    const bar=addMesh(new THREE.BoxGeometry(.075,h,.075),new THREE.MeshStandardMaterial({color:i%4===0?0x70e9ef:i%4===1?0xf794de:i%4===2?0xb297ff:0x7dd5b4,roughness:.3,metalness:.2,emissive:i%2?0x4b174b:0x143e62,emissiveIntensity:.52}),center,Math.cos(angle)*radius,h/2-1.2,Math.sin(angle)*radius);
    bar.userData={base:h,phase:seeded(i+228)*8,speed:.9+seeded(i+328)*2};
    animated.push({obj:bar,amplitude:0,speed:1,y:0,phase:bar.userData.phase,bar:true});
  }
  for(let i=0;i<20;i++){const particle=addMesh(new THREE.SphereGeometry(.035+seeded(i+428)*.06,8,8),new THREE.MeshBasicMaterial({color:i%2?0x7ce8ee:0xd989ff}),center,(seeded(i+528)-.5)*13,(seeded(i+628)-.5)*8,(seeded(i+728)-.5)*8);addFloat(particle,.5,.5+seeded(i+828));}
  addFloat(center,.3,.35);
  const light=new THREE.PointLight(0xbd72ff,65,28);light.position.set(1,1,-9);scene.add(light);
}
({hub:buildSonic,abyss:buildOcean,orbit:buildSpace,neon:buildCity,alpine:buildAlpine,sonic:buildSonic}[theme]||buildSonic)();

let pointerX=0,pointerY=0,targetX=0,targetY=0,isDown=false,lastX=0,lastY=0,dragX=0,dragY=0;
window.addEventListener('pointerdown',e=>{isDown=true;lastX=e.clientX;lastY=e.clientY;});
window.addEventListener('pointerup',()=>isDown=false);
window.addEventListener('pointermove',e=>{
  if(isDown){dragX+=(e.clientX-lastX)*.003;dragY+=(e.clientY-lastY)*.002;lastX=e.clientX;lastY=e.clientY;}
  targetX=(e.clientX/innerWidth-.5)*.46;targetY=(e.clientY/innerHeight-.5)*.22;
});
let scroll=0;window.addEventListener('scroll',()=>{scroll=window.scrollY/Math.max(1,document.documentElement.scrollHeight-innerHeight);},{passive:true});
let last=0, lastSVGRender=0;
function animate(now){
  requestAnimationFrame(animate);const time=now*.001;const dt=Math.min(.04,(now-last)*.001);last=now;
  pointerX+=(targetX-pointerX)*.035;pointerY+=(targetY-pointerY)*.035;
  camera.position.x=pointerX+dragX*.35;camera.position.y=1.25-pointerY+dragY*.25+scroll*.45;camera.lookAt(0,-.1-scroll*1.2,-9);
  world.rotation.y+=(pointerX*.42+dragX-world.rotation.y)*.022;
  world.rotation.x+=(dragY*.4-world.rotation.x)*.022;
  world.position.y=-scroll*1.3;
  for(const item of animated){
    if(item.bubble){item.obj.position.y=item.y+((time*item.speed+item.phase)%11)-5.5;item.obj.position.x+=Math.sin(time*item.speed+item.phase)*dt*.06;}
    else if(item.bar){const h=item.obj.userData.base*(.65+.35*Math.sin(time*item.obj.userData.speed+item.phase));item.obj.scale.y=h/item.obj.userData.base;item.obj.position.y=h/2-1.2;}
    else if(item.rotation)item.obj.rotation.y=time*item.speed;
    else {item.obj.position.y=item.y+Math.sin(time*item.speed+item.phase)*item.amplitude;if(item.fish)item.obj.position.x+=Math.sin(time*item.speed+item.phase)*dt*.3;}
  }
  if(theme==='sonic'||theme==='hub'){const c=world.children.find(x=>x.type==='Group');if(c)c.rotation.y=time*.12;}
  if(!usingSVG || now-lastSVGRender>50){renderer.render(scene,camera);lastSVGRender=now;}
}
requestAnimationFrame(animate);
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));world.position.x=innerWidth<640?1.1:2.2;});
