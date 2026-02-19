import { io } from '/socket.io/socket.io.js';

// Initialize Socket.IO client
const socket = io(); // connects to same origin

// Optional helper: listen for generic events
export function onEvent(eventName, callback) {
    socket.on(eventName, callback);
}

// Optional helper: emit events to backend
export function emitEvent(eventName, data) {
    socket.emit(eventName, data);
}

// Default export for direct use
export default socket;