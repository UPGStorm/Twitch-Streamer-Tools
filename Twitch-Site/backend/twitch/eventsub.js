import WebSocket from 'ws';
import config from '../config.js';
import { handleRewardRedemption } from '../wheel/wheelController.js';

let ws;

export function connectEventSub() {
    ws = new WebSocket('wss://eventsub.wss.twitch.tv/ws');

    ws.on('open', () => {
        console.log('Connected to Twitch EventSub WebSocket');
    });

    ws.on('message', (data) => {
        const msg = JSON.parse(data);
        if (msg.metadata?.message_type === 'notification') {
            const event = msg.payload.event;
            if (event.reward?.id === config.twitch.rewardId) {
                handleRewardRedemption(event);
            }
        }
    });

    ws.on('close', () => {
        console.log('EventSub connection closed. Reconnecting in 5s...');
        setTimeout(connectEventSub, 5000);
    });

    ws.on('error', (err) => {
        console.error('EventSub WebSocket error:', err);
    });
}