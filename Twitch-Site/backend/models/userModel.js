import Datastore from 'nedb';
import bcrypt from 'bcrypt';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Datastore({
    filename: path.join(__dirname, '../db/users.db'),
    autoload: true
});

// Ensure default admin exists with role
export async function ensureDefaultAdmin() {
    db.findOne({}, async (err, user) => {
        if (!user) {
            const hashed = await bcrypt.hash('admin', 10);
            db.insert({
                username: 'admin',
                password: hashed,
                wheelKey: null,
                role: 'admin'
            });
            console.log('Default admin created: admin/admin');
        } else if (!user.role) {
            // Migrate existing admin record to have role
            db.update({ _id: user._id }, { $set: { role: 'admin' } }, {}, () => {
                console.log('Migrated existing admin to role: admin');
            });
        }
    });
}

// Case-insensitive username lookup
export function findUser(username) {
    return new Promise((resolve, reject) => {
        db.findOne({ username: new RegExp(`^${username}$`, 'i') }, (err, doc) => {
            if (err) reject(err);
            else resolve(doc);
        });
    });
}

// Find user by their wheel key
export function findUserByWheelKey(key, callback) {
    db.findOne({ wheelKey: key }, callback);
}

// Get all users (strips password)
export function getAllUsers() {
    return new Promise((resolve, reject) => {
        db.find({}, (err, docs) => {
            if (err) reject(err);
            else resolve(docs.map(u => ({
                _id: u._id,
                username: u.username,
                role: u.role || 'user',
                wheelKey: u.wheelKey || null
            })));
        });
    });
}

// Create a new user
export async function createUser(username, password, role = 'user') {
    const existing = await findUser(username);
    if (existing) throw new Error('Username already exists');

    const hashed = await bcrypt.hash(password, 10);
    const wheelKey = crypto.randomBytes(16).toString('hex');

    return new Promise((resolve, reject) => {
        db.insert({
            username,
            password: hashed,
            role,
            wheelKey
        }, (err, newDoc) => {
            if (err) reject(err);
            else resolve({
                _id: newDoc._id,
                username: newDoc.username,
                role: newDoc.role,
                wheelKey: newDoc.wheelKey
            });
        });
    });
}

// Delete a user by ID
export function deleteUser(id) {
    return new Promise((resolve, reject) => {
        db.remove({ _id: id }, {}, (err, numRemoved) => {
            if (err) reject(err);
            else resolve(numRemoved);
        });
    });
}

// Update username and password
export async function updateUser(oldUsername, newUsername, newPassword) {
    const hashed = await bcrypt.hash(newPassword, 10);
    return new Promise((resolve, reject) => {
        db.update(
            { username: new RegExp(`^${oldUsername}$`, 'i') },
            { $set: { username: newUsername, password: hashed } },
            {},
            (err, num) => {
                if (err) reject(err);
                else resolve(num);
            }
        );
    });
}

// Update wheel key for a user
export function updateWheelKey(username, newKey) {
    return new Promise((resolve, reject) => {
        db.update(
            { username: new RegExp(`^${username}$`, 'i') },
            { $set: { wheelKey: newKey } },
            {},
            (err, numUpdated) => {
                console.log('updateWheelKey:', { username, numUpdated, err });
                if (err) reject(err);
                else resolve(numUpdated);
            }
        );
    });
}
