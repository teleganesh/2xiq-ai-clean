const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(cors());
app.use(express.static(__dirname));

// ============================================
// MONGODB CONNECTION
// ============================================
const MONGODB_URI = 'mongodb://palasaji:Ganesh95855@ac-8ib0usr-shard-00-00.wcq88ce.mongodb.net:27017,ac-8ib0usr-shard-00-01.wcq88ce.mongodb.net:27017,ac-8ib0usr-shard-00-02.wcq88ce.mongodb.net:27017/2xiq_db?ssl=true&replicaSet=atlas-w0njbq-shard-0&authSource=admin&retryWrites=true&w=majority';

let dbConnected = false;
let User = null;

console.log('📊 Connecting to MongoDB Atlas...');

mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
})
.then(() => {
    console.log('✅ MongoDB connected successfully!');
    dbConnected = true;
    
    const userSchema = new mongoose.Schema({
        name: { type: String, required: true },
        email: { type: String, required: true, unique: true },
        password: { type: String, required: true },
        createdAt: { type: Date, default: Date.now }
    });
    
    User = mongoose.model('User', userSchema);
    console.log('📁 Database ready');
})
.catch(err => {
    console.error('❌ MongoDB error:', err.message);
    console.log('⚠️ Running without database - signup/login disabled');
});

// ============================================
// HEALTH CHECK
// ============================================
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        mongodb: dbConnected ? 'connected' : 'disconnected'
    });
});

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Access denied' });
    }
    
    jwt.verify(token, '2xiq-secret-key', (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

// ============================================
// SIGNUP
// ============================================
app.post('/api/signup', async (req, res) => {
    try {
        if (!dbConnected || !User) {
            return res.status(503).json({ error: 'Database connecting, please wait...' });
        }
        
        const { name, email, password } = req.body;
        
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'All fields required' });
        }
        
        const existing = await User.findOne({ email });
        if (existing) {
            return res.status(400).json({ error: 'Email already registered' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ name, email, password: hashedPassword });
        await user.save();
        
        const token = jwt.sign(
            { userId: user._id, email: user.email },
            '2xiq-secret-key',
            { expiresIn: '7d' }
        );
        
        res.json({ 
            success: true, 
            token, 
            user: { id: user._id, name: user.name, email: user.email } 
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// LOGIN
// ============================================
app.post('/api/login', async (req, res) => {
    try {
        if (!dbConnected || !User) {
            return res.status(503).json({ error: 'Database connecting, please wait...' });
        }
        
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }
        
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const token = jwt.sign(
            { userId: user._id, email: user.email },
            '2xiq-secret-key',
            { expiresIn: '7d' }
        );
        
        res.json({ 
            success: true, 
            token, 
            user: { id: user._id, name: user.name, email: user.email } 
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// CHAT API (OpenRouter)
// ============================================
app.post('/api/chat', async (req, res) => {
    try {
        const API_KEY = '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';
        
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'http://localhost:3000',
                'X-Title': '2xIQ AI'
            },
            body: JSON.stringify(req.body)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            console.error('OpenRouter error:', data);
            return res.status(response.status).json(data);
        }
        
        res.json(data);
    } catch (error) {
        console.error('Chat API Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// DELETE ACCOUNT
// ============================================
app.delete('/api/user', authenticateToken, async (req, res) => {
    try {
        if (!dbConnected || !User) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        
        await User.findByIdAndDelete(req.user.userId);
        res.json({ message: 'Account deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// SERVE HTML
// ============================================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 MongoDB: ${dbConnected ? 'Connected ✅' : 'Disconnected ⚠️'}`);
    console.log(`\n🔗 Open http://localhost:${PORT} in your browser\n`);
});