/* ============================================================
   MiniCraft — игровой движок (2D-песочница в стиле Minecraft)
   Мир загружается из JSON, сгенерированного PHP (index.php).
   ============================================================ */
'use strict';

/* ---------- Конфигурация, полученная от PHP ---------- */
const CONFIG = JSON.parse(document.getElementById('game-config').textContent);

const TILE        = 32;                    // размер блока в пикселях
const WORLD_W     = CONFIG.worldWidth;
const WORLD_H     = CONFIG.worldHeight;
const world       = CONFIG.world.map(row => [...row]); // копируем — можно менять

/* Палитра и свойства блоков: id -> {name, color, top?, solid} */
const BLOCK_DEFS = {
    1: { name: 'grass',  color: '#6a4a2a', top: '#4caf50', solid: true  },
    2: { name: 'dirt',   color: '#7a5230', solid: true  },
    3: { name: 'stone',  color: '#8a8f96', solid: true  },
    4: { name: 'wood',   color: '#8b5a2b', solid: true  },
    5: { name: 'leaves', color: '#2e7d32', solid: false },
    6: { name: 'sand',   color: '#dbd08a', solid: true  },
    7: { name: 'water',  color: '#3d7ecb', solid: false },
    8: { name: 'plank',  color: '#b8874b', solid: true  },
    9: { name: 'brick',  color: '#a5443c', solid: true  },
};

/* Слоты хотбара: [id блока, имя, количество из инвентаря PHP] */
const hotbar = [
    { id: 8, count: CONFIG.inventory.plank },
    { id: 9, count: CONFIG.inventory.brick },
    { id: 4, count: CONFIG.inventory.wood },
    { id: 6, count: CONFIG.inventory.sand },
    { id: 2, count: Infinity },
    { id: 3, count: Infinity },
];
let selectedSlot = 0;

/* ---------- Canvas ---------- */
const canvas = document.getElementById('game-canvas');
const ctx    = canvas.getContext('2d');

/* ---------- Игрок ---------- */
const player = {
    x: CONFIG.spawn.x * TILE,          // позиция в пикселях (левый верхний угол)
    y: CONFIG.spawn.y * TILE,
    w: TILE * 0.7,                     // уже блока, чтобы проходить в проёмах
    h: TILE * 1.8,
    vx: 0, vy: 0,
    speed: 4.2,
    jump: 9.5,
    onGround: false,
    facingRight: true,
};

/* Камера: мир больше экрана — скроллfollow игрока */
const camera = { x: 0, y: 0 };

/* ---------- Ввод ---------- */
const keys = {};
window.addEventListener('keydown', e => {
    keys[e.code] = true;
    // Выбор слота цифрами 1–6
    if (/^Digit[1-6]$/.test(e.code)) {
        selectSlot(parseInt(e.code.slice(5), 10) - 1);
    }
    if (['Space','ArrowUp','ArrowDown'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const dir = e.deltaY > 0 ? 1 : -1;
    selectSlot((selectedSlot + dir + hotbar.length) % hotbar.length);
}, { passive: false });

canvas.addEventListener('contextmenu', e => e.preventDefault());

let mouse = { x: 0, y: 0 };
canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
    mouse.y = (e.clientY - r.top)  * (canvas.height / r.height);
});

canvas.addEventListener('mousedown', e => {
    const bx = Math.floor((mouse.x + camera.x) / TILE);
    const by = Math.floor((mouse.y + camera.y) / TILE);
    if (!inBounds(bx, by)) return;

    // Ограничение радиуса взаимодействия (~5 блоков от центра игрока)
    const cx = player.x + player.w / 2, cy = player.y + player.h / 2;
    const dist = Math.hypot(bx * TILE + TILE / 2 - cx, by * TILE + TILE / 2 - cy);
    if (dist > TILE * 5.5) return;

    if (e.button === 0) breakBlock(bx, by);       // ЛКМ — сломать
    else if (e.button === 2) placeBlock(bx, by);  // ПКМ — поставить
});

/* ---------- Взаимодействие с блоками ---------- */
function inBounds(x, y) {
    return x >= 0 && x < WORLD_W && y >= 0 && y < WORLD_H;
}

function isSolid(x, y) {
    if (!inBounds(x, y)) return true;            // за краями мира — стена
    const def = BLOCK_DEFS[world[y][x]];
    return def ? !!def.solid : false;
}

function breakBlock(bx, by) {
    const id = world[by][bx];
    if (id === 0) return;
    world[by][bx] = 0;
    // Добытый блок падает в хотбар (если он собираемый)
    const slot = hotbar.find(s => s.id === id);
    if (slot && slot.count !== Infinity) slot.count++;
    renderHotbar();
    spawnParticles(bx, by, BLOCK_DEFS[id]?.color || '#999');
}

