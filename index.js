// --- Debugging ---
const STARTING_STAR_MASS = 100;
const STARTING_DUST_LEVEL = 1;
const STARTING_SIZE_LEVEL = 1;
const STARTING_SPEED_LEVEL = 1;

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
    constructor() {
        this.active = false;
        this.x = 0;
        this.y = 0;
        this.mass = 0;
        this.radius = 0;
        this.vx = 0;
        this.vy = 0;
        
        this.colorStr = "rgb(255,255,255)";
        this.trailAlphaMult = 0.5;
        this.trailRadiusMult = 0.7;
        
        this.maxTrail = 32; 
        this.trailX = new Float32Array(this.maxTrail);
        this.trailY = new Float32Array(this.maxTrail);
        this.trailPtr = 0;
        this.trailCount = 0;
    }

    initBase(x, y, mass) {
        this.active = true;
        this.x = x;
        this.y = y;
        this.mass = mass;
        this.radius = dustRadius(mass);
        this.vx = 0;
        this.vy = 0;
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
        if (!this.active) return;

        if (this.trailCount > 1) {
            const oldestIdx = this.trailCount < this.maxTrail ? 0 : this.trailPtr;
            
            ctx.fillStyle = this.colorStr;
            for (let i = 0; i < this.trailCount - 1; i++) {
                const idx = (oldestIdx + i) % this.maxTrail;
                const t = i / this.trailCount;
                const alpha = t * this.trailAlphaMult;
                const r = this.radius * t * this.trailRadiusMult;
                
                ctx.globalAlpha = alpha;
                ctx.beginPath();
                ctx.arc(this.trailX[idx], this.trailY[idx], Math.max(r, 0.5), 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1.0;
        }
        
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.colorStr;
        ctx.fill();
    }
}

class Dust extends OrbitalEntity {
    constructor() {
        super();
        this.isMeteor = false;
    }

    init(cx, cy, gameState, canvasWidth, canvasHeight) {
        const mass = gameState.getEffectiveMass();
        const angle = Math.random() * Math.PI * 2;
        const halfSize = Math.min(canvasWidth, canvasHeight) / 2;
        const maxDist = halfSize - 10;
        const minDist = halfSize * 0.6;
        const dist = minDist + Math.random() * (maxDist - minDist);
        
        this.initBase(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, mass);

        const t = Math.random();
        const r = Math.round(100 + t * 139);
        const g = Math.round(60 + t * 110);
        const b = Math.round(30 + t * 70);
        this.colorStr = `rgb(${r},${g},${b})`;
        this.trailAlphaMult = 0.4;
        this.trailRadiusMult = 0.8;

        const gravityStrength = 0.03 * gameState.getGravityLevel();
        const orbitalSpeed = Math.sqrt(gravityStrength * dist * 0.55);
        const speed = orbitalSpeed * (0.5 + Math.random() * 0.75);
        this.vx = -Math.sin(angle) * speed;
        this.vy = Math.cos(angle) * speed;
    }

    update(dt, cx, cy, gameState) {
        if (!this.active) return false;

        const dx = cx - this.x;
        const dy = cy - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < gameState.starRadius + this.radius) {
            this.active = false;
            gameState.addStarMass(this.mass);
            return true; 
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

        this.updateTrail();
        return false;
    }
}

class Meteor extends OrbitalEntity {
    constructor() {
        super();
        this.isMeteor = true;
    }

    init(x, y, gameState, canvasWidth, canvasHeight) {
        const mass = gameState.getEffectiveMass() * 20;
        this.initBase(x, y, mass);
        this.radius = dustRadius(this.mass) * 1.2;

        const r = 180 + Math.floor(Math.random() * 40);
        const g = 210 + Math.floor(Math.random() * 30);
        const b = 255;
        this.colorStr = `rgb(${r},${g},${b})`;
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
        if (!this.active) return false;

        this.x += this.vx * dt * (0.1 + gameState.starMass / MAX_STAR_MASS);
        this.y += this.vy * dt * (0.1 + gameState.starMass / MAX_STAR_MASS);
        
        const dx = cx - this.x;
        const dy = cy - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < gameState.starRadius + this.radius) {
            this.active = false;
            gameState.addStarMass(this.mass);
            return true; 
        }
        
        this.updateTrail();
        return false;
    }
}

