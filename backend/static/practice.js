// Job-Based Role Practice Controller
// Powers AI-generated job-role interview questions, webcam recording, STT audio conversion, and AI performance analysis.

// ============================================
// CONFIGURATION & API KEYS
// ============================================
const GEMINI_API_KEY  = window.GEMINI_API_KEY  || '';
const OPENAI_API_KEY  = window.OPENAI_API_KEY  || '';
const OLLAMA_BASE_URL = window.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL    = window.OLLAMA_MODEL    || 'gpt-oss:120b-cloud';

function getEffectiveGeminiKey() {
    return localStorage.getItem('user_gemini_api_key') || window.GEMINI_API_KEY || '';
}

function getEffectiveOpenAIKey() {
    return localStorage.getItem('user_openai_api_key') || window.OPENAI_API_KEY || '';
}

let selectedAIModel = 'gemini'; // 'gemini', 'chatgpt', or 'ollama'
let currentVideoStream = null;
let roleMediaRecorder = null;
let roleRecordedChunks = [];
let roleRecordingTimer = null;
let roleRecordingSeconds = 0;
let currentRoleVideoBlob = null;
let roleSpeechRecognition = null;
let roleTranscribedText = '';

let generatedRoleQuestions = [];
let activeRoleQuestionIndex = 0;

// Audio Test & TTS State
let testAudioStream = null;
let testAudioContext = null;
let testAnalyser = null;
let testAnimFrame = null;
let testSpeechRec = null;
let testSampleRecorder = null;
let testSampleChunks = [];
let testSampleTimer = null;
let currentTTSUtterance = null;
let currentTTSVoice = null;
let availableTTSVoices = [];

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    initRoleSetup();
    initModelSelector();
    initVideoControls();
    initAudioTestModalEvents();
    updateApiStatusBadges();
    
    // Automatically generate initial questions for the default role
    generateRoleQuestions();
});

// ============================================
// ROLE SELECTION & AI QUESTION GENERATION
// ============================================
function initRoleSetup() {
    const roleSelect = document.getElementById('role-select');
    if (roleSelect) {
        roleSelect.addEventListener('change', (e) => onRoleSelectChange(e.target.value));
    }
}

function onRoleSelectChange(val) {
    const customInput = document.getElementById('custom-role-input');
    if (customInput) {
        if (val === 'custom') {
            customInput.classList.remove('hidden');
            customInput.focus();
        } else {
            customInput.classList.add('hidden');
        }
    }
}

function getActiveTargetRole() {
    const select = document.getElementById('role-select');
    if (!select) return 'Full Stack Developer';
    if (select.value === 'custom') {
        const customInput = document.getElementById('custom-role-input');
        return (customInput && customInput.value.trim()) ? customInput.value.trim() : 'Custom Role';
    }
    return select.value;
}

async function generateRoleQuestions() {
    const role = getActiveTargetRole();
    const levelSelect = document.getElementById('role-level-select');
    const catSelect = document.getElementById('role-category-select');
    const level = levelSelect ? levelSelect.value : 'Mid-Level (3-5 yrs)';
    const category = catSelect ? catSelect.value : 'Technical';

    const btn = document.getElementById('btn-generate-role');
    const listEl = document.getElementById('role-questions-list');
    const titleEl = document.getElementById('active-role-title');
    const countBadge = document.getElementById('questions-count-badge');

    if (titleEl) titleEl.textContent = role;

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-symbols-rounded rotating">sync</span> Generating AI Questions...';
    }

    if (listEl) {
        listEl.innerHTML = `
            <div style="padding: 2rem; text-align: center; color: var(--text-muted);">
                <span class="material-symbols-rounded rotating" style="font-size: 2.2rem; color: var(--secondary);">sync</span>
                <p style="margin-top: 0.6rem; font-size: 0.95rem;">AI is crafting authentic ${category} interview questions for ${role} (${level})...</p>
            </div>
        `;
    }

    try {
        const resp = await fetch('/api/generate-role-questions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                role,
                level,
                category,
                model: selectedAIModel,
                gemini_key: getEffectiveGeminiKey(),
                openai_key: getEffectiveOpenAIKey()
            })
        });

        const data = await resp.json();
        if (!data.success || !data.questions || data.questions.length === 0) {
            throw new Error(data.error || 'Failed to generate questions');
        }

        generatedRoleQuestions = data.questions;
        renderGeneratedRoleQuestions();
        selectRoleQuestion(0);

        if (countBadge) {
            countBadge.textContent = `${generatedRoleQuestions.length} Questions Ready`;
        }

        showToast(`Generated ${generatedRoleQuestions.length} ${role} interview questions!`, 'info');
    } catch (err) {
        console.error('Error generating questions:', err);
        showToast(`Could not generate questions: ${err.message}`, 'error');
        if (listEl) {
            listEl.innerHTML = `
                <div style="padding: 1.5rem; text-align: center; color: var(--danger);">
                    <span class="material-symbols-rounded" style="font-size: 2rem;">error</span>
                    <p style="margin-top: 0.5rem; font-size: 0.9rem;">Could not load questions: ${err.message}</p>
                    <button class="btn-secondary" style="margin-top: 0.5rem;" onclick="generateRoleQuestions()">Try Again</button>
                </div>
            `;
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span class="material-symbols-rounded">auto_awesome</span> Generate AI Questions';
        }
    }
}

