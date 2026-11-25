// Interview Preparation JavaScript
// AI-powered interview practice with video recording and analysis

// ============================================
// API CONFIGURATION
// ============================================
const GEMINI_API_KEY  = window.GEMINI_API_KEY  || '';
const GEMINI_API_URL  = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const OPENAI_API_KEY  = window.OPENAI_API_KEY  || '';
const OLLAMA_BASE_URL = window.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL    = window.OLLAMA_MODEL    || 'gpt-oss:120b-cloud';

// Get effective keys (priority: localStorage pasted key -> backend .env)
function getEffectiveGeminiKey() {
    return localStorage.getItem('user_gemini_api_key') || window.GEMINI_API_KEY || '';
}

function getEffectiveOpenAIKey() {
    return localStorage.getItem('user_openai_api_key') || window.OPENAI_API_KEY || '';
}

// Active model selection per section ('gemini', 'chatgpt', or 'ollama')
const selectedModel = {
    'self-intro': 'gemini',
    'comm': 'gemini'
};

// State
let currentTab = 'overview';
let mediaRecorder = null;
let recordedChunks = [];
let videoStream = null;
let recordingTimer = null;
let recordingSeconds = 0;
let practiceHistory = [];
let allPracticeSessions = [];
let currentVideoBlob = null; // Store current video blob for upload/download

// IndexedDB Configuration for Local Video Storage
const DB_NAME = 'InterviewPrepVideos';
const DB_VERSION = 1;
const VIDEO_STORE_NAME = 'videos';
let videoDB = null;

// Speech Recognition State
let speechRecognition = null;
let transcribedText = '';
let isTranscribing = false;

// Interview questions bank
const interviewQuestions = {
    behavioral: [
        "Tell me about a time you had to work with a difficult team member.",
        "Describe a situation where you had to meet a tight deadline.",
        "Give an example of a goal you reached and how you achieved it.",
        "Tell me about a time you failed. How did you handle it?",
        "Describe a situation where you had to adapt to change quickly."
    ],
    technical: [
        "Explain a complex technical concept to a non-technical person.",
        "How do you stay updated with the latest technology trends?",
        "Describe your approach to debugging a complex problem.",
        "What development methodologies are you familiar with?",
        "How do you ensure code quality in your projects?"
    ],
    situational: [
        "What would you do if you disagreed with your manager's decision?",
        "How would you handle multiple urgent tasks with the same deadline?",
        "What would you do if a team member wasn't pulling their weight?",
        "How would you approach a project with unclear requirements?",
        "What would you do if you made a significant mistake at work?"
    ],
    competency: [
        "What are your greatest strengths and how have you demonstrated them?",
        "How do you prioritize your work when everything seems important?",
        "Describe your leadership style with a specific example.",
        "How do you handle constructive criticism?",
        "What makes you a good team player?"
    ],
    motivation: [
        "Why are you interested in this position?",
        "Where do you see yourself in 5 years?",
        "What motivates you to do your best work?",
        "Why did you choose this career path?",
        "What are you looking for in your next role?"
    ]
};

const selfIntroPrompts = [
    "Introduce yourself in 2 minutes. Include your name, background, key skills, and what makes you unique.",
    "Give a brief introduction focusing on your professional journey and key achievements.",
    "Introduce yourself highlighting your technical skills and soft skills.",
    "Present yourself as if this is your dream job interview. Why should they hire you?",
    "Give a 90-second elevator pitch about yourself.",
    "Introduce yourself focusing on your passion and career goals."
];

// ============================================
// GEMINI API FUNCTIONS
// ============================================

// Show a brief toast notification
function showToast(message, type = 'info') {
    const existing = document.getElementById('ai-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'ai-toast';
    toast.style.cssText = `
        position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
        background: ${type === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(108,92,231,0.15)'};
        border: 1px solid ${type === 'error' ? 'rgba(239,68,68,0.4)' : 'rgba(108,92,231,0.4)'};
        color: ${type === 'error' ? '#ff7675' : '#a29bfe'};
        backdrop-filter: blur(12px);
        padding: 12px 20px; border-radius: 12px;
        font-family: 'Outfit', sans-serif; font-size: 0.88rem; font-weight: 500;
        z-index: 9999; display: flex; align-items: center; gap: 0.5rem;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        animation: slideUpFade 0.3s ease;
    `;
    toast.innerHTML = `<span class="material-symbols-rounded" style="font-size:1rem">${type === 'error' ? 'warning' : 'info'}</span>${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
}

// Call Gemini API for analysis
async function callGeminiAPI(prompt) {
    const activeGeminiKey = getEffectiveGeminiKey();
    if (!activeGeminiKey) {
        showToast('⚠️ No Gemini API key found. Click "AI API Keys" to paste your key.', 'error');
        throw new Error('No Gemini API key available');
    }
    try {
        const response = await fetch(`${GEMINI_API_URL}?key=${activeGeminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.7,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 1024,
                }
            })
        });

        if (!response.ok) {
            const error = await response.json();
            const msg = error.error?.message || 'API request failed';
            console.error('Gemini API Error:', msg);
            if (response.status === 429) {
                showToast('API quota exceeded — showing curated tips instead', 'error');
            }
            throw new Error(msg);
        }

        const data = await response.json();
        return data.candidates[0]?.content?.parts[0]?.text || 'No response generated';
    } catch (error) {
        console.error('Error calling Gemini API:', error);
        throw error;
    }
}

// Initialize Speech Recognition
function initSpeechRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        speechRecognition = new SpeechRecognition();
        speechRecognition.continuous = true;
        speechRecognition.interimResults = true;
        speechRecognition.lang = 'en-US';

        speechRecognition.onresult = (event) => {
            let finalTranscript = '';
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript + ' ';
                } else {
                    interimTranscript += transcript;
                }
            }

            if (finalTranscript) {
                transcribedText += finalTranscript;
                console.log('?? Speech detected:', finalTranscript);
                console.log('?? Total transcript so far:', transcribedText);
            }
        };

        speechRecognition.onerror = (event) => {
            console.error('?? Speech recognition error:', event.error);
            if (event.error === 'no-speech') {
                console.warn('?? No speech detected - user may not be speaking');
                // Restart recognition if no speech detected
                if (isTranscribing) {
                    speechRecognition.start();
                }
            } else if (event.error === 'not-allowed') {
                console.error('? Microphone permission denied for speech recognition!');
                alert('Please allow microphone access for speech-to-text transcription to work properly.');
            }
        };

        speechRecognition.onend = () => {
            console.log('?? Speech recognition ended, total captured:', transcribedText);
            // Restart if still recording
            if (isTranscribing) {
                try {
                    speechRecognition.start();
                } catch (e) {
                    console.log('Recognition already started');
                }
            }
        };

        return true;
    }
    return false;
}

// Start speech transcription
function startTranscription() {
    if (speechRecognition) {
        transcribedText = '';
        isTranscribing = true;
        try {
            speechRecognition.start();
            console.log('?? Speech recognition started - speak now!');
        } catch (e) {
            console.log('Recognition error:', e);
        }
    } else {
        console.warn('?? Speech recognition not available in this browser');
    }
}


// Stop speech transcription
function stopTranscription() {
    isTranscribing = false;
    if (speechRecognition) {
        try {
            speechRecognition.stop();
            console.log('Speech recognition stopped');
            console.log('Final transcript:', transcribedText || 'EMPTY');
        } catch (e) {
            console.log('Stop error:', e);
        }
    }
    return transcribedText;
}

// ============================================
// VIDEO FRAME EXTRACTION

// ============================================

/**
 * Extracts up to `count` evenly-spaced frames from a <video> element
 * and returns them as base64-encoded JPEG strings.
 */
async function extractVideoFrames(videoEl, count = 6) {
    return new Promise((resolve) => {
        const frames = [];
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const duration = videoEl.duration;

        if (!duration || isNaN(duration) || duration === 0) {
            resolve(frames);
            return;
        }

        canvas.width  = 640;
        canvas.height = Math.round(640 * (videoEl.videoHeight / videoEl.videoWidth)) || 360;

        const times = [];
        for (let i = 0; i < count; i++) {
            // Spread evenly but avoid very start/end (blank frames)
            times.push(Math.max(0.5, (i / (count - 1)) * duration * 0.95));
        }

        let idx = 0;

        function seekNext() {
            if (idx >= times.length) {
                resolve(frames);
                return;
            }
            videoEl.currentTime = times[idx];
        }

        videoEl.onseeked = () => {
            try {
                ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
                const b64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
                frames.push(b64);
            } catch (e) {
                console.warn('Frame extraction error at time', times[idx], e);
            }
            idx++;
            seekNext();
        };

        seekNext();
    });
}


// ============================================
// VIDEO STORAGE FUNCTIONS
// ============================================

