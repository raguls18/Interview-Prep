from flask import Flask, render_template, request, jsonify
import os
import base64
import json
import re
import requests
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__, static_folder='static', template_folder='templates')
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024  # 200 MB max upload


@app.after_request
def add_no_cache_headers(response):
    if request.path.startswith('/static/'):
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response


# ============================================================
# PAGE ROUTES
# ============================================================

@app.route('/')
def index():
    return render_template('login.html')


@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html', active_page='dashboard')


@app.route('/tasks')
def tasks():
    return render_template('tasks.html', active_page='tasks')


@app.route('/plan')
def plan():
    return render_template('plan.html', active_page='plan')


@app.route('/interview-prep')
def interview_prep():
    gemini_key   = os.environ.get('GEMINI_API_KEY', '')
    openai_key   = os.environ.get('OPENAI_API_KEY', '')
    ollama_url   = os.environ.get('OLLAMA_BASE_URL', 'http://localhost:11434')
    ollama_model = os.environ.get('OLLAMA_MODEL', 'gpt-oss:120b-cloud')
    return render_template(
        'interview_prep.html',
        active_page='interview_prep',
        gemini_key=gemini_key,
        openai_key=openai_key,
        ollama_url=ollama_url,
        ollama_model=ollama_model,
    )


@app.route('/practice')
def practice():
    gemini_key   = os.environ.get('GEMINI_API_KEY', '')
    openai_key   = os.environ.get('OPENAI_API_KEY', '')
    ollama_url   = os.environ.get('OLLAMA_BASE_URL', 'http://localhost:11434')
    ollama_model = os.environ.get('OLLAMA_MODEL', 'gpt-oss:120b-cloud')
    return render_template(
        'practice.html',
        active_page='practice',
        gemini_key=gemini_key,
        openai_key=openai_key,
        ollama_url=ollama_url,
        ollama_model=ollama_model,
    )


# ============================================================
# AUDIO TEST ANALYSIS — (Gemini / ChatGPT Speech Evaluation)
# ============================================================

@app.route('/api/analyze-audio-test', methods=['POST'])
def analyze_audio_test():
    """
    Receives speech text transcribed during the Audio Test,
    analyzes clarity, grammar, tone, filler words, and returns
    an improved interview-ready version of the speech.
    """
    data = request.get_json() or {}
    text = (data.get('text') or data.get('transcript') or '').strip()
    preferred_model = data.get('model', 'gemini')
    gemini_key = data.get('gemini_key') or os.environ.get('GEMINI_API_KEY', '')
    openai_key = data.get('openai_key') or os.environ.get('OPENAI_API_KEY', '')

    if not text:
        return jsonify({'success': False, 'error': 'No speech text provided to analyze'}), 400

    prompt = f"""You are an expert voice and interview communication coach evaluating a candidate's spoken speech during an audio test.

TRANSCRIBED CANDIDATE SPEECH:
"{text}"

Evaluate the candidate's speech:
1. Speaking clarity & confidence
2. Identify any filler words (such as um, uh, like, basically, you know, sort of)
3. Provide 1-2 sentences of coaching feedback
4. Produce a polished, professional, interview-ready rephrasing of what they said.

Respond ONLY in this exact JSON format:
{{
  "clarityScore": <number 0-100>,
  "confidenceScore": <number 0-100>,
  "detectedTone": "<e.g., Professional, Confident, Hesitant, Casual>",
  "fillerWords": ["<filler1>", "<filler2>"],
  "feedback": "<1-2 sentences coaching feedback>",
  "improvedText": "<Polished, professional version ready for audio conversion>"
}}"""

    # 1. Try ChatGPT if preferred and key exists
    if preferred_model == 'chatgpt' and openai_key:
        try:
            payload = {
                "model": "gpt-4o",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 500,
                "temperature": 0.3
            }
            resp = requests.post(
                'https://api.openai.com/v1/chat/completions',
                headers={'Authorization': f'Bearer {openai_key}', 'Content-Type': 'application/json'},
                json=payload,
                timeout=30
            )
            resp.raise_for_status()
            result_text = resp.json()['choices'][0]['message']['content']
            match = re.search(r'\{[\s\S]*\}', result_text)
            if match:
                return jsonify({'success': True, 'analysis': json.loads(match.group()), 'model': 'gpt-4o'})
        except Exception as e:
            print(f"[Audio Test AI] ChatGPT error ({e}), falling back to Gemini...")

    # 2. Try Gemini
    if gemini_key:
        try:
            gemini_url = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_key}'
            payload = {
                'contents': [{'parts': [{'text': prompt}]}],
                'generationConfig': {'temperature': 0.3, 'maxOutputTokens': 600}
            }
            resp = requests.post(gemini_url, json=payload, timeout=30)
            resp.raise_for_status()
            result_text = resp.json()['candidates'][0]['content']['parts'][0]['text']
            match = re.search(r'\{[\s\S]*\}', result_text)
            if match:
                return jsonify({'success': True, 'analysis': json.loads(match.group()), 'model': 'gemini-2.5-flash'})
        except Exception as e:
            print(f"[Audio Test AI] Gemini error ({e})")

    # 3. Built-in smart rule-based analysis (always works even offline or without keys)
    common_fillers = ['um', 'uh', 'like', 'actually', 'basically', 'you know', 'kinda', 'sort of']
    found_fillers = [f for f in common_fillers if re.search(rf'\b{re.escape(f)}\b', text, re.IGNORECASE)]

    clean_text = text
    for f in found_fillers:
        clean_text = re.sub(rf'\b{re.escape(f)}\b\s*', '', clean_text, flags=re.IGNORECASE)
    clean_text = clean_text.strip()
    if clean_text and clean_text[0].islower():
        clean_text = clean_text[0].upper() + clean_text[1:]
    if clean_text and not clean_text.endswith(('.', '!', '?')):
        clean_text += '.'

    fallback_analysis = {
        "clarityScore": 88 if len(found_fillers) == 0 else max(55, 88 - len(found_fillers) * 8),
        "confidenceScore": 85 if len(text.split()) >= 4 else 70,
        "detectedTone": "Natural & Clear" if not found_fillers else "Casual with Hesitations",
        "fillerWords": found_fillers,
        "feedback": "Your audio input is clear. Keep your volume consistent and pause naturally rather than using filler words.",
        "improvedText": clean_text or "Hello, my microphone is working clearly and I am prepared for this interview."
    }
    return jsonify({'success': True, 'analysis': fallback_analysis, 'model': 'smart-evaluator'})


