import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import bodyParser from 'body-parser';
import Datastore from 'nedb';
import session from 'express-session';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import fs from 'fs';

import {
    ensureDefaultAdmin,
    findUser,
    findUserByWheelKey,
    updateUser,
    updateWheelKey,
    getAllUsers,
    createUser,
    deleteUser
} from './models/userModel.js';
import { registerSpinTrigger } from './wheel/wheelController.js';
import { connectEventSub } from './twitch/eventsub.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ====== SESSION ======
app.use(session({
    secret: 'super-secret-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// Body parser
app.use(bodyParser.json());

// ====== DATABASE (categories) ======
const dbFolder = path.join(__dirname, 'db');
if (!fs.existsSync(dbFolder)) fs.mkdirSync(dbFolder);

const db = new Datastore({
    filename: path.join(dbFolder, 'database.db'),
    autoload: true
});

// Ensure default admin exists
ensureDefaultAdmin();

// ====== AUTH MIDDLEWARE ======
function requireAuth(req, res, next) {
    if (req.session && req.session.authenticated) return next();
    res.redirect('/login.html');
}

// Admin-only middleware
async function requireAdmin(req, res, next) {
    if (!req.session || !req.session.authenticated) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
        const user = await findUser(req.session.username);
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        next();
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
}

// Helper: get current user's DB record (caches on req)
async function getCurrentUser(req) {
    if (req._currentUser) return req._currentUser;
    req._currentUser = await findUser(req.session.username);
    return req._currentUser;
}

// ====== STATIC FILES ======
app.use('/login.html', express.static(path.join(__dirname, '../frontend/login.html')));
app.use('/admin', requireAuth, express.static(path.join(__dirname, '../frontend/admin')));
app.use('/assets', express.static(path.join(__dirname, '../frontend/assets')));

// ====== WHEEL DISPLAY ======

// MUST be before the app.use wheel route — redirect trailing slash to clean URL
app.get('/wheel/mainWheel/', (req, res) => {
    const key = req.query.key;
    res.redirect(301, `/wheel/mainWheel${key ? `?key=${key}` : ''}`);
});

// Serve wheel only if key matches a user in users.db
app.use('/wheel/mainWheel', (req, res, next) => {
    const key = req.query.key;
    if (!key) return res.status(401).send('Missing key');
    findUserByWheelKey(key, (err, user) => {
        if (err || !user) return res.status(403).send('Invalid key');
        req.wheelUserId = user._id;
        next();
    });
}, express.static(path.join(__dirname, '../frontend/wheel-display')));

// ====== API ROUTES ======

// Get current logged in user
app.get('/api/me', requireAuth, async (req, res) => {
    try {
        const user = await getCurrentUser(req);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({
            username: user.username,
            wheelKey: user.wheelKey || null,
            role: user.role || 'user',
            userId: user._id
        });
    } catch (err) {
        console.error('api/me error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Regenerate wheel key
app.post('/api/regenerate-key', requireAuth, async (req, res) => {
    console.log('Regenerating key for:', req.session.username);
    const newKey = crypto.randomBytes(16).toString('hex');
    try {
        const num = await updateWheelKey(req.session.username, newKey);
        console.log('Records updated:', num);
        res.json({ success: true, wheelKey: newKey });
    } catch (err) {
        console.error('regenerate-key error:', err);
        res.status(500).json({ success: false });
    }
});

// ====== USER MANAGEMENT (admin only) ======

app.get('/api/users', requireAdmin, async (req, res) => {
    try {
        const users = await getAllUsers();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/users', requireAdmin, async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }
    try {
        const newUser = await createUser(username, password, role || 'user');
        res.json(newUser);
    } catch (err) {
        if (err.message === 'Username already exists') {
            return res.status(409).json({ error: 'Username already exists' });
        }
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/api/users/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const self = await getCurrentUser(req);
        if (self._id === id) {
            return res.status(400).json({ error: 'You cannot delete your own account' });
        }
        // Also delete all their categories
        db.remove({ userId: id }, { multi: true }, () => {});
        const num = await deleteUser(id);
        if (num === 0) return res.status(404).json({ error: 'User not found' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ====== CATEGORY ROUTES (per-user) ======

// Get categories for the logged-in user only
app.get('/api/categories', requireAuth, async (req, res) => {
    try {
        const user = await getCurrentUser(req);
        db.find({ userId: user._id }, (err, docs) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(docs);
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Get categories by wheel key (used by the wheel display page)
app.get('/api/categories/public', (req, res) => {
    const key = req.query.key;
    if (!key) return res.status(401).json({ error: 'Missing key' });
    findUserByWheelKey(key, (err, user) => {
        if (err || !user) return res.status(403).json({ error: 'Invalid key' });
        db.find({ userId: user._id }, (err2, docs) => {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json(docs);
        });
    });
});

// Add category — scoped to logged-in user
app.post('/api/categories', requireAuth, async (req, res) => {
    try {
        const user = await getCurrentUser(req);
        const { label } = req.body;
        const weight = Number(req.body.weight);

        if (!label || !label.trim()) {
            return res.status(400).json({ error: 'Missing label' });
        }
        if (isNaN(weight) || weight <= 0) {
            return res.status(400).json({ error: 'Invalid weight — must be a positive number' });
        }

        const newCategory = { label: label.trim(), weight, userId: user._id };

        db.insert(newCategory, (err, newDoc) => {
            if (err) return res.status(500).json({ error: err.message });
            io.to(`user:${user._id}`).emit('categories', [newDoc]);
            res.json(newDoc);
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Update category — ensure it belongs to logged-in user
app.put('/api/categories/:id', requireAuth, async (req, res) => {
    try {
        const user = await getCurrentUser(req);
        const { id } = req.params;
        const { label } = req.body;
        const weight = Number(req.body.weight);

        if (!label || !label.trim()) {
            return res.status(400).json({ error: 'Missing label' });
        }
        if (isNaN(weight) || weight <= 0) {
            return res.status(400).json({ error: 'Invalid weight — must be a positive number' });
        }

        const update = { label: label.trim(), weight };

        db.update({ _id: id, userId: user._id }, { $set: update }, {}, (err, numReplaced) => {
            if (err) return res.status(500).json({ error: err.message });
            if (numReplaced === 0) return res.status(404).json({ error: 'Category not found' });
            const updated = { _id: id, ...update };
            io.to(`user:${user._id}`).emit('category-updated', updated);
            res.json(updated);
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete category — ensure it belongs to logged-in user
app.delete('/api/categories/:id', requireAuth, async (req, res) => {
    try {
        const user = await getCurrentUser(req);
        const { id } = req.params;

        db.remove({ _id: id, userId: user._id }, {}, (err, numRemoved) => {
            if (err) return res.status(500).json({ error: err.message });
            if (numRemoved === 0) return res.status(404).json({ error: 'Category not found' });
            io.to(`user:${user._id}`).emit('category-deleted', { id });
            res.json({ removed: numRemoved });
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ====== SOCKET.IO ======
io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    // Handle test spin from admin dashboard
    socket.on('testSpin', ({ winner, userId, isTest }) => {
        if (!winner || !userId) return;
        io.to(`user:${userId}`).emit('spin', { winner, isTest: isTest || false });
    });

    // Wheel display joins by key
    socket.on('join', (key) => {
        if (!key) return;
        findUserByWheelKey(key, (err, user) => {
            if (err || !user) return;
            socket.join(`user:${user._id}`);
            db.find({ userId: user._id }, (err2, docs) => {
                if (!err2) socket.emit('categories', docs);
            });
        });
    });

    // Admin dashboard joins by userId
    socket.on('joinAdmin', (userId) => {
        if (!userId) return;
        socket.join(`user:${userId}`);
        db.find({ userId }, (err, docs) => {
            if (!err) socket.emit('categories', docs);
        });
    });

    socket.on('disconnect', () => {
        console.log('Socket disconnected:', socket.id);
    });
});

// ====== AUTH ENDPOINTS ======

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Missing username or password' });
    }
    try {
        const user = await findUser(username);
        if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ success: false, message: 'Invalid credentials' });

        req.session.authenticated = true;
        req.session.username = user.username;
        res.json({ success: true });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/change-credentials', requireAuth, async (req, res) => {
    const { newUsername, newPassword } = req.body;
    if (!newUsername || !newPassword) {
        return res.status(400).json({ success: false, message: 'Missing username or password' });
    }
    try {
        await updateUser(req.session.username, newUsername, newPassword);
        req.session.username = newUsername;
        res.json({ success: true });
    } catch (err) {
        console.error('Change credentials error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/logout', requireAuth, (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({ success: false });
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

// Debug route
app.get('/api/debug', (req, res) => {
    db.find({}, (err, docs) => {
        res.json({ err, docs, dbFile: path.join(__dirname, 'db/database.db') });
    });
});

// ====== SPIN FUNCTION ======
export function triggerSpin(category) {
    io.emit('spin', category);
}
registerSpinTrigger(triggerSpin);

// ====== CONNECT TWITCH EVENTSUB ======
connectEventSub();

// ====== START SERVER ======
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
