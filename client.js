
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

// ELEMENTY STRONY
const loginScreen = document.getElementById("loginScreen");
const gameScreen = document.getElementById("gameScreen");
const loginMessage = document.getElementById("loginMessage");
const coinsElement = document.getElementById("coins");
const statusElement = document.getElementById("status");

let token = "";
let nick = "";
let coins = 0;
let socket;

let scene, camera, renderer;
let localPlayer;
let enemies = [];
let remotePlayers = new Map();
let bullets = [];

let yaw = 0;
let pitch = -0.12;
let velocityY = 0;
let onGround = true;
let lastMoveSend = 0;

const keys = {};
const joystick = { x: 0, y: 0 };

let shooting = false;
let cameraDistance = 5;

// LOGOWANIE I REJESTRACJA

async function account(action) {
  const enteredNick = document.getElementById("nick").value.trim();
  const password = document.getElementById("password").value;

  loginMessage.textContent = "Chwilka...";

  try {
    const response = await fetch("/api/" + action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nick: enteredNick,
        password
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Błąd logowania.");
    }

    token = data.token;
    nick = data.nick;

    loginScreen.classList.add("hidden");
    gameScreen.classList.remove("hidden");

    document.getElementById("playerName").textContent = nick;

    startGame();
  } catch (error) {
    loginMessage.textContent = error.message;
  }
}

document.getElementById("loginButton").onclick =
  () => account("login");

document.getElementById("registerButton").onclick =
  () => account("register");

// GRA 3D

function startGame() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x91b8d1);
  scene.fog = new THREE.Fog(0x91b8d1, 35, 110);

  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    500
  );

  renderer = new THREE.WebGLRenderer({
    antialias: true
  });

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  document.getElementById("gameScreen").appendChild(renderer.domElement);

  const light = new THREE.HemisphereLight(0xffffff, 0x505050, 2);
  scene.add(light);

  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(20, 35, 15);
  sun.castShadow = true;
  scene.add(sun);

  makeWorld();

  localPlayer = createHuman(nick, 0x287bd1);
  scene.add(localPlayer.group);

  // Przeciwnicy tworzeni dopiero po utworzeniu mapy.
  for (let i = 0; i < 6; i++) {
    addEnemy();
  }

  connectMultiplayer();
  setupControls();

  window.addEventListener("resize", resize);
  animate();
}

// MAPA

function makeWorld() {
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(120, 1, 120),
    new THREE.MeshStandardMaterial({ color: 0x526344 })
  );

  ground.position.y = -0.55;
  ground.receiveShadow = true;
  scene.add(ground);

  const road = new THREE.Mesh(
    new THREE.BoxGeometry(120, 0.05, 12),
    new THREE.MeshStandardMaterial({ color: 0x353535 })
  );

  road.position.set(0, -0.01, 0);
  scene.add(road);

  // Magazyny
  createBuilding(-17, 5, -15, 17, 10, 24, 0x777b80);
  createBuilding(17, 5, -15, 17, 10, 24, 0x696e74);
  createBuilding(-25, 5, 22, 18, 10, 15, 0x858585);
  createBuilding(25, 5, 22, 18, 10, 15, 0x858585);

  // Skrzynie
  for (let i = 0; i < 12; i++) {
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshStandardMaterial({ color: 0x96652e })
    );

    crate.position.set(
      Math.random() * 35 - 17,
      1,
      Math.random() * 45 - 22
    );

    crate.castShadow = true;
    scene.add(crate);
  }

  // Światła i drzewa
  for (let i = 0; i < 15; i++) {
    const tree = new THREE.Group();

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.35, 3),
      new THREE.MeshStandardMaterial({ color: 0x604127 })
    );
    trunk.position.y = 1.5;
    tree.add(trunk);

    const leaves = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x285d2b })
    );
    leaves.position.y = 3.5;
    tree.add(leaves);

    tree.position.set(
      Math.random() * 100 - 50,
      0,
      Math.random() * 100 - 50
    );

    scene.add(tree);
  }
}