// Download video locally
function downloadVideo(blob, filename) {
    if (!blob) {
        alert('No video to download. Please record first.');
        return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `interview_practice_${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ============================================
// IndexedDB VIDEO STORAGE FUNCTIONS
// ============================================

// Initialize IndexedDB
function initVideoDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('Failed to open IndexedDB:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            videoDB = request.result;
            console.log('IndexedDB initialized for video storage');
            resolve(videoDB);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(VIDEO_STORE_NAME)) {
                const store = db.createObjectStore(VIDEO_STORE_NAME, { keyPath: 'id' });
                store.createIndex('date', 'date', { unique: false });
                store.createIndex('sessionId', 'sessionId', { unique: true });
                console.log('Video store created');
            }
        };
    });
}

// Save video to IndexedDB
async function saveVideoLocally(blob, sessionId) {
    if (!videoDB) {
        try {
            await initVideoDatabase();
        } catch (e) {
            console.error('Cannot initialize video database');
            return null;
        }
    }

    return new Promise((resolve, reject) => {
        try {
            const transaction = videoDB.transaction([VIDEO_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(VIDEO_STORE_NAME);

            const videoData = {
                id: sessionId,
                sessionId: sessionId,
                blob: blob,
                date: new Date().toISOString(),
                size: blob.size
            };

            const request = store.put(videoData);

            request.onsuccess = () => {
                console.log('Video saved locally:', sessionId);
                resolve(sessionId);
            };

            request.onerror = () => {
                console.error('Failed to save video:', request.error);
                reject(request.error);
            };
        } catch (error) {
            console.error('Error saving video:', error);
            reject(error);
        }
    });
}

// Get video from IndexedDB
async function getVideoLocally(sessionId) {
    if (!videoDB) {
        try {
            await initVideoDatabase();
        } catch (e) {
            return null;
        }
    }

    return new Promise((resolve, reject) => {
        try {
            const transaction = videoDB.transaction([VIDEO_STORE_NAME], 'readonly');
            const store = transaction.objectStore(VIDEO_STORE_NAME);
            const request = store.get(sessionId);

            request.onsuccess = () => {
                if (request.result) {
                    resolve(request.result.blob);
                } else {
                    resolve(null);
                }
            };

            request.onerror = () => {
                console.error('Failed to get video:', request.error);
                resolve(null);
            };
        } catch (error) {
            resolve(null);
        }
    });
}

// Delete video from IndexedDB
async function deleteVideoLocally(sessionId) {
    if (!videoDB) return;

    return new Promise((resolve) => {
        try {
            const transaction = videoDB.transaction([VIDEO_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(VIDEO_STORE_NAME);
            store.delete(sessionId);
            resolve(true);
        } catch (error) {
            resolve(false);
        }
    });
}

// Get all stored video IDs
async function getAllStoredVideoIds() {
    if (!videoDB) {
        try {
            await initVideoDatabase();
        } catch (e) {
            return [];
        }
    }

    return new Promise((resolve) => {
        try {
            const transaction = videoDB.transaction([VIDEO_STORE_NAME], 'readonly');
            const store = transaction.objectStore(VIDEO_STORE_NAME);
            const request = store.getAllKeys();

            request.onsuccess = () => {
                resolve(request.result || []);
            };

            request.onerror = () => {
                resolve([]);
            };
        } catch (error) {
            resolve([]);
        }
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize IndexedDB for video storage
    try {
        await initVideoDatabase();
        console.log('Video database ready');
    } catch (e) {
        console.warn('IndexedDB not available for video storage');
    }

    // Initialize speech recognition
    const hasSpeechRecognition = initSpeechRecognition();
    if (!hasSpeechRecognition) {
        console.warn('Speech recognition not supported in this browser. Transcription will be limited.');
    }

    // Initialize UI right away so tabs and buttons work before auth resolves
    initTabNavigation();
    initVideoRecording();
    initEventListeners();

    if (typeof auth !== 'undefined') {
        auth.onAuthStateChanged(user => {
            if (user) {
                window.currentUser = user;
                loadPracticeHistory();
                updateInterviewStats();
            }
        });
    }
});

// Tab Navigation
function initTabNavigation() {
    const tabs = document.querySelectorAll('.prep-tab');
    const sections = {
        'overview': document.getElementById('overview-section'),
        'self-intro': document.getElementById('self-intro-section'),
        'communication': document.getElementById('communication-section'),
        'history': document.getElementById('history-section')
    };

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const tabName = tab.dataset.tab;
            currentTab = tabName;

            Object.keys(sections).forEach(key => {
                if (sections[key]) {
                    sections[key].classList.toggle('hidden', key !== tabName);
                }
            });

            // Stop any active recording when switching tabs
            stopAllRecordings();
        });
    });
}

// Video Recording Setup
function initVideoRecording() {
    // Quick action cards
    const actionCards = document.querySelectorAll('.action-card');
    actionCards.forEach(card => {
        const action = card.dataset.action;
        const btn = card.querySelector('.btn-action');

        if (btn && action !== 'tips') {
            btn.addEventListener('click', () => {
                const targetTab = document.querySelector(`.prep-tab[data-tab="${action}"]`);
                if (targetTab) {
                    targetTab.click();
                }
            });
        }
    });
}

// Initialize Event Listeners
function initEventListeners() {
    // Analyze Activity Button
    const analyzeBtn = document.getElementById('analyze-activity-btn');
    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', analyzeStudentActivity);
    }

    // Get Tips Button
    const tipsBtn = document.getElementById('get-tips-btn');
    if (tipsBtn) {
        tipsBtn.addEventListener('click', getInterviewTips);
    }

    // Self Introduction Recording
    setupRecordingButtons('self-intro');

    // Communication Recording
    setupRecordingButtons('comm');

    // Refresh prompts
    const refreshIntroBtn = document.getElementById('refresh-intro-prompt');
    if (refreshIntroBtn) {
        refreshIntroBtn.addEventListener('click', refreshSelfIntroPrompt);
    }

    const refreshCommBtn = document.getElementById('refresh-comm-prompt');
    if (refreshCommBtn) {
        refreshCommBtn.addEventListener('click', refreshCommPrompt);
    }

    // Category chips
    const categoryChips = document.querySelectorAll('.category-chip');
    categoryChips.forEach(chip => {
        chip.addEventListener('click', () => {
            categoryChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            refreshCommPrompt();
        });
    });

    // Modal close buttons
    const closeAnalysisModal = document.getElementById('close-analysis-modal');
    const closeAnalysisBtn = document.getElementById('close-analysis-btn');
    const saveAnalysisBtn = document.getElementById('save-analysis-btn');
    const analysisModal = document.getElementById('analysis-modal');

    if (closeAnalysisModal) {
        closeAnalysisModal.addEventListener('click', () => analysisModal.classList.add('hidden'));
    }
    if (closeAnalysisBtn) {
        closeAnalysisBtn.addEventListener('click', () => analysisModal.classList.add('hidden'));
    }
    if (saveAnalysisBtn) {
        saveAnalysisBtn.addEventListener('click', () => {
            showNotification('Analysis saved to your history!', 'success');
            analysisModal.classList.add('hidden');
        });
    }

    // Backdrop clicks to close modals
    const audioModal = document.getElementById('audio-test-modal');
    if (audioModal) {
        audioModal.addEventListener('click', (e) => {
            if (e.target === audioModal) closeAudioTestModal();
        });
    }

    const apiModal = document.getElementById('api-keys-modal');
    if (apiModal) {
        apiModal.addEventListener('click', (e) => {
            if (e.target === apiModal) closeApiSettingsModal();
        });
    }

    // Escape key to close any active modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAudioTestModal();
            closeApiSettingsModal();
            if (analysisModal) analysisModal.classList.add('hidden');
        }
    });

    // History filters
    const historyFilterType = document.getElementById('history-filter-type');
    const historyFilterTime = document.getElementById('history-filter-time');

    if (historyFilterType) {
        historyFilterType.addEventListener('change', renderPracticeHistory);
    }
    if (historyFilterTime) {
        historyFilterTime.addEventListener('change', renderPracticeHistory);
    }

    // Clear all history button
    const clearAllHistoryBtn = document.getElementById('clear-all-history-btn');
    if (clearAllHistoryBtn) {
        clearAllHistoryBtn.addEventListener('click', clearAllHistory);
    }

    // Model selector buttons
    document.querySelectorAll('.model-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const section = btn.dataset.section;
            const model   = btn.dataset.model;

            // Warn user if switching to Ollama (requires local install)
            if (model === 'ollama') {
                showToast('⚠️ Ollama requires a local install. If unavailable, Gemini will be used automatically.', 'info');
            }
            if (model === 'chatgpt' && !OPENAI_API_KEY) {
                showToast('⚠️ No OpenAI API key configured. Add OPENAI_API_KEY to your .env file.', 'error');
            }

            selectedModel[section] = model;

            // Update active state within this selector group
            const selectorId = `${section}-model-selector`;
            const selectorEl = document.getElementById(selectorId);
            if (selectorEl) {
                selectorEl.querySelectorAll('.model-btn').forEach(b => b.classList.remove('active'));
            }
            btn.classList.add('active');

            const modelNames = {
                'gemini': 'Gemini 2.5 Flash',
                'chatgpt': 'ChatGPT GPT-4o',
                'ollama': `Ollama (${OLLAMA_MODEL}) → Gemini fallback`
            };
            showToast(`Switched to ${modelNames[model] || model} for analysis`, 'info');
        });
    });
}

// Setup Recording Buttons
function setupRecordingButtons(prefix) {
    const startBtn = document.getElementById(`start-${prefix}`);
    const stopBtn = document.getElementById(`stop-${prefix}`);
    const analyzeBtn = document.getElementById(`analyze-${prefix}`);
    const video = document.getElementById(`${prefix}-video`);
    const overlay = document.getElementById(`${prefix}-overlay`);
    const recordingIndicator = document.getElementById(`${prefix}-recording`);
    const timerDisplay = document.getElementById(`${prefix === 'self-intro' ? 'self-intro' : 'comm'}-timer`);

    if (startBtn) {
        startBtn.addEventListener('click', async () => {
            try {
                // 1. Request generic access first to trigger permissions and populate device labels
                // We ask for *any* camera first.
                console.log('Requesting initial camera access...');
                let stream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: true
                });

                // 2. Now that we have permission, we can see the real device names
                const devices = await navigator.mediaDevices.enumerateDevices();
                const videoDevices = devices.filter(d => d.kind === 'videoinput');

                console.log('Available cameras:', videoDevices.map(d => `${d.label} (${d.deviceId})`));

                // 3. Logic to find the best laptop/webcam and avoid phones
                const currentTrack = stream.getVideoTracks()[0];
                const currentLabel = currentTrack.label.toLowerCase();

                // Helper to check if a device is a phone
                const isPhone = (label) => {
                    const l = label.toLowerCase();
                    return l.includes('poco') || l.includes('android') || l.includes('phone') ||
                        l.includes('samsung') || l.includes('xiaomi') || l.includes('iphone') ||
                        l.includes('iriun') || l.includes('droidcam') || l.includes('epoccam');
                };

                // Helper to check if a device is a "good" computer camera
                const isGoodCamera = (label) => {
                    const l = label.toLowerCase();
                    return (l.includes('integrated') || l.includes('webcam') || l.includes('usb') ||
                        l.includes('facetime') || l.includes('camera')) &&
                        !isPhone(l) && !l.includes('virtual') && !l.includes('obs');
                };

                // Find the best available device
                const bestDevice = videoDevices.find(d => isGoodCamera(d.label));
                const firstNonPhone = videoDevices.find(d => !isPhone(d.label));

                const targetDevice = bestDevice || firstNonPhone;

                // 4. Switch if the current one is a phone OR we found a specifically better one
                // (Only switch if the target is different from what we currently have)
                if (targetDevice && (isPhone(currentLabel) || (isGoodCamera(targetDevice.label) && !isGoodCamera(currentLabel)))) {
                    console.log(`Switching from "${currentLabel}" to better camera: "${targetDevice.label}"`);

                    // Stop the initial stream
                    stream.getTracks().forEach(track => track.stop());

                    // Request specific device
                    stream = await navigator.mediaDevices.getUserMedia({
                        video: { deviceId: { exact: targetDevice.deviceId } },
                        audio: true
                    });
                } else {
                    console.log(`Keeping current camera: "${currentLabel}"`);
                }

                videoStream = stream;
                video.srcObject = videoStream;

                overlay.classList.add('hidden');
                recordingIndicator.classList.remove('hidden');

                recordedChunks = [];
                mediaRecorder = new MediaRecorder(videoStream);

                mediaRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) {
                        recordedChunks.push(e.data);
                    }
                };

                mediaRecorder.onstop = () => {
                    const blob = new Blob(recordedChunks, { type: 'video/webm' });
                    currentVideoBlob = blob; // Store for upload/download

                    video.srcObject = null;
                    video.src = URL.createObjectURL(blob);
                    video.muted = false;
                    video.controls = true;

                    recordingIndicator.classList.add('hidden');
                    analyzeBtn.classList.remove('hidden');
                    analyzeBtn.dataset.blob = URL.createObjectURL(blob);

                    // Show download button
                    const downloadBtn = document.getElementById(`download-${prefix}`);
                    if (downloadBtn) {
                        downloadBtn.classList.remove('hidden');
                    }

                    // Stop transcription and store the text
                    const finalTranscript = stopTranscription();
                    analyzeBtn.dataset.transcript = finalTranscript;
                    console.log('Transcribed text:', finalTranscript);
                };

                // Start speech transcription
                startTranscription();

                mediaRecorder.start();
                startBtn.classList.add('hidden');
                stopBtn.classList.remove('hidden');

                // Start timer
                recordingSeconds = 0;
                recordingTimer = setInterval(() => {
                    recordingSeconds++;
                    const mins = Math.floor(recordingSeconds / 60).toString().padStart(2, '0');
                    const secs = (recordingSeconds % 60).toString().padStart(2, '0');
                    timerDisplay.textContent = `${mins}:${secs}`;

                    // Auto stop at 3 minutes for communication, 2 minutes for self-intro
                    const maxTime = prefix === 'self-intro' ? 120 : 180;
                    if (recordingSeconds >= maxTime) {
                        stopBtn.click();
                    }
                }, 1000);

            } catch (err) {
                console.error('Error accessing camera:', err);
                alert('Unable to access camera. Please check permissions.');
            }
        });
    }

    const uploadInput = document.getElementById(`upload-${prefix}`);
    if (uploadInput) {
        uploadInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (videoStream) {
                videoStream.getTracks().forEach(track => track.stop());
            }

            const blob = new Blob([file], { type: file.type });
            currentVideoBlob = blob;

            video.srcObject = null;
            video.src = URL.createObjectURL(blob);
            video.muted = false;
            video.controls = true;

            // Wait for metadata to get duration
            video.onloadedmetadata = () => {
                recordingSeconds = Math.floor(video.duration) || 60;
            };

            overlay.classList.add('hidden');
            analyzeBtn.classList.remove('hidden');
            analyzeBtn.dataset.blob = URL.createObjectURL(blob);
            analyzeBtn.dataset.transcript = "[UPLOADED_VIDEO]";

            // Show download button 
            const downloadBtn = document.getElementById(`download-${prefix}`);
            if (downloadBtn) {
                downloadBtn.classList.remove('hidden');
            }

            startBtn.classList.add('hidden');
            uploadInput.parentElement.classList.add('hidden');

            // Start reading the duration since user can click analyze immediately
            if (!recordingSeconds) {
                setTimeout(() => {
                    recordingSeconds = Math.floor(video.duration) || 60;
                }, 500);
            }
        });
    }

    if (stopBtn) {
        stopBtn.addEventListener('click', () => {
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
                videoStream.getTracks().forEach(track => track.stop());
            }

            clearInterval(recordingTimer);
            stopBtn.classList.add('hidden');
            startBtn.classList.remove('hidden');
        });
    }

    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', () => {
            let type = 'Communication';
            if (prefix === 'self-intro') type = 'Self Introduction';

            const transcript = analyzeBtn.dataset.transcript || '';
            let prompt = '';
            if (prefix === 'self-intro') {
                prompt = document.getElementById('self-intro-prompt')?.textContent || '';
            } else if (prefix === 'comm') {
                prompt = document.getElementById('comm-prompt')?.textContent || '';
            }
            analyzeRecordingWithAI(type, recordingSeconds, transcript, prompt, prefix);
        });
    }

    // Download button
    const downloadBtn = document.getElementById(`download-${prefix}`);
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            if (currentVideoBlob) {
                const type = prefix === 'self-intro' ? 'self_introduction' : 'communication';
                const filename = `interview_practice_${type}_${new Date().toISOString().slice(0, 10)}.webm`;
                downloadVideo(currentVideoBlob, filename);
            } else {
                alert('No video to download. Please record first.');
            }
        });
    }
}

// Stop all active recordings
function stopAllRecordings() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
    }
    clearInterval(recordingTimer);
}

// Analyze Student Activity with Gemini AI
async function analyzeStudentActivity() {
    const loadingModal = document.getElementById('loading-modal');
    const loadingText = document.getElementById('loading-text');
    const analysisContent = document.getElementById('activity-analysis');

    loadingText.textContent = 'AI is analyzing your activity patterns...';
    loadingModal.classList.remove('hidden');

    // Generate analysis based on practice history
    const totalSessions = allPracticeSessions.length;
    const selfIntroSessions = allPracticeSessions.filter(s => s.type === 'self-intro').length;
    const commSessions = allPracticeSessions.filter(s => s.type === 'communication').length;
    const avgScore = totalSessions > 0
        ? Math.round(allPracticeSessions.reduce((acc, s) => acc + (s.score || 0), 0) / totalSessions)
        : 0;
    const totalTime = allPracticeSessions.reduce((acc, s) => acc + (s.duration || 0), 0);

    let aiInsights = [];
    let aiRecommendations = [];

    try {
        if (totalSessions > 0) {
            // Build prompt for Gemini
            const analysisPrompt = `
You are an interview preparation coach. Analyze this student's practice activity and provide personalized insights.

PRACTICE HISTORY SUMMARY:
- Total practice sessions: ${totalSessions}
- Self-introduction practices: ${selfIntroSessions}
- Communication practices: ${commSessions}
- Average score: ${avgScore}/100
- Total practice time: ${Math.floor(totalTime / 60)} minutes

Recent session scores: ${allPracticeSessions.slice(0, 5).map(s => s.score).join(', ')}

Based on this data, provide:
1. 3 specific insights about their practice patterns
2. 3 personalized recommendations for improvement

IMPORTANT: Respond ONLY in this exact JSON format:
{
    "insights": ["<insight1>", "<insight2>", "<insight3>"],
    "recommendations": ["<rec1>", "<rec2>", "<rec3>"],
    "overallAssessment": "<brief 1-sentence assessment of their preparation level>"
}
`;

            const response = await callGeminiAPI(analysisPrompt);

            try {
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    aiInsights = parsed.insights || [];
                    aiRecommendations = parsed.recommendations || [];
                }
            } catch (parseError) {
                console.error('Error parsing Gemini response:', parseError);
            }
        }
    } catch (error) {
        console.error('Error calling Gemini API:', error);
    }

    loadingModal.classList.add('hidden');

    // Fallback insights if API fails
    if (aiInsights.length === 0) {
        aiInsights = [
            selfIntroSessions > 0
                ? `You've completed ${selfIntroSessions} self-introduction practice${selfIntroSessions > 1 ? 's' : ''}`
                : 'Start with self-introduction practice to build confidence',
            commSessions > 0
                ? `You've practiced ${commSessions} communication scenario${commSessions > 1 ? 's' : ''}`
                : 'Practice communication scenarios to improve your responses',
            totalSessions >= 5
                ? 'Great consistency! Keep up the practice'
                : 'Aim for at least 5 practice sessions per week'
        ];
    }

    if (aiRecommendations.length === 0) {
        aiRecommendations = [
            selfIntroSessions < commSessions
                ? 'Focus more on self-introduction practice'
                : 'Practice more communication scenarios',
            'Schedule daily 15-minute practice sessions',
            'Review your past recordings for improvement'
        ];
    }

    const prepScore = Math.min(100, avgScore > 0 ? avgScore : totalSessions * 10);

    analysisContent.innerHTML = `
        <div class="analysis-result">
            <div class="analysis-score">
                <div class="score-circle">
                    <svg viewBox="0 0 36 36" class="circular-progress">
                        <path class="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                        <path class="circle progress-circle" stroke-dasharray="${prepScore}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                        <text x="18" y="20.35" class="score-text">${prepScore}</text>
                    </svg>
                </div>
                <div class="score-label">AI Preparation Score</div>
            </div>
            
            <div class="analysis-insights">
                <h4><span class="material-symbols-rounded">auto_awesome</span> AI Insights</h4>
                <ul class="insights-list">
                    ${aiInsights.map((insight, i) => `
                        <li class="${i === 0 ? 'positive' : i === 1 ? 'neutral' : 'suggestion'}">
                            <span class="material-symbols-rounded">${i === 0 ? 'check_circle' : i === 1 ? 'info' : 'lightbulb'}</span>
                            ${insight}
                        </li>
                    `).join('')}
                </ul>
            </div>

            <div class="analysis-recommendations">
                <h4><span class="material-symbols-rounded">recommend</span> AI Recommendations</h4>
                <div class="recommendations-list">
                    ${aiRecommendations.map(rec => `
                        <div class="rec-item">
                            <span class="material-symbols-rounded">arrow_forward</span>
                            ${rec}
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

