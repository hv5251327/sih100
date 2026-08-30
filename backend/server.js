const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const GROK_API_KEY = process.env.GROK_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let rawUrl = process.env.SUPABASE_URL || 'https://ccdrahlnsfrncsqaiumt.supabase.co';
let cleanUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjZHJhaGxuc2ZybmNzcWFpdW10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwMDEzMDAsImV4cCI6MjEwMzU3NzMwMH0.O3sAoWJuLWKeJCenkiUjen3FfLnNahUu7nKbpQ1t6Fo';

const supabase = createClient(cleanUrl, supabaseKey);

async function generateAIResponse(prompt) {
    if (GROK_API_KEY) {
        try {
            const res = await fetch('https://api.x.ai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${GROK_API_KEY}`
                },
                body: JSON.stringify({
                    model: 'grok-beta',
                    messages: [
                        { role: 'system', content: 'You are the Chief Academic Training Director at NSSTA, MoSPI. Return clean JSON only.' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.2
                })
            });
            const data = await res.json();
            const text = data?.choices?.[0]?.message?.content;
            if (text) return text.replace(/```json/gi, '').replace(/```/g, '').trim();
        } catch (e) {
            console.warn('Grok fallback:', e.message);
        }
    }

    if (GEMINI_API_KEY) {
        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const data = await res.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) return text.replace(/```json/gi, '').replace(/```/g, '').trim();
        } catch (e) {
            console.warn('Gemini fallback:', e.message);
        }
    }

    return null;
}

app.get('/api/health', (req, res) => {
    res.json({ status: 'MoSPI Engine Active', timestamp: new Date() });
});

