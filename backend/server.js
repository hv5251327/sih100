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
    const email = (req.params.email || '').trim().toLowerCase();
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

function parseDeptCode(deptStr) {
    if (!deptStr) return 'ALL';
    const match = deptStr.match(/\(([^)]+)\)/);
    if (match && match[1]) return match[1].trim().toUpperCase();
    
    const knownCodes = ['NAD', 'ESD', 'PSD', 'SSD', 'FOD', 'SDRD', 'DPD', 'DIID', 'NSSTA', 'CAPD', 'NSSO', 'IPMD', 'SDG_LAB', 'STATE_DES', 'DSO', 'TALUK'];
    for (const code of knownCodes) {
        if (deptStr.toUpperCase().includes(code)) return code;
    }
    return deptStr.trim();
}

app.post('/api/recommendations', async (req, res) => {
    const { department, cadre, designation } = req.body;
    const deptCode = parseDeptCode(department);

    try {
        // 1. Check if cached recommendations exist
        const { data: cachedRecommendations } = await supabase
            .from('recommended_courses')
            .select('*')
            .eq('cadre', cadre || '')
            .eq('department', department || '')
            .eq('designation', designation || '');

        if (cachedRecommendations && cachedRecommendations.length >= 6) {
            return res.json({ courses: cachedRecommendations, source: 'database_cached' });
        }

        // 2. Fetch all courses from master_courses
        let { data: allCourses } = await supabase
            .from('master_courses')
            .select('*')
            .order('id');

        // Fallback default courses if database table is completely empty
        if (!allCourses || allCourses.length === 0) {
            allCourses = [
                { id: 1, course_code: 'GEN-01', title: 'Digital Personal Data Protection (DPDP) Act 2023 for Official Statisticians', domain: 'Digital Governance', difficulty_level: 'Foundation', description: 'Statutory compliance on respondent data privacy and data safeguards.', video_url: 'https://portal.igotkarmayogi.gov.in', is_general_mandatory: true, target_departments: ['ALL'] },
                { id: 2, course_code: 'GEN-02', title: 'Prevention of Sexual Harassment (POSH) at Workplace & Civil Service Ethics', domain: 'Digital Governance', difficulty_level: 'Foundation', description: 'Mandatory statutory compliance under POSH Act 2013 and ethical administration.', video_url: 'https://portal.igotkarmayogi.gov.in', is_general_mandatory: true, target_departments: ['ALL'] },
                { id: 3, course_code: 'GEN-03', title: 'Civil Defence, First Aid & Disaster Risk Mitigation Protocols', domain: 'Behavioural & Managerial', difficulty_level: 'Foundation', description: 'NDRF disaster management protocols and institutional emergency safety.', video_url: 'https://portal.igotkarmayogi.gov.in', is_general_mandatory: true, target_departments: ['ALL'] },
                { id: 4, course_code: 'GEN-04', title: 'Swachhata Protocols & e-Office Records Management', domain: 'Behavioural & Managerial', difficulty_level: 'Foundation', description: 'e-Office 7.0 digital record archiving and office administration governance.', video_url: 'https://portal.igotkarmayogi.gov.in', is_general_mandatory: true, target_departments: ['ALL'] },
                { id: 5, course_code: 'GEN-06', title: 'Python & Pandas for Official Statistical Analysis & Data Wrangling', domain: 'Technical Competencies', difficulty_level: 'Foundation', description: 'Large survey data transformation, missing value treatment, and summaries in Python.', video_url: 'https://portal.igotkarmayogi.gov.in', is_general_mandatory: true, target_departments: ['ALL'] },
                { id: 6, course_code: 'GEN-07', title: 'Relational SQL & Survey Microdata Validation Queries', domain: 'Technical Competencies', difficulty_level: 'Foundation', description: 'Database modeling, integrity joins, and complex analytical SQL queries.', video_url: 'https://portal.igotkarmayogi.gov.in', is_general_mandatory: true, target_departments: ['ALL'] },
                { id: 7, course_code: 'SPEC-IPMD-01', title: 'Online Computerised Monitoring System (OCMS) & Mega Project Auditing', domain: 'Behavioural & Managerial', difficulty_level: 'Intermediate', description: 'Milestone tracking and cost overrun auditing for central infrastructure projects.', video_url: 'https://portal.igotkarmayogi.gov.in', is_general_mandatory: false, target_departments: ['IPMD', 'ALL'] },
                { id: 8, course_code: 'SPEC-STAT-01', title: 'Time Series Econometrics & Seasonal Adjustments (X-13ARIMA)', domain: 'Statistical Competencies', difficulty_level: 'Advanced', description: 'Decomposing statistical seasonalities in monthly production and price indices.', video_url: 'https://portal.igotkarmayogi.gov.in', is_general_mandatory: false, target_departments: ['ALL'] }
            ];
        }

        // 3. Extract mandatory foundation courses for all officers
        const mandatoryFoundation = allCourses
            .filter(c => c.is_general_mandatory === true)
            .map(c => ({ ...c, learning_stage: 'Foundation' }));

        const domainPool = allCourses.filter(c => c.is_general_mandatory !== true);
        let domainCourses = [];

        // 4. AI Semantic Matching via Gemini
        if (GEMINI_API_KEY) {
            try {
                const prompt = `You are the NSSTA Training Director at MoSPI.
Officer: Cadre: ${cadre}, Department: ${department} (Code: ${deptCode}), Designation: ${designation}.

Select the most relevant domain courses from this list:
${JSON.stringify(domainPool.map(c => ({ id: c.id, code: c.course_code, title: c.title, domain: c.domain, target: c.target_departments, desc: c.description })))}

Assign each selected course to either "Functional Core" or "Advanced Strategic".
Return ONLY valid JSON array with format:
[{"id": 1, "learning_stage": "Functional Core"}]`;

                const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { responseMimeType: "application/json" }
                    })
                });

                const aiData = await aiRes.json();
                let rawText = aiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

                if (rawText) {
                    const aiSelections = JSON.parse(rawText);
                    const poolMap = new Map(domainPool.map(c => [c.id, c]));

                    domainCourses = aiSelections
                        .filter(item => poolMap.has(item.id))
                        .map(item => ({
                            ...poolMap.get(item.id),
                            learning_stage: item.learning_stage || 'Functional Core'
                        }));
                }
            } catch (e) {
                console.warn('AI ranking fallback applied:', e.message);
            }
        }

        // Deterministic fallback matching if AI returns no items
        if (domainCourses.length === 0) {
            domainCourses = domainPool
                .filter(c => {
                    const targets = Array.isArray(c.target_departments) ? c.target_departments : ['ALL'];
                    return targets.includes('ALL') || targets.includes(deptCode);
                })
                .map(c => {
                    const targets = Array.isArray(c.target_departments) ? c.target_departments : ['ALL'];
                    return {
                        ...c,
                        learning_stage: targets.includes(deptCode) ? 'Functional Core' : 'Advanced Strategic'
                    };
                });
        }

        // If domain courses still empty, take top remaining courses
        if (domainCourses.length === 0) {
            domainCourses = domainPool.slice(0, 4).map(c => ({
                ...c,
                learning_stage: 'Functional Core'
            }));
        }

        const combined = [...mandatoryFoundation, ...domainCourses];

        // 5. Cache into recommended_courses table
        try {
            const rowsToInsert = combined.map(c => ({
                cadre: cadre || 'General Cadre',
                department: department || 'MoSPI',
                designation: designation || 'Statistical Officer',
                course_code: c.course_code || 'MOD-01',
                title: c.title,
                domain: c.domain || 'General',
                difficulty_level: c.difficulty_level || 'Foundation',
                learning_stage: c.learning_stage || 'Functional Core',
                description: c.description || 'Statutory training module for official statisticians.',
                video_url: c.video_url || 'https://portal.igotkarmayogi.gov.in'
            }));

            await supabase.from('recommended_courses').insert(rowsToInsert);
        } catch (dbSaveErr) {
            console.warn('Recommendation caching error:', dbSaveErr.message);
        }

        return res.json({ courses: combined, source: 'database_recommended' });
    } catch (err) {
        console.error('Final Recommendation Error:', err);
        return res.status(500).json({ error: 'Failed to recommend courses.' });
    }
});

