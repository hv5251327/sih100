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

// Fetch or initialize officer competency progress (defaults to 0% for new officers)
app.get('/api/competencies/:email', async (req, res) => {
    const email = req.params.email.trim().toLowerCase();
    try {
        let { data, error } = await supabase
            .from('officer_competencies')
            .select('*')
            .eq('user_email', email)
            .maybeSingle();

        if (!data) {
            const { data: created } = await supabase
                .from('officer_competencies')
                .insert([{
                    user_email: email,
                    statistical_score: 0,
                    technical_score: 0,
                    governance_score: 0,
                    leadership_score: 0
                }])
                .select()
                .single();
            data = created;
        }

        return res.json(data);
    } catch (err) {
        return res.json({ statistical_score: 0, technical_score: 0, governance_score: 0, leadership_score: 0 });
    }
});

// Dynamic AI Course & Video Generation per Cadre, Department, and Designation
app.post('/api/recommendations', async (req, res) => {
    const { cadre, department, designation } = req.body;

    if (!cadre || !department || !designation) {
        return res.status(400).json({ error: 'Cadre, department, and designation are required.' });
    }

    try {
        // 1. Check if DB has courses saved for this exact combination
        const { data: cached, error: cacheErr } = await supabase
            .from('recommended_courses')
            .select('*')
            .eq('cadre', cadre)
            .eq('department', department)
            .eq('designation', designation);

        if (!cacheErr && cached && cached.length >= 15) {
            return res.json({ courses: cached, source: 'database' });
        }

        // 2. Query Gemini AI to create 15 custom courses tailored specifically to this officer
        const apiKey = GEMINI_API_KEY || process.env.GEMINI_API_KEY;
        const prompt = `You are the AI Training Director at NSSTA (National Statistical Systems Training Academy), MoSPI, Government of India.
Generate a tailored training syllabus of 15 targeted iGOT Karmayogi video modules for an officer with:
- Cadre: ${cadre}
- Department: ${department}
- Designation: ${designation}

Ensure topics directly address the officer's specific operational responsibilities (e.g. IPMD officers need OCMS & Project Monitoring; NAD officers need GDP compilation; FOD officers need sample field validation).

Return ONLY a valid JSON array of 15 objects matching this exact structure:
[
  {
    "title": "Exact iGOT Karmayogi Video Course Title",
    "category": "Domain (Statistical Methods, Technical Tools, Digital Governance, or Leadership)",
    "description": "Specific operational purpose for this designation in MoSPI.",
    "video_url": "https://portal.igotkarmayogi.gov.in"
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
            video_url: c.video_url || 'https://portal.igotkarmayogi.gov.in'
        }));

        // 3. Save to database for caching
        await supabase.from('recommended_courses').insert(rowsToInsert);

        return res.json({ courses: rowsToInsert, source: 'ai_generated' });
    } catch (err) {
        console.error('AI Recommendation Error:', err);
        return res.status(500).json({ error: 'Failed to generate tailored courses.' });
    }
});

// Dynamic AI Quiz Generator
app.post('/api/generate-quiz', async (req, res) => {
    const { courseTitle, category } = req.body;
    const apiKey = GEMINI_API_KEY || process.env.GEMINI_API_KEY;

    try {
        const prompt = `Generate a 3-question multiple choice competency assessment for the iGOT course: "${courseTitle}" (${category}). Return ONLY valid JSON:
[
  {
    "question": "Question text?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0
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
        const data = await response.json();
        const quiz = JSON.parse(data.candidates[0].content.parts[0].text);
        return res.json({ quiz });
    } catch (err) {
        return res.json({
            quiz: [
                { question: `What is the key regulatory protocol taught in ${courseTitle}?`, options: ["Ensuring standard operational compliance and data integrity", "Manual offline record keeping", "Unregulated survey sampling", "Exemption from statutory audits"], correctIndex: 0 },
                { question: "How are compliance milestones tracked on the MoSPI portal?", options: ["Automated digital submission & validation", "Informal verbal updates", "Paper registers only", "No verification required"], correctIndex: 0 },
                { question: "Which framework governs official statistical disclosures?", options: ["MoSPI Data Policy & DPDP Act", "Generic public domain rules", "Unverified guidelines", "Local administrative orders only"], correctIndex: 0 }
            ]
        });
    }
});

// Chatbot Endpoint
app.post('/api/chatbot', async (req, res) => {
    const { message, userProfile } = req.body;
    const apiKey = GEMINI_API_KEY || process.env.GEMINI_API_KEY;

    if (apiKey) {
        try {
            const prompt = `You are Bhashini AI on the MoSPI iGOT Portal. Officer: ${userProfile?.name}, Cadre: ${userProfile?.cadre}, Dept: ${userProfile?.department}, Designation: ${userProfile?.designation}. Question: "${message}". Give a helpful 2-sentence response advising them on courses to reduce their competency gap.`;
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const data = await response.json();
            return res.json({ reply: data.candidates?.[0]?.content?.parts?.[0]?.text });
        } catch (e) {}
    }

    return res.json({ reply: `Namaste ${userProfile?.name || 'Officer'}! Complete your 15 tailored iGOT video modules below to raise your competency score above 0%.` });
});

// Update progress and increase competency scores
app.post('/api/progress/save', async (req, res) => {
    const { email, courseTitle, score, category } = req.body;
    const cleanEmail = email.trim().toLowerCase();

    try {
        await supabase
            .from('user_course_progress')
            .upsert([{
                user_email: cleanEmail,
                course_title: courseTitle,
                video_completed: true,
                quiz_passed: score >= 60,
                score: score,
                completed_at: new Date()
            }], { onConflict: 'user_email,course_title' });

        // Increment user score across competency pillars
        const { data: comp } = await supabase.from('officer_competencies').select('*').eq('user_email', cleanEmail).maybeSingle();
        if (comp) {
            await supabase.from('officer_competencies').update({
                statistical_score: Math.min(100, (comp.statistical_score || 0) + 15),
                technical_score: Math.min(100, (comp.technical_score || 0) + 15),
                governance_score: Math.min(100, (comp.governance_score || 0) + 15),
                leadership_score: Math.min(100, (comp.leadership_score || 0) + 15),
                updated_at: new Date()
            }).eq('user_email', cleanEmail);
        }

        return res.json({ message: 'Progress recorded' });
    } catch (err) {
        return res.status(500).json({ error: 'Save error' });
    }
});

app.post('/api/auth/register', async (req, res) => {
    const { name, email, password, cadre, department, designation } = req.body;
    if (!email || !password || !name || !cadre || !department || !designation) {
        return res.status(400).json({ error: 'All fields are required.' });
    }
    const cleanEmail = email.trim().toLowerCase();
    try {
        const { data, error } = await supabase
            .from('employees')
            .insert([{ name: name.trim(), email: cleanEmail, password: password, cadre: cadre.trim(), department: department.trim(), designation: designation.trim() }])
            .select();

        if (error) return res.status(400).json({ error: error.message });

        // Initialize 0% competency entry for new user
        await supabase.from('officer_competencies').insert([{
            user_email: cleanEmail,
            statistical_score: 0,
            technical_score: 0,
            governance_score: 0,
            leadership_score: 0
        }]);

        return res.status(201).json({ message: 'Registered successfully', user: data[0] });
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
