import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene, camera, renderer, controls;
let fighter1, fighter2, referee, taleOfTheTapePlane1, taleOfTheTapePlane2;
let animationFrameId;

let cornerPost1, cornerPost2, cornerPost3, cornerPost4; // To hold references to the corner posts

const fighterColor1 = 0x007bff; // Blue
const fighterColor2 = 0x6f42c1; // Purple

// Function to initialize the scene
export async function init(fighter1Data, fighter2Data) {
    const canvasContainer = document.getElementById('three-canvas-container');
    if (!canvasContainer) {
        console.error("Canvas container not found!");
        return;
    }
    canvasContainer.innerHTML = ''; // Clear previous renderer

    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) loadingOverlay.classList.remove('hidden');

    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a2b34);
    scene.fog = new THREE.Fog(0x1a2b34, 20, 60);

    // Camera setup
    camera = new THREE.PerspectiveCamera(75, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.1, 1000);
    camera.position.set(0, 15, 18);

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    renderer.shadowMap.enabled = true;
    canvasContainer.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(-10, 15, 10);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(10, 10, 10);
    scene.add(fillLight);

    const spotlight = new THREE.SpotLight(0xffffff, 1.5, 100, Math.PI / 4, 1);
    spotlight.position.set(0, 30, 0);
    spotlight.castShadow = true;
    spotlight.shadow.mapSize.width = 2048;
    spotlight.shadow.mapSize.height = 2048;
    scene.add(spotlight);

    // Create scene elements
    createRing();
    fighter1 = createFighter(fighterColor1);
    fighter2 = createFighter(fighterColor2);
    referee = createReferee();
    
    // Set initial positions and rotations
    fighter1.position.set(-10, 0, -10); // Start in corner
    fighter2.position.set(10, 0, 10); // Start in opposing corner
    fighter1.lookAt(0, 0, 0);
    fighter2.lookAt(0, 0, 0);

    scene.add(fighter1);
    scene.add(fighter2);
    scene.add(referee);
    referee.visible = false;

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 5, 0);
    controls.update();
    
    // Handle resizing
    window.addEventListener('resize', onWindowResize);
    onWindowResize(); // Set initial size

    // Start animation loop
    animate();

    // Hide loading overlay
    if (loadingOverlay) loadingOverlay.classList.add('hidden');
}

// Function to create the boxing ring
function createRing() {
    const ringSize = 20;
    const postHeight = 6;
    const postRadius = 0.2;

    // Floor
    const floorGeometry = new THREE.PlaneGeometry(ringSize, ringSize);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x4a5568 });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Posts
    const postGeometry = new THREE.CylinderGeometry(postRadius, postRadius, postHeight);
    
    const postPositions = [
        new THREE.Vector3(ringSize / 2, postHeight / 2, ringSize / 2),
        new THREE.Vector3(-ringSize / 2, postHeight / 2, ringSize / 2),
        new THREE.Vector3(-ringSize / 2, postHeight / 2, -ringSize / 2),
        new THREE.Vector3(ringSize / 2, postHeight / 2, -ringSize / 2)
    ];
    
    const postMaterial1 = new THREE.MeshStandardMaterial({ color: fighterColor2 }); // Fighter 2 corner
    const postMaterial2 = new THREE.MeshStandardMaterial({ color: 0x888888 });
    const postMaterial3 = new THREE.MeshStandardMaterial({ color: fighterColor1 }); // Fighter 1 corner
    const postMaterial4 = new THREE.MeshStandardMaterial({ color: 0x888888 });

    cornerPost1 = new THREE.Mesh(postGeometry, postMaterial1);
    cornerPost2 = new THREE.Mesh(postGeometry, postMaterial2);
    cornerPost3 = new THREE.Mesh(postGeometry, postMaterial3);
    cornerPost4 = new THREE.Mesh(postGeometry, postMaterial4);
    
    const posts = [cornerPost1, cornerPost2, cornerPost3, cornerPost4];
    posts.forEach((post, i) => {
        post.position.copy(postPositions[i]);
        post.castShadow = true;
        scene.add(post);
    });

    // Ropes
    const ropeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const ropeHeights = [2.5, 4.0, 5.5];

    ropeHeights.forEach(height => {
        for (let i = 0; i < postPositions.length; i++) {
            const startPoint = postPositions[i].clone();
            startPoint.y = height;
            const endPoint = postPositions[(i + 1) % postPositions.length].clone();
            endPoint.y = height;

            const ropeGeometry = new THREE.BufferGeometry().setFromPoints([startPoint, endPoint]);
            const rope = new THREE.Line(ropeGeometry, ropeMaterial);
            scene.add(rope);
        }
    });
}

