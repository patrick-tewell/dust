// --- Debugging ---
const STARTING_STAR_MASS = 100;
const STARTING_DUST_LEVEL = 20;
const STARTING_SIZE_LEVEL = 20;
const STARTING_SPEED_LEVEL = 20;

// --- Constants ---
const MAX_STAR_MASS = 10000;
const MAX_DUST_LEVEL = 20;
const MAX_SIZE_LEVEL = 20;
const MAX_SPEED_LEVEL = 20;
const MAX_PARTICLES = 400;
const DUST_MASS_GRAVITY_SCALE = 0.01;
const MAX_METEOR_CAPACITY_LEVEL = 20;
const MAX_METEOR_CHARGE_LEVEL = 20;
const VIRTUAL_STAR_SIZE = 8000;
const STAR_DEADZONE_MULT = 0.75;

// --- Shared Utility ---
function dustRadius(mass) {
    return 2 + mass * 0.3;
}

// --- Game State ---
class GameState {
    constructor() {
        this.starMass = STARTING_STAR_MASS;
        this.starRadius = 12 + Math.sqrt(this.starMass) * 1.2;
        
        this.dustLevel = STARTING_DUST_LEVEL;
        this.sizeLevel = STARTING_SIZE_LEVEL;
        this.speedLevel = STARTING_SPEED_LEVEL;
        
        this.meteorCapacityLevel = 0;
        this.meteorChargeLevel = 0;
        this.currentMeteors = 0;
        
        this.meteorCooldownEnd = 0;
        this.cooldownEnd = 0;
        this.cooldownDuration = 0;
        this.onCooldown = false;
        this.autoPlaying = false;
    }

    getEffectiveDust() { return this.dustLevel; }
    getEffectiveMass() { return (1 + (this.sizeLevel - 1) * (9 / 19)) * 0.1; }
    getGravityLevel() { return 1 + (this.starMass / MAX_STAR_MASS) * 8; }
    getUpgradeCost(currentLevel) { return Math.floor(10 * Math.pow(1.28, currentLevel - 1)); }
    getMeteorRechargeSeconds() { return 2 - (this.meteorChargeLevel * (1.75 / 20)); }
    getCooldownMs() { return (1.25 - (this.speedLevel - 1) * (1.0 / 19)) * 1000; }

    addStarMass(mass) {
        this.starMass = Math.min(this.starMass + mass, MAX_STAR_MASS);
        this.starRadius = 12 + Math.sqrt(this.starMass) * 1.2;
    }
}

// --- Base Entity ---
class OrbitalEntity {
    constructor(x, y, mass) {
        this.x = x;
        this.y = y;
        this.mass = mass;
        this.radius = dustRadius(mass);
        this.alive = true;
        this.vx = 0;
        this.vy = 0;
        
        this.colorR = 255; this.colorG = 255; this.colorB = 255;
        this.color = `rgb(255,255,255)`;
        this.trailAlphaMult = 0.5;
        this.trailRadiusMult = 0.7;
        
        // Fixed buffer initialization
        this.maxTrail = 64; 
        this.trailX = new Float32Array(this.maxTrail);
        this.trailY = new Float32Array(this.maxTrail);
        this.trailPtr = 0;
        this.trailCount = 0;
    }

    updateTrail() {
        this.trailX[this.trailPtr] = this.x;
        this.trailY[this.trailPtr] = this.y;
        this.trailPtr = (this.trailPtr + 1) % this.maxTrail;
        if (this.trailCount < this.maxTrail) this.trailCount++;
    }

