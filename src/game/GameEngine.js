// ─── Sound Manager (Web Audio API – no files needed) ───────────────────────
class SoundManager {
  constructor() {
    this.ctx = null;
  }

  _getCtx() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    return this.ctx;
  }

  _play(type, freq, duration, gainVal = 0.3, decayExp = 3) {
    try {
      const ctx = this._getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch(e) {}
  }

  _noise(duration, gainVal = 0.2) {
    try {
      const ctx = this._getCtx();
      const bufSize = ctx.sampleRate * duration;
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(gainVal, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start();
    } catch(e) {}
  }

  flap()   { this._play('sine',  300, 0.12, 0.2); }
  shoot()  { this._noise(0.08, 0.3); this._play('square', 800, 0.05, 0.15); }
  sword()  { this._play('sawtooth', 220, 0.2, 0.4); this._play('sine', 440, 0.15, 0.3); }
  kill()   {
    this._noise(0.15, 0.5);
    this._play('square', 600, 0.08, 0.4);
    this._play('sine',   300, 0.18, 0.35);
  }
  die()    { this._play('sawtooth', 150, 0.5, 0.5); this._play('sine', 80, 0.4, 0.5); }
  score()  { this._play('sine', 523, 0.1, 0.2); this._play('sine', 659, 0.12, 0.2); }
}

// ─── Game Engine ──────────────────────────────────────────────────────────────
class GameEngine {
  constructor(canvas, callbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.callbacks = callbacks;
    
    this.width = canvas.width;
    this.height = canvas.height;
    
    this.isRunning = false;
    this.animationId = null;
    this.lastTime = 0;
    
    this.sound = new SoundManager();
    
    this.bindKeys();
    this.initGame();
  }

  bindKeys() {
    this.keydownHandler = (e) => {
      if (e.code === 'Space' && this.isRunning) {
        this.player.jump();
      } else if (e.code === 'KeyF' && this.isRunning) {
        this.player.attackSword();
      }
    };
    this.mousedownHandler = (e) => {
      if (this.isRunning) {
        if (e.button === 2) {
          this.player.shootGun();
        } else {
          this.player.jump();
        }
      }
    };
    this.contextMenuHandler = (e) => e.preventDefault();

    window.addEventListener('keydown', this.keydownHandler);
    this.canvas.addEventListener('mousedown', this.mousedownHandler);
    window.addEventListener('contextmenu', this.contextMenuHandler);
  }

  cleanup() {
    this.isRunning = false;
    cancelAnimationFrame(this.animationId);
    window.removeEventListener('keydown', this.keydownHandler);
    this.canvas.removeEventListener('mousedown', this.mousedownHandler);
    window.removeEventListener('contextmenu', this.contextMenuHandler);
  }

  initGame() {
    this.score = 0;
    
    this.player = new Player(this);
    this.obstacles = [];
    this.enemies = [];
    this.bullets = [];
    this.particles = [];
    this.popups = [];    // score popup texts
    
    this.spawnTimer = 0;
    this.enemySpawnTimer = 0;
    this.spawnInterval = 1800; // ms
    this.gameSpeed = 3.5; 
    this.groundOffset = 0;
  }

  start() {
    this.initGame();
    this.isRunning = true;
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  drawStartScreen() {
    this.drawBackground();
    this.player = new Player(this);
    // Draw player hovering
    this.player.y = this.height / 2 + Math.sin(Date.now() / 200) * 10;
    this.player.rotation = 0;
    this.player.draw(this.ctx);
    this.drawGround();
  }

  loop(timestamp) {
    if (!this.isRunning) return;
    
    const deltaTime = timestamp - this.lastTime;
    this.lastTime = timestamp;

    this.update(deltaTime);
    this.draw();

    this.animationId = requestAnimationFrame((ts) => this.loop(ts));
  }

  update(dt) {
    this.player.update(dt);
    
    // Ground collision
    const groundY = this.height - 50;
    if (this.player.y + this.player.h > groundY || this.player.y < 0) {
      this.gameOver();
      return;
    }

    // Spawning
    this.spawnTimer += dt;
    if (this.spawnTimer > this.spawnInterval) {
      this.spawnTimer = 0;
      this.spawnEntity();
    }

    // Update obstacles
    this.obstacles.forEach(obs => obs.update(this.gameSpeed));
    this.obstacles = this.obstacles.filter(obs => !obs.markedForDeletion);
    
    // Update enemies
    this.enemies.forEach(enemy => enemy.update(this.gameSpeed + 1, dt));
    this.enemies = this.enemies.filter(enemy => !enemy.markedForDeletion);
    
    this.enemySpawnTimer += dt;
    if (this.enemySpawnTimer > 3000) {
      this.enemySpawnTimer = 0;
      if (Math.random() > 0.4) {
         this.enemies.push(new Enemy(this.width, Math.random() * (this.height - 200) + 50));
      }
    }

    // Ground scroll
    this.groundOffset += this.gameSpeed;
    if (this.groundOffset > 40) this.groundOffset = 0;

    // Update bullets
    this.bullets.forEach(b => b.update(dt));
    this.bullets = this.bullets.filter(b => !b.markedForDeletion);
    
    // Update particles
    this.particles.forEach(p => p.update(dt));
    this.particles = this.particles.filter(p => !p.markedForDeletion);
    
    // Update score popups
    this.popups.forEach(p => p.update(dt));
    this.popups = this.popups.filter(p => !p.markedForDeletion);

    this.checkCollisions();
  }

  spawnEntity() {
    const gapSize = 160;
    const minHeight = 50;
    const maxTopHeight = this.height - 50 - gapSize - minHeight;
    const topHeight = Math.random() * (maxTopHeight - minHeight) + minHeight;
    
    this.obstacles.push(new Pipe(this.width, 0, 70, topHeight, true));
    this.obstacles.push(new Pipe(this.width, topHeight + gapSize, 70, this.height - 50 - (topHeight + gapSize), false));
  }

  checkCollisions() {
    for (const obs of this.obstacles) {
      // Adjusted hitbox for bird slightly smaller than visual bounds
      const hitbox = {
        x: this.player.x + 4,
        y: this.player.y + 4,
        w: this.player.w - 8,
        h: this.player.h - 8
      };
      
      if (this.checkRectCollision(hitbox, obs)) {
        this.gameOver();
        return;
      }
      
      // Scoring
      if (!obs.passed && this.player.x > obs.x + obs.w) {
        obs.passed = true;
        if (obs.isTop) { 
          this.score += 1;
          this.callbacks.onScoreChange(this.score);
        }
      }
    }

    for (const enemy of this.enemies) {
      const hitbox = { x: this.player.x + 4, y: this.player.y + 4, w: this.player.w - 8, h: this.player.h - 8 };
      if (this.checkRectCollision(hitbox, enemy) && !enemy.dying) {
        this.sound.die();
        this.gameOver();
        return;
      }
      
      // Sword collision
      if (this.player.swordActive) {
        const swordHitbox = { x: this.player.x + this.player.w, y: this.player.y - 20, w: 60, h: this.player.h + 40 };
        if (this.checkRectCollision(swordHitbox, enemy)) {
           this.killEnemy(enemy);
           continue;
        }
      }
      
      // Bullet collision
      for (const bullet of this.bullets) {
        if (!bullet.markedForDeletion && this.checkRectCollision(bullet, enemy)) {
           bullet.markedForDeletion = true;
           this.killEnemy(enemy);
        }
      }
    }
  }

  killEnemy(enemy) {
    if (enemy.dying) return;
    enemy.dying = true;
    enemy.markedForDeletion = true;
    this.score += 5;
    this.callbacks.onScoreChange(this.score);
    this.sound.kill();
    
    const ex = enemy.x + enemy.w / 2;
    const ey = enemy.y + enemy.h / 2;
    
    // Big burst: 16 particles of various types
    for (let i = 0; i < 16; i++) {
      this.particles.push(new Particle(ex, ey, i));
    }
    // Feather shards
    for (let i = 0; i < 6; i++) {
      this.particles.push(new Feather(ex, ey));
    }
    // Score popup
    this.popups.push(new ScorePopup(ex, ey, '+5'));
  }

  checkRectCollision(r1, r2) {
    return r1.x < r2.x + r2.w &&
           r1.x + r1.w > r2.x &&
           r1.y < r2.y + r2.h &&
           r1.y + r1.h > r2.y;
  }

  gameOver() {
    this.isRunning = false;
    this.draw(); 
    this.callbacks.onGameOver();
  }

  drawBackground() {
    // Sky
    this.ctx.fillStyle = '#4ec0ca';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Clouds (Simple approximation)
    this.ctx.fillStyle = '#fff';
    const drawCloud = (cx, cy) => {
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, 20, 0, Math.PI * 2);
      this.ctx.arc(cx + 25, cy - 10, 30, 0, Math.PI * 2);
      this.ctx.arc(cx + 50, cy, 25, 0, Math.PI * 2);
      this.ctx.fill();
    };
    drawCloud(100, 150);
    drawCloud(400, 100);
    drawCloud(700, 180);

    // City Skyline (Approximation)
    this.ctx.fillStyle = '#94e0e5'; // Lighter cyan
    for (let i = 0; i < this.width; i += 60) {
      const h = 40 + Math.random() * 60;
      this.ctx.fillRect(i, this.height - 50 - h, 50, h);
    }
    
    // Distant trees/bushes
    this.ctx.fillStyle = '#73bf2e';
    for (let i = -20; i < this.width + 50; i += 80) {
       this.ctx.beginPath();
       this.ctx.arc(i, this.height - 50, 40, Math.PI, 0);
       this.ctx.fill();
    }
  }

  drawGround() {
    const groundY = this.height - 50;
    
    // Dirt
    this.ctx.fillStyle = '#ded895';
    this.ctx.fillRect(0, groundY, this.width, 50);
    
    // Top border
    this.ctx.fillStyle = '#543847';
    this.ctx.fillRect(0, groundY, this.width, 4);
    
    // Stripes
    this.ctx.fillStyle = '#73bf2e'; // green stripes
    for(let i = -this.groundOffset; i < this.width; i += 40) {
      this.ctx.beginPath();
      this.ctx.moveTo(i, groundY + 4);
      this.ctx.lineTo(i + 20, groundY + 4);
      this.ctx.lineTo(i + 10, groundY + 20);
      this.ctx.lineTo(i - 10, groundY + 20);
      this.ctx.fill();
      
      // dark green bottom stripe
      this.ctx.fillStyle = '#558022';
      this.ctx.beginPath();
      this.ctx.moveTo(i - 10, groundY + 20);
      this.ctx.lineTo(i + 10, groundY + 20);
      this.ctx.lineTo(i + 5, groundY + 28);
      this.ctx.lineTo(i - 15, groundY + 28);
      this.ctx.fill();
      this.ctx.fillStyle = '#73bf2e';
    }
  }

  draw() {
    this.drawBackground();
    this.obstacles.forEach(obs => obs.draw(this.ctx));
    this.enemies.forEach(enemy => enemy.draw(this.ctx, this.lastTime));
    this.bullets.forEach(b => b.draw(this.ctx));
    this.particles.forEach(p => p.draw(this.ctx));
    this.drawGround();
    this.player.draw(this.ctx);
    this.popups.forEach(p => p.draw(this.ctx));
  }
}

class Player {
  constructor(game) {
    this.game = game;
    this.x = 200;
    this.y = 250;
    this.w = 34; // Pixel bird size
    this.h = 24;
    
    this.vy = 0;
    this.gravity = 0.4;
    this.jumpForce = -7.5;
    
    this.rotation = 0;
    
    this.swordActive = false;
    this.swordTimer = 0;
    this.swordCooldown = 0;
    this.gunCooldown = 0;
  }

  jump() {
    this.vy = this.jumpForce;
    this.game.sound.flap();
  }

  attackSword() {
    if (this.swordCooldown <= 0) {
      this.swordActive = true;
      this.swordTimer = 150;
      this.swordCooldown = 400;
      this.game.sound.sword();
    }
  }

  shootGun() {
    if (this.gunCooldown <= 0) {
      this.game.bullets.push(new Bullet(this.x + this.w, this.y + this.h / 2));
      this.gunCooldown = 200;
      this.vy -= 1; // minor recoil
      this.game.sound.shoot();
    }
  }

  update(dt) {
    this.vy += this.gravity;
    this.y += this.vy;

    if (this.swordTimer > 0) {
      this.swordTimer -= dt;
      if (this.swordTimer <= 0) this.swordActive = false;
    }
    if (this.swordCooldown > 0) this.swordCooldown -= dt;
    if (this.gunCooldown > 0) this.gunCooldown -= dt;

    // Rotation logic similar to flappy bird
    if (this.vy < -1) this.rotation = -Math.PI / 6;
    else if (this.vy > 3) this.rotation = Math.min(Math.PI / 2, (this.vy - 3) * 0.1);
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x + this.w/2, this.y + this.h/2);
    ctx.rotate(this.rotation);
    
    const cx = -this.w/2;
    const cy = -this.h/2;
    
    // Pixel Bird Approximation
    
    // Body (Yellow)
    ctx.fillStyle = '#f7a833'; // Bird yellow/orange
    ctx.fillRect(cx, cy + 4, this.w - 4, this.h - 8);
    ctx.fillRect(cx + 4, cy, this.w - 12, this.h);
    
    // Black border outline (simplified)
    ctx.strokeStyle = '#543847';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx, cy + 4, this.w - 4, this.h - 8);
    
    // White eye
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx + this.w - 14, cy + 2, 10, 10);
    ctx.strokeRect(cx + this.w - 14, cy + 2, 10, 10);
    
    // Black pupil
    ctx.fillStyle = '#000';
    ctx.fillRect(cx + this.w - 8, cy + 6, 4, 4);
    
    // Red Beak
    ctx.fillStyle = '#d32f2f';
    ctx.fillRect(cx + this.w - 8, cy + 12, 12, 8);
    ctx.strokeRect(cx + this.w - 8, cy + 12, 12, 8);
    
    // White wing
    ctx.fillStyle = '#fff';
    const flap = this.game.isRunning ? Math.sin(this.game.lastTime / 100) * 4 : 0;
    ctx.fillRect(cx - 2, cy + 10 + flap, 14, 8);
    ctx.strokeRect(cx - 2, cy + 10 + flap, 14, 8);
    
    // Draw Sword effect
    if (this.swordActive) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.beginPath();
      ctx.arc(this.w/2, 0, 60, -Math.PI/2, Math.PI/2);
      ctx.lineTo(this.w/2, 0);
      ctx.fill();
      
      ctx.strokeStyle = '#ff00ff';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    ctx.restore();
  }
}

