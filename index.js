const express = require('express');
const app = express();

app.use(express.json());

// In-Memory Database for Render Compatibility
const db = {
  users: {
    "9876543210": {
      phone: "9876543210",
      balance: 500.00,
      betHistory: [],
      depositHistory: [],
      withdrawHistory: []
    }
  },
  pendingDeposits: []
};

// Live Game State
let gameState = {
  period: "20260912001",
  timer: 60,
  gameHistory: []
};

// Auto Timer Logic (60s Wingo)
setInterval(() => {
  gameState.timer--;
  if (gameState.timer <= 0) {
    const num = Math.floor(Math.random() * 10);
    const size = num >= 5 ? "Big" : "Small";
    let color = num === 0 ? "Red-Violet" : (num === 5 ? "Green-Violet" : ([1, 3, 7, 9].includes(num) ? "Green" : "Red"));
    
    gameState.gameHistory.unshift({ period: gameState.period, number: num, color, size });
    if(gameState.gameHistory.length > 20) gameState.gameHistory.pop();
    
    gameState.period = (BigInt(gameState.period) + 1n).toString();
    gameState.timer = 60;
  }
}, 1000);

// ================= APIS =================

// Base Route
app.get('/', (req, res) => {
  res.json({ status: true, message: "Wingo API Engine Online & Running!" });
});

// Game State API
app.get('/api/wingo/state', (req, res) => {
  res.json({ status: true, data: gameState });
});

// Get User Profile & Lifelong History
app.get('/api/user/:phone', (req, res) => {
  const user = db.users[req.params.phone];
  if (!user) return res.status(404).json({ status: false, message: 'User not found' });
  res.json({ status: true, data: user });
});

// User Deposit Request API (Status: Pending)
app.post('/api/wallet/deposit', (req, res) => {
  const { phone, amount, txnId } = req.body;
  const user = db.users[phone];
  if (!user) return res.status(404).json({ status: false, message: 'User not found' });

  const depObj = {
    id: 'DEP' + Date.now(),
    phone,
    amount: Number(amount),
    txnId,
    status: 'Pending',
    date: new Date().toLocaleString()
  };

  user.depositHistory.unshift(depObj);
  db.pendingDeposits.push(depObj);

  res.json({ status: true, message: 'Deposit requested! Pending admin approval.', data: depObj });
});

// Admin Pending List API
app.get('/api/admin/pending-deposits', (req, res) => {
  res.json({ status: true, data: db.pendingDeposits });
});

// Admin Approve/Reject API
app.post('/api/admin/action-deposit', (req, res) => {
  const { reqId, action } = req.body;
  const index = db.pendingDeposits.findIndex(d => d.id === reqId);
  if (index === -1) return res.status(404).json({ status: false, message: 'Request not found' });

  const reqObj = db.pendingDeposits[index];
  const user = db.users[reqObj.phone];
  const historyItem = user.depositHistory.find(d => d.id === reqId);

  if (action === 'accept') {
    user.balance += reqObj.amount;
    if (historyItem) historyItem.status = 'Approved';
    db.pendingDeposits.splice(index, 1);
    return res.json({ status: true, message: `Approved ₹${reqObj.amount} for user ${reqObj.phone}` });
  } else {
    if (historyItem) historyItem.status = 'Rejected';
    db.pendingDeposits.splice(index, 1);
    return res.json({ status: true, message: 'Deposit request rejected' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
      