// Analyze Recording — routes to Gemini or GPT-4o based on model selector
async function analyzeRecordingWithAI(type, duration, transcript, questionPrompt, sectionPrefix) {
    const loadingModal  = document.getElementById('loading-modal');
    const loadingText   = document.getElementById('loading-text');
    const feedbackContent = document.getElementById(
        sectionPrefix === 'self-intro'
            ? 'self-intro-feedback'
            : 'comm-feedback'
    );

    const model = selectedModel[sectionPrefix] || 'gemini';
    const modelLabels = {
        'gemini': 'Gemini 2.5 Flash',
        'chatgpt': 'ChatGPT GPT-4o',
        'ollama': `Ollama (${OLLAMA_MODEL})`
    };
    const modelLabel = modelLabels[model] || 'Gemini 2.5 Flash';

    loadingText.textContent = `${modelLabel} is analysing your video...`;
    loadingModal.classList.remove('hidden');

    try {
        // ── Step 1: Extract frames from the <video> element ──────────────
        const videoEl = document.getElementById(`${sectionPrefix}-video`);
        let frames = [];
        if (videoEl && videoEl.src && videoEl.readyState >= 1) {
            try {
                loadingText.textContent = 'Extracting video frames...';
                frames = await extractVideoFrames(videoEl, 6);
                console.log(`Extracted ${frames.length} frames`);
            } catch (frameErr) {
                console.warn('Frame extraction failed:', frameErr);
            }
        }

        // ── Step 2: Build request payload ────────────────────────────────
        const payload = {
            frames,
            transcript: transcript || '',
            prompt:     questionPrompt || '',
            type:       type,
            duration:   duration || 0,
            gemini_key: getEffectiveGeminiKey(),
            openai_key: getEffectiveOpenAIKey(),
        };

        if (model === 'chatgpt' && !getEffectiveOpenAIKey()) {
            showToast('⚠️ No OpenAI API key found! Click "Paste API Keys" to paste one.', 'error');
            openApiSettingsModal();
            loadingModal.classList.add('hidden');
            return;
        }

        if (model === 'gemini' && !getEffectiveGeminiKey()) {
            showToast('⚠️ No Gemini API key found! Click "Paste API Keys" to paste one.', 'error');
            openApiSettingsModal();
            loadingModal.classList.add('hidden');
            return;
        }

        loadingText.textContent = `${modelLabel} is analysing your performance...`;

        // ── Step 3: Call the chosen backend route ────────────────────────
        const endpoints = {
            'gemini': '/api/analyze-video/gemini',
            'chatgpt': '/api/analyze-video/chatgpt',
            'ollama': '/api/analyze-video/ollama'
        };
        const endpoint = endpoints[model] || '/api/analyze-video/gemini';

        const resp = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!resp.ok) {
            const errData = await resp.json().catch(() => ({}));
            throw new Error(errData.error || `Server error ${resp.status}`);
        }

        const data = await resp.json();

        if (!data.success) {
            throw new Error(data.error || 'Analysis failed');
        }

        const { analysis, model: usedModel, fallback, fallback_reason } = data;

        // Notify user if Ollama was unavailable and Gemini was used as fallback
        if (fallback) {
            showToast('Ollama unavailable — analysed with Gemini instead ✨', 'info');
            console.warn('[Ollama fallback reason]', fallback_reason);
        }

        const scores = analysis.scores || { clarity: 70, confidence: 70, structure: 70, engagement: 70 };
        const positives    = analysis.positives    || [];
        const improvements = analysis.improvements || [];
        const overallFeedback     = analysis.overallFeedback     || '';
        const visualObservations  = analysis.visualObservations  || '';

        // Clamp scores
        Object.keys(scores).forEach(k => {
            scores[k] = Math.min(100, Math.max(0, parseInt(scores[k]) || 50));
        });

        const overallScore = Math.round(
            (scores.clarity + scores.confidence + scores.structure + scores.engagement) / 4
        );

        loadingModal.classList.add('hidden');

        // ── Step 4: Render feedback ──────────────────────────────────────
        const feedbackHtml = generateAIFeedbackHtml(
            scores,
            overallScore,
            positives,
            improvements,
            overallFeedback,
            visualObservations,
            usedModel || modelLabel,
            frames.length
        );
        feedbackContent.innerHTML = feedbackHtml;

        // Save session
        savePracticeSession(type, overallScore, scores, duration, transcript);

    } catch (error) {
        console.error('Error analysing with AI:', error);
        loadingModal.classList.add('hidden');

        feedbackContent.innerHTML = `
            <div class="feedback-placeholder">
                <span class="material-symbols-rounded">error</span>
                <p>Unable to analyse recording. Please try again.</p>
                <p style="font-size:0.8rem;opacity:0.7;">Error: ${error.message}</p>
            </div>
        `;
    }
}

