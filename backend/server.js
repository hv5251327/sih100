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
    res.json({ status: 'MoSPI Skill Intelligence Engine Active', timestamp: new Date() });
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

// Helper: Extract Department Acronym (e.g. 'IPMD' from 'Infrastructure & Project Monitoring Division (IPMD)')
function parseDeptCode(deptStr) {
    if (!deptStr) return 'ALL';
    const match = deptStr.match(/\(([^)]+)\)/);
    return match ? match[1].trim() : deptStr.trim();
}

// Intelligent Semantic Course Recommendation over Entire Database Bank
app.post('/api/recommendations', async (req, res) => {
    const { cadre, department, designation } = req.body;
    const deptCode = parseDeptCode(department);

    try {
        // 1. Retrieve all active courses from Supabase database
        const { data: allCourses, error: dbErr } = await supabase
            .from('master_courses')
            .select('*')
            .order('id');

        if (dbErr || !allCourses || allCourses.length === 0) {
            return res.status(500).json({ error: 'No course catalog found in database.' });
        }

        // 2. Extract Mandatory Foundation Courses (Present for all officers)
        const mandatoryList = allCourses.filter(c => c.is_mandatory_core === true);
        const nonMandatoryPool = allCourses.filter(c => c.is_mandatory_core !== true);

        let rankedDomainCourses = [];

        // 3. AI Semantic Relevance Matching across remaining DB courses
        if (GEMINI_API_KEY) {
            try {
                const prompt = `You are the AI Chief Learning Officer for MoSPI / NSSTA.
Officer Profile:
- Cadre: ${cadre}
- Department: ${department} (Code: ${deptCode})
- Designation: ${designation}

AVAILABLE COURSES IN DATABASE:
${JSON.stringify(nonMandatoryPool.map(c => ({ id: c.id, code: c.course_code, title: c.title, domain: c.domain, tags: c.competency_tags, target: c.target_divisions, desc: c.description })))}

Select the most relevant courses from the above database pool that directly support this officer's domain tasks and technical growth.
Assign each selected course a structured stage: "Functional Core" (Direct job alignment) or "Advanced Strategic" (Advanced modeling/leadership).
Return ONLY a valid JSON array of objects:
[
  {
    "id": course_id,
    "learning_stage": "Functional Core | Advanced Strategic",
    "rationale": "1-sentence direct job reason why this officer needs this course"
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
                const aiRankings = JSON.parse(aiData.candidates[0].content.parts[0].text);
                const poolMap = new Map(nonMandatoryPool.map(c => [c.id, c]));

                rankedDomainCourses = aiRankings
                    .filter(item => poolMap.has(item.id))
                    .map(item => {
                        const base = poolMap.get(item.id);
                        return {
                            ...base,
                            learning_stage: item.learning_stage || 'Functional Core',
                            description: item.rationale || base.description
                        };
                    });
            } catch (aiErr) {
                console.warn('AI ranking fallback to deterministic matching:', aiErr);
            }
        }

        // Fallback if AI is unconfigured or failed: deterministic department matching
        if (rankedDomainCourses.length === 0) {
            rankedDomainCourses = nonMandatoryPool.map(c => {
                const isDirectDept = c.target_divisions.includes(deptCode);
                return {
                    ...c,
                    learning_stage: isDirectDept ? 'Functional Core' : (c.difficulty_level === 'Advanced' ? 'Advanced Strategic' : 'Functional Core')
                };
            });
        }

        // 4. Combine Mandatory Foundation with Ranked Domain Courses
        const formattedMandatory = mandatoryList.map(c => ({
            ...c,
            learning_stage: 'Foundation'
        }));

        const finalSyllabus = [...formattedMandatory, ...rankedDomainCourses];

        return res.json({
            courses: finalSyllabus,
            source: 'db_intelligent_recommendation',
            total: finalSyllabus.length
        });
    } catch (err) {
        console.error('Course recommendation error:', err);
        return res.status(500).json({ error: 'Failed to generate recommendations.' });
    }
});

// Dynamic AI MCQ Evaluation Generator
app.post('/api/generate-quiz', async (req, res) => {
    const { courseTitle, category } = req.body;
    try {
        const prompt = `Generate a 3-question multiple choice competency assessment for MoSPI officers on: "${courseTitle}" (${category}). Return ONLY valid JSON array:
[{"question":"...","options":["Option A","Option B","Option C","Option D"],"correctIndex":0}]`;
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
                { question: `What is the key regulatory protocol taught in ${courseTitle}?`, options: ["Ensuring statutory compliance and statistical reliability", "Manual ledger management", "Unregulated survey sampling", "Exemption from statutory audits"], correctIndex: 0 },
                { question: "How are compliance milestones tracked on the MoSPI portal?", options: ["Automated digital submission & validation", "Informal verbal updates", "Paper registers only", "No verification required"], correctIndex: 0 },
                { question: "Which framework governs official data disclosures and respondent privacy?", options: ["MoSPI Data Policy & DPDP Act 2023", "Generic social media rules", "Unverified guidelines", "Local administrative orders only"], correctIndex: 0 }
            ]
        });
    }
});

// Bhashini AI Chatbot
app.post('/api/chatbot', async (req, res) => {
    const { message, userProfile } = req.body;
    if (GEMINI_API_KEY) {
        try {
            const prompt = `You are Bhashini AI on the MoSPI Skill Intelligence Portal. Officer: ${userProfile?.name}, Cadre: ${userProfile?.cadre}, Dept: ${userProfile?.department}, Designation: ${userProfile?.designation}. Question: "${message}". Give a helpful 2-sentence response explaining how completing their Foundation, Functional Core, and Advanced Strategic modules will bridge their competency gaps.`;
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const data = await response.json();
            return res.json({ reply: data.candidates?.[0]?.content?.parts?.[0]?.text });
        } catch (e) {}
    }
    return res.json({ reply: `Namaste ${userProfile?.name || 'Officer'}! Complete your mandatory Foundation modules and departmental Functional Core courses below to bridge your competency gap.` });
});

// Record Assessment & Update Pillar Scores
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

        return res.json({ message: 'Progress saved successfully' });
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

        if (error || !data || data.password !== password) return res.status(401).json({ error: 'Invalid email or password.' });
        const { password: _, ...userProfile } = data;
        return res.json({ message: 'Authentication successful', user: userProfile });
    } catch (err) {
        return res.status(500).json({ error: 'Login error' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`MoSPI Backend running on port ${PORT}`));