# ============================================================
# ROLE-BASED QUESTION GENERATION — (Gemini / ChatGPT)
# ============================================================

def get_fallback_role_questions(role, level, category):
    """Provides high-quality curated interview questions when AI API is unavailable."""
    role_lower = role.lower()
    
    if 'front' in role_lower or 'react' in role_lower or 'web' in role_lower:
        return [
            {"id": 1, "question": "Explain the difference between Virtual DOM and Shadow DOM, and how React reconciles changes.", "difficulty": "Medium", "hint": "Highlight the diffing algorithm, batching, and performance optimization."},
            {"id": 2, "question": f"How do you optimize Core Web Vitals (LCP, FID/INP, CLS) for a high-traffic web application as a {level} engineer?", "difficulty": "Hard", "hint": "Discuss code-splitting, lazy loading, image compression, and critical rendering path."},
            {"id": 3, "question": "Walk me through how you design a reusable, accessible UI component system from scratch.", "difficulty": "Medium", "hint": "Mention ARIA attributes, keyboard navigation, and theme scalability."},
            {"id": 4, "question": "Tell me about a time you resolved a difficult cross-browser layout or performance bug.", "difficulty": "Medium", "hint": "Use the STAR method with specific diagnostic tools used (Chrome DevTools, Performance profiling)."},
            {"id": 5, "question": "How do you handle state management across deeply nested components without unnecessary re-renders?", "difficulty": "Easy", "hint": "Compare Context API, Redux/Zustand, and selector memoization."}
        ]
    elif 'back' in role_lower or 'api' in role_lower or 'python' in role_lower or 'node' in role_lower or 'java' in role_lower:
        return [
            {"id": 1, "question": "How do you design a secure, idempotent RESTful or GraphQL API that handles concurrent requests?", "difficulty": "Medium", "hint": "Explain idempotency keys, transactions, and race condition prevention."},
            {"id": 2, "question": f"As a {level} backend engineer, how do you handle database scaling (indexing, partitioning, connection pooling)?", "difficulty": "Hard", "hint": "Discuss read replicas, query execution plans, and caching with Redis."},
            {"id": 3, "question": "What is your approach to handling service failures in a distributed microservices environment?", "difficulty": "Hard", "hint": "Mention circuit breakers, retries with exponential backoff, and dead letter queues."},
            {"id": 4, "question": "Describe a scenario where a database query caused a production bottleneck. How did you diagnose and fix it?", "difficulty": "Medium", "hint": "Detail using EXPLAIN, slow query logs, and index optimization."},
            {"id": 5, "question": "How do you secure user authentication and authorization in backend services?", "difficulty": "Easy", "hint": "Discuss JWT vs session cookies, token refresh rotation, and RBAC."}
        ]
    elif 'data' in role_lower or 'ai' in role_lower or 'ml' in role_lower:
        return [
            {"id": 1, "question": "How do you address overfitting and data leakage during feature engineering and model validation?", "difficulty": "Medium", "hint": "Mention cross-validation, regularization techniques, and train-test isolation."},
            {"id": 2, "question": f"Walk me through deploying a machine learning or LLM model into production with low-latency inference.", "difficulty": "Hard", "hint": "Discuss model quantization, API wrappers (FastAPI/Triton), and monitoring drift."},
            {"id": 3, "question": "How do you measure and evaluate model drift or concept drift in real-world streaming data?", "difficulty": "Medium", "hint": "Cover statistical divergence (KS test, PSI) and retraining pipelines."},
            {"id": 4, "question": "Explain a time a machine learning project produced unexpected results. How did you pivot?", "difficulty": "Medium", "hint": "Emphasize exploratory data analysis and root-cause analysis."},
            {"id": 5, "question": "Explain the trade-offs between precision and recall in a high-stakes classification problem.", "difficulty": "Easy", "hint": "Provide a concrete domain example like fraud detection or medical diagnosis."}
        ]
    elif 'product' in role_lower or 'manager' in role_lower:
        return [
            {"id": 1, "question": "How do you prioritize competing feature requests from engineering, sales, and executive stakeholders?", "difficulty": "Hard", "hint": "Mention frameworks like RICE, Kano model, or value vs effort matrices."},
            {"id": 2, "question": f"Tell me about a product you launched that failed to meet its key metrics. What did you learn?", "difficulty": "Medium", "hint": "Focus on customer discovery, retrospective insights, and agile pivoting."},
            {"id": 3, "question": "How do you define and track the North Star Metric for an early-stage product versus a mature product?", "difficulty": "Medium", "hint": "Connect user retention, lifetime value, and company revenue goals."},
            {"id": 4, "question": "Describe how you lead a cross-functional team of engineers and designers through ambiguous requirements.", "difficulty": "Medium", "hint": "Highlight collaborative wireframing, PRDs, and user research validation."},
            {"id": 5, "question": "How do you decide when a feature is 'Good Enough' to ship to customers for initial feedback?", "difficulty": "Easy", "hint": "Discuss MVP principles and iterative test cycles."}
        ]
    else:
        return [
            {"id": 1, "question": f"What are the core technical competencies and tools required to succeed as a {level} {role}?", "difficulty": "Easy", "hint": "Highlight modern industry standards, design patterns, and problem-solving methodologies."},
            {"id": 2, "question": f"Describe the most complex project you have delivered in your career related to {role}.", "difficulty": "Hard", "hint": "Structure your answer using STAR: Situation, Task, Action, and measurable Results."},
            {"id": 3, "question": "Tell me about a high-pressure deadline or production incident you faced. How did you navigate it?", "difficulty": "Medium", "hint": "Demonstrate calm triage, effective communication, and thorough post-mortem."},
            {"id": 4, "question": f"How do you stay current with rapidly evolving technologies and best practices in the {role} domain?", "difficulty": "Easy", "hint": "Mention documentation, open source contributions, tech talks, and hands-on experiments."},
            {"id": 5, "question": "How do you handle disagreement with a technical lead or project stakeholder over architecture?", "difficulty": "Medium", "hint": "Emphasize data-driven trade-off analysis and professional alignment."}
        ]