class Pipe {
  constructor(x, y, w, h, isTop) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.isTop = isTop;
    this.markedForDeletion = false;
    this.passed = false;
  }
  
  update(speed) {
    this.x -= speed;
    if (this.x + this.w < 0) this.markedForDeletion = true;
  }
  
  draw(ctx) {
    // Pipe body
    ctx.fillStyle = '#73bf2e';
    ctx.fillRect(this.x, this.y, this.w, this.h);
    
    // Pipe black outline
    ctx.strokeStyle = '#543847';
    ctx.lineWidth = 3;
    ctx.strokeRect(this.x, this.y, this.w, this.h);
    
    // Pipe shading/highlights
    ctx.fillStyle = '#9de057';
    ctx.fillRect(this.x + 5, this.y, 10, this.h);
    ctx.fillStyle = '#558022';
    ctx.fillRect(this.x + this.w - 15, this.y, 10, this.h);
    
    // Cap
    const capHeight = 30;
    const capWidth = this.w + 10;
    const capX = this.x - 5;
    const capY = this.isTop ? (this.y + this.h - capHeight) : this.y;
    
    ctx.fillStyle = '#73bf2e';
    ctx.fillRect(capX, capY, capWidth, capHeight);
    ctx.strokeRect(capX, capY, capWidth, capHeight);
    
    // Cap shading
    ctx.fillStyle = '#9de057';
    ctx.fillRect(capX + 5, capY + 2, 10, capHeight - 4);
    ctx.fillStyle = '#558022';
    ctx.fillRect(capX + capWidth - 15, capY + 2, 10, capHeight - 4);
  }
}