function createBuilding(x, y, z, w, h, d, color) {
  const building = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color })
  );

  building.position.set(x, y, z);
  building.castShadow = true;
  building.receiveShadow = true;
  scene.add(building);
}

// POSTAĆ CZŁOWIEKA 3D

function createHuman(name, color) {
  const group = new THREE.Group();

  const bodyMaterial = new THREE.MeshStandardMaterial({ color });
  const skinMaterial = new THREE.MeshStandardMaterial({
    color: 0xe4b58b
  });

  const darkMaterial = new THREE.MeshStandardMaterial({
    color: 0x252525
  });

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 16, 16),
    skinMaterial
  );
  head.position.y = 1.75;
  group.add(head);

  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.65, 0.8, 0.35),
    bodyMaterial
  );
  torso.position.y = 1.15;
  group.add(torso);

  const leftArm = new THREE.Group();
  const rightArm = new THREE.Group();

  function makeArm(arm, x) {
    arm.position.set(x, 1.45, 0);

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.19, 0.65, 0.2),
      skinMaterial
    );

    mesh.position.y = -0.3;
    arm.add(mesh);
    group.add(arm);
  }

  makeArm(leftArm, -0.43);
  makeArm(rightArm, 0.43);

  const leftLeg = new THREE.Group();
  const rightLeg = new THREE.Group();

  function makeLeg(leg, x) {
    leg.position.set(x, 0.75, 0);

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.65, 0.25),
      darkMaterial
    );

    mesh.position.y = -0.32;
    leg.add(mesh);

    const shoe = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.15, 0.42),
      darkMaterial
    );

    shoe.position.set(0, -0.62, -0.06);
    leg.add(shoe);

    group.add(leg);
  }

  makeLeg(leftLeg, -0.19);
  makeLeg(rightLeg, 0.19);

  // Broń
  const weapon = new THREE.Group();

  const gunBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.16, 0.7),
    darkMaterial
  );

  gunBody.position.z = -0.3;
  weapon.add(gunBody);

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.35),
    darkMaterial
  );

  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = -0.8;
  weapon.add(barrel);

  weapon.position.set(0.43, 1.15, -0.25);
  group.add(weapon);

  return {
    group,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    name,
    moving: false
  };
}

// PRZECIWNICY

function addEnemy() {
  const enemy = createHuman("Przeciwnik", 0xb93636);

  enemy.group.position.set(
    Math.random() * 30 - 15,
    0,
    -Math.random() * 35 - 8
  );

  enemy.hp = 100;
  enemy.alive = true;
  enemy.phase = Math.random() * 10;

  scene.add(enemy.group);
  enemies.push(enemy);
}

// MULTIPLAYER

function connectMultiplayer() {
  socket = io({
    auth: { token }
  });

  socket.on("connect", () => {
    statusElement.textContent = "Online";
  });

  socket.on("connect_error", () => {
    statusElement.textContent = "Błąd połączenia";
  });

  socket.on("world:players", list => {
    list.forEach(addRemotePlayer);
  });

  socket.on("player:joined", addRemotePlayer);

  socket.on("player:moved", data => {
    const player = remotePlayers.get(data.id);
    if (!player) return;

    player.group.position.set(data.x, data.y, data.z);
    player.group.rotation.y = data.rotation;
  });

  socket.on("player:left", id => {
    const player = remotePlayers.get(id);
    if (!player) return;

    scene.remove(player.group);
    remotePlayers.delete(id);
  });
}

function addRemotePlayer(data) {
  if (!data || data.id === socket.id) return;
  if (remotePlayers.has(data.id)) return;

  const player = createHuman(data.nick, 0x27aa75);

  player.group.position.set(data.x || 0, data.y || 0, data.z || 0);
  player.group.rotation.y = data.rotation || 0;

  scene.add(player.group);
  remotePlayers.set(data.id, player);
}