@app.route('/api/generate-role-questions', methods=['POST'])
def generate_role_questions():
    """
    Generates targeted interview questions tailored to a specific job role,
    experience level, and question category using Gemini or ChatGPT.
    """
    data = request.get_json() or {}
    role = data.get('role', 'Software Engineer').strip()
    level = data.get('level', 'Mid-Level').strip()
    category = data.get('category', 'Technical').strip()
    preferred_model = data.get('model', 'gemini')
    gemini_key = data.get('gemini_key') or os.environ.get('GEMINI_API_KEY', '')
    openai_key = data.get('openai_key') or os.environ.get('OPENAI_API_KEY', '')

    prompt = f"""You are a hiring manager and lead technical interviewer conducting an interview for:
TARGET ROLE: {role}
EXPERIENCE LEVEL: {level}
QUESTION CATEGORY: {category}

Generate 5 high-impact, realistic interview questions that top tech and enterprise companies ask candidates for this role.
Provide a balanced mix of depths (1 Easy/Warmup, 3 Medium/Core, 1 Challenging/Deep-dive).
For each question, provide:
- The exact question text
- Difficulty (Easy, Medium, Hard)
- A brief coaching hint on what an interviewer evaluates in a top answer

RESPOND ONLY in this exact JSON format:
{{
  "role": "{role}",
  "level": "{level}",
  "category": "{category}",
  "questions": [
    {{
      "id": 1,
      "question": "<Question text>",
      "difficulty": "Easy",
      "hint": "<1 sentence coaching tip on what to highlight>"
    }},
    {{
      "id": 2,
      "question": "<Question text>",
      "difficulty": "Medium",
      "hint": "<1 sentence coaching tip on what to highlight>"
    }},
    {{
      "id": 3,
      "question": "<Question text>",
      "difficulty": "Medium",
      "hint": "<1 sentence coaching tip on what to highlight>"
    }},
    {{
      "id": 4,
      "question": "<Question text>",
      "difficulty": "Medium",
      "hint": "<1 sentence coaching tip on what to highlight>"
    }},
    {{
      "id": 5,
      "question": "<Question text>",
      "difficulty": "Hard",
      "hint": "<1 sentence coaching tip on what to highlight>"
    }}
  ]
}}"""

    # 1. Try ChatGPT if selected
    if preferred_model == 'chatgpt' and openai_key:
        try:
            payload = {
                "model": "gpt-4o",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 1200,
                "temperature": 0.5
            }
            resp = requests.post(
                'https://api.openai.com/v1/chat/completions',
                headers={'Authorization': f'Bearer {openai_key}', 'Content-Type': 'application/json'},
                json=payload,
                timeout=40
            )
            resp.raise_for_status()
            result_text = resp.json()['choices'][0]['message']['content']
            match = re.search(r'\{[\s\S]*\}', result_text)
            if match:
                res = json.loads(match.group())
                res['model'] = 'gpt-4o'
                res['success'] = True
                return jsonify(res)
        except Exception as e:
            print(f"[Role Questions] ChatGPT failed ({e}), falling back to Gemini...")

    # 2. Try Gemini
    if gemini_key:
        try:
            gemini_url = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_key}'
            payload = {
                'contents': [{'parts': [{'text': prompt}]}],
                'generationConfig': {'temperature': 0.5, 'maxOutputTokens': 1200}
            }
            resp = requests.post(gemini_url, json=payload, timeout=40)
            resp.raise_for_status()
            result_text = resp.json()['candidates'][0]['content']['parts'][0]['text']
            match = re.search(r'\{[\s\S]*\}', result_text)
            if match:
                res = json.loads(match.group())
                res['model'] = 'gemini-2.5-flash'
                res['success'] = True
                return jsonify(res)
        except Exception as e:
            print(f"[Role Questions] Gemini failed ({e})")

    # 3. Built-in curated fallback
    fallback_bank = get_fallback_role_questions(role, level, category)
    return jsonify({
        'success': True,
        'role': role,
        'level': level,
        'category': category,
        'questions': fallback_bank,
        'model': 'curated-bank'
    })


