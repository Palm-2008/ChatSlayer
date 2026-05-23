# Chat Slayer

## Overview
A mobile-responsive Arabic-language social chat / microblogging web app styled like X (Twitter). Users can register, post messages (up to 500 characters), reply to threads, like/dislike posts, and customize their profiles with avatars and cover images. Includes an anonymous "Ninja" mode, real-time notifications, and an admin moderation system.

## Tech Stack
- **Frontend:** Pure HTML5, CSS3, JavaScript (ES Modules) — no build step required
- **Backend/Database:** Firebase v9 (Firestore + Firebase Auth) via CDN
- **Image Uploads:** Cloudinary (via unsigned upload preset)
- **UI Libraries:** Font Awesome 6.4, Google Fonts (Cairo), Twemoji, Cropper.js

## Running the App
The app is a fully static site. It is served with Python's built-in HTTP server:
```
python3 -m http.server 5000
```
Open port 5000 to see the app.

## Project Structure
- `index.html` — main HTML with all screens toggled via JS
- `java.js` — all application logic (Firebase init, auth, Firestore, UI)
- `style.css` — all styles (RTL, dark theme, mobile-first)
- `media/` — static assets (logo, etc.)
- `speed-insights-init.js` — performance monitoring stub

## User Preferences
- UI language: Arabic (RTL layout)
- Keep the existing Firebase + Cloudinary integrations intact
