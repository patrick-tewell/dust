// ============================================================
//  Idle Planet – Canvas-based game
// ============================================================

// --- Canvas setup ---
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// --- DOM handles ---
const createDustBtn = document.getElementById("createDust");
const dustPerClickBtn = document.getElementById("dustPerClickButton");
const dustSizeBtn = document.getElementById("dustSizeButton");
const speedBtn = document.getElementById("speedButton");
const cooldownBar = document.getElementById("cooldownBar");

const massDisplayEl = document.getElementById("massDisplay");
const dustLevelEl = document.getElementById("dustLevelDisplay");
const sizeLevelEl = document.getElementById("sizeLevelDisplay");
const speedLevelEl = document.getElementById("speedLevelDisplay");
const gravityLevelEl = document.getElementById("gravityLevelDisplay");
const dustCostEl = document.getElementById("dustCostDisplay");
const sizeCostEl = document.getElementById("sizeCostDisplay");
const speedCostEl = document.getElementById("speedCostDisplay");

// --- Game state ---
let dustPerClick = 1;
let dustMass = 1;        // mass added to planet per particle absorbed
let speedLevel = 1;      // controls cooldown between clicks

let starMass = 100;    // accumulated mass – start at 100
let planetRadius = 12 + Math.sqrt(starMass) * 1.2;  // initial radius matching starting mass


const particles = [];    // active dust particles

// --- Upgrade caps ---
const MAX_DUST_PER_CLICK = 10;
const MAX_DUST_MASS = 10;
const MAX_SPEED = 10;
const MAX_STAR_MASS = 10000;

// Gravity scales linearly with planet mass: 1 at 0, 10 at MAX_STAR_MASS
function getGravityLevel() {
    return 1 + (starMass / MAX_STAR_MASS) * 9;
}

// --- Cost function (scales with current mass) ---
// Base cost 10, multiplied by level, scaled by total mass bracket
function getUpgradeCost(currentLevel) {
    return Math.floor(10 * currentLevel * (1 + MAX_STAR_MASS / 250));
}

function refreshCosts() {
    dustCostEl.textContent = dustPerClick >= MAX_DUST_PER_CLICK ? "MAX" : getUpgradeCost(dustPerClick);
    sizeCostEl.textContent = dustMass >= MAX_DUST_MASS ? "MAX" : getUpgradeCost(dustMass);
    speedCostEl.textContent = speedLevel >= MAX_SPEED ? "MAX" : getUpgradeCost(speedLevel);
}

function refreshSidebar() {
    massDisplayEl.textContent = Math.floor(starMass);
    dustLevelEl.textContent = dustPerClick;
    sizeLevelEl.textContent = dustMass;
    speedLevelEl.textContent = speedLevel;
    gravityLevelEl.textContent = getGravityLevel().toFixed(1);
}

// Flash a button red when purchase is denied
function flashButton(btn) {
    btn.classList.remove("flash-red");
    // Force reflow so animation restarts
    void btn.offsetWidth;
    btn.classList.add("flash-red");
    btn.addEventListener("animationend", () => btn.classList.remove("flash-red"), { once: true });
}

// Generic purchase helper
function tryPurchase(btn, currentLevel, maxLevel, costFn, onSuccess) {
    if (currentLevel >= maxLevel) return;
    const cost = costFn();
    if (starMass < cost) {
        flashButton(btn);
        return;
    }
    starMass -= cost;
    planetRadius = 12 + Math.sqrt(starMass) * 1.2;
    onSuccess();
    refreshSidebar();
    refreshCosts();
    updateMaxedButtons();
}

function updateMaxedButtons() {
    dustPerClickBtn.classList.toggle("maxed", dustPerClick >= MAX_DUST_PER_CLICK);
    dustSizeBtn.classList.toggle("maxed", dustMass >= MAX_DUST_MASS);
    speedBtn.classList.toggle("maxed", speedLevel >= MAX_SPEED);
}

// --- Cooldown state ---
let cooldownEnd = 0;     // timestamp when cooldown expires
let cooldownDuration = 0; // current cooldown length in ms
let onCooldown = false;