function renderGeneratedRoleQuestions() {
    const listEl = document.getElementById('role-questions-list');
    if (!listEl) return;

    listEl.innerHTML = generatedRoleQuestions.map((q, idx) => {
        const diffClass = (q.difficulty || 'medium').toLowerCase();
        const isActive = idx === activeRoleQuestionIndex;
        return `
            <div class="role-question-item glass-panel ${isActive ? 'active-q' : ''}" onclick="selectRoleQuestion(${idx})">
                <div class="q-left-badge">Q${idx + 1}</div>
                <div class="q-body-content">
                    <div class="q-meta-row">
                        <span class="difficulty-badge ${diffClass}">${q.difficulty || 'Medium'}</span>
                        <span class="q-hint-preview">${q.hint ? q.hint.substring(0, 85) + (q.hint.length > 85 ? '...' : '') : ''}</span>
                    </div>
                    <p class="q-title">${q.question}</p>
                </div>
                <button type="button" class="btn-select-q ${isActive ? 'selected' : ''}">
                    <span class="material-symbols-rounded">${isActive ? 'play_arrow' : 'touch_app'}</span>
                    ${isActive ? 'Active' : 'Practice'}
                </button>
            </div>
        `;
    }).join('');
}

function selectRoleQuestion(idx) {
    if (!generatedRoleQuestions || !generatedRoleQuestions[idx]) return;
    activeRoleQuestionIndex = idx;

    const q = generatedRoleQuestions[idx];
    const promptEl = document.getElementById('role-prompt');
    const diffEl = document.getElementById('role-question-difficulty');
    const hintEl = document.getElementById('role-question-hint');

    if (promptEl) promptEl.textContent = q.question;
    if (diffEl) {
        diffEl.textContent = q.difficulty || 'Medium';
        diffEl.className = `difficulty-badge ${(q.difficulty || 'medium').toLowerCase()}`;
    }
    if (hintEl) {
        hintEl.textContent = q.hint ? `Hint: ${q.hint}` : 'Focus on providing a structured, confident response.';
    }

    renderGeneratedRoleQuestions();
}

// ============================================
// MODEL SELECTOR
// ============================================
function initModelSelector() {
    const buttons = document.querySelectorAll('#role-model-selector .model-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedAIModel = btn.dataset.model || 'gemini';
            showToast(`Switched analysis model to ${selectedAIModel.toUpperCase()}`, 'info');
        });
    });
}

// ============================================
// VIDEO RECORDING & WEBCAM
// ============================================
function initVideoControls() {
    const startBtn = document.getElementById('start-role');
    const stopBtn = document.getElementById('stop-role');
    const analyzeBtn = document.getElementById('analyze-role');
    const downloadBtn = document.getElementById('download-role');
    const uploadInput = document.getElementById('upload-role');

    if (startBtn) startBtn.addEventListener('click', startRoleRecording);
    if (stopBtn) stopBtn.addEventListener('click', stopRoleRecording);
    if (analyzeBtn) analyzeBtn.addEventListener('click', analyzeRoleRecording);
    if (downloadBtn) downloadBtn.addEventListener('click', downloadRoleRecording);

    if (uploadInput) {
        uploadInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (currentVideoStream) {
                currentVideoStream.getTracks().forEach(track => track.stop());
                currentVideoStream = null;
            }

            currentRoleVideoBlob = new Blob([file], { type: file.type });
            const videoEl = document.getElementById('role-video');
            const overlay = document.getElementById('role-overlay');

            if (videoEl) {
                videoEl.srcObject = null;
                videoEl.src = URL.createObjectURL(currentRoleVideoBlob);
                videoEl.muted = false;
                videoEl.controls = true;
                videoEl.load();
                videoEl.onloadedmetadata = () => {
                    roleRecordingSeconds = Math.floor(videoEl.duration) || 60;
                };
            }

            if (overlay) overlay.classList.add('hidden');
            if (startBtn) startBtn.classList.remove('hidden');
            if (stopBtn) stopBtn.classList.add('hidden');
            if (analyzeBtn) {
                analyzeBtn.disabled = false;
                analyzeBtn.classList.remove('hidden');
                analyzeBtn.dataset.transcript = '[UPLOADED_VIDEO]';
            }
            if (downloadBtn) {
                downloadBtn.disabled = false;
                downloadBtn.classList.remove('hidden');
            }
            showToast('Video uploaded successfully. Ready to analyze!', 'info');
        });
    }
}

