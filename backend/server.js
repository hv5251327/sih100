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

// Fetch all videos from DB table and use Gemini to recommend the best matching set for the officer
app.post('/api/recommendations', async (req, res) => {
    const { cadre, department, designation } = req.body;

    try {
        const { data: allDbVideos, error } = await supabase
            .from('master_courses')
            .select('*');

        if (error || !allDbVideos || allDbVideos.length === 0) {
            return res.status(500).json({ error: 'No videos found in master database table.' });
        }

        if (GEMINI_API_KEY) {
            try {
                const prompt = `You are the NSSTA Training Director. Select and rank the most suitable videos from the database table for this officer:
Officer Profile:
- Cadre: ${cadre}
- Department: ${department}
- Designation: ${designation}

AVAILABLE VIDEOS IN DATABASE:
${JSON.stringify(allDbVideos.map(v => ({ id: v.id, code: v.course_code, title: v.title, category: v.category, target: v.target_division, desc: v.description })))}

Select all matching videos suited for this officer and classify each into: "Foundation", "Functional Core", or "Advanced Strategic".
Return ONLY a valid JSON array of objects:
[
  {
    "id": video_id_from_db,
    "learning_stage": "Foundation | Functional Core | Advanced Strategic"
  }
]`;

                const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { responseMimeType: "application/json" }
                    })
                });

                const aiData = await aiRes.json();
                const rankedList = JSON.parse(aiData.candidates[0].content.parts[0].text);
                const dbMap = new Map(allDbVideos.map(v => [v.id, v]));

                const tailored = rankedList
                    .filter(item => dbMap.has(item.id))
                    .map(item => ({
                        ...dbMap.get(item.id),
                        learning_stage: item.learning_stage || 'Functional Core'
                    }));

                if (tailored.length > 0) {
                    return res.json({ courses: tailored, source: 'db_ai_matched' });
                }
            } catch (aiErr) {
                console.warn('AI ranking failed, falling back to direct DB return', aiErr);
            }
        }

        const fallback = allDbVideos.map(v => ({
            ...v,
            learning_stage: v.difficulty_level === 'Foundation' ? 'Foundation' : (v.difficulty_level === 'Intermediate' ? 'Functional Core' : 'Advanced Strategic')
        }));

        return res.json({ courses: fallback, source: 'db_direct' });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to recommend videos from DB.' });
    }
});

app.post('/api/generate-quiz', async (req, res) => {
    const { courseTitle, category } = req.body;
    try {
        const prompt = `Generate a 3-question MCQ competency evaluation for course: "${courseTitle}" (${category}). Return ONLY valid JSON:
[{"question":"...","options":["A","B","C","D"],"correctIndex":0}]`;
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });
        const data = await response.json();
        return res.json({ quiz: JSON.parse(data.candidates[0].content.parts[0].text) });
    } catch (err) {
        return res.json({
            quiz: [
                { question: `What is the key regulatory protocol taught in ${courseTitle}?`, options: ["Ensuring standard operational compliance and data integrity", "Manual log keeping", "Unregulated sampling", "Exemption from statutory audits"], correctIndex: 0 },
                { question: "How are compliance milestones tracked on the MoSPI portal?", options: ["Automated digital submission & validation", "Informal verbal updates", "Paper registers only", "No verification required"], correctIndex: 0 },
                { question: "Which framework governs official statistical disclosures?", options: ["MoSPI Data Policy & DPDP Act", "Generic public domain rules", "Unverified guidelines", "Local administrative orders only"], correctIndex: 0 }
            ]
        });
    }
});

app.post('/api/chatbot', async (req, res) => {
    const { message, userProfile } = req.body;
    if (GEMINI_API_KEY) {
        try {
            const prompt = `You are Bhashini AI on MoSPI Portal. Officer: ${userProfile?.name}, Dept: ${userProfile?.department}, Designation: ${userProfile?.designation}. Question: "${message}". Reply concisely in 2 sentences recommending database modules.`;
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const data = await response.json();
            return res.json({ reply: data.candidates?.[0]?.content?.parts?.[0]?.text });
        } catch (e) {}
    }
    return res.json({ reply: `Namaste ${userProfile?.name || 'Officer'}! Complete your assigned database training courses below to eliminate competency deficits.` });
});

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
        await supabase.from('officer_competencies').insert([{ user_email: cleanEmail, statistical_score: 0, technical_score: 0, governance_score: 0, leadership_score: 0 }]);
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

        if (error || !data || data.password !== password) return res.status(401).json({ error: 'Invalid email or password.' });
        const { password: _, ...userProfile } = data;
        return res.json({ message: 'Authentication successful', user: userProfile });
    } catch (err) {
        return res.status(500).json({ error: 'Login error' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`MoSPI Backend running on port ${PORT}`));
