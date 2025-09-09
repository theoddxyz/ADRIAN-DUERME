// Joystick 3D con Three.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.153.0/build/three.module.js';

export function createJoystick3D(containerId) {
  const width = 180, height = 180;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, width/height, 0.1, 1000);
  camera.position.set(0, 0, 220);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(width, height);
  renderer.setClearColor(0x000000, 0); // fondo transparente
  renderer.domElement.style.background = 'none';
  renderer.domElement.style.pointerEvents = 'auto';
  renderer.domElement.style.boxShadow = 'none';
  document.getElementById(containerId).appendChild(renderer.domElement);

  // Base del joystick
  const baseGeometry = new THREE.CylinderGeometry(60, 60, 18, 64);
  const baseMaterial = new THREE.MeshPhongMaterial({ color: 0xeeeeee, shininess: 80 });
  const base = new THREE.Mesh(baseGeometry, baseMaterial);
  base.position.y = -30;
  scene.add(base);

  // Grupo palo+bola para pivotear sobre la base
  const stickGroup = new THREE.Group();
  // Palo del joystick
  const stickGeometry = new THREE.CylinderGeometry(10, 10, 60, 32);
  const stickMaterial = new THREE.MeshPhongMaterial({ color: 0x8888ff, shininess: 100 });
  const stick = new THREE.Mesh(stickGeometry, stickMaterial);
  stick.position.y = 30; // el palo va de y=-30 (base) a y=+30 (bola)
  stickGroup.add(stick);
  // Bola superior
  const ballGeometry = new THREE.SphereGeometry(18, 32, 32);
  const ballMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 120 });
  const ball = new THREE.Mesh(ballGeometry, ballMaterial);
  ball.position.y = 60; // extremo superior del palo
  stickGroup.add(ball);
  // El grupo pivotea sobre la base
  stickGroup.position.set(0, -30, 0); // centrar joystick sobre la base
  scene.add(stickGroup);

  // Botón juicy a la derecha
  const buttonGroup = new THREE.Group();
  // Base del botón
  const buttonBaseGeometry = new THREE.CylinderGeometry(18, 18, 10, 32);
  const buttonBaseMaterial = new THREE.MeshPhongMaterial({ color: 0x222244, shininess: 60 });
  const buttonBase = new THREE.Mesh(buttonBaseGeometry, buttonBaseMaterial);
  buttonBase.position.set(120, -20, 0); // aún más a la derecha y abajo
  buttonGroup.add(buttonBase);
  // Botón principal
  const buttonGeometry = new THREE.CylinderGeometry(16, 16, 14, 32);
  const buttonMaterial = new THREE.MeshPhongMaterial({ color: 0xff3366, shininess: 180, emissive: 0xff3366, emissiveIntensity: 0.25 });
  const buttonMesh = new THREE.Mesh(buttonGeometry, buttonMaterial);
  buttonMesh.position.set(120, -10, 0); // encima de la base, más a la derecha
  buttonGroup.add(buttonMesh);
  // Brillo superior
  const shineGeometry = new THREE.SphereGeometry(7, 16, 16);
  const shineMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
  const shine = new THREE.Mesh(shineGeometry, shineMaterial);
  shine.position.set(120, -2, 7);
  buttonGroup.add(shine);
  scene.add(buttonGroup);

  // Interacción del botón
  renderer.domElement.addEventListener('pointerdown', e => {
    // Transformar coordenadas del click a la escena
    const mouse = new THREE.Vector2();
    mouse.x = (e.offsetX / width) * 2 - 1;
    mouse.y = -(e.offsetY / height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(buttonMesh);
    if (intersects.length > 0) {
      // Animación de pulsado
      buttonMesh.position.y -= 4;
      setTimeout(() => { buttonMesh.position.y += 4; }, 120);
      if (window.onJoystick3DButton) window.onJoystick3DButton();
    }
  });

  // Luz
  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambient);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
  dirLight.position.set(0, 80, 120);
  scene.add(dirLight);

  // Interacción
  let dragging = false;
  let lastX = 0, lastY = 0;
  renderer.domElement.addEventListener('pointerdown', e => {
    dragging = true;
    lastX = e.offsetX;
    lastY = e.offsetY;
  });
  renderer.domElement.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = (e.offsetX - width/2) / (width/2);
    const dy = (e.offsetY - height/2) / (height/2);
    // Limitar ángulo máximo de inclinación
    const maxAngle = 0.7;
    stickGroup.rotation.x = dy * maxAngle;
    stickGroup.rotation.z = -dx * maxAngle;
    // Emitir valores normalizados
    if (window.onJoystick3DMove) window.onJoystick3DMove(dx, dy);
  });
  renderer.domElement.addEventListener('pointerup', e => {
    dragging = false;
    stickGroup.rotation.x = 0;
    stickGroup.rotation.z = 0;
    if (window.onJoystick3DMove) window.onJoystick3DMove(0, 0);
  });
  renderer.domElement.addEventListener('pointerleave', e => {
    dragging = false;
    stickGroup.rotation.x = 0;
    stickGroup.rotation.z = 0;
    if (window.onJoystick3DMove) window.onJoystick3DMove(0, 0);
  });

  function animate() {
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();
}