async function startRoleRecording() {
    const startBtn = document.getElementById('start-role');
    const stopBtn = document.getElementById('stop-role');
    const analyzeBtn = document.getElementById('analyze-role');
    const downloadBtn = document.getElementById('download-role');
    const videoEl = document.getElementById('role-video');
    const overlay = document.getElementById('role-overlay');
    const recIndicator = document.getElementById('role-recording');
    const timerEl = document.getElementById('role-timer');

    try {
        currentVideoStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
            audio: true
        });

        if (videoEl) {
            videoEl.srcObject = currentVideoStream;
            videoEl.muted = true;
            await videoEl.play();
        }

        if (overlay) overlay.classList.add('hidden');
        if (recIndicator) recIndicator.classList.remove('hidden');

        // Setup MediaRecorder
        roleRecordedChunks = [];
        const options = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
            ? { mimeType: 'video/webm;codecs=vp9,opus' }
            : { mimeType: 'video/webm' };

        roleMediaRecorder = new MediaRecorder(currentVideoStream, options);
        roleMediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) roleRecordedChunks.push(e.data);
        };

        roleMediaRecorder.onstop = () => {
            currentRoleVideoBlob = new Blob(roleRecordedChunks, { type: 'video/webm' });
            if (videoEl) {
                videoEl.srcObject = null;
                videoEl.src = URL.createObjectURL(currentRoleVideoBlob);
                videoEl.muted = false;
                videoEl.controls = true;
            }
            if (analyzeBtn) {
                analyzeBtn.disabled = false;
                analyzeBtn.classList.remove('hidden');
                analyzeBtn.dataset.transcript = roleTranscribedText;
            }
            if (downloadBtn) {
                downloadBtn.disabled = false;
                downloadBtn.classList.remove('hidden');
            }
        };

        roleMediaRecorder.start(1000);

        // Timer
        roleRecordingSeconds = 0;
        if (timerEl) timerEl.textContent = '00:00';
        if (roleRecordingTimer) clearInterval(roleRecordingTimer);
        roleRecordingTimer = setInterval(() => {
            roleRecordingSeconds++;
            const mins = String(Math.floor(roleRecordingSeconds / 60)).padStart(2, '0');
            const secs = String(roleRecordingSeconds % 60).padStart(2, '0');
            if (timerEl) timerEl.textContent = `${mins}:${secs}`;

            if (roleRecordingSeconds >= 180) { // Max 3 minutes
                stopRoleRecording();
            }
        }, 1000);

        // Speech Recognition for live STT
        roleTranscribedText = '';
        startRoleSpeechRecognition();

        if (startBtn) startBtn.classList.add('hidden');
        if (stopBtn) stopBtn.classList.remove('hidden');
        if (analyzeBtn) analyzeBtn.disabled = true;
        if (downloadBtn) downloadBtn.disabled = true;

        showToast('Recording started. Speak clearly to answer the question!', 'info');
    } catch (err) {
        console.error('Camera/mic error:', err);
        showToast(`Could not access camera/mic: ${err.message}`, 'error');
    }
}

function stopRoleRecording() {
    const startBtn = document.getElementById('start-role');
    const stopBtn = document.getElementById('stop-role');
    const recIndicator = document.getElementById('role-recording');

    if (roleMediaRecorder && roleMediaRecorder.state !== 'inactive') {
        roleMediaRecorder.stop();
    }

    if (currentVideoStream) {
        currentVideoStream.getTracks().forEach(track => track.stop());
        currentVideoStream = null;
    }

    if (roleRecordingTimer) {
        clearInterval(roleRecordingTimer);
        roleRecordingTimer = null;
    }

    stopRoleSpeechRecognition();

    if (recIndicator) recIndicator.classList.add('hidden');
    if (stopBtn) stopBtn.classList.add('hidden');
    if (startBtn) startBtn.classList.remove('hidden');

    showToast('Recording finished! Click "Analyse Recording" for AI feedback.', 'info');
}

function startRoleSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    try {
        roleSpeechRecognition = new SpeechRecognition();
        roleSpeechRecognition.continuous = true;
        roleSpeechRecognition.interimResults = true;
        roleSpeechRecognition.lang = 'en-US';

        roleSpeechRecognition.onresult = (event) => {
            let transcript = '';
            for (let i = 0; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript + ' ';
            }
            roleTranscribedText = transcript.trim();
        };

        roleSpeechRecognition.onerror = (e) => console.warn('Speech rec error:', e);
        roleSpeechRecognition.start();
    } catch (e) {
        console.warn('Speech recognition start failed:', e);
    }
}

function stopRoleSpeechRecognition() {
    if (roleSpeechRecognition) {
        try { roleSpeechRecognition.stop(); } catch (e) {}
        roleSpeechRecognition = null;
    }
}

