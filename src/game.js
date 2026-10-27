import {
  clamp,
  checkCircleRectCollision,
  calculatePaddleBounce,
  calculateScore,
  getExplosionAffectedBricks,
  generateStageBricks
} from './game/physics.js';
import { sound } from './sound.js';

export const POWERUP_TYPES = {
  MULTI_BALL: { id: 'MULTI_BALL', name: '多重球', color: '#38bdf8', icon: '🔵', duration: 0 },
  LASER: { id: 'LASER', name: '雷射砲台', color: '#f43f5e', icon: '⚡', duration: 12 },
  EXPAND: { id: 'EXPAND', name: '寬幅板', color: '#10b981', icon: '↔️', duration: 15 },
  SHRINK: { id: 'SHRINK', name: '窄化板', color: '#a855f7', icon: '⚠️', duration: 10 },
  FIRE_BALL: { id: 'FIRE_BALL', name: '貫穿火球', color: '#f97316', icon: '🔥', duration: 10 },
  STICKY: { id: 'STICKY', name: '磁吸黏球', color: '#eab308', icon: '🧲', duration: 14 },
  SLOW: { id: 'SLOW', name: '減速冷卻', color: '#06b6d4', icon: '⏱️', duration: 12 },
  SAFETY_SHIELD: { id: 'SAFETY_SHIELD', name: '能量防護底線', color: '#22c55e', icon: '🛡️', duration: 15 },
  EXTRA_LIFE: { id: 'EXTRA_LIFE', name: '額外生命', color: '#ec4899', icon: '❤️', duration: 0 }
};

export class BreakoutGame {
  constructor(canvas, hudElements) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hud = hudElements;

    // Game state
    this.state = 'title'; // 'title' | 'playing' | 'paused' | 'gameover' | 'victory'
    this.score = 0;
    this.highScore = parseInt(localStorage.getItem('breakout_high_score') || '0', 10);
    this.lives = 3;
    this.maxLives = 5;
    this.currentStageIndex = 0;
    this.difficulty = 'normal'; // 'casual' | 'normal' | 'arcade'
    this.combo = 0;
    this.maxCombo = 0;
    this.bricksDestroyedCount = 0;
    this.stageStartTime = 0;
    this.stageClearTime = 0;

    // Arena dimensions (virtual game space)
    this.width = 800;
    this.height = 600;

    // Simulation timing
    this.lastTime = 0;
    this.hitstopTimer = 0;
    this.screenShake = 0;

    // Paddle
    this.basePaddleWidth = 105;
    this.paddle = {
      x: 350,
      y: 545,
      width: this.basePaddleWidth,
      height: 14,
      vx: 0,
      targetX: 350,
      laserCooldown: 0
    };

    // Input state
    this.keys = { left: false, right: false, space: false };
    this.mouseControl = false;

    // Entities
    this.balls = [];
    this.bricks = [];
    this.targetBricksCount = 0;
    this.powerups = [];
    this.activePowerups = new Map(); // typeId -> remainingTime
    this.lasers = [];
    this.particles = [];
    this.floatingTexts = [];
    this.shieldActive = false;

