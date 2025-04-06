const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const httpServer = createServer(app);

// CORS configuration
const allowedOrigins = [
  'http://localhost:3000',
  'http://192.168.18.27:3000',
  process.env.FRONTEND_URL // Will be set in production
].filter(Boolean); // Remove undefined values

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST'],
  credentials: true
}));

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Game state
const games = {};

// Helper functions
const createDeck = () => {
  const suits = ['♠', '♥', '♦', '♣'];
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  const deck = [];
  
  for (const suit of suits) {
    for (const value of values) {
      deck.push({ suit, value });
    }
  }
  
  return shuffleDeck(deck);
};

const shuffleDeck = (deck) => {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const calculateScore = (cards) => {
  let score = 0;
  let aces = 0;
  
  for (const card of cards) {
    if (card.value === 1) {
      aces += 1;
    } else if (card.value > 10) {
      score += 10;
    } else {
      score += card.value;
    }
  }
  
  // Add aces
  for (let i = 0; i < aces; i++) {
    if (score + 11 <= 21) {
      score += 11;
    } else {
      score += 1;
    }
  }
  
  return score;
};

const createGame = (roomId) => {
  const game = {
    id: roomId,
    players: [],
    waitingPlayers: [],
    dealer: { cards: [], score: 0 },
    deck: createDeck(),
    gamePhase: 'waiting', // waiting, betting, playing, dealerTurn, gameOver
    pot: 0,
    currentBet: 0,
    message: 'Waiting for players...'
  };
  
  games[roomId] = game;
  return game;
};

const getGame = (roomId) => {
  if (!games[roomId]) {
    return createGame(roomId);
  }
  return games[roomId];
};

const dealInitialCards = (game) => {
  console.log('Dealing initial cards...');
  
  // Deal 2 cards to each player
  for (const player of game.players) {
    if (player.status === 'betPlaced') {
      player.cards = [game.deck.pop(), game.deck.pop()];
      player.score = calculateScore(player.cards);
      player.status = 'playing';
      console.log(`${player.name} received cards: ${player.cards.map(c => `${c.value}${c.suit}`).join(', ')} (Score: ${player.score})`);
    }
  }
  
  // Deal 2 cards to dealer
  game.dealer.cards = [game.deck.pop(), game.deck.pop()];
  game.dealer.score = calculateScore(game.dealer.cards);
  
  game.gamePhase = 'playing';
  game.message = 'Game started!';
  
  console.log(`Game phase set to: ${game.gamePhase}`);
  
  return game;
};

const dealerPlay = (game) => {
  game.gamePhase = 'dealerTurn';
  game.message = 'Dealer is playing...';
  
  console.log(`Dealer's turn. Initial cards: ${game.dealer.cards.map(c => `${c.value}${c.suit}`).join(', ')}`);
  
  // Reveal dealer's hidden card
  const dealerCards = [...game.dealer.cards];
  game.dealer.score = calculateScore(dealerCards);
  
  console.log(`Dealer's score: ${game.dealer.score}`);
  
  // Dealer must hit until 17 or higher
  while (game.dealer.score < 17) {
    const newCard = game.deck.pop();
    dealerCards.push(newCard);
    game.dealer.cards = dealerCards;
    game.dealer.score = calculateScore(dealerCards);
    
    console.log(`Dealer hits: ${newCard.value}${newCard.suit}. New score: ${game.dealer.score}`);
  }
  
  console.log(`Dealer stands with score: ${game.dealer.score}`);
  
  // Determine winners
  determineWinners(game);
  
  return game;
};

const determineWinners = (game) => {
  const dealerScore = game.dealer.score;
  const dealerBust = dealerScore > 21;
  
  console.log(`Determining winners. Dealer score: ${dealerScore}${dealerBust ? ' (BUST)' : ''}`);
  
  let winners = [];
  for (const player of game.players) {
    if (player.status === 'playing' || player.status === 'stand') {
      const playerScore = player.score;
      const playerBust = playerScore > 21;
      
      console.log(`${player.name}: Score ${playerScore}${playerBust ? ' (BUST)' : ''}, Bet ${player.bet}`);
      
      if (playerBust) {
        player.status = 'bust';
        player.chips -= player.bet;
        console.log(`${player.name} busts and loses ${player.bet} chips. Remaining chips: ${player.chips}`);
      } else if (dealerBust) {
        player.status = 'win';
        player.chips += player.bet;
        winners.push(player.name);
        console.log(`${player.name} wins ${player.bet} chips. Remaining chips: ${player.chips}`);
      } else if (playerScore > dealerScore) {
        player.status = 'win';
        player.chips += player.bet;
        winners.push(player.name);
        console.log(`${player.name} wins ${player.bet} chips. Remaining chips: ${player.chips}`);
      } else if (playerScore < dealerScore) {
        player.status = 'lose';
        player.chips -= player.bet;
        console.log(`${player.name} loses ${player.bet} chips. Remaining chips: ${player.chips}`);
      } else {
        player.status = 'push';
        winners.push(player.name);
        console.log(`${player.name} pushes. Bet returned. Chips: ${player.chips}`);
      }
    }
  }
  
  game.gamePhase = 'gameOver';
  game.winners = winners;
  game.resetTimer = 15;
  game.message = winners.length > 0 
    ? `Congratulations ${winners.join(', ')}! 🎉`
    : 'Game over! Better luck next time!';

  // Broadcast the game over state
  io.to(game.id).emit('gameStateUpdate', { gameState: sanitizeGameState(game) });

  // Start the reset timer
  game.resetTimerId = setInterval(() => {
    game.resetTimer--;
    io.to(game.id).emit('gameStateUpdate', { gameState: sanitizeGameState(game) });
    
    if (game.resetTimer <= 0) {
      clearInterval(game.resetTimerId);
      if (game.gamePhase === 'gameOver') {
        console.log('Game auto-resetting after 15 second timeout');
        resetGame(game);
        io.to(game.id).emit('gameStateUpdate', { gameState: sanitizeGameState(game) });
      }
    }
  }, 1000);
};

const resetGame = (game) => {
  console.log(`Resetting game ${game.id}`);
  
  // Move waiting players to active players
  game.players = [
    ...game.players.map(player => ({
      ...player,
      cards: [],
      score: 0,
      bet: 0,
      status: 'waiting',
      isCurrentPlayer: false
    })),
    ...game.waitingPlayers.map(player => ({
      ...player,
      status: 'waiting'
    }))
  ];
  game.waitingPlayers = [];
  
  game.dealer = { cards: [], score: 0 };
  game.deck = createDeck();
  game.gamePhase = 'waiting';
  game.pot = 0;
  game.currentBet = 0;
  game.currentPlayer = null;
  game.message = 'Game reset. Waiting for players to be ready...';
  
  console.log(`Game ${game.id} reset complete. Players: ${game.players.map(p => `${p.name} (${p.chips} chips)`).join(', ')}`);
  
  return game;
};

// Add this function before the Socket.io event handlers
const sanitizeGameState = (game) => {
  return {
    id: game.id,
    players: game.players.map(player => ({
      id: player.id,
      name: player.name,
      chips: player.chips,
      cards: player.cards,
      score: player.score,
      bet: player.bet,
      status: player.status,
      isCurrentPlayer: game.currentPlayer === player.id
    })),
    waitingPlayers: game.waitingPlayers.map(player => ({
      id: player.id,
      name: player.name,
      chips: player.chips,
      status: player.status
    })),
    dealer: {
      cards: game.dealer.cards,
      score: game.dealer.score
    },
    gamePhase: game.gamePhase,
    pot: game.pot,
    currentBet: game.currentBet,
    message: game.message,
    winners: game.winners,
    resetTimer: game.resetTimer,
    currentPlayer: game.currentPlayer
  };
};

// Add this function before the Socket.io event handlers
const findGameByPlayerId = (playerId) => {
  for (const gameId in games) {
    const game = games[gameId];
    if (game.players.some(p => p.id === playerId)) {
      return game;
    }
  }
  return null;
};

// Socket.io event handlers
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  // Reset game
  socket.on('resetGame', ({ roomId }) => {
    const game = getGame(roomId);
    if (game) {
      resetGame(game);
      io.to(roomId).emit('gameStateUpdate', { gameState: game });
    }
  });
  
  // Join a game room
  socket.on('joinGame', ({ playerName, roomId }) => {
    const game = getGame('room1'); // Always use room1
    const existingPlayer = game.players.find(p => p.name === playerName);
    const waitingPlayer = game.waitingPlayers.find(p => p.name === playerName);
    
    if (existingPlayer) {
      // Reconnecting player
      existingPlayer.id = socket.id;
      socket.join('room1');
      socket.emit('playerJoined', { 
        player: existingPlayer,
        gameState: sanitizeGameState(game)
      });
      io.to('room1').emit('gameStateUpdate', { gameState: sanitizeGameState(game) });
      return;
    }

    if (waitingPlayer) {
      // Move from waiting to active if game is in waiting phase
      if (game.gamePhase === 'waiting') {
        waitingPlayer.id = socket.id;
        game.players.push(waitingPlayer);
        game.waitingPlayers = game.waitingPlayers.filter(p => p.name !== playerName);
        socket.join('room1');
        socket.emit('playerJoined', {
          player: waitingPlayer,
          gameState: sanitizeGameState(game)
        });
        io.to('room1').emit('gameStateUpdate', { gameState: sanitizeGameState(game) });
      } else {
        // Update socket ID for waiting player
        waitingPlayer.id = socket.id;
        socket.join('room1');
        socket.emit('playerJoined', {
          player: waitingPlayer,
          gameState: sanitizeGameState(game),
          isWaiting: true
        });
      }
      return;
    }

    // New player
    const newPlayer = {
      id: socket.id,
      name: playerName,
      chips: 1000,
      cards: [],
      score: 0,
      bet: 0,
      status: 'waiting',
      isCurrentPlayer: false
    };

    if (game.gamePhase === 'waiting') {
      game.players.push(newPlayer);
    } else {
      game.waitingPlayers.push(newPlayer);
      socket.emit('playerJoined', {
        player: newPlayer,
        gameState: sanitizeGameState(game),
        isWaiting: true
      });
      return;
    }

    socket.join('room1');
    socket.emit('playerJoined', {
      player: newPlayer,
      gameState: sanitizeGameState(game)
    });
    io.to('room1').emit('gameStateUpdate', { gameState: sanitizeGameState(game) });
  });
  
  // Player ready to start
  socket.on('playerReady', ({ roomId }) => {
    const game = getGame(roomId);
    const player = game.players.find(p => p.id === socket.id);
    
    if (player) {
      player.status = 'ready';
      game.message = `${player.name} is ready to play.`;
      
      // Check if all players are ready
      const allReady = game.players.every(p => p.status === 'ready');
      
      if (allReady && game.players.length >= 2) {
        game.gamePhase = 'betting';
        game.message = 'Place your bets!';
        
        // Log for debugging
        console.log(`Game ${roomId} transitioned to betting phase`);
        console.log(`Players: ${game.players.map(p => `${p.name} (${p.status})`).join(', ')}`);
      } else if (allReady && game.players.length < 2) {
        game.message = 'Waiting for more players...';
      }
      
      // Broadcast updated game state
      io.to(roomId).emit('gameStateUpdate', { gameState: sanitizeGameState(game) });
    }
  });
  
  // Place a bet
  socket.on('placeBet', ({ amount, roomId }) => {
    const game = getGame(roomId);
    const player = game.players.find(p => p.id === socket.id);
    
    if (player && game.gamePhase === 'betting') {
      if (amount > 0 && amount <= player.chips) {
        // Deduct chips from player
        player.chips -= amount;
        player.bet = amount;
        player.status = 'betPlaced';
        game.message = `${player.name} placed a bet of ${amount}.`;
        
        // Check if all players have placed bets
        const allBetsPlaced = game.players.every(p => p.status === 'betPlaced');
        
        if (allBetsPlaced) {
          // Deal initial cards
          dealInitialCards(game);
          
          // Set first player's turn
          game.currentPlayer = game.players[0].id;
          game.message = `${game.players[0].name}'s turn.`;
          
          // Log for debugging
          console.log(`Game ${roomId} started with ${game.players.length} players`);
          console.log(`Dealer cards: ${game.dealer.cards.map(c => `${c.value}${c.suit}`).join(', ')}`);
          console.log(`First player: ${game.players[0].name} (${game.players[0].id})`);
          console.log(`Game phase: ${game.gamePhase}`);
        }
        
        // Broadcast updated game state
        io.to(roomId).emit('gameStateUpdate', { gameState: sanitizeGameState(game) });
      }
    }
  });
  
  // Hit (take another card)
  socket.on('hit', ({ roomId }) => {
    const game = getGame(roomId);
    const player = game.players.find(p => p.id === socket.id);
    
    if (player && game.gamePhase === 'playing' && game.currentPlayer === socket.id) {
      // Deal a new card
      const newCard = game.deck.pop();
      player.cards.push(newCard);
      player.score = calculateScore(player.cards);
      
      // Check for bust
      if (player.score > 21) {
        player.status = 'bust';
        game.message = `${player.name} busts!`;
        
        // Move to next player
        moveToNextPlayer(game);
      } else {
        game.message = `${player.name} hits.`;
      }
      
      // Broadcast updated game state
      io.to(roomId).emit('gameStateUpdate', { gameState: sanitizeGameState(game) });
    }
  });
  
  // Stand (end turn)
  socket.on('stand', ({ roomId }) => {
    const game = getGame(roomId);
    const player = game.players.find(p => p.id === socket.id);
    
    if (player && game.gamePhase === 'playing' && game.currentPlayer === socket.id) {
      player.status = 'stand';
      game.message = `${player.name} stands.`;
      
      // Move to next player
      moveToNextPlayer(game);
      
      // Broadcast updated game state
      io.to(roomId).emit('gameStateUpdate', { gameState: sanitizeGameState(game) });
    }
  });
  
  // Double down
  socket.on('doubleDown', ({ roomId }) => {
    const game = getGame(roomId);
    const player = game.players.find(p => p.id === socket.id);
    
    if (player && game.gamePhase === 'playing' && game.currentPlayer === socket.id) {
      if (player.chips >= player.bet) {
        // Double the bet
        player.chips -= player.bet;
        player.bet *= 2;
        
        // Deal one more card
        const newCard = game.deck.pop();
        player.cards.push(newCard);
        player.score = calculateScore(player.cards);
        
        // Check for bust
        if (player.score > 21) {
          player.status = 'bust';
          game.message = `${player.name} busts after doubling down!`;
        } else {
          player.status = 'stand';
          game.message = `${player.name} doubles down and stands.`;
        }
        
        // Move to next player
        moveToNextPlayer(game);
        
        // Broadcast updated game state
        io.to(roomId).emit('gameStateUpdate', { gameState: sanitizeGameState(game) });
      }
    }
  });
  
  // Helper function to move to next player
  const moveToNextPlayer = (game) => {
    const currentIndex = game.players.findIndex(p => p.id === game.currentPlayer);
    let nextIndex = (currentIndex + 1) % game.players.length;
    
    console.log(`Moving to next player. Current player: ${game.players[currentIndex].name} (${game.players[currentIndex].status})`);
    
    // Skip players who are bust or have stood
    while (
      game.players[nextIndex].status === 'bust' || 
      game.players[nextIndex].status === 'stand'
    ) {
      console.log(`Skipping ${game.players[nextIndex].name} (${game.players[nextIndex].status})`);
      nextIndex = (nextIndex + 1) % game.players.length;
      
      // If we've gone through all players, dealer's turn
      if (nextIndex === currentIndex) {
        console.log(`All players have completed their turns. Moving to dealer's turn.`);
        dealerPlay(game);
        io.to(game.id).emit('gameStateUpdate', { gameState: sanitizeGameState(game) });
        return;
      }
    }
    
    game.currentPlayer = game.players[nextIndex].id;
    game.message = `${game.players[nextIndex].name}'s turn.`;
    console.log(`Next player: ${game.players[nextIndex].name} (${game.players[nextIndex].status})`);
  };
  
  // Disconnect
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    // Find the game this player was in
    for (const gameId in games) {
      const game = games[gameId];
      const playerIndex = game.players.findIndex(p => p.id === socket.id);
      
      if (playerIndex !== -1) {
        const player = game.players[playerIndex];
        
        // Remove player from game
        game.players.splice(playerIndex, 1);
        
        // Notify other players
        socket.to(gameId).emit('playerLeft', { 
          playerId: socket.id,
          playerName: player.name,
          gameState: sanitizeGameState(game)
        });
        
        // If no players left, remove the game
        if (game.players.length === 0) {
          delete games[gameId];
        }
        
        break;
      }
    }
  });
  
  // Debug game state
  socket.on('debugGameState', ({ roomId }) => {
    const game = getGame(roomId);
    if (game) {
      console.log(`Debug game state for room ${roomId}:`);
      console.log(`Game phase: ${game.gamePhase}`);
      console.log(`Current player: ${game.currentPlayer}`);
      console.log(`Dealer cards: ${game.dealer.cards.map(c => `${c.value}${c.suit}`).join(', ')} (Score: ${game.dealer.score})`);
      console.log('Players:');
      game.players.forEach(player => {
        console.log(`- ${player.name} (${player.id}): Status=${player.status}, Score=${player.score}, Bet=${player.bet}, Cards=${player.cards.map(c => `${c.value}${c.suit}`).join(', ')}`);
      });
      
      // Force a game state update
      io.to(roomId).emit('gameStateUpdate', { gameState: sanitizeGameState(game) });
    }
  });

  // Next game
  socket.on('nextGame', ({ roomId }) => {
    console.log('Next game requested for room:', roomId);
    const game = getGame(roomId);
    
    if (!game) {
      console.error('Game not found for room:', roomId);
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    if (game.gamePhase !== 'gameOver') {
      console.error('Cannot start next game - current phase:', game.gamePhase);
      socket.emit('error', { message: 'Cannot start next game at this time' });
      return;
    }

    console.log('Starting next game for room:', roomId);
    if (game.resetTimerId) {
      clearInterval(game.resetTimerId);
    }
    
    resetGame(game);
    io.to(roomId).emit('gameStateUpdate', { gameState: sanitizeGameState(game) });
  });
});

// Start server
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Server is accessible on:');
  console.log(`- Local: http://localhost:${PORT}`);
  console.log(`- Network: http://0.0.0.0:${PORT}`);
}); 