// Generate AI Feedback HTML
function generateAIFeedbackHtml(scores, overallScore, positives, improvements, overallFeedback, visualObservations, usedModel, frameCount) {
    const scoreClass = overallScore >= 80 ? 'excellent' : overallScore >= 60 ? 'good' : 'needs-work';

    let positivesHtml = positives.map(p =>
        `<li class="positive"><span class="material-symbols-rounded">check_circle</span> ${p}</li>`
    ).join('');

    let improvementsHtml = improvements.map(i =>
        `<li class="suggestion"><span class="material-symbols-rounded">lightbulb</span> ${i}</li>`
    ).join('');

    const modelBadge = usedModel && (usedModel.includes('gpt-oss') || usedModel.includes('ollama') || usedModel.includes('120b'))
        ? `<span style="background:rgba(255,165,0,0.15);color:#ffa500;padding:2px 8px;border-radius:6px;font-size:0.7rem;font-weight:600;">🤖 Ollama · ${usedModel}</span>`
        : usedModel && (usedModel.includes('gpt-4o') || usedModel.includes('chatgpt'))
        ? `<span style="background:rgba(16,163,127,0.15);color:#10a37f;padding:2px 8px;border-radius:6px;font-size:0.7rem;font-weight:600;">💬 ChatGPT · ${usedModel}</span>`
        : `<span style="background:rgba(108,92,231,0.15);color:#a29bfe;padding:2px 8px;border-radius:6px;font-size:0.7rem;font-weight:600;">✨ Gemini 2.5 Flash</span>`;

    const videoAnalysisBadge = frameCount > 0
        ? `<span style="background:rgba(0,184,148,0.1);color:#00b894;padding:2px 8px;border-radius:6px;font-size:0.7rem;margin-left:4px;">📹 ${frameCount} frames analysed</span>`
        : '';

    return `
        <div class="feedback-result">
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.75rem;flex-wrap:wrap;">
                ${modelBadge}${videoAnalysisBadge}
            </div>

            <div class="overall-score">
                <div class="score-ring">
                    <svg viewBox="0 0 36 36" class="circular-progress large">
                        <path class="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                        <path class="circle progress-circle ${scoreClass}" 
                              stroke-dasharray="${overallScore}, 100" 
                              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                        <text x="18" y="20.35" class="score-text">${overallScore}</text>
                    </svg>
                </div>
                <span class="score-label">AI Analysis Score</span>
            </div>

            <div class="score-breakdown">
                <div class="score-item">
                    <div class="score-header"><span>Clarity</span><span>${scores.clarity}%</span></div>
                    <div class="score-bar"><div class="score-fill" style="width: ${scores.clarity}%"></div></div>
                </div>
                <div class="score-item">
                    <div class="score-header"><span>Confidence</span><span>${scores.confidence}%</span></div>
                    <div class="score-bar"><div class="score-fill" style="width: ${scores.confidence}%"></div></div>
                </div>
                <div class="score-item">
                    <div class="score-header"><span>Structure</span><span>${scores.structure}%</span></div>
                    <div class="score-bar"><div class="score-fill" style="width: ${scores.structure}%"></div></div>
                </div>
                <div class="score-item">
                    <div class="score-header"><span>Engagement</span><span>${scores.engagement}%</span></div>
                    <div class="score-bar"><div class="score-fill" style="width: ${scores.engagement}%"></div></div>
                </div>
            </div>

            ${visualObservations ? `
            <div class="ai-summary glass-panel" style="padding:1rem;margin:1rem 0;background:rgba(0,184,148,0.07);border-radius:12px;border:1px solid rgba(0,184,148,0.2);">
                <h4 style="margin-bottom:0.5rem;display:flex;align-items:center;gap:0.5rem;">
                    <span class="material-symbols-rounded" style="color:#00b894;">videocam</span>
                    Visual Analysis
                </h4>
                <p style="font-size:0.9rem;line-height:1.6;color:var(--text-muted);">${visualObservations}</p>
            </div>
            ` : ''}

            ${overallFeedback ? `
            <div class="ai-summary glass-panel" style="padding:1rem;margin:1rem 0;background:rgba(108,92,231,0.1);border-radius:12px;">
                <h4 style="margin-bottom:0.5rem;display:flex;align-items:center;gap:0.5rem;">
                    <span class="material-symbols-rounded" style="color:var(--primary);">auto_awesome</span>
                    AI Assessment
                </h4>
                <p style="font-size:0.9rem;line-height:1.6;color:var(--text-muted);">${overallFeedback}</p>
            </div>
            ` : ''}

            <div class="detailed-feedback">
                <h4><span class="material-symbols-rounded">thumb_up</span> What You Did Well</h4>
                <ul class="feedback-points">${positivesHtml}</ul>
            </div>

            <div class="detailed-feedback" style="margin-top:1rem;">
                <h4><span class="material-symbols-rounded">tips_and_updates</span> Areas for Improvement</h4>
                <ul class="feedback-points">${improvementsHtml}</ul>
            </div>
        </div>
    `;
}


// Generate feedback based on scores
function generateFeedback(type, scores, duration) {
    let feedback = '<ul class="feedback-points">';

    // Clarity feedback
    if (scores.clarity >= 80) {
        feedback += '<li class="positive"><span class="material-symbols-rounded">check_circle</span> Excellent clarity! Your speech was clear and easy to understand.</li>';
    } else if (scores.clarity >= 60) {
        feedback += '<li class="suggestion"><span class="material-symbols-rounded">lightbulb</span> Good clarity. Try to enunciate more carefully and vary your pace.</li>';
    } else {
        feedback += '<li class="improvement"><span class="material-symbols-rounded">priority_high</span> Work on speaking more clearly. Practice pronunciation and speaking pace.</li>';
    }

    // Confidence feedback
    if (scores.confidence >= 80) {
        feedback += '<li class="positive"><span class="material-symbols-rounded">check_circle</span> You displayed great confidence throughout your response!</li>';
    } else if (scores.confidence >= 60) {
        feedback += '<li class="suggestion"><span class="material-symbols-rounded">lightbulb</span> Good confidence level. Try maintaining eye contact and using more assertive language.</li>';
    } else {
        feedback += '<li class="improvement"><span class="material-symbols-rounded">priority_high</span> Build your confidence by practicing more and using power poses before recording.</li>';
    }

    // Structure feedback
    if (scores.structure >= 80) {
        feedback += '<li class="positive"><span class="material-symbols-rounded">check_circle</span> Well-structured response with clear beginning, middle, and end.</li>';
    } else if (scores.structure >= 60) {
        feedback += '<li class="suggestion"><span class="material-symbols-rounded">lightbulb</span> Consider using the STAR method to structure your responses better.</li>';
    } else {
        feedback += '<li class="improvement"><span class="material-symbols-rounded">priority_high</span> Focus on organizing your thoughts. Outline your key points before speaking.</li>';
    }

    // Duration feedback
    const isIntro = type === 'Self Introduction';
    const targetDuration = isIntro ? 120 : 180;
    if (duration >= targetDuration * 0.8 && duration <= targetDuration) {
        feedback += '<li class="positive"><span class="material-symbols-rounded">check_circle</span> Great timing! You used your time effectively.</li>';
    } else if (duration < targetDuration * 0.5) {
        feedback += '<li class="suggestion"><span class="material-symbols-rounded">lightbulb</span> Your response was brief. Add more detail and examples.</li>';
    }

    feedback += '</ul>';
    return feedback;
}