app.post('/api/generate-quiz', async (req, res) => {
    const { courseTitle, category } = req.body;
    try {
        const prompt = `Generate 3 multiple choice questions for course: "${courseTitle}" (${category}). Return ONLY valid JSON:
[{"question":"Question text?","options":["A","B","C","D"],"correctIndex":0}]`;
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });
        const data = await response.json();
        let rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
        return res.json({ quiz: JSON.parse(rawText) });
    } catch (err) {
        return res.json({
            quiz: [
                { question: `What is the core regulatory objective of ${courseTitle}?`, options: ["Standard statutory compliance and data integrity", "Manual log keeping", "Unregulated survey sampling", "Exemption from audits"], correctIndex: 0 },
                { question: "How are compliance milestones verified on the portal?", options: ["Automated digital submission & validation", "Informal verbal updates", "Paper registers only", "No verification"], correctIndex: 0 },
                { question: "Which framework governs data processing and security?", options: ["MoSPI Data Policy & DPDP Act 2023", "Generic social media rules", "Unverified guidelines", "Local informal orders"], correctIndex: 0 }
            ]
        });
    }
});

app.post('/api/chatbot', async (req, res) => {
    const { message, userProfile } = req.body;
    if (GEMINI_API_KEY) {
        try {
            const prompt = `You are Bhashini AI on MoSPI Portal. Officer: ${userProfile?.name}, Dept: ${userProfile?.department}. Question: "${message}". Reply concisely in 2 sentences recommending their Foundation and Functional courses.`;
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const data = await response.json();
            return res.json({ reply: data?.candidates?.[0]?.content?.parts?.[0]?.text });
        } catch (e) {}
    }
    return res.json({ reply: `Namaste ${userProfile?.name || 'Officer'}! Complete your mandatory Foundation modules and departmental Functional Core courses below to bridge your competency gap.` });
});

app.post('/api/progress/save', async (req, res) => {
    const { email, courseTitle, score } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase();

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