// Cooldown scales linearly: 1.25s at lvl 1, 0.25s at lvl 10
function getCooldownMs() {
    return (1.25 - (speedLevel - 1) * (1.0 / 9)) * 1000;
}

// --- Upgrade buttons ---
dustPerClickBtn.addEventListener("click", () => {
    tryPurchase(dustPerClickBtn, dustPerClick, MAX_DUST_PER_CLICK,
        () => getUpgradeCost(dustPerClick),
        () => { dustPerClick += 1; });
});

dustSizeBtn.addEventListener("click", () => {
    tryPurchase(dustSizeBtn, dustMass, MAX_DUST_MASS,
        () => getUpgradeCost(dustMass),
        () => { dustMass += 1; });
});

speedBtn.addEventListener("click", () => {
    tryPurchase(speedBtn, speedLevel, MAX_SPEED,
        () => getUpgradeCost(speedLevel),
        () => { speedLevel += 1; });
});

// Initial UI refresh
refreshSidebar();
refreshCosts();
updateMaxedButtons();

// --- Particle class ---
class Dust {
    constructor(cx, cy) {
        // Spawn at a random angle, at a random orbit distance from center
        const angle = Math.random() * Math.PI * 2;
        const minDist = planetRadius + 40;
        // Keep orbits within the smaller viewport dimension so they stay visible
        const maxDist = Math.min(canvas.width, canvas.height) / 2 - 10;
        const dist = minDist + Math.random() * (maxDist - minDist);

        this.cx = cx;           // center x (of play area)
        this.cy = cy;           // center y
        this.x = cx + Math.cos(angle) * dist;
        this.y = cy + Math.sin(angle) * dist;
        this.radius = 2 + dustMass * 0.5;  // visual size scales with Size upgrade
        this.mass = dustMass;                 // snapshot mass at creation time
        this.alive = true;

        // Orbital velocity (tangent to the radius vector)
        const speed = 1.2 + Math.random() * 0.8;
        this.vx = -Math.sin(angle) * speed;
        this.vy = Math.cos(angle) * speed;
    }

    update(dt) {
        // Always orbit the current screen center (handles resize / zoom)
        this.cx = canvas.width / 2;
        this.cy = canvas.height / 2;

        // Vector from particle to center
        const dx = this.cx - this.x;
        const dy = this.cy - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < planetRadius) {
            // Absorbed by the planet
            this.alive = false;
            starMass = Math.min(starMass + this.mass, MAX_STAR_MASS);
            // Grow planet radius slowly (diminishing returns via sqrt)
            planetRadius = 12 + Math.sqrt(starMass) * 1.2;
            refreshSidebar();
            refreshCosts();
            updateMaxedButtons();
            return;
        }

        // Gravity pull toward center – strength scales with upgrade level
        const gravityStrength = 0.02 * getGravityLevel();
        const ax = (dx / dist) * gravityStrength;
        const ay = (dy / dist) * gravityStrength;

        this.vx += ax;
        this.vy += ay;

        // Light drag so orbits slowly decay (creates the spiral-in effect)
        const drag = 0.999;
        this.vx *= drag;
        this.vy *= drag;

        this.x += this.vx;
        this.y += this.vy;
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = "#e0a35c";
        ctx.fill();
    }
}

// --- Create dust on click (with cooldown) ---
function spawnDust() {
    if (onCooldown) return;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    for (let i = 0; i < dustPerClick; i++) {
        particles.push(new Dust(cx, cy));
    }

    // Start cooldown
    cooldownDuration = getCooldownMs();
    cooldownEnd = performance.now() + cooldownDuration;
    onCooldown = true;
    createDustBtn.classList.add("on-cooldown");
}

createDustBtn.addEventListener("click", spawnDust);

// --- Auto-play ---
const autoPlayBtn = document.getElementById("autoPlayBtn");
let autoPlaying = false;

autoPlayBtn.addEventListener("click", () => {
    autoPlaying = !autoPlaying;
    autoPlayBtn.classList.toggle("active", autoPlaying);
    if (autoPlaying && !onCooldown) spawnDust();
});

