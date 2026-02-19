# Twitch Stream Tools - Wheel Manager

A simple Twitch Channel Points Wheel manager with a browser source and admin dashboard. Built with Node.js, Express, NeDB, and Socket.IO.

---

## Features

- **Channel Points Integration:** Listen for specific Twitch Channel Point reward redemptions and trigger a spin on the wheel.
- **Wheel Browser Source:** Live browser source that displays the wheel for OBS or any streaming software.
- **Admin Dashboard:**
  - Add, delete, and manage wheel categories with labels and weights.
  - Settings page to change login credentials.
  - Live updates via Socket.IO.
- **Authentication:** Basic admin login with session-based authentication.
- **Persistent Storage:** Categories and user credentials stored in NeDB.

---

## Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/UPGStorm/Twitch-Streamer-Tools
   cd Twitch-Site
2. **Install dependencies:**
   ```bash
   npm install
3. **Start the server:**
   ```bash
   npm start
4. **Access page:**
   ```bash
   http://localhost:3000/admin
5. **Login:**
   ```bash
   Username: admin
   Password: admin

## License

[MIT](https://choosealicense.com/licenses/mit/)
