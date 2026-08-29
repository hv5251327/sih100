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

// AI Course Recommendation Endpoint
app.post('/api/recommendations', async (req, res) => {
    const { cadre, department, designation } = req.body;

    if (!cadre || !department || !designation) {
        return res.status(400).json({ error: 'Cadre, department, and designation are required.' });
    }

    try {
        // 1. Check if cached recommendations exist in Supabase
        const { data: cached, error: cacheErr } = await supabase
            .from('recommended_courses')
            .select('*')
            .eq('cadre', cadre)
            .eq('department', department)
            .eq('designation', designation);

        if (!cacheErr && cached && cached.length >= 10) {
            return res.json({ courses: cached, source: 'database' });
        }

        // 2. Curated NSSTA & iGOT MoSPI YouTube Embed IDs pool
        const curatedVideos = [
            { id: "mak7BPe_0jY", title: "POSH at Workplace & Statutory Ethics", cat: "Governance & Statutory" },
            { id: "a3xD_eysXQI", title: "Civil Defence & Disaster Preparedness Protocols", cat: "Field Safety" },
            { id: "H16CzEcSC6U", title: "Office Safety & Fire Prevention Standards", cat: "Facility Safety" },
            { id: "HqlLctm0qpE", title: "Swachhata Protocols & Administrative Hygiene", cat: "Administration" },
            { id: "WS0lQc_3Yf0", title: "National Accounts Statistics (NAS) & GDP Compilation", cat: "Macro Statistics" },
            { id: "MScsT8KkyR4", title: "Index of Industrial Production (IIP) & ASI Framework", cat: "Economic Statistics" },
            { id: "q_4eC8pM26I", title: "Consumer Price Index (CPI) & Inflation Basket Analysis", cat: "Price Statistics" },
            { id: "tPYj3fFJGjk", title: "Survey Sampling Design & Field Estimation Techniques", cat: "Sample Surveys" },
            { id: "fHw4k7jXp0c", title: "Python & Pandas for Official Statistical Analysis", cat: "Technical Tools" },
            { id: "HXV3zeRR3h4", title: "SQL & Relational Database Validation for Large Surveys", cat: "Data Processing" },
            { id: "kJQP7kiw5Fk", title: "Digital Personal Data Protection (DPDP) Act Compliance", cat: "Digital Governance" },
            { id: "8mAITcNt710", title: "SDG Indicators Monitoring & Data Localization", cat: "Social Statistics" },
            { id: "9bZkp7q19f0", title: "Field Operations & Digital Computer-Assisted Surveys", cat: "Field Operations" },
            { id: "L_LUpnjgPso", title: "Time Series Econometrics & Seasonal Adjustments", cat: "Applied Econometrics" },
            { id: "rfscVS0vtbw", title: "Leadership, Team Management & Administrative Vigilance", cat: "Leadership & Ethics" }
        ];

        // 3. Query Gemini for customized mapping
        const apiKey = GEMINI_API_KEY || process.env.GEMINI_API_KEY;
        const prompt = `You are the AI Training Director at NSSTA (National Statistical Systems Training Academy), MoSPI, Government of India.
Generate a tailored training syllabus of 15 targeted training modules for an officer with:
- Cadre: ${cadre}
- Department/Division: ${department}
- Designation: ${designation}

Match each module with realistic statistical objectives and assign an appropriate YouTube video embed ID from this list:
${JSON.stringify(curatedVideos.map(v => ({ id: v.id, defaultTitle: v.title, cat: v.cat })))}

Return ONLY a valid JSON array of 15 objects matching this exact structure:
[
  {
    "title": "Title of Module",
    "description": "Brief description of why this officer needs this training.",
    "category": "Category Name",
    "youtube_id": "Valid 11-char YouTube ID from above list"
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
        let generatedCourses = JSON.parse(rawContent);

        // Map courses with officer metadata for DB insertion
        const rowsToInsert = generatedCourses.map(c => ({
            cadre,
            department,
            designation,
            title: c.title,
            description: c.description,
            category: c.category,
            youtube_id: c.youtube_id
        }));

        // 4. Cache generated courses into Supabase
        await supabase.from('recommended_courses').insert(rowsToInsert);

        return res.json({ courses: rowsToInsert, source: 'ai_generated' });
    } catch (err) {
        console.error('Recommendation Engine Error:', err);
        return res.status(500).json({ error: 'Failed to generate recommendations.' });
    }
});

// Dynamic AI Quiz Generator for Completed Video
app.post('/api/generate-quiz', async (req, res) => {
    const { courseTitle, category } = req.body;
    const apiKey = GEMINI_API_KEY || process.env.GEMINI_API_KEY;

    const prompt = `Generate a 3-question multiple choice competency assessment for MoSPI officers on the subject: "${courseTitle}" (${category}).
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

// Record user completion & quiz progress
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
