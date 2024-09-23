const express = require('express');
const path = require('path');
const session = require('express-session');
const http = require('http');
const WebSocket = require('ws');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
  secret: process.env.sol,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// In-memory database for user instances
const userInstances = {};
const userSockets = {}; // To keep track of WebSocket connections by userId

// Home route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve the web client page with userId in the URL
app.get('/web-client/:userId', (req, res) => {
  const { userId } = req.params;
  if (userInstances[userId]) {
    res.sendFile(path.join(__dirname, 'public', 'web-client.html'));
  } else {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  }
});

// POST endpoint to create a new instance
app.post('/create-instance', (req, res) => {
  const { gameName, players, isConnected } = req.body;
  const userId = req.session.userId || Date.now().toString();

  userInstances[userId] = { gameName, players, isConnected };
  req.session.userId = userId;

  const verifyLink = `http://localhost:${PORT}/verify/${userId}`;

  res.json({
    message: 'Instance created successfully',
    link: `http://localhost:${PORT}/web-client/${userId}`,
    verifyLink,
    userId,
    gameName,
    players,
    isConnected,
  });

  // Notify the user of their new instance
  notifyUser(userId, userInstances[userId]);
});

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  const userId = req.url.split('/').pop(); // Get userId from the URL

  // Store the WebSocket connection
  userSockets[userId] = ws;

  console.log(`Client connected: ${userId}`);

  // Listen for messages from the client
  ws.on('message', (message) => {
    console.log(`Received from ${userId}: ${message}`);

    // If the message is a request for player updates
    if (message === 'requestPlayerList') {
      const instance = userInstances[userId];
      if (instance) {
        ws.send(JSON.stringify({ type: 'playerListUpdate', players: instance.players }));
      }
    }
  });

  // Handle client disconnection
  ws.on('close', () => {
    console.log(`Client disconnected: ${userId}`);
    delete userSockets[userId]; // Remove the socket from the map
  });
});

// Function to notify a user of instance updates
function notifyUser(userId, instance) {
  const userSocket = userSockets[userId];
  if (userSocket && userSocket.readyState === WebSocket.OPEN) {
    userSocket.send(JSON.stringify({ type: 'instanceUpdate', instance }));
  }
}

// GET endpoint for verification with userId parameter
app.get('/verify/:userId', (req, res) => {
  const { userId } = req.params;
  if (userInstances[userId]) {
    res.json({
      message: 'Verification successful',
      userId,
      instance: userInstances[userId],
    });
  } else {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  }
});

// GET endpoint to fetch all instances
app.get('/instances', (req, res) => {
  res.json(userInstances);
});

// Catch-all 404 handler
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
