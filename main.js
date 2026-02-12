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
let dustLevel = 20;
let sizeLevel = 20;
let speedLevel = 20;      // controls cooldown between clicks

let starMass = 100;    // accumulated mass – start at 100
let starRadius = 12 + Math.sqrt(starMass) * 1.2;  // initial radius matching starting mass


const particles = [];    // active dust particles
const collisionFlashes = []; // brief flash effects at collision points

// --- Upgrade caps ---
const MAX_DUST_LEVEL = 20;
const MAX_SIZE_LEVEL = 20;
const MAX_SPEED_LEVEL = 20;
const MAX_STAR_MASS = 10000;
const MAX_PARTICLES = 300;   // cap on simultaneous dust particles

// Effective values mapped from 20 upgrade levels to original ranges
// Dust per click: 1 at lvl 1, 10 at lvl 20
function getEffectiveDust() {
    return dustLevel;
}
// Dust mass: 1 at lvl 1, 10 at lvl 20
function getEffectiveMass() {
    return (1 + (sizeLevel - 1) * (9 / 19)) * 0.1; // base mass is 0.1, scales up to 1.0
}

// Gravity scales linearly with planet mass: 1 at 0, 10 at MAX_STAR_MASS
function getGravityLevel() {
    return 1 + (starMass / MAX_STAR_MASS) * 8;
}

// How much a particle's own mass amplifies gravity's pull on it
// and slows its orbital speed (higher = bigger effect)
const DUST_MASS_GRAVITY_SCALE = 0.01;

// --- Cost function (exponential scaling) ---
// Level 1 ≈ 100, level 19 ≈ 9000 (20 levels, cost at current level before upgrade)
function getUpgradeCost(currentLevel) {
    return Math.floor(10 * Math.pow(1.28, currentLevel - 1));
}

function refreshCosts() {
    dustCostEl.textContent = dustLevel >= MAX_DUST_LEVEL ? "MAX" : getUpgradeCost(dustLevel);
    sizeCostEl.textContent = sizeLevel >= MAX_SIZE_LEVEL ? "MAX" : getUpgradeCost(sizeLevel);
    speedCostEl.textContent = speedLevel >= MAX_SPEED_LEVEL ? "MAX" : getUpgradeCost(speedLevel);
}

function refreshSidebar() {
    massDisplayEl.textContent = Math.floor(starMass);
    dustLevelEl.textContent = dustLevel;
    sizeLevelEl.textContent = sizeLevel;
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
    starRadius = 12 + Math.sqrt(starMass) * 1.2;
    onSuccess();
    refreshSidebar();
    refreshCosts();
    updateMaxedButtons();
}

function updateMaxedButtons() {
    dustPerClickBtn.classList.toggle("maxed", dustLevel >= MAX_DUST_LEVEL);
    dustSizeBtn.classList.toggle("maxed", sizeLevel >= MAX_SIZE_LEVEL);
    speedBtn.classList.toggle("maxed", speedLevel >= MAX_SPEED_LEVEL);
}

// --- Cooldown state ---
let cooldownEnd = 0;     // timestamp when cooldown expires
let cooldownDuration = 0; // current cooldown length in ms
let onCooldown = false;

// Cooldown scales linearly: 1.25s at lvl 1, 0.25s at lvl 20
function getCooldownMs() {
    return (1.25 - (speedLevel - 1) * (1.0 / 19)) * 1000;
}

// --- Upgrade buttons ---
dustPerClickBtn.addEventListener("click", () => {
    tryPurchase(dustPerClickBtn, dustLevel, MAX_DUST_LEVEL,
        () => getUpgradeCost(dustLevel),
        () => { dustLevel += 1; });
});

dustSizeBtn.addEventListener("click", () => {
    tryPurchase(dustSizeBtn, sizeLevel, MAX_SIZE_LEVEL,
        () => getUpgradeCost(sizeLevel),
        () => { sizeLevel += 1; });
});

speedBtn.addEventListener("click", () => {
    tryPurchase(speedBtn, speedLevel, MAX_SPEED_LEVEL,
        () => getUpgradeCost(speedLevel),
        () => { speedLevel += 1; });
});