function placeBlock(bx, by) {
    if (world[by][bx] !== 0) return;
    const slot = hotbar[selectedSlot];
    if (!slot || slot.count <= 0) return;

    // Нельзя ставить блок внутрь игрока
    const px1 = Math.floor(player.x / TILE),        py1 = Math.floor(player.y / TILE);
    const px2 = Math.floor((player.x + player.w - 1) / TILE);
    const py2 = Math.floor((player.y + player.h - 1) / TILE);
    if (bx >= px1 && bx <= px2 && by >= py1 && by <= py2) return;

    world[by][bx] = slot.id;
    if (slot.count !== Infinity) slot.count--;
    renderHotbar();
}

/* ---------- Частицы при разрушении блока ---------- */
const particles = [];
function spawnParticles(bx, by, color) {
    for (let i = 0; i < 10; i++) {
        particles.push({
            x: bx * TILE + TILE / 2,
            y: by * TILE + TILE / 2,
            vx: (Math.random() - 0.5) * 6,
            vy: (Math.random() - 0.8) * 6,
            life: 30 + Math.random() * 20,
            color,
        });
    }
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.35; p.life--;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

/* ---------- Физика игрока ---------- */
function collides(px, py) {
    const x1 = Math.floor(px / TILE);
    const x2 = Math.floor((px + player.w - 0.01) / TILE);
    const y1 = Math.floor(py / TILE);
    const y2 = Math.floor((py + player.h - 0.01) / TILE);
    for (let y = y1; y <= y2; y++)
        for (let x = x1; x <= x2; x++)
            if (isSolid(x, y)) return true;
    return false;
}

function updatePlayer() {
    // Горизонтальное движение
    let move = 0;
    if (keys['KeyA'] || keys['ArrowLeft'])  move -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) move += 1;
    player.vx = move * player.speed;
    if (move > 0) player.facingRight = true;
    if (move < 0) player.facingRight = false;

    // Прыжок
    if ((keys['KeyW'] || keys['ArrowUp'] || keys['Space']) && player.onGround) {
        player.vy = -player.jump;
        player.onGround = false;
    }

    // Гравитация
    player.vy += 0.45;
    if (player.vy > 14) player.vy = 14;

    // Движение по X с проверкой коллизий
    let nx = player.x + player.vx;
    if (collides(nx, player.y)) {
        while (!collides(nx, player.y)) nx += Math.sign(player.vx);
        nx -= Math.sign(player.vx);
    }
    player.x = nx;

    // Движение по Y
    let ny = player.y + player.vy;
    player.onGround = false;
    if (collides(player.x, ny)) {
        while (!collides(player.x, ny)) ny += Math.sign(player.vy);
        ny -= Math.sign(player.vy);
        if (player.vy > 0) player.onGround = true;
        player.vy = 0;
    }
    player.y = ny;

    // Страховка от падения за мир
    if (player.y > WORLD_H * TILE + 200) {
        player.x = CONFIG.spawn.x * TILE;
        player.y = CONFIG.spawn.y * TILE;
        player.vy = 0;
    }
}

/* ---------- Камера ---------- */
function updateCamera() {
    const targetX = player.x + player.w / 2 - canvas.width / 2;
    const targetY = player.y + player.h / 2 - canvas.height / 2;
    camera.x += (targetX - camera.x) * 0.15;
    camera.y += (targetY - camera.y) * 0.15;
    camera.x = Math.max(0, Math.min(camera.x, WORLD_W * TILE - canvas.width));
    camera.y = Math.max(-TILE * 4, Math.min(camera.y, WORLD_H * TILE - canvas.height));
}

/* ---------- Отрисовка ---------- */
function drawSky() {
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#78b7e8');
    grad.addColorStop(1, '#bfe3ff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Солнце
    ctx.fillStyle = 'rgba(255, 240, 180, 0.9)';
    ctx.beginPath();
    ctx.arc(canvas.width - 90, 80, 34, 0, Math.PI * 2);
    ctx.fill();
}

function drawBlock(bx, by, sx, sy) {
    const id = world[by][bx];
    if (id === 0) return;
    const def = BLOCK_DEFS[id];
    if (!def) return;

    ctx.fillStyle = def.color;
    ctx.fillRect(sx, sy, TILE, TILE);

    // Тёмная кромка снизу/справа для объёма
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(sx, sy + TILE - 4, TILE, 4);
    ctx.fillRect(sx + TILE - 4, sy, 4, TILE);

    if (def.top) { // трава — зелёная шапка
        ctx.fillStyle = def.top;
        ctx.fillRect(sx, sy, TILE, 7);
    }
    if (id === 4) { // бревно — вертикальные полосы
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(sx + 6, sy, 3, TILE);
        ctx.fillRect(sx + 20, sy, 3, TILE);
    }
    if (id === 7) { // вода — полупрозрачность + блик
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(sx, sy, TILE, 4);
    }
    if (id === 9) { // кирпич — кладка
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx + 1, sy + 1, TILE / 2 - 2, TILE / 2 - 2);
        ctx.strokeRect(sx + TILE / 2 + 1, sy + TILE / 2 + 1, TILE / 2 - 3, TILE / 2 - 3);
    }

    // Пиксельная сетка между блоками
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + 0.5, sy + 0.5, TILE - 1, TILE - 1);
}