// Function to create a fighter model
function createFighter(color) {
    const fighterGroup = new THREE.Group();
    const torsoMaterial = new THREE.MeshStandardMaterial({ color: color });

    // --- Manual Capsule for Torso ---
    const torsoGroup = new THREE.Group();
    const cylinderHeight = 2.5;
    const radius = 1;

    // Cylinder part
    const cylinderGeo = new THREE.CylinderGeometry(radius, radius, cylinderHeight, 16);
    const cylinder = new THREE.Mesh(cylinderGeo, torsoMaterial);
    cylinder.castShadow = true;

    // Sphere caps
    const sphereGeo = new THREE.SphereGeometry(radius, 16, 8);
    const topCap = new THREE.Mesh(sphereGeo, torsoMaterial);
    topCap.position.y = cylinderHeight / 2;
    topCap.castShadow = true;

    const bottomCap = new THREE.Mesh(sphereGeo, torsoMaterial);
    bottomCap.position.y = -cylinderHeight / 2;
    bottomCap.castShadow = true;

    torsoGroup.add(cylinder, topCap, bottomCap);
    torsoGroup.position.y = 4; // Adjust group position to be the center
    fighterGroup.add(torsoGroup);
    // --- End Manual Capsule ---

    const headGeometry = new THREE.SphereGeometry(0.8, 32, 16);
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xDEB887 });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 6.5;
    head.castShadow = true;
    fighterGroup.add(head);

    // Glove Material
    const gloveMaterial = new THREE.MeshStandardMaterial({ color: 0xB22222 });

    // Function to create a limb with a proper fighting pose
    const createLimb = (isLeft) => {
        const limbGroup = new THREE.Group();
        const armGeometry = new THREE.CylinderGeometry(0.25, 0.2, 2);
        const armMaterial = new THREE.MeshStandardMaterial({ color: 0xDEB887 });
        const arm = new THREE.Mesh(armGeometry, armMaterial);
        
        const gloveGeometry = new THREE.SphereGeometry(0.4, 16, 8);
        const glove = new THREE.Mesh(gloveGeometry, gloveMaterial);

        arm.position.y = -1;
        glove.position.y = -2;

        limbGroup.add(arm);
        limbGroup.add(glove);
        
        // Position and rotate for a fighting stance
        const xPos = isLeft ? -1.2 : 1.2;
        limbGroup.position.set(xPos, 5.5, 0.5);
        limbGroup.rotation.x = THREE.MathUtils.degToRad(-80); // Rotate arms forward
        limbGroup.rotation.z = THREE.MathUtils.degToRad(isLeft ? -35 : 35); // Angle arms inward

        return limbGroup;
    };

    const armLeft = createLimb(true);
    const armRight = createLimb(false);
    fighterGroup.add(armLeft, armRight);

    return fighterGroup;
}


// Function to create the referee model
function createReferee() {
    const refereeGroup = new THREE.Group();
    const torsoMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2.5, 8), torsoMaterial);
    torso.position.y = 3.25;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 8), new THREE.MeshStandardMaterial({ color: 0xDEB887 }));
    head.position.y = 5.2;

    refereeGroup.add(torso, head);
    return refereeGroup;
}


function createTaleOfTheTapePlane(fighterData, rawScore, finalScore) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 256;

    ctx.fillStyle = 'rgba(20, 30, 40, 0.8)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'white';
    ctx.font = 'bold 32px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(fighterData.name, canvas.width / 2, 50);

    ctx.font = '24px Inter, sans-serif';
    ctx.fillText(`Record: ${fighterData.record.tko}-${fighterData.record.ko}-${fighterData.record.losses}`, canvas.width / 2, 100);
    ctx.fillText(`Raw Score: ${rawScore.toFixed(2)}`, canvas.width / 2, 140);
    ctx.fillText(`Final Score: ${finalScore.toFixed(2)}`, canvas.width / 2, 180);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    const geometry = new THREE.PlaneGeometry(8, 4);
    const plane = new THREE.Mesh(geometry, material);
    
    return plane;
}

// Animation loop
function animate() {
    animationFrameId = requestAnimationFrame(animate);
    
    // Add idle animations
    const time = Date.now() * 0.001;
    if (fighter1) {
        fighter1.position.y = Math.sin(time * 2) * 0.2;
    }
    if (fighter2) {
        fighter2.position.y = Math.sin(time * 2 + 1) * 0.2;
    }

    controls.update();
    renderer.render(scene, camera);
}

// Handle window resizing
function onWindowResize() {
    const canvasContainer = document.getElementById('three-canvas-container');
    if (canvasContainer) {
        camera.aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    }
}

export function resetScene() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
    window.removeEventListener('resize', onWindowResize);
     // Reset corner post colors
    if (cornerPost1 && cornerPost2 && cornerPost3 && cornerPost4) {
        const gray = 0x888888;
        cornerPost2.material.color.setHex(gray);
        cornerPost4.material.color.setHex(gray);
    }
}

