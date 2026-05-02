# Deploying Bangladesh Trivia PWA

This app is ready to be deployed as a Progressive Web App (PWA) to Firebase Hosting.

## Prerequisites
- [Node.js](https://nodejs.org/) installed.
- [Firebase CLI](https://firebase.google.com/docs/cli) installed (`npm install -g firebase-tools`).

## Steps to Deploy

### 1. Initialize Firebase
Open your terminal in the project root and run:
```bash
firebase login
firebase init
```
- Select **Hosting**.
- Choose your project (or create a new one).
- When asked for the public directory, type `dist`.
- When asked if this is a single-page app, say **Yes**.
- When asked if you want to overwrite `firebase.json`, say **No** (we've already configured it).

### 2. Build and Deploy
```bash
npm run build
firebase deploy
```

## PWA Features
- **Offline Support**: The app caches core assets and trivia questions using a service worker.
- **Installable**: Users will see a prompt to add the app to their home screen on Android and iOS (via Safari).
- **Fast Performance**: Optimized build using Vite 6.

## Environment Variables
Ensure you add your `GEMINI_API_KEY` to your Firebase project's environment if you use any backend functions, or ensure it's available during the build process if it's embedded in the frontend (as is currently configured in `vite.config.ts`).

> **Note**: For production, it's recommended to store sensitive keys in secret managers, but for this trivia app, the key is used to fetch daily questions during the build or at runtime via client-side calls.
