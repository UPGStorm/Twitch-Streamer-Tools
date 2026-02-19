import jwt from 'jsonwebtoken';
import config from '../config.js';

// Middleware to protect API routes
export function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, config.jwtSecret, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

// Generate JWT token for a user
export function generateToken(username) {
    return jwt.sign({ username }, config.jwtSecret, { expiresIn: '1d' });
}