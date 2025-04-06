const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

// Create Express app
const app = express();
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://games-frontend-sunshinecools-projects.vercel.app',
    'https://games-frontend-git-main-sunshinecools-projects.vercel.app',
    'https://games-frontend.vercel.app'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Create HTTP server
const server = http.createServer(app);

// Create Socket.io server
const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:3000',
      'https://games-frontend-sunshinecools-projects.vercel.app',
      'https://games-frontend-git-main-sunshinecools-projects.vercel.app',
      'https://games-frontend.vercel.app'
    ],
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  path: '/socket.io/',
  cookie: false
});

// Add error handling for the server
server.on('error', (error) => {
  console.error('Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.log('Port is already in use. Please free up the port or use a different one.');
  }
});

// Add error handling for Socket.io
io.on('error', (error) => {
  console.error('Socket.io error:', error);
});

// Add connection logging
io.engine.on('connection_error', (err) => {
  console.error('Connection error:', {
    code: err.code,
    message: err.message,
    context: err.context,
    req: {
      url: err.req.url,
      headers: err.req.headers,
      method: err.req.method
    }
  });
});

io.engine.on('initial_headers', (headers, req) => {
  console.log('Initial headers:', {
    url: req.url,
    method: req.method,
    headers: headers
  });
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
  
  for (const player of game.players) {
    // Skip players who have already busted
    if (player.status === 'bust') {
      console.log(`${player.name} already busted. No further action needed.`);
      continue;
    }
    
    // Only process players who are still in the game
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
        console.log(`${player.name} wins ${player.bet} chips. Remaining chips: ${player.chips}`);
      } else if (playerScore > dealerScore) {
        player.status = 'win';
        player.chips += player.bet;
        console.log(`${player.name} wins ${player.bet} chips. Remaining chips: ${player.chips}`);
      } else if (playerScore < dealerScore) {
        player.status = 'lose';
        player.chips -= player.bet;
        console.log(`${player.name} loses ${player.bet} chips. Remaining chips: ${player.chips}`);
      } else {
        player.status = 'push';
        // Return bet to player (no change in chips)
        console.log(`${player.name} pushes. Bet returned. Chips: ${player.chips}`);
      }
    }
  }
  
  game.gamePhase = 'gameOver';
  game.message = 'Game over!';
  
  // Broadcast the game over state with updated chips
  io.to(game.id).emit('gameStateUpdate', { gameState: game });
  
  // Auto-reset the game after 5 seconds
  setTimeout(() => {
    resetGame(game);
    io.to(game.id).emit('gameStateUpdate', { gameState: game });
    console.log(`Game ${game.id} auto-reset after game over`);
  }, 5000);
  
  return game;
};

const resetGame = (game) => {
  console.log(`Resetting game ${game.id}`);
  
  // Preserve player chips but reset everything else
  game.players = game.players.map(player => ({
    ...player,
    cards: [],
    score: 0,
    bet: 0,
    status: 'waiting',
    isCurrentPlayer: false
  }));
  
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
    // Generate a room ID if not provided
    const gameId = roomId || uuidv4();
    
    // Get or create the game
    const game = getGame(gameId);
    
    // Create player
    const player = {
      id: socket.id,
      name: playerName,
      chips: 1000,
      cards: [],
      score: 0,
      bet: 0,
      status: 'waiting',
      isCurrentPlayer: false
    };
    
    // Add player to game
    game.players.push(player);
    
    // Join the socket room
    socket.join(gameId);
    
    // Notify the player they joined
    socket.emit('playerJoined', { 
      player,
      gameState: game
    });
    
    // Notify other players
    socket.to(gameId).emit('playerJoined', { 
      player: { ...player, isCurrentPlayer: false },
      gameState: game
    });
    
    // If this is the first player, make them the dealer
    if (game.players.length === 1) {
      player.isDealer = true;
      game.message = `${playerName} joined as dealer. Waiting for more players...`;
    } else {
      game.message = `${playerName} joined the game.`;
    }
    
    // Broadcast updated game state
    io.to(gameId).emit('gameStateUpdate', { gameState: game });
  });
  
  // Player ready to start
  socket.on('playerReady', ({ roomId }) => {
    console.log(`Player ready event received from ${socket.id} for room ${roomId}`);
    const game = getGame(roomId);
    const player = game.players.find(p => p.id === socket.id);
    
    if (player) {
      console.log(`Player ${player.name} (${player.id}) is ready to play`);
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
      io.to(roomId).emit('gameStateUpdate', { gameState: game });
    } else {
      console.error(`Player ${socket.id} not found in game ${roomId}`);
    }
  });
  
  // Place a bet
  socket.on('placeBet', ({ amount, roomId }) => {
    const game = getGame(roomId);
    const player = game.players.find(p => p.id === socket.id);
    
    console.log(`Place bet request - Room: ${roomId}, Player: ${socket.id}, Amount: ${amount}`);
    console.log(`Current game state - Phase: ${game.gamePhase}, Player chips: ${player?.chips}`);
    
    if (player && game.gamePhase === 'betting') {
      if (amount > 0 && amount <= player.chips) {
        // Deduct chips from player
        player.chips -= amount;
        player.bet = amount;
        player.status = 'betPlaced';
        game.message = `${player.name} placed a bet of ${amount}.`;
        
        console.log(`Bet placed successfully - Player: ${player.name}, New chips: ${player.chips}, Bet: ${player.bet}`);
        
        // Check if all players have placed bets
        const allBetsPlaced = game.players.every(p => p.status === 'betPlaced');
        console.log(`All bets placed: ${allBetsPlaced}`);
        
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
        io.to(roomId).emit('gameStateUpdate', { gameState: game });
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
      io.to(roomId).emit('gameStateUpdate', { gameState: game });
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
      io.to(roomId).emit('gameStateUpdate', { gameState: game });
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
        io.to(roomId).emit('gameStateUpdate', { gameState: game });
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
        io.to(game.id).emit('gameStateUpdate', { gameState: game });
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
          gameState: game
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
      io.to(roomId).emit('gameStateUpdate', { gameState: game });
    }
  });
});

// Start the server
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log('=== Server Configuration ===');
  console.log(`Port: ${PORT} (from env: ${process.env.PORT ? 'yes' : 'no'})`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`WebSocket enabled: yes`);
  console.log(`CORS origins:`, io.opts.cors.origin);
  console.log(`Socket.IO path: ${io.opts.path}`);
  console.log(`Socket.IO transports:`, io.opts.transports);
  console.log('=========================');
});

// Add a health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    websocket: true,
    timestamp: new Date().toISOString()
  });
}); 