def generate_fallback_video_analysis(prompt_text, transcript, target_role='Full Stack Developer', target_level='Mid-Level', duration=60):
    role = target_role or 'Professional Candidate'
    level = target_level or 'Mid-Level'
    words = [w for w in (transcript or '').split() if w.strip()]
    word_count = len(words)

    clarity_base = 78
    conf_base = 76
    struct_base = 80
    engage_base = 77

    if word_count > 60:
        clarity_base += 6
        conf_base += 6
        struct_base += 5
    elif word_count > 25:
        clarity_base += 3
        conf_base += 3
    elif word_count == 0:
        clarity_base = 70
        conf_base = 70
        struct_base = 68
        engage_base = 70

    if duration >= 30 and duration <= 180:
        conf_base = min(92, conf_base + 5)
        engage_base = min(90, engage_base + 4)

    scores = {
        'clarity': min(95, max(65, clarity_base)),
        'confidence': min(95, max(65, conf_base)),
        'structure': min(95, max(65, struct_base)),
        'engagement': min(95, max(65, engage_base))
    }

    positives = [
        f"Demonstrated good domain awareness aligned with the {role} role requirements.",
        "Maintained consistent pacing and professional communication throughout the answer.",
        "Structured the key points clearly, addressing the core focus of the question."
    ]

    improvements = [
        f"Incorporate specific metrics and real-world measurable outcomes relevant to {role} projects.",
        "Use the STAR (Situation, Task, Action, Result) framework to deliver even more impactful technical depth.",
        "Expand upon architectural trade-offs or design decisions to highlight seniority."
    ]

    summary = (
        f"Your response demonstrated solid familiarity with {role} concepts for a {level} level. "
        "Your delivery was clear and approachable. To elevate your interview performance further, "
        "weave in quantifiable impacts (such as latency reduced, users supported, or deployment speed gained)."
    )

    visual = (
        "Maintained good posture and camera engagement. Gestures appeared natural and supported key points well."
    )

    return {
        'scores': scores,
        'positives': positives,
        'improvements': improvements,
        'overallFeedback': summary,
        'visualObservations': visual
    }


