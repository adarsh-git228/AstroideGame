/**
 * GAME CONFIGURATION & STATE
 */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game Constants
const FPS = 60;
const FRICTION = 0.7; 
const SHIP_SIZE = 20; 
const SHIP_THRUST = 5; 
const TURN_SPEED = 360; 
const LASER_MAX = 10; 
const LASER_SPD = 500; 
const LASER_DIST = 0.6; 
const ROIDS_NUM = 3; 
const ROIDS_SIZE = 100; 
const ROIDS_SPD = 50; 
const ROIDS_VERT = 10; 
const ROIDS_JAG = 0.4; 
const SHIP_EXPLODE_DUR = 0.3; 
const SHIP_INV_DUR = 3; 
const SHIP_BLINK_DUR = 0.1; 

// Game State
let level, lives, roids, score, scoreHigh, ship, text, textAlpha;
let particles = [];
let isGameOver = false;
let isPaused = true;

// Input State
const input = {
    left: false,
    right: false,
    thrust: false,
    shoot: false
};

/**
 * AUDIO SYSTEM (Synthesizer)
 */
const AudioSys = {
    ctx: null,
    init: function() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },
    shoot: function() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.type = 'square';
        osc.frequency.setValueAtTime(1200, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, this.ctx.currentTime + 0.1);
        
        gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
        
        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    },
    explode: function() {
        if (!this.ctx) return;
        const bufferSize = this.ctx.sampleRate * 0.5; // 0.5 seconds
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = this.ctx.createGain();
        
        // Lowpass filter to make it sound like an explosion
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1000;

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);
        
        noise.start();
    },
    thrust: function(active) {
        // Continuous thrust sound optional
    }
};

/**
 * GAME LOGIC
 */

function createShip() {
    return {
        x: canvas.width / 2,
        y: canvas.height / 2,
        a: 90 / 180 * Math.PI, 
        r: SHIP_SIZE / 2,
        blinkNum: Math.ceil(SHIP_INV_DUR / SHIP_BLINK_DUR),
        blinkTime: Math.ceil(SHIP_BLINK_DUR * FPS),
        canShoot: true,
        dead: false,
        explodeTime: 0,
        lasers: [],
        rot: 0,
        thrusting: false,
        thrust: { x: 0, y: 0 }
    };
}

function createAsteroid(x, y, r) {
    let lvlMult = 1 + 0.1 * level;
    return {
        x: x,
        y: y,
        xv: Math.random() * ROIDS_SPD * lvlMult / FPS * (Math.random() < 0.5 ? 1 : -1),
        yv: Math.random() * ROIDS_SPD * lvlMult / FPS * (Math.random() < 0.5 ? 1 : -1),
        r: r,
        a: Math.random() * Math.PI * 2,
        vert: Math.floor(Math.random() * (ROIDS_VERT + 1) + ROIDS_VERT / 2),
        offs: []
    };
}

function newGame() {
    level = 0;
    lives = 3;
    score = 0;
    ship = createShip();
    newLevel();
}

function newLevel() {
    text = "LEVEL " + (level + 1);
    textAlpha = 1.0;
    createAsteroidBelt();
}

function createAsteroidBelt() {
    roids = [];
    let x, y;
    for (let i = 0; i < ROIDS_NUM + level; i++) {
        do {
            x = Math.floor(Math.random() * canvas.width);
            y = Math.floor(Math.random() * canvas.height);
        } while (distBetweenPoints(ship.x, ship.y, x, y) < ROIDS_SIZE * 2 + ship.r);
        roids.push(createAsteroid(x, y, Math.ceil(ROIDS_SIZE / 2)));
    }
}