// Get Interview Tips with Gemini AI
async function getInterviewTips() {
    const loadingModal = document.getElementById('loading-modal');
    const loadingText = document.getElementById('loading-text');
    const analysisModal = document.getElementById('analysis-modal');
    const resultsContent = document.getElementById('analysis-results-content');

    loadingText.textContent = 'AI is generating personalized tips...';
    loadingModal.classList.remove('hidden');

    let introTips = [];
    let commTips = [];
    let bodyTips = [];

    try {
        // Build prompt for Gemini
        const avgScore = allPracticeSessions.length > 0
            ? Math.round(allPracticeSessions.reduce((acc, s) => acc + (s.score || 0), 0) / allPracticeSessions.length)
            : 0;

        const tipsPrompt = `
You are an expert interview coach. Generate personalized interview tips for a student preparing for job interviews.

STUDENT PROFILE:
- Practice sessions completed: ${allPracticeSessions.length}
- Average score: ${avgScore}/100
- Areas practiced: Self-introduction and communication skills

Generate specific, actionable tips in these categories:
1. Self Introduction (5 tips)
2. Communication Skills (5 tips)
3. Body Language (5 tips)

IMPORTANT: Respond ONLY in this exact JSON format:
{
    "selfIntro": ["<tip1>", "<tip2>", "<tip3>", "<tip4>", "<tip5>"],
    "communication": ["<tip1>", "<tip2>", "<tip3>", "<tip4>", "<tip5>"],
    "bodyLanguage": ["<tip1>", "<tip2>", "<tip3>", "<tip4>", "<tip5>"]
}
`;

        const response = await callGeminiAPI(tipsPrompt);

        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                introTips = parsed.selfIntro || [];
                commTips = parsed.communication || [];
                bodyTips = parsed.bodyLanguage || [];
            }
        } catch (parseError) {
            console.error('Error parsing Gemini tips response:', parseError);
        }
    } catch (error) {
        console.error('Error getting AI tips:', error);
    }

    loadingModal.classList.add('hidden');

    // Fallback tips if API fails
    if (introTips.length === 0) {
        introTips = [
            "Start with a confident greeting and your name",
            "Briefly mention your educational background",
            "Highlight 2-3 key skills relevant to the role",
            "Share a brief example of a past achievement",
            "End with your career goals and enthusiasm for the role"
        ];
    }

    if (commTips.length === 0) {
        commTips = [
            "Use the STAR method (Situation, Task, Action, Result)",
            "Be specific with examples and metrics",
            "Listen carefully before responding",
            'Avoid filler words like "um" and "you know"',
            "Practice active listening and ask clarifying questions"
        ];
    }

    if (bodyTips.length === 0) {
        bodyTips = [
            "Maintain good eye contact with the camera",
            "Sit up straight and lean slightly forward",
            "Use natural hand gestures",
            "Smile genuinely at appropriate moments",
            "Avoid crossing your arms or fidgeting"
        ];
    }

    resultsContent.innerHTML = `
        <div class="tips-results">
            <div class="ai-powered-badge" style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; padding: 0.5rem 1rem; background: rgba(108, 92, 231, 0.1); border-radius: 8px; width: fit-content;">
                <span class="material-symbols-rounded" style="color: var(--primary);">auto_awesome</span>
                <span style="font-size: 0.85rem; color: var(--primary); font-weight: 600;">AI-Powered Tips</span>
            </div>
            <div class="tips-category">
                <h4><span class="material-symbols-rounded">person</span> Self Introduction Tips</h4>
                <ul>
                    ${introTips.map(tip => `<li>${tip}</li>`).join('')}
                </ul>
            </div>
            <div class="tips-category">
                <h4><span class="material-symbols-rounded">forum</span> Communication Tips</h4>
                <ul>
                    ${commTips.map(tip => `<li>${tip}</li>`).join('')}
                </ul>
            </div>
            <div class="tips-category">
                <h4><span class="material-symbols-rounded">mood</span> Body Language Tips</h4>
                <ul>
                    ${bodyTips.map(tip => `<li>${tip}</li>`).join('')}
                </ul>
            </div>
        </div>
    `;

    analysisModal.classList.remove('hidden');
}

// Refresh prompts
function refreshSelfIntroPrompt() {
    const promptEl = document.getElementById('self-intro-prompt');
    const currentPrompt = promptEl.textContent;
    let newPrompt;
    do {
        newPrompt = selfIntroPrompts[Math.floor(Math.random() * selfIntroPrompts.length)];
    } while (newPrompt === currentPrompt && selfIntroPrompts.length > 1);

    promptEl.textContent = newPrompt;
    promptEl.classList.add('prompt-fade');
    setTimeout(() => promptEl.classList.remove('prompt-fade'), 300);
}

function refreshCommPrompt() {
    const promptEl = document.getElementById('comm-prompt');
    const categoryEl = document.getElementById('question-category');
    const difficultyEl = document.getElementById('question-difficulty');

    const activeCategory = document.querySelector('.category-chip.active');
    const category = activeCategory ? activeCategory.dataset.category : 'behavioral';

    const questions = interviewQuestions[category] || interviewQuestions.behavioral;
    const currentPrompt = promptEl.textContent;
    let newPrompt;
    do {
        newPrompt = questions[Math.floor(Math.random() * questions.length)];
    } while (newPrompt === currentPrompt && questions.length > 1);

    promptEl.textContent = newPrompt;
    categoryEl.textContent = category.charAt(0).toUpperCase() + category.slice(1);

    // Random difficulty
    const difficulties = ['Easy', 'Medium', 'Hard'];
    const difficulty = difficulties[Math.floor(Math.random() * difficulties.length)];
    difficultyEl.textContent = difficulty;
    difficultyEl.className = `difficulty-badge ${difficulty.toLowerCase()}`;

    promptEl.classList.add('prompt-fade');
    setTimeout(() => promptEl.classList.remove('prompt-fade'), 300);
}

// Practice History Management
async function savePracticeSession(type, score, scores, duration, transcript = '') {
    if (!currentUser) {
        console.error('Cannot save: No user logged in');
        return;
    }

    const loadingModal = document.getElementById('loading-modal');
    const loadingText = document.getElementById('loading-text');

    // Generate session ID first
    const sessionId = `${currentUser.uid}_${Date.now()}`;

    // Save video locally if available
    let hasVideo = false;
    if (currentVideoBlob) {
        loadingText.textContent = 'Saving video locally...';
        loadingModal.classList.remove('hidden');

        try {
            await saveVideoLocally(currentVideoBlob, sessionId);
            hasVideo = true;
            console.log('Video saved with session ID:', sessionId);
        } catch (error) {
            console.error('Failed to save video locally:', error);
            hasVideo = false;
        }

        loadingModal.classList.add('hidden');
    }

    const session = {
        type: type === 'Self Introduction' ? 'self-intro' : 'communication',
        score,
        scores,
        duration,
        date: new Date().toISOString(),
        prompt: type === 'Self Introduction'
            ? (document.getElementById('self-intro-prompt')?.textContent || '')
            : (document.getElementById('comm-prompt')?.textContent || ''),
        transcript: transcript.substring(0, 500), // Store first 500 chars of transcript
        // Local video storage info
        videoSessionId: hasVideo ? sessionId : null,
        hasLocalVideo: hasVideo
    };

    console.log('Saving session to Firestore:', session);

    // Save to Firestore
    try {
        await db.collection('users').doc(currentUser.uid).collection('interview_practice').add(session);
        console.log('Session saved successfully!');
        loadPracticeHistory();
        updateInterviewStats();

        // Show success message
        showSaveSuccessNotification(hasVideo);
    } catch (err) {
        console.error('Error saving session:', err);
        alert('Error saving: ' + err.message + '\n\nCheck your Firestore Security Rules in the Firebase Console!');
    }
}

// Show save success notification
function showSaveSuccessNotification(hasVideo) {
    const notification = document.createElement('div');
    notification.className = 'video-saved-notification';
    notification.innerHTML = `
        <div class="notification-content glass-panel" style="border-left: 4px solid var(--success);">
            <span class="material-symbols-rounded" style="color: var(--success); font-size: 1.5rem;">check_circle</span>
            <div>
                <h4 style="margin: 0 0 0.25rem 0; font-size: 0.95rem;">Session Saved!</h4>
                <p style="margin: 0; font-size: 0.8rem; color: var(--text-muted);">
                    ${hasVideo ? 'Video and feedback saved. View in Practice History.' : 'Feedback saved to your Practice History.'}
                </p>
            </div>
            <button class="btn-close-notification" onclick="this.parentElement.parentElement.remove()">
                <span class="material-symbols-rounded">close</span>
            </button>
        </div>
    `;
    document.body.appendChild(notification);

    // Auto-hide after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// Show video saved notification
function showVideoSavedNotification() {
    const notification = document.createElement('div');
    notification.className = 'video-saved-notification';
    notification.innerHTML = `
        <div class="notification-content glass-panel" style="border-left: 4px solid var(--success);">
            <span class="material-symbols-rounded" style="color: var(--success); font-size: 1.5rem;">save</span>
            <div>
                <h4 style="margin: 0 0 0.25rem 0; font-size: 0.95rem;">Video Saved!</h4>
                <p style="margin: 0; font-size: 0.8rem; color: var(--text-muted);">
                    Your video is stored locally on this device. View it anytime in Practice History.
                </p>
            </div>
            <button class="btn-close-notification" onclick="this.parentElement.parentElement.remove()">
                <span class="material-symbols-rounded">close</span>
            </button>
        </div>
    `;
    document.body.appendChild(notification);

    // Auto-hide after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 8000);
}

function loadPracticeHistory() {
    if (!currentUser) return;

    db.collection('users').doc(currentUser.uid).collection('interview_practice')
        .orderBy('date', 'desc')
        .limit(50)
        .onSnapshot(snapshot => {
            allPracticeSessions = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            renderPracticeHistory();
            updateInterviewStats();
        }, error => {
            console.error('Error loading practice history:', error);
        });
}

function renderPracticeHistory() {
    const historyList = document.getElementById('practice-history-list');
    const filterType = document.getElementById('history-filter-type')?.value || 'all';
    const filterTime = document.getElementById('history-filter-time')?.value || 'all';

    if (!historyList) return;

    let filtered = [...allPracticeSessions];

    // Filter by type
    if (filterType !== 'all') {
        filtered = filtered.filter(s => s.type === filterType);
    }

    // Filter by time
    const now = new Date();
    if (filterTime === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        filtered = filtered.filter(s => new Date(s.date) >= weekAgo);
    } else if (filterTime === 'month') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        filtered = filtered.filter(s => new Date(s.date) >= monthAgo);
    }

    if (filtered.length === 0) {
        historyList.innerHTML = `
            <div class="empty-history">
                <span class="material-symbols-rounded">videocam_off</span>
                <p>No practice sessions found</p>
                <span class="sub-text">Start practicing to build your history</span>
            </div>
        `;
        return;
    }

    historyList.innerHTML = filtered.map(session => {
        const date = new Date(session.date);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const mins = Math.floor((session.duration || 0) / 60);
        const secs = (session.duration || 0) % 60;
        const score = session.score || 0;

        // Check video status
        const hasVideo = session.hasLocalVideo && session.videoSessionId;

        const safePrompt = (session.prompt || '')
            .replace(/'/g, "\\'")
            .replace(/"/g, '&quot;')
            .replace(/\n/g, ' ')
            .substring(0, 100);

        return `
            <div class="history-item glass-panel" style="position: relative;">
                <div class="history-icon ${session.type}">
                    <span class="material-symbols-rounded">${session.type === 'self-intro' ? 'person' : 'forum'}</span>
                </div>
                <div class="history-info" style="flex: 1;">
                    <h4>${session.type === 'self-intro' ? 'Self Introduction' : 'Communication Practice'}</h4>
                    <p class="history-prompt" style="color: #aaa; font-size: 0.9em; margin-bottom: 8px;">${(session.prompt || '').substring(0, 80)}${(session.prompt || '').length > 80 ? '...' : ''}</p>
                    <div class="history-meta">
                        <span><span class="material-symbols-rounded">calendar_today</span> ${dateStr}</span>
                        <span><span class="material-symbols-rounded">schedule</span> ${timeStr}</span>
                        <span><span class="material-symbols-rounded">timer</span> ${mins}:${secs.toString().padStart(2, '0')}</span>
                    </div>
                    
                    <div class="history-actions" style="margin-top: 12px; display: flex; gap: 10px; align-items: center; max-width: 100%; flex-wrap: wrap;">
                        ${hasVideo ? `
                            <span class="local-video-badge"><span class="material-symbols-rounded">folder</span> Stored locally</span>
                            <button class="btn-video-action" onclick="playLocalVideo('${session.videoSessionId}')" title="Play Video" style="min-width: 36px;">
                                <span class="material-symbols-rounded">play_circle</span>
                            </button>
                            <button class="btn-video-action" onclick="downloadLocalVideo('${session.videoSessionId}', '${session.type}_${dateStr.replace(/\s/g, '_')}.webm')" title="Download" style="min-width: 36px;">
                                <span class="material-symbols-rounded">download</span>
                            </button>
                        ` : ''}
                        
                        <!-- RED TRASH ICON - FORCED STYLE -->
                        <button class="btn-video-action delete-btn" onclick="deleteSession('${session.id}', ${hasVideo ? `'${session.videoSessionId}'` : 'null'}, '${safePrompt}')" title="Delete" style="
                            color: #ef4444 !important; 
                            border: 1px solid rgba(239, 68, 68, 0.3) !important; 
                            background: rgba(239, 68, 68, 0.1) !important;
                            min-width: 36px;
                            margin-left: auto;
                            display: flex !important;
                            opacity: 1 !important;
                        ">
                            <span class="material-symbols-rounded">delete</span>
                        </button>
                    </div>
                </div>
                
                <div class="history-score ${score >= 80 ? 'excellent' : score >= 60 ? 'good' : 'needs-work'}" style="margin-left: 15px; display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 60px;">
                    <span class="score-value" style="font-size: 1.8rem; font-weight: 700;">${score}</span>
                    <span class="score-label" style="font-size: 0.75rem; opacity: 0.8;">Score</span>
                </div>
            </div>
        `;
    }).join('');
}

// Play video from local IndexedDB storage
async function playLocalVideo(sessionId) {
    try {
        const blob = await getVideoLocally(sessionId);
        if (blob) {
            // Create a video player modal
            const modal = document.createElement('div');
            modal.className = 'video-player-modal';
            modal.innerHTML = `
                <div class="video-player-content glass-panel">
                    <div class="video-player-header">
                        <h3><span class="material-symbols-rounded">play_circle</span> Practice Recording</h3>
                        <button class="btn-close-player" onclick="this.closest('.video-player-modal').remove()">
                            <span class="material-symbols-rounded">close</span>
                        </button>
                    </div>
                    <video controls autoplay class="video-playback">
                        <source src="${URL.createObjectURL(blob)}" type="video/webm">
                        Your browser does not support video playback.
                    </video>
                </div>
            `;
            document.body.appendChild(modal);

            // Close on backdrop click
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.remove();
                }
            });
        } else {
            // Video missing - offer to delete
            if (confirm('Video file not found on this device. The local file may have been deleted.\n\nWould you like to remove this practice session record?')) {
                // Find the session ID from the history list to delete it
                const sessionEl = document.querySelector(`button[onclick*="${sessionId}"]`).closest('.history-item');
                if (sessionEl) {
                    // Try to extract the main session ID from the delete button in the same row
                    const deleteBtn = sessionEl.querySelector('.delete-btn');
                    if (deleteBtn) {
                        const onclickAttr = deleteBtn.getAttribute('onclick');
                        const ids = onclickAttr.match(/'([^']+)'/g).map(s => s.replace(/'/g, ''));
                        if (ids.length > 0) {
                            deleteSession(ids[0], sessionId);
                        }
                    }
                } else {
                    alert('Could not identify session to delete. Please use the delete button on the card.');
                }
            }
        }
    } catch (error) {
        console.error('Error playing video:', error);
        alert('Failed to play video. Please try again.');
    }
}