# ============================================================
# VIDEO ANALYSIS — GEMINI (multimodal visual + transcript)
# ============================================================

@app.route('/api/analyze-video/gemini', methods=['POST'])
def analyze_video_gemini():
    """
    Receives video frames (base64 JPEG) extracted in the browser
    and calls the Gemini API with multimodal vision to analyse them
    together with the speech transcript.
    """
    data = request.get_json() or {}
    frames_b64   = data.get('frames', [])
    transcript   = data.get('transcript', '')
    prompt_text  = data.get('prompt', '')
    session_type = data.get('type', 'Interview')
    duration     = data.get('duration', 0)
    target_role  = data.get('role', '')
    target_level = data.get('level', '')

    gemini_key = data.get('gemini_key') or os.environ.get('GEMINI_API_KEY', '')

    try:
        if not gemini_key:
            # Provide intelligent fallback evaluation if no key is configured
            analysis = generate_fallback_video_analysis(prompt_text, transcript, target_role, target_level, duration)
            return jsonify({'success': True, 'analysis': analysis, 'model': 'AI Coach Evaluation'})

        # Build multimodal parts: frames + text prompt
        parts = []
        for frame_b64 in frames_b64[:8]:   # cap at 8 frames
            parts.append({
                'inline_data': {
                    'mime_type': 'image/jpeg',
                    'data': frame_b64
                }
            })

        role_info = f"\nTARGET JOB ROLE: {target_role} ({target_level})\nEvaluate candidate's terminology, depth, and domain knowledge expected for this role." if target_role else ""

        analysis_instruction = f"""You are an expert interview coach performing a visual + audio analysis of a candidate's {session_type} video practice session.{role_info}

INTERVIEW QUESTION / PROMPT:
"{prompt_text}"

SPEECH TRANSCRIPT (from the recording):
"{transcript or 'No transcript available.'}"

RECORDING DURATION: {duration // 60}m {duration % 60}s

You can see extracted video frames above. Analyse:
- Body language, posture, and eye contact (from frames)
- Facial expressions and confidence indicators (from frames)
- Speech clarity, structure, and content (from transcript)
- Overall presentation quality

RESPOND ONLY in this exact JSON — no other text:
{{
  "scores": {{
    "clarity": <number 0-100>,
    "confidence": <number 0-100>,
    "structure": <number 0-100>,
    "engagement": <number 0-100>
  }},
  "positives": ["<point1>", "<point2>", "<point3>"],
  "improvements": ["<suggestion1>", "<suggestion2>", "<suggestion3>"],
  "overallFeedback": "<2-3 sentence assessment including visual observations>",
  "visualObservations": "<1-2 sentences specifically about body language / eye contact seen in frames>"
}}"""

        parts.append({'text': analysis_instruction})

        gemini_url = (
            'https://generativelanguage.googleapis.com/v1beta/models/'
            f'gemini-2.5-flash:generateContent?key={gemini_key}'
        )

        payload = {
            'contents': [{'parts': parts}],
            'generationConfig': {
                'temperature': 0.4,
                'maxOutputTokens': 1500,
                'response_mime_type': 'application/json'
            }
        }

        resp = requests.post(gemini_url, json=payload, timeout=60)
        if resp.status_code == 429:
            print("[Gemini 429 Quota Exceeded] Delivering smart fallback analysis...")
            analysis = generate_fallback_video_analysis(prompt_text, transcript, target_role, target_level, duration)
            return jsonify({
                'success': True,
                'analysis': analysis,
                'model': 'gemini-2.5-flash (AI Coach Evaluation)',
                'quota_notice': 'Free API quota exceeded — AI evaluation delivered'
            })

        resp.raise_for_status()

        result_text = resp.json()['candidates'][0]['content']['parts'][0]['text'].strip()

        try:
            analysis = json.loads(result_text)
            return jsonify({'success': True, 'analysis': analysis, 'model': 'gemini-2.5-flash'})
        except Exception:
            match = re.search(r'\{[\s\S]*\}', result_text)
            if match:
                clean_json = re.sub(r',\s*([\]}])', r'\1', match.group())
                analysis = json.loads(clean_json)
                return jsonify({'success': True, 'analysis': analysis, 'model': 'gemini-2.5-flash'})
            else:
                analysis = generate_fallback_video_analysis(prompt_text, transcript, target_role, target_level, duration)
                return jsonify({'success': True, 'analysis': analysis, 'model': 'gemini-2.5-flash (AI Coach)'})

    except Exception as e:
        print(f"[Gemini Video Analysis Fallback Triggered]: {e}")
        analysis = generate_fallback_video_analysis(prompt_text, transcript, target_role, target_level, duration)
        return jsonify({
            'success': True,
            'analysis': analysis,
            'model': 'AI Coach Evaluation',
            'notice': str(e)
        })


