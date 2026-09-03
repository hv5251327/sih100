/**
 * ========================================================================================
 *   MINISTRY OF STATISTICS AND PROGRAMME IMPLEMENTATION (MoSPI) & NSSTA
 *   LANGCHAIN-POWERED SKILL-ADAPTIVE CURRICULUM RECOMMENDATION ENGINE
 * ========================================================================================
 *   Dynamically scales recommendations based on officer's actual skill levels:
 *   - High proficiency (80%+ score)  -> 2 to 4 selective advanced/refresher courses
 *   - Moderate proficiency (55-79%)  -> 8 to 14 targeted gap-bridging courses
 *   - High deficit (<55% score)      -> 20 to 35+ comprehensive courses across 3 stages
 * ========================================================================================
 */

const { PromptTemplate } = require('@langchain/core/prompts');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || 'b74c652d554f43c7a84fbc4b4eefc351.0qPsbvIqO1c7xzy3KL4E9ALv';
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'https://api.ollama.com/v1';

// 1. Curate authentic, topic-specific YouTube lecture video embeds
function getRelevantVideoUrl(title, domain) {
    const t = (title || '').toLowerCase();
    if (t.includes('national accounts') || t.includes('sna') || t.includes('sut') || t.includes('gdp') || t.includes('gva') || t.includes('capital stock') || t.includes('fisim') || t.includes('gfcf')) {
        return 'https://www.youtube.com/embed/nK32aCq3mNk';
    } else if (t.includes('plfs') || t.includes('sampling') || t.includes('hces') || t.includes('strata') || t.includes('multiplier') || t.includes('neyman') || t.includes('variance')) {
        return 'https://www.youtube.com/embed/1Il5UUPrSNk';
    } else if (t.includes('capi') || t.includes('gps') || t.includes('fod') || t.includes('field') || t.includes('asuse') || t.includes('listing') || t.includes('nsso')) {
        return 'https://www.youtube.com/embed/k9zTr2MAo4s';
    } else if (t.includes('dpdp') || t.includes('privacy') || t.includes('confidentiality') || t.includes('statistics act') || t.includes('governance') || t.includes('cert-in')) {
        return 'https://www.youtube.com/embed/fW_c3-p9Vrk';
    } else if (t.includes('asi') || t.includes('iip') || t.includes('industrial') || t.includes('service production') || t.includes('factory') || t.includes('mca21')) {
        return 'https://www.youtube.com/embed/s2skans2dP4';
    } else if (t.includes('cpi') || t.includes('wpi') || t.includes('price') || t.includes('inflation') || t.includes('laspeyres')) {
        return 'https://www.youtube.com/embed/rPZ3_XFmgm4';
    } else if (t.includes('sdg') || t.includes('social') || t.includes('nif') || t.includes('seea') || t.includes('time use') || t.includes('gender')) {
        return 'https://www.youtube.com/embed/wX78iKhInsc';
    } else if (t.includes('python') || t.includes('pandas') || t.includes('numpy') || t.includes('data wrangling') || t.includes('machine learning') || t.includes('automation')) {
        return 'https://www.youtube.com/embed/rfscVS0vtbw';
    } else if (t.includes(' r ') || t.includes('econometric') || t.includes('survey package') || t.includes('x-13arima') || t.includes('time-series')) {
        return 'https://www.youtube.com/embed/_V8eKsto3Ug';
    } else if (t.includes('gis') || t.includes('qgis') || t.includes('geopandas') || t.includes('spatial') || t.includes('remote sensing') || t.includes('urban frame')) {
        return 'https://www.youtube.com/embed/2_2G3j7-f5E';
    } else if (t.includes('gfr') || t.includes('gem') || t.includes('procurement') || t.includes('posh') || t.includes('ethics') || t.includes('conduct') || t.includes('safety') || t.includes('defence')) {
        return 'https://www.youtube.com/embed/gP9NfXGzN2U';
    } else if (t.includes('ocms') || t.includes('project') || t.includes('cpm') || t.includes('pfms') || t.includes('cost overrun')) {
        return 'https://www.youtube.com/embed/nK32aCq3mNk';
    } else if (t.includes('gsdp') || t.includes('state') || t.includes('district') || t.includes('ddp') || t.includes('des')) {
        return 'https://www.youtube.com/embed/1Il5UUPrSNk';
    } else if (domain === 'Behavioural & Managerial' || t.includes('leadership') || t.includes('policy') || t.includes('management') || t.includes('change')) {
        return 'https://www.youtube.com/embed/wX78iKhInsc';
    }
    return 'https://www.youtube.com/embed/1Il5UUPrSNk';
}

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