// Initial UI refresh
refreshSidebar();
refreshCosts();
updateMaxedButtons();

// --- Particle class ---
// Shared radius formula based on mass
function dustRadius(mass) {
    return 2 + mass * 0.3;
}

class Dust {
    constructor(cx, cy) {
        // Spawn at a random angle, in the outer 40% of the play area
        const angle = Math.random() * Math.PI * 2;
        const halfSize = Math.min(canvas.width, canvas.height) / 2;
        const maxDist = halfSize - 10;           // stay on screen
        const minDist = halfSize * 0.6;          // no closer than 60% of radius
        const dist = minDist + Math.random() * (maxDist - minDist);

        this.cx = cx;           // center x (of play area)
        this.cy = cy;           // center y
        this.x = cx + Math.cos(angle) * dist;
        this.y = cy + Math.sin(angle) * dist;
        this.mass = getEffectiveMass();                 // snapshot mass at creation time
        this.radius = dustRadius(this.mass);  // visual size scales with mass
        this.alive = true;

        // Random color variation: light to dark brown
        const t = Math.random(); // 0 = dark brown, 1 = light brown
        this.colorR = Math.round(100 + t * 139);  // 100–239
        this.colorG = Math.round(60 + t * 110);   // 60–170
        this.colorB = Math.round(30 + t * 70);    // 30–100
        this.color = `rgb(${this.colorR},${this.colorG},${this.colorB})`;

        // Orbital velocity (tangent to the radius vector)
        // Scale with gravity so particles don't dive straight in at high gravity,
        // but cap at ~70% of true orbital speed so they always spiral inward.
        const gravityStrength = 0.03 * getGravityLevel();
        const orbitalSpeed = Math.sqrt(gravityStrength * dist * 0.55);
        const speed = orbitalSpeed * (0.5 + Math.random() * 0.75);
        this.vx = -Math.sin(angle) * speed;
        this.vy = Math.cos(angle) * speed;

        // Trail history – length scales with mass
        this.trail = [];
    }

    update(dt) {
        // Always orbit the current screen center (handles resize / zoom)
        this.cx = canvas.width / 2;
        this.cy = canvas.height / 2;

        // Vector from particle to center
        const dx = this.cx - this.x;
        const dy = this.cy - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < starRadius + this.radius) {
            // Absorbed by the planet
            this.alive = false;
            starMass = Math.min(starMass + this.mass, MAX_STAR_MASS);
            // Grow planet radius slowly (diminishing returns via sqrt)
            starRadius = 12 + Math.sqrt(starMass) * 1.2;
            refreshSidebar();
            refreshCosts();
            updateMaxedButtons();
            return;
        }

        // Gravity pull toward center – strength scales with gravity level and particle mass
        const massGravityMult = 1 + this.mass * DUST_MASS_GRAVITY_SCALE;
        const gravityStrength =  (getGravityLevel() * massGravityMult) * 0.01;
        const ax = (dx / dist) * gravityStrength;
        const ay = (dy / dist) * gravityStrength;

        this.vx += ax;
        this.vy += ay;

        // Drag increases with mass – heavy particles slow down and crash
        // Drag: base decay + gentle mass factor with a floor so heavy particles don't freeze
        const drag = Math.max(0.999 - this.mass * 0.0005, 0.993);
        this.vx *= drag;
        this.vy *= drag;

        this.x += this.vx;
        this.y += this.vy;