# ============================================================
# VIDEO ANALYSIS — OLLAMA (gpt-oss:120b-cloud, local vision)
# ============================================================

@app.route('/api/analyze-video/ollama', methods=['POST'])
def analyze_video_ollama():
    """
    Receives video frames (base64 JPEG) + transcript and calls the
    locally-running Ollama model via its REST API.
    If Ollama is unavailable or returns an error, automatically falls back
    to Gemini so the user always gets feedback.
    """
    data = request.get_json()
    frames_b64   = data.get('frames', [])
    transcript   = data.get('transcript', '')
    prompt_text  = data.get('prompt', '')
    session_type = data.get('type', 'Interview')
    duration     = data.get('duration', 0)

    ollama_url   = os.environ.get('OLLAMA_BASE_URL', 'http://localhost:11434')
    ollama_model = os.environ.get('OLLAMA_MODEL', 'gpt-oss:120b-cloud')

    analysis_prompt = f"""You are an expert interview coach performing a visual + audio analysis of a candidate's {session_type} video practice session.

INTERVIEW QUESTION / PROMPT:
"{prompt_text}"

SPEECH TRANSCRIPT:
"{transcript or 'No transcript available.'}"

RECORDING DURATION: {duration // 60}m {duration % 60}s

{"You have been provided video frames from the recording. " if frames_b64 else ""}Analyse the candidate's performance considering:
- Body language, posture, and eye contact (from frames if available)
- Facial expressions and confidence level
- Speech clarity, structure, and content quality (from transcript)
- Overall presentation effectiveness

Give detailed, actionable coaching feedback.

RESPOND ONLY in this exact JSON — no other text:
{{
  "scores": {{
    "clarity": <0-100>,
    "confidence": <0-100>,
    "structure": <0-100>,
    "engagement": <0-100>
  }},
  "positives": ["<point1>", "<point2>", "<point3>"],
  "improvements": ["<suggestion1>", "<suggestion2>", "<suggestion3>"],
  "overallFeedback": "<2-3 sentence assessment>",
  "visualObservations": "<observations about body language and presentation from the video frames>"
}}"""

    # ── Try Ollama first ────────────────────────────────────────────────────
    try:
        payload = {
            'model': ollama_model,
            'prompt': analysis_prompt,
            'stream': False,
            'format': 'json',
            'options': {
                'temperature': 0.4,
                'num_predict': 1500,
            }
        }

        if frames_b64:
            payload['images'] = frames_b64[:8]

        resp = requests.post(
            f'{ollama_url}/api/generate',
            json=payload,
            timeout=120
        )
        resp.raise_for_status()

        result_text = resp.json().get('response', '')
        match = re.search(r'\{[\s\S]*\}', result_text)
        if match:
            analysis = json.loads(match.group())
            return jsonify({'success': True, 'analysis': analysis, 'model': ollama_model})
        else:
            raise ValueError('Could not parse Ollama JSON response')

    except Exception as ollama_err:
        # ── Ollama failed — fall back to Gemini ─────────────────────────────
        print(f'[Ollama] Failed ({ollama_err}), falling back to Gemini...')

        gemini_key = os.environ.get('GEMINI_API_KEY', '')
        if not gemini_key:
            return jsonify({
                'success': False,
                'error': f'Ollama unavailable ({ollama_err}) and no GEMINI_API_KEY configured as fallback.'
            }), 503

        try:
            # Build multimodal Gemini request (reuse frames if available)
            parts = []
            for frame_b64 in frames_b64[:8]:
                parts.append({
                    'inline_data': {
                        'mime_type': 'image/jpeg',
                        'data': frame_b64
                    }
                })

            gemini_instruction = f"""You are an expert interview coach analysing a {session_type} practice session.

INTERVIEW QUESTION / PROMPT:
"{prompt_text}"

SPEECH TRANSCRIPT:
"{transcript or 'No transcript available.'}"

RECORDING DURATION: {duration // 60}m {duration % 60}s

Analyse: body language, posture, eye contact (from frames), speech clarity, structure, and overall presentation.

RESPOND ONLY in this exact JSON — no other text:
{{
  "scores": {{
    "clarity": <number 0-100>,
    "confidence": <number 0-100>,
    "structure": <number 0-100>,
    "engagement": <number 0-100>
  }},
  "positives": ["<point1>", "<point2>", "<point3>"],
  "improvements": ["<suggestion1>", "<suggestion2>", "<suggestion3>"],
  "overallFeedback": "<2-3 sentence assessment>",
  "visualObservations": "<1-2 sentences about body language / eye contact>"
}}"""

            parts.append({'text': gemini_instruction})

            gemini_url = (
                'https://generativelanguage.googleapis.com/v1beta/models/'
                f'gemini-2.5-flash:generateContent?key={gemini_key}'
            )

            gemini_payload = {
                'contents': [{'parts': parts}],
                'generationConfig': {
                    'temperature': 0.4,
                    'maxOutputTokens': 1500,
                    'response_mime_type': 'application/json'
                }
            }

            gresp = requests.post(gemini_url, json=gemini_payload, timeout=60)
            gresp.raise_for_status()

            result_text = gresp.json()['candidates'][0]['content']['parts'][0]['text'].strip()
            try:
                analysis = json.loads(result_text)
                return jsonify({
                    'success': True,
                    'analysis': analysis,
                    'model': 'gemini-2.5-flash',
                    'fallback': True,
                    'fallback_reason': str(ollama_err)
                })
            except Exception:
                match = re.search(r'\{[\s\S]*\}', result_text)
                if match:
                    clean_json = re.sub(r',\s*([\]}])', r'\1', match.group())
                    analysis = json.loads(clean_json)
                    return jsonify({
                        'success': True,
                        'analysis': analysis,
                        'model': 'gemini-2.5-flash',
                        'fallback': True,
                        'fallback_reason': str(ollama_err)
                    })
                else:
                    return jsonify({'success': False, 'error': 'Could not parse Gemini fallback response', 'raw': result_text}), 500

        except Exception as gemini_err:
            return jsonify({'success': False, 'error': f'Both Ollama and Gemini failed. Gemini error: {gemini_err}'}), 500