// --- Background stars (static, generated once) ---
// Stars stored as normalised viewport coords (0-1) so they cover the full screen.
const stars = [];
function generateStars() {
    stars.length = 0;
    const count = 250;
    for (let i = 0; i < count; i++) {
        stars.push({
            rx: Math.random(),
            ry: Math.random(),
            r: Math.random() * 1.5 + 0.3,
            brightness: Math.random() * 0.5 + 0.3
        });
    }
}
generateStars();
window.addEventListener("resize", generateStars);

function drawStars() {
    const cw = canvas.width;
    const ch = canvas.height;
    for (const s of stars) {
        ctx.beginPath();
        ctx.arc(s.rx * cw, s.ry * ch, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${s.brightness})`;
        ctx.fill();
    }
}

// --- Planet colour helpers ---
// Lerp between two [r,g,b] colours
function lerpColor(a, b, t) {
    return [
        Math.round(a[0] + (b[0] - a[0]) * t),
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t)
    ];
}

// Returns an RGB string that fades deep-red ➜ orange ➜ yellow ➜ white
// as starMass increases.  `t` is clamped 0-1.
function planetColor(t) {
    const stops = [
        [90, 35, 40],     // deep red
        [180, 60, 35],    // red-orange
        [220, 140, 50],   // orange
        [240, 210, 100],  // warm yellow
        [250, 240, 210]   // near-white (never fully white)
    ];
    const seg = t * (stops.length - 1);
    const i = Math.min(Math.floor(seg), stops.length - 2);
    const local = seg - i;
    const c = lerpColor(stops[i], stops[i + 1], local);
    return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function planetHighlight(t) {
    const stops = [
        [168, 68, 72],    // lighter red highlight
        [220, 110, 60],
        [245, 190, 90],
        [255, 235, 170],
        [255, 248, 230]   // soft warm white highlight
    ];
    const seg = t * (stops.length - 1);
    const i = Math.min(Math.floor(seg), stops.length - 2);
    const local = seg - i;
    const c = lerpColor(stops[i], stops[i + 1], local);
    return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// --- Draw planet ---
function drawPlanet() {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    // t ramps 0 ➜ 1 as mass grows, scaled to MAX_STAR_MASS
    const t = Math.min(starMass / MAX_STAR_MASS, 1);
    const coreColor = planetColor(t);
    const highColor = planetHighlight(t);

    // Outer glow – tint follows the planet colour
    const glow = ctx.createRadialGradient(cx, cy, planetRadius * 0.5, cx, cy, planetRadius * 2.5);
    glow.addColorStop(0, coreColor.replace("rgb", "rgba").replace(")", ",0.45)"));
    glow.addColorStop(1, coreColor.replace("rgb", "rgba").replace(")", ",0)"));
    ctx.beginPath();
    ctx.arc(cx, cy, planetRadius * 2.5, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    // Planet body
    const grad = ctx.createRadialGradient(
        cx - planetRadius * 0.3, cy - planetRadius * 0.3, planetRadius * 0.1,
        cx, cy, planetRadius
    );
    grad.addColorStop(0, highColor);
    grad.addColorStop(1, coreColor);
    ctx.beginPath();
    ctx.arc(cx, cy, planetRadius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
}

// --- Game loop ---
let lastTime = performance.now();

function gameLoop(now) {
    const dt = (now - lastTime) / 16.667;  // normalise to ~60 fps
    lastTime = now;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    drawStars();

    // Update & cull particles
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update(dt);
        if (!particles[i].alive) {
            particles.splice(i, 1);
        }
    }

    // Draw particles
    for (const p of particles) {
        p.draw(ctx);
    }

    // Draw planet on top so absorbed dust disappears cleanly
    drawPlanet();

    // Update cooldown bar
    if (onCooldown) {
        const remaining = cooldownEnd - now;
        if (remaining <= 0) {
            onCooldown = false;
            cooldownBar.style.width = "0%";
            createDustBtn.classList.remove("on-cooldown");
            // Auto-play: immediately click again
            if (autoPlaying) spawnDust();
        } else {
            const pct = (1 - remaining / cooldownDuration) * 100;
            cooldownBar.style.width = pct + "%";
        }
    }

    requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);