    draw(ctx) {
        if (this.trailCount > 1) {
            const oldestIdx = this.trailCount < this.maxTrail ? 0 : this.trailPtr;
            
            for (let i = 0; i < this.trailCount - 1; i++) {
                const idx = (oldestIdx + i) % this.maxTrail;
                const t = i / this.trailCount;
                const alpha = t * this.trailAlphaMult;
                const r = this.radius * t * this.trailRadiusMult;
                
                ctx.beginPath();
                ctx.arc(this.trailX[idx], this.trailY[idx], Math.max(r, 0.5), 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${this.colorR}, ${this.colorG}, ${this.colorB}, ${alpha})`;
                ctx.fill();
            }
        }
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
    }
}

class Dust extends OrbitalEntity {
    constructor(cx, cy, gameState, canvasWidth, canvasHeight) {
        const mass = gameState.getEffectiveMass();
        const angle = Math.random() * Math.PI * 2;
        const halfSize = Math.min(canvasWidth, canvasHeight) / 2;
        const maxDist = halfSize - 10;
        const minDist = halfSize * 0.6;
        const dist = minDist + Math.random() * (maxDist - minDist);
        
        super(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, mass);

        const t = Math.random();
        this.colorR = Math.round(100 + t * 139);
        this.colorG = Math.round(60 + t * 110);
        this.colorB = Math.round(30 + t * 70);
        this.color = `rgb(${this.colorR},${this.colorG},${this.colorB})`;
        this.trailAlphaMult = 0.4;
        this.trailRadiusMult = 0.8;

        const gravityStrength = 0.03 * gameState.getGravityLevel();
        const orbitalSpeed = Math.sqrt(gravityStrength * dist * 0.55);
        const speed = orbitalSpeed * (0.5 + Math.random() * 0.75);
        this.vx = -Math.sin(angle) * speed;
        this.vy = Math.cos(angle) * speed;
    }

    update(dt, cx, cy, gameState) {
        const dx = cx - this.x;
        const dy = cy - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < gameState.starRadius + this.radius) {
            this.alive = false;
            gameState.addStarMass(this.mass);
            return true; // Indicates absorption
        }

        const massGravityMult = 1 + this.mass * DUST_MASS_GRAVITY_SCALE;
        const gravityStrength = (gameState.getGravityLevel() * massGravityMult) * 0.01;
        
        this.vx += (dx / dist) * gravityStrength;
        this.vy += (dy / dist) * gravityStrength;

        const drag = Math.max(0.999 - this.mass * 0.0005, 0.993);
        this.vx *= drag;
        this.vy *= drag;

        this.x += this.vx;
        this.y += this.vy;

        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        //this.maxTrail = Math.min(Math.floor(5 + this.mass * 10 + speed * 5), 53);
        this.updateTrail();
        return false;
    }
}

class Meteor extends OrbitalEntity {
    constructor(x, y, gameState, canvasWidth, canvasHeight) {
        const mass = gameState.getEffectiveMass() * 20;
        super(x, y, mass);
        this.isMeteor = true;
        this.radius = dustRadius(this.mass) * 1.2;

        this.colorR = 180 + Math.floor(Math.random() * 40);
        this.colorG = 210 + Math.floor(Math.random() * 30);
        this.colorB = 255;
        this.color = `rgb(${this.colorR},${this.colorG},${this.colorB})`;
        this.trailAlphaMult = 0.5;
        this.trailRadiusMult = 0.7;
        this.maxTrail = 30;

        const cx = canvasWidth / 2;
        const cy = canvasHeight / 2;
        const dx = cx - this.x;
        const dy = cy - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const speed = 4 + (Math.random() * 10);
        this.vx = (dx / dist) * speed;
        this.vy = (dy / dist) * speed;
    }

    update(dt, cx, cy, gameState) {
        this.x += this.vx * dt * (0.1 + gameState.starMass / MAX_STAR_MASS);
        this.y += this.vy * dt * (0.1 + gameState.starMass / MAX_STAR_MASS);
        
        const dx = cx - this.x;
        const dy = cy - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < gameState.starRadius + this.radius) {
            this.alive = false;
            gameState.addStarMass(this.mass);
            return true; // Indicates absorption
        }
        
        this.updateTrail();
        return false;
    }
}

// --- Physics Helpers ---
class Rectangle {
    constructor(x, y, w, h) {
        this.x = x; this.y = y; this.w = w; this.h = h;
    }
    contains(entity) {
        return (entity.x >= this.x - this.w &&
                entity.x <= this.x + this.w &&
                entity.y >= this.y - this.h &&
                entity.y <= this.y + this.h);
    }
    intersects(range) {
        if (range.x - range.w > this.x + this.w) return false;
        if (range.x + range.w < this.x - this.w) return false;
        if (range.y - range.h > this.y + this.h) return false;
        if (range.y + range.h < this.y - this.h) return false;
        return true;
    }
}

class Quadtree {
    constructor(boundary, capacity) {
        this.boundary = boundary;
        this.capacity = capacity;
        this.entities = [];
        this.divided = false;
    }

    subdivide() {
        const x = this.boundary.x; const y = this.boundary.y;
        const w = this.boundary.w; const h = this.boundary.h;
        this.northeast = new Quadtree(new Rectangle(x + w / 2, y - h / 2, w / 2, h / 2), this.capacity);
        this.northwest = new Quadtree(new Rectangle(x - w / 2, y - h / 2, w / 2, h / 2), this.capacity);
        this.southeast = new Quadtree(new Rectangle(x + w / 2, y + h / 2, w / 2, h / 2), this.capacity);
        this.southwest = new Quadtree(new Rectangle(x - w / 2, y + h / 2, w / 2, h / 2), this.capacity);
        this.divided = true;
    }

    insert(entity) {
        if (!this.boundary.contains(entity)) return false;

        if (this.entities.length < this.capacity) {
            this.entities.push(entity);
            return true;
        }

        if (!this.divided) this.subdivide();

        if (this.northeast.insert(entity)) return true;
        if (this.northwest.insert(entity)) return true;
        if (this.southeast.insert(entity)) return true;
        if (this.southwest.insert(entity)) return true;
        
        return false;
    }

    query(range, found = []) {
        if (!this.boundary.intersects(range)) return found;

        for (let i = 0; i < this.entities.length; i++) {
            if (range.contains(this.entities[i])) {
                found.push(this.entities[i]);
            }
        }

        if (this.divided) {
            this.northwest.query(range, found);
            this.northeast.query(range, found);
            this.southwest.query(range, found);
            this.southeast.query(range, found);
        }
        return found;
    }
}


// --- Physics System ---
class Physics {
    static resolveCollisions(particles, meteors, collisionFlashes, canvasWidth, canvasHeight) {
        const boundary = new Rectangle(canvasWidth / 2, canvasHeight / 2, canvasWidth / 2, canvasHeight / 2);
        const qtree = new Quadtree(boundary, 4);

        // Populate Tree
        for (let i = 0; i < particles.length; i++) {
            if (!particles[i].alive) continue;
            qtree.insert(particles[i]);
        }
        for (let i = 0; i < meteors.length; i++) {
            if (!meteors[i].alive) continue;
            qtree.insert(meteors[i]);
        }

        // Resolve Dust-to-Dust and Dust-to-Meteor via Tree
        for (let i = 0; i < particles.length; i++) {
            const a = particles[i];
            if (!a.alive) continue;

            const range = new Rectangle(a.x, a.y, a.radius * 4, a.radius * 4);
            const candidates = qtree.query(range);

            for (let j = 0; j < candidates.length; j++) {
                const b = candidates[j];
                if (a === b || !b.alive) continue;

                if (b.isMeteor) {
                     // Let meteor logic handle this collision below to avoid double processing
                     continue;
                }
                this.checkDustCollision(a, b, collisionFlashes);
            }
        }

        // Resolve Meteor-to-Dust
        for (let i = 0; i < meteors.length; i++) {
            const m = meteors[i];
            if (!m.alive) continue;

            const range = new Rectangle(m.x, m.y, m.radius * 2, m.radius * 2);
            const candidates = qtree.query(range);

            for (let j = 0; j < candidates.length; j++) {
                const d = candidates[j];
                if (!d.alive || d.mass >= m.mass) continue;

                const dx = m.x - d.x;
                const dy = m.y - d.y;
                if (dx * dx + dy * dy < (m.radius + d.radius) * (m.radius + d.radius)) {
                    collisionFlashes.push({ x: (m.x + d.x) / 2, y: (m.y + d.y) / 2, life: 1.0, radius: (m.radius + d.radius) * 1.5 });
                    m.mass += d.mass;
                    m.radius = dustRadius(m.mass) * 1.2;
                    d.alive = false;
                }
            }
        }
    }




    
    static resolveCollisions(particles, meteors, collisionFlashes, canvasWidth, canvasHeight) {
        const gridSize = 60;
        const gridCols = Math.ceil(canvasWidth / gridSize);
        const gridRows = Math.ceil(canvasHeight / gridSize);
        const dustGrid = Array.from({ length: gridCols * gridRows }, () => []);

        // Populate Grid
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            if (!p.alive) continue;
            const col = Math.floor(p.x / gridSize);
            const row = Math.floor(p.y / gridSize);
            if (col >= 0 && col < gridCols && row >= 0 && row < gridRows) {
                dustGrid[row * gridCols + col].push(i);
            }
        }

        // Dust-to-Dust
        for (let col = 0; col < gridCols; col++) {
            for (let row = 0; row < gridRows; row++) {
                const cellIdx = row * gridCols + col;
                const indices = dustGrid[cellIdx];
                
                for (let aIdx = 0; aIdx < indices.length; aIdx++) {
                    const a = particles[indices[aIdx]];
                    if (!a.alive) continue;
                    
                    for (let bIdx = aIdx + 1; bIdx < indices.length; bIdx++) {
                        const b = particles[indices[bIdx]];
                        this.checkDustCollision(a, b, collisionFlashes);
                    }

                    for (let dCol = -1; dCol <= 1; dCol++) {
                        for (let dRow = -1; dRow <= 1; dRow++) {
                            if (dCol === 0 && dRow === 0) continue;
                            const nCol = col + dCol;
                            const nRow = row + dRow;
                            if (nCol < 0 || nCol >= gridCols || nRow < 0 || nRow >= gridRows) continue;
                            
                            const neighbor = dustGrid[nRow * gridCols + nCol];
                            for (let bIdx = 0; bIdx < neighbor.length; bIdx++) {
                                const b = particles[neighbor[bIdx]];
                                this.checkDustCollision(a, b, collisionFlashes);
                            }
                        }
                    }
                }
            }
        }

        // Meteor-to-Dust
        for (let i = 0; i < meteors.length; i++) {
            const m = meteors[i];
            if (!m.alive) continue;
            const col = Math.floor(m.x / gridSize);
            const row = Math.floor(m.y / gridSize);
            
            for (let dCol = -1; dCol <= 1; dCol++) {
                for (let dRow = -1; dRow <= 1; dRow++) {
                    const nCol = col + dCol;
                    const nRow = row + dRow;
                    if (nCol < 0 || nCol >= gridCols || nRow < 0 || nRow >= gridRows) continue;
                    
                    const neighbor = dustGrid[nRow * gridCols + nCol];
                    for (let bIdx = 0; bIdx < neighbor.length; bIdx++) {
                        const d = particles[neighbor[bIdx]];
                        if (!d.alive) continue;
                        
                        const dx = m.x - d.x;
                        const dy = m.y - d.y;
                        if (dx * dx + dy * dy < (m.radius + d.radius) * (m.radius + d.radius)) {
                            collisionFlashes.push({ x: (m.x + d.x) / 2, y: (m.y + d.y) / 2, life: 1.0, radius: (m.radius + d.radius) * 1.5 });
                            m.mass += d.mass;
                            m.radius = dustRadius(m.mass) * 1.2;
                            d.alive = false;
                        }
                    }
                }
            }
        }
    }

    static checkDustCollision(a, b, collisionFlashes) {
        if (!b.alive) return;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const minDist = a.radius + b.radius;
        
        if (dx * dx + dy * dy < minDist * minDist) {
            collisionFlashes.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, life: 1.0, radius: minDist * 1.5 });
            
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

// --- UI Manager ---
class UIManager {
    constructor(game) {
        this.game = game;
        this.state = game.state;
        
        this.elements = {
            upgradeBar: document.getElementById("upgradeBar"),
            shopBtn: document.getElementById("shop"),
            upgradeButtons: Array.from(document.getElementsByClassName("upgradeButton")),
            createDustBtn: document.getElementById("createDust"),
            autoPlayBtn: document.getElementById("autoPlayBtn"),
            dustPerClickBtn: document.getElementById("dustPerClickButton"),
            dustSizeBtn: document.getElementById("dustSizeButton"),
            speedBtn: document.getElementById("speedButton"),
            meteorCapacityBtn: document.getElementById("meteorCapacityButton"),
            meteorChargeBtn: document.getElementById("meteorChargeButton"),
            cooldownBar: document.getElementById("cooldownBar"),
            meteorRechargeBar: document.getElementById("meteorRechargeBar"),
            massDisplay: document.getElementById("massDisplay"),
            dustLevelDisplay: document.getElementById("dustLevelDisplay"),
            sizeLevelDisplay: document.getElementById("sizeLevelDisplay"),
            speedLevelDisplay: document.getElementById("speedLevelDisplay"),
            dustCostDisplay: document.getElementById("dustCostDisplay"),
            sizeCostDisplay: document.getElementById("sizeCostDisplay"),
            speedCostDisplay: document.getElementById("speedCostDisplay"),
            meteorCapacityCostDisplay: document.getElementById("meteorCapacityCostDisplay"),
            meteorChargeCostDisplay: document.getElementById("meteorChargeCostDisplay"),
            meteorInventoryDisplay: document.getElementById("meteorInventoryDisplay"),
            canvas: document.getElementById("gameCanvas")
        };

        this.upgradeBarTimeout = null;
        this.bindEvents();
        this.refreshAll();
    }

    bindEvents() {
        this.elements.shopBtn.addEventListener("click", (e) => { this.showUpgradeBar(); e.stopPropagation(); });
        this.elements.upgradeButtons.forEach(btn => btn.addEventListener("click", (e) => { this.showUpgradeBar(); e.stopPropagation(); }));
        document.addEventListener("click", (e) => {
            if (!this.elements.upgradeBar.contains(e.target) && e.target !== this.elements.shopBtn) this.hideUpgradeBar();
        });

        window.addEventListener("resize", () => this.game.resizeCanvas());

        this.elements.createDustBtn.addEventListener("click", () => this.game.spawnDust(false));
        this.elements.autoPlayBtn.addEventListener("click", () => {
            this.state.autoPlaying = !this.state.autoPlaying;
            this.elements.autoPlayBtn.classList.toggle("active", this.state.autoPlaying);
            if (this.state.autoPlaying && !this.state.onCooldown) this.game.spawnDust(true);
        });

        this.elements.canvas.addEventListener("mousedown", (e) => this.game.spawnMeteor(e));

        this.bindUpgrade(this.elements.dustPerClickBtn, 'dustLevel', MAX_DUST_LEVEL);
        this.bindUpgrade(this.elements.dustSizeBtn, 'sizeLevel', MAX_SIZE_LEVEL);
        this.bindUpgrade(this.elements.speedBtn, 'speedLevel', MAX_SPEED_LEVEL);
        
        if (this.elements.meteorCapacityBtn) {
            this.elements.meteorCapacityBtn.addEventListener("click", () => {
                this.tryPurchase(this.elements.meteorCapacityBtn, this.state.meteorCapacityLevel, MAX_METEOR_CAPACITY_LEVEL, () => {
                    this.state.meteorCapacityLevel += 1;
                    this.state.currentMeteors = this.state.meteorCapacityLevel === 1 ? 1 : Math.min(this.state.currentMeteors, this.state.meteorCapacityLevel);
                });
            });
        }

        if (this.elements.meteorChargeBtn) {
            this.bindUpgrade(this.elements.meteorChargeBtn, 'meteorChargeLevel', MAX_METEOR_CHARGE_LEVEL);
        }
    }

    bindUpgrade(btn, stateKey, maxLevel) {
        if (!btn) return;
        btn.addEventListener("click", () => {
            this.tryPurchase(btn, this.state[stateKey], maxLevel, () => { this.state[stateKey] += 1; });
        });
    }

    tryPurchase(btn, currentLevel, maxLevel, onSuccess) {
        if (currentLevel >= maxLevel) return;
        const cost = this.state.getUpgradeCost(currentLevel + 1); // Adjust based on original offset logic
        
        // Match original offset logic where dust/size/speed passed current level, meteor passed current + 1
        const actualCost = btn.id.includes("meteor") ? this.state.getUpgradeCost(currentLevel + 1) : this.state.getUpgradeCost(currentLevel);
        
        if (this.state.starMass < actualCost) {
            btn.classList.remove("flash-red");
            void btn.offsetWidth;
            btn.classList.add("flash-red");
            btn.addEventListener("animationend", () => btn.classList.remove("flash-red"), { once: true });
            return;
        }
        this.state.starMass -= actualCost;
        this.state.starRadius = 12 + Math.sqrt(this.state.starMass) * 1.2;
        onSuccess();
        this.refreshAll();
    }

    showUpgradeBar() {
        this.elements.upgradeBar.classList.add("visible");
        clearTimeout(this.upgradeBarTimeout);
        this.upgradeBarTimeout = setTimeout(() => this.hideUpgradeBar(), 10000);
    }

    hideUpgradeBar() {
        this.elements.upgradeBar.classList.remove("visible");
        clearTimeout(this.upgradeBarTimeout);
    }

    refreshAll() {
        this.elements.massDisplay.textContent = Math.floor(this.state.starMass);
        this.elements.dustLevelDisplay.textContent = this.state.dustLevel;
        this.elements.sizeLevelDisplay.textContent = this.state.sizeLevel;
        this.elements.speedLevelDisplay.textContent = this.state.speedLevel;

        this.elements.dustCostDisplay.textContent = this.state.dustLevel >= MAX_DUST_LEVEL ? "MAX" : this.state.getUpgradeCost(this.state.dustLevel);
        this.elements.sizeCostDisplay.textContent = this.state.sizeLevel >= MAX_SIZE_LEVEL ? "MAX" : this.state.getUpgradeCost(this.state.sizeLevel);
        this.elements.speedCostDisplay.textContent = this.state.speedLevel >= MAX_SPEED_LEVEL ? "MAX" : this.state.getUpgradeCost(this.state.speedLevel);
        
        if (this.elements.meteorCapacityCostDisplay) {
            this.elements.meteorCapacityCostDisplay.textContent = this.state.meteorCapacityLevel >= MAX_METEOR_CAPACITY_LEVEL ? "MAX" : this.state.getUpgradeCost(this.state.meteorCapacityLevel + 1);
        }
        if (this.elements.meteorChargeCostDisplay) {
            this.elements.meteorChargeCostDisplay.textContent = this.state.meteorChargeLevel >= MAX_METEOR_CHARGE_LEVEL ? "MAX" : this.state.getUpgradeCost(this.state.meteorChargeLevel + 1);
        }

        this.refreshMeteorInventory();
        this.updateMaxedButtons();
    }

    refreshMeteorInventory() {
        if (this.elements.meteorInventoryDisplay) {
            this.elements.meteorInventoryDisplay.textContent = `${this.state.currentMeteors} / ${this.state.meteorCapacityLevel}`;
        }
        if (this.elements.meteorRechargeBar && (this.state.currentMeteors >= this.state.meteorCapacityLevel || this.state.meteorCapacityLevel === 0)) {
            this.elements.meteorRechargeBar.style.width = "0%";
        }
    }

    updateMaxedButtons() {
        this.elements.dustPerClickBtn.classList.toggle("maxed", this.state.dustLevel >= MAX_DUST_LEVEL);
        this.elements.dustSizeBtn.classList.toggle("maxed", this.state.sizeLevel >= MAX_SIZE_LEVEL);
        this.elements.speedBtn.classList.toggle("maxed", this.state.speedLevel >= MAX_SPEED_LEVEL);
        if (this.elements.meteorCapacityBtn) this.elements.meteorCapacityBtn.classList.toggle("maxed", this.state.meteorCapacityLevel >= MAX_METEOR_CAPACITY_LEVEL);
        if (this.elements.meteorChargeBtn) this.elements.meteorChargeBtn.classList.toggle("maxed", this.state.meteorChargeLevel >= MAX_METEOR_CHARGE_LEVEL);
    }

    updateCooldownBars(now) {
        if (this.state.onCooldown) {
            const remaining = this.state.cooldownEnd - now;
            if (remaining <= 0) {
                this.state.onCooldown = false;
                this.elements.cooldownBar.style.width = "0%";
                this.elements.createDustBtn.classList.remove("on-cooldown");
                if (this.state.autoPlaying) this.game.spawnDust(true);
            } else {
                this.elements.cooldownBar.style.width = ((1 - remaining / this.state.cooldownDuration) * 100) + "%";
            }
        }

        if (this.state.meteorCapacityLevel > 0) {
            if (this.state.currentMeteors >= this.state.meteorCapacityLevel) {
                this.state.meteorCooldownEnd = 0;
                if (this.elements.meteorRechargeBar) this.elements.meteorRechargeBar.style.width = "0%";
            } else {
                if (this.state.meteorCooldownEnd === 0) {
                    this.state.meteorCooldownEnd = now + this.state.getMeteorRechargeSeconds() * 1000;
                }
                if (now >= this.state.meteorCooldownEnd) {
                    this.state.currentMeteors = Math.min(this.state.currentMeteors + 1, this.state.meteorCapacityLevel);
                    this.state.meteorCooldownEnd = this.state.currentMeteors < this.state.meteorCapacityLevel ? now + this.state.getMeteorRechargeSeconds() * 1000 : 0;
                    this.refreshMeteorInventory();
                } else if (this.elements.meteorRechargeBar) {
                    const total = this.state.getMeteorRechargeSeconds() * 1000;
                    const pct = Math.max(0, Math.min(1, (total - (this.state.meteorCooldownEnd - now)) / total)) * 100;
                    this.elements.meteorRechargeBar.style.width = pct + "%";
                }
            }
        }
    }
}

// --- Renderer ---
class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.stars = [];
        this.generateStars();
    }

    generateStars() {
        const count = 400;
        const minDeadZone = (12 + Math.sqrt(MAX_STAR_MASS) * 1.2) * STAR_DEADZONE_MULT * (VIRTUAL_STAR_SIZE / Math.max(window.innerWidth, window.innerHeight));
        for (let i = 0; i < count; ) {
            const angle = Math.random() * 2 * Math.PI;
            const radius = Math.random() * (VIRTUAL_STAR_SIZE / 2);
            if (radius < minDeadZone) continue;
            this.stars.push({ dx: Math.cos(angle) * radius, dy: Math.sin(angle) * radius, size: Math.random() * 1.5 + 3 });
            i++;
        }
    }

    drawBackground(starRadius) {
        const scale = Math.min(this.canvas.width * 2, this.canvas.height * 2) / VIRTUAL_STAR_SIZE;
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = "#fff";
        
        const currentDeadZone = starRadius * STAR_DEADZONE_MULT / scale;
        for (const star of this.stars) {
            if (Math.sqrt(star.dx * star.dx + star.dy * star.dy) < currentDeadZone) continue;
            this.ctx.beginPath();
            this.ctx.arc(centerX + star.dx * scale, centerY + star.dy * scale, star.size * scale, 0, 2 * Math.PI);
            this.ctx.fill();
        }
    }

    drawPlanet(starMass, starRadius) {
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;
        const t = Math.min(starMass / MAX_STAR_MASS, 1);
        
        const coreColor = this.lerpPlanetColors([
            [90, 35, 40], [180, 60, 35], [220, 140, 50], [240, 210, 100], [250, 240, 210]
        ], t);
        
        const highColor = this.lerpPlanetColors([
            [168, 68, 72], [220, 110, 60], [245, 190, 90], [255, 235, 170], [255, 248, 230]
        ], t);

        const glow = this.ctx.createRadialGradient(cx, cy, starRadius * 0.5, cx, cy, starRadius * 2.5);
        glow.addColorStop(0, coreColor.replace("rgb", "rgba").replace(")", ",0.45)"));
        glow.addColorStop(1, coreColor.replace("rgb", "rgba").replace(")", ",0)"));
        
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, starRadius * 2.5, 0, Math.PI * 2);
        this.ctx.fillStyle = glow;
        this.ctx.fill();

        const grad = this.ctx.createRadialGradient(cx - starRadius * 0.3, cy - starRadius * 0.3, starRadius * 0.1, cx, cy, starRadius);
        grad.addColorStop(0, highColor);
        grad.addColorStop(1, coreColor);
        
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, starRadius, 0, Math.PI * 2);
        this.ctx.fillStyle = grad;
        this.ctx.fill();
    }

    lerpPlanetColors(stops, t) {
        const seg = t * (stops.length - 1);
        const i = Math.min(Math.floor(seg), stops.length - 2);
        const local = seg - i;
        const a = stops[i], b = stops[i + 1];
        const r = Math.round(a[0] + (b[0] - a[0]) * local);
        const g = Math.round(a[1] + (b[1] - a[1]) * local);
        const bCol = Math.round(a[2] + (b[2] - a[2]) * local);
        return `rgb(${r},${g},${bCol})`;
    }

    drawFlashes(flashes) {
        for (let i = flashes.length - 1; i >= 0; i--) {
            const f = flashes[i];
            this.ctx.beginPath();
            this.ctx.arc(f.x, f.y, f.radius * (1 - f.life * 0.5), 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(255, 240, 200, ${f.life * 0.35})`;
            this.ctx.fill();
            f.life -= 0.06;
            if (f.life <= 0) flashes.splice(i, 1);
        }
    }
}

// --- Main Engine ---
class Game {
    constructor() {
        this.state = new GameState();
        this.ui = new UIManager(this);
        this.renderer = new Renderer(this.ui.elements.canvas);
        
        this.particles = [];
        this.meteors = [];
        this.collisionFlashes = [];
        this.lastTime = performance.now();
        
        this.resizeCanvas();
        this.ui.elements.upgradeBar.classList.remove("visible"); // Initial hide
        requestAnimationFrame((now) => this.loop(now));
    }