// 2. LangChain Dynamic Skill-Adaptive Prompt Template
const recommendationPromptTemplate = new PromptTemplate({
    template: `You are the Principal Curriculum Director & Chief Psychometrician at National Statistical Systems Training Academy (NSSTA), MoSPI, Government of India.

OFFICER PROFILE FOR CURRICULUM CALIBRATION:
- Officer Name: {officer_name}
- Official Cadre: {cadre}
- Assigned Division / Department: {department} (Code: {dept_code})
- Designation Level: {designation}
- Baseline Diagnostic Competency Scores:
  * Statistical Methods: {stat_score}% (Deficit: {stat_deficit}%)
  * Technical Tools: {tech_score}% (Deficit: {tech_deficit}%)
  * Digital Governance: {gov_score}% (Deficit: {gov_deficit}%)
  * Behavioural & Leadership: {lead_score}% (Deficit: {lead_deficit}%)
  * Average Proficiency Score: {avg_score}% (Average Deficit: {avg_deficit}%)

AVAILABLE MASTER COURSES CATALOG (CANDIDATES):
{candidate_courses_json}

DYNAMIC SKILL-DEFICIT CALIBRATION RULES:
1. The number of recommended courses MUST BE STRICTLY PROPORTIONAL to the officer's competency deficits:
   - IF HIGH PROFICIENCY (Average Score >= 80% / Low Deficit): Recommend ONLY 2 to 4 selective advanced/refresher courses targeting their small residual deficits. Do not recommend basic courses they already know.
   - IF MODERATE PROFICIENCY (Average Score 55% - 79% / Moderate Deficit): Recommend 8 to 14 targeted courses directly addressing their deficient domains.
   - IF HIGH DEFICIT / NOVICE (Average Score < 55% / High Deficit): Recommend a comprehensive curriculum of 20 to 35+ courses across Foundation, Functional Core, and Technical Skills to bridge all competency gaps.
2. Ground every recommendation STRICTLY in this officer's actual Cadre ({cadre}), Division ({department}), and Designation ({designation}).
3. Partition recommended courses across the 3 stages:
   - Stage 1: Foundation (learning_stage: "Foundation")
   - Stage 2: Functional Core (learning_stage: "Functional Core")
   - Stage 3: Advanced Strategic (learning_stage: "Advanced Strategic")
4. Return ONLY a valid JSON array of selected courses without any markdown formatting or commentary.

{format_instructions}`,
    inputVariables: [
        "officer_name",
        "cadre",
        "department",
        "dept_code",
        "designation",
        "stat_score",
        "stat_deficit",
        "tech_score",
        "tech_deficit",
        "gov_score",
        "gov_deficit",
        "lead_score",
        "lead_deficit",
        "avg_score",
        "avg_deficit",
        "candidate_courses_json"
    ],
    partialVariables: {
        format_instructions: `[
  {
    "id": 1,
    "title": "System of National Accounts (SNA 2008) & GVA Compilation",
    "learning_stage": "Functional Core",
    "relevance_score": 96,
    "short_description": "Core macroeconomic accounting for NAD officers."
  }
]`
    }
});

