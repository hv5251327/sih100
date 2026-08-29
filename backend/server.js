const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

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
            .insert([{ 
                name: name.trim(), 
                email: email.trim().toLowerCase(), 
                password: password, 
                cadre: cadre.trim(), 
                department: department.trim(), 
                designation: designation.trim() 
            }])
            .select();

        if (error) {
            console.error('Supabase Register Error:', error);
            return res.status(400).json({ error: error.message });
        }

        return res.status(201).json({
            message: 'Employee registered successfully',
            user: data ? data[0] : { name, email, cadre, department, designation }
        });
    } catch (err) {
        console.error('Server Catch Register Error:', err);
        return res.status(500).json({ error: err.message || 'Internal server error' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password, role } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    try {
        // Find employee by email
        const { data, error } = await supabase
            .from('employees')
            .select('id, name, email, password, cadre, department, designation')
            .ilike('email', cleanEmail)
            .maybeSingle();

        if (error) {
            console.error('Supabase Login Query Error:', error);
            return res.status(500).json({ error: 'Database query error: ' + error.message });
        }

        if (!data) {
            return res.status(401).json({ error: 'No user account found with email: ' + cleanEmail });
        }

        if (data.password !== password) {
            return res.status(401).json({ error: 'Incorrect password entered.' });
        }

        // Return user profile omitting plain text password
        const { password: _, ...userProfile } = data;
        return res.json({
            message: 'Authentication successful',
            user: userProfile
        });
    } catch (err) {
        console.error('Catch Login Error:', err);
        return res.status(500).json({ error: 'Internal server error: ' + err.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`MoSPI Backend running on port ${PORT}`);
});