function downloadRoleRecording() {
    if (!currentRoleVideoBlob) {
        showToast('No video to download. Please record your answer first.', 'error');
        return;
    }
    const role = getActiveTargetRole().replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const filename = `job_practice_${role}_${new Date().toISOString().slice(0, 10)}.webm`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(currentRoleVideoBlob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast(`Downloaded ${filename}`, 'info');
}

// ============================================
// AI VIDEO ANALYSIS
// ============================================
async function extractVideoFrames(videoEl, numFrames = 6) {
    return new Promise((resolve) => {
        if (!videoEl || !videoEl.duration || videoEl.duration === 0) {
            resolve([]);
            return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = 480;
        canvas.height = 270;
        const ctx = canvas.getContext('2d');
        const frames = [];
        const interval = videoEl.duration / (numFrames + 1);
        let captured = 0;
        const originalTime = videoEl.currentTime;

        function captureNext(idx) {
            if (idx > numFrames) {
                videoEl.currentTime = originalTime;
                resolve(frames);
                return;
            }

            videoEl.currentTime = interval * idx;
            videoEl.onseeked = () => {
                ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
                const base64 = dataUrl.split(',')[1];
                if (base64) frames.push(base64);
                captured++;
                captureNext(captured + 1);
            };
        }

        captureNext(1);
    });
}

async function analyzeRoleRecording() {
    const loadingModal = document.getElementById('loading-modal');
    const loadingText = document.getElementById('loading-text');
    const feedbackBox = document.getElementById('role-feedback');
    const videoEl = document.getElementById('role-video');
    const promptEl = document.getElementById('role-prompt');

    const role = getActiveTargetRole();
    const level = document.getElementById('role-level-select')?.value || 'Mid-Level';
    const questionText = promptEl ? promptEl.textContent : '';
    const transcript = roleTranscribedText || document.getElementById('analyze-role')?.dataset?.transcript || '';

    if (!questionText) {
        showToast('Please select or generate a question first.', 'error');
        return;
    }

    if (selectedAIModel === 'chatgpt' && !getEffectiveOpenAIKey()) {
        showToast('No OpenAI API key found! Please click "Paste API Keys" at the top to configure one.', 'error');
        openApiSettingsModal();
        return;
    }

    if (loadingModal) loadingModal.classList.remove('hidden');
    if (loadingText) loadingText.textContent = `Analyzing your answer with ${selectedAIModel.toUpperCase()} for ${role}...`;

    try {
        let frames = [];
        if (videoEl && videoEl.src && videoEl.readyState >= 1) {
            if (loadingText) loadingText.textContent = 'Extracting performance frames...';
            try {
                frames = await extractVideoFrames(videoEl, 6);
            } catch (fe) {
                console.warn('Frame extraction failed:', fe);
            }
        }

        const payload = {
            frames,
            transcript,
            prompt: questionText,
            type: 'Role-Based Interview',
            role,
            level,
            duration: roleRecordingSeconds,
            gemini_key: getEffectiveGeminiKey(),
            openai_key: getEffectiveOpenAIKey()
        };

        const endpoint = selectedAIModel === 'chatgpt'
            ? '/api/analyze-video/chatgpt'
            : (selectedAIModel === 'ollama' ? '/api/analyze-video/ollama' : '/api/analyze-video/gemini');

        const resp = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await resp.json();
        if (!data.success) {
            throw new Error(data.error || 'AI analysis request failed');
        }

        renderRoleFeedback(data, role, level, questionText);
        showToast('AI Role Analysis complete!', 'info');

        // Save to local storage history
        saveRoleSessionToHistory({
            role,
            level,
            question: questionText,
            score: data.overall_score || data.score || 78,
            date: new Date().toISOString(),
            duration: roleRecordingSeconds
        });

    } catch (err) {
        console.error('Analysis error:', err);
        showToast(`Analysis failed: ${err.message}`, 'error');
    } finally {
        if (loadingModal) loadingModal.classList.add('hidden');
    }
}

function renderRoleFeedback(data, role, level, question) {
    const feedbackBox = document.getElementById('role-feedback');
    if (!feedbackBox) return;

    const analysis = data.analysis || data;
    const scores = analysis.scores || { clarity: 75, confidence: 75, structure: 75, engagement: 75 };
    const clarityVal = scores.clarity ?? scores.communication ?? 78;
    const confVal = scores.confidence ?? scores.body_language ?? 75;
    const structVal = scores.structure ?? scores.technical_depth ?? 76;
    const engageVal = scores.engagement ?? scores.relevance ?? 80;

    const score = analysis.overall_score || data.overall_score || Math.round(
        (clarityVal + confVal + structVal + engageVal) / 4
    );

    const strengths = Array.isArray(analysis.positives) && analysis.positives.length > 0 ? analysis.positives : (
        Array.isArray(analysis.strengths) && analysis.strengths.length > 0 ? analysis.strengths : [
            'Clear articulation of core concepts and structured explanation.',
            'Good presence and confident delivery throughout the response.'
        ]
    );

    const improvements = Array.isArray(analysis.improvements) && analysis.improvements.length > 0 ? analysis.improvements : (
        Array.isArray(analysis.areas_for_improvement) && analysis.areas_for_improvement.length > 0 ? analysis.areas_for_improvement : [
            'Incorporate specific metrics and business impact into your technical examples.',
            'Structure your problem-solving process using the STAR methodology.'
        ]
    );

    const feedbackText = analysis.overallFeedback || analysis.feedback || analysis.full_feedback || 'Your answer demonstrated good understanding of the target domain. Keep practicing concise explanations.';
    const visualObservations = analysis.visualObservations || '';

    feedbackBox.innerHTML = `
        <div class="feedback-card glass-panel" style="animation: fadeIn 0.4s ease;">
            <div class="feedback-header">
                <div>
                    <h3 style="margin: 0; font-size: 1.25rem;">Role Performance Evaluation</h3>
                    <p style="margin: 0.25rem 0 0; font-size: 0.85rem; color: var(--text-muted);">${role} &bull; ${level}</p>
                </div>
                <div class="score-circle-large" style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 68px; height: 68px; border-radius: 50%; background: linear-gradient(135deg, var(--secondary), var(--primary)); color: #fff; font-weight: 700;">
                    <span style="font-size: 1.4rem; line-height: 1;">${score}</span>
                    <span style="font-size: 0.65rem; text-transform: uppercase;">/ 100</span>
                </div>
            </div>

            <!-- Metric Scores -->
            <div class="metrics-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 0.75rem; margin: 1.2rem 0;">
                <div class="metric-item glass-panel" style="padding: 0.75rem; text-align: center; border-radius: 10px;">
                    <div style="font-size: 0.76rem; color: var(--text-muted);">Clarity</div>
                    <div style="font-size: 1.25rem; font-weight: 700; color: #55efc4; margin-top: 0.2rem;">${clarityVal}%</div>
                </div>
                <div class="metric-item glass-panel" style="padding: 0.75rem; text-align: center; border-radius: 10px;">
                    <div style="font-size: 0.76rem; color: var(--text-muted);">Confidence</div>
                    <div style="font-size: 1.25rem; font-weight: 700; color: #fdcb6e; margin-top: 0.2rem;">${confVal}%</div>
                </div>
                <div class="metric-item glass-panel" style="padding: 0.75rem; text-align: center; border-radius: 10px;">
                    <div style="font-size: 0.76rem; color: var(--text-muted);">Structure</div>
                    <div style="font-size: 1.25rem; font-weight: 700; color: #a29bfe; margin-top: 0.2rem;">${structVal}%</div>
                </div>
                <div class="metric-item glass-panel" style="padding: 0.75rem; text-align: center; border-radius: 10px;">
                    <div style="font-size: 0.76rem; color: var(--text-muted);">Engagement</div>
                    <div style="font-size: 1.25rem; font-weight: 700; color: var(--secondary); margin-top: 0.2rem;">${engageVal}%</div>
                </div>
            </div>

            ${visualObservations ? `
            <div class="glass-panel" style="padding: 0.9rem; border-radius: 10px; margin-bottom: 1rem; background: rgba(0, 184, 148, 0.08); border: 1px solid rgba(0, 184, 148, 0.25);">
                <div style="font-size: 0.8rem; font-weight: 600; color: #00cec9; display: flex; align-items: center; gap: 0.35rem; margin-bottom: 0.3rem;">
                    <span class="material-symbols-rounded" style="font-size: 1rem;">videocam</span> Visual & Posture Observations
                </div>
                <p style="margin: 0; font-size: 0.86rem; line-height: 1.5; color: var(--text-main);">${visualObservations}</p>
            </div>
            ` : ''}

            <!-- Strengths -->
            <div style="margin-bottom: 1rem;">
                <h4 style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.95rem; color: var(--secondary); margin-bottom: 0.5rem;">
                    <span class="material-symbols-rounded">check_circle</span> Key Strengths
                </h4>
                <ul style="margin: 0; padding-left: 1.2rem; font-size: 0.88rem; line-height: 1.6; color: var(--text-main);">
                    ${strengths.map(s => `<li>${s}</li>`).join('')}
                </ul>
            </div>

            <!-- Improvements -->
            <div style="margin-bottom: 1.2rem;">
                <h4 style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.95rem; color: var(--warning); margin-bottom: 0.5rem;">
                    <span class="material-symbols-rounded">trending_up</span> Areas for Growth
                </h4>
                <ul style="margin: 0; padding-left: 1.2rem; font-size: 0.88rem; line-height: 1.6; color: var(--text-main);">
                    ${improvements.map(i => `<li>${i}</li>`).join('')}
                </ul>
            </div>

            <!-- Overall Summary -->
            <div class="glass-panel" style="padding: 1rem; border-radius: 10px; background: rgba(0,0,0,0.25);">
                <div style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.35rem;">AI Feedback Summary</div>
                <p style="margin: 0; font-size: 0.88rem; line-height: 1.5; color: var(--text-main);">${feedbackText}</p>
            </div>
        </div>
    `;
}

function saveRoleSessionToHistory(session) {
    try {
        const stored = JSON.parse(localStorage.getItem('role_practice_history') || '[]');
        stored.unshift(session);
        localStorage.setItem('role_practice_history', JSON.stringify(stored.slice(0, 20)));
    } catch (e) {
        console.warn('Failed to save to localStorage:', e);
    }
}

// ============================================
// AUDIO TEST MODAL CONTROLLER
// ============================================
function initAudioTestModalEvents() {
    const modal = document.getElementById('audio-test-modal');
    if (!modal) return;

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeAudioTestModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            closeAudioTestModal();
        }
    });

    if ('speechSynthesis' in window) {
        populateTTSVoices();
        window.speechSynthesis.onvoiceschanged = populateTTSVoices;
    }
}