class FlashParticle {
    constructor() {
        this.active = false;
        this.x = 0;
        this.y = 0;
        this.life = 0;
        this.radius = 0;
    }
    init(x, y, radius) {
        this.active = true;
        this.x = x;
        this.y = y;
        this.life = 1.0;
        this.radius = radius;
    }
}

// --- Physics System ---
class Physics {    
    static initGrid(canvasWidth, canvasHeight) {
        this.gridSize = 60;
        this.gridCols = Math.ceil(canvasWidth / this.gridSize);
        this.gridRows = Math.ceil(canvasHeight / this.gridSize);
        const totalCells = this.gridCols * this.gridRows;
        
        if (!this.dustGrid || this.dustGrid.length !== totalCells) {
            this.dustGrid = new Array(totalCells);
            for (let i = 0; i < totalCells; i++) {
                this.dustGrid[i] = [];
            }
        } else {
            // Zero-allocation clear
            for (let i = 0; i < totalCells; i++) {
                this.dustGrid[i].length = 0;
            }
        }
    }

    static resolveCollisions(particles, meteors, flashPool, canvasWidth, canvasHeight) {
        this.initGrid(canvasWidth, canvasHeight);

        // Populate Grid
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            if (!p.active) continue;
            const col = Math.floor(p.x / this.gridSize);
            const row = Math.floor(p.y / this.gridSize);
            if (col >= 0 && col < this.gridCols && row >= 0 && row < this.gridRows) {
                this.dustGrid[row * this.gridCols + col].push(i);
            }
        }

        // Dust-to-Dust
        for (let col = 0; col < this.gridCols; col++) {
            for (let row = 0; row < this.gridRows; row++) {
                const cellIdx = row * this.gridCols + col;
                const indices = this.dustGrid[cellIdx];
                
                for (let aIdx = 0; aIdx < indices.length; aIdx++) {
                    const a = particles[indices[aIdx]];
                    if (!a.active) continue;
                    
                    for (let bIdx = aIdx + 1; bIdx < indices.length; bIdx++) {
                        const b = particles[indices[bIdx]];
                        this.checkDustCollision(a, b, flashPool);
                    }

                    for (let dCol = -1; dCol <= 1; dCol++) {
                        for (let dRow = -1; dRow <= 1; dRow++) {
                            if (dCol === 0 && dRow === 0) continue;
                            const nCol = col + dCol;
                            const nRow = row + dRow;
                            if (nCol < 0 || nCol >= this.gridCols || nRow < 0 || nRow >= this.gridRows) continue;
                            
                            const neighbor = this.dustGrid[nRow * this.gridCols + nCol];
                            for (let bIdx = 0; bIdx < neighbor.length; bIdx++) {
                                const b = particles[neighbor[bIdx]];
                                this.checkDustCollision(a, b, flashPool);
                            }
                        }
                    }
                }
            }
        }

