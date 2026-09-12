const express = require('express');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const webpush = require('web-push');

const app = express();
app.use(express.json());

// Persistent Permanent JSON Database Initialization
const adapter = new FileSync('db.json');
const db = low(adapter);

// VAPID Keys Setup for Push Notifications
const vapidKeys = webpush.generateVAPIDKeys();
webpush.setVapidDetails('mailto:admin@wingogame.com', vapidKeys.publicKey, vapidKeys.privateKey);

// Global Game State (In-Memory Timer)
let gameState = {
  period: "20260912001",
  timer: 60,
  manualNextResult: null,
  gameHistory: [
    { period: "20260912000", number: 7, color: "Green", size: "Big" }
  ]
};

const sendRes = (res, status, statusCode, message, data = null) => {
  return res.status(statusCode).json({ status, message, data });
};

// Helper: Color & Size Outcome Generator
const getResultDetails = (num) => {
  const number = parseInt(num);
  const size = number >= 5 ? "Big" : "Small";
  let color = "";
  if (number === 0) color = "Red-Violet";
  else if (number === 5) color = "Green-Violet";
  else if ([1, 3, 7, 9].includes(number)) color = "Green";
  else color = "Red";

  return { number, color, size };
};

// Game Settlement Timer (Runs every 1 second)
setInterval(() => {
  gameState.timer--;
  if (gameState.timer <= 0) {
    let winningNumber = gameState.manualNextResult !== null ? gameState.manualNextResult : Math.floor(Math.random() * 10);
    gameState.manualNextResult = null;

    const result = getResultDetails(winningNumber);
    const settledPeriod = gameState.period;

    gameState.gameHistory.unshift({
      period: settledPeriod,
      number: result.number,
      color: result.color,
      size: result.size
    });
    if (gameState.gameHistory.length > 20) gameState.gameHistory.pop();

    // Settle Bets Permanently in Database
    const users = db.get('users').value();
    Object.keys(users).forEach(phone => {
      let user = users[phone];
      let updated = false;

      user.betHistory.forEach(bet => {
        if (bet.period === settledPeriod && bet.status === "Pending") {
          let win = false;
          let winAmount = 0;

          if (bet.selectType === "Number" && parseInt(bet.selection) === result.number) {
            win = true;
            winAmount = bet.amount * 9;
          } else if (bet.selectType === "Size" && bet.selection.toLowerCase() === result.size.toLowerCase()) {
            win = true;
            winAmount = bet.amount * 2;
          } else if (bet.selectType === "Color" && result.color.toLowerCase().includes(bet.selection.toLowerCase())) {
            win = true;
            winAmount = bet.amount * 2;
          }

          if (win) {
            bet.status = "Win";
            bet.winAmount = winAmount;
            user.balance += winAmount;
          } else {
            bet.status = "Loss";
            bet.winAmount = 0;
          }
          updated = true;
        }
      });

      if (updated) {
        db.get('users').find({ phone }).assign(user).write();
      }
    });

    const nextPeriodNum = BigInt(gameState.period) + 1n;
    gameState.period = nextPeriodNum.toString();
    gameState.timer = 60;
  }
}, 1000);

// ==========================================
// 1. PUBLIC & AUTH APIS
// ==========================================

// Get VAPID Public Key
app.get('/api/push/public-key', (req, res) => sendRes(res, true, 200, 'Public Key', { publicKey: vapidKeys.publicKey }));

// Register/Save Push Token
app.post('/api/push/subscribe', (req, res) => {
  const { phone, subscription } = req.body;
  const user = db.get('users').find({ phone }).value();
  if (!user) return sendRes(res, false, 404, 'User not found');

  db.get('users').find({ phone }).assign({ pushSubscription: subscription }).write();
  return sendRes(res, true, 200, 'Notification Subscribed');
});

// Fetch Game State
app.get('/api/wingo/state', (req, res) => {
  return sendRes(res, true, 200, 'Game state', {
    period: gameState.period,
    timer: gameState.timer,
    gameHistory: gameState.gameHistory
  });
});

// Fetch User Data & Lifelong History
app.get('/api/user/profile/:phone', (req, res) => {
  const user = db.get('users').find({ phone: req.params.phone }).value();
  if (!user) return sendRes(res, false, 404, 'User not found');
  return sendRes(res, true, 200, 'Profile Data', user);
});

// Place Bet API
app.post('/api/wingo/bet', (req, res) => {
  const { phone, selectType, selection, amount } = req.body;
  const betAmt = Number(amount);
  const user = db.get('users').find({ phone }).value();

  if (!user) return sendRes(res, false, 404, 'User not found.');
  if (user.balance < betAmt) return sendRes(res, false, 400, 'Insufficient balance!');
  if (gameState.timer <= 5) return sendRes(res, false, 400, 'Betting locked for this period!');

  user.balance -= betAmt;

  const betRecord = {
    id: "BET" + Date.now(),
    period: gameState.period,
    selectType,
    selection,
    amount: betAmt,
    status: "Pending",
    winAmount: 0,
    date: new Date().toLocaleString()
  };

  user.betHistory.unshift(betRecord);
  db.get('users').find({ phone }).assign(user).write();

  return sendRes(res, true, 200, 'Bet Placed Successfully!', { newBalance: user.balance });
});

