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

// Curated master catalog of 15 authentic NSSTA / iGOT Karmayogi courses
const DEFAULT_IGOT_COURSES = [
    { title: "Infrastructure Project Monitoring & IPMD Workflows", category: "Project Management", description: "Comprehensive procedures for monitoring central infrastructure projects costing ₹150+ Crore.", course_url: "https://portal.igotkarmayogi.gov.in" },
    { title: "Online Computerised Monitoring System (OCMS) Operations", category: "Digital Governance", description: "Standard data entry and monthly milestone tracking protocols on the IPMD OCMS portal.", course_url: "https://portal.igotkarmayogi.gov.in" },
    { title: "National Accounts Statistics & GDP Aggregates", category: "Macro Statistics", description: "Methods for compiling Gross State Domestic Product (GSDP) and Gross Fixed Capital Formation.", course_url: "https://portal.igotkarmayogi.gov.in" },
    { title: "Index of Industrial Production (IIP) & ASI Framework", category: "Economic Statistics", description: "Technical compilation standards for Annual Survey of Industries and industrial production tracking.", course_url: "https://portal.igotkarmayogi.gov.in" },
    { title: "Consumer Price Index (CPI) Basket & Inflation Metrics", category: "Price Statistics", description: "Price data validation methodologies and consumer basket weight calculation for rural/urban areas.", course_url: "https://portal.igotkarmayogi.gov.in" },
    { title: "Survey Sampling Design & Estimation Techniques", category: "Sample Surveys", description: "Multi-stage stratified sampling designs and variance estimation in NSS socio-economic surveys.", course_url: "https://portal.igotkarmayogi.gov.in" },
    { title: "Python & Pandas for Official Statistical Analysis", category: "Technical & Tools", description: "Automated data transformation, large survey data wrangling, and econometric visualization in Python.", course_url: "https://portal.igotkarmayogi.gov.in" },
    { title: "Relational SQL & Survey Microdata Processing", category: "Data Informatics", description: "Relational querying, validation queries, and cross-tabulation of NSSO large datasets using SQL.", course_url: "https://portal.igotkarmayogi.gov.in" },
    { title: "Digital Personal Data Protection (DPDP) Act Compliance", category: "Digital Governance", description: "Statutory governance obligations for handling citizen data and official respondent confidentiality.", course_url: "https://portal.igotkarmayogi.gov.in" },
    { title: "Sustainable Development Goals (SDG) National Indicator Framework", category: "Social Statistics", description: "Monitoring progress against 300+ SDG national indicators and state-level data localization.", course_url: "https://portal.igotkarmayogi.gov.in" },
    { title: "Prevention of Sexual Harassment (POSH) at Workplace", category: "Statutory Ethics", description: "Statutory mandates under POSH Act 2013, Internal Committee procedures, and ethical governance.", course_url: "https://portal.igotkarmayogi.gov.in" },
    { title: "Civil Defence Services & Disaster Management Framework", category: "Emergency Protocols", description: "NDRF and institutional disaster mitigation, first aid, and emergency coordination procedures.", course_url: "https://portal.igotkarmayogi.gov.in" },
    { title: "Swachhata Protocols & Office Hygiene Management", category: "Administration", description: "Record management, e-Office digitization standards, and physical premises governance.", course_url: "https://portal.igotkarmayogi.gov.in" },
    { title: "Time Series Econometrics & Seasonal Adjustments", category: "Applied Statistics", description: "X-13ARIMA-SEATS seasonal adjustment techniques for monthly price and production indices.", course_url: "https://portal.igotkarmayogi.gov.in" },
    { title: "Administrative Vigilance & Public Procurement (GeM / GFR)", category: "Leadership & Rules", description: "General Financial Rules (GFR) 2017, GeM portal procurement guidelines, and disciplinary rules.", course_url: "https://portal.igotkarmayogi.gov.in" }
];