// STEROWANIE

function setupControls() {
  window.addEventListener("keydown", e => {
    keys[e.code] = true;

    if (e.code === "Space") jump();
  });

  window.addEventListener("keyup", e => {
    keys[e.code] = false;
  });

  renderer.domElement.addEventListener("click", () => {
    if (window.matchMedia("(pointer:fine)").matches) {
      renderer.domElement.requestPointerLock();
    }
  });

  document.addEventListener("mousemove", e => {
    if (document.pointerLockElement !== renderer.domElement) return;

    yaw -= e.movementX * 0.002;
    pitch -= e.movementY * 0.002;

    pitch = Math.max(-0.8, Math.min(0.45, pitch));
  });

  renderer.domElement.addEventListener("mousedown", e => {
    if (e.button === 0 && document.pointerLockElement === renderer.domElement) {
      shoot();
    }
  });

  document.getElementById("fireButton").addEventListener("pointerdown", e => {
    e.preventDefault();
    shooting = true;
    shoot();
  });

  document.getElementById("fireButton").addEventListener("pointerup", () => {
    shooting = false;
  });

  document.getElementById("jumpButton").addEventListener("pointerdown", e => {
    e.preventDefault();
    jump();
  });

  const joy = document.getElementById("joystick");
  const stick = document.getElementById("stick");

  let joyPointer = null;

  joy.addEventListener("pointerdown", e => {
    joyPointer = e.pointerId;
    joy.setPointerCapture(joyPointer);
    updateJoystick(e);
  });

  joy.addEventListener("pointermove", e => {
    if (e.pointerId === joyPointer) updateJoystick(e);
  });

  function stopJoystick(e) {
    if (e.pointerId !== joyPointer) return;

    joyPointer = null;
    joystick.x = 0;
    joystick.y = 0;
    stick.style.transform = "translate(0px, 0px)";
  }

  joy.addEventListener("pointerup", stopJoystick);
  joy.addEventListener("pointercancel", stopJoystick);

  function updateJoystick(e) {
    const rect = joy.getBoundingClientRect();

    let x = e.clientX - (rect.left + rect.width / 2);
    let y = e.clientY - (rect.top + rect.height / 2);

    const length = Math.hypot(x, y);
    const max = 38;

    if (length > max) {
      x = x / length * max;
      y = y / length * max;
    }

    joystick.x = x / max;
    joystick.y = y / max;

    stick.style.transform = `translate(${x}px, ${y}px)`;
  }
}

function jump() {
  if (!onGround) return;

  velocityY = 7;
  onGround = false;
}

// STRZELANIE

function shoot() {
  if (!localPlayer) return;

  const direction = new THREE.Vector3(
    -Math.sin(yaw),
    Math.sin(pitch),
    -Math.cos(yaw)
  ).normalize();

  const start = localPlayer.group.position.clone();
  start.y += 1.3;

  const bullet = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe36a })
  );

  bullet.position.copy(start);
  scene.add(bullet);

  bullets.push({
    mesh: bullet,
    direction,
    life: 1.5
  });

  // Lokalny test trafienia przeciwników.
  const ray = new THREE.Raycaster(start, direction, 0, 50);

  const targets = enemies
    .filter(enemy => enemy.alive)
    .map(enemy => enemy.group);

  const hits = ray.intersectObjects(targets, true);

  if (hits.length > 0) {
    let object = hits[0].object;

    while (object.parent && !enemies.some(e => e.group === object)) {
      object = object.parent;
    }

    const enemy = enemies.find(e => e.group === object);

    if (enemy && enemy.alive) {
      enemy.hp -= 50;

      if (enemy.hp <= 0) {
        enemy.alive = false;
        scene.remove(enemy.group);

        coins += 15;
        coinsElement.textContent = "🪙 " + coins;

        setTimeout(() => {
          enemy.hp = 100;
          enemy.alive = true;
          enemy.group.position.set(
            Math.random() * 30 - 15,
            0,
            -Math.random() * 35 - 8
          );
          scene.add(enemy.group);
        }, 2500);
      }
    }
  }
}

