// Asteroid Escape Game Engine
// Controls: A/D keys for left/right movement (Test Mode)
// Arduino MKR WiFi 1010 for controller mode

const GameEngine = {
  canvas: null,
  ctx: null,
  gameLoop: null,
  dotNetHelper: null,
  teamName: '',
  isTestMode: true, // true = keyboard controls, false = Arduino only

  // Game State
  state: {
    running: false,
    paused: false,
    gameOver: false,
    score: 0,
    displayScore: 0, // For smooth score animation
    multiplier: 1.0,
    highScore: parseInt(localStorage.getItem('asteroidEscapeHighScore') || '0'),
    phase: 'earth', // 'earth', 'space', or 'mars'
    phaseTransitionScore: 10000, // Score to start transitioning to space
    phaseTransitionComplete: 20000, // Score where fully in space
    marsTransitionScore: 30000, // Score to start transitioning to Mars
    marsTransitionComplete: 40000, // Score where fully on Mars
    transitionProgress: 0, // 0 = full current phase, 1 = full next phase
    lastScoreTime: 0,
    scoreInterval: 100, // 100ms for smooth rolling score (10 points per tick = 100 per second)
    pointsPerInterval: 10, // 10 points every 100ms = 100 points per second
    multiplierThreshold: 10000, // Every 10000 points
    multiplierFactor: 0.3, // Multiply by this amount
  },

  // Rocket properties
  rocket: {
    x: 0,
    y: 0,
    width: 40,
    height: 70,
    speed: 8,
    movingLeft: false,
    movingRight: false,
    tiltAngle: 0, // Current tilt in radians
    targetTiltAngle: 0, // Target tilt for smooth animation
  },

  // Obstacles
  obstacles: [],
  obstacleSpawnRate: 600, // milliseconds - spawn more frequently
  lastObstacleSpawn: 0,
  minObstacleSpawnRate: 150, // milliseconds - minimum spawn rate at high scores

  // Power-ups
  powerUps: [],
  powerUpSpawnRate: 8000, // milliseconds - spawn every 8 seconds
  lastPowerUpSpawn: 0,
  activePowerUps: {
    shield: { active: false, endTime: 0, duration: 5000 },
    nuclearThrust: { active: false, endTime: 0, duration: 4000 },
    scoreBoost: { active: false, endTime: 0, duration: 6000, multiplier: 3 },
    slowMotion: { active: false, endTime: 0, duration: 5000 }
  },

  // Visual settings - Sky to Space to Mars transition
  colors: {
    sky: {
      top: '#87CEEB',    // Light sky blue
      middle: '#5DADE2', // Deeper sky blue  
      bottom: '#85C1E9', // Light blue
    },
    space: {
      top: '#0a0a1a',
      middle: '#0d0d2b',
      bottom: '#050510',
    },
    mars: {
      top: '#8B2500',    // Dark rusty red
      middle: '#CD4F39', // Mars orange-red
      bottom: '#FF6347', // Tomato red
    }
  },

  stars: [],
  clouds: [],

  // Initialize the game
  init: function (canvasId, dotNetHelper, teamName, isTestMode) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      console.error('Canvas not found:', canvasId);
      return false;
    }

    this.ctx = this.canvas.getContext('2d');
    this.dotNetHelper = dotNetHelper;
    this.teamName = teamName || 'Unknown';
    this.isTestMode = isTestMode !== false; // Default to true if not specified

    // Set canvas size
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    // Initialize stars and clouds
    this.initStars();
    this.initClouds();

    // Set up keyboard controls (only in test mode)
    if (this.isTestMode) {
      this.setupControls();
    }

    return true;
  },

  resizeCanvas: function () {
    this.canvas.width = this.canvas.offsetWidth;
    this.canvas.height = this.canvas.offsetHeight;

    // Reposition rocket (100px gap from bottom for better visibility)
    this.rocket.x = this.canvas.width / 2 - this.rocket.width / 2;
    this.rocket.y = this.canvas.height - this.rocket.height - 100;

    // Reinitialize clouds for new size
    this.initClouds();
  },

  initStars: function () {
    this.stars = [];
    const starCount = 150;
    for (let i = 0; i < starCount; i++) {
      this.stars.push({
        x: Math.random() * 2000,
        y: Math.random() * 2000,
        radius: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.8 + 0.2,
        twinkleSpeed: Math.random() * 0.02 + 0.01,
        twinklePhase: Math.random() * Math.PI * 2,
      });
    }
  },

  initClouds: function () {
    this.clouds = [];
    const cloudCount = 8;
    for (let i = 0; i < cloudCount; i++) {
      this.clouds.push({
        x: Math.random() * (this.canvas.width + 200) - 100,
        y: Math.random() * this.canvas.height,
        width: 80 + Math.random() * 120,
        height: 40 + Math.random() * 40,
        speed: 0.3 + Math.random() * 0.5,
        opacity: 0.6 + Math.random() * 0.4,
      });
    }
  },

  setupControls: function () {
    document.addEventListener('keydown', (e) => {
      if (!this.state.running || this.state.gameOver) return;

      if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
        this.rocket.movingLeft = true;
      }
      if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
        this.rocket.movingRight = true;
      }
      if (e.key === 'Escape') {
        this.togglePause();
      }
    });

    document.addEventListener('keyup', (e) => {
      if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
        this.rocket.movingLeft = false;
      }
      if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
        this.rocket.movingRight = false;
      }
    });
  },

  // Start the game
  start: function () {
    this.reset();
    this.state.running = true;
    this.state.lastScoreTime = performance.now();
    this.lastObstacleSpawn = performance.now();

    // Notify Blazor about game restart to reset Arduino states
    // This must complete before game loop starts to ensure proper state sync
    if (this.dotNetHelper) {
      this.dotNetHelper.invokeMethodAsync('OnGameRestart').then(() => {
        // Start game loop only after Blazor has updated the state
        this.gameLoop = requestAnimationFrame((t) => this.update(t));
      });
    } else {
      this.gameLoop = requestAnimationFrame((t) => this.update(t));
    }
  },

  reset: function () {
    this.state.gameOver = false;
    this.state.paused = false;
    this.state.score = 0;
    this.state.displayScore = 0;
    this.state.multiplier = 1.0;
    this.state.phase = 'earth';
    this.state.transitionProgress = 0;
    this.obstacles = [];
    this.powerUps = [];
    this.obstacleSpawnRate = 600;
    this.rocket.x = this.canvas.width / 2 - this.rocket.width / 2;
    this.rocket.movingLeft = false;
    this.rocket.movingRight = false;
    // Reset active power-ups
    for (const key in this.activePowerUps) {
      this.activePowerUps[key].active = false;
      this.activePowerUps[key].endTime = 0;
    }
    this.initClouds();
  },

  togglePause: function () {
    this.state.paused = !this.state.paused;
    if (!this.state.paused) {
      this.state.lastScoreTime = performance.now();
      this.lastObstacleSpawn = performance.now();
    }
  },

  // Main game loop
  update: function (timestamp) {
    if (!this.state.running) return;

    if (!this.state.paused && !this.state.gameOver) {
      // Update score (100 points every second, affected by multiplier)
      if (timestamp - this.state.lastScoreTime >= this.state.scoreInterval) {
        // Apply score boost power-up
        const scoreMultiplier = this.activePowerUps.scoreBoost.active
          ? this.activePowerUps.scoreBoost.multiplier
          : 1.0;

        const pointsToAdd = Math.floor(this.state.pointsPerInterval * this.state.multiplier * scoreMultiplier);
        this.state.score += pointsToAdd;
        this.state.lastScoreTime = timestamp;

        // Calculate multiplier based on score thresholds
        // Every 10000 points, add another 0.3 to the multiplier
        const thresholdsPassed = Math.floor(this.state.score / this.state.multiplierThreshold);
        this.state.multiplier = 1.0 + (thresholdsPassed * this.state.multiplierFactor);

        this.notifyScoreUpdate();

        // Calculate phase transition progress (0 to 1)
        if (this.state.score >= this.state.marsTransitionScore && this.state.phase === 'space') {
          // Transition from Space to Mars (30k-40k)
          const transitionRange = this.state.marsTransitionComplete - this.state.marsTransitionScore;
          this.state.transitionProgress = Math.min(1,
            (this.state.score - this.state.marsTransitionScore) / transitionRange);

          if (this.state.transitionProgress >= 1) {
            this.state.phase = 'mars';
            this.notifyPhaseChange();
          }
        } else if (this.state.score >= this.state.phaseTransitionScore && this.state.phase === 'earth') {
          // Transition from Earth to Space (10k-20k)
          const transitionRange = this.state.phaseTransitionComplete - this.state.phaseTransitionScore;
          this.state.transitionProgress = Math.min(1,
            (this.state.score - this.state.phaseTransitionScore) / transitionRange);

          if (this.state.transitionProgress >= 1) {
            this.state.phase = 'space';
            this.state.transitionProgress = 0; // Reset for next transition
            this.notifyPhaseChange();
          }
        }

        // Increase difficulty based on score (faster spawn rate)
        this.obstacleSpawnRate = Math.max(this.minObstacleSpawnRate, 600 - (this.state.score / 200));
      }

      // Smooth score display animation
      if (this.state.displayScore < this.state.score) {
        this.state.displayScore += Math.ceil((this.state.score - this.state.displayScore) / 10);
      }

      // Move rocket
      this.updateRocket();

      // Update clouds
      this.updateClouds();

      // Update power-ups
      this.updatePowerUps(timestamp);

      // Spawn power-ups
      if (timestamp - this.lastPowerUpSpawn >= this.powerUpSpawnRate) {
        this.spawnPowerUp();
        this.lastPowerUpSpawn = timestamp;
      }

      // Spawn obstacles
      if (timestamp - this.lastObstacleSpawn >= this.obstacleSpawnRate) {
        this.spawnObstacle();
        this.lastObstacleSpawn = timestamp;
      }

      // Update obstacles
      this.updateObstacles();

      // Check collisions
      if (this.checkCollisions()) {
        this.endGame();
      }
    }

    // Render
    this.render(timestamp);

    // Continue loop
    this.gameLoop = requestAnimationFrame((t) => this.update(t));
  },

  updateRocket: function () {
    // Apply nuclear thrust speed boost
    const currentSpeed = this.activePowerUps.nuclearThrust.active
      ? this.rocket.speed * 2.5
      : this.rocket.speed;

    // Update position
    if (this.rocket.movingLeft) {
      this.rocket.x -= currentSpeed;
    }
    if (this.rocket.movingRight) {
      this.rocket.x += currentSpeed;
    }

    // Keep rocket in bounds
    this.rocket.x = Math.max(0, Math.min(this.canvas.width - this.rocket.width, this.rocket.x));

    // Update tilt animation (15 degrees = 0.262 radians)
    const maxTilt = 0.262; // 15 degrees in radians
    if (this.rocket.movingLeft && !this.rocket.movingRight) {
      this.rocket.targetTiltAngle = -maxTilt; // Tilt left
    } else if (this.rocket.movingRight && !this.rocket.movingLeft) {
      this.rocket.targetTiltAngle = maxTilt; // Tilt right
    } else {
      this.rocket.targetTiltAngle = 0; // Return to center
    }

    // Smooth tilt interpolation (lerp)
    const tiltSpeed = 0.15;
    this.rocket.tiltAngle += (this.rocket.targetTiltAngle - this.rocket.tiltAngle) * tiltSpeed;
  },

  updateClouds: function () {
    for (const cloud of this.clouds) {
      cloud.y += cloud.speed;

      // Reset cloud when it goes off screen
      if (cloud.y > this.canvas.height + cloud.height) {
        cloud.y = -cloud.height;
        cloud.x = Math.random() * (this.canvas.width + 200) - 100;
      }
    }
  },

  spawnObstacle: function () {
    // Mix obstacles based on current phase and transition progress
    const inTransition = this.state.transitionProgress > 0 && this.state.transitionProgress < 1;
    let types;

    if (this.state.phase === 'mars' || (this.state.phase === 'space' && this.state.score >= this.state.marsTransitionScore)) {
      // Mars phase: dust storms, mars rocks, alien plants
      if (inTransition && this.state.phase === 'space') {
        const marsChance = this.state.transitionProgress;
        if (Math.random() < marsChance) {
          types = ['duststorm', 'marsrock', 'marsrock', 'alienplant'];
        } else {
          types = ['asteroid', 'asteroid', 'satellite'];
        }
      } else {
        types = ['duststorm', 'marsrock', 'marsrock', 'alienplant'];
      }
    } else if (this.state.phase === 'space' || (this.state.phase === 'earth' && this.state.score >= this.state.phaseTransitionScore)) {
      // Space phase: asteroids and satellites
      if (inTransition && this.state.phase === 'earth') {
        const spaceChance = this.state.transitionProgress;
        if (Math.random() < spaceChance) {
          types = ['asteroid', 'asteroid', 'satellite'];
        } else {
          types = ['bird', 'bird', 'bird'];
        }
      } else {
        types = ['asteroid', 'asteroid', 'satellite'];
      }
    } else {
      // Earth phase: birds
      types = ['bird', 'bird', 'bird'];
    }

    const type = types[Math.floor(Math.random() * types.length)];
    const size = type === 'satellite' ? 70 : type === 'duststorm' ? (80 + Math.random() * 50) : (50 + Math.random() * 40);

    this.obstacles.push({
      x: Math.random() * (this.canvas.width - size),
      y: -size,
      width: size,
      height: size,
      speed: 3 + Math.random() * 3 + (this.state.score / 1000),
      type: type,
      rotation: 0,
      rotationSpeed: (Math.random() - 0.5) * 0.1,
    });

    // Multi-spawn logic: 25% chance to spawn a second obstacle simultaneously for more challenge
    if (Math.random() < 0.25 && this.state.score > 3000) {
      const secondType = types[Math.floor(Math.random() * types.length)];
      const secondSize = secondType === 'satellite' ? 70 : secondType === 'duststorm' ? (80 + Math.random() * 50) : (50 + Math.random() * 40);

      this.obstacles.push({
        x: Math.random() * (this.canvas.width - secondSize),
        y: -secondSize - 100, // Slightly higher to avoid overlap
        width: secondSize,
        height: secondSize,
        speed: 3 + Math.random() * 3 + (this.state.score / 1000),
        type: secondType,
        rotation: 0,
        rotationSpeed: (Math.random() - 0.5) * 0.1,
      });
    }
  },

  updateObstacles: function () {
    // Apply slow motion power-up
    const speedMultiplier = this.activePowerUps.slowMotion.active ? 0.4 : 1.0;

    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      obs.y += obs.speed * speedMultiplier;
      obs.rotation += obs.rotationSpeed * speedMultiplier;

      // Remove off-screen obstacles
      if (obs.y > this.canvas.height) {
        this.obstacles.splice(i, 1);
      }
    }
  },

  spawnPowerUp: function () {
    const types = ['shield', 'nuclearThrust', 'scoreBoost', 'slowMotion'];
    const type = types[Math.floor(Math.random() * types.length)];
    const size = 40;

    this.powerUps.push({
      x: Math.random() * (this.canvas.width - size),
      y: -size,
      width: size,
      height: size,
      speed: 2,
      type: type,
      rotation: 0,
      rotationSpeed: 0.05,
      pulse: 0
    });
  },

  updatePowerUps: function (timestamp) {
    // Update power-up positions
    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const powerUp = this.powerUps[i];
      powerUp.y += powerUp.speed;
      powerUp.rotation += powerUp.rotationSpeed;
      powerUp.pulse = Math.sin(timestamp * 0.005) * 0.2 + 1;

      // Remove off-screen power-ups
      if (powerUp.y > this.canvas.height) {
        this.powerUps.splice(i, 1);
        continue;
      }

      // Check collision with rocket
      if (this.rectIntersects({
        x: this.rocket.x,
        y: this.rocket.y,
        width: this.rocket.width,
        height: this.rocket.height
      }, powerUp)) {
        this.activatePowerUp(powerUp.type, timestamp);
        this.powerUps.splice(i, 1);
      }
    }

    // Check if active power-ups have expired
    for (const key in this.activePowerUps) {
      const powerUp = this.activePowerUps[key];
      if (powerUp.active && timestamp >= powerUp.endTime) {
        powerUp.active = false;
      }
    }
  },

  activatePowerUp: function (type, timestamp) {
    const powerUp = this.activePowerUps[type];
    if (powerUp) {
      powerUp.active = true;
      powerUp.endTime = timestamp + powerUp.duration;

      // Notify UI
      if (this.dotNetHelper) {
        this.dotNetHelper.invokeMethodAsync('OnPowerUpCollected', type, powerUp.duration);
      }
    }
  },

  updateObstacles: function () {
    // Apply slow motion power-up
    const speedMultiplier = this.activePowerUps.slowMotion.active ? 0.4 : 1.0;

    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      obs.y += obs.speed * speedMultiplier;
      obs.rotation += obs.rotationSpeed * speedMultiplier;

      // Remove off-screen obstacles
      if (obs.y > this.canvas.height) {
        this.obstacles.splice(i, 1);
      }
    }
  },

  checkCollisions: function () {
    // Shield protects from collisions
    if (this.activePowerUps.shield.active) {
      return false;
    }

    const rocketHitbox = {
      x: this.rocket.x + 5,
      y: this.rocket.y + 10,
      width: this.rocket.width - 10,
      height: this.rocket.height - 20,
    };

    for (const obs of this.obstacles) {
      if (this.rectIntersects(rocketHitbox, obs)) {
        return true;
      }
    }
    return false;
  },

  rectIntersects: function (a, b) {
    return a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y;
  },

  endGame: function () {
    this.state.gameOver = true;

    // Update high score
    if (this.state.score > this.state.highScore) {
      this.state.highScore = this.state.score;
      localStorage.setItem('asteroidEscapeHighScore', this.state.highScore.toString());
    }

    this.notifyGameOver();
  },

  // Rendering
  render: function (timestamp) {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Draw background with sky-to-space transition
    this.drawBackground(timestamp);

    // Draw clouds (only during Earth phase and Earth-to-Space transition)
    if (this.state.phase === 'earth') {
      this.drawClouds();
    }

    // Draw stars (visible in Space and Mars phases)
    this.drawStars(timestamp);

    // Draw power-ups
    this.drawPowerUps();

    // Draw obstacles
    this.drawObstacles();

    // Draw rocket
    this.drawRocket();

    // Draw pause overlay
    if (this.state.paused) {
      this.drawPauseOverlay();
    }

    // Draw game over overlay
    if (this.state.gameOver) {
      this.drawGameOverOverlay();
    }
  },

  // Interpolate between two colors
  lerpColor: function (color1, color2, t) {
    // Parse hex colors
    const c1 = {
      r: parseInt(color1.slice(1, 3), 16),
      g: parseInt(color1.slice(3, 5), 16),
      b: parseInt(color1.slice(5, 7), 16)
    };
    const c2 = {
      r: parseInt(color2.slice(1, 3), 16),
      g: parseInt(color2.slice(3, 5), 16),
      b: parseInt(color2.slice(5, 7), 16)
    };

    const r = Math.round(c1.r + (c2.r - c1.r) * t);
    const g = Math.round(c1.g + (c2.g - c1.g) * t);
    const b = Math.round(c1.b + (c2.b - c1.b) * t);

    return `rgb(${r}, ${g}, ${b})`;
  },

  drawBackground: function (timestamp) {
    const ctx = this.ctx;
    let topColor, midColor, botColor;

    // Determine which phase transition we're in
    if (this.state.phase === 'mars') {
      // Fully in Mars
      topColor = this.colors.mars.top;
      midColor = this.colors.mars.middle;
      botColor = this.colors.mars.bottom;
    } else if (this.state.phase === 'space' && this.state.score >= this.state.marsTransitionScore) {
      // Transitioning from Space to Mars
      const t = this.state.transitionProgress;
      topColor = this.lerpColor(this.colors.space.top, this.colors.mars.top, t);
      midColor = this.lerpColor(this.colors.space.middle, this.colors.mars.middle, t);
      botColor = this.lerpColor(this.colors.space.bottom, this.colors.mars.bottom, t);
    } else if (this.state.phase === 'space') {
      // Fully in Space
      topColor = this.colors.space.top;
      midColor = this.colors.space.middle;
      botColor = this.colors.space.bottom;
    } else if (this.state.phase === 'earth' && this.state.score >= this.state.phaseTransitionScore) {
      // Transitioning from Earth to Space
      const t = this.state.transitionProgress;
      topColor = this.lerpColor(this.colors.sky.top, this.colors.space.top, t);
      midColor = this.lerpColor(this.colors.sky.middle, this.colors.space.middle, t);
      botColor = this.lerpColor(this.colors.sky.bottom, this.colors.space.bottom, t);
    } else {
      // Fully in Earth
      topColor = this.colors.sky.top;
      midColor = this.colors.sky.middle;
      botColor = this.colors.sky.bottom;
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    gradient.addColorStop(0, topColor);
    gradient.addColorStop(0.5, midColor);
    gradient.addColorStop(1, botColor);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  },

  drawClouds: function () {
    const ctx = this.ctx;
    // Fade out clouds during Earth-to-Space transition
    let cloudOpacity = 1;
    if (this.state.phase === 'earth' && this.state.score >= this.state.phaseTransitionScore) {
      cloudOpacity = 1 - this.state.transitionProgress;
    }

    for (const cloud of this.clouds) {
      ctx.save();
      ctx.globalAlpha = cloud.opacity * cloudOpacity;

      // Draw fluffy cloud using multiple circles
      ctx.fillStyle = '#ffffff';

      const cx = cloud.x + cloud.width / 2;
      const cy = cloud.y + cloud.height / 2;

      // Main cloud body
      ctx.beginPath();
      ctx.ellipse(cx, cy, cloud.width / 2, cloud.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();

      // Left puff
      ctx.beginPath();
      ctx.ellipse(cx - cloud.width * 0.3, cy + cloud.height * 0.1, cloud.width * 0.3, cloud.height * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Right puff
      ctx.beginPath();
      ctx.ellipse(cx + cloud.width * 0.3, cy + cloud.height * 0.05, cloud.width * 0.35, cloud.height * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();

      // Top puff
      ctx.beginPath();
      ctx.ellipse(cx + cloud.width * 0.1, cy - cloud.height * 0.2, cloud.width * 0.25, cloud.height * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  },

  drawStars: function (timestamp) {
    const ctx = this.ctx;
    // Calculate star opacity based on phase
    let effectiveOpacity;

    if (this.state.phase === 'earth') {
      // During Earth phase: fade in during transition
      const baseOpacity = 0.1; // Faint stars even in sky (high altitude)
      if (this.state.score >= this.state.phaseTransitionScore) {
        effectiveOpacity = baseOpacity + (1 - baseOpacity) * this.state.transitionProgress;
      } else {
        effectiveOpacity = baseOpacity;
      }
    } else {
      // During Space or Mars: fully visible
      effectiveOpacity = 1.0;
    }

    for (const star of this.stars) {
      const twinkle = Math.sin(timestamp * star.twinkleSpeed + star.twinklePhase) * 0.3 + 0.7;
      const x = star.x % this.canvas.width;
      const y = star.y % this.canvas.height;

      ctx.beginPath();
      ctx.arc(x, y, star.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity * twinkle * effectiveOpacity})`;
      ctx.fill();
    }
  },

  drawRocket: function () {
    const ctx = this.ctx;
    const r = this.rocket;

    ctx.save();
    ctx.translate(r.x + r.width / 2, r.y + r.height / 2);
    ctx.rotate(this.rocket.tiltAngle); // Apply tilt rotation

    // Draw shield if active
    if (this.activePowerUps.shield.active) {
      const shieldRadius = Math.max(r.width, r.height) * 0.8;
      const shieldGradient = ctx.createRadialGradient(0, 0, shieldRadius * 0.6, 0, 0, shieldRadius);
      shieldGradient.addColorStop(0, 'rgba(100, 200, 255, 0.1)');
      shieldGradient.addColorStop(0.7, 'rgba(100, 200, 255, 0.4)');
      shieldGradient.addColorStop(1, 'rgba(100, 200, 255, 0.8)');

      ctx.beginPath();
      ctx.arc(0, 0, shieldRadius, 0, Math.PI * 2);
      ctx.fillStyle = shieldGradient;
      ctx.fill();
      ctx.strokeStyle = 'rgba(150, 220, 255, 0.8)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Rocket body
    ctx.fillStyle = '#e8e8e8';
    ctx.beginPath();
    ctx.ellipse(0, 0, r.width / 2 - 5, r.height / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body gradient overlay
    const bodyGradient = ctx.createLinearGradient(-r.width / 2, 0, r.width / 2, 0);
    bodyGradient.addColorStop(0, 'rgba(200,200,200,0.8)');
    bodyGradient.addColorStop(0.5, 'rgba(255,255,255,0.2)');
    bodyGradient.addColorStop(1, 'rgba(150,150,150,0.8)');
    ctx.fillStyle = bodyGradient;
    ctx.fill();

    // Window
    ctx.fillStyle = '#00d4ff';
    ctx.beginPath();
    ctx.arc(0, -r.height / 4, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#88ccff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Fins
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.moveTo(-r.width / 2 - 5, r.height / 2 - 10);
    ctx.lineTo(-r.width / 2 + 5, r.height / 2 - 25);
    ctx.lineTo(-r.width / 2 + 5, r.height / 2);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(r.width / 2 + 5, r.height / 2 - 10);
    ctx.lineTo(r.width / 2 - 5, r.height / 2 - 25);
    ctx.lineTo(r.width / 2 - 5, r.height / 2);
    ctx.closePath();
    ctx.fill();

    // Exhaust flame (nuclear thrust has enhanced flames)
    if (!this.state.gameOver) {
      const isNuclear = this.activePowerUps.nuclearThrust.active;
      const flameHeight = isNuclear ? 45 + Math.random() * 15 : 25 + Math.random() * 10;
      const flameGradient = ctx.createLinearGradient(0, r.height / 2, 0, r.height / 2 + flameHeight);

      if (isNuclear) {
        flameGradient.addColorStop(0, '#00ffff');  // Cyan core
        flameGradient.addColorStop(0.3, '#0088ff'); // Blue
        flameGradient.addColorStop(0.6, '#ff00ff'); // Magenta
        flameGradient.addColorStop(1, 'transparent');
      } else {
        flameGradient.addColorStop(0, '#ffff00');
        flameGradient.addColorStop(0.4, '#ff8800');
        flameGradient.addColorStop(0.7, '#ff4400');
        flameGradient.addColorStop(1, 'transparent');
      }

      ctx.fillStyle = flameGradient;
      ctx.beginPath();
      const flameWidth = isNuclear ? 12 : 8;
      ctx.moveTo(-flameWidth, r.height / 2);
      ctx.quadraticCurveTo(-flameWidth - 2, r.height / 2 + flameHeight * 0.6, 0, r.height / 2 + flameHeight);
      ctx.quadraticCurveTo(flameWidth + 2, r.height / 2 + flameHeight * 0.6, flameWidth, r.height / 2);
      ctx.closePath();
      ctx.fill();

      // Nuclear thrust particle trail
      if (isNuclear) {
        for (let i = 0; i < 3; i++) {
          const particleY = r.height / 2 + 20 + Math.random() * 30;
          const particleX = (Math.random() - 0.5) * 20;
          ctx.fillStyle = `rgba(0, 255, 255, ${0.6 - i * 0.2})`;
          ctx.beginPath();
          ctx.arc(particleX, particleY, 3 + Math.random() * 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.restore();
  },

  drawObstacles: function () {
    const ctx = this.ctx;

    for (const obs of this.obstacles) {
      ctx.save();
      ctx.translate(obs.x + obs.width / 2, obs.y + obs.height / 2);
      ctx.rotate(obs.rotation);

      if (obs.type === 'bird') {
        this.drawBird(ctx, obs.width);
      } else if (obs.type === 'asteroid') {
        this.drawAsteroid(ctx, obs.width);
      } else if (obs.type === 'satellite') {
        this.drawSatellite(ctx, obs.width);
      } else if (obs.type === 'duststorm') {
        this.drawDustStorm(ctx, obs.width);
      } else if (obs.type === 'marsrock') {
        this.drawMarsRock(ctx, obs.width);
      } else if (obs.type === 'alienplant') {
        this.drawAlienPlant(ctx, obs.width);
      }

      ctx.restore();
    }
  },

  drawBird: function (ctx, size) {
    const s = size / 2;

    // Body
    ctx.fillStyle = '#4a4a4a';
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.6, s * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wings
    ctx.fillStyle = '#3a3a3a';
    ctx.beginPath();
    ctx.moveTo(-s * 0.3, 0);
    ctx.quadraticCurveTo(-s, -s * 0.8, -s * 0.2, -s * 0.2);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(s * 0.3, 0);
    ctx.quadraticCurveTo(s, -s * 0.8, s * 0.2, -s * 0.2);
    ctx.closePath();
    ctx.fill();

    // Beak
    ctx.fillStyle = '#ff8800';
    ctx.beginPath();
    ctx.moveTo(s * 0.5, 0);
    ctx.lineTo(s * 0.8, s * 0.1);
    ctx.lineTo(s * 0.5, s * 0.15);
    ctx.closePath();
    ctx.fill();

    // Eye
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(s * 0.2, -s * 0.1, s * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(s * 0.22, -s * 0.1, s * 0.05, 0, Math.PI * 2);
    ctx.fill();
  },

  drawAsteroid: function (ctx, size) {
    const s = size / 2;

    // Irregular asteroid shape
    ctx.fillStyle = '#6a5a4a';
    ctx.beginPath();
    ctx.moveTo(s * 0.8, 0);
    ctx.lineTo(s * 0.6, s * 0.7);
    ctx.lineTo(-s * 0.3, s * 0.8);
    ctx.lineTo(-s * 0.9, s * 0.3);
    ctx.lineTo(-s * 0.7, -s * 0.5);
    ctx.lineTo(-s * 0.2, -s * 0.8);
    ctx.lineTo(s * 0.5, -s * 0.6);
    ctx.closePath();
    ctx.fill();

    // Craters
    ctx.fillStyle = '#4a3a2a';
    ctx.beginPath();
    ctx.arc(-s * 0.2, s * 0.1, s * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s * 0.3, -s * 0.2, s * 0.15, 0, Math.PI * 2);
    ctx.fill();

    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.arc(-s * 0.4, -s * 0.4, s * 0.15, 0, Math.PI * 2);
    ctx.fill();
  },

  drawSatellite: function (ctx, size) {
    const s = size / 2;

    // Main body
    ctx.fillStyle = '#888888';
    ctx.fillRect(-s * 0.25, -s * 0.4, s * 0.5, s * 0.8);

    // Solar panels
    ctx.fillStyle = '#3366aa';
    ctx.fillRect(-s * 0.9, -s * 0.25, s * 0.6, s * 0.5);
    ctx.fillRect(s * 0.3, -s * 0.25, s * 0.6, s * 0.5);

    // Panel lines
    ctx.strokeStyle = '#2255aa';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const x1 = -s * 0.85 + i * s * 0.15;
      ctx.beginPath();
      ctx.moveTo(x1, -s * 0.25);
      ctx.lineTo(x1, s * 0.25);
      ctx.stroke();

      const x2 = s * 0.35 + i * s * 0.15;
      ctx.beginPath();
      ctx.moveTo(x2, -s * 0.25);
      ctx.lineTo(x2, s * 0.25);
      ctx.stroke();
    }

    // Antenna
    ctx.strokeStyle = '#666666';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.4);
    ctx.lineTo(0, -s * 0.7);
    ctx.stroke();

    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.arc(0, -s * 0.7, s * 0.08, 0, Math.PI * 2);
    ctx.fill();
  },

  drawDustStorm: function (ctx, size) {
    const s = size / 2;

    // Semi-transparent swirling dust cloud
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, s);
    gradient.addColorStop(0, 'rgba(205, 92, 57, 0.6)'); // Orange-red center
    gradient.addColorStop(0.5, 'rgba(139, 69, 19, 0.4)'); // Brown middle
    gradient.addColorStop(1, 'rgba(139, 69, 19, 0.1)'); // Faded edge

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(0, 0, s, s * 0.8, Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();

    // Dust particles
    ctx.fillStyle = 'rgba(160, 82, 45, 0.5)';
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      const dist = s * 0.6;
      const x = Math.cos(angle) * dist;
      const y = Math.sin(angle) * dist;
      ctx.beginPath();
      ctx.arc(x, y, s * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  drawMarsRock: function (ctx, size) {
    const s = size / 2;

    // Irregular Mars rock shape (reddish-brown)
    ctx.fillStyle = '#8B4513'; // Saddle brown
    ctx.beginPath();
    ctx.moveTo(s * 0.7, 0);
    ctx.lineTo(s * 0.5, s * 0.8);
    ctx.lineTo(-s * 0.2, s * 0.9);
    ctx.lineTo(-s * 0.8, s * 0.4);
    ctx.lineTo(-s * 0.9, -s * 0.3);
    ctx.lineTo(-s * 0.3, -s * 0.9);
    ctx.lineTo(s * 0.4, -s * 0.7);
    ctx.closePath();
    ctx.fill();

    // Iron oxide spots (red)
    ctx.fillStyle = '#A0522D';
    ctx.beginPath();
    ctx.arc(-s * 0.3, s * 0.2, s * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s * 0.2, -s * 0.3, s * 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Highlight
    ctx.fillStyle = 'rgba(205, 133, 63, 0.4)';
    ctx.beginPath();
    ctx.arc(-s * 0.5, -s * 0.5, s * 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Dark shadow
    ctx.fillStyle = 'rgba(50, 25, 10, 0.3)';
    ctx.beginPath();
    ctx.arc(s * 0.3, s * 0.4, s * 0.3, 0, Math.PI * 2);
    ctx.fill();
  },

  drawAlienPlant: function (ctx, size) {
    const s = size / 2;

    // Central stalk (green-blue alien plant)
    ctx.fillStyle = '#2E8B57'; // Sea green
    ctx.fillRect(-s * 0.1, -s * 0.5, s * 0.2, s);

    // Bulbous base
    ctx.fillStyle = '#3CB371'; // Medium sea green
    ctx.beginPath();
    ctx.ellipse(0, s * 0.3, s * 0.3, s * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Alien tendrils/leaves
    ctx.strokeStyle = '#20B2AA'; // Light sea green
    ctx.lineWidth = s * 0.08;
    ctx.lineCap = 'round';

    // Left tendril
    ctx.beginPath();
    ctx.moveTo(-s * 0.1, 0);
    ctx.quadraticCurveTo(-s * 0.6, -s * 0.3, -s * 0.7, -s * 0.6);
    ctx.stroke();

    // Right tendril
    ctx.beginPath();
    ctx.moveTo(s * 0.1, 0);
    ctx.quadraticCurveTo(s * 0.6, -s * 0.4, s * 0.7, -s * 0.7);
    ctx.stroke();

    // Glowing spots (bioluminescent)
    ctx.fillStyle = '#7FFF00'; // Chartreuse glow
    ctx.beginPath();
    ctx.arc(0, s * 0.3, s * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-s * 0.5, -s * 0.4, s * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s * 0.5, -s * 0.5, s * 0.08, 0, Math.PI * 2);
    ctx.fill();
  },

  drawPowerUps: function () {
    const ctx = this.ctx;

    for (const powerUp of this.powerUps) {
      ctx.save();
      ctx.translate(powerUp.x + powerUp.width / 2, powerUp.y + powerUp.height / 2);
      ctx.rotate(powerUp.rotation);
      ctx.scale(powerUp.pulse, powerUp.pulse);

      // Draw based on power-up type
      if (powerUp.type === 'shield') {
        this.drawShieldPowerUp(ctx, powerUp.width / 2);
      } else if (powerUp.type === 'nuclearThrust') {
        this.drawNuclearThrustPowerUp(ctx, powerUp.width / 2);
      } else if (powerUp.type === 'scoreBoost') {
        this.drawScoreBoostPowerUp(ctx, powerUp.width / 2);
      } else if (powerUp.type === 'slowMotion') {
        this.drawSlowMotionPowerUp(ctx, powerUp.width / 2);
      }

      ctx.restore();
    }
  },

  drawShieldPowerUp: function (ctx, size) {
    // Shield icon - blue protective bubble
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
    gradient.addColorStop(0, 'rgba(100, 200, 255, 0.8)');
    gradient.addColorStop(0.7, 'rgba(100, 200, 255, 0.6)');
    gradient.addColorStop(1, 'rgba(100, 200, 255, 0.3)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.fill();

    // Shield emblem
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.6);
    ctx.lineTo(-size * 0.5, 0);
    ctx.lineTo(-size * 0.3, size * 0.6);
    ctx.lineTo(size * 0.3, size * 0.6);
    ctx.lineTo(size * 0.5, 0);
    ctx.closePath();
    ctx.stroke();
  },

  drawNuclearThrustPowerUp: function (ctx, size) {
    // Nuclear symbol - cyan/magenta energy
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
    gradient.addColorStop(0, 'rgba(0, 255, 255, 0.9)');
    gradient.addColorStop(0.5, 'rgba(255, 0, 255, 0.7)');
    gradient.addColorStop(1, 'rgba(0, 100, 255, 0.4)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.fill();

    // Lightning bolt
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(size * 0.2, -size * 0.6);
    ctx.lineTo(-size * 0.3, size * 0.1);
    ctx.lineTo(size * 0.1, size * 0.1);
    ctx.lineTo(-size * 0.2, size * 0.6);
    ctx.lineTo(size * 0.3, -size * 0.1);
    ctx.lineTo(-size * 0.1, -size * 0.1);
    ctx.closePath();
    ctx.fill();
  },

  drawScoreBoostPowerUp: function (ctx, size) {
    // Star with multiplier - golden yellow
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
    gradient.addColorStop(0, 'rgba(255, 215, 0, 0.9)');
    gradient.addColorStop(0.7, 'rgba(255, 165, 0, 0.7)');
    gradient.addColorStop(1, 'rgba(255, 140, 0, 0.4)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.fill();

    // Star shape
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
      const x = Math.cos(angle) * size * 0.5;
      const y = Math.sin(angle) * size * 0.5;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);

      const innerAngle = angle + Math.PI / 5;
      const ix = Math.cos(innerAngle) * size * 0.2;
      const iy = Math.sin(innerAngle) * size * 0.2;
      ctx.lineTo(ix, iy);
    }
    ctx.closePath();
    ctx.fill();

    // "x3" text
    ctx.fillStyle = '#000';
    ctx.font = `bold ${size * 0.5}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('×3', 0, 0);
  },

  drawSlowMotionPowerUp: function (ctx, size) {
    // Clock icon - purple/blue
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
    gradient.addColorStop(0, 'rgba(147, 112, 219, 0.9)');
    gradient.addColorStop(0.7, 'rgba(138, 43, 226, 0.7)');
    gradient.addColorStop(1, 'rgba(75, 0, 130, 0.4)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.fill();

    // Clock face
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.6, 0, Math.PI * 2);
    ctx.stroke();

    // Clock hands
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -size * 0.4);
    ctx.stroke();

    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(size * 0.3, 0);
    ctx.stroke();
  },

  drawPauseOverlay: function () {
    const ctx = this.ctx;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', this.canvas.width / 2, this.canvas.height / 2);

    ctx.font = '20px system-ui, sans-serif';
    ctx.fillStyle = '#aaaaaa';
    ctx.fillText('Press ESC to resume', this.canvas.width / 2, this.canvas.height / 2 + 40);
  },

  drawGameOverOverlay: function () {
    const ctx = this.ctx;

    ctx.fillStyle = 'rgba(10, 10, 30, 0.85)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 48px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height / 2 - 80);

    // Team name
    ctx.fillStyle = '#aabbcc';
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText(`Team: ${this.teamName}`, this.canvas.width / 2, this.canvas.height / 2 - 40);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px system-ui, sans-serif';
    ctx.fillText(`Score: ${this.state.score.toLocaleString()}`, this.canvas.width / 2, this.canvas.height / 2 + 10);

    if (this.state.score === this.state.highScore && this.state.score > 0) {
      ctx.fillStyle = '#ffcc00';
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.fillText('🏆 NEW HIGH SCORE! 🏆', this.canvas.width / 2, this.canvas.height / 2 + 50);
    }

    ctx.fillStyle = '#00d4ff';
    ctx.font = '20px system-ui, sans-serif';
  },

  // Blazor interop notifications
  notifyScoreUpdate: function () {
    if (this.dotNetHelper) {
      this.dotNetHelper.invokeMethodAsync('OnScoreUpdate', this.state.score, this.state.multiplier);
    }
  },

  notifyPhaseChange: function () {
    if (this.dotNetHelper) {
      this.dotNetHelper.invokeMethodAsync('OnPhaseChange', this.state.phase);
    }
  },

  notifyGameOver: function () {
    if (this.dotNetHelper) {
      this.dotNetHelper.invokeMethodAsync('OnGameOver', this.state.score, this.state.highScore);
    }
  },

  // Clean up
  stop: function () {
    this.state.running = false;
    if (this.gameLoop) {
      cancelAnimationFrame(this.gameLoop);
      this.gameLoop = null;
    }
  },

  dispose: function () {
    this.stop();
    window.removeEventListener('resize', this.resizeCanvas);
  }
};

// Blazor interop functions
window.gameInterop = {
  init: function (canvasId, dotNetHelper, teamName, isTestMode) {
    return GameEngine.init(canvasId, dotNetHelper, teamName, isTestMode);
  },

  start: function () {
    GameEngine.start();
  },

  stop: function () {
    GameEngine.stop();
  },

  restart: function () {
    GameEngine.start();
  },

  getScore: function () {
    return GameEngine.state.score;
  },

  getHighScore: function () {
    return GameEngine.state.highScore;
  },

  getGameState: function () {
    return {
      running: GameEngine.state.running,
      paused: GameEngine.state.paused,
      gameOver: GameEngine.state.gameOver,
      score: GameEngine.state.score,
      multiplier: GameEngine.state.multiplier,
      phase: GameEngine.state.phase
    };
  },

  // Movement control for Arduino devices
  moveLeft: function (isMoving) {
    if (!GameEngine.state.running || GameEngine.state.gameOver) return false;
    GameEngine.rocket.movingLeft = isMoving;
    return true;
  },

  moveRight: function (isMoving) {
    if (!GameEngine.state.running || GameEngine.state.gameOver) return false;
    GameEngine.rocket.movingRight = isMoving;
    return true;
  },

  // Pulse movement (single frame push)
  pulseLeft: function () {
    if (!GameEngine.state.running || GameEngine.state.gameOver) return false;
    GameEngine.rocket.x -= GameEngine.rocket.speed;
    GameEngine.rocket.x = Math.max(0, GameEngine.rocket.x);
    return true;
  },

  pulseRight: function () {
    if (!GameEngine.state.running || GameEngine.state.gameOver) return false;
    GameEngine.rocket.x += GameEngine.rocket.speed;
    GameEngine.rocket.x = Math.min(GameEngine.canvas.width - GameEngine.rocket.width, GameEngine.rocket.x);
    return true;
  },

  dispose: function () {
    GameEngine.dispose();
  }
};

// Handle click for restart
document.addEventListener('click', (e) => {
  if (GameEngine.state.gameOver && GameEngine.canvas && GameEngine.canvas.contains(e.target)) {
    GameEngine.start();
  }
});