let isAudioListening = false;

// Toggle live audio listening in audio test modal
function toggleAudioListening() {
    const btn = document.getElementById('btn-toggle-listen');
    const icon = document.getElementById('listen-toggle-icon');
    const text = document.getElementById('listen-toggle-text');
    const badge = document.getElementById('audio-level-badge');
    const vuBar = document.getElementById('vu-meter-bar');
    const dbText = document.getElementById('audio-db-text');
    const feedback = document.getElementById('audio-status-feedback');
    const canvas = document.getElementById('audio-visualizer-canvas');

    if (isAudioListening) {
        // Stop listening
        if (testAudioStream) {
            testAudioStream.getTracks().forEach(t => t.stop());
            testAudioStream = null;
        }
        if (testAnimFrame) {
            cancelAnimationFrame(testAnimFrame);
            testAnimFrame = null;
        }
        if (testAudioContext && testAudioContext.state !== 'closed') {
            try { testAudioContext.close(); } catch (e) {}
            testAudioContext = null;
        }
        if (testSpeechRec) {
            try { testSpeechRec.stop(); } catch (e) {}
            testSpeechRec = null;
        }
        isAudioListening = false;

        if (btn) btn.classList.remove('listening');
        if (icon) icon.textContent = 'mic';
        if (text) text.textContent = 'Start Listening';
        if (badge) {
            badge.textContent = 'Paused';
            badge.className = 'level-badge idle';
        }
        if (vuBar) vuBar.style.width = '0%';
        if (dbText) dbText.textContent = 'Volume: 0%';
        if (feedback) feedback.textContent = 'Microphone listening paused. Click "Start Listening" to resume.';
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        showToast('Microphone listening paused', 'info');
    } else {
        // Start listening
        const select = document.getElementById('audio-device-select');
        const deviceId = select ? select.value : '';
        const constraints = deviceId ? { audio: { deviceId: { exact: deviceId } } } : { audio: true };

        navigator.mediaDevices.getUserMedia(constraints).then(stream => {
            testAudioStream = stream;
            populateAudioDevices();
            startAudioVisualizer(testAudioStream);
            startTestSpeechRecognition();
            isAudioListening = true;

            if (btn) btn.classList.add('listening');
            if (icon) icon.textContent = 'mic_off';
            if (text) text.textContent = 'Stop Listening';
            showToast('Microphone listening active', 'info');
        }).catch(err => {
            console.error('Audio test mic error:', err);
            showToast('Microphone access denied or not found.', 'error');
        });
    }
}