// --- Animation Functions ---

export function updateUI(health1, stamina1, health2, stamina2) {
    const healthBar1 = document.getElementById('health-bar-1-3d');
    const healthBar2 = document.getElementById('health-bar-2-3d');
    const staminaBar1 = document.getElementById('stamina-bar-1-3d');
    const staminaBar2 = document.getElementById('stamina-bar-2-3d');

    if (healthBar1) healthBar1.style.width = `${health1}%`;
    if (healthBar2) healthBar2.style.width = `${health2}%`;
    if (staminaBar1) staminaBar1.style.width = `${stamina1}%`;
    if (staminaBar2) staminaBar2.style.width = `${stamina2}%`;
}


export function animatePunch(attackerIndex) {
    // This is a placeholder for a more complex punch animation
    const attacker = attackerIndex === 1 ? fighter1 : fighter2;
    const initialY = attacker.position.y;
    attacker.position.y = initialY + 0.5;
    setTimeout(() => {
        if(attacker) attacker.position.y = initialY;
    }, 150);
}

export function animateHit(defenderIndex) {
    // This is a placeholder for a more complex hit animation
    const defender = defenderIndex === 1 ? fighter1 : fighter2;
    const initialRotation = defender.rotation.clone();
    defender.rotation.z += 0.3;
     setTimeout(() => {
        if(defender) defender.rotation.z = initialRotation.z;
    }, 150);
}

export function animateKnockdown(fighterIndex) {
    const downedFighter = fighterIndex === 1 ? fighter1 : fighter2;
    const targetRotation = Math.PI / 2; // 90 degrees
    downedFighter.rotation.x = targetRotation;
}

export function animateGetUp(fighterIndex) {
    const fighter = fighterIndex === 1 ? fighter1 : fighter2;
    fighter.rotation.x = 0;
}

export async function animateFightersToCenter() {
    const duration = 1000; // 1 second
    const f1Start = new THREE.Vector3(-10, 0, -10);
    const f2Start = new THREE.Vector3(10, 0, 10);
    const f1End = new THREE.Vector3(-4, 0, 0);
    const f2End = new THREE.Vector3(4, 0, 0);

    return new Promise(resolve => {
        let startTime = null;
        function move(timestamp) {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            
            fighter1.position.lerpVectors(f1Start, f1End, progress);
            fighter2.position.lerpVectors(f2Start, f2End, progress);

            fighter1.lookAt(fighter2.position);
            fighter2.lookAt(fighter1.position);
            
            if (progress < 1) {
                requestAnimationFrame(move);
            } else {
                resolve();
            }
        }
        requestAnimationFrame(move);
    });
}

export async function animateFightersToCorners() {
     const duration = 1000;
    const f1Start = fighter1.position.clone();
    const f2Start = fighter2.position.clone();
    const f1End = new THREE.Vector3(-10, 0, -10);
    const f2End = new THREE.Vector3(10, 0, 10);

    return new Promise(resolve => {
        let startTime = null;
        function move(timestamp) {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            
            fighter1.position.lerpVectors(f1Start, f1End, progress);
            fighter2.position.lerpVectors(f2Start, f2End, progress);
            
            if (progress < 1) {
                requestAnimationFrame(move);
            } else {
                resolve();
            }
        }
        requestAnimationFrame(move);
    });
}

export async function animateTaleOfTheTape(fighter1Data, rawScore1, finalScore1, fighter2Data, rawScore2, finalScore2) {
    referee.visible = true;
    referee.position.set(0, 0, 0);
    
    taleOfTheTapePlane1 = createTaleOfTheTapePlane(fighter1Data, rawScore1, finalScore1);
    taleOfTheTapePlane2 = createTaleOfTheTapePlane(fighter2Data, rawScore2, finalScore2);
    
    taleOfTheTapePlane1.position.set(-6, 6, 0);
    taleOfTheTapePlane2.position.set(6, 6, 0);

    scene.add(taleOfTheTapePlane1, taleOfTheTapePlane2);

    return new Promise(resolve => {
        setTimeout(() => {
            scene.remove(taleOfTheTapePlane1, taleOfTheTapePlane2);
            referee.visible = false;
            resolve();
        }, 8000); // Display for 8 seconds
    });
}

export function clearLog() {
    const logElement = document.getElementById('fight-log-3d');
    if (logElement) {
        logElement.innerHTML = '';
    }
}

export function logMessage(html) {
    const logElement = document.getElementById('fight-log-3d');
    if (logElement) {
        logElement.insertAdjacentHTML('beforeend', html);
        logElement.scrollTop = logElement.scrollHeight;
    }
}

