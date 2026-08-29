const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let rawUrl = process.env.SUPABASE_URL || 'https://ccdrahlnsfrncsqaiumt.supabase.co';
let cleanUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjZHJhaGxuc2ZybmNzcWFpdW10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwMDEzMDAsImV4cCI6MjEwMzU3NzMwMH0.O3sAoWJuLWKeJCenkiUjen3FfLnNahUu7nKbpQ1t6Fo';

const supabase = createClient(cleanUrl, supabaseKey);

app.get('/api/health', (req, res) => {
    res.json({ status: 'MoSPI Backend Active', timestamp: new Date() });
});

app.post('/api/translate', async (req, res) => {
    const { texts, targetLang } = req.body;
    if (!texts || !Array.isArray(texts) || !targetLang) {
        return res.status(400).json({ error: 'texts array and targetLang are required' });
    }

    const langNames = {
        hi: 'Hindi',
        te: 'Telugu',
        ta: 'Tamil',
        bn: 'Bengali',
        en: 'English'
    };

    const targetLangName = langNames[targetLang] || targetLang;
    const prompt = `Translate the following array of short UI strings accurately into ${targetLangName}. Preserve any technical MoSPI/statistical terms naturally. Return ONLY a valid JSON array of strings in the exact same order:\n\n${JSON.stringify(texts)}`;

    try {
        const apiKey = GEMINI_API_KEY || process.env.GEMINI_API_KEY;
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: "application/json"
                }
            })
        });

        const data = await response.json();
        const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
        const translations = JSON.parse(rawContent);

        return res.json({ translations });
    } catch (err) {
        console.error('Gemini Translation Error:', err);
        return res.status(500).json({ error: 'Translation processing failed', fallback: texts });
    }
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
            return res.status(400).json({ error: error.message });
        }

        return res.status(201).json({
            message: 'Employee registered successfully',
            user: data ? data[0] : { name, email, cadre, department, designation }
        });
    } catch (err) {
        return res.status(500).json({ error: err.message || 'Internal server error' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    try {
        const { data, error } = await supabase
            .from('employees')
            .select('id, name, email, password, cadre, department, designation')
            .ilike('email', cleanEmail)
            .maybeSingle();

        if (error || !data) {
            return res.status(401).json({ error: 'No account found with this email.' });
        }

        if (data.password !== password) {
            return res.status(401).json({ error: 'Incorrect password entered.' });
        }

        const { password: _, ...userProfile } = data;
        return res.json({ message: 'Authentication successful', user: userProfile });
    } catch (err) {
        return res.status(500).json({ error: 'Database connection error during login.' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`MoSPI Backend running on port ${PORT}`);
});