app.post('/api/recommendations', async (req, res) => {
    const { cadre, department, designation } = req.body;

    try {
        // 1. Check if database already has cached courses
        const { data: cached } = await supabase
            .from('recommended_courses')
            .select('*')
            .eq('cadre', cadre)
            .eq('department', department)
            .eq('designation', designation);

        if (cached && cached.length >= 15) {
            return res.json({ courses: cached, source: 'database' });
        }

        // 2. Generate personalized list with Gemini AI
        const apiKey = GEMINI_API_KEY || process.env.GEMINI_API_KEY;
        let finalCourses = DEFAULT_IGOT_COURSES;

        if (apiKey) {
            try {
                const prompt = `Generate a tailored list of exactly 15 authentic iGOT Karmayogi / NSSTA MoSPI training courses for an officer:
Cadre: ${cadre}
Department: ${department}
Designation: ${designation}

Return ONLY a valid JSON array of 15 objects in this structure:
[
  {
    "title": "Course Title",
    "category": "Domain Category",
    "description": "Role-specific description for this officer",
    "course_url": "https://portal.igotkarmayogi.gov.in"
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
                if (rawContent) {
                    finalCourses = JSON.parse(rawContent);
                }
            } catch (aiErr) {
                console.warn('Gemini recommendation API fallback to default catalog');
            }
        }

        // 3. Save into Supabase table
        const rowsToInsert = finalCourses.map(c => ({
            cadre,
            department,
            designation,
            title: c.title,
            description: c.description,
            category: c.category,
            course_url: c.course_url || 'https://portal.igotkarmayogi.gov.in'
        }));

        await supabase.from('recommended_courses').insert(rowsToInsert);
        return res.json({ courses: rowsToInsert, source: 'ai_generated' });
    } catch (err) {
        return res.json({ courses: DEFAULT_IGOT_COURSES, source: 'local_catalog' });
    }
});

// Dynamic AI Assessment Quiz Generator
app.post('/api/generate-quiz', async (req, res) => {
    const { courseTitle, category } = req.body;
    const apiKey = GEMINI_API_KEY || process.env.GEMINI_API_KEY;

    if (apiKey) {
        try {
            const prompt = `Generate 3 competency evaluation multiple choice questions for the iGOT course: "${courseTitle}" (${category}). Return ONLY valid JSON:
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
        } catch (e) {}
    }

    // Default 3-question evaluation fallback
    return res.json({
        quiz: [
            { question: `What is the core regulatory objective of ${courseTitle}?`, options: ["Enhancing administrative transparency and data accuracy", "Manual file indexing only", "Non-digital reporting", "Ad-hoc task execution"], correctIndex: 0 },
            { question: "Under MoSPI guidelines, how frequently should compliance data be verified?", options: ["Monthly / Quarterly Cycle", "Once every 5 years", "Never", "Only on audit request"], correctIndex: 0 },
            { question: "Which digital platform manages central training tracking across government services?", options: ["iGOT Karmayogi Bharat Portal", "Generic Social Media", "Offline Logbooks", "Unverified third-party apps"], correctIndex: 0 }
        ]
    });
});

// Chatbot query handler
app.post('/api/chatbot', async (req, res) => {
    const { message, userProfile } = req.body;
    const apiKey = GEMINI_API_KEY || process.env.GEMINI_API_KEY;

    if (apiKey) {
        try {
            const prompt = `You are Bhashini AI, the digital assistant for MoSPI & NSSTA iGOT Karmayogi portal.
Officer Details: Name: ${userProfile?.name}, Cadre: ${userProfile?.cadre}, Dept: ${userProfile?.department}, Designation: ${userProfile?.designation}.
Officer question: "${message}".
Provide a concise, helpful 2-sentence response recommending courses or explaining competency protocols.`;

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const data = await response.json();
            const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
            return res.json({ reply });
        } catch (e) {}
    }

    return res.json({
        reply: `Namaste ${userProfile?.name || 'Officer'}! For ${userProfile?.department || 'your department'}, we recommend completing the 15 iGOT Karmayogi modules listed below and uploading your completion certificates.`
    });
});

app.post('/api/progress/save', async (req, res) => {
    const { email, courseTitle, score, certificateUploaded } = req.body;
    try {
        await supabase
            .from('user_course_progress')
            .upsert([{
                user_email: email.trim().toLowerCase(),
                course_title: courseTitle,
                video_completed: true,
                quiz_passed: score >= 60,
                score: score || 100,
                completed_at: new Date()
            }], { onConflict: 'user_email,course_title' });

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