function drawWorld() {
    const startX = Math.max(0, Math.floor(camera.x / TILE));
    const endX   = Math.min(WORLD_W - 1, Math.ceil((camera.x + canvas.width) / TILE));
    const startY = Math.max(0, Math.floor(camera.y / TILE));
    const endY   = Math.min(WORLD_H - 1, Math.ceil((camera.y + canvas.height) / TILE));

    for (let by = startY; by <= endY; by++) {
        for (let bx = startX; bx <= endX; bx++) {
            drawBlock(bx, by, Math.round(bx * TILE - camera.x), Math.round(by * TILE - camera.y));
        }
    }
}

function drawPlayer() {
    const sx = player.x - camera.x;
    const sy = player.y - camera.y;

    // Тело (рубашка)
    ctx.fillStyle = '#00a8a8';                       // бирюзовая футболка Стива
    ctx.fillRect(sx, sy + player.h * 0.35, player.w, player.h * 0.35);
    // Штаны
    ctx.fillStyle = '#3f51b5';
    ctx.fillRect(sx, sy + player.h * 0.7, player.w, player.h * 0.3);
    // Голова
    const hw = player.w * 0.8;
    ctx.fillStyle = '#c88b5a';
    ctx.fillRect(sx + (player.w - hw) / 2, sy, hw, player.h * 0.35);
    // Волосы
    ctx.fillStyle = '#4a2f1b';
    ctx.fillRect(sx + (player.w - hw) / 2, sy, hw, 6);
    // Глаза
    ctx.fillStyle = '#fff';
    const eyeY = sy + player.h * 0.16;
    const eyeX = player.facingRight ? sx + player.w * 0.35 : sx + player.w * 0.1;
    ctx.fillRect(eyeX, eyeY, 5, 5);
    ctx.fillRect(eyeX + 9, eyeY, 5, 5);
    ctx.fillStyle = '#20308c';
    ctx.fillRect(eyeX + (player.facingRight ? 3 : 0), eyeY, 2, 5);
    ctx.fillRect(eyeX + 9 + (player.facingRight ? 3 : 0), eyeY, 2, 5);
}

function drawCursor() {
    const bx = Math.floor((mouse.x + camera.x) / TILE);
    const by = Math.floor((mouse.y + camera.y) / TILE);
    if (!inBounds(bx, by)) return;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx * TILE - camera.x + 1, by * TILE - camera.y + 1, TILE - 2, TILE - 2);
}

function drawParticles() {
    for (const p of particles) {
        ctx.globalAlpha = Math.max(0, p.life / 40);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - camera.x - 2, p.y - camera.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
}

/* ---------- Хотбар (DOM) ---------- */
const hotbarEl = document.getElementById('hotbar');

function buildHotbar() {
    hotbarEl.innerHTML = '';
    hotbar.forEach((slot, i) => {
        const def = BLOCK_DEFS[slot.id];
        const el = document.createElement('div');
        el.className = 'slot' + (i === selectedSlot ? ' selected' : '');
        el.title = def.name;
        el.innerHTML = `
            <span class="key">${i + 1}</span>
            <span class="swatch" style="background:${def.color}"></span>
            <span class="name">${def.name}</span>
            <span class="count">${slot.count === Infinity ? '∞' : slot.count}</span>`;
        el.addEventListener('click', () => selectSlot(i));
        hotbarEl.appendChild(el);
    });
}

function renderHotbar() { buildHotbar(); }

function selectSlot(i) {
    selectedSlot = Math.max(0, Math.min(hotbar.length - 1, i));
    renderHotbar();
}

/* ---------- HUD: координаты и FPS ---------- */
const posEl = document.getElementById('pos-display');
const fpsEl = document.getElementById('fps-display');
let frames = 0, lastFpsTime = performance.now();

function updateHud(now) {
    posEl.textContent = `X: ${Math.floor(player.x / TILE)}, Y: ${Math.floor(player.y / TILE)}`;
    frames++;
    if (now - lastFpsTime >= 1000) {
        fpsEl.textContent = `FPS: ${frames}`;
        frames = 0;
        lastFpsTime = now;
    }
}

/* ---------- Игровой цикл ---------- */
function gameLoop(now) {
    updatePlayer();
    updateCamera();
    updateParticles();

    drawSky();
    drawWorld();
    drawPlayer();
    drawParticles();
    drawCursor();
    updateHud(now);

    requestAnimationFrame(gameLoop);
}

buildHotbar();
requestAnimationFrame(gameLoop);