async function openAudioTestModal() {
    const modal = document.getElementById('audio-test-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    isAudioListening = true;
    const btn = document.getElementById('btn-toggle-listen');
    const icon = document.getElementById('listen-toggle-icon');
    const text = document.getElementById('listen-toggle-text');
    if (btn) btn.classList.add('listening');
    if (icon) icon.textContent = 'mic_off';
    if (text) text.textContent = 'Stop Listening';

    try {
        testAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        populateAudioDevices();
        startAudioVisualizer(testAudioStream);
        startTestSpeechRecognition();
    } catch (err) {
        console.error('Audio test mic error:', err);
        showToast('Microphone access denied or not found.', 'error');
    }
}

function closeAudioTestModal() {
    const modal = document.getElementById('audio-test-modal');
    if (modal) modal.classList.add('hidden');

    if (testAudioStream) {
        testAudioStream.getTracks().forEach(t => t.stop());
        testAudioStream = null;
    }

    if (testAnimFrame) cancelAnimationFrame(testAnimFrame);
    if (testAudioContext && testAudioContext.state !== 'closed') {
        try { testAudioContext.close(); } catch (e) {}
        testAudioContext = null;
    }

    if (testSpeechRec) {
        try { testSpeechRec.stop(); } catch (e) {}
        testSpeechRec = null;
    }

    stopAISpeechPlayback();

    isAudioListening = false;
    const btn = document.getElementById('btn-toggle-listen');
    const icon = document.getElementById('listen-toggle-icon');
    const text = document.getElementById('listen-toggle-text');
    if (btn) btn.classList.remove('listening');
    if (icon) icon.textContent = 'mic';
    if (text) text.textContent = 'Start Listening';
}

async function populateAudioDevices() {
    const select = document.getElementById('audio-device-select');
    if (!select) return;

    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(d => d.kind === 'audioinput');

        select.innerHTML = '';
        if (audioInputs.length === 0) {
            select.innerHTML = '<option value="">Default Microphone</option>';
            return;
        }

        audioInputs.forEach((device, index) => {
            const opt = document.createElement('option');
            opt.value = device.deviceId;
            opt.textContent = device.label || `Microphone ${index + 1}`;
            select.appendChild(opt);
        });
    } catch (e) {
        console.warn('Could not enumerate audio devices:', e);
    }
}

async function switchTestAudioDevice(deviceId) {
    if (!deviceId) return;
    if (testAudioStream) testAudioStream.getTracks().forEach(t => t.stop());

    try {
        testAudioStream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { exact: deviceId } }
        });
        startAudioVisualizer(testAudioStream);
    } catch (err) {
        console.error('Error switching audio device:', err);
    }
}

function startAudioVisualizer(stream) {
    const canvas = document.getElementById('audio-visualizer-canvas');
    const levelText = document.getElementById('audio-db-text');
    const statusBadge = document.getElementById('audio-level-badge');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    testAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = testAudioContext.createMediaStreamSource(stream);
    testAnalyser = testAudioContext.createAnalyser();
    testAnalyser.fftSize = 64;
    source.connect(testAnalyser);

    const dataArray = new Uint8Array(testAnalyser.frequencyBinCount);

    function draw() {
        testAnimFrame = requestAnimationFrame(draw);
        testAnalyser.getByteFrequencyData(dataArray);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        let sum = 0;
        const barWidth = (canvas.width / dataArray.length) * 1.5;
        let x = 0;

        for (let i = 0; i < dataArray.length; i++) {
            const v = dataArray[i];
            sum += v;
            const barHeight = (v / 255) * canvas.height;

            const r = Math.min(255, v + 50);
            const g = 206;
            const b = 201;
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);
            x += barWidth;
        }

        const avg = Math.round(sum / dataArray.length);
        const percent = Math.min(100, Math.round((avg / 128) * 100));

        if (levelText) levelText.textContent = `Volume: ${percent}%`;
        if (statusBadge) {
            if (percent > 65) {
                statusBadge.textContent = 'LOUD';
                statusBadge.style.color = 'var(--warning)';
            } else if (percent > 15) {
                statusBadge.textContent = 'OPTIMAL';
                statusBadge.style.color = 'var(--secondary)';
            } else {
                statusBadge.textContent = 'SILENT';
                statusBadge.style.color = 'var(--text-muted)';
            }
        }
    }

    draw();
}

function startTestSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const transcriptEl = document.getElementById('audio-test-transcript');
    const statusBadge = document.getElementById('stt-status-badge');

    if (!SpeechRecognition) {
        if (transcriptEl) transcriptEl.innerHTML = '<span style="color: var(--text-muted);">Speech recognition not supported in this browser. Use Chrome or Edge.</span>';
        return;
    }

    try {
        testSpeechRec = new SpeechRecognition();
        testSpeechRec.continuous = true;
        testSpeechRec.interimResults = true;
        testSpeechRec.lang = 'en-US';

        testSpeechRec.onresult = (event) => {
            let text = '';
            for (let i = 0; i < event.results.length; i++) {
                text += event.results[i][0].transcript + ' ';
            }
            if (transcriptEl) {
                transcriptEl.innerHTML = `<span style="color: var(--secondary); font-weight: 500;">&check; ${text.trim()}</span>`;
            }
            if (statusBadge) {
                statusBadge.textContent = 'HEARING YOU';
                statusBadge.style.color = 'var(--secondary)';
            }
        };

        testSpeechRec.onerror = () => {
            if (statusBadge) statusBadge.textContent = 'LISTENING...';
        };

        testSpeechRec.start();
    } catch (e) {
        console.warn('Test speech rec failed:', e);
    }
}

