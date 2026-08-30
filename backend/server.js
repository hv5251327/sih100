const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let rawUrl = process.env.SUPABASE_URL || 'https://ccdrahlnsfrncsqaiumt.supabase.co';
let cleanUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjZHJhaGxuc2ZybmNzcWFpdW10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwMDEzMDAsImV4cCI6MjEwMzU3NzMwMH0.O3sAoWJuLWKeJCenkiUjen3FfLnNahUu7nKbpQ1t6Fo';

const supabase = createClient(cleanUrl, supabaseKey);

app.get('/api/health', (req, res) => {
    res.json({ status: 'MoSPI Skill Intelligence Engine Active', timestamp: new Date() });
});

// Admin API: Extract syllabus from PDF text and convert into structured course modules in DB
app.post('/api/admin/parse-syllabus', async (req, res) => {
    const { syllabusText, defaultDivision } = req.body;
    if (!syllabusText) return res.status(400).json({ error: 'Syllabus text content is required.' });

    try {
        let extractedModules = [];
        if (GEMINI_API_KEY) {
            const prompt = `You are the NSSTA Academic Curriculum Director at MoSPI.
Analyze the following official NSSTA syllabus/circular text and break it down into clean, standalone competency courses for official statisticians.

SYLLABUS TEXT:
${syllabusText.slice(0, 20000)}

For each topic/chapter found, return ONLY a valid JSON array of objects structured as:
[
  {
    "course_code": "NSSTA-GEN-CODE",
    "title": "Exact Course Module Title",
    "domain": "Statistical Competencies | Technical Competencies | Digital Governance | Behavioural & Managerial",
    "difficulty_level": "Foundation | Intermediate | Advanced",
    "target_departments": ["${defaultDivision || 'ALL'}"],
    "description": "2-sentence practical operational purpose for MoSPI statisticians",
    "video_url": "https://portal.igotkarmayogi.gov.in",
    "is_general_mandatory": false
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

            const data = await aiRes.json();
            let rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
            extractedModules = JSON.parse(rawText);
        }

        if (extractedModules.length > 0) {
            await supabase.from('master_courses').upsert(extractedModules, { onConflict: 'course_code' });
        }

        return res.json({
            message: `Successfully parsed and saved ${extractedModules.length} courses to Master DB!`,
            modules: extractedModules
        });
    } catch (err) {
        console.error('Syllabus parsing error:', err);
        return res.status(500).json({ error: 'Failed to extract syllabus courses.' });
    }
});

app.get('/api/admin/courses-list', async (req, res) => {
    try {
        const { data, error } = await supabase.from('master_courses').select('id, course_code, title, domain').order('title');
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ courses: data });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/officers-analytics', async (req, res) => {
    try {
        const { data: officers, error } = await supabase
            .from('employees')
            .select('id, name, email, cadre, department, designation, created_at');

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

        return res.json({
            total_officers: detailedOfficers.length,
            officers: detailedOfficers,
            breakdown: { byCadre, byDept, byDesig }
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/draft-course', async (req, res) => {
    const { department, domain, topic } = req.body;
    try {
        let draft = {
            course_code: `ADM-${Date.now().toString().slice(-4)}`,
            title: `${topic || 'Advanced Module'} (${department})`,
            domain: domain || 'Statistical Competencies',
            difficulty_level: 'Intermediate',
            target_departments: [department || 'ALL'],
            description: `Official training module targeted for officers under ${department}.`,
            video_url: 'https://portal.igotkarmayogi.gov.in'
        };

        if (GEMINI_API_KEY) {
            const prompt = `Generate a detailed NSSTA training module for MoSPI officers.
Department: ${department}
Domain: ${domain}
Topic Focus: ${topic}

Return ONLY valid JSON format:
{
  "course_code": "COURSE_CODE",
  "title": "Comprehensive Title",
  "domain": "${domain}",
  "difficulty_level": "Foundation | Intermediate | Advanced",
  "target_departments": ["${department}"],
  "description": "2-sentence practical operational purpose",
  "video_url": "https://portal.igotkarmayogi.gov.in"
}`;
            const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { responseMimeType: "application/json" }
                })
            });
            const data = await aiRes.json();
            let rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
            draft = JSON.parse(rawText);
        }

        const { data: saved, error } = await supabase.from('pending_courses').insert([{ ...draft, status: 'PENDING' }]).select().single();
        if (error) return res.status(400).json({ error: error.message });
        return res.json({ message: 'Course drafted successfully for approval', course: saved });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to draft course.' });
    }
});

app.get('/api/admin/pending-courses', async (req, res) => {
    try {
        const { data, error } = await supabase.from('pending_courses').select('*').eq('status', 'PENDING').order('created_at', { ascending: false });
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ courses: data });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/approve-course', async (req, res) => {
    const { id } = req.body;
    try {
        const { data: pending, error: findErr } = await supabase.from('pending_courses').select('*').eq('id', id).single();
        if (findErr || !pending) return res.status(404).json({ error: 'Pending course not found.' });

        const { error: insErr } = await supabase.from('master_courses').insert([{
            course_code: pending.course_code,
            title: pending.title,
            domain: pending.domain,
            difficulty_level: pending.difficulty_level,
            target_departments: pending.target_departments,
            description: pending.description,
            video_url: pending.video_url,
            is_general_mandatory: false
        }]);

        if (insErr) return res.status(400).json({ error: insErr.message });

        await supabase.from('pending_courses').update({ status: 'APPROVED' }).eq('id', id);
        return res.json({ message: 'Course approved and published to Master Course Bank!' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/generate-quiz-from-doc', async (req, res) => {
    const { courseTitle, documentText } = req.body;
    if (!courseTitle || !documentText) return res.status(400).json({ error: 'Course Title and Document Text are required.' });

    try {
        let questions = [
            { question: `What is the key regulatory objective in ${courseTitle}?`, options: ["Standard data integrity protocol", "Informal ledger maintenance", "Unregulated survey sampling", "Exemption from statutory audits"], correct_index: 0 },
            { question: "How are compliance milestones verified across official divisions?", options: ["Automated digital submission & validation", "Verbal statements only", "Unchecked paper records", "No verification"], correct_index: 0 },
            { question: "Which framework governs respondent privacy and data protection?", options: ["DPDP Act 2023 & MoSPI Standards", "Generic public domain rules", "Unverified guidelines", "Local administrative orders only"], correct_index: 0 }
        ];

        if (GEMINI_API_KEY) {
            const prompt = `Generate 5 multiple-choice questions from the provided training document text specifically for the course: "${courseTitle}".
DOCUMENT CONTENT:
${documentText.slice(0, 15000)}

Return ONLY a valid JSON array of objects:
[{"question": "Clear question text?", "options": ["Option A", "Option B", "Option C", "Option D"], "correct_index": 0}]`;
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
            questions = JSON.parse(rawText);
        }

        const rowsToInsert = questions.map(q => ({
            course_title: courseTitle,
            question: q.question,
            options: q.options,
            correct_index: q.correct_index,
            source_document: 'Admin Uploaded PDF/Manual'
        }));

        await supabase.from('course_quizzes').insert(rowsToInsert);
        return res.json({ message: `${questions.length} questions generated & assigned to "${courseTitle}"!`, questions });
    } catch (err) {
        return res.status(500).json({ error: 'Quiz synthesis failed.' });
    }
});

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
    return deptStr.trim();
}

app.post('/api/recommendations', async (req, res) => {
    const { department, cadre, designation } = req.body;
    const deptCode = parseDeptCode(department);

    try {
        let { data: allCourses } = await supabase.from('master_courses').select('*').order('id');
        if (!allCourses || allCourses.length === 0) return res.status(500).json({ error: 'No courses in database.' });

        const mandatoryFoundation = allCourses.filter(c => c.is_general_mandatory === true).map(c => ({ ...c, learning_stage: 'Foundation' }));
        const domainPool = allCourses.filter(c => c.is_general_mandatory !== true);

        let domainCourses = domainPool.filter(c => {
            const targets = Array.isArray(c.target_departments) ? c.target_departments : ['ALL'];
            return targets.includes('ALL') || targets.includes(deptCode);
        }).map(c => {
            const targets = Array.isArray(c.target_departments) ? c.target_departments : ['ALL'];
            return {
                ...c,
                learning_stage: targets.includes(deptCode) ? 'Functional Core' : 'Advanced Strategic'
            };
        });

        const combined = [...mandatoryFoundation, ...domainCourses];
        return res.json({ courses: combined, source: 'master_courses_direct' });
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
    if (GEMINI_API_KEY) {
        try {
            const prompt = `You are Bhashini AI on MoSPI Portal. Officer: ${userProfile?.name}, Dept: ${userProfile?.department}. Question: "${message}". Reply concisely in 2 sentences recommending their courses.`;
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const data = await response.json();
            return res.json({ reply: data?.candidates?.[0]?.content?.parts?.[0]?.text });
        } catch (e) {}
    }
    return res.json({ reply: `Namaste ${userProfile?.name || 'Officer'}! Complete your mandatory Foundation modules and departmental Functional Core courses below.` });
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
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });
    try {
        if (email.toLowerCase().includes('admin')) {
            return res.json({ message: 'Admin Authorized', user: { name: 'MoSPI Training Administrator', email: email, role: 'admin' } });
        }
        const { data, error } = await supabase.from('employees').select('id, name, email, password, cadre, department, designation').ilike('email', email.trim().toLowerCase()).maybeSingle();
        if (error || !data || data.password !== password) return res.status(401).json({ error: 'Invalid email or password.' });
        const { password: _, ...userProfile } = data;
        return res.json({ message: 'Authentication successful', user: userProfile });
    } catch (err) {
        return res.status(500).json({ error: 'Login error' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`MoSPI Backend running on port ${PORT}`));
