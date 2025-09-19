import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

let scene, camera, renderer, controls;
let fighter1, fighter2;
let uiElements;

// --- INITIALIZATION ---

export function init(container, ui) {
    // Basic Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a202c);
    scene.fog = new THREE.Fog(0x1a202c, 20, 50);

    // Camera
    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 8, 15);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    container.innerHTML = ''; // Clear container before appending
    container.appendChild(renderer.domElement);
    
    // Store UI elements
    uiElements = ui;

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minDistance = 5;
    controls.maxDistance = 30;
    controls.maxPolarAngle = Math.PI / 2 - 0.1;
    controls.target.set(0, 2, 0);
    controls.update();

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 20, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    // Initial setup
    createRing();
    createFighters();
    animate();

    // Handle window resize
    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });
}

// --- OBJECT CREATION ---

function createRing() {
    // Floor
    const floorGeometry = new THREE.PlaneGeometry(20, 20);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x374151 });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Ring Posts
    const postGeometry = new THREE.CylinderGeometry(0.2, 0.2, 2, 8);
    const postMaterial = new THREE.MeshStandardMaterial({ color: 0xef4444 });
    const postPositions = [
        new THREE.Vector3(8, 1, 8), new THREE.Vector3(-8, 1, 8),
        new THREE.Vector3(8, 1, -8), new THREE.Vector3(-8, 1, -8)
    ];
    postPositions.forEach(pos => {
        const post = new THREE.Mesh(postGeometry, postMaterial);
        post.position.copy(pos);
        post.castShadow = true;
        scene.add(post);
    });

    // Ropes
    const ropeMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
    const ropeLevels = [1, 1.5, 2];
    ropeLevels.forEach(y => {
        const points = [
            new THREE.Vector3(-8, y, -8), new THREE.Vector3(8, y, -8),
            new THREE.Vector3(8, y, 8), new THREE.Vector3(-8, y, 8),
            new THREE.Vector3(-8, y, -8)
        ];
        const ropeGeometry = new THREE.BufferGeometry().setFromPoints(points);
        const rope = new THREE.Line(ropeGeometry, ropeMaterial);
        scene.add(rope);
    });
}

function createFighters() {
    fighter1 = createFighterModel(0x005cbf, new THREE.Vector3(-3, 0, 0));
    fighter2 = createFighterModel(0x4b0082, new THREE.Vector3(3, 0, 0));
    fighter2.rotation.y = Math.PI;
    scene.add(fighter1, fighter2);
}

function createFighterModel(color, position) {
    const group = new THREE.Group();
    group.position.copy(position);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 16), new THREE.MeshStandardMaterial({ color: 0xd2b48c }));
    head.position.y = 3;
    head.castShadow = true;
    group.add(head);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2, 0.8), new THREE.MeshStandardMaterial({ color: color }));
    torso.position.y = 1.5;
    torso.castShadow = true;
    group.add(torso);

    const createGlove = () => new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), new THREE.MeshStandardMaterial({ color: 0xB22222 }));

    const leftArm = new THREE.Group();
    const rightArm = new THREE.Group();
    const leftGlove = createGlove();
    const rightGlove = createGlove();
    leftGlove.position.y = -0.5;
    rightGlove.position.y = -0.5;
    leftArm.add(leftGlove);
    rightArm.add(rightGlove);
    
    leftArm.position.set(-1, 2.2, 0);
    rightArm.position.set(1, 2.2, 0);
    
    group.add(leftArm, rightArm);
    
    group.userData = { head, torso, leftArm, rightArm, leftGlove, rightGlove };
    return group;
}

// --- ANIMATION SYSTEM ---

function animate() {
    requestAnimationFrame(animate);
    TWEEN.update();
    controls.update();
    renderer.render(scene, camera);
}

function createTween(target, to, duration = 300) {
    return new Promise(resolve => {
        new TWEEN.Tween(target)
            .to(to, duration)
            .easing(TWEEN.Easing.Quadratic.Out)
            .onComplete(resolve)
            .start();
    });
}

export async function playPunchAnimation(fighterIndex) {
    const attacker = (fighterIndex === 1) ? fighter1 : fighter2;
    const arm = Math.random() < 0.5 ? attacker.userData.leftArm : attacker.userData.rightArm;

    await createTween(arm.position, { z: 2 }, 150);
    await createTween(arm.position, { z: 0 }, 150);
}

export async function playHitAnimation(fighterIndex) {
    const target = (fighterIndex === 1) ? fighter1 : fighter2;
    const originalPos = target.position.z;
    
    await createTween(target.position, { z: originalPos + (fighterIndex === 1 ? 0.5 : -0.5) }, 100);
    await createTween(target.position, { z: originalPos }, 200);
}

export async function playKnockdownAnimation(fighterIndex) {
    const target = (fighterIndex === 1) ? fighter1 : fighter2;
    await createTween(target.rotation, { x: -Math.PI / 2 }, 500);
    await createTween(target.position, { y: 0.5 }, 500);
}

export function resetFighters() {
    [fighter1, fighter2].forEach(fighter => {
        fighter.rotation.x = 0;
        fighter.position.y = 0;
        fighter.visible = true;
    });
}

export function showWinner(winnerIndex) {
    const winner = (winnerIndex === 1) ? fighter1 : fighter2;
    const loser = (winnerIndex === 1) ? fighter2 : fighter1;
    
    loser.visible = false;
    
    new TWEEN.Tween(winner.position)
        .to({ x: 0, y: 0, z: 0 }, 500)
        .easing(TWEEN.Easing.Quadratic.Out)
        .start();
        
    const arm = winner.userData.rightArm;
    new TWEEN.Tween(arm.rotation)
        .to({ x: -Math.PI / 2 }, 500)
        .easing(TWEEN.Easing.Bounce.Out)
        .start();
}

// --- UI OVERLAY ---

export function updateUI(data) {
    uiElements.fighter1.name.textContent = data.name1;
    uiElements.fighter2.name.textContent = data.name2;
    
    uiElements.fighter1.healthBar.style.width = `${data.health1}%`;
    uiElements.fighter1.healthText.textContent = `${Math.ceil(data.health1)}%`;
    uiElements.fighter1.staminaBar.style.width = `${data.stamina1}%`;

    uiElements.fighter2.healthBar.style.width = `${data.health2}%`;
    uiElements.fighter2.healthText.textContent = `${Math.ceil(data.health2)}%`;
    uiElements.fighter2.staminaBar.style.width = `${data.stamina2}%`;
    
    if (data.round) {
        uiElements.roundCounter.textContent = `Round ${data.round}/${data.maxRounds}`;
    }
    if (data.log) {
        logFightMessage(data.log);
    }
}

export function logFightMessage(html) {
    if (uiElements.log) {
        uiElements.log.insertAdjacentHTML('beforeend', html);
        uiElements.log.scrollTop = uiElements.log.scrollHeight;
    }
}

export function clearLog() {
     if (uiElements.log) {
        uiElements.log.innerHTML = '';
     }
}

export function setRoundDisplay(text) {
    if (uiElements.roundCounter) {
        uiElements.roundCounter.textContent = text;
    }
}