    resizeCanvas() {
        this.ui.elements.canvas.width = window.innerWidth;
        this.ui.elements.canvas.height = window.innerHeight;
    }

    spawnDust(silent) {
        if (this.state.onCooldown) return;
        if (this.particles.length + this.state.getEffectiveDust() > MAX_PARTICLES) {
            if (!silent) {
                const btn = this.ui.elements.createDustBtn;
                btn.classList.remove("flash-red");
                void btn.offsetWidth;
                btn.classList.add("flash-red");
                btn.addEventListener("animationend", () => btn.classList.remove("flash-red"), { once: true });
            }
            return;
        }

        const cx = this.ui.elements.canvas.width / 2;
        const cy = this.ui.elements.canvas.height / 2;
        const count = Math.min(this.state.getEffectiveDust(), MAX_PARTICLES - this.particles.length);
        
        for (let i = 0; i < count; i++) {
            this.particles.push(new Dust(cx, cy, this.state, this.ui.elements.canvas.width, this.ui.elements.canvas.height));
        }

        this.state.cooldownDuration = this.state.getCooldownMs();
        this.state.cooldownEnd = performance.now() + this.state.cooldownDuration;
        this.state.onCooldown = true;
        this.ui.elements.createDustBtn.classList.add("on-cooldown");
    }