class Enemy {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.w = 34;
    this.h = 24;
    this.baseY = y;
    this.time = 0;
    this.markedForDeletion = false;
  }
  update(speed, dt) {
    this.x -= speed;
    this.time += dt;
    this.y = this.baseY + Math.sin(this.time / 200) * 30;
    if (this.x + this.w < 0) this.markedForDeletion = true;
  }
  draw(ctx, time) {
    const cx = this.x;
    const cy = this.y;
    
    // Draw a red retro bird (facing left)
    ctx.fillStyle = '#d32f2f'; // Red body
    ctx.fillRect(cx, cy + 4, this.w - 4, this.h - 8);
    ctx.fillRect(cx + 4, cy, this.w - 12, this.h);
    
    // Outline
    ctx.strokeStyle = '#543847';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx, cy + 4, this.w - 4, this.h - 8);
    
    // Eye (facing left)
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx + 4, cy + 2, 10, 10);
    ctx.strokeRect(cx + 4, cy + 2, 10, 10);
    
    // Pupil
    ctx.fillStyle = '#000';
    ctx.fillRect(cx + 4, cy + 6, 4, 4);
    
    // Beak
    ctx.fillStyle = '#f7a833';
    ctx.fillRect(cx - 4, cy + 12, 12, 8);
    ctx.strokeRect(cx - 4, cy + 12, 12, 8);
    
    // Wing
    ctx.fillStyle = '#fff';
    const flap = Math.sin(time / 100) * 4;
    ctx.fillRect(cx + 12, cy + 10 + flap, 14, 8);
    ctx.strokeRect(cx + 12, cy + 10 + flap, 14, 8);
  }
}