// Download video from local IndexedDB storage
async function downloadLocalVideo(sessionId, filename) {
    try {
        const blob = await getVideoLocally(sessionId);
        if (blob) {
            downloadVideo(blob, filename);
        } else {
            alert('Video not found. It may have been deleted from local storage.');
        }
    } catch (error) {
        console.error('Error downloading video:', error);
        alert('Failed to download video. Please try again.');
    }
}

// Delete session and video
async function deleteSession(sessionId, videoSessionId, sessionName = '') {
    const confirmMessage = sessionName
        ? `Are you sure you want to delete this specific history: "${sessionName}"?\n\nThis action cannot be undone.`
        : 'Are you sure you want to delete this practice session? This action cannot be undone.';

    if (!confirm(confirmMessage)) {
        return;
    }

    try {
        const loadingModal = document.getElementById('loading-modal');
        const loadingText = document.getElementById('loading-text');
        if (loadingModal && loadingText) {
            loadingText.textContent = 'Deleting session...';
            loadingModal.classList.remove('hidden');
        }

        // 1. Try to delete local video (if it exists)
        if (videoSessionId) {
            try {
                await deleteVideoLocally(videoSessionId);
                console.log('Video deleted from local storage');
            } catch (e) {
                console.warn('Could not delete local video (might already be gone):', e);
            }
        }

        // 2. Delete from Firestore
        if (currentUser) {
            await db.collection('users').doc(currentUser.uid)
                .collection('interview_practice')
                .doc(sessionId)
                .delete();
            console.log('Session deleted from Firestore');
        }

        if (loadingModal) {
            loadingModal.classList.add('hidden');
        }

        showNotification('Practice session deleted successfully', 'success');

        // Refresh the list immediately if not handled by onSnapshot
        // (onSnapshot usually handles it, but just in case)
    } catch (error) {
        console.error('Error deleting session:', error);
        const loadingModal = document.getElementById('loading-modal');
        if (loadingModal) {
            loadingModal.classList.add('hidden');
        }
        showNotification('Failed to delete session. Please check your connection.', 'error');
    }
}

// Clear all history sessions
async function clearAllHistory() {
    if (!confirm('Are you sure you want to delete ALL practice sessions? This action cannot be undone.')) {
        return;
    }

    try {
        const loadingModal = document.getElementById('loading-modal');
        const loadingText = document.getElementById('loading-text');
        if (loadingModal && loadingText) {
            loadingText.textContent = 'Clearing history...';
            loadingModal.classList.remove('hidden');
        }

        // 1. Delete all local videos
        try {
            const allVideoIds = await getAllStoredVideoIds();
            for (const videoId of allVideoIds) {
                await deleteVideoLocally(videoId);
            }
            console.log('All local videos deleted');
        } catch (e) {
            console.warn('Could not clear local videos:', e);
        }

        // 2. Delete all from Firestore
        if (currentUser && allPracticeSessions.length > 0) {
            const batch = db.batch();
            allPracticeSessions.forEach(session => {
                const docRef = db.collection('users').doc(currentUser.uid)
                    .collection('interview_practice').doc(session.id);
                batch.delete(docRef);
            });
            await batch.commit();
            console.log('All sessions deleted from Firestore');
        }

        if (loadingModal) {
            loadingModal.classList.add('hidden');
        }

        showNotification('All practice history cleared successfully', 'success');

    } catch (error) {
        console.error('Error clearing history:', error);
        const loadingModal = document.getElementById('loading-modal');
        if (loadingModal) {
            loadingModal.classList.add('hidden');
        }
        showNotification('Failed to clear history. Please check your connection.', 'error');
    }
}

// Show notification helper
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = 'video-saved-notification';

    const colors = {
        success: 'var(--success)',
        error: '#ef4444',
        info: 'var(--primary)'
    };

    const icons = {
        success: 'check_circle',
        error: 'error',
        info: 'info'
    };

    notification.innerHTML = `
        \u003cdiv class="notification-content glass-panel" style="border-left: 4px solid ${colors[type] || colors.info};">
            \u003cspan class="material-symbols-rounded" style="color: ${colors[type] || colors.info}; font-size: 1.5rem;">${icons[type] || icons.info}\u003c/span>
            \u003cdiv>
                \u003cp style="margin: 0; font-size: 0.9rem;">${message}\u003c/p>
            \u003c/div>
            \u003cbutton class="btn-close-notification" onclick="this.parentElement.parentElement.remove()">
                \u003cspan class="material-symbols-rounded">close\u003c/span>
            \u003c/button>
        \u003c/div>
    `;
    document.body.appendChild(notification);

    // Auto-hide after 4 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 4000);
}


// ============================================
// API KEYS MODAL & LOCAL STORAGE MANAGEMENT
// ============================================

function openApiSettingsModal() {
    const modal = document.getElementById('api-keys-modal');
    if (!modal) return;

    const geminiInput = document.getElementById('input-gemini-key');
    const openaiInput = document.getElementById('input-openai-key');

    const savedGemini = localStorage.getItem('user_gemini_api_key');
    const savedOpenAI = localStorage.getItem('user_openai_api_key');

    if (geminiInput) {
        geminiInput.value = savedGemini || window.GEMINI_API_KEY || '';
    }
    if (openaiInput) {
        openaiInput.value = savedOpenAI || window.OPENAI_API_KEY || '';
    }

    updateApiStatusBadges();
    modal.classList.remove('hidden');
}

function closeApiSettingsModal() {
    const modal = document.getElementById('api-keys-modal');
    if (modal) modal.classList.add('hidden');
}

function toggleKeyVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    const icon = btn.querySelector('.material-symbols-rounded');
    if (icon) {
        icon.textContent = isPassword ? 'visibility_off' : 'visibility';
    }
}

function updateApiStatusBadges() {
    const geminiBadge  = document.getElementById('gemini-status-badge');
    const chatgptBadge = document.getElementById('chatgpt-status-badge');

    const effectiveGemini = getEffectiveGeminiKey();
    const effectiveOpenAI = getEffectiveOpenAIKey();

    if (geminiBadge) {
        if (localStorage.getItem('user_gemini_api_key')) {
            geminiBadge.textContent = 'Custom Key Active';
            geminiBadge.className = 'api-status-badge active';
        } else if (window.GEMINI_API_KEY) {
            geminiBadge.textContent = 'Env Key Active';
            geminiBadge.className = 'api-status-badge active';
        } else {
            geminiBadge.textContent = 'Not Configured';
            geminiBadge.className = 'api-status-badge missing';
        }
    }

    if (chatgptBadge) {
        if (localStorage.getItem('user_openai_api_key')) {
            chatgptBadge.textContent = 'Custom Key Active';
            chatgptBadge.className = 'api-status-badge active';
        } else if (window.OPENAI_API_KEY) {
            chatgptBadge.textContent = 'Env Key Active';
            chatgptBadge.className = 'api-status-badge active';
        } else {
            chatgptBadge.textContent = 'Not Configured';
            chatgptBadge.className = 'api-status-badge missing';
        }
    }
}

function saveCustomApiKeys() {
    const geminiInput = document.getElementById('input-gemini-key');
    const openaiInput = document.getElementById('input-openai-key');

    const geminiVal = geminiInput ? geminiInput.value.trim() : '';
    const openaiVal = openaiInput ? openaiInput.value.trim() : '';

    if (geminiVal) {
        localStorage.setItem('user_gemini_api_key', geminiVal);
    } else {
        localStorage.removeItem('user_gemini_api_key');
    }

    if (openaiVal) {
        localStorage.setItem('user_openai_api_key', openaiVal);
    } else {
        localStorage.removeItem('user_openai_api_key');
    }

    updateApiStatusBadges();
    showToast('AI API Keys saved successfully!', 'info');
    setTimeout(() => {
        closeApiSettingsModal();
    }, 400);
}

