const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
    process.env.SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.SUPABASE_KEY || 'placeholder'
);

app.get('/api/health', (req, res) => {
    res.json({ status: 'MoSPI Backend Active', timestamp: new Date() });
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password, role } = req.body;
    
    // In production with active Supabase:
    // const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (email && password) {
        return res.json({ message: 'Authentication successful', user: { email, role } });
    }
    return res.status(400).json({ error: 'Email and password required' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`MoSPI Backend running on port ${PORT}`);
});