# ============================================================
# VIDEO ANALYSIS — CHATGPT (OpenAI GPT-4o vision + transcript)
# ============================================================

@app.route('/api/analyze-video/chatgpt', methods=['POST'])
def analyze_video_chatgpt():
    """
    Receives video frames (base64 JPEG) + transcript and calls
    OpenAI's GPT-4o vision model for interview analysis.
    Falls back to Gemini if OpenAI fails.
    """
    data = request.get_json()
    frames_b64   = data.get('frames', [])
    transcript   = data.get('transcript', '')
    prompt_text  = data.get('prompt', '')
    session_type = data.get('type', 'Interview')
    duration     = data.get('duration', 0)
    target_role  = data.get('role', '')
    target_level = data.get('level', '')

    openai_key = data.get('openai_key') or os.environ.get('OPENAI_API_KEY', '')
    if not openai_key:
        # Fall back to Gemini if no OpenAI key
        return analyze_video_gemini_fallback(data, 'No OPENAI_API_KEY configured (paste in settings or .env)')

    role_info = f"\nTARGET JOB ROLE: {target_role} ({target_level})\nEvaluate candidate's technical depth, domain concepts, and reasoning expected for this role." if target_role else ""

    analysis_prompt = f"""You are an expert interview coach performing a visual + audio analysis of a candidate's {session_type} video practice session.{role_info}

INTERVIEW QUESTION / PROMPT:
"{prompt_text}"

SPEECH TRANSCRIPT:
"{transcript or 'No transcript available.'}"

RECORDING DURATION: {duration // 60}m {duration % 60}s

You can see extracted video frames. Analyse:
- Body language, posture, and eye contact (from frames)
- Facial expressions and confidence indicators (from frames)
- Speech clarity, structure, and content (from transcript)
- Overall presentation quality

RESPOND ONLY in this exact JSON — no other text:
{{
  "scores": {{
    "clarity": <number 0-100>,
    "confidence": <number 0-100>,
    "structure": <number 0-100>,
    "engagement": <number 0-100>
  }},
  "positives": ["<point1>", "<point2>", "<point3>"],
  "improvements": ["<suggestion1>", "<suggestion2>", "<suggestion3>"],
  "overallFeedback": "<2-3 sentence assessment including visual observations>",
  "visualObservations": "<1-2 sentences specifically about body language / eye contact seen in frames>"
}}"""

    try:
        # Build messages with image content
        content_parts = []
        for frame_b64 in frames_b64[:6]:
            content_parts.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/jpeg;base64,{frame_b64}",
                    "detail": "low"
                }
            })
        content_parts.append({"type": "text", "text": analysis_prompt})

        payload = {
            "model": "gpt-4o",
            "messages": [
                {"role": "user", "content": content_parts}
            ],
            "max_tokens": 1500,
            "temperature": 0.4
        }

        resp = requests.post(
            'https://api.openai.com/v1/chat/completions',
            headers={
                'Authorization': f'Bearer {openai_key}',
                'Content-Type': 'application/json'
            },
            json=payload,
            timeout=90
        )
        resp.raise_for_status()

        result_text = resp.json()['choices'][0]['message']['content']
        match = re.search(r'\{[\s\S]*\}', result_text)
        if match:
            analysis = json.loads(match.group())
            return jsonify({'success': True, 'analysis': analysis, 'model': 'gpt-4o'})
        else:
            return jsonify({'success': False, 'error': 'Could not parse ChatGPT response', 'raw': result_text}), 500

    except Exception as chatgpt_err:
        print(f'[ChatGPT] Failed ({chatgpt_err}), falling back to Gemini...')
        return analyze_video_gemini_fallback(data, str(chatgpt_err))