// ============================================
// AUDIO & MICROPHONE TEST MODULE
// ============================================
let testAudioStream = null;
let testAudioContext = null;
let testAnalyser = null;
let testAnimFrame = null;
let testSpeechRec = null;
let testSampleRecorder = null;
let testSampleChunks = [];
let testSampleTimer = null;
let isSamplingAudio = false;

// Audio-to-Text & AI Conversion State
let rawCapturedSpeechText = '';
let currentPolishedSpeechText = '';
let availableTTSVoices = [];
let selectedTTSVoice = null;
let isSpeakingTTS = false;

// Populate available audio input devices
async function populateAudioDevices() {
    const select = document.getElementById('audio-device-select');
    if (!select) return;

    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(d => d.kind === 'audioinput');

        select.innerHTML = '<option value="">Default Microphone</option>';
        audioInputs.forEach((device, index) => {
            const opt = document.createElement('option');
            opt.value = device.deviceId;
            opt.textContent = device.label || `Microphone ${index + 1}`;
            select.appendChild(opt);
        });
    } catch (err) {
        console.warn('Could not enumerate audio devices:', err);
    }
}

// Start live audio test with Web Audio API visualizer
async function startAudioTest(deviceId = '') {
    // Clean up existing stream
    stopAudioTestStream();

    try {
        const constraints = {
            audio: deviceId ? { deviceId: { exact: deviceId } } : true,
            video: false
        };

        testAudioStream = await navigator.mediaDevices.getUserMedia(constraints);

        // Populate device names if they were blank before permission
        populateAudioDevices();

        // Web Audio API setup
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        testAudioContext = new AudioCtx();
        const source = testAudioContext.createMediaStreamSource(testAudioStream);
        testAnalyser = testAudioContext.createAnalyser();
        testAnalyser.fftSize = 256;
        source.connect(testAnalyser);

        // Start visualizer loop
        runAudioVisualizer();

        // Start speech recognition test
        startTestSpeechRecognition();

    } catch (err) {
        console.error('Audio test mic access error:', err);
        const feedback = document.getElementById('audio-status-feedback');
        if (feedback) {
            feedback.textContent = '❌ Microphone access denied or not found.';
            feedback.style.color = '#ff7675';
        }
        showToast('Microphone access denied. Please allow microphone permissions in your browser.', 'error');
    }
}

// Stop audio test stream and listeners
function stopAudioTestStream() {
    if (testAnimFrame) {
        cancelAnimationFrame(testAnimFrame);
        testAnimFrame = null;
    }
    if (testAudioStream) {
        testAudioStream.getTracks().forEach(t => t.stop());
        testAudioStream = null;
    }
    if (testAudioContext && testAudioContext.state !== 'closed') {
        try { testAudioContext.close(); } catch (e) {}
        testAudioContext = null;
    }
    if (testSpeechRec) {
        try { testSpeechRec.stop(); } catch (e) {}
        testSpeechRec = null;
    }
    if (testSampleTimer) {
        clearInterval(testSampleTimer);
        testSampleTimer = null;
    }
    if (testSampleRecorder && testSampleRecorder.state !== 'inactive') {
        try { testSampleRecorder.stop(); } catch (e) {}
    }
    isSamplingAudio = false;
}

// Visualizer animation frame loop
function runAudioVisualizer() {
    const canvas = document.getElementById('audio-visualizer-canvas');
    const vuBar = document.getElementById('vu-meter-bar');
    const dbText = document.getElementById('audio-db-text');
    const badge = document.getElementById('audio-level-badge');
    const feedback = document.getElementById('audio-status-feedback');

    if (!testAnalyser || !canvas) return;

    const ctx = canvas.getContext('2d');
    const bufferLength = testAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
        testAnimFrame = requestAnimationFrame(draw);
        testAnalyser.getByteFrequencyData(dataArray);

        // Compute average volume level (0-100)
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const volumePercent = Math.min(100, Math.round((average / 128) * 100));

        // Update VU Bar width
        if (vuBar) {
            vuBar.style.width = `${volumePercent}%`;
            if (volumePercent > 80) {
                vuBar.style.background = 'linear-gradient(90deg, #00cec9, #fdcb6e, #ff7675)';
            } else if (volumePercent > 20) {
                vuBar.style.background = 'linear-gradient(90deg, #6c5ce7, #00cec9)';
            } else {
                vuBar.style.background = 'linear-gradient(90deg, #6c5ce7, #a29bfe)';
            }
        }

        // Update DB Text & Badge
        if (dbText) dbText.textContent = `Volume: ${volumePercent}%`;

        if (badge && feedback) {
            if (volumePercent === 0) {
                badge.textContent = 'Silent';
                badge.className = 'level-badge idle';
                feedback.textContent = 'Speak into your microphone to test volume...';
            } else if (volumePercent < 15) {
                badge.textContent = 'Low Input';
                badge.className = 'level-badge low';
                feedback.textContent = 'Your voice is quiet. Consider moving closer to the mic.';
            } else if (volumePercent <= 75) {
                badge.textContent = 'Optimal Level';
                badge.className = 'level-badge good';
                feedback.textContent = 'Clear audio level detected! Perfect for interviews.';
            } else {
                badge.textContent = 'Very Loud (Clipping)';
                badge.className = 'level-badge high';
                feedback.textContent = 'Volume is very loud. Lower your mic input volume slightly.';
            }
        }

        // Draw Canvas Frequency Bars
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const barWidth = (canvas.width / bufferLength) * 2.2;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * canvas.height;

            const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
            gradient.addColorStop(0, '#6c5ce7');
            gradient.addColorStop(0.6, '#00cec9');
            gradient.addColorStop(1, '#a29bfe');

            ctx.fillStyle = gradient;
            ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
            x += barWidth;
            if (x > canvas.width) break;
        }
    }

    draw();
}

// Start live speech-to-text specifically for the audio test box
function startTestSpeechRecognition() {
    const transcriptEl = document.getElementById('audio-test-transcript');
    const sttBadge = document.getElementById('stt-status-badge');
    const wordCountEl = document.getElementById('speech-word-count');
    if (!transcriptEl) return;

    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
        transcriptEl.innerHTML = '<span style="color:#fdcb6e;">⚠️ Speech recognition is not supported in this browser. Microphone audio testing is still active above.</span>';
        if (sttBadge) {
            sttBadge.textContent = 'Unsupported';
            sttBadge.className = 'level-badge low';
        }
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    testSpeechRec = new SpeechRecognition();
    testSpeechRec.continuous = true;
    testSpeechRec.interimResults = true;
    testSpeechRec.lang = 'en-US';

    testSpeechRec.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
                rawCapturedSpeechText += event.results[i][0].transcript + ' ';
            } else {
                interim += event.results[i][0].transcript;
            }
        }

        if (sttBadge) {
            sttBadge.textContent = 'Hearing You';
            sttBadge.className = 'level-badge good';
        }

        const fullDisplay = (rawCapturedSpeechText + interim).trim();
        const wordCount = fullDisplay ? fullDisplay.split(/\s+/).length : 0;
        if (wordCountEl) {
            wordCountEl.textContent = `${wordCount} word${wordCount === 1 ? '' : 's'}`;
        }

        transcriptEl.innerHTML = `
            <div style="color: #00cec9; font-weight: 500; font-size: 0.95rem;">
                <span class="material-symbols-rounded" style="vertical-align: middle; font-size: 1.1rem; color: #00b894;">record_voice_over</span>
                ${rawCapturedSpeechText} <span style="opacity: 0.7; font-style: italic;">${interim}</span>
            </div>
        `;
    };

    testSpeechRec.onerror = (e) => {
        if (e.error !== 'no-speech') {
            console.warn('Audio test STT notice:', e.error);
        }
    };

    testSpeechRec.onend = () => {
        // Restart if modal is still open
        const modal = document.getElementById('audio-test-modal');
        if (modal && !modal.classList.contains('hidden') && testSpeechRec) {
            try { testSpeechRec.start(); } catch (e) {}
        }
    };

    try {
        testSpeechRec.start();
        if (sttBadge) {
            sttBadge.textContent = 'Listening';
            sttBadge.className = 'level-badge idle';
        }
    } catch (e) {
        console.log('Test STT already active:', e);
    }
}

// Clear audio test transcript
function clearAudioTestTranscript() {
    rawCapturedSpeechText = '';
    currentPolishedSpeechText = '';
    stopAISpeechPlayback();

    const transcriptEl = document.getElementById('audio-test-transcript');
    if (transcriptEl) {
        transcriptEl.innerHTML = '<span class="transcript-placeholder">Speak now into your microphone to convert your audio to text in real time...</span>';
    }

    const wordCountEl = document.getElementById('speech-word-count');
    if (wordCountEl) wordCountEl.textContent = '0 words';

    const container = document.getElementById('audio-ai-analysis-container');
    if (container) container.classList.add('hidden');

    const sttBadge = document.getElementById('stt-status-badge');
    if (sttBadge) {
        sttBadge.textContent = 'Listening';
        sttBadge.className = 'level-badge idle';
    }
}

// Analyze speech text with AI (Gemini or ChatGPT)
async function analyzeSpeechWithAI() {
    const textToAnalyze = rawCapturedSpeechText.trim();
    if (!textToAnalyze || textToAnalyze.length < 3) {
        showToast('Please speak a few words into your microphone first to convert audio to text!', 'info');
        return;
    }

    const btn = document.getElementById('btn-analyze-speech');
    const container = document.getElementById('audio-ai-analysis-container');
    const modelTag = document.getElementById('speech-model-tag');

    const modelPreference = selectedModel['self-intro'] || 'gemini';

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-symbols-rounded rotating">sync</span> Analyzing audio speech with AI...';
    }

    try {
        const resp = await fetch('/api/analyze-audio-test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: textToAnalyze,
                model: modelPreference,
                gemini_key: getEffectiveGeminiKey(),
                openai_key: getEffectiveOpenAIKey()
            })
        });

        const data = await resp.json();
        if (!data.success) {
            throw new Error(data.error || 'Failed to analyze speech');
        }

        const analysis = data.analysis;
        currentPolishedSpeechText = analysis.improvedText || textToAnalyze;

        // Populate metrics
        const clarityEl = document.getElementById('metric-clarity');
        const confEl = document.getElementById('metric-confidence');
        const toneEl = document.getElementById('metric-tone');
        const fillerEl = document.getElementById('metric-fillers');
        const feedbackEl = document.getElementById('speech-feedback-text');
        const polishedEl = document.getElementById('polished-speech-text');

        if (clarityEl) clarityEl.textContent = `${analysis.clarityScore || 85}%`;
        if (confEl) confEl.textContent = `${analysis.confidenceScore || 80}%`;
        if (toneEl) toneEl.textContent = analysis.detectedTone || 'Clear & Direct';
        if (fillerEl) {
            const fillers = analysis.fillerWords || [];
            fillerEl.textContent = fillers.length > 0 ? fillers.join(', ') : '0 detected';
            fillerEl.style.color = fillers.length > 0 ? '#ff7675' : '#00b894';
        }
        if (feedbackEl) {
            feedbackEl.textContent = analysis.feedback || 'Good articulation and voice projection.';
        }
        if (polishedEl) {
            polishedEl.textContent = `"${currentPolishedSpeechText}"`;
        }

        if (modelTag) {
            if (data.model.includes('gpt')) {
                modelTag.textContent = 'ChatGPT 4o';
                modelTag.className = 'model-badge chatgpt';
            } else if (data.model.includes('gemini')) {
                modelTag.textContent = 'Gemini 2.5';
                modelTag.className = 'model-badge';
            } else {
                modelTag.textContent = 'Smart Coach';
                modelTag.className = 'model-badge';
            }
        }

        // Show result box
        if (container) {
            container.classList.remove('hidden');
            container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        // Initialize TTS voices
        populateTTSVoices();
        showToast('Speech analyzed! Click "Listen to Audio Conversion" below to hear the polished version.', 'info');

    } catch (err) {
        console.error('Speech analysis error:', err);
        showToast(`Could not analyze speech: ${err.message}`, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span class="material-symbols-rounded">auto_awesome</span> Re-analyze Speech with AI';
        }
    }
}