    spawnMeteor(e) {
        if (this.state.currentMeteors > 0) {
            const rect = this.ui.elements.canvas.getBoundingClientRect();
            this.meteors.push(new Meteor(e.clientX - rect.left, e.clientY - rect.top, this.state, this.ui.elements.canvas.width, this.ui.elements.canvas.height));
            this.state.currentMeteors -= 1;
            this.ui.refreshMeteorInventory();
        }
    }

    loop(now) {
        const dt = (now - this.lastTime) / 16.667;
        this.lastTime = now;
        const cx = this.ui.elements.canvas.width / 2;
        const cy = this.ui.elements.canvas.height / 2;

        this.renderer.drawBackground(this.state.starRadius);

        let absorptionOccurred = false;

        // Update entities
        for (let i = this.particles.length - 1; i >= 0; i--) {
            if (this.particles[i].update(dt, cx, cy, this.state)) absorptionOccurred = true;
            if (!this.particles[i].alive) this.particles.splice(i, 1);
        }
        for (let i = this.meteors.length - 1; i >= 0; i--) {
            if (this.meteors[i].update(dt, cx, cy, this.state)) absorptionOccurred = true;
            if (!this.meteors[i].alive) this.meteors.splice(i, 1);
        }

        if (absorptionOccurred) this.ui.refreshAll();

        // Physics & Drawing
        Physics.resolveCollisions(this.particles, this.meteors, this.collisionFlashes, this.ui.elements.canvas.width, this.ui.elements.canvas.height);
        
        // Final entity cull post-collision
        for (let i = this.particles.length - 1; i >= 0; i--) {
            if (!this.particles[i].alive) this.particles.splice(i, 1);
        }

        this.particles.forEach(p => p.draw(this.renderer.ctx));
        this.meteors.forEach(m => m.draw(this.renderer.ctx));
        this.renderer.drawFlashes(this.collisionFlashes);
        this.renderer.drawPlanet(this.state.starMass, this.state.starRadius);

        this.ui.updateCooldownBars(now);

        if (this.state.autoPlaying && !this.state.onCooldown && this.particles.length + this.state.getEffectiveDust() <= MAX_PARTICLES) {
            this.spawnDust(true);
        }

        requestAnimationFrame((now) => this.loop(now));
    }
}

// Start Game
const game = new Game();