        // Meteor-to-Dust
        for (let i = 0; i < meteors.length; i++) {
            const m = meteors[i];
            if (!m.active) continue;
            const col = Math.floor(m.x / this.gridSize);
            const row = Math.floor(m.y / this.gridSize);
            
            for (let dCol = -1; dCol <= 1; dCol++) {
                for (let dRow = -1; dRow <= 1; dRow++) {
                    const nCol = col + dCol;
                    const nRow = row + dRow;
                    if (nCol < 0 || nCol >= this.gridCols || nRow < 0 || nRow >= this.gridRows) continue;
                    
                    const neighbor = this.dustGrid[nRow * this.gridCols + nCol];
                    for (let bIdx = 0; bIdx < neighbor.length; bIdx++) {
                        const d = particles[neighbor[bIdx]];
                        if (!d.active) continue;
                        
                        const dx = m.x - d.x;
                        const dy = m.y - d.y;
                        if (dx * dx + dy * dy < (m.radius + d.radius) * (m.radius + d.radius)) {
                            this.spawnFlash(flashPool, (m.x + d.x) / 2, (m.y + d.y) / 2, (m.radius + d.radius) * 1.5);
                            m.mass += d.mass;
                            m.radius = dustRadius(m.mass) * 1.2;
                            d.active = false;
                        }
                    }
                }
            }
        }
    }

    static checkDustCollision(a, b, flashPool) {
        if (!b.active) return;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const minDist = a.radius + b.radius;
        
        if (dx * dx + dy * dy < minDist * minDist) {
            this.spawnFlash(flashPool, (a.x + b.x) / 2, (a.y + b.y) / 2, minDist * 1.5);
            
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
            b.active = false;
        }
    }

    static spawnFlash(flashPool, x, y, radius) {
        for (let i = 0; i < flashPool.length; i++) {
            if (!flashPool[i].active) {
                flashPool[i].init(x, y, radius);
                break;
            }
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

        // Cache for State Diffing
        this.lastDisplayedState = {};
        
        this.upgradeBarTimeout = null;
        this.bindEvents();
        this.requestUIUpdate(); // Initial render
    }

    // Helper to conditionally update text only if value changed
    updateDOMElement(key, element, value) {
        if (!element) return;
        if (this.lastDisplayedState[key] === value) return;
        
        element.textContent = value;
        this.lastDisplayedState[key] = value;
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

    requestUIUpdate() {
        // Labels & Numbers
        this.updateDOMElement('mass', this.elements.massDisplay, Math.floor(this.state.starMass));
        this.updateDOMElement('dustLvl', this.elements.dustLevelDisplay, this.state.dustLevel);
        this.updateDOMElement('sizeLvl', this.elements.sizeLevelDisplay, this.state.sizeLevel);
        this.updateDOMElement('speedLvl', this.elements.speedLevelDisplay, this.state.speedLevel);

        // Costs
        this.updateDOMElement('dustCost', this.elements.dustCostDisplay, this.state.dustLevel >= MAX_DUST_LEVEL ? "MAX" : this.state.getUpgradeCost(this.state.dustLevel));
        this.updateDOMElement('sizeCost', this.elements.sizeCostDisplay, this.state.sizeLevel >= MAX_SIZE_LEVEL ? "MAX" : this.state.getUpgradeCost(this.state.sizeLevel));
        this.updateDOMElement('speedCost', this.elements.speedCostDisplay, this.state.speedLevel >= MAX_SPEED_LEVEL ? "MAX" : this.state.getUpgradeCost(this.state.speedLevel));
        
        if (this.elements.meteorCapacityCostDisplay) {
            this.updateDOMElement('metCapCost', this.elements.meteorCapacityCostDisplay, this.state.meteorCapacityLevel >= MAX_METEOR_CAPACITY_LEVEL ? "MAX" : this.state.getUpgradeCost(this.state.meteorCapacityLevel + 1));
        }
        if (this.elements.meteorChargeCostDisplay) {
            this.updateDOMElement('metChrgCost', this.elements.meteorChargeCostDisplay, this.state.meteorChargeLevel >= MAX_METEOR_CHARGE_LEVEL ? "MAX" : this.state.getUpgradeCost(this.state.meteorChargeLevel + 1));
        }

        this.refreshMeteorInventory();
        this.updateMaxedButtons();
    }

    refreshAll() {
        this.requestUIUpdate();
    }

    refreshMeteorInventory() {
        if (this.elements.meteorInventoryDisplay) {
            const inventoryString = `${this.state.currentMeteors} / ${this.state.meteorCapacityLevel}`;
            this.updateDOMElement('metInventory', this.elements.meteorInventoryDisplay, inventoryString);
        }
        
        if (this.elements.meteorRechargeBar && (this.state.currentMeteors >= this.state.meteorCapacityLevel || this.state.meteorCapacityLevel === 0)) {
            if (this.lastDisplayedState['meteorPct'] !== 0) {
                this.elements.meteorRechargeBar.style.width = "0%";
                this.lastDisplayedState['meteorPct'] = 0;
            }
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
        // Dust Cooldown Bar
        if (this.state.onCooldown) {
            const remaining = this.state.cooldownEnd - now;
            if (remaining <= 0) {
                this.state.onCooldown = false;
                this.elements.cooldownBar.style.width = "0%";
                this.lastDisplayedState['cooldownPct'] = 0;
                this.elements.createDustBtn.classList.remove("on-cooldown");
                if (this.state.autoPlaying) this.game.spawnDust(true);
            } else {
                const targetPct = (1 - remaining / this.state.cooldownDuration) * 100;
                const lastPct = this.lastDisplayedState['cooldownPct'] || 0;
                
                // Only write to DOM if change is > 0.5%
                if (Math.abs(targetPct - lastPct) > 0.5) {
                    this.elements.cooldownBar.style.width = targetPct + "%";
                    this.lastDisplayedState['cooldownPct'] = targetPct;
                }
            }
        }

        // Meteor Recharge Bar
        if (this.state.meteorCapacityLevel > 0) {
            if (this.state.currentMeteors >= this.state.meteorCapacityLevel) {
                this.state.meteorCooldownEnd = 0;
                if (this.lastDisplayedState['meteorPct'] !== 0) {
                    if (this.elements.meteorRechargeBar) this.elements.meteorRechargeBar.style.width = "0%";
                    this.lastDisplayedState['meteorPct'] = 0;
                }
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
                    const targetPct = Math.max(0, Math.min(1, (total - (this.state.meteorCooldownEnd - now)) / total)) * 100;
                    const lastPct = this.lastDisplayedState['meteorPct'] || 0;

                    if (Math.abs(targetPct - lastPct) > 0.5) {
                        this.elements.meteorRechargeBar.style.width = targetPct + "%";
                        this.lastDisplayedState['meteorPct'] = targetPct;
                    }
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
        this.bgRotation = 0;
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

    drawBackground(starRadius, dt = 1) {
        this.bgRotation -= 0.0005 * dt; // Background rotation adjustment

        const scale = Math.min(this.canvas.width * 2, this.canvas.height * 2) / VIRTUAL_STAR_SIZE;
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = "#fff";
        
        // Save the context state before transforming
        this.ctx.save();
        
        // Move the canvas origin to the center, then rotate
        this.ctx.translate(centerX, centerY);
        this.ctx.rotate(this.bgRotation);

        const currentDeadZone = starRadius * STAR_DEADZONE_MULT / scale;
        for (const star of this.stars) {
            if (Math.sqrt(star.dx * star.dx + star.dy * star.dy) < currentDeadZone) continue;
            this.ctx.beginPath();
            
            // Draw relative to the new (0,0) center origin
            this.ctx.arc(star.dx * scale, star.dy * scale, star.size * scale, 0, 2 * Math.PI);
            this.ctx.fill();
        }

        // Restore the context state so the planet and entities don't rotate
        this.ctx.restore();
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
        
        this.maxParticles = MAX_PARTICLES;
        this.maxMeteors = 50;
        this.maxFlashes = 200;

        // Initialize Fixed Pools
        this.particles = new Array(this.maxParticles);
        for (let i = 0; i < this.maxParticles; i++) this.particles[i] = new Dust();

        this.meteors = new Array(this.maxMeteors);
        for (let i = 0; i < this.maxMeteors; i++) this.meteors[i] = new Meteor();

        this.flashes = new Array(this.maxFlashes);
        for (let i = 0; i < this.maxFlashes; i++) this.flashes[i] = new FlashParticle();

        this.lastTime = performance.now();
        this.resizeCanvas();
        this.ui.elements.upgradeBar.classList.remove("visible");
        requestAnimationFrame((now) => this.loop(now));
    }

    resizeCanvas() {
        this.ui.elements.canvas.width = window.innerWidth;
        this.ui.elements.canvas.height = window.innerHeight;
    }

    getActiveParticleCount() {
        let count = 0;
        for (let i = 0; i < this.maxParticles; i++) {
            if (this.particles[i].active) count++;
        }
        return count;
    }

    spawnDust(silent) {
        if (this.state.onCooldown) return;
        
        const currentActive = this.getActiveParticleCount();
        const requestCount = this.state.getEffectiveDust();

        if (currentActive + requestCount > this.maxParticles) {
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
        
        let spawned = 0;
        for (let i = 0; i < this.maxParticles && spawned < requestCount; i++) {
            if (!this.particles[i].active) {
                this.particles[i].init(cx, cy, this.state, this.ui.elements.canvas.width, this.ui.elements.canvas.height);
                spawned++;
            }
        }

        this.state.cooldownDuration = this.state.getCooldownMs();
        this.state.cooldownEnd = performance.now() + this.state.cooldownDuration;
        this.state.onCooldown = true;
        this.ui.elements.createDustBtn.classList.add("on-cooldown");
    }

    spawnMeteor(e) {
        if (this.state.currentMeteors > 0) {
            const rect = this.ui.elements.canvas.getBoundingClientRect();
            for (let i = 0; i < this.maxMeteors; i++) {
                if (!this.meteors[i].active) {
                    this.meteors[i].init(e.clientX - rect.left, e.clientY - rect.top, this.state, this.ui.elements.canvas.width, this.ui.elements.canvas.height);
                    this.state.currentMeteors -= 1;
                    this.ui.refreshMeteorInventory();
                    break;
                }
            }
        }
    }

    loop(now) {
        const dt = (now - this.lastTime) / 16.667;
        this.lastTime = now;
        const cx = this.ui.elements.canvas.width / 2;
        const cy = this.ui.elements.canvas.height / 2;

        this.renderer.drawBackground(this.state.starRadius, dt);

        let absorptionOccurred = false;

        // Zero-allocation updates
        for (let i = 0; i < this.maxParticles; i++) {
            if (this.particles[i].active) {
                if (this.particles[i].update(dt, cx, cy, this.state)) absorptionOccurred = true;
            }
        }

        for (let i = 0; i < this.maxMeteors; i++) {
            if (this.meteors[i].active) {
                if (this.meteors[i].update(dt, cx, cy, this.state)) absorptionOccurred = true;
            }
        }

        if (absorptionOccurred) this.ui.refreshAll();

        Physics.resolveCollisions(this.particles, this.meteors, this.flashes, this.ui.elements.canvas.width, this.ui.elements.canvas.height);
        
        // Render entities
        for (let i = 0; i < this.maxParticles; i++) {
            if (this.particles[i].active) this.particles[i].draw(this.renderer.ctx);
        }
        for (let i = 0; i < this.maxMeteors; i++) {
            if (this.meteors[i].active) this.meteors[i].draw(this.renderer.ctx);
        }

        // Render Flashes directly here to avoid allocating arrays
        for (let i = 0; i < this.maxFlashes; i++) {
            const f = this.flashes[i];
            if (f.active) {
                this.renderer.ctx.beginPath();
                this.renderer.ctx.arc(f.x, f.y, f.radius * (1 - f.life * 0.5), 0, Math.PI * 2);
                this.renderer.ctx.fillStyle = `rgba(255, 240, 200, ${f.life * 0.35})`;
                this.renderer.ctx.fill();
                f.life -= 0.06;
                if (f.life <= 0) f.active = false;
            }
        }

        this.renderer.drawPlanet(this.state.starMass, this.state.starRadius);
        this.ui.updateCooldownBars(now);

        if (this.state.autoPlaying && !this.state.onCooldown && this.getActiveParticleCount() + this.state.getEffectiveDust() <= this.maxParticles) {
            this.spawnDust(true);
        }

        requestAnimationFrame((n) => this.loop(n));
    }
}

// Start Game
const game = new Game();
