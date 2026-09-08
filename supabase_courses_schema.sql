-- ==========================================================
-- 📚 SUPABASE SQL SCHEMA & COURSE CATALOG MIGRATION
-- ==========================================================

-- 1. Create table if not exists
CREATE TABLE IF NOT EXISTS public.igot_courses (
    id BIGSERIAL PRIMARY KEY,
    course_code VARCHAR(100) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    domain VARCHAR(150),
    competency_subdomain VARCHAR(150),
    difficulty_level VARCHAR(50) DEFAULT 'Intermediate',
    duration_hours NUMERIC(4,1) DEFAULT 4.0,
    video_url TEXT,
    is_general_mandatory BOOLEAN DEFAULT false,
    target_departments JSONB DEFAULT '["ALL"]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable Row Level Security (RLS) & Public Policies
ALTER TABLE public.igot_courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on igot_courses" ON public.igot_courses;
CREATE POLICY "Allow public read on igot_courses" ON public.igot_courses FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert on igot_courses" ON public.igot_courses;
CREATE POLICY "Allow public insert on igot_courses" ON public.igot_courses FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update on igot_courses" ON public.igot_courses;
CREATE POLICY "Allow public update on igot_courses" ON public.igot_courses FOR UPDATE USING (true) WITH CHECK (true);

-- 3. Upsert Curated Courses with YouTube Videos
INSERT INTO public.igot_courses (course_code, title, description, domain, difficulty_level, duration_hours, video_url, is_general_mandatory, target_departments)
VALUES
    ('IGOT-STAT-101', 'Survey Sampling Frame Design, Multi-Stage Weighting & Non-Sampling Error Audit', 'Stratified multi-stage cluster sampling, multiplier calculation, post-stratification weighting, and non-sampling error minimization in large-scale socio-economic surveys.', 'Statistical Competencies', 'Advanced', 6, 'https://www.youtube.com/embed/kYfNrtN48-Y', false, '["SDRD","FOD","NSSO"]'::jsonb),
    ('IGOT-NAD-201', 'National Accounts Compilation & Gross Domestic Product (GDP) Estimation (SNA 2008)', 'Compiling Gross Value Added (GVA), Supply and Use Tables (SUT), institutional sector accounts, and base year revisions following UN SNA 2008 standards.', 'Statistical Competencies', 'Intermediate', 5, 'https://www.youtube.com/embed/A307rSHkJdc', false, '["NAD","ESD"]'::jsonb),
    ('IGOT-PSD-202', 'Consumer Price Index (CPI) & Inflation Deflator Analytics', 'Design of market price baskets, Laspeyres and Jevons price index construction, geometric mean weighting, item substitution rules, and inflation forecasting.', 'Statistical Competencies', 'Intermediate', 4, 'https://www.youtube.com/embed/B43YEW2F_88', false, '["PSD"]'::jsonb),
    ('IGOT-STAT-104', 'Periodic Labour Force Survey (PLFS) Microdata Analysis & Employment Metrics', 'Concepts of Usual Principal Status (UPS), Current Weekly Status (CWS), Worker Population Ratio (WPR), LFPR, and weight application on NSSO unit-level data.', 'Statistical Competencies', 'Intermediate', 5, 'https://www.youtube.com/embed/G4hL5Om4Bec', false, '["SSD","SDRD","FOD"]'::jsonb),
    ('IGOT-STAT-105', 'Agricultural Statistics, Crop Area Estimation & Land Use Dynamics', 'Agricultural census frames, General Crop Estimation Surveys (GCES), remote sensing yield forecasting, and integration of administrative land records.', 'Statistical Competencies', 'Intermediate', 4, 'https://www.youtube.com/embed/Z0qBfOa-YhE', false, '["ESD","STATE_DES","SSD"]'::jsonb),
    ('IGOT-ESD-204', 'Annual Survey of Industries (ASI) & Index of Industrial Production (IIP)', 'Factory sector sampling frame maintenance, NIC-2008 industrial classification, gross output validation, working capital analysis, and monthly IIP compilation.', 'Statistical Competencies', 'Intermediate', 5, 'https://www.youtube.com/embed/rPZ3_XFmgm4', false, '["ESD"]'::jsonb),
    ('IGOT-SSD-203', 'SDG National Indicator Framework (NIF) Tracking & Social Statistics', 'Monitoring 300+ NIF indicators aligned with UN SDGs, baseline metadata harmonization, disaggregated social statistics, and state indicator dashboards.', 'Statistical Competencies', 'Intermediate', 4, 'https://www.youtube.com/embed/0XTBYMfZyrM', false, '["SSD","SDG_LAB","STATE_DES"]'::jsonb),
    ('IGOT-STAT-108', 'Metadata Standards (SDMX, DDI) & UN National Quality Assurance Framework (UN-NQAF)', 'Statistical Data and Metadata eXchange (SDMX) protocols, Data Documentation Initiative (DDI) XML schemas, and quality audits under UN-NQAF principles.', 'Statistical Competencies', 'Advanced', 5, 'https://www.youtube.com/embed/4K8bX4n_a3w', false, '["DIID","DPD","SDRD"]'::jsonb),
    ('IGOT-PYTHON-401', 'Python & Machine Learning for Official Statistics Automation', 'Data wrangling with Pandas and NumPy, automated outlier detection, time series decomposition (SARIMA), Scikit-Learn classification, and pipeline scripting.', 'Technical Competencies', 'Advanced', 8, 'https://www.youtube.com/embed/LHBE6Q9Xzns', true, '["ALL"]'::jsonb),
    ('IGOT-TECH-102', 'R Programming & Econometric Microdata Modeling for Survey Data', 'Complex survey design analysis using R survey package, robust regression models, multi-level panel regressions, and automated statistical reporting with R Markdown.', 'Technical Competencies', 'Advanced', 6, 'https://www.youtube.com/embed/O15W6s4S5X4', false, '["ALL"]'::jsonb),
    ('IGOT-TECH-103', 'Relational SQL & Survey Microdata Validation Queries', 'Relational database schema design for survey tables, complex window functions, cross-tabulation aggregation queries, and automated data integrity triggers.', 'Technical Competencies', 'Foundation', 4, 'https://www.youtube.com/embed/HXV3zeQKqGY', true, '["ALL"]'::jsonb),
    ('IGOT-TECH-104', 'Stata & SPSS for Survey Cross-Tabulation & Complex Panel Econometrics', 'Survey weighting commands in Stata (svyset), panel fixed and random effect estimations, multi-dimensional cross-tabulations in SPSS, and output formatting.', 'Technical Competencies', 'Intermediate', 5, 'https://www.youtube.com/embed/m6l8b7cE17E', false, '["NAD","ESD","PSD","SSD"]'::jsonb),
    ('IGOT-GIS-402', 'Geospatial Information Systems (GIS) & Remote Sensing Sampling', 'QGIS integration, satellite imagery land classification (NDVI), urban and rural enumeration block (EB) spatial frame delineation, and thematic choropleth cartography.', 'Technical Competencies', 'Advanced', 6, 'https://www.youtube.com/embed/kCz3Xyeghp8', false, '["FOD","SDRD","STATE_DES"]'::jsonb),
    ('IGOT-TECH-106', 'Data Visualization, Dashboards & Interactive Statistical Reporting', 'Building national statistical dashboards using Power BI and Tableau, interactive chart principles, color theory for official reports, and automated PDF report compilation.', 'Technical Competencies', 'Intermediate', 5, 'https://www.youtube.com/embed/3fy4fK0mQoQ', false, '["ALL"]'::jsonb),
    ('IGOT-TECH-108', 'Cloud Computing, Automated Microdata Exchange & Open Government Data (OGD) APIs', 'RESTful API creation for official microdata dissemination, Open Government Data (data.gov.in) interoperability standards, and high-performance cloud processing.', 'Technical Competencies', 'Advanced', 5, 'https://www.youtube.com/embed/yZqKzL98v4g', false, '["DIID","DPD"]'::jsonb),
    ('IGOT-CAPI-101', 'CAPI Tablet Data Collection, Field Auditing & Mobile Encryption', 'Field survey tablet configuration, real-time GPS paradata audits, secure mobile sqlite encryption, error flagging routines, and field synchronization protocols.', 'Technical Competencies', 'Intermediate', 4, 'https://www.youtube.com/embed/k9zTr2MAo4s', false, '["FOD","SDRD"]'::jsonb),
    ('IGOT-CYBER-301', 'Government Cyber Security, ISO 27001 & MoSPI Data Classification', 'Securing statistical microdata assets, CERT-In cybersecurity directives, multi-factor authentication, endpoint hygiene, and security incident response protocols.', 'Digital Governance', 'Intermediate', 4, 'https://www.youtube.com/embed/inWWhr5tnEA', false, '["ALL"]'::jsonb),
    ('IGOT-GOV-102', 'Digital Personal Data Protection (DPDP) Act 2023 & Respondent Anonymization', 'Statutory compliance with DPDP Act 2023, informed consent capture, anonymization techniques (k-anonymity, differential privacy), and data fiduciary obligations.', 'Digital Governance', 'Foundation', 4, 'https://www.youtube.com/embed/fW_c3-p9Vrk', true, '["ALL"]'::jsonb),
    ('IGOT-GOV-103', 'e-Sign, PKI Infrastructure & Digital Signatures in Government Workflow', 'Public Key Infrastructure (PKI) standards, DSC token issuance, Aadhaar-based e-Sign integration, and tamper-evident PDF document certification.', 'Digital Governance', 'Foundation', 3, 'https://www.youtube.com/embed/GSIDS_lvRv4', false, '["ALL"]'::jsonb),
    ('IGOT-GOV-104', 'MeghRaj Government Cloud Architecture & Security Compliance', 'National Cloud MeghRaj deployment guidelines, cloud storage tiering for census microdata, disaster recovery architectures, and security audits.', 'Digital Governance', 'Intermediate', 4, 'https://www.youtube.com/embed/M988_fsOSWo', false, '["DIID","DPD"]'::jsonb),
    ('IGOT-GOV-105', 'Digital Public Infrastructure (DPI), India Stack & National Data Governance', 'Leveraging India Stack components (Aadhaar, DigiLocker, UPI, DEPA), National Data Governance Framework Policy (NDGFP), and cross-departmental data sharing.', 'Digital Governance', 'Intermediate', 4, 'https://www.youtube.com/embed/zOxW51aD6_M', false, '["ALL"]'::jsonb),
    ('IGOT-POSH-101', 'Prevention of Sexual Harassment (POSH) at Workplace & Ethics in Public Administration', 'Workplace conduct rules, POSH legal mandates, Internal Complaints Committee (ICC) functions, and professional ethics in public administration.', 'Behavioural & Managerial', 'Foundation', 3, 'https://www.youtube.com/embed/gP9NfXGzN2U', true, '["ALL"]'::jsonb),
    ('IGOT-LEAD-101', 'Executive Leadership, Strategic Vision & Team Building for Statistical Cadres', 'Strategic visioning, high-performance team leadership in survey operations, conflict resolution, emotional intelligence, and transformational leadership.', 'Behavioural & Managerial', 'Advanced', 5, 'https://www.youtube.com/embed/wX78iKhInsc', false, '["ALL"]'::jsonb),
    ('IGOT-LEAD-102', 'Official Communication, Parliamentary Note Drafting & Data Storytelling', 'Principles of drafting official notes, executive briefings, press releases, and narrative data storytelling for statistical releases.', 'Behavioural & Managerial', 'Intermediate', 4, 'https://www.youtube.com/embed/n4NVPg2kHv4', false, '["ALL"]'::jsonb),
    ('IGOT-IPMD-206', 'Online Central Project Monitoring (OCMS) & Infrastructure Auditing', 'Monitoring central sector infrastructure projects, critical path method (CPM/PERT), flash report analysis, and milestone tracking.', 'Behavioural & Managerial', 'Intermediate', 4, 'https://www.youtube.com/embed/6pB83h9A-68', false, '["IPMD"]'::jsonb),
    ('IGOT-LEAD-104', 'Evidence-Based Policy Formulation & Macroeconomic Decision Making', 'Translating empirical survey statistics into actionable public policy recommendations, policy impact evaluation, and strategic advisory.', 'Behavioural & Managerial', 'Advanced', 5, 'https://www.youtube.com/embed/1kK1G9y_R7A', false, '["ALL"]'::jsonb),
    ('IGOT-LEAD-105', 'Change Management & Institutional Transformation in Statistical Systems', 'Frameworks for managing digital transformation, overcoming institutional inertia, agile capacity building, and continuous competency development.', 'Behavioural & Managerial', 'Advanced', 5, 'https://www.youtube.com/embed/PQ0doKfhecQ', false, '["ALL"]'::jsonb)
ON CONFLICT (course_code) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    domain = EXCLUDED.domain,
    difficulty_level = EXCLUDED.difficulty_level,
    duration_hours = EXCLUDED.duration_hours,
    video_url = EXCLUDED.video_url,
    is_general_mandatory = EXCLUDED.is_general_mandatory,
    target_departments = EXCLUDED.target_departments,
    updated_at = timezone('utc'::text, now());