function clearAudioTestTranscript() {
    const transcriptEl = document.getElementById('audio-test-transcript');
    if (transcriptEl) {
        transcriptEl.innerHTML = '<span class="transcript-placeholder">Say something into your microphone...</span>';
    }
}

// AI Speech Analysis & Voice Conversion
async function analyzeSpeechWithAI() {
    const transcriptEl = document.getElementById('audio-test-transcript');
    const transcript = transcriptEl ? transcriptEl.textContent.replace('✓', '').trim() : '';

    if (!transcript || transcript.includes('Say something')) {
        showToast('Please speak something first so the AI can analyze your voice.', 'error');
        return;
    }

    const btn = document.getElementById('btn-analyze-speech');
    const resultsContainer = document.getElementById('audio-ai-analysis-container');

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-symbols-rounded rotating">sync</span> Analyzing & Converting...';
    }

    try {
        const resp = await fetch('/api/analyze-audio-test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transcript,
                gemini_key: getEffectiveGeminiKey(),
                openai_key: getEffectiveOpenAIKey()
            })
        });

        const data = await resp.json();
        if (!data.success) throw new Error(data.error || 'Failed to analyze speech');

        if (resultsContainer) resultsContainer.classList.remove('hidden');

        const analysis = data.analysis || data;
        const clarity = analysis.clarityScore ? `${analysis.clarityScore}%` : (analysis.speech_clarity || 'Good');
        const confidence = analysis.confidenceScore ? `${analysis.confidenceScore}%` : '85%';
        const tone = analysis.detectedTone || analysis.tone || 'Professional';
        const fillers = (analysis.fillerWords && analysis.fillerWords.length > 0)
            ? `${analysis.fillerWords.length} found`
            : (analysis.filler_words_detected ? `${analysis.filler_words_detected.length} found` : 'None');

        const feedback = analysis.feedback || analysis.pacing || analysis.ai_response || 'Clear and well-paced delivery.';
        const polished = analysis.improvedText || analysis.polished_text || transcript;

        document.getElementById('metric-clarity').textContent = clarity;
        document.getElementById('metric-confidence').textContent = confidence;
        document.getElementById('metric-tone').textContent = tone;
        document.getElementById('metric-fillers').textContent = fillers;

        document.getElementById('speech-feedback-text').textContent = feedback;
        document.getElementById('polished-speech-text').textContent = `"${polished}"`;

        // Speak back converted audio automatically
        speakText(polished);

        showToast('Speech analyzed and converted to AI voice!', 'info');
    } catch (err) {
        console.error('Speech test AI error:', err);
        showToast(`AI Audio analysis failed: ${err.message}`, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span class="material-symbols-rounded">psychology</span> Analyze with AI & Speak Response';
        }
    }
}

function populateTTSVoices() {
    if (!('speechSynthesis' in window)) return;
    availableTTSVoices = window.speechSynthesis.getVoices();
    const select = document.getElementById('tts-voice-select');
    if (!select) return;

    select.innerHTML = '<option value="">Default AI Voice</option>';
    availableTTSVoices.forEach((voice, index) => {
        if (voice.lang.startsWith('en')) {
            const opt = document.createElement('option');
            opt.value = index;
            opt.textContent = `${voice.name} (${voice.lang})`;
            select.appendChild(opt);
        }
    });
}

function changeTTSVoice(index) {
    if (index !== '' && availableTTSVoices[index]) {
        currentTTSVoice = availableTTSVoices[index];
    } else {
        currentTTSVoice = null;
    }
}

function speakText(text) {
    if (!('speechSynthesis' in window) || !text) return;

    window.speechSynthesis.cancel();
    currentTTSUtterance = new SpeechSynthesisUtterance(text);
    if (currentTTSVoice) currentTTSUtterance.voice = currentTTSVoice;
    currentTTSUtterance.rate = 1.0;
    currentTTSUtterance.pitch = 1.0;

    const speakBtn = document.getElementById('btn-tts-speak');
    const stopBtn = document.getElementById('btn-tts-stop');
    const btnText = document.getElementById('tts-btn-text');

    currentTTSUtterance.onstart = () => {
        if (btnText) btnText.textContent = 'Speaking...';
        if (stopBtn) stopBtn.classList.remove('hidden');
    };

    currentTTSUtterance.onend = () => {
        if (btnText) btnText.textContent = 'Listen to Audio Conversion';
        if (stopBtn) stopBtn.classList.add('hidden');
    };

    currentTTSUtterance.onerror = () => {
        if (btnText) btnText.textContent = 'Listen to Audio Conversion';
        if (stopBtn) stopBtn.classList.add('hidden');
    };

    window.speechSynthesis.speak(currentTTSUtterance);
}

