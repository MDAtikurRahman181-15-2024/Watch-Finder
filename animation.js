// --- START: FAITHFUL RECREATION OF ANIMATION ---

// 1. Fluid Simulation Script (2D Canvas Fallback)
(function fluidAnimation() {
    const canvas = document.getElementById('fluid-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;
    let pointers = [{x: width/2, y: height/2, down: false, moved: false, color: [255, 0, 255]}];
    let particles = [];

    class Particle {
        constructor(x, y, hue) {
            this.x = x; this.y = y; this.hue = hue;
            this.size = Math.random() * 3 + 1; this.life = 1;
            this.vx = (Math.random() - 0.5) * 4; this.vy = (Math.random() - 0.5) * 4;
        }
        update() {
            this.x += this.vx; this.y += this.vy;
            this.life -= 0.02; this.vx *= 0.98; this.vy *= 0.98;
            if (this.size > 0.2) this.size -= 0.1;
        }
        draw() {
            ctx.fillStyle = `hsla(${this.hue}, 100%, 70%, ${this.life})`;
            ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill();
        }
    }

    function animate() {
        ctx.fillStyle = 'rgba(17, 17, 17, 0.1)';
        ctx.fillRect(0, 0, width, height);

        pointers.forEach(p => {
            if (p.moved) {
                const hue = (Date.now() / 20) % 360;
                for (let i = 0; i < 5; i++) {
                    particles.push(new Particle(p.x, p.y, hue));
                }
                p.moved = false;
            }
        });

        for (let i = particles.length - 1; i >= 0; i--) {
            particles[i].update();
            particles[i].draw();
            if (particles[i].life <= 0) particles.splice(i, 1);
        }

        requestAnimationFrame(animate);
    }

    // Mouse listener (existing)
    window.addEventListener('mousemove', e => {
        pointers[0].x = e.clientX;
        pointers[0].y = e.clientY;
        pointers[0].moved = true;
    });

    // Touch listeners for fluid background
    window.addEventListener('touchmove', e => {
        if (!document.body.classList.contains('results-visible')) {
            e.preventDefault(); 
        }
        if (e.touches[0]) {
            pointers[0].x = e.touches[0].clientX;
            pointers[0].y = e.touches[0].clientY;
            pointers[0].moved = true;
        }
    });
     window.addEventListener('touchstart', e => {
        if (e.touches[0]) {
            pointers[0].x = e.touches[0].clientX;
            pointers[0].y = e.touches[0].clientY;
            pointers[0].moved = true;
        }
    });


    window.addEventListener('resize', () => {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    });
    animate();
})();

// 2. Oneko.js (Chasing Cat) Script
(function oneko() {
    const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (isReducedMotion) return;

    const nekoEl = document.createElement('div');
    let nekoPosX = 32;
    let nekoPosY = 32;
    let mousePosX = 0;
    let mousePosY = 0;
    let frameCount = 0;
    let idleTime = 0;
    let idleAnimation = null;
    let idleAnimationFrame = 0;
    const nekoSpeed = 10;

    const spriteSets = {
        idle: [[-3, -3]],
        alert: [[-7, -3]],
        scratchSelf: [[-5, 0], [-6, 0], [-7, 0]],
        scratchWallN: [[0, 0], [0, -1]],
        scratchWallS: [[-7, -1], [-6, -2]],
        scratchWallE: [[-2, -2], [-2, -3]],
        scratchWallW: [[-4, 0], [-4, -1]],
        tired: [[-3, -2]],
        sleeping: [[-2, 0], [-2, -1]],
        N: [[-1, -2], [-1, -3]],
        NE: [[0, -2], [0, -3]],
        E: [[-3, 0], [-3, -1]],
        SE: [[-5, -1], [-5, -2]],
        S: [[-6, -3], [-7, -2]],
        SW: [[-5, -3], [-6, -1]],
        W: [[-4, -2], [-4, -3]],
        NW: [[-1, 0], [-1, -1]],
    };

    function init() {
        nekoEl.id = 'oneko';
        nekoEl.ariaHidden = 'true';
        nekoEl.style.width = '32px';
        nekoEl.style.height = '32px';
        nekoEl.style.position = 'fixed';
        nekoEl.style.pointerEvents = 'none';
        nekoEl.style.imageRendering = 'pixelated';
        nekoEl.style.left = `${nekoPosX - 16}px`;
        nekoEl.style.top = `${nekoPosY - 16}px`;
        nekoEl.style.zIndex = '999999';

        // --- MODIFIED: Use local file path ---
        const onekoSpriteUrl = "oneko.gif";
        nekoEl.style.backgroundImage = `url('${onekoSpriteUrl}')`;

        document.body.appendChild(nekoEl);

        document.addEventListener('mousemove', (event) => {
            mousePosX = event.clientX;
            mousePosY = event.clientY;
        });
        document.addEventListener('touchmove', (event) => {
            if (event.touches[0]) {
                mousePosX = event.touches[0].clientX;
                mousePosY = event.touches[0].clientY;
            }
        });
        document.addEventListener('touchstart', (event) => {
            if (event.touches[0]) {
               mousePosX = event.touches[0].clientX;
               mousePosY = event.touches[0].clientY;
           }
       });

        window.requestAnimationFrame(onAnimationFrame);
    }

    let lastFrameTimestamp;

    function onAnimationFrame(timestamp) {
        if (!nekoEl.isConnected) return;
        if (!lastFrameTimestamp) lastFrameTimestamp = timestamp;
        if (timestamp - lastFrameTimestamp > 100) {
            lastFrameTimestamp = timestamp;
            frame();
        }
        window.requestAnimationFrame(onAnimationFrame);
    }

    function setSprite(name, frame) {
        const sprite = spriteSets[name][frame % spriteSets[name].length];
        nekoEl.style.backgroundPosition = `${sprite[0] * 32}px ${sprite[1] * 32}px`;
    }

    function resetIdleAnimation() {
        idleAnimation = null;
        idleAnimationFrame = 0;
    }

    function idle() {
        idleTime += 1;
        if (idleTime > 10 && Math.floor(Math.random() * 200) === 0 && idleAnimation == null) {
            let availableIdleAnimations = ['sleeping', 'scratchSelf'];
            if (nekoPosX < 32) availableIdleAnimations.push('scratchWallW');
            if (nekoPosY < 32) availableIdleAnimations.push('scratchWallN');
            if (nekoPosX > window.innerWidth - 32) availableIdleAnimations.push('scratchWallE');
            if (nekoPosY > window.innerHeight - 32) availableIdleAnimations.push('scratchWallS');
            idleAnimation = availableIdleAnimations[Math.floor(Math.random() * availableIdleAnimations.length)];
        }

        switch (idleAnimation) {
            case 'sleeping':
                if (idleAnimationFrame < 8) {
                    setSprite('tired', 0);
                    break;
                }
                setSprite('sleeping', Math.floor(idleAnimationFrame / 4));
                if (idleAnimationFrame > 192) resetIdleAnimation();
                break;
            case 'scratchWallN':
            case 'scratchWallS':
            case 'scratchWallE':
            case 'scratchWallW':
            case 'scratchSelf':
                setSprite(idleAnimation, idleAnimationFrame);
                if (idleAnimationFrame > 9) resetIdleAnimation();
                break;
            default:
                setSprite('idle', 0);
                return;
        }
        idleAnimationFrame += 1;
    }

    function frame() {
        frameCount += 1;
        const diffX = nekoPosX - mousePosX;
        const diffY = nekoPosY - mousePosY;
        const distance = Math.sqrt(diffX ** 2 + diffY ** 2);

        if (distance < nekoSpeed || distance < 48) {
            idle();
            return;
        }

        idleAnimation = null;
        idleAnimationFrame = 0;

        if (idleTime > 1) {
            setSprite('alert', 0);
            idleTime = Math.min(idleTime, 7);
            idleTime -= 1;
            return;
        }

        let direction = diffY / distance > 0.5 ? 'N' : '';
        direction += diffY / distance < -0.5 ? 'S' : '';
        direction += diffX / distance > 0.5 ? 'W' : '';
        direction += diffX / distance < -0.5 ? 'E' : '';
        setSprite(direction, frameCount);

        nekoPosX -= (diffX / distance) * nekoSpeed;
        nekoPosY -= (diffY / distance) * nekoSpeed;
        
        nekoPosX = Math.min(Math.max(16, nekoPosX), window.innerWidth - 16);
        nekoPosY = Math.min(Math.max(16, nekoPosY), window.innerHeight - 16);

        nekoEl.style.left = `${nekoPosX - 16}px`;
        nekoEl.style.top = `${nekoPosY - 16}px`;
    }

    document.addEventListener('DOMContentLoaded', init);
})();