        // Record trail position, cap length based on mass and speed
        this.trail.push({ x: this.x, y: this.y });
        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        const maxTrail = Math.min(Math.floor(5 + this.mass * 10 + speed * 5), 53);
        if (this.trail.length > maxTrail) {
            this.trail.splice(0, this.trail.length - maxTrail);
        }
    }

    draw(ctx) {
        // Draw trail
        const len = this.trail.length;
        if (len > 1) {
            for (let i = 0; i < len - 1; i++) {
                const t = i / len; // 0 (oldest) to ~1 (newest)
                const alpha = t * 0.4;
                const r = this.radius * t * 0.8;
                ctx.beginPath();
                ctx.arc(this.trail[i].x, this.trail[i].y, Math.max(r, 0.5), 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${this.colorR}, ${this.colorG}, ${this.colorB}, ${alpha})`;
                ctx.fill();
            }
        }

        // Draw particle
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
    }
}

// --- Create dust on click (with cooldown) ---
function spawnDust(silent) {
    if (onCooldown) return;

    if (particles.length + getEffectiveDust() > MAX_PARTICLES) {
        if (!silent) {
            createDustBtn.classList.remove("flash-red");
            void createDustBtn.offsetWidth;
            createDustBtn.classList.add("flash-red");
            createDustBtn.addEventListener("animationend", () => createDustBtn.classList.remove("flash-red"), { once: true });
        }
        return;
    }

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const count = Math.min(getEffectiveDust(), MAX_PARTICLES - particles.length);
    for (let i = 0; i < count; i++) {
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
    if (autoPlaying && !onCooldown) spawnDust(true);
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
    const glow = ctx.createRadialGradient(cx, cy, starRadius * 0.5, cx, cy, starRadius * 2.5);
    glow.addColorStop(0, coreColor.replace("rgb", "rgba").replace(")", ",0.45)"));
    glow.addColorStop(1, coreColor.replace("rgb", "rgba").replace(")", ",0)"));
    ctx.beginPath();
    ctx.arc(cx, cy, starRadius * 2.5, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    // Planet body
    const grad = ctx.createRadialGradient(
        cx - starRadius * 0.3, cy - starRadius * 0.3, starRadius * 0.1,
        cx, cy, starRadius
    );
    grad.addColorStop(0, highColor);
    grad.addColorStop(1, coreColor);
    ctx.beginPath();
    ctx.arc(cx, cy, starRadius, 0, Math.PI * 2);
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

    // Dust-to-dust collisions
    for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        if (!a.alive) continue;
        for (let j = i + 1; j < particles.length; j++) {
            const b = particles[j];
            if (!b.alive) continue;
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const distSq = dx * dx + dy * dy;
            const minDist = a.radius + b.radius;
            if (distSq < minDist * minDist) {
                // Record collision flash at midpoint
                const flashX = (a.x + b.x) / 2;
                const flashY = (a.y + b.y) / 2;
                collisionFlashes.push({ x: flashX, y: flashY, life: 1.0, radius: minDist * 1.5 });

                // Merge b into a (conservation of momentum for direction,
                // but preserve at least the faster particle's speed)
                const totalMass = a.mass + b.mass;
                const mvx = (a.vx * a.mass + b.vx * b.mass) / totalMass;
                const mvy = (a.vy * a.mass + b.vy * b.mass) / totalMass;
                const mergedSpeed = Math.sqrt(mvx * mvx + mvy * mvy);
                const speedA = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
                const speedB = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
                const keepSpeed = Math.max(mergedSpeed, Math.max(speedA, speedB) * 0.85);
                if (mergedSpeed > 0.001) {
                    a.vx = (mvx / mergedSpeed) * keepSpeed;
                    a.vy = (mvy / mergedSpeed) * keepSpeed;
                } else {
                    a.vx = mvx;
                    a.vy = mvy;
                }
                a.mass = totalMass;
                a.radius = dustRadius(a.mass);

                b.alive = false;
            }
        }
    }

    // Cull merged particles
    for (let i = particles.length - 1; i >= 0; i--) {
        if (!particles[i].alive) particles.splice(i, 1);
    }

    // Draw particles
    for (const p of particles) {
        p.draw(ctx);
    }

    // Draw and decay collision flashes
    for (let i = collisionFlashes.length - 1; i >= 0; i--) {
        const f = collisionFlashes[i];
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.radius * (1 - f.life * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 240, 200, ${f.life * 0.35})`;
        ctx.fill();
        f.life -= 0.06;
        if (f.life <= 0) collisionFlashes.splice(i, 1);
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
            if (autoPlaying) spawnDust(true);
        } else {
            const pct = (1 - remaining / cooldownDuration) * 100;
            cooldownBar.style.width = pct + "%";
        }
    }

    // Auto-play: keep retrying when cooldown is off but cap was hit
    if (autoPlaying && !onCooldown && particles.length + getEffectiveDust() <= MAX_PARTICLES) {
        spawnDust(true);
    }

    requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);