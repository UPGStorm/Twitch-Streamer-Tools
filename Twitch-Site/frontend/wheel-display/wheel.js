const canvas = document.getElementById('wheelCanvas');
const ctx = canvas.getContext('2d');
const socket = io();

// Get the key from the URL
const urlParams = new URLSearchParams(window.location.search);
const wheelKey = urlParams.get('key');

let categories = [];
let angle = 0;

// Colour palette — matches admin.js colours
const COLOURS = [
    '#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c',
    '#3498db','#9b59b6','#e91e63','#00bcd4','#8bc34a',
    '#ff5722','#607d8b','#ff9800','#673ab7','#009688'
];

function getColour(index) {
    return COLOURS[index % COLOURS.length];
}

// Load categories from the public endpoint using the wheel key
async function loadCategories() {
    if (!wheelKey) {
        console.error('No wheel key in URL');
        return;
    }
    try {
        const res = await fetch(`/api/categories/public?key=${wheelKey}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        categories = await res.json();
        drawWheel();
    } catch (err) {
        console.error('Failed to load categories:', err);
    }
}

function drawWheel() {
    ctx.clearRect(0, 0, 500, 500);
    if (categories.length === 0) return;

    const total = categories.reduce((sum, c) => sum + c.weight, 0);
    let startAngle = 0;

    categories.forEach((cat, i) => {
        const slice = (cat.weight / total) * 2 * Math.PI;

        ctx.beginPath();
        ctx.fillStyle = getColour(i);
        ctx.moveTo(250, 250);
        ctx.arc(250, 250, 250, startAngle, startAngle + slice);
        ctx.fill();

        // Label
        ctx.save();
        ctx.translate(250, 250);
        ctx.rotate(startAngle + slice / 2);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'right';
        ctx.font = 'bold 16px Arial';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 4;
        ctx.fillText(cat.label, 235, 6);
        ctx.restore();

        startAngle += slice;
    });

    // Center circle
    ctx.beginPath();
    ctx.arc(250, 250, 20, 0, 2 * Math.PI);
    ctx.fillStyle = '#1e1e2f';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
}

function drawRotatedWheel() {
    ctx.clearRect(0, 0, 500, 500);
    ctx.save();
    ctx.translate(250, 250);
    ctx.rotate(angle);
    ctx.translate(-250, -250);
    drawWheel();
    ctx.restore();
}

function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

function spinToWinner(winnerLabel) {
    if (categories.length === 0) return;

    const total = categories.reduce((sum, c) => sum + c.weight, 0);
    let startAngle = 0;
    let targetMid = 0;

    for (const cat of categories) {
        const slice = (cat.weight / total) * 2 * Math.PI;
        if (cat.label === winnerLabel) {
            targetMid = startAngle + slice / 2;
            break;
        }
        startAngle += slice;
    }

    // We want targetMid to end up at the top (pointing to the pointer)
    const finalAngle = (Math.PI * 2 * 5) + (Math.PI * 1.5 - targetMid);
    const duration = 4000;
    const start = performance.now();
    const startingAngle = angle;

    function animate(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        angle = startingAngle + finalAngle * easeOutCubic(progress);
        drawRotatedWheel();
        if (progress < 1) requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
}

// Join the user's socket room using the wheel key
socket.emit('join', wheelKey);

// Listen for live category updates
socket.on('categories', (cats) => {
    // Merge in new/updated categories
    cats.forEach(cat => {
        const existing = categories.findIndex(c => c._id === cat._id);
        if (existing >= 0) {
            categories[existing] = cat;
        } else {
            categories.push(cat);
        }
    });
    drawWheel();
});

socket.on('category-updated', (cat) => {
    const i = categories.findIndex(c => c._id === cat._id);
    if (i >= 0) categories[i] = cat;
    drawWheel();
});

socket.on('category-deleted', ({ id }) => {
    categories = categories.filter(c => c._id !== id);
    drawWheel();
});

// Listen for spin trigger
socket.on('spin', (data) => {
    if (data.winner) spinToWinner(data.winner);
});

// Init
loadCategories();
