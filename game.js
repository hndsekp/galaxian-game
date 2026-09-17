// =========================================================
// GALAXIAN - game.js (VERSI FINAL)
// =========================================================

// ---------- 1. SETUP CANVAS ----------
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const GAME_WIDTH = canvas.width;
const GAME_HEIGHT = canvas.height;
const PLAYER_SPEED = 4;

// ---------- 2. AMBIL ELEMEN HTML ----------
const scoreDisplay = document.getElementById('score-display');
const waveDisplay = document.getElementById('wave-display');
const hiDisplay = document.getElementById('hi-display');
const livesDisplay = document.getElementById('lives-display');

const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlaySubtitle = document.getElementById('overlay-subtitle');
const overlayText = document.getElementById('overlay-text');
const startBtn = document.getElementById('start-btn');

const btnLeft = document.getElementById('btn-left');
const btnRight = document.getElementById('btn-right');
const btnFire = document.getElementById('btn-fire');

// ---------- 3. STATE GLOBAL ----------
let gameState = 'START'; // 'START', 'PLAYING', 'GAMEOVER'
let player;
let aliens = [];
let playerBullets = [];
let alienBullets = [];
let score = 0;
let lives = 3;
let wave = 1;
let diveTimer = 120;
let formationDirection = 1;
let formationSpeed = 0.6;
let formationDescendSpeed = 0.05; // seberapa cepat SELURUH BARISAN turun ke bawah, makin besar tiap wave

let highScore = parseInt(localStorage.getItem('galaxian_hi')) || 0;

// Input gabungan dari keyboard DAN tombol HUD (mouse/touch) -> dibaca Player.update()
const inputState = {
    left: false,
    right: false,
    fire: false
};

// ---------- 4. BINTANG BACKGROUND ----------
const stars = [];
const NUM_STARS = 60;

function initStars() {
    stars.length = 0;
    for (let i = 0; i < NUM_STARS; i++) {
        stars.push({
            x: Math.random() * GAME_WIDTH,
            y: Math.random() * GAME_HEIGHT,
            speed: Math.random() * 0.8 + 0.2,
            size: Math.random() < 0.3 ? 2 : 1
        });
    }
}

function updateStars() {
    for (let star of stars) {
        star.y += star.speed;
        if (star.y > GAME_HEIGHT) {
            star.y = 0;
            star.x = Math.random() * GAME_WIDTH;
        }
    }
}

function drawStars() {
    ctx.fillStyle = '#ffffff';
    for (let star of stars) {
        ctx.globalAlpha = 0.5 + star.speed * 0.3;
        ctx.fillRect(star.x, star.y, star.size, star.size);
    }
    ctx.globalAlpha = 1.0;
}

// ---------- 5. CLASS BULLET ----------
class Bullet {
    constructor(x, y, speedY, color) {
        this.x = x;
        this.y = y;
        this.width = 4;
        this.height = 10;
        this.speedY = speedY;
        this.color = color;
        this.active = true;
    }

    update() {
        this.y += this.speedY;
        if (this.y < -20 || this.y > GAME_HEIGHT + 20) {
            this.active = false;
        }
    }

    draw(ctx) {
        if (!this.active) return;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }
}

function updateBullets(bullets) {
    for (let bullet of bullets) {
        bullet.update();
    }
    for (let i = bullets.length - 1; i >= 0; i--) {
        if (!bullets[i].active) {
            bullets.splice(i, 1);
        }
    }
}

function drawBullets(bullets) {
    for (let bullet of bullets) {
        bullet.draw(ctx);
    }
}

// ---------- 6. CLASS PLAYER ----------
class Player {
    constructor() {
        this.width = 40;
        this.height = 20;
        this.x = GAME_WIDTH / 2 - this.width / 2;
        this.y = GAME_HEIGHT - 60;
        this.speed = PLAYER_SPEED;
        this.cooldown = 0;
        this.invincible = 0;
    }

    update(inputState) {
        if (inputState.left && this.x > 0) {
            this.x -= this.speed;
        }
        if (inputState.right && this.x < GAME_WIDTH - this.width) {
            this.x += this.speed;
        }

        if (this.cooldown > 0) this.cooldown--;
        if (this.invincible > 0) this.invincible--;
    }