function toggleAISpeechPlayback() {
    const polishedEl = document.getElementById('polished-speech-text');
    const text = polishedEl ? polishedEl.textContent.replace(/"/g, '') : '';
    if (text && text !== '...') {
        speakText(text);
    } else {
        showToast('Run AI Analysis first to generate the audio conversion.', 'info');
    }
}

function stopAISpeechPlayback() {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
    const btnText = document.getElementById('tts-btn-text');
    const stopBtn = document.getElementById('btn-tts-stop');
    if (btnText) btnText.textContent = 'Listen to Audio Conversion';
    if (stopBtn) stopBtn.classList.add('hidden');
}

// 5-Second Playback Test
function toggleSampleRecording() {
    const btn = document.getElementById('btn-sample-record');
    const timer = document.getElementById('playback-timer');
    const audioEl = document.getElementById('audio-sample-playback');

    if (!testAudioStream) {
        showToast('Microphone stream is not active.', 'error');
        return;
    }

    testSampleChunks = [];
    testSampleRecorder = new MediaRecorder(testAudioStream);

    testSampleRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) testSampleChunks.push(e.data);
    };

    testSampleRecorder.onstop = () => {
        const audioBlob = new Blob(testSampleChunks, { type: 'audio/webm' });
        if (audioEl) {
            audioEl.src = URL.createObjectURL(audioBlob);
            audioEl.classList.remove('hidden');
            audioEl.play();
        }
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span class="material-symbols-rounded">refresh</span> Re-record 5s Sample';
        }
    };

    testSampleRecorder.start();
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-symbols-rounded">radio_button_checked</span> Recording (5s)...';
    }

    let left = 5;
    if (timer) timer.textContent = `00:0${left}`;
    testSampleTimer = setInterval(() => {
        left--;
        if (timer) timer.textContent = `00:0${left}`;
        if (left <= 0) {
            clearInterval(testSampleTimer);
            if (testSampleRecorder && testSampleRecorder.state !== 'inactive') {
                testSampleRecorder.stop();
            }
        }
    }, 1000);
}

// ============================================
// API SETTINGS MODAL
// ============================================
function openApiSettingsModal() {
    const modal = document.getElementById('api-keys-modal');
    if (!modal) return;

    const geminiInput = document.getElementById('input-gemini-key');
    const openaiInput = document.getElementById('input-openai-key');

    if (geminiInput) geminiInput.value = localStorage.getItem('user_gemini_api_key') || '';
    if (openaiInput) openaiInput.value = localStorage.getItem('user_openai_api_key') || '';

    modal.classList.remove('hidden');
}

function closeApiSettingsModal() {
    const modal = document.getElementById('api-keys-modal');
    if (modal) modal.classList.add('hidden');
}

function saveCustomApiKeys() {
    const geminiInput = document.getElementById('input-gemini-key');
    const openaiInput = document.getElementById('input-openai-key');

    const gKey = geminiInput ? geminiInput.value.trim() : '';
    const oKey = openaiInput ? openaiInput.value.trim() : '';

    if (gKey) localStorage.setItem('user_gemini_api_key', gKey);
    else localStorage.removeItem('user_gemini_api_key');

    if (oKey) localStorage.setItem('user_openai_api_key', oKey);
    else localStorage.removeItem('user_openai_api_key');

    updateApiStatusBadges();
    closeApiSettingsModal();
    showToast('API Keys saved successfully!', 'info');
}

function clearCustomApiKeys() {
    localStorage.removeItem('user_gemini_api_key');
    localStorage.removeItem('user_openai_api_key');

    const geminiInput = document.getElementById('input-gemini-key');
    const openaiInput = document.getElementById('input-openai-key');
    if (geminiInput) geminiInput.value = '';
    if (openaiInput) openaiInput.value = '';

    updateApiStatusBadges();
    showToast('Reset to default system API keys.', 'info');
}

function toggleKeyVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
}

function updateApiStatusBadges() {
    const geminiBadge = document.getElementById('gemini-status-badge');
    const openaiBadge = document.getElementById('chatgpt-status-badge');

    const hasGemini = Boolean(getEffectiveGeminiKey());
    const hasOpenAI = Boolean(getEffectiveOpenAIKey());

    if (geminiBadge) {
        geminiBadge.textContent = hasGemini ? 'Ready' : 'Not Set';
        geminiBadge.className = `api-status-badge ${hasGemini ? 'ready' : 'empty'}`;
    }

    if (openaiBadge) {
        openaiBadge.textContent = hasOpenAI ? 'Ready' : 'Not Set';
        openaiBadge.className = `api-status-badge ${hasOpenAI ? 'ready' : 'empty'}`;
    }
}

// ============================================
// TOAST HELPER
// ============================================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) {
        console.log(`[Toast ${type}]: ${message}`);
        return;
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'error' ? 'error' : (type === 'info' ? 'info' : 'check_circle');
    toast.innerHTML = `
        <span class="material-symbols-rounded">${icon}</span>
        <span>${message}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// Window bindings for inline HTML onclick handlers
window.generateRoleQuestions = generateRoleQuestions;
window.onRoleSelectChange = onRoleSelectChange;
window.selectRoleQuestion = selectRoleQuestion;
window.openAudioTestModal = openAudioTestModal;
window.closeAudioTestModal = closeAudioTestModal;
window.toggleAudioListening = toggleAudioListening;
window.populateAudioDevices = populateAudioDevices;
window.switchTestAudioDevice = switchTestAudioDevice;
window.clearAudioTestTranscript = clearAudioTestTranscript;
window.analyzeSpeechWithAI = analyzeSpeechWithAI;
window.toggleAISpeechPlayback = toggleAISpeechPlayback;
window.stopAISpeechPlayback = stopAISpeechPlayback;
window.changeTTSVoice = changeTTSVoice;
window.toggleSampleRecording = toggleSampleRecording;
window.openApiSettingsModal = openApiSettingsModal;
window.closeApiSettingsModal = closeApiSettingsModal;
window.saveCustomApiKeys = saveCustomApiKeys;
window.clearCustomApiKeys = clearCustomApiKeys;
window.toggleKeyVisibility = toggleKeyVisibility;