// RUCH I ANIMACJA

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  if (!localPlayer) return;

  let forward = 0;
  let side = 0;

  if (keys["KeyW"] || keys["ArrowUp"]) forward += 1;
  if (keys["KeyS"] || keys["ArrowDown"]) forward -= 1;
  if (keys["KeyD"] || keys["ArrowRight"]) side += 1;
  if (keys["KeyA"] || keys["ArrowLeft"]) side -= 1;

  forward += -joystick.y;
  side += joystick.x;

  const length = Math.hypot(forward, side);

  if (length > 1) {
    forward /= length;
    side /= length;
  }

  const speed = keys["ShiftLeft"] ? 8 : 5;

  const moveX = (
    -Math.sin(yaw) * forward +
    Math.cos(yaw) * side
  ) * speed * delta;

  const moveZ = (
    -Math.cos(yaw) * forward -
    Math.sin(yaw) * side
  ) * speed * delta;

  localPlayer.group.position.x += moveX;
  localPlayer.group.position.z += moveZ;

  localPlayer.moving = Math.abs(forward) + Math.abs(side) > 0.05;

  if (localPlayer.moving) {
    const swing = Math.sin(time * 10) * 0.55;

    localPlayer.leftLeg.rotation.x = swing;
    localPlayer.rightLeg.rotation.x = -swing;
    localPlayer.leftArm.rotation.x = -swing * 0.6;
    localPlayer.rightArm.rotation.x = swing * 0.6;
  } else {
    localPlayer.leftLeg.rotation.x = 0;
    localPlayer.rightLeg.rotation.x = 0;
    localPlayer.leftArm.rotation.x = 0;
    localPlayer.rightArm.rotation.x = 0;
  }

  // Skakanie
  velocityY -= 18 * delta;
  localPlayer.group.position.y += velocityY * delta;

  if (localPlayer.group.position.y <= 0) {
    localPlayer.group.position.y = 0;
    velocityY = 0;
    onGround = true;
  }

  localPlayer.group.rotation.y = yaw;

  // Kamera za graczem
  const cameraOffset = new THREE.Vector3(
    Math.sin(yaw) * cameraDistance,
    2.3 - pitch * 2,
    Math.cos(yaw) * cameraDistance
  );

  camera.position.copy(
    localPlayer.group.position.clone().add(cameraOffset)
  );

  const lookAt = localPlayer.group.position.clone();
  lookAt.y += 1.35;

  camera.lookAt(lookAt);

  // Pociski
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];

    bullet.mesh.position.addScaledVector(
      bullet.direction,
      35 * delta
    );

    bullet.life -= delta;

    if (bullet.life <= 0) {
      scene.remove(bullet.mesh);
      bullets.splice(i, 1);
    }
  }

  // Animacja przeciwników
  enemies.forEach(enemy => {
    if (!enemy.alive) return;

    enemy.phase += delta * 2;

    enemy.group.position.x += Math.sin(enemy.phase) * delta * 0.5;
    enemy.leftLeg.rotation.x = Math.sin(enemy.phase * 3) * 0.3;
    enemy.rightLeg.rotation.x = -Math.sin(enemy.phase * 3) * 0.3;
  });

  // Wysyłanie pozycji do serwera
  if (socket?.connected && time - lastMoveSend > 0.05) {
    lastMoveSend = time;

    socket.emit("player:move", {
      x: localPlayer.group.position.x,
      y: localPlayer.group.position.y,
      z: localPlayer.group.position.z,
      rotation: yaw
    });
  }

  renderer.render(scene, camera);
}

function resize() {
  if (!camera || !renderer) return;

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