    draw(ctx) {
        if (this.invincible > 0 && Math.floor(this.invincible / 4) % 2 === 0) {
            return;
        }

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(this.x, this.y + 10, this.width, 10);
        ctx.fillRect(this.x + 15, this.y, 10, 10);
        ctx.fillRect(this.x + 18, this.y - 5, 4, 5);

        ctx.fillStyle = '#00ffff';
        ctx.fillRect(this.x - 3, this.y + 15, 6, 5);
        ctx.fillRect(this.x + this.width - 3, this.y + 15, 6, 5);
    }

    shoot(playerBullets) {
        if (this.cooldown <= 0) {
            playerBullets.push(new Bullet(this.x + this.width / 2 - 2, this.y, -8, '#ffff00'));
            this.cooldown = 18;
            playSound(880, 'square', 0.08, 0.05);
        }
    }
}

// ---------- 7. CLASS ALIEN (FSM) ----------
const ALIEN_STATES = {
    FORMATION: 'FORMATION',
    DIVE_OUT: 'DIVE_OUT',
    DIVE_ATTACK: 'DIVE_ATTACK',
    RETURNING: 'RETURNING'
};

class Alien {
    constructor(homeX, homeY, type, row, col) {
        this.homeX = homeX;
        this.homeY = homeY;
        this.x = homeX;
        this.y = homeY;
        this.width = 30;
        this.height = 22;
        this.type = type;
        this.row = row;
        this.col = col;
        this.alive = true;

        this.state = ALIEN_STATES.FORMATION;
        this.diveProgress = 0;
        this.startX = homeX;
        this.startY = homeY;
        this.hasShot = false;
    }

    update() {
        if (!this.alive) return;

        if (this.state === ALIEN_STATES.DIVE_OUT || this.state === ALIEN_STATES.DIVE_ATTACK) {
            this.updateDive();
        }
        else if (this.state === ALIEN_STATES.RETURNING) {
            this.updateReturn();
        }
        // Kalau FORMATION, posisinya diatur oleh updateFormation()
    }

    updateDive() {
        this.diveProgress += 0.012;

        if (this.state === ALIEN_STATES.DIVE_OUT) {
            if (this.diveProgress < 0.15) {
                this.y = this.startY - this.diveProgress * 100;
            } else {
                this.state = ALIEN_STATES.DIVE_ATTACK;
                this.diveProgress = 0;
                this.startX = this.x;
                this.startY = this.y;
                this.hasShot = false;
            }
        }
        else if (this.state === ALIEN_STATES.DIVE_ATTACK) {
            const t = this.diveProgress;
            const amplitude = 80;
            this.x = this.startX + Math.sin(t * Math.PI * 2) * amplitude * (1 - t);
            this.y = this.startY + (GAME_HEIGHT + 50 - this.startY) * (t * t);

            if (!this.hasShot && t > 0.4 && t < 0.6) {
                alienBullets.push(new Bullet(this.x + this.width / 2, this.y + this.height, 5, '#ff0055'));
                this.hasShot = true;
            }

            if (this.y > GAME_HEIGHT + 30) {
                this.state = ALIEN_STATES.RETURNING;
                this.diveProgress = 0;
                this.y = -30;
                this.x = this.homeX;
            }
        }
    }

    updateReturn() {
        this.diveProgress += 0.02;
        const t = Math.min(this.diveProgress, 1);
        this.y = -30 + (this.homeY - (-30)) * t;
        this.x = this.homeX;

        if (t >= 1) {
            this.state = ALIEN_STATES.FORMATION;
            this.diveProgress = 0;
        }
    }

    draw(ctx) {
        if (!this.alive) return;
        const colors = ['#ff0055', '#00ffff', '#00ff00'];
        ctx.fillStyle = colors[this.type];
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }
}

function updateFormation() {
    let hitEdge = false;

    for (let alien of aliens) {
        if (alien.alive && alien.state === ALIEN_STATES.FORMATION) {
            const nextX = alien.homeX + formationDirection * formationSpeed * 10;
            if (nextX < 10 || nextX > GAME_WIDTH - alien.width - 10) {
                hitEdge = true;
            }
        }
    }

    if (hitEdge) {
        formationDirection *= -1;
    }

    for (let alien of aliens) {
        if (alien.alive && alien.state === ALIEN_STATES.FORMATION) {
            alien.homeX += formationDirection * formationSpeed;
            alien.homeY += formationDescendSpeed; // formasi turun pelan-pelan tiap frame
            alien.x = alien.homeX;
            alien.y = alien.homeY;
        }
    }
}

