const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

// Clean any accidental trailing slashes or /rest/v1 paths
let rawUrl = process.env.SUPABASE_URL || 'https://ccdrahlnsfrncsqaiumt.supabase.co';
let cleanUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjZHJhaGxuc2ZybmNzcWFpdW10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwMDEzMDAsImV4cCI6MjEwMzU3NzMwMH0.O3sAoWJuLWKeJCenkiUjen3FfLnNahUu7nKbpQ1t6Fo';

const supabase = createClient(cleanUrl, supabaseKey);

app.get('/api/health', (req, res) => {
    res.json({ status: 'MoSPI Backend Active', timestamp: new Date() });
});

app.post('/api/auth/register', async (req, res) => {
    const { name, email, password, cadre, department, designation } = req.body;

    if (!email || !password || !name || !cadre || !department || !designation) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    try {
        const { data, error } = await supabase
            .from('employees')
            .insert([{ name, email, password, cadre, department, designation }])
            .select();

        if (error) {
            console.error('Supabase error:', error);
            return res.status(400).json({ error: error.message });
        }

        return res.status(201).json({
            message: 'Employee registered successfully',
            user: data ? data[0] : { name, email, cadre, department, designation }
        });
    } catch (err) {
        console.error('Server catch error:', err);
        return res.status(500).json({ error: err.message || 'Internal server error while saving data' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password, role } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }

    if (role === 'employee') {
        const { data, error } = await supabase
            .from('employees')
            .select('*')
            .eq('email', email)
            .eq('password', password)
            .single();

        if (error || !data) {
            return res.status(401).json({ error: 'Invalid Employee credentials' });
        }
        return res.json({ message: 'Authentication successful', user: data });
    }

    return res.json({ message: 'Admin authentication processed', user: { email, role } });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`MoSPI Backend running on port ${PORT}`);
});