class Bullet {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.w = 12;
    this.h = 4;
    this.speed = 12;
    this.markedForDeletion = false;
  }
  update(dt) {
    this.x += this.speed;
    if (this.x > 1000) this.markedForDeletion = true; // Off screen
  }
  draw(ctx) {
    ctx.fillStyle = '#ffeb3b';
    ctx.fillRect(this.x, this.y, this.w, this.h);
    ctx.strokeStyle = '#f57f17';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.x, this.y, this.w, this.h);
  }
}

const PARTICLE_COLORS = ['#ff4444','#ffaa00','#ffff00','#ffffff','#ff88cc','#ff6600'];

class Particle {
  constructor(x, y, index = 0) {
    this.x = x;
    this.y = y;
    const angle = (index / 16) * Math.PI * 2;
    const speed = 3 + Math.random() * 8;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed - 2;
    this.gravity = 0.25;
    this.life = 1.0;
    this.decay = 0.025 + Math.random() * 0.03;
    this.size = 4 + Math.random() * 6;
    this.color = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
    this.markedForDeletion = false;
  }
  update(dt) {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += this.gravity;
    this.vx *= 0.97;
    this.life -= this.decay;
    if (this.life <= 0) this.markedForDeletion = true;
  }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class Feather {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 5;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed - 3;
    this.gravity = 0.15;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotSpeed = (Math.random() - 0.5) * 0.3;
    this.life = 1.0;
    this.markedForDeletion = false;
    this.color = Math.random() > 0.5 ? '#fff' : '#d32f2f';
  }
  update(dt) {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += this.gravity;
    this.vx *= 0.98;
    this.rotation += this.rotSpeed;
    this.life -= 0.02;
    if (this.life <= 0) this.markedForDeletion = true;
  }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.fillStyle = this.color;
    ctx.strokeStyle = '#543847';
    ctx.lineWidth = 1;
    // Feather shape (elongated ellipse)
    ctx.beginPath();
    ctx.ellipse(0, 0, 3, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

class ScorePopup {
  constructor(x, y, text) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.vy = -2;
    this.life = 1.0;
    this.markedForDeletion = false;
  }
  update(dt) {
    this.y += this.vy;
    this.vy *= 0.95;
    this.life -= 0.025;
    if (this.life <= 0) this.markedForDeletion = true;
  }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.font = 'bold 20px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffeb3b';
    ctx.shadowColor = '#f57f17';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = '#543847';
    ctx.lineWidth = 3;
    ctx.strokeText(this.text, this.x, this.y);
    ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  }
}

export default GameEngine;
