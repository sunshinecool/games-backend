const { io } = require('socket.io-client');

const BACKEND_URL = 'https://games-backend-production.up.railway.app';

const socket = io(BACKEND_URL, {
  withCredentials: true,
  transports: ['websocket'],
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});

socket.on('connect', () => {
  console.log('Connected to server!');
  console.log('Socket ID:', socket.id);
  
  // Try to join a game
  socket.emit('joinGame', { playerName: 'TestPlayer', roomId: 'room1' });
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
});

socket.on('error', (error) => {
  console.error('Socket error:', error);
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});

socket.on('playerJoined', (data) => {
  console.log('Player joined event:', data);
});

socket.on('gameStateUpdate', (data) => {
  console.log('Game state update:', data);
});

// Keep the script running for a while
setTimeout(() => {
  console.log('Test complete, closing connection');
  socket.disconnect();
  process.exit(0);
}, 10000); 