// ---------- 8. COLLISION DETECTION ----------
function isColliding(rect1, rect2) {
    return (
        rect1.x < rect2.x + rect2.width &&
        rect1.x + rect1.width > rect2.x &&
        rect1.y < rect2.y + rect2.height &&
        rect1.y + rect1.height > rect2.y
    );
}

function checkCollisions() {
    // Peluru player vs alien
    for (let i = playerBullets.length - 1; i >= 0; i--) {
        let bullet = playerBullets[i];
        if (!bullet.active) continue;

        for (let j = aliens.length - 1; j >= 0; j--) {
            let alien = aliens[j];
            if (alien.alive && bullet.active && isColliding(bullet, alien)) {
                alien.alive = false;
                bullet.active = false;
                score += 100;
                updateHUD();
                playSound(150, 'sawtooth', 0.2, 0.1);
                break;
            }
        }
    }

    // Peluru alien / badan alien vs player
    if (player.invincible <= 0) {
        for (let i = alienBullets.length - 1; i >= 0; i--) {
            let bullet = alienBullets[i];
            if (bullet.active && isColliding(bullet, player)) {
                bullet.active = false;
                playerHit();
                break;
            }
        }

        for (let alien of aliens) {
            if (alien.alive && isColliding(alien, player)) {
                alien.alive = false;
                playerHit();
                break;
            }
        }
    }
}

// FITUR: auto kalah kalau BARISAN FORMASI (bukan alien yang sedang menukik/
// dive-attack) sudah turun sampai sejajar dengan baris player.
// Alien yang sedang DIVE_OUT / DIVE_ATTACK / RETURNING sengaja TIDAK dicek di
// sini, karena mereka bergerak sendiri menjauh dari formasi dan seharusnya
// hanya bisa mengalahkan lewat tabrakan/peluru (lihat checkCollisions).
function checkFormationReachedPlayerLine() {
    for (let alien of aliens) {
        if (alien.alive &&
            alien.state === ALIEN_STATES.FORMATION &&
            alien.y + alien.height >= player.y) {
            gameOver();
            return;
        }
    }
}

function playerHit() {
    lives--;
    updateHUD();

    if (lives <= 0) {
        gameOver();
    } else {
        player.invincible = 120;
    }
}

// ---------- 9. TRIGGER SERANGAN ALIEN (DIVE) ----------
function triggerAlienDive() {
    diveTimer--;
    if (diveTimer <= 0) {
        const candidates = aliens.filter(a => a.alive && a.state === ALIEN_STATES.FORMATION);

        if (candidates.length > 0) {
            const randomAlien = candidates[Math.floor(Math.random() * candidates.length)];
            randomAlien.state = ALIEN_STATES.DIVE_OUT;
            randomAlien.diveProgress = 0;
            randomAlien.startX = randomAlien.x;
            randomAlien.startY = randomAlien.y;
            randomAlien.hasShot = false;
        }

        diveTimer = Math.max(30, 120 - (wave * 10));
    }
}

// ---------- 10. AUDIO ----------
let audioCtx;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playSound(frequency, type, duration, volume = 0.1) {
    if (!audioCtx) return;

    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);

        gain.gain.setValueAtTime(volume, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
        console.log('Audio error:', e);
    }
}

// ---------- 11. HUD & HIGH SCORE ----------
function updateHUD() {
    scoreDisplay.textContent = 'SCORE: ' + String(score).padStart(4, '0');
    waveDisplay.textContent = 'WAVE: ' + wave;
    hiDisplay.textContent = 'HI: ' + String(highScore).padStart(4, '0');
    livesDisplay.textContent = '♥ ' + lives;
}

function saveHighScore() {
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('galaxian_hi', highScore.toString());
    }
}

// ---------- 12. INISIALISASI / RESTART GAME ----------
function spawnAliens() {
    aliens = [];
    const rows = 5;
    const cols = 8;
    const offsetX = 70;
    const offsetY = 60;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            let type = r === 0 ? 0 : (r < 3 ? 1 : 2);
            const homeX = offsetX + c * 45;
            const homeY = offsetY + r * 40;
            aliens.push(new Alien(homeX, homeY, type, r, c));
        }
    }
}

function initGame() {
    player = new Player();
    playerBullets = [];
    alienBullets = [];
    score = 0;
    lives = 3;
    wave = 1;
    diveTimer = 120;
    formationDirection = 1;
    formationSpeed = 0.6;
    formationDescendSpeed = 0.05;

    inputState.left = false;
    inputState.right = false;
    inputState.fire = false;

    spawnAliens();
    updateHUD();
}