// Populate available browser Text-To-Speech (TTS) voices
function populateTTSVoices() {
    if (!('speechSynthesis' in window)) return;

    function loadVoices() {
        availableTTSVoices = window.speechSynthesis.getVoices();
        const select = document.getElementById('tts-voice-select');
        if (!select || availableTTSVoices.length === 0) return;

        // Prefer English / natural voices
        const englishVoices = availableTTSVoices.filter(v => v.lang.startsWith('en'));
        const voicesToShow = englishVoices.length > 0 ? englishVoices : availableTTSVoices;

        select.innerHTML = '';
        voicesToShow.slice(0, 10).forEach((voice, idx) => {
            const opt = document.createElement('option');
            opt.value = idx;
            opt.textContent = `${voice.name} (${voice.lang})`;
            select.appendChild(opt);
        });

        selectedTTSVoice = voicesToShow[0] || null;
    }

    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }
}

// Change selected TTS Voice
function changeTTSVoice(index) {
    if (availableTTSVoices && availableTTSVoices[index]) {
        selectedTTSVoice = availableTTSVoices[index];
    }
}

// Convert text back to audio (Text-to-Speech Playback)
function toggleAISpeechPlayback() {
    if (!('speechSynthesis' in window)) {
        showToast('Text-to-speech audio conversion is not supported in this browser.', 'error');
        return;
    }

    if (isSpeakingTTS) {
        stopAISpeechPlayback();
        return;
    }

    const textToSpeak = currentPolishedSpeechText || rawCapturedSpeechText.trim();
    if (!textToSpeak) {
        showToast('No text available to convert to audio.', 'info');
        return;
    }

    window.speechSynthesis.cancel(); // Stop any pending speech

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    if (selectedTTSVoice) {
        utterance.voice = selectedTTSVoice;
    }
    utterance.rate = 0.95; // Natural interview pace
    utterance.pitch = 1.0;

    const btn = document.getElementById('btn-tts-speak');
    const stopBtn = document.getElementById('btn-tts-stop');
    const btnText = document.getElementById('tts-btn-text');

    utterance.onstart = () => {
        isSpeakingTTS = true;
        if (btn) btn.classList.add('playing-tts');
        if (btnText) btnText.textContent = 'Speaking Audio...';
        if (stopBtn) stopBtn.classList.remove('hidden');
    };

    utterance.onend = () => {
        stopAISpeechPlayback();
    };

    utterance.onerror = (e) => {
        console.warn('TTS playback error:', e);
        stopAISpeechPlayback();
    };

    window.speechSynthesis.speak(utterance);
}

// Stop AI TTS audio conversion
function stopAISpeechPlayback() {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
    isSpeakingTTS = false;
    const btn = document.getElementById('btn-tts-speak');
    const stopBtn = document.getElementById('btn-tts-stop');
    const btnText = document.getElementById('tts-btn-text');

    if (btn) btn.classList.remove('playing-tts');
    if (btnText) btnText.textContent = 'Listen to Audio Conversion';
    if (stopBtn) stopBtn.classList.add('hidden');
}

// 5-Second Loopback Playback Test
function toggleSampleRecording() {
    const btn = document.getElementById('btn-sample-record');
    const timerText = document.getElementById('playback-timer');
    const audioPlayer = document.getElementById('audio-sample-playback');

    if (isSamplingAudio) return;

    if (!testAudioStream || testAudioStream.getAudioTracks().length === 0) {
        showToast('Microphone stream is not active. Please allow mic access first.', 'error');
        return;
    }

    isSamplingAudio = true;
    testSampleChunks = [];
    if (audioPlayer) {
        audioPlayer.classList.add('hidden');
        audioPlayer.pause();
    }

    try {
        testSampleRecorder = new MediaRecorder(testAudioStream);
    } catch (e) {
        showToast('MediaRecorder not supported for audio sample on this device.', 'error');
        isSamplingAudio = false;
        return;
    }

    testSampleRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) testSampleChunks.push(e.data);
    };

    testSampleRecorder.onstop = () => {
        const audioBlob = new Blob(testSampleChunks, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        if (audioPlayer) {
            audioPlayer.src = audioUrl;
            audioPlayer.classList.remove('hidden');
            audioPlayer.play().catch(() => {});
        }
        if (btn) {
            btn.innerHTML = '<span class="material-symbols-rounded">play_circle</span> Re-record 5s Sample';
            btn.classList.remove('recording');
        }
        if (timerText) timerText.textContent = 'Playing back!';
        isSamplingAudio = false;
        showToast('Playing back your 5-second sample! How does it sound?', 'info');
    };

    testSampleRecorder.start();

    let secondsLeft = 5;
    if (btn) {
        btn.innerHTML = `<span class="material-symbols-rounded rotating">sync</span> Recording sample (${secondsLeft}s)...`;
        btn.classList.add('recording');
    }
    if (timerText) timerText.textContent = `00:0${secondsLeft}`;

    testSampleTimer = setInterval(() => {
        secondsLeft--;
        if (btn) {
            btn.innerHTML = `<span class="material-symbols-rounded rotating">sync</span> Recording sample (${secondsLeft}s)...`;
        }
        if (timerText) timerText.textContent = `00:0${secondsLeft}`;

        if (secondsLeft <= 0) {
            clearInterval(testSampleTimer);
            testSampleTimer = null;
            if (testSampleRecorder && testSampleRecorder.state !== 'inactive') {
                testSampleRecorder.stop();
            }
        }
    }, 1000);
}

// Switch mic device in Audio Test modal
function switchTestAudioDevice(deviceId) {
    startAudioTest(deviceId);
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
        stopAudioTestStream();
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
        startAudioTest(deviceId).then(() => {
            isAudioListening = true;
            if (btn) btn.classList.add('listening');
            if (icon) icon.textContent = 'mic_off';
            if (text) text.textContent = 'Stop Listening';
            showToast('Microphone listening active', 'info');
        });
    }
}

// Open Audio Test Modal
function openAudioTestModal() {
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

    startAudioTest();
}

// Close Audio Test Modal
function closeAudioTestModal() {
    const modal = document.getElementById('audio-test-modal');
    if (modal) modal.classList.add('hidden');
    stopAudioTestStream();
    stopAISpeechPlayback();

    isAudioListening = false;
    const btn = document.getElementById('btn-toggle-listen');
    const icon = document.getElementById('listen-toggle-icon');
    const text = document.getElementById('listen-toggle-text');
    if (btn) btn.classList.remove('listening');
    if (icon) icon.textContent = 'mic';
    if (text) text.textContent = 'Start Listening';
}

// Clear custom keys function
function clearCustomApiKeys() {
    localStorage.removeItem('user_gemini_api_key');
    localStorage.removeItem('user_openai_api_key');

    const geminiInput = document.getElementById('input-gemini-key');
    const openaiInput = document.getElementById('input-openai-key');
    if (geminiInput) geminiInput.value = window.GEMINI_API_KEY || '';
    if (openaiInput) openaiInput.value = window.OPENAI_API_KEY || '';

    updateApiStatusBadges();
    showToast('Reset keys to default environment settings', 'info');
}

// Make functions globally accessible for onclick handlers
window.playLocalVideo = playLocalVideo;
window.downloadLocalVideo = downloadLocalVideo;
window.deleteSession = deleteSession;
window.getInterviewTips = getInterviewTips;
window.openApiSettingsModal = openApiSettingsModal;
window.closeApiSettingsModal = closeApiSettingsModal;
window.toggleKeyVisibility = toggleKeyVisibility;
window.saveCustomApiKeys = saveCustomApiKeys;
window.clearCustomApiKeys = clearCustomApiKeys;
window.updateApiStatusBadges = updateApiStatusBadges;
window.openAudioTestModal = openAudioTestModal;
window.closeAudioTestModal = closeAudioTestModal;
window.toggleAudioListening = toggleAudioListening;
window.populateAudioDevices = populateAudioDevices;
window.switchTestAudioDevice = switchTestAudioDevice;
window.toggleSampleRecording = toggleSampleRecording;
window.clearAudioTestTranscript = clearAudioTestTranscript;
window.analyzeSpeechWithAI = analyzeSpeechWithAI;
window.populateTTSVoices = populateTTSVoices;
window.changeTTSVoice = changeTTSVoice;
window.toggleAISpeechPlayback = toggleAISpeechPlayback;
window.stopAISpeechPlayback = stopAISpeechPlayback;
window.switchTab = function (tabName) {
    const targetTab = document.querySelector(`.prep-tab[data-tab="${tabName}"]`);
    if (targetTab) {
        targetTab.click();
    }
};

function updateInterviewStats() {
    const totalRecordings = document.getElementById('total-recordings');
    const totalTime = document.getElementById('total-practice-time');
    const avgScore = document.getElementById('avg-score');
    const streak = document.getElementById('practice-streak');

    if (totalRecordings) {
        totalRecordings.textContent = allPracticeSessions.length;
    }

    if (totalTime) {
        const totalSeconds = allPracticeSessions.reduce((acc, s) => acc + (s.duration || 0), 0);
        const hours = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        totalTime.textContent = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    }

    if (avgScore && allPracticeSessions.length > 0) {
        const avg = Math.round(allPracticeSessions.reduce((acc, s) => acc + (s.score || 0), 0) / allPracticeSessions.length);
        avgScore.textContent = avg;
    }

    if (streak) {
        streak.textContent = calculateStreak();
    }
}

function calculateStreak() {
    if (allPracticeSessions.length === 0) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let streak = 0;
    let checkDate = new Date(today);

    while (true) {
        const dateStr = checkDate.toISOString().split('T')[0];
        const hasSession = allPracticeSessions.some(s => s.date.split('T')[0] === dateStr);

        if (hasSession) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
        } else {
            break;
        }

        if (streak > 365) break;
    }

    return streak;
}