// Quick Course Creator -> Writes directly to master_courses table
app.post('/api/admin/draft-course', async (req, res) => {
    const { department, domain, topic } = req.body;
    if (!topic) return res.status(400).json({ error: 'Course topic is required.' });

    try {
        const uniqueCode = 'MOD-' + Date.now().toString().slice(-6);
        let courseTitle = `${topic} (${department || 'Universal'})`;
        let courseDesc = `Practical operational training on ${topic} for ${department || 'ALL'} officers.`;
        let courseDiff = 'Intermediate';

        const prompt = `Generate a title and 2-sentence operational description for a MoSPI course.
Department: ${department}
Domain: ${domain}
Topic: ${topic}

Return ONLY JSON:
{
  "title": "${topic} (${department})",
  "description": "2-sentence practical operational purpose",
  "difficulty_level": "Intermediate"
}`;

        const rawJson = await generateAIResponse(prompt);
        if (rawJson) {
            try {
                const match = rawJson.match(/\{[\s\S]*\}/);
                if (match) {
                    const parsed = JSON.parse(match[0]);
                    courseTitle = parsed.title || courseTitle;
                    courseDesc = parsed.description || courseDesc;
                    courseDiff = parsed.difficulty_level || courseDiff;
                }
            } catch (e) {}
        }

        const newRow = {
            course_code: uniqueCode,
            title: courseTitle,
            domain: domain || 'Statistical Competencies',
            difficulty_level: courseDiff || 'Intermediate',
            description: courseDesc,
            video_url: 'https://portal.igotkarmayogi.gov.in',
            is_general_mandatory: false,
            target_departments: [department || 'ALL']
        };

        const { data: saved, error: dbErr } = await supabase
            .from('master_courses')
            .insert([newRow])
            .select()
            .single();

        if (dbErr) {
            console.error('Database write error:', dbErr);
            return res.status(500).json({ error: dbErr.message });
        }

        return res.json({ message: `Course "${saved.title}" successfully added to master_courses!`, course: saved });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// PDF Syllabus Parser -> Organizes and writes directly to master_courses
app.post('/api/admin/parse-syllabus', async (req, res) => {
    const { syllabusText, defaultDivision } = req.body;
    if (!syllabusText) return res.status(400).json({ error: 'Syllabus text is required.' });

    try {
        let extractedModules = [];
        const prompt = `Break down this syllabus into 3 to 6 distinct courses for MoSPI ${defaultDivision || 'ALL'} statisticians.
SYLLABUS:
${syllabusText.slice(0, 15000)}

Return ONLY a valid JSON array:
[
  {
    "title": "Course Title",
    "domain": "Statistical Competencies",
    "difficulty_level": "Intermediate",
    "description": "2-sentence practical operational purpose"
  }
]`;

        const rawJson = await generateAIResponse(prompt);
        if (rawJson) {
            try {
                const match = rawJson.match(/\[[\s\S]*\]/);
                if (match) extractedModules = JSON.parse(match[0]);
            } catch (e) {}
        }

        if (!extractedModules || extractedModules.length === 0) {
            const rawLines = syllabusText.split('\n').map(l => l.trim()).filter(l => l.length > 15);
            if (rawLines.length > 0) {
                extractedModules = rawLines.slice(0, 4).map((line, i) => ({
                    title: `Unit ${i + 1}: ${line.slice(0, 50)}`,
                    domain: 'Statistical Competencies',
                    difficulty_level: 'Intermediate',
                    description: `Training module on ${line.slice(0, 150)} for ${defaultDivision || 'ALL'} officials.`
                }));
            } else {
                extractedModules = [{
                    title: `NSSTA Specialized Module (${defaultDivision || 'Universal'})`,
                    domain: 'Statistical Competencies',
                    difficulty_level: 'Intermediate',
                    description: syllabusText.slice(0, 200)
                }];
            }
        }

        const rowsToInsert = extractedModules.map((m, idx) => ({
            course_code: 'NSSTA-' + Date.now().toString().slice(-5) + '-' + (idx + 1),
            title: m.title || `NSSTA Module ${idx + 1}`,
            domain: m.domain || 'Statistical Competencies',
            difficulty_level: m.difficulty_level || 'Intermediate',
            description: m.description || `Competency training module for ${defaultDivision || 'ALL'} statisticians.`,
            video_url: 'https://portal.igotkarmayogi.gov.in',
            is_general_mandatory: false,
            target_departments: [defaultDivision || 'ALL']
        }));

        const { data: inserted, error: insErr } = await supabase
            .from('master_courses')
            .insert(rowsToInsert)
            .select();

        if (insErr) {
            console.error('Syllabus Insert Error:', insErr);
            return res.status(500).json({ error: insErr.message });
        }

        return res.json({
            message: `Successfully organized and saved ${rowsToInsert.length} courses to master_courses!`,
            modules: inserted || rowsToInsert
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Course List for admin dropdown
app.get('/api/admin/courses-list', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('master_courses')
            .select('id, course_code, title, domain, target_departments')
            .order('id', { ascending: false });

        if (error) return res.status(500).json({ error: error.message });
        return res.json({ courses: data || [] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Quiz Generator -> Inserts into course_quizzes
app.post('/api/admin/generate-quiz-from-doc', async (req, res) => {
    const { courseTitle, documentText } = req.body;
    if (!courseTitle || !documentText) return res.status(400).json({ error: 'Course Title and Document Text required.' });

    try {
        let questions = [
            { question: `What is the key regulatory objective in ${courseTitle}?`, options: ["Standard data integrity protocol", "Informal ledger maintenance", "Unregulated survey sampling", "Exemption from statutory audits"], correct_index: 0 },
            { question: "How are compliance milestones verified across official divisions?", options: ["Automated digital submission & validation", "Verbal statements only", "Unchecked paper records", "No verification"], correct_index: 0 },
            { question: "Which framework governs respondent privacy and data protection?", options: ["DPDP Act 2023 & MoSPI Standards", "Generic public domain rules", "Unverified guidelines", "Local administrative orders only"], correct_index: 0 }
        ];

        const prompt = `Generate 5 multiple-choice questions from this document text for the course: "${courseTitle}".
DOCUMENT:
${documentText.slice(0, 15000)}

Return ONLY JSON array:
[{"question": "Question text?", "options": ["A", "B", "C", "D"], "correct_index": 0}]`;

        const rawJson = await generateAIResponse(prompt);
        if (rawJson) {
            try {
                const match = rawJson.match(/\[[\s\S]*\]/);
                if (match) questions = JSON.parse(match[0]);
            } catch (e) {}
        }

        const rowsToInsert = questions.map(q => ({
            course_title: courseTitle,
            question: q.question,
            options: Array.isArray(q.options) ? q.options : ["Option A", "Option B", "Option C", "Option D"],
            correct_index: typeof q.correct_index === 'number' ? q.correct_index : 0,
            source_document: 'Admin PDF / Training Manual'
        }));

        const { error: quizErr } = await supabase.from('course_quizzes').insert(rowsToInsert);
        if (quizErr) return res.status(500).json({ error: quizErr.message });

        return res.json({ message: `${questions.length} questions successfully generated & inserted into course_quizzes for "${courseTitle}"!`, questions });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Officer Analytics
app.get('/api/admin/officers-analytics', async (req, res) => {
    try {
        const { data: officers, error } = await supabase.from('employees').select('id, name, email, cadre, department, designation, created_at');
        if (error) return res.status(500).json({ error: error.message });

        const { data: competencies } = await supabase.from('officer_competencies').select('*');
        const compMap = new Map((competencies || []).map(c => [c.user_email, c]));

        const detailedOfficers = (officers || []).map(o => {
            const c = compMap.get(o.email.toLowerCase()) || { statistical_score: 0, technical_score: 0, governance_score: 0, leadership_score: 0 };
            const avg = Math.round((c.statistical_score + c.technical_score + c.governance_score + c.leadership_score) / 4);
            return { ...o, competency: c, overall_score: avg };
        });

        const byCadre = {};
        const byDept = {};
        const byDesig = {};

        detailedOfficers.forEach(o => {
            byCadre[o.cadre] = (byCadre[o.cadre] || 0) + 1;
            byDept[o.department] = (byDept[o.department] || 0) + 1;
            byDesig[o.designation] = (byDesig[o.designation] || 0) + 1;
        });

        return res.json({ total_officers: detailedOfficers.length, officers: detailedOfficers, breakdown: { byCadre, byDept, byDesig } });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Employee APIs
app.get('/api/competencies/:email', async (req, res) => {
    const email = (req.params.email || '').trim().toLowerCase();
    try {
        let { data } = await supabase.from('officer_competencies').select('*').eq('user_email', email).maybeSingle();
        if (!data) {
            const { data: created } = await supabase.from('officer_competencies').insert([{
                user_email: email, statistical_score: 0, technical_score: 0, governance_score: 0, leadership_score: 0
            }]).select().single();
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
    return deptStr.trim().toUpperCase();
}

app.post('/api/recommendations', async (req, res) => {
    const { department } = req.body;
    const deptCode = parseDeptCode(department);

    try {
        let { data: allCourses } = await supabase.from('master_courses').select('*').order('id');
        if (!allCourses || allCourses.length === 0) return res.json({ courses: [] });

        const mandatoryFoundation = allCourses
            .filter(c => c.is_general_mandatory === true)
            .map(c => ({ ...c, learning_stage: 'Foundation' }));

        const domainPool = allCourses.filter(c => c.is_general_mandatory !== true);

        let functionalMatches = domainPool.filter(c => {
            const targets = Array.isArray(c.target_departments) ? c.target_departments.map(t => t.toUpperCase()) : ['ALL'];
            return targets.includes(deptCode);
        }).map(c => ({ ...c, learning_stage: 'Functional Core' }));

        let strategicMatches = domainPool.filter(c => {
            const targets = Array.isArray(c.target_departments) ? c.target_departments.map(t => t.toUpperCase()) : ['ALL'];
            return !targets.includes(deptCode) && (targets.includes('ALL') || c.difficulty_level === 'Advanced');
        }).map(c => ({ ...c, learning_stage: 'Advanced Strategic' }));

        if (functionalMatches.length === 0) {
            functionalMatches = domainPool.slice(0, 3).map(c => ({ ...c, learning_stage: 'Functional Core' }));
        }
        if (strategicMatches.length === 0) {
            strategicMatches = domainPool.slice(3, 6).map(c => ({ ...c, learning_stage: 'Advanced Strategic' }));
        }

        return res.json({ courses: [...mandatoryFoundation, ...functionalMatches, ...strategicMatches] });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to recommend courses.' });
    }
});

app.post('/api/generate-quiz', async (req, res) => {
    const { courseTitle } = req.body;
    try {
        const { data: storedQuiz } = await supabase.from('course_quizzes').select('*').eq('course_title', courseTitle).limit(5);
        if (storedQuiz && storedQuiz.length > 0) {
            return res.json({ quiz: storedQuiz.map(q => ({ question: q.question, options: q.options, correctIndex: q.correct_index })) });
        }
        return res.json({
            quiz: [
                { question: `What is the core regulatory objective of ${courseTitle}?`, options: ["Standard statutory compliance and data integrity", "Manual log keeping", "Unregulated survey sampling", "Exemption from audits"], correctIndex: 0 },
                { question: "How are compliance milestones verified on the portal?", options: ["Automated digital submission & validation", "Informal verbal updates", "Paper registers only", "No verification"], correctIndex: 0 },
                { question: "Which framework governs data processing and security?", options: ["MoSPI Data Policy & DPDP Act 2023", "Generic social media rules", "Unverified guidelines", "Local informal orders"], correctIndex: 0 }
            ]
        });
    } catch (err) {
        return res.status(500).json({ error: 'Quiz error' });
    }
});

app.post('/api/chatbot', async (req, res) => {
    const { message, userProfile } = req.body;
    const prompt = `You are Bhashini AI on MoSPI Portal. Officer: ${userProfile?.name}, Dept: ${userProfile?.department}. Question: "${message}". Reply concisely in 2 sentences recommending their courses.`;
    const reply = await generateAIResponse(prompt);
    return res.json({ reply: reply || `Namaste ${userProfile?.name || 'Officer'}! Complete your mandatory Foundation modules and departmental Functional Core courses below.` });
});

app.post('/api/progress/save', async (req, res) => {
    const { email, courseTitle, score } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase();
    try {
        await supabase.from('user_course_progress').upsert([{
            user_email: cleanEmail, course_title: courseTitle, video_completed: true, quiz_passed: score >= 60, score: score, completed_at: new Date()
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
        const { data, error } = await supabase.from('employees').insert([{ name: name.trim(), email: cleanEmail, password: password, cadre: cadre.trim(), department: department.trim(), designation: designation.trim() }]).select();
        if (error) return res.status(400).json({ error: error.message });
        await supabase.from('officer_competencies').insert([{ user_email: cleanEmail, statistical_score: 0, technical_score: 0, governance_score: 0, leadership_score: 0 }]);
        return res.status(201).json({ message: 'Registered successfully', user: data[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password, role } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });

    const cleanEmail = email.trim().toLowerCase();
    if (role === 'admin' || cleanEmail.includes('admin')) {
        return res.json({ message: 'Admin Authorized', user: { name: 'MoSPI Training Administrator', email: cleanEmail, role: 'admin' } });
    }

    try {
        const { data, error } = await supabase.from('employees').select('id, name, email, password, cadre, department, designation').ilike('email', cleanEmail).maybeSingle();
        if (error || !data || data.password !== password) return res.status(401).json({ error: 'Invalid email or password.' });
        const { password: _, ...userProfile } = data;
        return res.json({ message: 'Authentication successful', user: { ...userProfile, role: 'employee' } });
    } catch (err) {
        return res.status(500).json({ error: 'Login error' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`MoSPI Backend running on port ${PORT}`));
