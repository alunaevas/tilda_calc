(function () {
  "use strict";

  const WIDTH = 960;
  const HEIGHT = 600;
  const TILE = 40;
  const COLS = WIDTH / TILE;
  const ROWS = HEIGHT / TILE;
  const PLAYER_SPEED = 168;
  const SELLER_SPEED = 138;
  const CATCH_DISTANCE = 34;
  const CHASE_DISTANCE = 220;
  const PHASE_TWO_TIME = 20;
  const EXIT_SPAWN_TIME = 45;

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const assetPaths = {
    kostik: "sprites/kostik.png",
    katya: "sprites/katya.png",
    seller: "sprites/seller.png",
    thread: "sprites/thread.png"
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function distance(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function pick(list) {
    return list[(Math.random() * list.length) | 0];
  }

  function drawRoundRect(context, x, y, w, h, r, fill, stroke) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + w - r, y);
    context.quadraticCurveTo(x + w, y, x + w, y + r);
    context.lineTo(x + w, y + h - r);
    context.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    context.lineTo(x + r, y + h);
    context.quadraticCurveTo(x, y + h, x, y + h - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    if (fill) {
      context.fillStyle = fill;
      context.fill();
    }
    if (stroke) {
      context.strokeStyle = stroke;
      context.stroke();
    }
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  }

  class AudioSystem {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.musicTimer = 0;
      this.musicStep = 0;
      this.walkTimer = 0;
      this.musicLead = [392, 440, 523.25, 587.33, 523.25, 440, 392, 329.63];
      this.musicBass = [196, 196, 174.61, 220, 196, 174.61, 164.81, 174.61];
    }

    ensure() {
      if (!this.ctx) {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) {
          return null;
        }
        this.ctx = new Context();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.16;
        this.master.connect(this.ctx.destination);
      }

      if (this.ctx.state === "suspended") {
        this.ctx.resume();
      }

      return this.ctx;
    }

    tone(options) {
      const ctx = this.ensure();
      if (!ctx || !this.master) {
        return;
      }

      const now = ctx.currentTime;
      const oscillator = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      oscillator.type = options.type || "square";
      oscillator.frequency.setValueAtTime(options.freq, now);
      if (options.freqEnd) {
        oscillator.frequency.exponentialRampToValueAtTime(options.freqEnd, now + options.duration);
      }

      filter.type = options.filterType || "lowpass";
      filter.frequency.setValueAtTime(options.filterFreq || 1400, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(options.volume || 0.06, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + options.duration);

      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);

      oscillator.start(now);
      oscillator.stop(now + options.duration + 0.02);
    }

    update(dt, gameState) {
      if (gameState !== "play") {
        return;
      }

      this.musicTimer -= dt;
      if (this.musicTimer <= 0) {
        this.playMusicStep();
        this.musicTimer = 0.28;
      }
    }

    playMusicStep() {
      const lead = this.musicLead[this.musicStep % this.musicLead.length];
      const bass = this.musicBass[this.musicStep % this.musicBass.length];

      this.tone({
        freq: lead,
        duration: 0.22,
        volume: 0.05,
        type: "triangle",
        filterFreq: 1800
      });

      this.tone({
        freq: bass,
        duration: 0.32,
        volume: 0.03,
        type: "square",
        filterFreq: 600
      });

      this.musicStep += 1;
    }

    footsteps(dt, moving) {
      if (!moving) {
        this.walkTimer = 0;
        return;
      }

      this.walkTimer -= dt;
      if (this.walkTimer <= 0) {
        this.tone({
          freq: 180,
          freqEnd: 120,
          duration: 0.06,
          volume: 0.022,
          type: "triangle",
          filterType: "bandpass",
          filterFreq: 700
        });
        this.walkTimer = 0.22;
      }
    }

    wrap() {
      this.tone({
        freq: 520,
        freqEnd: 180,
        duration: 0.24,
        volume: 0.08,
        type: "sawtooth",
        filterType: "bandpass",
        filterFreq: 880
      });
    }

    boing() {
      this.tone({
        freq: 260,
        freqEnd: 640,
        duration: 0.14,
        volume: 0.09,
        type: "triangle",
        filterType: "lowpass",
        filterFreq: 1200
      });
      this.tone({
        freq: 330,
        freqEnd: 140,
        duration: 0.22,
        volume: 0.07,
        type: "square",
        filterType: "bandpass",
        filterFreq: 760
      });
    }

    victory() {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((note, index) => {
        window.setTimeout(() => {
          this.tone({
            freq: note,
            duration: 0.18 + index * 0.02,
            volume: 0.06,
            type: index % 2 === 0 ? "triangle" : "square",
            filterFreq: 1700
          });
        }, index * 70);
      });
    }
  }

  class SpeechBubbleSystem {
    constructor() {
      this.bubbles = [];
    }

    add(text, x, y, color) {
      this.bubbles.push({
        text,
        x,
        y,
        color,
        age: 0,
        life: 2.2
      });
    }

    update(dt) {
      for (const bubble of this.bubbles) {
        bubble.age += dt;
        bubble.y -= dt * 8;
      }
      this.bubbles = this.bubbles.filter((bubble) => bubble.age < bubble.life);
    }

    draw(context) {
      context.font = "bold 14px monospace";
      context.textAlign = "center";
      context.textBaseline = "middle";

      for (const bubble of this.bubbles) {
        const alpha = clamp(1 - Math.max(0, bubble.age - 1.5) / 0.7, 0, 1);
        const width = context.measureText(bubble.text).width + 18;
        const height = 26;

        context.save();
        context.globalAlpha = alpha;
        drawRoundRect(context, bubble.x - width / 2, bubble.y - height / 2, width, height, 8, bubble.color, "rgba(0,0,0,0.5)");
        context.fillStyle = "#fff7e1";
        context.fillText(bubble.text, bubble.x, bubble.y + 1);
        context.restore();
      }

      context.textAlign = "left";
    }
  }

  class Character {
    constructor(config) {
      this.x = config.x;
      this.y = config.y;
      this.speed = config.speed;
      this.sprite = config.sprite;
      this.name = config.name;
      this.frame = 0;
      this.animTime = 0;
      this.facing = "down";
      this.moving = false;
      this.tilt = 0;
    }

    updateAnimation(dt) {
      this.animTime += dt;
      if (this.moving) {
        this.frame = Math.floor(this.animTime * 10) % 3;
      } else {
        this.frame = 0;
      }
    }

    draw(context, scale = 2) {
      const frameSize = 32;
      const sx = this.frame * frameSize;
      const bob = this.moving ? Math.sin(this.animTime * 14) * 2.2 : Math.sin(this.animTime * 3.5) * 0.7;
      const squash = this.moving ? 1 + Math.sin(this.animTime * 14) * 0.04 : 1;
      const stretch = this.moving ? 1 - Math.sin(this.animTime * 14) * 0.05 : 1;
      const flip = this.facing === "left" ? -1 : 1;

      context.save();
      context.translate(Math.round(this.x), Math.round(this.y + bob));
      context.rotate(this.tilt);
      context.scale(flip, 1);

      context.fillStyle = "rgba(0,0,0,0.18)";
      context.beginPath();
      context.ellipse(0, 18, 16 + Math.abs(bob) * 0.4, 8, 0, 0, Math.PI * 2);
      context.fill();

      context.drawImage(
        this.sprite,
        sx,
        0,
        frameSize,
        frameSize,
        Math.round(-frameSize * scale / 2),
        Math.round(-frameSize * scale / 2 - 10),
        Math.round(frameSize * scale * stretch),
        Math.round(frameSize * scale * squash)
      );
      context.restore();
    }
  }

  class Player extends Character {
    constructor(config) {
      super(config);
      this.input = config.input;
    }

    update(dt, world) {
      let dx = 0;
      let dy = 0;

      if (this.input.has("ArrowUp") || this.input.has("KeyW")) dy -= 1;
      if (this.input.has("ArrowDown") || this.input.has("KeyS")) dy += 1;
      if (this.input.has("ArrowLeft") || this.input.has("KeyA")) dx -= 1;
      if (this.input.has("ArrowRight") || this.input.has("KeyD")) dx += 1;

      this.moving = Math.abs(dx) + Math.abs(dy) > 0;
      if (this.moving) {
        const length = Math.hypot(dx, dy) || 1;
        dx /= length;
        dy /= length;
        this.x += dx * this.speed * dt;
        this.y += dy * this.speed * dt;
        this.x = clamp(this.x, world.bounds.left, world.bounds.right);
        this.y = clamp(this.y, world.bounds.top, world.bounds.bottom);
        if (Math.abs(dx) > Math.abs(dy)) {
          this.facing = dx > 0 ? "right" : "left";
        } else {
          this.facing = dy > 0 ? "down" : "up";
        }
      }

      this.updateAnimation(dt);
    }
  }

  class CompanionNPC extends Character {
    constructor(config) {
      super(config);
      this.leader = config.leader;
      this.bubbleSystem = config.bubbleSystem;
      this.voiceTimer = rand(2.6, 5.1);
      this.lines = [
        "Костик, быстрее!",
        "Он опять идёт!",
        "Бежим!",
        "Это ловушка!",
        "Костик, не останавливайся!",
        "Он почти рядом!"
      ];
    }

    update(dt, world) {
      const targetX = this.leader.x - 26;
      const targetY = this.leader.y + 18;
      const dx = targetX - this.x;
      const dy = targetY - this.y;
      const dist = Math.hypot(dx, dy);
      this.moving = dist > 8;
      if (dist > 0.01) {
        const speed = dist > 80 ? this.speed * 1.3 : this.speed;
        this.x += (dx / dist) * speed * dt;
        this.y += (dy / dist) * speed * dt;
        if (Math.abs(dx) > Math.abs(dy)) {
          this.facing = dx > 0 ? "right" : "left";
        }
        this.tilt = clamp(dx * 0.01, -0.08, 0.08);
      }
      this.x = clamp(this.x, world.bounds.left, world.bounds.right);
      this.y = clamp(this.y, world.bounds.top, world.bounds.bottom);
      this.updateAnimation(dt);

      this.voiceTimer -= dt;
      if (this.voiceTimer <= 0) {
        this.bubbleSystem.add(pick(this.lines), this.x, this.y - 36, "#8d4d87");
        this.voiceTimer = rand(3.2, 6.3);
      }
    }
  }

  class SellerNPC extends Character {
    constructor(config) {
      super(config);
      this.player = config.player;
      this.bubbleSystem = config.bubbleSystem;
      this.target = { x: this.x, y: this.y };
      this.state = "wander";
      this.voiceTimer = rand(2.1, 5.4);
      this.stateTimer = 0;
      this.catchProgress = 0;
      this.didWrapSound = false;
      this.lines = [
        "Друг, ниточку?",
        "Очень выгодно!",
        "Подойди на секунду!",
        "Парижская традиция!",
        "Всего минуточку!"
      ];
    }

    chooseTarget(world) {
      this.target.x = rand(world.bounds.left + 16, world.bounds.right - 16);
      this.target.y = rand(world.bounds.top + 24, world.bounds.bottom - 10);
    }

    update(dt, world, audio) {
      const distToPlayer = distance(this.x, this.y, this.player.x, this.player.y);

      if (this.state === "sad") {
        this.stateTimer -= dt;
        this.tilt = lerp(this.tilt, -0.14, 0.12);
        if (this.stateTimer <= 0) {
          this.state = "wander";
          this.chooseTarget(world);
        }
      } else if (distToPlayer < CATCH_DISTANCE) {
        this.state = "wrap";
        this.catchProgress = clamp(this.catchProgress + dt * 1.7, 0, 1);
        if (!this.didWrapSound) {
          audio.wrap();
          this.didWrapSound = true;
        }
      } else {
        if (this.state === "wrap") {
          this.state = "sad";
          this.stateTimer = 1.3;
          this.catchProgress = 0;
          this.didWrapSound = false;
        } else if (distToPlayer < CHASE_DISTANCE) {
          this.state = "chase";
          this.target.x = this.player.x;
          this.target.y = this.player.y;
        } else if (this.state !== "wander") {
          this.state = "wander";
          this.chooseTarget(world);
        }

        const dx = this.target.x - this.x;
        const dy = this.target.y - this.y;
        const dist = Math.hypot(dx, dy);
        this.moving = dist > 4;
        if (dist > 0.01) {
          const moveSpeed = this.state === "chase" ? this.speed : this.speed * 0.72;
          this.x += (dx / dist) * moveSpeed * dt;
          this.y += (dy / dist) * moveSpeed * dt;
          if (Math.abs(dx) > Math.abs(dy)) {
            this.facing = dx > 0 ? "right" : "left";
          }
          this.tilt = clamp(dx * 0.01, -0.12, 0.12);
        }
        if (this.state === "wander" && dist < 10) {
          this.chooseTarget(world);
        }
      }

      this.voiceTimer -= dt;
      if (this.voiceTimer <= 0 && this.state !== "wrap") {
        this.bubbleSystem.add(pick(this.lines), this.x, this.y - 34, "#7b512f");
        this.voiceTimer = rand(3.0, 5.8);
      }

      this.x = clamp(this.x, world.bounds.left, world.bounds.right);
      this.y = clamp(this.y, world.bounds.top, world.bounds.bottom);
      this.updateAnimation(dt);
    }
  }

  class Game {
    constructor() {
      this.images = {};
      this.audio = new AudioSystem();
      this.bubbles = new SpeechBubbleSystem();
      this.input = new Set();
      this.state = "title";
      this.lastTime = 0;
      this.player = null;
      this.katya = null;
      this.sellers = [];
      this.wrapSeller = null;
      this.world = {
        bounds: {
          left: 72,
          right: WIDTH - 72,
          top: 90,
          bottom: HEIGHT - 78
        }
      };
      this.tourists = this.createTourists();
      this.sparkles = this.createSparkles();
      this.particles = [];
      this.titlePulse = 0;
      this.phase = 1;
      this.kostikTalkTimer = rand(4.0, 7.0);
      this.dustTimer = 0;
      this.wrapParticleTimer = 0;
      this.survivalTimer = 0;
      this.exit = {
        x: WIDTH - 114,
        y: HEIGHT - 114,
        radius: 34,
        visible: false,
        pulse: 0,
        edge: "right"
      };
      this.escapeSequence = 0;
      this.portalBurstDone = false;
    }

    async init() {
      const entries = await Promise.all(
        Object.entries(assetPaths).map(async ([key, src]) => [key, await loadImage(src)])
      );
      this.images = Object.fromEntries(entries);
      this.resetGameplay();
      this.bindInput();
      requestAnimationFrame((time) => this.loop(time));
    }

    bindInput() {
      window.addEventListener("keydown", (event) => {
        this.audio.ensure();
        this.input.add(event.code);
        if (this.state === "title" && event.code === "Space") {
          event.preventDefault();
          this.start();
        } else if ((this.state === "gameover" || this.state === "victory") && event.code === "KeyR") {
          event.preventDefault();
          this.resetGameplay();
          this.start();
        }
      });

      window.addEventListener("keyup", (event) => {
        this.input.delete(event.code);
      });
    }

    resetGameplay() {
      this.bubbles = new SpeechBubbleSystem();
      this.player = new Player({
        x: WIDTH * 0.28,
        y: HEIGHT * 0.68,
        speed: PLAYER_SPEED,
        sprite: this.images.kostik || { width: 96, height: 32 },
        input: this.input,
        name: "Kostik"
      });

      this.katya = new CompanionNPC({
        x: WIDTH * 0.24,
        y: HEIGHT * 0.74,
        speed: 132,
        sprite: this.images.katya || { width: 96, height: 32 },
        leader: this.player,
        bubbleSystem: this.bubbles,
        name: "Katya"
      });

      this.sellers = [];
      this.spawnSeller(WIDTH * 0.72, HEIGHT * 0.3);
      this.katya.bubbleSystem = this.bubbles;
      this.tourists = this.createTourists();
      this.particles = [];
      this.phase = 1;
      this.wrapSeller = null;
      this.kostikTalkTimer = rand(4.0, 7.0);
      this.dustTimer = 0;
      this.wrapParticleTimer = 0;
      this.survivalTimer = 0;
      this.exit.visible = false;
      this.exit.pulse = 0;
      this.exit.edge = "right";
      this.escapeSequence = 0;
      this.portalBurstDone = false;
    }

    start() {
      this.state = "play";
      this.lastTime = 0;
      this.audio.ensure();
    }

    triggerGameOver() {
      if (this.state === "gameover") {
        return;
      }
      this.state = "gameover";
      this.audio.boing();
    }

    spawnSeller(x, y) {
      const seller = new SellerNPC({
        x,
        y,
        speed: SELLER_SPEED,
        sprite: this.images.seller || { width: 96, height: 32 },
        player: this.player,
        bubbleSystem: this.bubbles,
        name: "Seller"
      });
      seller.chooseTarget(this.world);
      this.sellers.push(seller);
      return seller;
    }

    spawnSecondSeller() {
      if (this.sellers.length >= 2) {
        return;
      }

      const spawnPoints = [
        { x: WIDTH * 0.18, y: HEIGHT * 0.24 },
        { x: WIDTH * 0.82, y: HEIGHT * 0.24 },
        { x: WIDTH * 0.2, y: HEIGHT * 0.76 },
        { x: WIDTH * 0.8, y: HEIGHT * 0.76 }
      ];
      spawnPoints.sort(
        (a, b) =>
          distance(b.x, b.y, this.player.x, this.player.y) - distance(a.x, a.y, this.player.x, this.player.y)
      );

      const seller = this.spawnSeller(spawnPoints[0].x, spawnPoints[0].y);
      this.bubbles.add(pick(["Костик быстрее!", "Он почти рядом!"]), this.katya.x, this.katya.y - 36, "#8d4d87");
      this.bubbles.add("Парижская традиция!", seller.x, seller.y - 34, "#7b512f");
    }

    placeExitAtRandomEdge() {
      const inset = 70;
      const edge = pick(["top", "right", "bottom", "left"]);
      this.exit.edge = edge;

      if (edge === "top") {
        this.exit.x = rand(this.world.bounds.left + inset, this.world.bounds.right - inset);
        this.exit.y = this.world.bounds.top + 10;
      } else if (edge === "right") {
        this.exit.x = this.world.bounds.right - 10;
        this.exit.y = rand(this.world.bounds.top + inset, this.world.bounds.bottom - inset);
      } else if (edge === "bottom") {
        this.exit.x = rand(this.world.bounds.left + inset, this.world.bounds.right - inset);
        this.exit.y = this.world.bounds.bottom - 10;
      } else {
        this.exit.x = this.world.bounds.left + 10;
        this.exit.y = rand(this.world.bounds.top + inset, this.world.bounds.bottom - inset);
      }
    }

    getNearestSeller() {
      let nearest = null;
      let nearestDistance = Infinity;
      for (const seller of this.sellers) {
        const dist = distance(this.player.x, this.player.y, seller.x, seller.y);
        if (dist < nearestDistance) {
          nearestDistance = dist;
          nearest = seller;
        }
      }
      return { seller: nearest, distance: nearestDistance };
    }

    getWrappingSeller() {
      let candidate = null;
      let progress = 0;
      for (const seller of this.sellers) {
        if (seller.catchProgress > progress) {
          progress = seller.catchProgress;
          candidate = seller;
        }
      }
      return candidate;
    }

    updatePhaseState() {
      // The run escalates in fixed phases: calm, chaos, then the final exit.
      if (this.phase === 1 && this.survivalTimer >= PHASE_TWO_TIME) {
        this.phase = 2;
        this.spawnSecondSeller();
      }

      if (this.phase < 3 && this.survivalTimer >= EXIT_SPAWN_TIME) {
        this.phase = 3;
        this.triggerExitOpen();
      }
    }

    triggerExitOpen() {
      if (this.exit.visible) {
        return;
      }
      this.placeExitAtRandomEdge();
      this.exit.visible = true;
      this.bubbles.add("EXIT!", this.exit.x, this.exit.y - 44, "#2d8b5c");
      this.bubbles.add("Костик! Там выход!", this.katya.x, this.katya.y - 36, "#8d4d87");
      for (let i = 0; i < 16; i += 1) {
        this.emitSpark(this.exit.x, this.exit.y, pick(["#8df6b1", "#e8ffc1", "#9fdcff"]), 1);
      }
    }

    triggerVictory() {
      if (this.state === "escape" || this.state === "victory") {
        return;
      }
      this.state = "escape";
      this.escapeSequence = 1.2;
      this.audio.victory();
      this.bubbles.add("Бежим!", this.player.x, this.player.y - 38, "#2f5f9e");
      this.bubbles.add("Успели!", this.katya.x, this.katya.y - 36, "#8d4d87");
    }

    updateEscapeSequence(dt) {
      this.escapeSequence -= dt;
      this.updateParticles(dt);
      this.bubbles.update(dt);
      this.exit.pulse += dt * 1.6;

      const playerTargetX = this.exit.x - 8;
      const playerTargetY = this.exit.y + 6;
      const katyaTargetX = this.exit.x + 18;
      const katyaTargetY = this.exit.y + 12;

      this.player.x = lerp(this.player.x, playerTargetX, dt * 5.2);
      this.player.y = lerp(this.player.y, playerTargetY, dt * 5.2);
      this.katya.x = lerp(this.katya.x, katyaTargetX, dt * 4.8);
      this.katya.y = lerp(this.katya.y, katyaTargetY, dt * 4.8);
      this.player.animTime += dt;
      this.katya.animTime += dt;
      this.player.moving = true;
      this.katya.moving = true;
      this.player.frame = Math.floor(this.player.animTime * 10) % 3;
      this.katya.frame = Math.floor(this.katya.animTime * 10) % 3;

      if (!this.portalBurstDone) {
        this.portalBurstDone = true;
        for (let i = 0; i < 30; i += 1) {
          this.emitSpark(this.exit.x, this.exit.y, pick(["#8df6b1", "#e8ffc1", "#9fdcff", "#fff1a8"]), 1);
        }
      }

      if (this.escapeSequence <= 0) {
        this.state = "victory";
      }
    }

    update(dt) {
      if (this.state === "title") {
        this.titlePulse += dt;
        this.updateTourists(dt);
        return;
      }

      if (this.state === "gameover" || this.state === "victory") {
        this.updateTourists(dt);
        return;
      }

      if (this.state === "escape") {
        this.updateTourists(dt);
        this.updateEscapeSequence(dt);
        return;
      }

      this.updateTourists(dt);
      this.player.update(dt, this.world);
      this.katya.update(dt, this.world);
      for (const seller of this.sellers) {
        seller.update(dt, this.world, this.audio);
      }
      this.bubbles.update(dt);
      this.updateParticles(dt);

      this.audio.update(dt, this.state);
      this.audio.footsteps(dt, this.player.moving || this.katya.moving);
      this.survivalTimer += dt;
      this.exit.pulse += dt;
      this.updatePhaseState();

      if (this.player.moving) {
        this.dustTimer -= dt;
        if (this.dustTimer <= 0) {
          this.emitDust(this.player.x + rand(-8, 8), this.player.y + 18, "#efe0bf", 2, 14);
          this.dustTimer = 0.08;
        }
      } else {
        this.dustTimer = 0;
      }

      this.wrapSeller = this.getWrappingSeller();
      if (this.wrapSeller) {
        this.wrapParticleTimer -= dt;
        if (this.wrapParticleTimer <= 0) {
          this.emitSpark(this.player.x + rand(-10, 10), this.player.y - 6 + rand(-6, 6), "#ff6e7f", 2);
          this.wrapParticleTimer = 0.05;
        }
      } else {
        this.wrapParticleTimer = 0;
      }

      this.kostikTalkTimer -= dt;
      if (this.kostikTalkTimer <= 0) {
        this.bubbles.add("Не сегодня!", this.player.x, this.player.y - 38, "#2f5f9e");
        this.kostikTalkTimer = rand(5.2, 8.1);
      }

      if (this.exit.visible) {
        const playerAtExit = distance(this.player.x, this.player.y, this.exit.x, this.exit.y) < this.exit.radius;
        const katyaAtExit = distance(this.katya.x, this.katya.y, this.exit.x, this.exit.y) < this.exit.radius + 8;
        if (playerAtExit && katyaAtExit) {
          this.triggerVictory();
        }
      }

      if (this.sellers.some((seller) => seller.catchProgress >= 1)) {
        this.triggerGameOver();
      }
    }

    emitDust(x, y, color, count, size) {
      for (let i = 0; i < count; i += 1) {
        this.particles.push({
          x,
          y,
          vx: rand(-18, 18),
          vy: rand(-24, -8),
          life: rand(0.24, 0.42),
          age: 0,
          color,
          size: rand(size * 0.4, size * 0.8),
          type: "dust"
        });
      }
    }

    emitSpark(x, y, color, count) {
      for (let i = 0; i < count; i += 1) {
        this.particles.push({
          x,
          y,
          vx: rand(-36, 36),
          vy: rand(-44, 10),
          life: rand(0.18, 0.34),
          age: 0,
          color,
          size: rand(3, 6),
          type: "spark"
        });
      }
    }

    updateParticles(dt) {
      for (const p of this.particles) {
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.type === "dust") {
          p.vx *= 0.92;
          p.vy += 28 * dt;
        } else {
          p.vy += 55 * dt;
        }
      }
      this.particles = this.particles.filter((p) => p.age < p.life);
    }

    drawBackground(time) {
      const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      sky.addColorStop(0, "#91a6d9");
      sky.addColorStop(0.38, "#d8c39a");
      sky.addColorStop(1, "#ccb18b");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      for (let row = 0; row < ROWS; row += 1) {
        for (let col = 0; col < COLS; col += 1) {
          const x = col * TILE;
          const y = row * TILE;
          const plaza = col > 6 && col < 17 && row > 2 && row < 13;
          const floor = plaza ? "#dfcfb2" : "#d2c3aa";
          const floorDark = plaza ? "#c9b494" : "#bda989";
          ctx.fillStyle = floor;
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = floorDark;
          ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
          ctx.fillStyle = floor;
          ctx.fillRect(x + 6, y + 6, TILE - 12, TILE - 12);
        }
      }

      ctx.fillStyle = "#e7dbc0";
      ctx.fillRect(180, 80, 600, 440);
      ctx.fillStyle = "#f5ebd7";
      ctx.fillRect(196, 96, 568, 408);

      ctx.fillStyle = "#bca078";
      ctx.fillRect(176, 128, 120, 28);
      ctx.fillRect(664, 128, 120, 28);
      ctx.fillRect(286, 100, 388, 40);

      const bob = Math.sin(time * 0.0012) * 2;
      const warmFlicker = (Math.sin(time * 0.001 + 0.8) + 1) * 0.5;
      ctx.beginPath();
      ctx.moveTo(480, 176 + bob);
      ctx.lineTo(598, 328 + bob);
      ctx.lineTo(362, 328 + bob);
      ctx.closePath();
      ctx.fillStyle = "rgba(129, 208, 236, 0.58)";
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(480, 192 + bob);
      ctx.lineTo(576, 318 + bob);
      ctx.lineTo(384, 318 + bob);
      ctx.closePath();
      ctx.fillStyle = "rgba(204, 245, 255, 0.72)";
      ctx.fill();

      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(480, 192 + bob);
      ctx.lineTo(384, 318 + bob);
      ctx.lineTo(576, 318 + bob);
      ctx.closePath();
      ctx.stroke();

      ctx.fillStyle = "rgba(255, 245, 215, 0.18)";
      ctx.fillRect(230, 126, 500, 12);
      ctx.fillRect(240, 456, 480, 10);

      for (const tourist of this.tourists) {
        const offset = Math.sin(time * 0.002 + tourist.phase) * 2 + Math.sin(tourist.walkPhase) * 1.4;
        ctx.fillStyle = "rgba(0,0,0,0.16)";
        ctx.fillRect(tourist.x - 5, tourist.y + 14, 10, 4);
        ctx.fillStyle = tourist.color;
        ctx.fillRect(tourist.x - 4, tourist.y - 8 + offset, 8, 10);
        ctx.fillStyle = tourist.head;
        ctx.fillRect(tourist.x - 3, tourist.y - 14 + offset, 6, 6);
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.fillRect(tourist.x - 2, tourist.y - 6 + offset, 2, 2);
      }

      for (const sparkle of this.sparkles) {
        const pulse = (Math.sin(time * sparkle.speed + sparkle.phase) + 1) * 0.5;
        ctx.fillStyle = sparkle.color;
        ctx.globalAlpha = 0.18 + pulse * 0.55;
        ctx.fillRect(sparkle.x, sparkle.y + Math.sin(time * 0.001 + sparkle.phase) * 2, sparkle.size, sparkle.size);
      }
      ctx.globalAlpha = 1;

      ctx.fillStyle = "rgba(255, 235, 188, 0.14)";
      ctx.beginPath();
      ctx.arc(480, 250, 124 + warmFlicker * 4, 0, Math.PI * 2);
      ctx.fill();
    }

    createTourists() {
      const tourists = [];
      const colors = [
        ["#5476c9", "#efc5a4"],
        ["#d1695b", "#f0d2b2"],
        ["#4f9d7a", "#d8b08c"],
        ["#9d7bd6", "#edcfb3"]
      ];

      for (let i = 0; i < 8; i += 1) {
        const [color, head] = colors[i % colors.length];
        const baseX = 120 + i * 92;
        const baseY = 86 + (i % 2) * 18;
        tourists.push({
          x: baseX,
          y: baseY,
          baseX,
          baseY,
          targetX: baseX + rand(-18, 18),
          targetY: baseY + rand(-12, 12),
          speed: rand(10, 20),
          timer: rand(0.8, 1.9),
          walkPhase: rand(0, Math.PI * 2),
          color,
          head,
          phase: i * 0.7
        });
      }

      return tourists;
    }

    updateTourists(dt) {
      for (const tourist of this.tourists) {
        tourist.timer -= dt;
        const dx = tourist.targetX - tourist.x;
        const dy = tourist.targetY - tourist.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 0.1) {
          tourist.x += (dx / dist) * tourist.speed * dt;
          tourist.y += (dy / dist) * tourist.speed * dt;
        }

        if (tourist.timer <= 0 || dist < 2) {
          tourist.targetX = tourist.baseX + rand(-20, 20);
          tourist.targetY = tourist.baseY + rand(-14, 14);
          tourist.timer = rand(1.0, 2.2);
        }

        tourist.walkPhase += dt * 5;
      }
    }

    createSparkles() {
      const sparkles = [];
      for (let i = 0; i < 22; i += 1) {
        sparkles.push({
          x: rand(340, 620),
          y: rand(176, 352),
          size: pick([2, 2, 3]),
          speed: rand(0.004, 0.008),
          phase: rand(0, Math.PI * 2),
          color: pick(["#effbff", "#fff1b2", "#b7ebff"])
        });
      }
      return sparkles;
    }

    drawThreadWrap() {
      const seller = this.wrapSeller;
      if (!seller || seller.catchProgress <= 0) {
        return;
      }

      const t = seller.catchProgress;
      const sellerHandX = lerp(seller.x + 16, this.player.x + 10, t);
      const sellerHandY = lerp(seller.y + 6, this.player.y - 4, t);
      const frame = Math.min(2, Math.floor(t * 3));
      ctx.save();
      ctx.globalAlpha = 0.24 + t * 0.52;
      ctx.strokeStyle = "#c92434";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(seller.x + 10, seller.y + 14);
      ctx.quadraticCurveTo((seller.x + this.player.x) / 2, this.player.y - 26, sellerHandX, sellerHandY);
      ctx.stroke();
      ctx.restore();

      ctx.drawImage(this.images.thread, frame * 32, 0, 32, 32, this.player.x - 18, this.player.y - 20, 48, 48);
    }

    drawExit() {
      if (!this.exit.visible && this.state !== "escape" && this.state !== "victory") {
        return;
      }

      const pulse = (Math.sin(this.exit.pulse * 6) + 1) * 0.5;
      const outer = 34 + pulse * 5;
      const inner = 22 + pulse * 3;

      ctx.save();
      ctx.globalAlpha = 0.22 + pulse * 0.16;
      ctx.fillStyle = "#73f0a0";
      ctx.beginPath();
      ctx.arc(this.exit.x, this.exit.y, outer, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = "#2d8b5c";
      ctx.beginPath();
      ctx.arc(this.exit.x, this.exit.y, inner + 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#aaf8c2";
      ctx.beginPath();
      ctx.arc(this.exit.x, this.exit.y, inner, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.exit.x, this.exit.y, inner - 4, 0, Math.PI * 2);
      ctx.stroke();

      for (let i = 0; i < 6; i += 1) {
        const angle = this.exit.pulse * 2.6 + i * (Math.PI / 3);
        const sx = this.exit.x + Math.cos(angle) * (outer + 6);
        const sy = this.exit.y + Math.sin(angle) * (outer + 6);
        ctx.fillStyle = i % 2 === 0 ? "#eaffb8" : "#b5f7ff";
        ctx.fillRect(sx - 2, sy - 2, 4, 4);
      }
    }

    drawExitArrow() {
      if (!this.exit.visible || this.state !== "play") {
        return;
      }

      const blink = Math.sin(this.exit.pulse * 8) > -0.15;
      const alpha = blink ? 1 : 0.35;
      const cell = 8;
      let startX = this.exit.x;
      let startY = this.exit.y;
      let pixels = [];

      if (this.exit.edge === "left") {
        startX += 26;
        startY -= 20;
        pixels = [
          [3, 0],
          [2, 1], [3, 1],
          [1, 2], [2, 2], [3, 2],
          [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3],
          [1, 4], [2, 4], [3, 4],
          [2, 5], [3, 5],
          [3, 6]
        ];
      } else if (this.exit.edge === "right") {
        startX -= 74;
        startY -= 20;
        pixels = [
          [2, 0],
          [2, 1], [3, 1],
          [2, 2], [3, 2], [4, 2],
          [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3],
          [2, 4], [3, 4], [4, 4],
          [2, 5], [3, 5],
          [2, 6]
        ];
      } else if (this.exit.edge === "top") {
        startX -= 22;
        startY += 20;
        pixels = [
          [2, 0],
          [1, 1], [2, 1], [3, 1],
          [0, 2], [1, 2], [2, 2], [3, 2], [4, 2],
          [2, 3],
          [2, 4],
          [2, 5], [3, 5],
          [2, 6], [3, 6]
        ];
      } else {
        startX -= 22;
        startY -= 76;
        pixels = [
          [2, 0], [3, 0],
          [2, 1], [3, 1],
          [2, 2], [3, 2],
          [2, 3],
          [2, 4],
          [0, 5], [1, 5], [2, 5], [3, 5], [4, 5],
          [1, 6], [2, 6], [3, 6],
          [2, 7]
        ];
      }

      ctx.save();
      ctx.globalAlpha = alpha;
      for (const [px, py] of pixels) {
        ctx.fillStyle = "#785400";
        ctx.fillRect(Math.round(startX + px * cell + 2), Math.round(startY + py * cell + 2), cell, cell);
        ctx.fillStyle = "#ffe887";
        ctx.fillRect(Math.round(startX + px * cell), Math.round(startY + py * cell), cell, cell);
      }
      ctx.restore();
    }

    drawTitleScreen(time) {
      ctx.fillStyle = "rgba(7, 9, 16, 0.58)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      drawRoundRect(ctx, 168, 136, 624, 312, 26, "rgba(21, 26, 44, 0.9)", "rgba(255,255,255,0.12)");

      for (let i = 0; i < 22; i += 1) {
        const x = 206 + (i % 11) * 50;
        const y = 164 + Math.floor(i / 11) * 164 + Math.sin(time * 0.003 + i) * 6;
        ctx.fillStyle = i % 3 === 0 ? "#fff1ab" : "#b8e8ff";
        ctx.fillRect(x, y, 3, 3);
      }

      ctx.textAlign = "center";
      ctx.fillStyle = "#ffea9e";
      ctx.font = "bold 56px monospace";
      ctx.fillText("ESCAPE FROM THE THREAD", WIDTH / 2, 238);
      ctx.fillStyle = "#d8e3ff";
      ctx.font = "bold 28px monospace";
      ctx.fillText("A Kostik Adventure", WIDTH / 2, 284);

      const blink = Math.sin(time * 0.006) > -0.1;
      if (blink) {
        const pulse = 1 + Math.sin(time * 0.008) * 0.04;
        ctx.save();
        ctx.translate(WIDTH / 2, 368);
        ctx.scale(pulse, pulse);
        drawRoundRect(ctx, -164, -32, 328, 64, 16, "#2d8b5c", "rgba(255,255,255,0.18)");
        ctx.fillStyle = "#fff7e2";
        ctx.font = "bold 30px monospace";
        ctx.fillText("Press SPACE to start", 0, 9);
        ctx.restore();
      }

      ctx.drawImage(this.images.kostik, 0, 0, 32, 32, 238, 302, 72, 72);
      ctx.drawImage(this.images.katya, 0, 0, 32, 32, 632, 302, 72, 72);

      ctx.textAlign = "left";
    }

    drawHUD() {
      const nearest = this.getNearestSeller();
      const phaseText = this.phase === 1 ? "CALM" : this.phase === 2 ? "CHAOS" : "ESCAPE";
      drawRoundRect(ctx, 20, 18, 304, 112, 16, "rgba(12, 16, 28, 0.72)", "rgba(255,255,255,0.12)");
      ctx.fillStyle = "#fff0bc";
      ctx.font = "bold 18px monospace";
      ctx.fillText("Nearest: " + Math.floor(nearest.distance || 0), 36, 40);
      ctx.fillStyle = "#d8e3ff";
      ctx.fillText("Phase: " + phaseText, 36, 61);
      ctx.fillText("Sellers: " + this.sellers.length, 188, 61);
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.fillRect(36, 74, 238, 8);
      ctx.fillStyle = this.wrapSeller ? "#ff6f7c" : "#85f3a0";
      ctx.fillRect(36, 74, 238 * (1 - clamp((nearest.distance || CHASE_DISTANCE) / CHASE_DISTANCE, 0, 1)), 8);
      ctx.fillStyle = "#fff0bc";
      ctx.font = "bold 16px monospace";
      if (this.exit.visible) {
        ctx.fillText("EXIT OPEN: TAKE KATYA OUT", 36, 101);
      } else if (this.phase === 1) {
        ctx.fillText("Phase 2 in: " + Math.max(0, PHASE_TWO_TIME - this.survivalTimer).toFixed(1) + "s", 36, 101);
      } else {
        ctx.fillText("EXIT IN: " + Math.max(0, EXIT_SPAWN_TIME - this.survivalTimer).toFixed(1) + "s", 36, 101);
      }
    }

    drawGameOver() {
      ctx.fillStyle = "rgba(5, 7, 13, 0.74)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.textAlign = "center";

      drawRoundRect(ctx, 120, 78, 720, 444, 28, "rgba(21, 24, 38, 0.95)", "rgba(255,255,255,0.14)");

      const portraitX = 370;
      const portraitY = 140;
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.beginPath();
      ctx.ellipse(portraitX + 108, portraitY + 234, 86, 24, 0, 0, Math.PI * 2);
      ctx.fill();
      drawRoundRect(ctx, portraitX - 24, portraitY - 24, 268, 268, 28, "rgba(255,255,255,0.04)", "rgba(255,255,255,0.08)");
      ctx.drawImage(this.images.kostik, 32, 0, 32, 32, portraitX, portraitY, 220, 220);

      ctx.strokeStyle = "#d52d42";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(portraitX + 110, portraitY + 112, 42, -0.3, 4.5);
      ctx.stroke();

      ctx.fillStyle = "#ffe398";
      ctx.font = "bold 48px monospace";
      ctx.fillText("КОСТИК ПОПАЛСЯ", WIDTH / 2, 218);
      ctx.fillStyle = "#f5eed8";
      ctx.font = "bold 26px monospace";
      ctx.fillText("Нитка уже на пальце…", WIDTH / 2, 270);

      const blink = Math.sin(performance.now() * 0.007) > -0.1;
      if (blink) {
        ctx.fillStyle = "#8ff0a8";
        ctx.font = "bold 24px monospace";
        ctx.fillText("Press R to restart", WIDTH / 2, 420);
      }
      ctx.textAlign = "left";
    }

    drawVictory() {
      ctx.fillStyle = "rgba(5, 7, 13, 0.76)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      drawRoundRect(ctx, 122, 84, 716, 430, 28, "rgba(16, 30, 24, 0.95)", "rgba(255,255,255,0.14)");
      ctx.textAlign = "center";

      const victoryTime = performance.now() * 0.003;
      for (let i = 0; i < 28; i += 1) {
        const ang = i / 28 * Math.PI * 2;
        const r = 140 + Math.sin(victoryTime + i) * 8;
        const x = WIDTH / 2 + Math.cos(ang) * r;
        const y = 212 + Math.sin(ang) * r * 0.5;
        ctx.fillStyle = i % 2 ? "#b4ffe0" : "#fff3a2";
        ctx.fillRect(x, y, 4, 4);
      }

      ctx.drawImage(this.images.kostik, 0, 0, 32, 32, 188, 146, 132, 132);
      ctx.drawImage(this.images.katya, 0, 0, 32, 32, 642, 146, 132, 132);

      ctx.fillStyle = "#ffe398";
      ctx.font = "bold 44px monospace";
      ctx.fillText("КОСТИК И КАТЯ СБЕЖАЛИ", WIDTH / 2, 170);
      ctx.fillStyle = "#eafbe8";
      ctx.font = "bold 26px monospace";
      ctx.fillText("Нитка не намотана.", WIDTH / 2, 228);
      ctx.fillText("Продавцы остались ни с чем.", WIDTH / 2, 264);

      const sellerXs = this.sellers.length > 1 ? [338, 540] : [440];
      for (let i = 0; i < sellerXs.length; i += 1) {
        const sx = sellerXs[i];
        const sway = Math.sin(victoryTime * 1.6 + i) * 2;
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        ctx.beginPath();
        ctx.ellipse(sx + 48, 408, 42, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.drawImage(this.images.seller, 0, 0, 32, 32, sx, 300 + sway, 96, 96);
        ctx.strokeStyle = "#c92434";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(sx + 34, 384 + sway);
        ctx.quadraticCurveTo(sx + 52, 408 + sway, sx + 82, 398 + sway);
        ctx.stroke();
        ctx.fillStyle = "#8aa0b4";
        ctx.fillRect(sx + 44, 387 + sway, 12, 4);
      }

      const blink = Math.sin(performance.now() * 0.006) > -0.1;
      if (blink) {
        ctx.fillStyle = "#8ff0a8";
        ctx.font = "bold 24px monospace";
        ctx.fillText("Press R to play again", WIDTH / 2, 448);
      }
      ctx.textAlign = "left";
    }

    drawParticles() {
      for (const p of this.particles) {
        const alpha = clamp(1 - p.age / p.life, 0, 1);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        const size = p.type === "dust" ? p.size * alpha : p.size;
        ctx.fillRect(p.x, p.y, size, size);
        ctx.restore();
      }
    }

    drawScreenEffects(time) {
      ctx.save();
      for (let y = 0; y < HEIGHT; y += 4) {
        ctx.fillStyle = y % 8 === 0 ? "rgba(255,255,255,0.018)" : "rgba(0,0,0,0.028)";
        ctx.fillRect(0, y, WIDTH, 2);
      }

      const glow = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 180, WIDTH / 2, HEIGHT / 2, 520);
      glow.addColorStop(0, "rgba(255,255,255,0)");
      glow.addColorStop(1, "rgba(0,0,0,0.24)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.globalAlpha = 0.05 + Math.sin(time * 0.0019) * 0.01;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.restore();
    }

    render(time) {
      this.drawBackground(time);
      this.drawExit();
      this.drawExitArrow();
      const drawOrder = [this.katya, ...this.sellers, this.player].sort((a, b) => a.y - b.y);
      for (const actor of drawOrder) {
        actor.draw(ctx);
      }
      this.drawThreadWrap();
      this.drawParticles();
      this.bubbles.draw(ctx);

      if (this.state === "play") {
        this.drawHUD();
      }

      if (this.state === "title") {
        this.drawTitleScreen(time);
      }

      if (this.state === "gameover") {
        this.drawGameOver();
      }

      if (this.state === "victory") {
        this.drawVictory();
      }

      this.drawScreenEffects(time);
    }

    loop(time) {
      const dt = this.lastTime ? Math.min((time - this.lastTime) / 1000, 0.033) : 1 / 60;
      this.lastTime = time;
      this.update(dt);
      this.render(time);
      requestAnimationFrame((next) => this.loop(next));
    }
  }

  async function main() {
    const game = new Game();
    try {
      await game.init();
    } catch (error) {
      console.error(error);
      ctx.fillStyle = "#120e17";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = "#fff1c0";
      ctx.font = "bold 22px monospace";
      ctx.fillText("Assets failed to load.", 40, 60);
    }
  }

  main();
})();