// 3. Multi-Provider LLM Caller
async function executeLLM(promptText) {
    const sysPrompt = "You are the Principal Curriculum Director at NSSTA MoSPI. Return strictly a valid JSON array of selected courses without markdown formatting.";

    // 1. Ollama Cloud Engine
    if (OLLAMA_API_KEY) {
        const ollamaModels = ['gpt-oss:20b', 'deepseek-v4-flash:0731', 'nemotron-3-nano:30b'];
        for (const model of ollamaModels) {
            try {
                const res = await fetch('https://api.ollama.com/api/generate', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${OLLAMA_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: model,
                        prompt: `${sysPrompt}\n\n${promptText}`,
                        stream: false
                    })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.response) {
                        return data.response.replace(/```json/gi, '').replace(/```/g, '').trim();
                    }
                }
            } catch (e) {}
        }
    }

    // 2. Groq Cloud Engine
    if (GROQ_API_KEY) {
        try {
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${GROQ_API_KEY}`
                },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    messages: [
                        { role: 'system', content: sysPrompt },
                        { role: 'user', content: promptText }
                    ],
                    temperature: 0.1
                })
            });
            if (res.ok) {
                const data = await res.json();
                if (data && data.choices && data.choices[0] && data.choices[0].message) {
                    return data.choices[0].message.content.replace(/```json/gi, '').replace(/```/g, '').trim();
                }
            }
        } catch (e) {}
    }

    // 3. Gemini Cloud Engine
    if (GEMINI_API_KEY) {
        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: `${sysPrompt}\n\n${promptText}` }]
                    }]
                })
            });
            if (res.ok) {
                const data = await res.json();
                if (data && data.candidates && data.candidates[0] && data.candidates[0].content) {
                    return data.candidates[0].content.parts[0].text.replace(/```json/gi, '').replace(/```/g, '').trim();
                }
            }
        } catch (e) {}
    }

    return null;
}

// 4. Dynamic Skill-Adaptive Curriculum Synthesizer (Expert Deterministic Engine)
function buildDeterministicCurriculum(allCourses, officer) {
    const deptStr = officer.department || 'NAD';
    const deptCode = parseDeptCode(deptStr);
    const desigUpper = (officer.designation || '').toUpperCase();
    const cadreUpper = (officer.cadre || '').toUpperCase();
    const isSenior = desigUpper.includes('DIRECTOR') || desigUpper.includes('DDG') || desigUpper.includes('ADG') || desigUpper.includes('CHIEF') || desigUpper.includes('SAG') || desigUpper.includes('HEAD');
    const isField = deptCode === 'FOD' || deptCode === 'NSSO' || cadreUpper.includes('SSS') || desigUpper.includes('FIELD') || desigUpper.includes('INVESTIGATOR');
    const isState = deptCode === 'STATE_DES' || deptCode === 'DSO' || deptCode === 'TALUK' || cadreUpper.includes('STATE');

    const comp = officer.competency_scores || officer.comp || { statistical_score: 65, technical_score: 60, governance_score: 70, leadership_score: 65 };
    const statScore = comp.statistical_score || 65;
    const techScore = comp.technical_score || 60;
    const govScore = comp.governance_score || 70;
    const leadScore = comp.leadership_score || 65;
    const avgScore = (statScore + techScore + govScore + leadScore) / 4;

    const govDeficit = 100 - govScore;
    const statDeficit = 100 - statScore;
    const techDeficit = 100 - techScore;
    const leadDeficit = 100 - leadScore;

    // Define adaptive course quotas based on diagnostic score
    let foundationLimit = 4;
    let functionalLimit = 5;
    let strategicLimit = 3;

    if (avgScore >= 80) {
        // High proficiency officer: Only 2 to 4 advanced / refresher modules needed
        foundationLimit = govDeficit > 25 ? 1 : 0;
        functionalLimit = (statDeficit > 25 || techDeficit > 25) ? 2 : 1;
        strategicLimit = 2;
    } else if (avgScore < 55) {
        // High deficit / novice officer: Comprehensive curriculum (20 to 35+ modules)
        foundationLimit = 6;
        functionalLimit = 16;
        strategicLimit = 8;
    } else {
        // Moderate proficiency (55% - 79%): 8 to 14 targeted modules
        foundationLimit = govDeficit > 30 ? 4 : 2;
        functionalLimit = statDeficit > 30 ? 6 : 4;
        strategicLimit = (techDeficit > 30 || leadDeficit > 30) ? 4 : 2;
    }

    // STAGE 1: FOUNDATION
    const foundation = allCourses
        .filter(c => {
            const t = c.title.toLowerCase();
            const isGov = c.domain === 'Digital Governance';
            const isMandatory = c.is_general_mandatory || t.includes('dpdp') || t.includes('posh') || t.includes('safety') || t.includes('gfr');
            return isMandatory || (govDeficit > 40 && isGov);
        })
        .slice(0, foundationLimit)
        .map(c => ({
            ...c,
            learning_stage: 'Foundation',
            video_url: getRelevantVideoUrl(c.title, c.domain),
            match_score: 95
        }));

    const foundationIds = new Set(foundation.map(c => c.id));

    // STAGE 2: FUNCTIONAL CORE
    let functionalCandidates = [];
    if (deptCode === 'NAD') {
        functionalCandidates = allCourses.filter(c => {
            const t = c.title.toLowerCase();
            return t.includes('national accounts') || t.includes('supply and use') || t.includes('gross fixed capital') || t.includes('fisim') || t.includes('gdp') || t.includes('macro') || t.includes('sut') || t.includes('sna');
        });
    } else if (deptCode === 'FOD' || deptCode === 'NSSO') {
        functionalCandidates = allCourses.filter(c => {
            const t = c.title.toLowerCase();
            return t.includes('capi') || t.includes('plfs') || t.includes('asuse') || t.includes('hces') || t.includes('field') || t.includes('paradata') || t.includes('survey operations');
        });
    } else if (deptCode === 'ESD') {
        functionalCandidates = allCourses.filter(c => {
            const t = c.title.toLowerCase();
            return t.includes('annual survey of industries') || t.includes('iip') || t.includes('industrial') || t.includes('factory') || t.includes('service sector') || t.includes('mca21');
        });
    } else if (deptCode === 'PSD') {
        functionalCandidates = allCourses.filter(c => {
            const t = c.title.toLowerCase();
            return t.includes('consumer price index') || t.includes('cpi') || t.includes('price') || t.includes('inflation') || t.includes('laspeyres') || t.includes('wholesale price');
        });
    } else if (deptCode === 'SSD' || deptCode === 'SDG_LAB') {
        functionalCandidates = allCourses.filter(c => {
            const t = c.title.toLowerCase();
            return t.includes('sustainable development') || t.includes('sdg') || t.includes('social statistics') || t.includes('time use') || t.includes('environmental') || t.includes('gender');
        });
    } else if (deptCode === 'SDRD') {
        functionalCandidates = allCourses.filter(c => {
            const t = c.title.toLowerCase();
            return t.includes('stratified') || t.includes('sampling design') || t.includes('variance') || t.includes('replicate') || t.includes('questionnaire') || t.includes('multiplier');
        });
    } else if (deptCode === 'DPD') {
        functionalCandidates = allCourses.filter(c => {
            const t = c.title.toLowerCase();
            return t.includes('validation') || t.includes('scrutiny') || t.includes('tabulation') || t.includes('imputation') || t.includes('sql') || t.includes('database') || t.includes('warehouse');
        });
    } else if (deptCode === 'DIID') {
        functionalCandidates = allCourses.filter(c => {
            const t = c.title.toLowerCase();
            return t.includes('python') || t.includes('machine learning') || t.includes('cloud') || t.includes('data warehouse') || t.includes('api') || t.includes('cybersecurity');
        });
    } else if (deptCode === 'IPMD') {
        functionalCandidates = allCourses.filter(c => {
            const t = c.title.toLowerCase();
            return t.includes('ocms') || t.includes('project') || t.includes('cost overrun') || t.includes('cpm') || t.includes('monitoring') || t.includes('appraisal');
        });
    } else if (deptCode === 'NSSTA') {
        functionalCandidates = allCourses.filter(c => {
            const t = c.title.toLowerCase();
            return t.includes('training needs') || t.includes('pedagogy') || t.includes('official statistical system') || t.includes('karmayogi') || t.includes('competency');
        });
    } else if (isState) {
        functionalCandidates = allCourses.filter(c => {
            const t = c.title.toLowerCase();
            return t.includes('gross state domestic product') || t.includes('gsdp') || t.includes('district domestic') || t.includes('localization') || t.includes('state') || t.includes('local market');
        });
    }

    // Add general statistical courses if officer has high statistical deficit
    if (statDeficit > 40 || functionalCandidates.length < functionalLimit) {
        const generalStat = allCourses.filter(c => c.domain === 'Statistical Competencies' && !foundationIds.has(c.id));
        functionalCandidates.push(...generalStat);
    }

    const functional = functionalCandidates
        .filter(c => !foundationIds.has(c.id))
        .slice(0, functionalLimit)
        .map(c => ({
            ...c,
            learning_stage: 'Functional Core',
            video_url: getRelevantVideoUrl(c.title, c.domain),
            match_score: 92
        }));

    const assignedIds = new Set([...foundation.map(c => c.id), ...functional.map(c => c.id)]);

    // STAGE 3: ADVANCED STRATEGIC & TECHNICAL
    let strategicCandidates = [];
    if (isSenior) {
        strategicCandidates = allCourses.filter(c => {
            const t = c.title.toLowerCase();
            return !assignedIds.has(c.id) && (t.includes('policy formulation') || t.includes('leadership') || t.includes('change management') || t.includes('python with pandas') || t.includes('econometric') || t.includes('qgis') || c.difficulty_level === 'Advanced');
        });
    } else if (isField) {
        strategicCandidates = allCourses.filter(c => {
            const t = c.title.toLowerCase();
            return !assignedIds.has(c.id) && (t.includes('qgis') || t.includes('geospatial') || t.includes('python') || t.includes('supervisory') || t.includes('data validation') || c.domain === 'Technical Competencies');
        });
    } else {
        strategicCandidates = allCourses.filter(c => {
            const t = c.title.toLowerCase();
            return !assignedIds.has(c.id) && (t.includes('python with pandas') || t.includes('econometric') || t.includes('r for') || t.includes('qgis') || t.includes('spatial') || c.domain === 'Technical Competencies');
        });
    }

    // Add extra technical / leadership courses if deficit is high
    if (strategicCandidates.length < strategicLimit) {
        const extraAdvanced = allCourses.filter(c => !assignedIds.has(c.id) && (c.difficulty_level === 'Advanced' || c.domain === 'Technical Competencies' || c.domain === 'Behavioural & Managerial'));
        strategicCandidates.push(...extraAdvanced);
    }

    const strategic = strategicCandidates
        .slice(0, strategicLimit)
        .map(c => ({
            ...c,
            learning_stage: 'Advanced Strategic',
            video_url: getRelevantVideoUrl(c.title, c.domain),
            match_score: 86
        }));

    return [...foundation, ...functional, ...strategic];
}

// 5. Main LangChain Recommendation Evaluator
async function evaluateLangChainRecommendations(candidateCourses, profile) {
    if (!candidateCourses || candidateCourses.length === 0) return [];

    const comp = profile.competency_scores || profile.comp || { statistical_score: 65, technical_score: 60, governance_score: 70, leadership_score: 65 };
    const deptCode = parseDeptCode(profile.department);
    const statScore = comp.statistical_score || 65;
    const techScore = comp.technical_score || 60;
    const govScore = comp.governance_score || 70;
    const leadScore = comp.leadership_score || 65;
    const avgScore = Math.round((statScore + techScore + govScore + leadScore) / 4);

    // 1. Attempt LangChain LLM Evaluation
    try {
        const candidateSummary = candidateCourses.slice(0, 50).map(c => ({
            id: c.id,
            title: c.title,
            domain: c.domain,
            difficulty: c.difficulty_level,
            target_departments: c.target_departments || ['ALL']
        }));

        const promptText = await recommendationPromptTemplate.format({
            officer_name: profile.name || 'Officer',
            cadre: profile.cadre || 'Official Statistical Service',
            department: profile.department || 'NAD',
            dept_code: deptCode,
            designation: profile.designation || 'Statistical Officer',
            stat_score: statScore,
            stat_deficit: Math.max(5, 100 - statScore),
            tech_score: techScore,
            tech_deficit: Math.max(5, 100 - techScore),
            gov_score: govScore,
            gov_deficit: Math.max(5, 100 - govScore),
            lead_score: leadScore,
            lead_deficit: Math.max(5, 100 - leadScore),
            avg_score: avgScore,
            avg_deficit: Math.max(5, 100 - avgScore),
            candidate_courses_json: JSON.stringify(candidateSummary)
        });

        const rawLLMResponse = await executeLLM(promptText);
        if (rawLLMResponse) {
            const match = rawLLMResponse.match(/\[[\s\S]*\]/);
            if (match) {
                const parsed = JSON.parse(match[0]);
                if (Array.isArray(parsed) && parsed.length >= 2) {
                    const idMap = new Map(candidateCourses.map(c => [c.id, c]));
                    const evaluated = [];

                    for (const item of parsed) {
                        const original = idMap.get(item.id);
                        if (original) {
                            evaluated.push({
                                ...original,
                                learning_stage: item.learning_stage || 'Functional Core',
                                match_score: item.relevance_score || 90,
                                description: item.short_description || original.description,
                                video_url: original.video_url && original.video_url.includes('youtube') && !original.video_url.includes('1Il5UUPrSNk') ? original.video_url : getRelevantVideoUrl(original.title, original.domain)
                            });
                        }
                    }

                    if (evaluated.length >= 2) {
                        return evaluated;
                    }
                }
            }
        }
    } catch (llmErr) {
        console.warn('LangChain LLM Engine fallback:', llmErr.message);
    }

    // 2. Deterministic Expert Rule Engine Fallback (Dynamically scales from 2-4 up to 30+)
    return buildDeterministicCurriculum(candidateCourses, profile);
}

module.exports = {
    evaluateLangChainRecommendations,
    buildDeterministicCurriculum,
    getRelevantVideoUrl,
    parseDeptCode
};