    // Setup High DPI canvas resolution
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    this.bindEvents();
    this.updateHUD();
    this.setGameState('title');
  }

  resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    const displayWidth = rect.width || this.canvas.parentElement.clientWidth || 800;
    const displayHeight = rect.height || (displayWidth * 0.75) || 600;

    this.canvas.width = displayWidth * dpr;
    this.canvas.height = displayHeight * dpr;

    this.ctx.resetTransform?.();
    this.ctx.scale((displayWidth * dpr) / this.width, (displayHeight * dpr) / this.height);
  }

  setGameState(newState) {
    this.state = newState;
    document.body.dataset.state = newState;

    if (this.hud.screens) {
      this.hud.screens.title.classList.toggle('hidden', newState !== 'title');
      this.hud.screens.pause.classList.toggle('hidden', newState !== 'paused');
      this.hud.screens.gameover.classList.toggle('hidden', newState !== 'gameover' && newState !== 'victory');
    }

    if (newState === 'title') {
      this.resetToStage(this.currentStageIndex, false);
    }
  }

  bindEvents() {
    // Keyboard
    window.addEventListener('keydown', (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        this.keys.left = true;
        this.mouseControl = false;
      }
      if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        this.keys.right = true;
        this.mouseControl = false;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        this.handleActionTrigger();
      }
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (this.state === 'playing') {
          this.setGameState('paused');
        } else if (this.state === 'paused') {
          this.setGameState('playing');
        }
      }
      if (e.code === 'KeyM') {
        const isMuted = sound.toggleMute();
        this.updateMuteButton(isMuted);
      }
      if (e.code === 'KeyR' && (this.state === 'playing' || this.state === 'paused')) {
        this.startRun();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.keys.left = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.keys.right = false;
    });

    // Pointer / Mouse move
    this.canvas.addEventListener('mousemove', (e) => {
      this.mouseControl = true;
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.width / rect.width;
      const mouseX = (e.clientX - rect.x) * scaleX;
      this.paddle.targetX = clamp(mouseX - this.paddle.width / 2, 0, this.width - this.paddle.width);
    });

    // Pointer click / Tap
    this.canvas.addEventListener('pointerdown', (e) => {
      this.mouseControl = true;
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.width / rect.width;
      const mouseX = (e.clientX - rect.x) * scaleX;
      this.paddle.targetX = clamp(mouseX - this.paddle.width / 2, 0, this.width - this.paddle.width);
      this.handleActionTrigger();
    });

    // Touch support for smooth mobile dragging
    const handleTouchMove = (e) => {
      if (e.touches && e.touches[0]) {
        this.mouseControl = true;
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.width / rect.width;
        const touchX = (e.touches[0].clientX - rect.x) * scaleX;
        this.paddle.targetX = clamp(touchX - this.paddle.width / 2, 0, this.width - this.paddle.width);
      }
    };
    this.canvas.addEventListener('touchmove', handleTouchMove, { passive: true });
    this.canvas.addEventListener('touchstart', (e) => {
      handleTouchMove(e);
      this.handleActionTrigger();
    }, { passive: true });

    // Focus lost safety
    window.addEventListener('blur', () => {
      this.keys.left = false;
      this.keys.right = false;
    });
  }

  handleActionTrigger() {
    if (this.state === 'title') {
      this.startRun();
      return;
    }
    if (this.state !== 'playing') return;

    // 1. Launch any sticky/unlaunched balls
    let launchedAny = false;
    this.balls.forEach(ball => {
      if (ball.stuckToPaddle) {
        ball.stuckToPaddle = false;
        const angle = (Math.random() * 0.4 - 0.2); // slight random deviation
        const speed = ball.speed || this.getBaseBallSpeed();
        ball.vx = Math.sin(angle) * speed;
        ball.vy = -Math.cos(angle) * speed;
        launchedAny = true;
      }
    });

    // 2. Fire laser if laser powerup is active
    if (this.activePowerups.has('LASER') && this.paddle.laserCooldown <= 0) {
      this.fireLasers();
      this.paddle.laserCooldown = 0.22; // rapid fire
    } else if (launchedAny) {
      sound.playPaddleBounce();
    }
  }

  fireLasers() {
    sound.playLaser();
    const leftX = this.paddle.x + 8;
    const rightX = this.paddle.x + this.paddle.width - 8;
    const y = this.paddle.y - 4;

    this.lasers.push(
      { x: leftX, y, vy: -750, width: 4, height: 16, alive: true },
      { x: rightX, y, vy: -750, width: 4, height: 16, alive: true }
    );

    // Muzzle sparks
    this.createMuzzleSparks(leftX, y);
    this.createMuzzleSparks(rightX, y);
  }

  getBaseBallSpeed() {
    if (this.difficulty === 'casual') return 340;
    if (this.difficulty === 'arcade') return 460;
    return 390; // normal
  }

  startRun() {
    sound.init();
    this.score = 0;
    this.lives = 3;
    this.combo = 0;
    this.maxCombo = 0;
    this.bricksDestroyedCount = 0;
    this.activePowerups.clear();
    this.stageStartTime = performance.now();
    this.resetToStage(this.currentStageIndex, true);
    this.setGameState('playing');
    this.updateHUD();
  }

  resetToStage(stageIndex, launchReady = false) {
    this.currentStageIndex = stageIndex;
    this.activePowerups.clear();
    this.lasers = [];
    this.powerups = [];
    this.particles = [];
    this.floatingTexts = [];
    this.shieldActive = false;
    this.combo = 0;

    // Reset paddle size
    this.paddle.width = this.basePaddleWidth;
    this.paddle.x = (this.width - this.paddle.width) / 2;
    this.paddle.targetX = this.paddle.x;

    // Generate stage
    const stageData = generateStageBricks(stageIndex, this.width, this.height);
    this.bricks = stageData.bricks;
    this.targetBricksCount = stageData.targetCount;
    this.stageName = stageData.name;

    // Ball on paddle
    this.spawnBall(launchReady);
    this.updateHUD();
  }

  spawnBall(stuck = true) {
    const ballRadius = 7;
    const speed = this.getBaseBallSpeed();
    const ball = {
      x: this.paddle.x + this.paddle.width / 2,
      y: this.paddle.y - ballRadius - 1,
      radius: ballRadius,
      vx: 0,
      vy: -speed,
      speed,
      stuckToPaddle: stuck,
      stuckOffsetX: 0,
      isFireball: this.activePowerups.has('FIRE_BALL'),
      trail: []
    };
    this.balls = [ball];
  }

  addExtraBalls(count = 2) {
    if (this.balls.length === 0) return;
    const refBall = this.balls[0];
    const speed = refBall.speed || this.getBaseBallSpeed();

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI / 4) * (i % 2 === 0 ? 1 : -1) + (Math.random() * 0.2 - 0.1);
      this.balls.push({
        x: refBall.x,
        y: refBall.y,
        radius: refBall.radius,
        vx: Math.sin(angle) * speed,
        vy: -Math.cos(angle) * speed,
        speed,
        stuckToPaddle: false,
        stuckOffsetX: 0,
        isFireball: this.activePowerups.has('FIRE_BALL'),
        trail: []
      });
    }
  }

  applyPowerup(typeId) {
    const config = POWERUP_TYPES[typeId];
    if (!config) return;

    sound.playPowerup();
    this.createFloatingText(`+道具: ${config.name}!`, this.paddle.x + this.paddle.width / 2, this.paddle.y - 20, config.color);

    if (typeId === 'MULTI_BALL') {
      this.addExtraBalls(2);
      return;
    }

    if (typeId === 'EXTRA_LIFE') {
      if (this.lives < this.maxLives) {
        this.lives++;
        this.updateHUD();
      }
      return;
    }

    if (typeId === 'SAFETY_SHIELD') {
      this.shieldActive = true;
    }

    // Timed powerups
    this.activePowerups.set(typeId, config.duration);

    // Apply immediate modifications
    if (typeId === 'EXPAND') {
      this.paddle.width = this.basePaddleWidth * 1.45;
      this.paddle.x = clamp(this.paddle.x, 0, this.width - this.paddle.width);
    } else if (typeId === 'SHRINK') {
      this.paddle.width = this.basePaddleWidth * 0.72;
    } else if (typeId === 'FIRE_BALL') {
      this.balls.forEach(b => { b.isFireball = true; });
    }

    this.updateHUD();
  }

  dropRandomPowerup(x, y) {
    // 35% chance to drop powerup on normal brick, 100% on gift brick
    const keys = Object.keys(POWERUP_TYPES);
    // Weight popular & helpful powerups
    const weightedKeys = [
      'MULTI_BALL', 'MULTI_BALL',
      'LASER', 'LASER',
      'EXPAND', 'EXPAND',
      'FIRE_BALL',
      'STICKY',
      'SLOW',
      'SAFETY_SHIELD',
      'EXTRA_LIFE',
      'SHRINK'
    ];
    const picked = weightedKeys[Math.floor(Math.random() * weightedKeys.length)];
    const config = POWERUP_TYPES[picked];

    this.powerups.push({
      type: picked,
      config,
      x: x - 14,
      y,
      width: 28,
      height: 28,
      vy: 140,
      rotation: 0
    });
  }

  // Explosions from Bomb brick
  triggerBombExplosion(bombBrick) {
    sound.playExplosion();
    this.screenShake = 16;
    this.createExplosionBurst(bombBrick.x + bombBrick.width / 2, bombBrick.y + bombBrick.height / 2);

    const affected = getExplosionAffectedBricks(bombBrick, this.bricks, 95);
    affected.forEach(brick => {
      brick.alive = false;
      this.bricksDestroyedCount++;
      const pts = calculateScore(brick.points, ++this.combo);
      this.score += pts;
      this.createBrickDebris(brick);
      this.createFloatingText(`+${pts}`, brick.x + brick.width / 2, brick.y, '#f59e0b');

      if (brick.type === 'gift') {
        this.dropRandomPowerup(brick.x + brick.width / 2, brick.y + brick.height / 2);
      }
    });

    this.checkStageProgress();
  }

  destroyBrick(brick, hitBall = null) {
    brick.alive = false;
    this.bricksDestroyedCount++;
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;

    const earned = calculateScore(brick.points, this.combo);
    this.score += earned;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('breakout_high_score', this.highScore.toString());
    }

    sound.playBrickDestroy();
    this.createBrickDebris(brick);

    // Floating score & combo popup
    if (this.combo >= 3) {
      this.createFloatingText(`+${earned} 連擊x${this.combo}!`, brick.x + brick.width / 2, brick.y, '#ec4899');
    } else {
      this.createFloatingText(`+${earned}`, brick.x + brick.width / 2, brick.y, brick.color);
    }

    // Drop powerup
    if (brick.type === 'gift') {
      this.dropRandomPowerup(brick.x + brick.width / 2, brick.y + brick.height / 2);
    } else if (Math.random() < 0.28) {
      this.dropRandomPowerup(brick.x + brick.width / 2, brick.y + brick.height / 2);
    }

    this.checkStageProgress();
    this.updateHUD();
  }

  checkStageProgress() {
    const remaining = this.bricks.filter(b => b.alive && b.type !== 'metal').length;
    if (remaining === 0) {
      this.stageVictory();
    }
  }

  stageVictory() {
    sound.playVictory();
    this.stageClearTime = ((performance.now() - this.stageStartTime) / 1000).toFixed(1);
    const bonus = 1000 * (this.currentStageIndex + 1);
    this.score += bonus;
    this.createFloatingText(`通關獎勵 +${bonus}!`, this.width / 2, this.height / 2 - 30, '#10b981');

    if (this.currentStageIndex < 4) {
      // Advance to next stage after short fanfare delay
      setTimeout(() => {
        if (this.state === 'playing') {
          this.currentStageIndex++;
          this.resetToStage(this.currentStageIndex, true);
        }
      }, 1500);
    } else {
      // Completed all stages!
      setTimeout(() => {
        this.setGameState('victory');
        this.updateModalStats('通關獲勝 (VICTORY)');
      }, 1200);
    }
  }

  handleBallLost(ball) {
    const idx = this.balls.indexOf(ball);
    if (idx !== -1) {
      this.balls.splice(idx, 1);
    }

    // If still have other balls in play (multi-ball), keep playing!
    if (this.balls.length > 0) return;

    // Check bottom safety shield
    if (this.shieldActive) {
      this.shieldActive = false;
      this.activePowerups.delete('SAFETY_SHIELD');
      this.createFloatingText('🛡️ 防護罩破碎！', this.width / 2, this.height - 30, '#22c55e');
      this.spawnBall(false);
      sound.playWallBounce();
      return;
    }

    // Lost a life
    this.lives--;
    this.combo = 0;
    this.screenShake = 12;
    sound.playLoseLife();
    this.updateHUD();

    if (this.lives <= 0) {
      sound.playGameOver();
      this.setGameState('gameover');
      this.updateModalStats('遊戲結束 (GAME OVER)');
    } else {
      // Spawn new ball on paddle
      this.spawnBall(true);
    }
  }

  // Update Game Loop
  update(dt) {
    if (this.state !== 'playing') return;

    // Sim Hitstop handling
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      return;
    }

    // Screen shake decay
    if (this.screenShake > 0) {
      this.screenShake = Math.max(0, this.screenShake - dt * 32);
    }

    // Laser weapon cooldown
    if (this.paddle.laserCooldown > 0) {
      this.paddle.laserCooldown -= dt;
    }

    // Active power-up timers
    for (const [typeId, timeLeft] of this.activePowerups.entries()) {
      const nextTime = timeLeft - dt;
      if (nextTime <= 0) {
        this.activePowerups.delete(typeId);
        // Revert powerup changes
        if (typeId === 'EXPAND' || typeId === 'SHRINK') {
          this.paddle.width = this.basePaddleWidth;
        } else if (typeId === 'FIRE_BALL') {
          this.balls.forEach(b => { b.isFireball = false; });
        } else if (typeId === 'SAFETY_SHIELD') {
          this.shieldActive = false;
        }
      } else {
        this.activePowerups.set(typeId, nextTime);
      }
    }

    // 1. Update Paddle
    const prevPaddleX = this.paddle.x;
    const keyboardSpeed = 650;
    if (!this.mouseControl) {
      if (this.keys.left) this.paddle.x -= keyboardSpeed * dt;
      if (this.keys.right) this.paddle.x += keyboardSpeed * dt;
    } else {
      // Smooth interpolation to target
      this.paddle.x += (this.paddle.targetX - this.paddle.x) * Math.min(1, dt * 26);
    }
    this.paddle.x = clamp(this.paddle.x, 0, this.width - this.paddle.width);
    this.paddle.vx = (this.paddle.x - prevPaddleX) / dt;

    // 2. Update Lasers
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const laser = this.lasers[i];
      laser.y += laser.vy * dt;

      // Check collision with bricks
      for (const brick of this.bricks) {
        if (!brick.alive) continue;
        if (
          laser.x >= brick.x &&
          laser.x <= brick.x + brick.width &&
          laser.y >= brick.y &&
          laser.y <= brick.y + brick.height
        ) {
          laser.alive = false;
          this.createMuzzleSparks(laser.x, laser.y);

          if (brick.type === 'metal') {
            // Laser can chip metal!
            brick.hp -= 1;
            sound.playBrickHit();
            if (brick.hp <= 997) { // 2 hits
              this.destroyBrick(brick);
            }
          } else if (brick.type === 'bomb') {
            brick.alive = false;
            this.triggerBombExplosion(brick);
          } else {
            brick.hp--;
            if (brick.hp <= 0) {
              this.destroyBrick(brick);
            } else {
              sound.playBrickHit(this.combo);
            }
          }
          break;
        }
      }

      if (laser.y < -20 || !laser.alive) {
        this.lasers.splice(i, 1);
      }
    }

    // 3. Update Powerup drops
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const p = this.powerups[i];
      p.y += p.vy * dt;
      p.rotation += dt * 3;

      // Check paddle catch
      if (
        p.y + p.height >= this.paddle.y &&
        p.y <= this.paddle.y + this.paddle.height &&
        p.x + p.width >= this.paddle.x &&
        p.x <= this.paddle.x + this.paddle.width
      ) {
        this.applyPowerup(p.type);
        this.powerups.splice(i, 1);
        continue;
      }

      // Fallen below screen
      if (p.y > this.height + 40) {
        this.powerups.splice(i, 1);
      }
    }

    // 4. Update Balls
    const speedMult = this.activePowerups.has('SLOW') ? 0.72 : 1.0;
    for (let bIdx = this.balls.length - 1; bIdx >= 0; bIdx--) {
      const ball = this.balls[bIdx];

      if (ball.stuckToPaddle) {
        ball.x = this.paddle.x + this.paddle.width / 2 + (ball.stuckOffsetX || 0);
        ball.y = this.paddle.y - ball.radius - 1;
        continue;
      }

      // Ball trail history
      ball.trail.push({ x: ball.x, y: ball.y });
      if (ball.trail.length > 8) ball.trail.shift();

      // Step ball position
      ball.x += ball.vx * speedMult * dt;
      ball.y += ball.vy * speedMult * dt;

      // Wall collisions
      if (ball.x - ball.radius < 0) {
        ball.x = ball.radius;
        ball.vx = Math.abs(ball.vx);
        sound.playWallBounce();
      } else if (ball.x + ball.radius > this.width) {
        ball.x = this.width - ball.radius;
        ball.vx = -Math.abs(ball.vx);
        sound.playWallBounce();
      }

      if (ball.y - ball.radius < 0) {
        ball.y = ball.radius;
        ball.vy = Math.abs(ball.vy);
        sound.playWallBounce();
      }

      // Bottom fall-out check
      if (ball.y - ball.radius > this.height) {
        this.handleBallLost(ball);
        continue;
      }

      // Paddle collision
      if (ball.vy > 0) {
        const paddleCol = checkCircleRectCollision(ball, this.paddle);
        if (paddleCol.collided) {
          sound.playPaddleBounce();
          this.combo = 0; // reset combo chain on paddle hit

          if (this.activePowerups.has('STICKY')) {
            ball.stuckToPaddle = true;
            ball.stuckOffsetX = ball.x - (this.paddle.x + this.paddle.width / 2);
            continue;
          }

          const bounce = calculatePaddleBounce(ball, this.paddle);
          ball.vx = bounce.vx;
          ball.vy = bounce.vy;
          ball.y = this.paddle.y - ball.radius - 1; // prevent sticking

          // Tiny paddle spark
          this.createMuzzleSparks(ball.x, this.paddle.y, '#38bdf8');
        }
      }

      // Brick collisions
      for (const brick of this.bricks) {
        if (!brick.alive) continue;

        const col = checkCircleRectCollision(ball, brick);
        if (col.collided) {
          // Fireball penetrates through bricks without bouncing!
          if (ball.isFireball) {
            this.createMuzzleSparks(ball.x, ball.y, '#f97316');
            if (brick.type === 'bomb') {
              this.triggerBombExplosion(brick);
            } else {
              this.destroyBrick(brick, ball);
            }
            continue;
          }

          // Normal ball bounce calculation
          // Reflect based on collision normal
          if (Math.abs(col.normalX) > Math.abs(col.normalY)) {
            ball.vx = col.normalX * Math.abs(ball.vx);
            ball.x += col.normalX * col.depth;
          } else {
            ball.vy = col.normalY * Math.abs(ball.vy);
            ball.y += col.normalY * col.depth;
          }

          // Anti-horizontal lock guard
          if (Math.abs(ball.vy) < 60) {
            ball.vy = ball.vy >= 0 ? 80 : -80;
          }

          // Damage or destroy brick
          if (brick.type === 'metal') {
            sound.playWallBounce();
            this.createMuzzleSparks(ball.x, ball.y, '#94a3b8');
          } else if (brick.type === 'bomb') {
            this.triggerBombExplosion(brick);
          } else {
            brick.hp--;
            if (brick.hp <= 0) {
              this.destroyBrick(brick, ball);
            } else {
              sound.playBrickHit(this.combo);
              this.createBrickDamageSparks(brick);
            }
          }
          break; // Process one brick collision per frame for consistency
        }
      }
    }

    // 5. Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.gravity || 0) * dt;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // 6. Update Floating Texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y -= 38 * dt;
      ft.life -= dt;
      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }
  }

  // Visual FX helpers
  createBrickDebris(brick) {
    const count = 12;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.4);
      const speed = 70 + Math.random() * 140;
      this.particles.push({
        x: brick.x + brick.width / 2,
        y: brick.y + brick.height / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: 280,
        color: brick.color,
        size: 3 + Math.random() * 3,
        life: 0.5 + Math.random() * 0.3,
        maxLife: 0.8
      });
    }
  }

  createBrickDamageSparks(brick) {
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 80;
      this.particles.push({
        x: brick.x + brick.width / 2,
        y: brick.y + brick.height / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: 120,
        color: '#ffffff',
        size: 2,
        life: 0.25,
        maxLife: 0.25
      });
    }
  }

  createExplosionBurst(x, y) {
    for (let i = 0; i < 28; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 100 + Math.random() * 260;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: 100,
        color: i % 2 === 0 ? '#ef4444' : '#f59e0b',
        size: 4 + Math.random() * 4,
        life: 0.6 + Math.random() * 0.4,
        maxLife: 1.0
      });
    }
  }

  createMuzzleSparks(x, y, color = '#ef4444') {
    for (let i = 0; i < 4; i++) {
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 80,
        vy: -Math.random() * 90,
        color,
        size: 2,
        life: 0.18,
        maxLife: 0.18
      });
    }
  }

  createFloatingText(text, x, y, color = '#ffffff') {
    this.floatingTexts.push({
      text,
      x,
      y,
      color,
      life: 0.85,
      maxLife: 0.85
    });
  }

  // Render loop
  render() {
    const ctx = this.ctx;
    ctx.save();

    // Screen shake
    if (this.screenShake > 0) {
      const shakeX = (Math.random() - 0.5) * this.screenShake;
      const shakeY = (Math.random() - 0.5) * this.screenShake;
      ctx.translate(shakeX, shakeY);
    }

    // Background: dark neon cyber grid
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, this.width, this.height);

    // Subtle grid pattern
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.45)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx < this.width; gx += 40) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, this.height);
      ctx.stroke();
    }
    for (let gy = 0; gy < this.height; gy += 40) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(this.width, gy);
      ctx.stroke();
    }

    // Render Bottom Safety Shield if active
    if (this.shieldActive) {
      ctx.save();
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#22c55e';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(0, this.height - 4);
      ctx.lineTo(this.width, this.height - 4);
      ctx.stroke();
      ctx.restore();
    }

    // Render Bricks
    for (const brick of this.bricks) {
      if (!brick.alive) continue;

      ctx.save();
      ctx.shadowColor = brick.color;
      ctx.shadowBlur = brick.type === 'bomb' ? 12 : 6;

      // Fill
      ctx.fillStyle = brick.color;
      ctx.beginPath();
      ctx.roundRect(brick.x, brick.y, brick.width, brick.height, 4);
      ctx.fill();

      // Top highlight bevel
      ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.fillRect(brick.x + 2, brick.y + 2, brick.width - 4, 3);

      // Icon / Decoration for special bricks
      if (brick.type === 'bomb') {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💣', brick.x + brick.width / 2, brick.y + brick.height / 2 + 1);
      } else if (brick.type === 'gift') {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⭐', brick.x + brick.width / 2, brick.y + brick.height / 2 + 1);
      } else if (brick.type === 'metal') {
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        ctx.strokeRect(brick.x + 3, brick.y + 3, brick.width - 6, brick.height - 6);
      } else if (brick.type === 'sturdy') {
        // Render health cracks or pips
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('•'.repeat(brick.hp), brick.x + brick.width / 2, brick.y + brick.height / 2);
      }

      ctx.restore();
    }

    // Render Power-up Capsules
    for (const p of this.powerups) {
      ctx.save();
      ctx.translate(p.x + p.width / 2, p.y + p.height / 2);
      ctx.rotate(p.rotation);

      // Capsule body
      ctx.shadowColor = p.config.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = p.config.color;
      ctx.beginPath();
      ctx.roundRect(-p.width / 2, -p.height / 2, p.width, p.height, 8);
      ctx.fill();

      // Inner icon
      ctx.fillStyle = '#ffffff';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.config.icon, 0, 1);

      ctx.restore();
    }

    // Render Lasers
    for (const l of this.lasers) {
      ctx.save();
      ctx.shadowColor = '#f43f5e';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#f43f5e';
      ctx.fillRect(l.x - l.width / 2, l.y, l.width, l.height);
      ctx.restore();
    }

    // Render Paddle
    ctx.save();
    const paddleColor = this.activePowerups.has('LASER') ? '#f43f5e' : (this.activePowerups.has('FIRE_BALL') ? '#f97316' : '#06b6d4');
    ctx.shadowColor = paddleColor;
    ctx.shadowBlur = 12;

    ctx.fillStyle = paddleColor;
    ctx.beginPath();
    ctx.roundRect(this.paddle.x, this.paddle.y, this.paddle.width, this.paddle.height, 6);
    ctx.fill();

    // Paddle gloss top highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fillRect(this.paddle.x + 4, this.paddle.y + 2, this.paddle.width - 8, 3);

    // Laser cannons attachment if laser powerup active
    if (this.activePowerups.has('LASER')) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(this.paddle.x + 6, this.paddle.y - 6, 4, 6);
      ctx.fillRect(this.paddle.x + this.paddle.width - 10, this.paddle.y - 6, 4, 6);
    }
    ctx.restore();

    // Render Balls
    for (const ball of this.balls) {
      ctx.save();

      // Trail
      if (ball.trail && ball.trail.length > 1) {
        for (let t = 0; t < ball.trail.length; t++) {
          const pt = ball.trail[t];
          const alpha = (t / ball.trail.length) * 0.35;
          ctx.fillStyle = ball.isFireball ? `rgba(249, 115, 22, ${alpha})` : `rgba(56, 189, 248, ${alpha})`;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, ball.radius * (0.5 + 0.5 * (t / ball.trail.length)), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Ball glow & body
      const ballColor = ball.isFireball ? '#f97316' : '#ffffff';
      const glowColor = ball.isFireball ? '#ea580c' : '#38bdf8';
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 14;

      ctx.fillStyle = ballColor;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fill();

      // Specular highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.beginPath();
      ctx.arc(ball.x - 2, ball.y - 2, ball.radius * 0.35, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // Render Particles
    for (const p of this.particles) {
      ctx.save();
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
      ctx.restore();
    }

    // Render Floating Score Popups
    for (const ft of this.floatingTexts) {
      ctx.save();
      const alpha = Math.max(0, ft.life / ft.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = ft.color;
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'center';
      ctx.shadowColor = ft.color;
      ctx.shadowBlur = 6;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }

    ctx.restore();
  }

  // Loop runner
  startLoop() {
    this.lastTime = performance.now();
    const frame = (now) => {
      const rawDt = (now - this.lastTime) / 1000;
      this.lastTime = now;
      const dt = Math.min(rawDt, 0.05); // clamped simulation step

      this.update(dt);
      this.render();

      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  updateHUD() {
    if (!this.hud) return;

    if (this.hud.score) {
      this.hud.score.textContent = this.score.toString().padStart(6, '0');
    }
    if (this.hud.highScore) {
      this.hud.highScore.textContent = this.highScore.toString().padStart(6, '0');
    }
    if (this.hud.stage) {
      this.hud.stage.textContent = `${this.currentStageIndex + 1} / 5`;
    }
    if (this.hud.livesContainer) {
      this.hud.livesContainer.innerHTML = '';
      for (let i = 0; i < this.maxLives; i++) {
        const isAlive = i < this.lives;
        const heart = document.createElement('span');
        heart.className = 'inline-flex items-center';
        heart.innerHTML = isAlive
          ? `<svg viewBox="0 0 24 24" class="w-4 h-4 sm:w-5 sm:h-5 fill-rose-500 text-rose-500 drop-shadow-[0_0_6px_rgba(244,63,94,0.7)]" aria-label="生命值"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`
          : `<svg viewBox="0 0 24 24" class="w-4 h-4 sm:w-5 sm:h-5 stroke-slate-700 fill-slate-900/60 stroke-2 opacity-50" aria-label="失去的生命值"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
        this.hud.livesContainer.appendChild(heart);
      }
    }

    // Active power-up indicators
    if (this.hud.powerupsContainer) {
      this.hud.powerupsContainer.innerHTML = '';
      for (const [typeId, timeLeft] of this.activePowerups.entries()) {
        const conf = POWERUP_TYPES[typeId];
        if (!conf) continue;
        const badge = document.createElement('div');
        badge.className = 'flex items-center gap-1.5 px-2.5 py-1 bg-slate-900/90 border border-slate-700/80 rounded text-xs font-mono';
        badge.style.color = conf.color;
        badge.innerHTML = `<span>${conf.icon}</span> <span>${conf.name}</span> <span class="text-white/80 font-bold">${Math.ceil(timeLeft)}s</span>`;
        this.hud.powerupsContainer.appendChild(badge);
      }
    }
  }

  updateMuteButton(isMuted) {
    if (this.hud.btnMute) {
      this.hud.btnMute.innerHTML = isMuted
        ? `<svg viewBox="0 0 24 24" class="w-4 h-4 fill-none stroke-rose-400 stroke-2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`
        : `<svg viewBox="0 0 24 24" class="w-4 h-4 fill-none stroke-cyan-400 stroke-2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
      this.hud.btnMute.setAttribute('aria-label', isMuted ? '開啟音效' : '靜音');
    }
  }

  updateModalStats(title) {
    if (!this.hud.screens || !this.hud.screens.gameover) return;
    const modalTitle = document.getElementById('gameover-title');
    const modalScore = document.getElementById('gameover-score');
    const modalBest = document.getElementById('gameover-best');
    const modalBricks = document.getElementById('gameover-bricks');
    const modalCombo = document.getElementById('gameover-combo');

    if (modalTitle) modalTitle.textContent = title;
    if (modalScore) modalScore.textContent = this.score.toString();
    if (modalBest) modalBest.textContent = this.highScore.toString();
    if (modalBricks) modalBricks.textContent = this.bricksDestroyedCount.toString();
    if (modalCombo) modalCombo.textContent = `x${this.maxCombo}`;
  }
}