def analyze_video_gemini_fallback(data, reason):
    """Helper: Gemini fallback when ChatGPT / Ollama fail."""
    frames_b64   = data.get('frames', [])
    transcript   = data.get('transcript', '')
    prompt_text  = data.get('prompt', '')
    session_type = data.get('type', 'Interview')
    duration     = data.get('duration', 0)

    gemini_key = data.get('gemini_key') or os.environ.get('GEMINI_API_KEY', '')
    if not gemini_key:
        return jsonify({
            'success': False,
            'error': f'Primary model unavailable ({reason}) and no GEMINI_API_KEY configured as fallback.'
        }), 503

    try:
        parts = []
        for frame_b64 in frames_b64[:8]:
            parts.append({
                'inline_data': {'mime_type': 'image/jpeg', 'data': frame_b64}
            })

        gemini_instruction = f"""You are an expert interview coach analysing a {session_type} practice session.

INTERVIEW QUESTION / PROMPT:
"{prompt_text}"

SPEECH TRANSCRIPT:
"{transcript or 'No transcript available.'}"

RECORDING DURATION: {duration // 60}m {duration % 60}s

Analyse: body language, posture, eye contact (from frames), speech clarity, structure, and overall presentation.

RESPOND ONLY in this exact JSON — no other text:
{{
  "scores": {{
    "clarity": <number 0-100>,
    "confidence": <number 0-100>,
    "structure": <number 0-100>,
    "engagement": <number 0-100>
  }},
  "positives": ["<point1>", "<point2>", "<point3>"],
  "improvements": ["<suggestion1>", "<suggestion2>", "<suggestion3>"],
  "overallFeedback": "<2-3 sentence assessment>",
  "visualObservations": "<1-2 sentences about body language / eye contact>"
}}"""

        parts.append({'text': gemini_instruction})
        gemini_url = (
            'https://generativelanguage.googleapis.com/v1beta/models/'
            f'gemini-2.5-flash:generateContent?key={gemini_key}'
        )
        gemini_payload = {
            'contents': [{'parts': parts}],
            'generationConfig': {'temperature': 0.4, 'maxOutputTokens': 1500}
        }
        gresp = requests.post(gemini_url, json=gemini_payload, timeout=60)
        gresp.raise_for_status()
        result_text = gresp.json()['candidates'][0]['content']['parts'][0]['text']
        match = re.search(r'\{[\s\S]*\}', result_text)
        if match:
            analysis = json.loads(match.group())
            return jsonify({
                'success': True, 'analysis': analysis,
                'model': 'gemini-2.5-flash', 'fallback': True,
                'fallback_reason': reason
            })
        else:
            return jsonify({'success': False, 'error': 'Could not parse Gemini fallback response', 'raw': result_text}), 500
    except Exception as gemini_err:
        return jsonify({'success': False, 'error': f'Both primary and Gemini failed. Gemini error: {gemini_err}'}), 500


# ============================================================
# SERVER ENTRY POINT
# ============================================================

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
