# Games Backend

This is the backend server for the multiplayer games platform. It handles game state management and real-time communication between players using Socket.IO.

## Features

- Real-time game state management
- Player session handling
- Game room management
- WebSocket communication using Socket.IO
- Express.js REST API endpoints

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory with the following variables:
```
PORT=3001
```

3. Start the development server:
```bash
npm run dev
```

The server will start on `http://localhost:3001` by default.

## API Endpoints

- `GET /api/games` - List all available games
- `GET /api/games/:id` - Get specific game details
- `POST /api/games/:id/join` - Join a game room

## WebSocket Events

### Client -> Server
- `joinGame` - Request to join a game
- `placeBet` - Place a bet in the game
- `hit` - Request a card (Blackjack)
- `stand` - Stand with current hand (Blackjack)
- `nextGame` - Request to start the next game

### Server -> Client
- `gameStateUpdate` - Updates about game state changes
- `playerJoined` - Notification when a new player joins
- `gameStarted` - Notification when the game starts
- `gameOver` - Notification when the game ends

## Development

The server uses nodemon for development, which automatically restarts the server when files change.

## Production

For production deployment, use:
```bash
npm start
``` 