function distBetweenPoints(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

function shootLaser() {
    if (ship.canShoot && ship.lasers.length < LASER_MAX) {
        ship.lasers.push({ 
            x: ship.x + 4 / 3 * ship.r * Math.cos(ship.a),
            y: ship.y - 4 / 3 * ship.r * Math.sin(ship.a),
            xv: LASER_SPD * Math.cos(ship.a) / FPS,
            yv: -LASER_SPD * Math.sin(ship.a) / FPS,
            dist: 0,
            explodeTime: 0
        });
        AudioSys.shoot();
    }
    ship.canShoot = false;
}

function explodeShip() {
    ship.explodeTime = Math.ceil(SHIP_EXPLODE_DUR * FPS);
    AudioSys.explode();
    createParticles(ship.x, ship.y, 20, '#00ff00');
}

function createParticles(x, y, amount, color) {
    for(let i=0; i<amount; i++) {
        particles.push({
            x: x,
            y: y,
            xv: (Math.random() - 0.5) * (Math.random() * 10),
            yv: (Math.random() - 0.5) * (Math.random() * 10),
            life: 1.0,
            color: color
        });
    }
}

function destroyAsteroid(index) {
    let x = roids[index].x;
    let y = roids[index].y;
    let r = roids[index].r;

    if (r == Math.ceil(ROIDS_SIZE / 2)) { 
        roids.push(createAsteroid(x, y, Math.ceil(ROIDS_SIZE / 4)));
        roids.push(createAsteroid(x, y, Math.ceil(ROIDS_SIZE / 4)));
        score += 20;
    } else if (r == Math.ceil(ROIDS_SIZE / 4)) { 
        roids.push(createAsteroid(x, y, Math.ceil(ROIDS_SIZE / 8)));
        roids.push(createAsteroid(x, y, Math.ceil(ROIDS_SIZE / 8)));
        score += 50;
    } else {
        score += 100;
    }

    roids.splice(index, 1);
    AudioSys.explode();
    createParticles(x, y, 10, '#fff');

    if (roids.length === 0) {
        level++;
        newLevel();
    }
}

function update() {
    let blinkOn = ship.blinkNum % 2 == 0;
    let exploding = ship.explodeTime > 0;

    if (!exploding) {
        if (input.left) {
            ship.a += TURN_SPEED / 180 * Math.PI / FPS;
        }
        if (input.right) {
            ship.a -= TURN_SPEED / 180 * Math.PI / FPS;
        }
        if (input.thrust) {
            ship.thrust.x += SHIP_THRUST * Math.cos(ship.a) / FPS;
            ship.thrust.y -= SHIP_THRUST * Math.sin(ship.a) / FPS;
            AudioSys.thrust(true);
        } else {
            ship.thrust.x -= FRICTION * ship.thrust.x / FPS;
            ship.thrust.y -= FRICTION * ship.thrust.y / FPS;
            AudioSys.thrust(false);
        }
        
        ship.x += ship.thrust.x;
        ship.y += ship.thrust.y;

        if (ship.x < 0 - ship.r) ship.x = canvas.width + ship.r;
        else if (ship.x > canvas.width + ship.r) ship.x = 0 - ship.r;
        if (ship.y < 0 - ship.r) ship.y = canvas.height + ship.r;
        else if (ship.y > canvas.height + ship.r) ship.y = 0 - ship.r;
    }

    if (input.shoot) {
        shootLaser();
    } else {
        ship.canShoot = true; 
    }

    for (let i = ship.lasers.length - 1; i >= 0; i--) {
        ship.lasers[i].x += ship.lasers[i].xv;
        ship.lasers[i].y += ship.lasers[i].yv;

        ship.lasers[i].dist += Math.sqrt(Math.pow(ship.lasers[i].xv, 2) + Math.pow(ship.lasers[i].yv, 2));

        if (ship.lasers[i].x < 0) ship.lasers[i].x = canvas.width;
        else if (ship.lasers[i].x > canvas.width) ship.lasers[i].x = 0;
        if (ship.lasers[i].y < 0) ship.lasers[i].y = canvas.height;
        else if (ship.lasers[i].y > canvas.height) ship.lasers[i].y = 0;

        if (ship.lasers[i].dist > canvas.width * LASER_DIST) {
            ship.lasers.splice(i, 1);
            continue;
        }
    }

    for (let i = 0; i < roids.length; i++) {
        roids[i].x += roids[i].xv;
        roids[i].y += roids[i].yv;
        if (roids[i].x < 0 - roids[i].r) roids[i].x = canvas.width + roids[i].r;
        else if (roids[i].x > canvas.width + roids[i].r) roids[i].x = 0 - roids[i].r;
        if (roids[i].y < 0 - roids[i].r) roids[i].y = canvas.height + roids[i].r;
        else if (roids[i].y > canvas.height + roids[i].r) roids[i].y = 0 - roids[i].r;
    }

    let ax, ay, ar, lx, ly;
    for (let i = roids.length - 1; i >= 0; i--) {
        ax = roids[i].x;
        ay = roids[i].y;
        ar = roids[i].r;
        for (let j = ship.lasers.length - 1; j >= 0; j--) {
            lx = ship.lasers[j].x;
            ly = ship.lasers[j].y;

            if (distBetweenPoints(ax, ay, lx, ly) < ar) {
                ship.lasers.splice(j, 1);
                destroyAsteroid(i);
                break;
            }
        }
    }

    if (!exploding) {
        if (ship.blinkNum == 0 && !ship.dead) { 
            for (let i = 0; i < roids.length; i++) {
                if (distBetweenPoints(ship.x, ship.y, roids[i].x, roids[i].y) < ship.r + roids[i].r) {
                    explodeShip();
                    destroyAsteroid(i);
                    break;
                }
            }
        }
    } else {
        ship.explodeTime--;
        if (ship.explodeTime == 0) {
            lives--;
            if (lives == 0) {
                isGameOver = true;
                document.getElementById('start-btn').innerText = "GAME OVER - CLICK TO RESTART";
                document.getElementById('start-screen').style.display = "block";
                isPaused = true;
            } else {
                ship = createShip(); 
            }
        }
    }

    if (ship.blinkNum > 0) {
        ship.blinkTime--;
        if (ship.blinkTime == 0) {
            ship.blinkTime = Math.ceil(SHIP_BLINK_DUR * FPS);
            ship.blinkNum--;
        }
    }

    document.getElementById('score').innerText = score;
    document.getElementById('lives').innerText = lives;
    document.getElementById('level').innerText = level + 1;
}

function draw() {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let exploding = ship.explodeTime > 0;
    let blinkOn = ship.blinkNum % 2 == 0;

    if (!exploding) {
        if (blinkOn && !ship.dead) {
            ctx.strokeStyle = '#0f0';
            ctx.lineWidth = 2; 
            ctx.beginPath();
            ctx.moveTo(
                ship.x + 4 / 3 * ship.r * Math.cos(ship.a),
                ship.y - 4 / 3 * ship.r * Math.sin(ship.a)
            );
            ctx.lineTo(
                ship.x - ship.r * (2 / 3 * Math.cos(ship.a) + Math.sin(ship.a)),
                ship.y + ship.r * (2 / 3 * Math.sin(ship.a) - Math.cos(ship.a))
            );
            ctx.lineTo(
                ship.x - ship.r * (2 / 3 * Math.cos(ship.a) - Math.sin(ship.a)),
                ship.y + ship.r * (2 / 3 * Math.sin(ship.a) + Math.cos(ship.a))
            );
            ctx.closePath();
            ctx.stroke();

            if (input.thrust) {
                ctx.strokeStyle = '#f00'; 
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(
                    ship.x - ship.r * (2 / 3 * Math.cos(ship.a) + 0.5 * Math.sin(ship.a)),
                    ship.y + ship.r * (2 / 3 * Math.sin(ship.a) - 0.5 * Math.cos(ship.a))
                );
                ctx.lineTo(
                    ship.x - ship.r * 5 / 3 * Math.cos(ship.a),
                    ship.y + ship.r * 5 / 3 * Math.sin(ship.a)
                );
                ctx.lineTo(
                    ship.x - ship.r * (2 / 3 * Math.cos(ship.a) - 0.5 * Math.sin(ship.a)),
                    ship.y + ship.r * (2 / 3 * Math.sin(ship.a) + 0.5 * Math.cos(ship.a))
                );
                ctx.stroke();
            }
        }
    }

    for (let i = 0; i < ship.lasers.length; i++) {
        ctx.fillStyle = '#ff0'; 
        ctx.beginPath();
        ctx.arc(ship.lasers[i].x, ship.lasers[i].y, SHIP_SIZE / 10, 0, Math.PI * 2, false);
        ctx.fill();
    }

    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff'; 
    for (let i = 0; i < roids.length; i++) {
        let x = roids[i].x;
        let y = roids[i].y;
        let r = roids[i].r;
        
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(roids[i].a + (x / 100)); 
        ctx.beginPath();
        ctx.rect(-r, -r, r*2, r*2);
        ctx.stroke();
        ctx.restore();
    }

    for(let i=particles.length-1; i>=0; i--) {
        let p = particles[i];
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.fillRect(p.x, p.y, 3, 3);
        p.x += p.xv;
        p.y += p.yv;
        p.life -= 0.05;
        if(p.life <= 0) particles.splice(i, 1);
    }
    ctx.globalAlpha = 1.0;

    if (textAlpha >= 0) {
        ctx.fillStyle = "rgba(0, 255, 0, " + textAlpha + ")";
        ctx.font = "30px 'Press Start 2P'";
        ctx.textAlign = "center";
        ctx.fillText(text, canvas.width / 2, canvas.height * 0.75);
        textAlpha -= (1.0 / SHIP_INV_DUR / FPS);
    }
}

/**
 * INITIALIZATION & INPUT
 */

function loop() {
    if (!isPaused) {
        update();
        draw();
    }
    requestAnimationFrame(loop);
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

document.getElementById('start-screen').addEventListener('click', () => {
    AudioSys.init(); 
    if (isPaused || isGameOver) {
        document.getElementById('start-screen').style.display = "none";
        newGame();
        isPaused = false;
        isGameOver = false;
        loop();
    }
});

function keyDown(ev) {
    if (isPaused) return;
    switch(ev.keyCode) {
        case 32: 
            input.shoot = true;
            break;
        case 37: 
            input.left = true;
            break;
        case 38: 
            input.thrust = true;
            break;
        case 39: 
            input.right = true;
            break;
    }
}

function keyUp(ev) {
    if (isPaused) return;
    switch(ev.keyCode) {
        case 32: input.shoot = false; break;
        case 37: input.left = false; break;
        case 38: input.thrust = false; break;
        case 39: input.right = false; break;
    }
}

window.addEventListener('keydown', keyDown);
window.addEventListener('keyup', keyUp);

function setupTouch(btnId, key) {
    const btn = document.getElementById(btnId);
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); input[key] = true; }, {passive: false});
    btn.addEventListener('touchend', (e) => { e.preventDefault(); input[key] = false; }, {passive: false});
    btn.addEventListener('mousedown', (e) => { input[key] = true; }); 
    btn.addEventListener('mouseup', (e) => { input[key] = false; });
}

setupTouch('btn-left', 'left');
setupTouch('btn-right', 'right');
setupTouch('btn-thrust', 'thrust');
setupTouch('btn-shoot', 'shoot');

ctx.fillStyle = "#000";
ctx.fillRect(0, 0, canvas.width, canvas.height);