// ==========================================
// 2. WALLET (DEPOSIT & WITHDRAW) APIS
// ==========================================

// User Deposit Request (Pending State)
app.post('/api/wallet/deposit', (req, res) => {
  const { phone, amount, txnId } = req.body;
  const depAmt = Number(amount);
  const user = db.get('users').find({ phone }).value();

  if (!user) return sendRes(res, false, 404, 'User not found');
  if (!depAmt || depAmt < 10) return sendRes(res, false, 400, 'Minimum deposit ₹10');
  if (!txnId) return sendRes(res, false, 400, 'Txn/UTR ID required');

  const depRecord = {
    id: 'DEP' + Date.now(),
    phone,
    amount: depAmt,
    txnId,
    status: 'Pending',
    date: new Date().toLocaleString()
  };

  user.depositHistory.unshift(depRecord);
  db.get('users').find({ phone }).assign(user).write();
  db.get('pendingDeposits').push(depRecord).write();

  return sendRes(res, true, 200, 'Deposit Request Submitted! Pending Admin Approval.');
});

// User Receive Bonus API
app.post('/api/wallet/claim-bonus', (req, res) => {
  const { phone, bonusId } = req.body;
  const user = db.get('users').find({ phone }).value();
  if (!user) return sendRes(res, false, 404, 'User not found');

  const bonus = user.bonuses.find(b => b.id === bonusId);
  if (!bonus || bonus.isClaimed) return sendRes(res, false, 400, 'Invalid or already claimed bonus');

  bonus.isClaimed = true;
  user.balance += bonus.amount;
  db.get('users').find({ phone }).assign(user).write();

  return sendRes(res, true, 200, 'Received successfully!', { newBalance: user.balance });
});

// ==========================================
// 3. ADMIN PANEL APIS
// ==========================================

// Fetch Pending Deposits for Admin
app.get('/api/admin/pending-deposits', (req, res) => {
  const list = db.get('pendingDeposits').value();
  return sendRes(res, true, 200, 'Pending List', list);
});

// Admin Approve/Reject Deposit
app.post('/api/admin/action-deposit', (req, res) => {
  const { reqId, action } = req.body;
  const pendingList = db.get('pendingDeposits').value();
  const index = pendingList.findIndex(d => d.id === reqId);

  if (index === -1) return sendRes(res, false, 404, 'Deposit request not found!');

  const reqItem = pendingList[index];
  const user = db.get('users').find({ phone: reqItem.phone }).value();
  const historyItem = user.depositHistory.find(d => d.id === reqId);

  if (action === 'accept') {
    user.balance += reqItem.amount;
    if (historyItem) historyItem.status = 'Approved';
    db.get('users').find({ phone: reqItem.phone }).assign(user).write();
    db.get('pendingDeposits').remove({ id: reqId }).write();
    return sendRes(res, true, 200, `Deposit of ₹${reqItem.amount} Approved!`);
  } else {
    if (historyItem) historyItem.status = 'Rejected';
    db.get('users').find({ phone: reqItem.phone }).assign(user).write();
    db.get('pendingDeposits').remove({ id: reqId }).write();
    return sendRes(res, true, 200, 'Deposit Request Rejected');
  }
});

// Admin Send Bonus Message
app.post('/api/admin/send-bonus', (req, res) => {
  const { phone, amount, messageText } = req.body;
  const user = db.get('users').find({ phone }).value();
  if (!user) return sendRes(res, false, 404, 'User not found!');

  const bonusObj = {
    id: "BONUS_" + Date.now(),
    amount: Number(amount),
    message: messageText,
    isClaimed: false,
    date: new Date().toLocaleString()
  };

  user.bonuses.unshift(bonusObj);
  db.get('users').find({ phone }).assign(user).write();
  return sendRes(res, true, 200, 'Bonus Sent Successfully!');
});

// Admin Push Notification API
app.post('/api/admin/send-push', async (req, res) => {
  const { phone, title, messageText, imageUrl } = req.body;
  const user = db.get('users').find({ phone }).value();

  if (!user || !user.pushSubscription) return sendRes(res, false, 400, 'User push notification not enabled!');

  const payload = JSON.stringify({
    title: title || '🎮 Game Alert',
    body: messageText || 'You have a message',
    icon: imageUrl || '',
    image: imageUrl || null
  });

  try {
    await webpush.sendNotification(user.pushSubscription, payload);
    return sendRes(res, true, 200, 'Push Notification Delivered!');
  } catch (err) {
    return sendRes(res, false, 500, 'Failed to send notification.');
  }
});

// Service Worker Route
app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`
    self.addEventListener('push', function(event) {
      const data = event.data ? event.data.json() : {};
      self.registration.showNotification(data.title || 'Notification', {
        body: data.body || '',
        icon: data.icon || '',
        image: data.image || null
      });
    });
  `);
});

// Redirect default route
app.get('/', (req, res) => res.json({ status: true, message: 'Wingo Permanent API Server Active' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Wingo Database-Backed API Server running on port ${PORT}`));
  
