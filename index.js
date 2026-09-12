const express = require('express');
const app = express();

app.use(express.json());

// Strict CORS Allow All
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// In-Memory Database
const db = {
  users: {},
  pendingDeposits: [],
  giftCodes: {}
};

// Game Timers Engine Setup
let games = {
  "30s": { period: "2026091201", timer: 30, history: [], manualNext: null },
  "1m":  { period: "2026091202", timer: 60, history: [], manualNext: null },
  "3m":  { period: "2026091203", timer: 180, history: [], manualNext: null },
  "5m":  { period: "2026091204", timer: 300, history: [], manualNext: null }
};

// First Deposit Bonus Rules
function calculateFirstDepositBonus(amount) {
  const amt = Number(amount);
  if (amt >= 5000) return 2001;
  if (amt >= 2000) return 520;
  if (amt >= 800) return 988;
  if (amt >= 500) return 230;
  if (amt >= 300) return 188;
  if (amt >= 100) return 55;
  return 0;
}

// Background Game Loop for Timers
setInterval(() => {
  for (let mode in games) {
    let g = games[mode];
    g.timer--;
    if (g.timer <= 0) {
      let num = g.manualNext !== null ? g.manualNext : Math.floor(Math.random() * 10);
      g.manualNext = null; // Clear manual setup

      let size = num >= 5 ? "Big" : "Small";
      let color = num === 0 ? "Red-Violet" : (num === 5 ? "Green-Violet" : ([1, 3, 7, 9].includes(num) ? "Green" : "Red"));

      g.history.unshift({ period: g.period, number: num, color, size });
      if (g.history.length > 20) g.history.pop();

      g.period = (BigInt(g.period) + 1n).toString();
      g.timer = mode === "30s" ? 30 : (mode === "1m" ? 60 : (mode === "3m" ? 180 : 300));
    }
  }
}, 1000);

// ==================== API ENDPOINTS ====================

// Server Status Check
app.get('/api/ping', (req, res) => {
  res.json({ status: true, message: "Server Active" });
});

// Register API
app.post('/api/auth/register', (req, res) => {
  const { phone, password, inviteCode } = req.body;
  if (!inviteCode || inviteCode.trim() === "") {
    return res.status(400).json({ status: false, message: "Invitation code is strictly required!" });
  }
  if (db.users[phone]) {
    return res.status(400).json({ status: false, message: "Phone number already registered!" });
  }

  db.users[phone] = {
    phone,
    password,
    inviteCode,
    balance: 0.00,
    lastRealDeposit: 0,
    isFirstDeposit: true,
    hasClaimedLossBonus: false,
    depositHistory: []
  };

  res.json({ status: true, message: "Register Success!" });
});

// Fetch User Data
app.get('/api/user/:phone', (req, res) => {
  const user = db.users[req.params.phone];
  if (!user) return res.status(404).json({ status: false, message: "User not found" });
  res.json({ status: true, data: user });
});

// Fetch Game Timer & History (Fixed & Active Engine)
app.get('/api/wingo/state/:mode', (req, res) => {
  const mode = req.params.mode || "30s";
  if (!games[mode]) {
    return res.status(400).json({ status: false, message: "Invalid Timer Mode" });
  }
  res.json({ status: true, data: games[mode] });
});

// Deposit Request API
app.post('/api/wallet/deposit', (req, res) => {
  const { phone, amount, txnId } = req.body;
  const user = db.users[phone];
  if (!user) return res.status(404).json({ status: false, message: "User not found" });

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

  res.json({ status: true, message: "Deposit requested! Pending approval." });
});

// 50% Loss Bonus Claim API
app.post('/api/wallet/claim-loss-bonus', (req, res) => {
  const { phone } = req.body;
  const user = db.users[phone];
  if (!user) return res.status(404).json({ status: false, message: "User not found" });

  if (user.hasClaimedLossBonus) {
    return res.status(400).json({ status: false, message: "You have already claimed Loss Bonus!" });
  }
  if (user.balance > 0) {
    return res.status(400).json({ status: false, message: "Loss bonus is available only when balance is 0!" });
  }
  if (user.lastRealDeposit <= 0) {
    return res.status(400).json({ status: false, message: "No valid deposit found to claim bonus." });
  }

  const cashback = user.lastRealDeposit * 0.50;
  user.balance += cashback;
  user.hasClaimedLossBonus = true;

  res.json({ status: true, message: `50% Loss Bonus Claimed! ₹${cashback} added.` });
});

// Admin API: Get Pending Deposits
app.get('/api/admin/pending-deposits', (req, res) => {
  res.json({ status: true, data: db.pendingDeposits });
});

// Admin API: Accept/Reject Deposit
app.post('/api/admin/action-deposit', (req, res) => {
  const { reqId, action } = req.body;
  const index = db.pendingDeposits.findIndex(d => d.id === reqId);
  if (index === -1) return res.status(404).json({ status: false, message: "Request not found" });

  const reqObj = db.pendingDeposits[index];
  const user = db.users[reqObj.phone];

  if (action === 'accept') {
    let bonus = 0;
    if (user.isFirstDeposit) {
      bonus = calculateFirstDepositBonus(reqObj.amount);
      user.isFirstDeposit = false;
    }

    user.balance += (reqObj.amount + bonus);
    user.lastRealDeposit = reqObj.amount;
    db.pendingDeposits.splice(index, 1);

    return res.json({ status: true, message: `Approved ₹${reqObj.amount} + Bonus ₹${bonus}` });
  } else {
    db.pendingDeposits.splice(index, 1);
    return res.json({ status: true, message: "Deposit rejected" });
  }
});

// Admin API: Set WinGo Result
app.post('/api/admin/set-result', (req, res) => {
  const { mode, number } = req.body;
  if (games[mode]) {
    games[mode].manualNext = Number(number);
    return res.json({ status: true, message: `Next winning number for ${mode} set to ${number}` });
  }
  res.status(400).json({ status: false, message: "Invalid Timer Mode" });
});

// Admin API: Create Gift Code
app.post('/api/admin/create-giftcode', (req, res) => {
  const { code, amount } = req.body;
  if (!code || !amount) {
    return res.status(400).json({ status: false, message: "Code & Amount required!" });
  }
  db.giftCodes[code] = Number(amount);
  res.json({ status: true, message: `Gift Code ${code} created with ₹${amount}!` });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    