function nextWave() {
    wave++;
    formationSpeed += 0.15;
    formationDescendSpeed += 0.025; // makin tinggi wave, formasi makin cepat turun -> makin menekan
    diveTimer = Math.max(30, 120 - (wave * 10));
    playerBullets = [];
    alienBullets = [];
    spawnAliens();
    updateHUD();
}

function gameOver() {
    if (gameState === 'GAMEOVER') return; // cegah double-trigger
    gameState = 'GAMEOVER';
    saveHighScore();
    updateHUD();
    showGameOverOverlay();
}

// ---------- 13. OVERLAY: START & GAME OVER ----------
function showStartOverlay() {
    overlay.classList.remove('gameover-state');
    overlayTitle.textContent = 'GALAXIAN';
    overlaySubtitle.textContent = 'CLASSIC ARCADE';
    overlayText.textContent = 'Tembak alien sebelum mereka mencapai Anda!';
    startBtn.textContent = 'START GAME';
    overlay.classList.remove('hidden');
}

function showGameOverOverlay() {
    overlay.classList.add('gameover-state');
    overlayTitle.textContent = 'GAME OVER';
    overlaySubtitle.textContent = 'WAVE ' + wave + ' - SKOR ' + score;
    overlayText.textContent = score >= highScore
        ? 'Rekor baru! Mantap!'
        : 'High Score: ' + highScore;
    startBtn.textContent = 'MAIN LAGI';
    overlay.classList.remove('hidden');
}

// ---------- 14. GAME LOOP UTAMA ----------
function gameLoop() {
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    updateStars();
    drawStars();

    if (gameState === 'PLAYING') {
        player.update(inputState);
        if (inputState.fire) player.shoot(playerBullets);

        updateFormation();
        triggerAlienDive();
        aliens.forEach(a => a.update());

        updateBullets(playerBullets);
        updateBullets(alienBullets);

        checkCollisions();
        checkFormationReachedPlayerLine(); // auto kalah kalau BARISAN FORMASI sejajar player

        if (gameState === 'PLAYING' && aliens.every(a => !a.alive)) {
            nextWave();
        }

        player.draw(ctx);
        aliens.forEach(a => a.draw(ctx));
        drawBullets(playerBullets);
        drawBullets(alienBullets);
    }

    requestAnimationFrame(gameLoop);
}

// ---------- 15. EVENT: TOMBOL START / MAIN LAGI (satu tombol, dua fungsi) ----------
startBtn.addEventListener('click', function () {
    initAudio();

    if (gameState === 'START' || gameState === 'GAMEOVER') {
        initGame();
        gameState = 'PLAYING';
        overlay.classList.add('hidden');
    }
});

// ---------- 16. EVENT: KEYBOARD ----------
window.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        inputState.left = true;
    }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        inputState.right = true;
    }
    if (e.key === ' ') {
        inputState.fire = true;
    }

    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
    }
});

window.addEventListener('keyup', function (e) {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        inputState.left = false;
    }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        inputState.right = false;
    }
    if (e.key === ' ') {
        inputState.fire = false;
    }
});

// ---------- 17. EVENT: TOMBOL HUD (MENDUKUNG MOUSE *DAN* TOUCH) ----------
// Pakai Pointer Events (pointerdown/up/cancel/leave) karena event ini
// otomatis berfungsi untuk mouse, touch, DAN stylus dalam satu kode yang sama.
// Sebelumnya cuma pakai touchstart/touchend, makanya klik mouse di desktop
// gak ngefek.
function setupControlButton(btn, stateKey) {
    const press = function (e) {
        e.preventDefault();
        inputState[stateKey] = true;
        btn.classList.add('active');
    };

    const release = function (e) {
        e.preventDefault();
        inputState[stateKey] = false;
        btn.classList.remove('active');
    };

    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointerleave', release);   // jaga-jaga jari/mouse geser keluar tombol
    btn.addEventListener('pointercancel', release);
}

setupControlButton(btnLeft, 'left');
setupControlButton(btnRight, 'right');
setupControlButton(btnFire, 'fire');

// ---------- 18. MULAI SEGALANYA ----------
initStars();
updateHUD();
showStartOverlay();
requestAnimationFrame(gameLoop);