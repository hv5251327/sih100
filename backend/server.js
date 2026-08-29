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

// iGOT Karmayogi Course Recommendation & Database Caching Endpoint
app.post('/api/recommendations', async (req, res) => {
    const { cadre, department, designation } = req.body;

    if (!cadre || !department || !designation) {
        return res.status(400).json({ error: 'Cadre, department, and designation are required.' });
    }

    try {
        // 1. Check if cached recommendations exist in database
        const { data: cached, error: cacheErr } = await supabase
            .from('recommended_courses')
            .select('*')
            .eq('cadre', cadre)
            .eq('department', department)
            .eq('designation', designation);

        if (!cacheErr && cached && cached.length >= 15) {
            return res.json({ courses: cached, source: 'database' });
        }

        // 2. Query Gemini API for 15 tailored iGOT Karmayogi courses
        const apiKey = GEMINI_API_KEY || process.env.GEMINI_API_KEY;
        const prompt = `You are the AI Training Director at NSSTA (National Statistical Systems Training Academy), MoSPI, Government of India.
Generate a tailored training syllabus of 15 targeted iGOT Karmayogi courses for an officer with:
- Statistical Cadre: ${cadre}
- Department / Division: ${department}
- Designation: ${designation}

Return ONLY a valid JSON array of 15 objects matching this exact structure:
[
  {
    "title": "Exact iGOT Course Title (e.g. Code on Social Security, National Accounts Statistics, Python for Data Analysis, Sampling Techniques)",
    "description": "2-sentence practical reason why this course matches this officer's role.",
    "category": "Domain Category (e.g. Statistical Methods, Data Informatics, Statutory Compliance, Behavioural)",
    "course_id": "do_igot_course_identifier",
    "course_url": "https://igotkarmayogi.gov.in/"
  }
]`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        const geminiRes = await response.json();
        const rawContent = geminiRes.candidates?.[0]?.content?.parts?.[0]?.text;
        const generatedCourses = JSON.parse(rawContent);

        const rowsToInsert = generatedCourses.map(c => ({
            cadre,
            department,
            designation,
            title: c.title,
            description: c.description,
            category: c.category,
            course_id: c.course_id || 'igot_course_default',
            course_url: c.course_url || 'https://igotkarmayogi.gov.in/'
        }));

        // 3. Cache into Supabase table
        await supabase.from('recommended_courses').insert(rowsToInsert);

        return res.json({ courses: rowsToInsert, source: 'ai_generated' });
    } catch (err) {
        console.error('iGOT Recommendation Error:', err);
        return res.status(500).json({ error: 'Failed to generate iGOT recommendations.' });
    }
});

// AI Assessment Quiz Generator for Completed iGOT Course
app.post('/api/generate-quiz', async (req, res) => {
    const { courseTitle, category } = req.body;
    const apiKey = GEMINI_API_KEY || process.env.GEMINI_API_KEY;

    const prompt = `Generate a 3-question multiple choice competency assessment for MoSPI officers on the iGOT Karmayogi course: "${courseTitle}" (${category}).
Return ONLY a valid JSON array of objects with format:
[
  {
    "question": "Clear question text?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0
  }
]`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        const geminiRes = await response.json();
        const rawContent = geminiRes.candidates?.[0]?.content?.parts?.[0]?.text;
        const quizData = JSON.parse(rawContent);
        return res.json({ quiz: quizData });
    } catch (err) {
        return res.status(500).json({ error: 'Quiz generation failed.' });
    }
});

// Progress Tracker & Record Saving Endpoint
app.post('/api/progress/save', async (req, res) => {
    const { email, courseTitle, score } = req.body;
    try {
        const { data, error } = await supabase
            .from('user_course_progress')
            .upsert([{
                user_email: email.trim().toLowerCase(),
                course_title: courseTitle,
                video_completed: true,
                quiz_passed: score >= 60,
                score: score,
                completed_at: new Date()
            }], { onConflict: 'user_email,course_title' });

        if (error) return res.status(400).json({ error: error.message });
        return res.json({ message: 'Progress recorded successfully' });
    } catch (err) {
        return res.status(500).json({ error: 'Progress save error' });
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
        if (error) return res.status(400).json({ error: error.message });
        return res.status(201).json({ message: 'Employee registered successfully', user: data ? data[0] : req.body });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });
    try {
        const { data, error } = await supabase
            .from('employees')
            .select('id, name, email, password, cadre, department, designation')
            .ilike('email', email.trim().toLowerCase())
            .maybeSingle();

        if (error || !data || data.password !== password) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }
        const { password: _, ...userProfile } = data;
        return res.json({ message: 'Authentication successful', user: userProfile });
    } catch (err) {
        return res.status(500).json({ error: 'Login error' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`MoSPI Backend running on port ${PORT}`));
