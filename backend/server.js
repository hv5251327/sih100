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

app.get('/api/competencies/:email', async (req, res) => {
    const email = req.params.email.trim().toLowerCase();
    try {
        let { data } = await supabase
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

// Grounded RAG Recommendation Engine using Supabase Master Bank + Gemini Ranking
app.post('/api/recommendations', async (req, res) => {
    const { cadre, department, designation } = req.body;

    if (!cadre || !department || !designation) {
        return res.status(400).json({ error: 'Cadre, department, and designation are required.' });
    }

    try {
        // 1. Check if cached recommendations exist
        const { data: cached } = await supabase
            .from('recommended_courses')
            .select('*')
            .eq('cadre', cadre)
            .eq('department', department)
            .eq('designation', designation);

        if (cached && cached.length >= 10) {
            return res.json({ courses: cached, source: 'database' });
        }

        // 2. Fetch ground truth master course bank from Supabase
        const { data: masterBank, error: bankErr } = await supabase
            .from('master_courses')
            .select('*');

        if (bankErr || !masterBank || masterBank.length === 0) {
            return res.status(500).json({ error: 'Master course bank unavailable.' });
        }

        // 3. Grounded Gemini Prompt (RAG)
        const apiKey = GEMINI_API_KEY || process.env.GEMINI_API_KEY;
        let selectedCourses = [];

        if (apiKey) {
            const prompt = `You are the Director General of NSSTA (National Statistical Systems Training Academy), MoSPI.
Analyse this officer profile:
- Cadre: ${cadre}
- Department: ${department}
- Designation: ${designation}

From the verified NSSTA Master Course Bank below, select the most relevant courses and organize them into 3 stages:
Stage 1: Foundation (Induction & Core Compliance)
Stage 2: Functional Core (Direct Departmental Responsibilities)
Stage 3: Advanced Strategic (Specialized Analytics & Leadership)

VERIFIED MASTER COURSE BANK:
${JSON.stringify(masterBank.map(m => ({ code: m.course_code, title: m.title, category: m.category, target: m.target_division, diff: m.difficulty_level, desc: m.description })))}

Select all applicable courses from the bank (at least 12-18 courses). For each selected course, explain the specific operational reason for this officer.

Return ONLY a valid JSON array of objects:
[
  {
    "course_code": "Exact Code from Bank",
    "learning_stage": "Foundation | Functional Core | Advanced Strategic",
    "custom_reason": "Specific operational rationale for this officer"
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
            const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
            const parsedRag = JSON.parse(rawContent);

            const bankMap = new Map(masterBank.map(m => [m.course_code, m]));
            selectedCourses = parsedRag.map(item => {
                const base = bankMap.get(item.course_code) || masterBank[0];
                return {
                    cadre,
                    department,
                    designation,
                    course_code: base.course_code,
                    title: base.title,
                    category: base.category,
                    difficulty_level: base.difficulty_level,
                    learning_stage: item.learning_stage || 'Functional Core',
                    description: item.custom_reason || base.description,
                    video_url: base.video_url
                };
            });
        } else {
            // Fallback selection if API key is not configured
            selectedCourses = masterBank.map(m => ({
                cadre,
                department,
                designation,
                course_code: m.course_code,
                title: m.title,
                category: m.category,
                difficulty_level: m.difficulty_level,
                learning_stage: m.difficulty_level === 'Foundation' ? 'Foundation' : (m.difficulty_level === 'Intermediate' ? 'Functional Core' : 'Advanced Strategic'),
                description: m.description,
                video_url: m.video_url
            }));
        }

        if (selectedCourses.length > 0) {
            await supabase.from('recommended_courses').insert(selectedCourses);
        }

        return res.json({ courses: selectedCourses, source: 'rag_ai_grounded' });
    } catch (err) {
        console.error('RAG Error:', err);
        return res.status(500).json({ error: 'Recommendation generation failed.' });
    }
});

// Dynamic AI Assessment Quiz Generator
app.post('/api/generate-quiz', async (req, res) => {
    const { courseTitle, category } = req.body;
    const apiKey = GEMINI_API_KEY || process.env.GEMINI_API_KEY;

    try {
        const prompt = `Generate a 3-question multiple choice competency evaluation for the course: "${courseTitle}" (${category}). Return ONLY valid JSON:
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
                { question: `What is the core regulatory objective of ${courseTitle}?`, options: ["Standard operational compliance and data integrity", "Manual log keeping", "Unregulated survey sampling", "Exemption from statutory audits"], correctIndex: 0 },
                { question: "How are compliance milestones tracked on the MoSPI portal?", options: ["Automated digital validation", "Informal verbal updates", "Paper registers only", "No verification required"], correctIndex: 0 },
                { question: "Which framework governs official statistical disclosures?", options: ["MoSPI Data Policy & DPDP Act", "Generic public rules", "Unverified guidelines", "Informal directives"], correctIndex: 0 }
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
            const prompt = `You are Bhashini AI on the MoSPI iGOT Portal. Officer: ${userProfile?.name}, Cadre: ${userProfile?.cadre}, Dept: ${userProfile?.department}, Designation: ${userProfile?.designation}. Question: "${message}". Give a helpful 2-sentence response guiding them through their Foundation, Functional Core, and Advanced Strategic NSSTA modules.`;
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const data = await response.json();
            return res.json({ reply: data.candidates?.[0]?.content?.parts?.[0]?.text });
        } catch (e) {}
    }

    return res.json({ reply: `Namaste ${userProfile?.name || 'Officer'}! Follow your 3-stage learning roadmap below to build role competencies from 0% to 100%.` });
});

// Update progress and increment competency scores
app.post('/api/progress/save', async (req, res) => {
    const { email, courseTitle, score } = req.body;
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
