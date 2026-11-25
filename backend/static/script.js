// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDYoeFdUPDNebrJxQefP9Uww_v5SuE_lqA",
    authDomain: "hospital-3e6cc.firebaseapp.com",
    projectId: "hospital-3e6cc",
    storageBucket: "hospital-3e6cc.firebasestorage.app",
    messagingSenderId: "493540413183",
    appId: "1:493540413183:web:50abd036597ef9d53046ca",
    measurementId: "G-JFDV99DY3N"
};

// Initialize Firebase
let app, auth, db, storage;
try {
    app = firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    console.log("Firebase initialized");
} catch (e) {
    console.error("Firebase init failed.", e);
}

try {
    if (firebase.storage) {
        storage = firebase.storage();
        console.log("Firebase Storage initialized");
    }
} catch (e) {
    console.warn("Storage not available or failed.", e);
}

// DOM Elements
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginCard = document.getElementById('login-card');
const registerCard = document.getElementById('register-card');
const logoutBtn = document.getElementById('logout-btn');

// Task Specific Elements
const addTaskBtn = document.getElementById('add-task-btn');
const modal = document.getElementById('task-modal');
const closeModal = document.querySelector('.close-modal');
const closeModalBtn = document.querySelector('.close-modal-btn');
const createTaskForm = document.getElementById('create-task-form');
const taskList = document.getElementById('tasks-list');
const completedList = document.getElementById('completed-list');

// State
let currentUser = null;

// Auth Logic
auth.onAuthStateChanged(user => {
    // If we are on the login page (root /)
    if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
        if (user) {
            window.location.href = '/dashboard';
        }
    } else {
        // We are on an internal page
        if (!user) {
            window.location.href = '/';
        } else {
            currentUser = user;
            if (document.getElementById('user-name')) updateUserProfile(user);

            // Allow page specific logic to run
            if (document.getElementById('tasks-list') || document.getElementById('completed-list') || document.getElementById('total-count')) {
                loadTasks();
            }
        }
    }
});

function updateUserProfile(user) {
    const nameEl = document.getElementById('user-name');
    const avatarEl = document.getElementById('user-avatar');
    if (nameEl) nameEl.innerText = user.displayName || user.email.split('@')[0];
    if (avatarEl) avatarEl.innerText = (user.displayName || user.email)[0].toUpperCase();
}

// Toggle Auth Forms (Only relevant on login page)
if (document.getElementById('show-register')) {
    document.getElementById('show-register').addEventListener('click', (e) => {
        e.preventDefault();
        loginCard.classList.add('hidden');
        registerCard.classList.remove('hidden');
    });
}

if (document.getElementById('show-login')) {
    document.getElementById('show-login').addEventListener('click', (e) => {
        e.preventDefault();
        registerCard.classList.add('hidden');
        loginCard.classList.remove('hidden');
    });
}

// Login
if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        auth.signInWithEmailAndPassword(email, password)
            .then(() => {
                // Redirect handled by onAuthStateChanged
            })
            .catch(error => alert(error.message));
    });
}

// Register
if (registerForm) {
    registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-password').value;
        const name = document.getElementById('reg-name').value;

        auth.createUserWithEmailAndPassword(email, password)
            .then(cred => {
                return cred.user.updateProfile({ displayName: name });
            })
            .then(() => {
                // Redirect handled by onAuthStateChanged
            })
            .catch(error => alert(error.message));
    });
}

// Logout
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        auth.signOut().then(() => {
            window.location.href = '/';
        });
    });
}

// Modal Logic
const toggleModal = () => {
    if (modal) modal.classList.toggle('hidden');
}
// Add task btn opens CREATE modal
document.querySelectorAll('#add-task-btn, .open-task-modal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (typeof openCreateTaskModal === 'function') openCreateTaskModal();
        else toggleModal();
    });
});
if (closeModal) closeModal.addEventListener('click', () => modal && modal.classList.add('hidden'));
if (closeModalBtn) closeModalBtn.addEventListener('click', () => modal && modal.classList.add('hidden'));
if (modal) {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
    });
}
// Also close detail modal on backdrop click
const detailModal = document.getElementById('task-detail-modal');
if (detailModal) {
    detailModal.addEventListener('click', (e) => {
        if (e.target === detailModal) detailModal.classList.add('hidden');
    });
}

// Date Display
if (document.getElementById('current-date')) {
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('current-date').innerText = new Date().toLocaleDateString('en-US', dateOptions);
}

// Task Management — Create OR Edit (unified handler)
if (createTaskForm) {
    createTaskForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // If on the Plan page, let plan.js handle it
        if (window.location.pathname.includes('plan')) return;

        if (!currentUser) {
            alert("Please wait, logging you in...");
            return;
        }

        const editTaskId = document.getElementById('edit-task-id')?.value?.trim() || '';
        const editOccId  = document.getElementById('edit-occurrence-id')?.value?.trim() || '';
        const isEditMode = !!editTaskId;

        const title       = document.getElementById('new-task-title').value.trim();
        const description = document.getElementById('new-task-description')?.value?.trim() || '';
        const dueDate     = document.getElementById('new-task-date').value;
        const taskTime    = document.getElementById('new-task-time')?.value || '';
        const repeatEl    = document.getElementById('new-task-repeat');
        const repeat      = repeatEl ? repeatEl.value : 'none';
        const priority    = document.getElementById('new-task-priority')?.value || 'medium';
        const category    = document.getElementById('new-task-category')?.value || 'general';
        const duration    = parseInt(document.getElementById('new-task-duration')?.value || '0') || null;

        const submitBtn = createTaskForm.querySelector('button[type="submit"]');
        const originalHtml = submitBtn.innerHTML;
        submitBtn.innerHTML = '<span class="material-symbols-rounded" style="font-size:16px;animation:spin 1s linear infinite">sync</span> Saving...';
        submitBtn.disabled = true;

        try {
            const schedDate = dueDate || getLocalDateString();
            const todayStr  = getLocalDateString();

            if (isEditMode) {
                // ── EDIT MODE ──
                const taskUpdates = {
                    title, description, priority, category, repeat, duration,
                    taskTime: taskTime || null,
                    dueDate: schedDate,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                const occUpdates = {
                    title, description, priority, category, repeat, duration,
                    taskTime: taskTime || null,
                    scheduledDate: schedDate,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                const planUpdates = {
                    title, description, priority, category,
                    dueDate: schedDate,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                // Update master task
                await db.collection('users').doc(currentUser.uid).collection('tasks').doc(editTaskId).update(taskUpdates).catch(() => {});
                // Update occurrence
                if (editOccId) {
                    await db.collection('users').doc(currentUser.uid).collection('task_occurrences').doc(editOccId).update(occUpdates).catch(() => {});
                }
                // Update plan mirror
                await db.collection('users').doc(currentUser.uid).collection('plans').doc(editTaskId).update(planUpdates).catch(() => {});

                console.log("Task updated:", editTaskId);
            } else {
                // ── CREATE MODE ──
                const taskRef = db.collection('users').doc(currentUser.uid).collection('tasks').doc();
                const taskId  = taskRef.id;
                const occId   = `${taskId}_${schedDate}`;

                // 1. Master task
                await taskRef.set({
                    title, description, priority, category, repeat,
                    duration: duration || null,
                    taskTime: taskTime || null,
                    dueDate: schedDate,
                    completed: false,
                    isActive: true,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                // 2. First occurrence
                await db.collection('users').doc(currentUser.uid).collection('task_occurrences').doc(occId).set({
                    occurrenceId: occId,
                    taskId,
                    userId: currentUser.uid,
                    title, description, priority, category, repeat,
                    duration: duration || null,
                    taskTime: taskTime || null,
                    scheduledDate: schedDate,
                    status: schedDate < todayStr ? 'NOT_COMPLETED' : 'PENDING',
                    completed: false,
                    isLocked: schedDate < todayStr,
                    completedAt: null,
                    timeSpent: null,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                // 3. Mirror to plans (calendar sync)
                await db.collection('users').doc(currentUser.uid).collection('plans').doc(taskId).set({
                    title, description,
                    type: 'task',
                    priority, category, repeat,
                    duration: duration || null,
                    taskTime: taskTime || null,
                    dueDate: schedDate,
                    completed: false,
                    taskId,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                console.log("Task & Occurrence created:", taskId);
            }

            modal && modal.classList.add('hidden');
            createTaskForm.reset();
        } catch (err) {
            console.error("Error saving task:", err);
            alert("Error saving task: " + err.message);
        } finally {
            submitBtn.innerHTML = originalHtml;
            submitBtn.disabled = false;
        }
    });
}

// Date & Time Helpers
function getLocalDateString(d = new Date()) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function getYesterdayDateString() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return getLocalDateString(d);
}

function getDatesBetween(startDateStr, endDateStr, maxDaysBack = 7) {
    const dates = [];
    const end = new Date(endDateStr + "T00:00:00");
    let start = new Date(startDateStr + "T00:00:00");
    if (isNaN(start.getTime())) start = new Date(end);

    // Limit backfill to at most maxDaysBack
    const earliestAllowed = new Date(end);
    earliestAllowed.setDate(earliestAllowed.getDate() - maxDaysBack);
    if (start < earliestAllowed) start = earliestAllowed;

    const cur = new Date(start);
    while (cur <= end) {
        dates.push(getLocalDateString(cur));
        cur.setDate(cur.getDate() + 1);
    }
    return dates;
}

function formatDuration(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = s % 60;
    if (hours > 0) {
        return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    } else {
        return `${seconds}s`;
    }
}

function formatTimerDigits(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = s % 60;
    if (hours > 0) {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Global Occurrences State
let activeTab = 'all';
let allOccurrences = [];
let allMasterTasks = [];
let occurrencesMap = {};
const activeTaskTimers = {};
let unsubscribeOccurrences = null;

let taskFilterPriority = 'all';
let taskFilterCategory = 'all';
let taskSearchQuery = '';

window.setTaskFilterPriority = (p) => {
    taskFilterPriority = p;
    renderTasksPage(allOccurrences, allMasterTasks);
};

window.setTaskFilterCategory = (c) => {
    taskFilterCategory = c;
    renderTasksPage(allOccurrences, allMasterTasks);
};

window.setTaskSearchQuery = (q) => {
    taskSearchQuery = (q || '').trim().toLowerCase();
    renderTasksPage(allOccurrences, allMasterTasks);
};

window.resetTaskFilters = () => {
    taskFilterPriority = 'all';
    taskFilterCategory = 'all';
    taskSearchQuery = '';
    const pEl = document.getElementById('filter-task-priority');
    const cEl = document.getElementById('filter-task-category');
    const sEl = document.getElementById('filter-task-search');
    if (pEl) pEl.value = 'all';
    if (cEl) cEl.value = 'all';
    if (sEl) sEl.value = '';
    renderTasksPage(allOccurrences, allMasterTasks);
};

// Tab Switcher for Tasks Page
window.switchTaskTab = (tabName) => {
    activeTab = tabName;
    document.querySelectorAll('.task-tab').forEach(btn => {
        if (btn.dataset.tab === tabName) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    if (allOccurrences.length > 0 || allMasterTasks.length > 0) {
        renderTasksPage(allOccurrences, allMasterTasks);
    }
};

// Date-Based Daily Task Reconciliation Engine
async function reconcileDailyTasks(user) {
    if (!user) return;
    const uid = user.uid;
    const todayStr = getLocalDateString();
    const yesterdayStr = getYesterdayDateString();

    try {
        // 1. Fetch master task definitions
        const tasksSnap = await db.collection('users').doc(uid).collection('tasks').get();
        if (tasksSnap.empty) return;

        // 2. Fetch existing occurrences
        const occSnap = await db.collection('users').doc(uid).collection('task_occurrences').get();
        const existingOccs = {};
        occSnap.forEach(doc => {
            existingOccs[doc.id] = { id: doc.id, ...doc.data() };
        });

        const batch = db.batch();
        let ops = 0;

        tasksSnap.forEach(doc => {
            const task = doc.data();
            const taskId = doc.id;
            const originDate = task.dueDate || (task.createdAt && task.createdAt.toDate ? getLocalDateString(task.createdAt.toDate()) : todayStr);

            if (task.repeat === 'daily') {
                // Backfill from origin date (up to 7 days) to todayStr
                const dates = getDatesBetween(originDate, todayStr, 7);
                dates.forEach(dStr => {
                    const occId = `${taskId}_${dStr}`;
                    const existing = existingOccs[occId];

                    if (!existing) {
                        const isPast = dStr < todayStr;
                        const wasCompleted = task.completed && (task.dueDate === dStr || !task.dueDate);
                        const occRef = db.collection('users').doc(uid).collection('task_occurrences').doc(occId);
                        batch.set(occRef, {
                            occurrenceId: occId,
                            taskId: taskId,
                            userId: uid,
                            title: task.title,
                            priority: task.priority || "medium",
                            repeat: "daily",
                            scheduledDate: dStr,
                            status: isPast ? (wasCompleted ? "COMPLETED" : "NOT_COMPLETED") : (wasCompleted ? "COMPLETED" : "PENDING"),
                            completed: wasCompleted,
                            isLocked: isPast,
                            completedAt: wasCompleted ? (task.completedAt || null) : null,
                            timeSpent: wasCompleted ? (task.timeSpent || null) : null,
                            createdAt: task.createdAt || firebase.firestore.FieldValue.serverTimestamp()
                        }, { merge: true });
                        ops++;
                    } else {
                        // Existing occurrence: lock if date is in the past!
                        if (dStr < todayStr) {
                            if (!existing.isLocked || existing.status === 'PENDING') {
                                const occRef = db.collection('users').doc(uid).collection('task_occurrences').doc(occId);
                                batch.update(occRef, {
                                    status: existing.status === 'COMPLETED' ? 'COMPLETED' : 'NOT_COMPLETED',
                                    completed: existing.status === 'COMPLETED',
                                    isLocked: true
                                });
                                ops++;
                            }
                        } else if (dStr === todayStr && existing.isLocked) {
                            const occRef = db.collection('users').doc(uid).collection('task_occurrences').doc(occId);
                            batch.update(occRef, { isLocked: false });
                            ops++;
                        }
                    }
                });
            } else {
                // Non-daily task occurrence
                const schedDate = task.dueDate || originDate;
                const occId = `${taskId}_${schedDate}`;
                const existing = existingOccs[occId];
                const isPast = schedDate < todayStr;

                if (!existing) {
                    const occRef = db.collection('users').doc(uid).collection('task_occurrences').doc(occId);
                    batch.set(occRef, {
                        occurrenceId: occId,
                        taskId: taskId,
                        userId: uid,
                        title: task.title,
                        priority: task.priority || "medium",
                        repeat: task.repeat || "none",
                        scheduledDate: schedDate,
                        status: task.completed ? "COMPLETED" : (isPast ? "NOT_COMPLETED" : "PENDING"),
                        completed: !!task.completed,
                        isLocked: isPast,
                        completedAt: task.completed ? (task.completedAt || null) : null,
                        timeSpent: task.timeSpent || null,
                        createdAt: task.createdAt || firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                    ops++;
                } else if (isPast && (!existing.isLocked || existing.status === 'PENDING')) {
                    const occRef = db.collection('users').doc(uid).collection('task_occurrences').doc(occId);
                    batch.update(occRef, {
                        status: existing.status === 'COMPLETED' ? 'COMPLETED' : 'NOT_COMPLETED',
                        completed: existing.status === 'COMPLETED',
                        isLocked: true
                    });
                    ops++;
                }
            }
        });

        if (ops > 0) {
            await batch.commit();
            console.log(`Reconciled and locked ${ops} task occurrences.`);
        }
    } catch (err) {
        console.error("Error during task reconciliation:", err);
    }
}

// Master Task Loader with Real-time Occurrences Listener
async function loadTasks() {
    if (!currentUser) return;

    // 1. Reconcile safe date transitions
    await reconcileDailyTasks(currentUser);

    // 2. Real-time subscription to occurrences
    if (unsubscribeOccurrences) unsubscribeOccurrences();
    unsubscribeOccurrences = db.collection('users').doc(currentUser.uid).collection('task_occurrences')
        .orderBy('scheduledDate', 'desc')
        .onSnapshot(async occSnapshot => {
            allOccurrences = [];
            occurrencesMap = {};
            occSnapshot.forEach(doc => {
                const occ = { id: doc.id, ...doc.data() };
                allOccurrences.push(occ);
                occurrencesMap[doc.id] = occ;
            });

            // Also load master task definitions
            try {
                const tasksSnap = await db.collection('users').doc(currentUser.uid).collection('tasks').get();
                allMasterTasks = [];
                tasksSnap.forEach(d => allMasterTasks.push({ id: d.id, ...d.data() }));
            } catch (e) {
                console.warn("Could not fetch master tasks:", e);
            }

            renderAppView(allOccurrences, allMasterTasks);
        }, error => {
            console.error("Error listening to task_occurrences:", error);
        });
}

function renderAppView(occurrences, masterTasks) {
    const todayStr = getLocalDateString();
    const yesterdayStr = getYesterdayDateString();

    // Categorize occurrences
    const todayPending = occurrences.filter(o => o.scheduledDate === todayStr && o.status === 'PENDING');
    const todayDone = occurrences.filter(o => o.scheduledDate === todayStr && o.status === 'COMPLETED');
    const yesterdayDone = occurrences.filter(o => o.scheduledDate === yesterdayStr && o.status === 'COMPLETED');
    const yesterdayMissed = occurrences.filter(o => o.scheduledDate === yesterdayStr && o.status === 'NOT_COMPLETED');

    const allMissed = occurrences.filter(o => o.scheduledDate < todayStr && o.status === 'NOT_COMPLETED');
    const allDone = occurrences.filter(o => o.status === 'COMPLETED');

    // Update Dashboard
    if (document.getElementById('total-count') || document.getElementById('today-pending-list')) {
        renderDashboard(todayPending, todayDone, yesterdayDone, yesterdayMissed);
    }

    // Update Tasks Page
    if (document.getElementById('tasks-list')) {
        renderTasksPage(occurrences, masterTasks, todayPending, todayDone, allMissed, allDone);
    }
}

// ── DASHBOARD RENDERER (4 DATE-WISE SECTIONS) ──
function renderDashboard(todayPending, todayDone, yesterdayDone, yesterdayMissed) {
    // 1. Stats Row (Strictly Today)
    const todayTotal = todayPending.length + todayDone.length;
    const todayDoneCount = todayDone.length;
    const todayPendingCount = todayPending.length;
    const rate = todayTotal > 0 ? Math.round((todayDoneCount / todayTotal) * 100) : 0;

    const totalCountEl = document.getElementById('total-count');
    const pendingCountEl = document.getElementById('pending-count');
    const doneCountEl = document.getElementById('done-count');
    const rateEl = document.getElementById('completion-rate');
    const ringEl = document.getElementById('completion-ring');

    if (totalCountEl) totalCountEl.innerText = todayTotal;
    if (pendingCountEl) pendingCountEl.innerText = todayPendingCount;
    if (doneCountEl) doneCountEl.innerText = todayDoneCount;
    if (rateEl) rateEl.innerText = rate + '%';
    if (ringEl) {
        const circumference = 2 * Math.PI * 20;
        const offset = circumference - (rate / 100) * circumference;
        ringEl.style.strokeDasharray = circumference;
        ringEl.style.strokeDashoffset = offset;
    }

    // Badges on headers
    const todayPendingBadge = document.getElementById('today-pending-count-badge');
    const todayDoneBadge = document.getElementById('today-done-count');
    const yesterdayDoneBadge = document.getElementById('yesterday-done-count');
    const yesterdayMissedBadge = document.getElementById('yesterday-missed-count');

    if (todayPendingBadge) todayPendingBadge.innerText = todayPendingCount;
    if (todayDoneBadge) todayDoneBadge.innerText = todayDoneCount;
    if (yesterdayDoneBadge) yesterdayDoneBadge.innerText = yesterdayDone.length;
    if (yesterdayMissedBadge) yesterdayMissedBadge.innerText = yesterdayMissed.length;

    // Helper to build list items
    const buildOccurrenceItem = (occ, isLocked = false, isMissed = false) => {
        const item = document.createElement('li');
        item.className = `history-task-item ${isLocked ? 'locked-item' : ''} ${isMissed ? 'missed-border' : (isLocked ? 'done-border' : '')}`;
        item.dataset.id = occ.occurrenceId;

        const timeSpentBadge = occ.timeSpent ? `<span class="task-spent-tag"><span class="material-symbols-rounded" style="font-size:12px;">timer</span> ${occ.timeSpent}</span>` : '';
        const dailyBadge = occ.repeat === 'daily' ? `<span class="task-badge-pill pill-daily"><span class="material-symbols-rounded" style="font-size:12px;">repeat</span> Daily</span>` : '';
        const dateBadge = `<span class="task-date-pill"><span class="material-symbols-rounded" style="font-size:13px;">calendar_today</span> ${occ.scheduledDate}</span>`;

        let leftIconHtml = '';
        if (isLocked) {
            if (isMissed) {
                leftIconHtml = `<div class="locked-icon-box missed" title="Locked: Missed yesterday"><span class="material-symbols-rounded">close</span></div>`;
            } else {
                leftIconHtml = `<div class="locked-icon-box done" title="Locked: Completed yesterday"><span class="material-symbols-rounded">check</span></div>`;
            }
        } else {
            leftIconHtml = `
                <div class="checkbox-wrapper ${occ.completed ? 'checked' : ''}" onclick="toggleTaskStatus('${occ.occurrenceId}', ${occ.completed})" title="Toggle complete">
                    ${occ.completed ? '<span class="material-symbols-rounded" style="font-size:15px; color:white;">check</span>' : ''}
                </div>
            `;
        }

        let rightActionsHtml = '';
        if (!isLocked) {
            if (!occ.completed) {
                rightActionsHtml += `
                    <div class="task-timer-area" id="timer-area-${occ.occurrenceId}">
                        <span class="material-symbols-rounded timer-icon" style="font-size:14px;">schedule</span>
                        <span class="task-timer-display" id="timer-disp-${occ.occurrenceId}">00:00</span>
                        <button class="btn-task-timer" id="timer-btn-${occ.occurrenceId}" onclick="toggleTaskTimer('${occ.occurrenceId}')" title="Start timer">
                            <span class="material-symbols-rounded">play_arrow</span>
                            <span>Start</span>
                        </button>
                    </div>
                `;
            }
            rightActionsHtml += `
                <button class="history-delete-btn" onclick="deleteTask('${occ.occurrenceId}')" title="Delete task">
                    <span class="material-symbols-rounded">delete</span>
                </button>
            `;
        } else {
            rightActionsHtml = `<span class="pill-locked"><span class="material-symbols-rounded" style="font-size:12px;">lock</span> Locked</span>`;
        }

        item.innerHTML = `
            <div class="history-task-left">
                ${leftIconHtml}
                <div class="history-task-info">
                    <span class="history-title" style="${occ.completed ? 'text-decoration: line-through; opacity: 0.6;' : (isMissed ? 'color:#ff7675;' : '')}">${occ.title}</span>
                    <div style="display:flex; align-items:center; gap:6px; margin-top:2px; flex-wrap:wrap;">
                        ${dateBadge}
                        ${dailyBadge}
                        ${isMissed ? '<span class="pill-missed">Missed</span>' : ''}
                        ${timeSpentBadge}
                    </div>
                </div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                ${rightActionsHtml}
            </div>
        `;
        return item;
    };

    // Render D. Today's Pending List
    const todayPendingList = document.getElementById('today-pending-list');
    if (todayPendingList) {
        todayPendingList.innerHTML = '';
        if (todayPending.length === 0) {
            todayPendingList.innerHTML = `<li class="history-empty"><span class="material-symbols-rounded">task_alt</span><span>All tasks completed today! ✨</span></li>`;
        } else {
            todayPending.forEach(occ => {
                todayPendingList.appendChild(buildOccurrenceItem(occ, false, false));
                if (localStorage.getItem('task_timer_' + occ.occurrenceId)) {
                    startOrResumeTaskTimer(occ.occurrenceId);
                }
            });
        }
    }

    // Render C. Today's Completed List
    const todayCompletedList = document.getElementById('today-completed-list');
    if (todayCompletedList) {
        todayCompletedList.innerHTML = '';
        if (todayDone.length === 0) {
            todayCompletedList.innerHTML = `<li class="history-empty"><span class="material-symbols-rounded">schedule</span><span>No tasks completed today yet</span></li>`;
        } else {
            todayDone.forEach(occ => todayCompletedList.appendChild(buildOccurrenceItem(occ, false, false)));
        }
    }

    // Render A. Yesterday's Completed List (Locked)
    const yesterdayCompletedList = document.getElementById('yesterday-completed-list');
    if (yesterdayCompletedList) {
        yesterdayCompletedList.innerHTML = '';
        if (yesterdayDone.length === 0) {
            yesterdayCompletedList.innerHTML = `<li class="history-empty"><span class="material-symbols-rounded">history</span><span>No tasks completed yesterday</span></li>`;
        } else {
            yesterdayDone.forEach(occ => yesterdayCompletedList.appendChild(buildOccurrenceItem(occ, true, false)));
        }
    }

    // Render B. Yesterday's Not Completed List (Locked, Red Indicator)
    const yesterdayMissedList = document.getElementById('yesterday-missed-list');
    if (yesterdayMissedList) {
        yesterdayMissedList.innerHTML = '';
        if (yesterdayMissed.length === 0) {
            yesterdayMissedList.innerHTML = `<li class="history-empty"><span class="material-symbols-rounded">verified</span><span>No missed tasks yesterday! Great job 🎉</span></li>`;
        } else {
            yesterdayMissed.forEach(occ => yesterdayMissedList.appendChild(buildOccurrenceItem(occ, true, true)));
        }
    }
}

// ── TASKS PAGE RENDERER (TAB-BASED SECTIONS & FILTERS) ──
function renderTasksPage(occurrences, masterTasks, todayPending = [], todayDone = [], allMissed = [], allDone = []) {
    const taskList = document.getElementById('tasks-list');
    if (!taskList) return;
    taskList.innerHTML = '';

    const todayStr = getLocalDateString();
    const yesterdayStr = getYesterdayDateString();

    // 1. Unfiltered sets for total tab badge counts
    const rawToday = occurrences.filter(o => o.scheduledDate === todayStr);
    const rawMissed = occurrences.filter(o => o.scheduledDate < todayStr && o.status === 'NOT_COMPLETED');
    const rawDone = occurrences.filter(o => o.status === 'COMPLETED');
    const rawUpcoming = occurrences.filter(o => o.scheduledDate > todayStr && o.status === 'PENDING');
    const rawRecurring = masterTasks.filter(t => t.repeat === 'daily' || t.repeat === 'weekly' || t.repeat === 'monthly');

    const todayBadge = document.getElementById('tab-today-badge');
    const missedBadge = document.getElementById('tab-missed-badge');
    const doneBadge = document.getElementById('tab-done-badge');
    const recurringBadge = document.getElementById('tab-recurring-badge');
    const upcomingBadge = document.getElementById('tab-upcoming-badge');

    if (todayBadge) todayBadge.innerText = rawToday.length;
    if (missedBadge) missedBadge.innerText = rawMissed.length;
    if (doneBadge) doneBadge.innerText = rawDone.length;
    if (recurringBadge) recurringBadge.innerText = rawRecurring.length;
    if (upcomingBadge) upcomingBadge.innerText = rawUpcoming.length;

    // 2. Apply active filters (Priority, Category, Search Query)
    const matchesFilter = (item) => {
        if (taskFilterPriority !== 'all' && (item.priority || 'medium') !== taskFilterPriority) return false;
        if (taskFilterCategory !== 'all' && (item.category || 'general') !== taskFilterCategory) return false;
        if (taskSearchQuery) {
            const haystack = ((item.title || '') + ' ' + (item.description || '') + ' ' + (item.category || '')).toLowerCase();
            if (!haystack.includes(taskSearchQuery)) return false;
        }
        return true;
    };

    const filteredOccurrences = occurrences.filter(matchesFilter);
    const filteredMaster = masterTasks.filter(matchesFilter);

    const todayOccurrences = filteredOccurrences.filter(o => o.scheduledDate === todayStr);
    const missedOccurrences = filteredOccurrences.filter(o => o.scheduledDate < todayStr && o.status === 'NOT_COMPLETED');
    const doneOccurrences = filteredOccurrences.filter(o => o.status === 'COMPLETED');
    const upcomingOccurrences = filteredOccurrences.filter(o => o.scheduledDate > todayStr && o.status === 'PENDING').sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
    const recurringTasks = filteredMaster.filter(t => t.repeat === 'daily' || t.repeat === 'weekly' || t.repeat === 'monthly');
    const historyOccurrences = filteredOccurrences.filter(o => o.scheduledDate < todayStr).sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));

    // Helper to render task occurrence card
    const renderOccurrenceCard = (occ, container) => {
        const isLocked = occ.isLocked || occ.scheduledDate < todayStr;
        const isMissed = occ.status === 'NOT_COMPLETED' && isLocked;
        const isToday = occ.scheduledDate === todayStr;
        const isCompleted = occ.status === 'COMPLETED';

        const card = document.createElement('div');
        card.className = `glass-panel task-item ${isMissed ? 'not-complete-item' : ''} ${isLocked ? 'locked-item' : ''} ${isCompleted ? 'completed-item' : ''}`;

        const timeSpentBadge = occ.timeSpent ? `<span class="task-spent-tag"><span class="material-symbols-rounded" style="font-size:12px;">timer</span> ${occ.timeSpent}</span>` : '';
        const dailyBadge = occ.repeat && occ.repeat !== 'none' ? `<span class="task-badge-pill pill-daily"><span class="material-symbols-rounded" style="font-size:12px;">repeat</span> ${occ.repeat}</span>` : '';
        const overdueBadge = isMissed ? `<span class="task-badge-pill pill-overdue"><span class="material-symbols-rounded" style="font-size:12px;">warning</span> Missed</span>` : '';
        const priorityColors = { high: '#ff7675', medium: '#fdcb6e', low: '#a29bfe' };
        const priorityDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${priorityColors[occ.priority] || priorityColors.medium};"></span>`;
        const dateText = isToday ? `${occ.scheduledDate} (Today)` : occ.scheduledDate;
        const catIcons = { study: '📚', health: '💊', work: '💼', personal: '🏠', fitness: '🏋️', interview: '🎤', general: '📋' };
        const catIcon = occ.category ? (catIcons[occ.category] || '📋') : '';
        const durationBadge = occ.duration ? `<span class="task-spent-tag">⏳ ${occ.duration}m</span>` : '';
        const timeBadge = occ.taskTime ? `<span class="task-spent-tag">⏰ ${occ.taskTime}</span>` : '';

        let leftActionHtml = '';
        if (isLocked) {
            if (isMissed) {
                leftActionHtml = `<div class="locked-icon-box missed" title="Locked: Missed task cannot be completed"><span class="material-symbols-rounded">close</span></div>`;
            } else {
                leftActionHtml = `<div class="locked-icon-box done" title="Locked: Completed historical task"><span class="material-symbols-rounded">check</span></div>`;
            }
        } else {
            leftActionHtml = `
                <div class="checkbox-wrapper ${isCompleted ? 'checked' : ''}" onclick="toggleTaskStatus('${occ.occurrenceId}', ${isCompleted})" style="cursor: pointer;" title="Toggle complete">
                    ${isCompleted ? '<span class="material-symbols-rounded" style="font-size: 16px; color: white;">check</span>' : ''}
                </div>
            `;
        }

        let rightMetaHtml = '';
        if (!isLocked) {
            if (!isCompleted) {
                rightMetaHtml += `
                    <div class="task-timer-area" id="timer-area-${occ.occurrenceId}">
                        <span class="material-symbols-rounded timer-icon" style="font-size:15px;">schedule</span>
                        <span class="task-timer-display" id="timer-disp-${occ.occurrenceId}">00:00</span>
                        <button class="btn-task-timer" id="timer-btn-${occ.occurrenceId}" onclick="toggleTaskTimer('${occ.occurrenceId}')" title="Start timer">
                            <span class="material-symbols-rounded">play_arrow</span>
                            <span>Start</span>
                        </button>
                    </div>
                `;
            }
            rightMetaHtml += `
                <button class="btn-icon-small" onclick="editTask('${occ.occurrenceId}')" title="Edit task" style="color:var(--primary);">
                    <span class="material-symbols-rounded">edit</span>
                </button>
                <button class="btn-icon-small" onclick="viewTaskDetail('${occ.occurrenceId}')" title="View details" style="color:var(--secondary);">
                    <span class="material-symbols-rounded">info</span>
                </button>
                <button class="delete-btn" onclick="deleteTask('${occ.occurrenceId}')" title="Delete task">
                    <span class="material-symbols-rounded">delete</span>
                </button>
            `;
        } else {
            rightMetaHtml = `<span class="pill-locked" style="font-size:0.75rem;"><span class="material-symbols-rounded" style="font-size:13px;">lock</span> Locked</span>`;
        }

        card.innerHTML = `
            <div class="task-left" style="flex:1;min-width:0;">
                ${leftActionHtml}
                <div class="task-content" style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                        ${catIcon ? `<span style="font-size:14px;">${catIcon}</span>` : ''}
                        <h4 style="${isCompleted ? 'text-decoration: line-through; opacity: 0.55;' : (isMissed ? 'color:#ff7675;' : '')}">${occ.title}</h4>
                        ${priorityDot}
                    </div>
                    ${occ.description ? `<p style="font-size:0.8rem;color:var(--text-muted);margin:3px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:300px;">${occ.description}</p>` : ''}
                    <div class="task-subtext" style="display: flex; gap: 6px; align-items: center; font-size: 0.8rem; margin-top: 4px; flex-wrap: wrap;">
                        <span class="task-date-pill"><span class="material-symbols-rounded" style="font-size:14px;">calendar_today</span> ${dateText}</span>
                        ${timeBadge}
                        ${dailyBadge}
                        ${overdueBadge}
                        ${durationBadge}
                        ${timeSpentBadge}
                    </div>
                </div>
            </div>
            <div class="task-meta" style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                ${rightMetaHtml}
            </div>
        `;
        container.appendChild(card);

        if (!isLocked && !isCompleted && localStorage.getItem('task_timer_' + occ.occurrenceId)) {
            startOrResumeTaskTimer(occ.occurrenceId);
        }
    };

    const renderHeader = (title, count, icon, colorClass = '') => {
        const header = document.createElement('div');
        header.className = `task-group-header ${colorClass}`;
        header.innerHTML = `
            <div class="task-group-title">
                <span class="material-symbols-rounded">${icon}</span>
                <span>${title}</span>
            </div>
            <span class="task-group-count">${count}</span>
        `;
        taskList.appendChild(header);
    };

    // Render by active tab
    if (activeTab === 'today') {
        renderHeader("Today's Tasks", todayOccurrences.length, 'today', 'today-group');
        if (todayOccurrences.length === 0) {
            taskList.innerHTML += `<div class="empty-state"><p>No tasks scheduled for today. Click "+ New Task" above!</p></div>`;
        } else {
            todayOccurrences.forEach(o => renderOccurrenceCard(o, taskList));
        }
    } else if (activeTab === 'not-complete') {
        renderHeader("Not Completed Tasks (Locked History)", missedOccurrences.length, 'warning', 'not-complete');
        if (missedOccurrences.length === 0) {
            taskList.innerHTML += `<div class="empty-state"><p>No missed tasks! You are completely on track.</p></div>`;
        } else {
            missedOccurrences.forEach(o => renderOccurrenceCard(o, taskList));
        }
    } else if (activeTab === 'upcoming') {
        renderHeader("Upcoming Tasks", upcomingOccurrences.length, 'event_upcoming', 'today-group');
        if (upcomingOccurrences.length === 0) {
            taskList.innerHTML += `<div class="empty-state"><p>No upcoming tasks scheduled.</p></div>`;
        } else {
            upcomingOccurrences.forEach(o => renderOccurrenceCard(o, taskList));
        }
    } else if (activeTab === 'completed') {
        renderHeader("Completed Tasks", doneOccurrences.length, 'task_alt', 'completed-group');
        if (doneOccurrences.length === 0) {
            taskList.innerHTML += `<div class="empty-state"><p>No completed tasks yet.</p></div>`;
        } else {
            doneOccurrences.forEach(o => renderOccurrenceCard(o, taskList));
        }
    } else if (activeTab === 'recurring') {
        renderHeader("Recurring Master Tasks", recurringTasks.length, 'repeat', 'today-group');
        if (recurringTasks.length === 0) {
            taskList.innerHTML += `<div class="empty-state"><p>No recurring tasks defined. Create a task with Repeat: Daily.</p></div>`;
        } else {
            recurringTasks.forEach(t => {
                const card = document.createElement('div');
                card.className = 'glass-panel task-item';
                const catIcons = { study: '📚', health: '💊', work: '💼', personal: '🏠', fitness: '🏋️', interview: '🎤', general: '📋' };
                const catIcon = catIcons[t.category] || '📋';
                const priorityColors = { high: '#ff7675', medium: '#fdcb6e', low: '#a29bfe' };

                card.innerHTML = `
                    <div class="task-left" style="flex:1;min-width:0;">
                        <div class="locked-icon-box" style="background: rgba(108, 92, 231, 0.2); color: #a29bfe;">
                            <span class="material-symbols-rounded">repeat</span>
                        </div>
                        <div class="task-content" style="flex:1;min-width:0;">
                            <div style="display:flex;align-items:center;gap:6px;">
                                <span style="font-size:14px;">${catIcon}</span>
                                <h4>${t.title}</h4>
                                <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${priorityColors[t.priority] || '#fdcb6e'};"></span>
                            </div>
                            ${t.description ? `<p style="font-size:0.8rem;color:var(--text-muted);margin:3px 0;">${t.description}</p>` : ''}
                            <div class="task-subtext" style="display:flex; gap:8px; align-items:center; font-size:0.8rem; margin-top:4px; flex-wrap:wrap;">
                                <span class="task-badge-pill pill-daily"><span class="material-symbols-rounded">repeat</span> Recurrence: ${t.repeat}</span>
                                <span><span class="material-symbols-rounded" style="font-size:14px; vertical-align:middle;">calendar_today</span> Started: ${t.dueDate || 'Today'}</span>
                                ${t.duration ? `<span class="task-spent-tag">⏳ ${t.duration}m</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="task-meta">
                        <button class="delete-btn" onclick="deleteMasterTask('${t.id}')" title="Delete recurring task template">
                            <span class="material-symbols-rounded">delete</span>
                        </button>
                    </div>
                `;
                taskList.appendChild(card);
            });
        }
    } else if (activeTab === 'history') {
        renderHeader("Historical Task Log (Read-Only)", historyOccurrences.length, 'history');
        if (historyOccurrences.length === 0) {
            taskList.innerHTML += `<div class="empty-state"><p>No historical task records yet.</p></div>`;
        } else {
            historyOccurrences.forEach(o => renderOccurrenceCard(o, taskList));
        }
    } else {
        // Tab 'all' -> Render grouped sections
        if (todayOccurrences.length > 0) {
            renderHeader("Today's Tasks", todayOccurrences.length, 'today', 'today-group');
            todayOccurrences.forEach(o => renderOccurrenceCard(o, taskList));
        }
        if (missedOccurrences.length > 0) {
            renderHeader("Not Completed Tasks (Locked)", missedOccurrences.length, 'warning', 'not-complete');
            missedOccurrences.forEach(o => renderOccurrenceCard(o, taskList));
        }
        if (upcomingOccurrences.length > 0) {
            renderHeader("Upcoming Tasks", upcomingOccurrences.length, 'event_upcoming', 'today-group');
            upcomingOccurrences.forEach(o => renderOccurrenceCard(o, taskList));
        }
        if (doneOccurrences.length > 0) {
            renderHeader("Completed Tasks", doneOccurrences.length, 'task_alt', 'completed-group');
            doneOccurrences.forEach(o => renderOccurrenceCard(o, taskList));
        }
        if (todayOccurrences.length === 0 && missedOccurrences.length === 0 && upcomingOccurrences.length === 0 && doneOccurrences.length === 0) {
            const hasFilters = taskFilterPriority !== 'all' || taskFilterCategory !== 'all' || taskSearchQuery;
            taskList.innerHTML = `<div class="empty-state"><p>${hasFilters ? 'No tasks match your filter criteria. Try resetting filters.' : 'No tasks found. Click "+ New Task" above to get started!'}</p></div>`;
        }
    }
}

// Interactive Task Status Toggle (Protected against locked historical tasks)
window.toggleTaskStatus = async (occurrenceId, currentStatus) => {
    if (!currentUser) return;
    const occ = occurrencesMap[occurrenceId];

    if (occ && occ.isLocked) {
        alert("This historical task is locked and cannot be modified.");
        return;
    }

    const newCompleted = !currentStatus;
    const newStatus = newCompleted ? 'COMPLETED' : 'PENDING';
    const updates = {
        status: newStatus,
        completed: newCompleted,
        completedAt: newCompleted ? firebase.firestore.FieldValue.serverTimestamp() : null
    };

    // If timer was running for this occurrence, stop it and record timeSpent
    const raw = localStorage.getItem('task_timer_' + occurrenceId);
    if (raw && newCompleted) {
        const startTime = parseInt(raw, 10) || Date.now();
        const elapsedSec = Math.max(1, Math.floor((Date.now() - startTime) / 1000));
        updates.timeSpent = formatDuration(elapsedSec);

        if (activeTaskTimers[occurrenceId] && activeTaskTimers[occurrenceId].interval) {
            clearInterval(activeTaskTimers[occurrenceId].interval);
            delete activeTaskTimers[occurrenceId];
        }
        localStorage.removeItem('task_timer_' + occurrenceId);
    }

    try {
        await db.collection('users').doc(currentUser.uid).collection('task_occurrences').doc(occurrenceId).update(updates);

        // Also sync master task
        if (occ && occ.taskId) {
            db.collection('users').doc(currentUser.uid).collection('tasks').doc(occ.taskId).update({
                completed: newCompleted,
                completedAt: newCompleted ? firebase.firestore.FieldValue.serverTimestamp() : null
            }).catch(() => {});
        }
    } catch (err) {
        console.error("Error updating occurrence status:", err);
    }
};

// Task Timer Toggle
window.toggleTaskTimer = async (occurrenceId) => {
    const occ = occurrencesMap[occurrenceId];
    if (occ && occ.isLocked) {
        alert("Locked historical tasks cannot run a timer.");
        return;
    }

    const raw = localStorage.getItem('task_timer_' + occurrenceId);
    if (raw) {
        // Stop timer & complete occurrence
        const startTime = parseInt(raw, 10) || Date.now();
        const elapsedSec = Math.max(1, Math.floor((Date.now() - startTime) / 1000));
        const timeSpentStr = formatDuration(elapsedSec);

        if (activeTaskTimers[occurrenceId] && activeTaskTimers[occurrenceId].interval) {
            clearInterval(activeTaskTimers[occurrenceId].interval);
            delete activeTaskTimers[occurrenceId];
        }
        localStorage.removeItem('task_timer_' + occurrenceId);

        if (!currentUser) return;

        try {
            await db.collection('users').doc(currentUser.uid).collection('task_occurrences').doc(occurrenceId).update({
                status: 'COMPLETED',
                completed: true,
                timeSpent: timeSpentStr,
                completedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            if (occ && occ.taskId) {
                db.collection('users').doc(currentUser.uid).collection('tasks').doc(occ.taskId).update({
                    completed: true,
                    timeSpent: timeSpentStr,
                    completedAt: firebase.firestore.FieldValue.serverTimestamp()
                }).catch(() => {});
            }
        } catch (e) {
            console.error("Error completing task from timer:", e);
        }
    } else {
        // Start timer
        localStorage.setItem('task_timer_' + occurrenceId, String(Date.now()));
        startOrResumeTaskTimer(occurrenceId);
    }
};

function startOrResumeTaskTimer(occurrenceId) {
    const raw = localStorage.getItem('task_timer_' + occurrenceId);
    if (!raw) return;
    const startTime = parseInt(raw, 10);
    if (isNaN(startTime)) return;

    if (activeTaskTimers[occurrenceId] && activeTaskTimers[occurrenceId].interval) {
        clearInterval(activeTaskTimers[occurrenceId].interval);
    }

    const updateDisplay = () => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const disp = document.getElementById(`timer-disp-${occurrenceId}`);
        const btn = document.getElementById(`timer-btn-${occurrenceId}`);
        const box = document.getElementById(`timer-area-${occurrenceId}`);
        if (disp) disp.innerText = formatTimerDigits(elapsed);
        if (btn) {
            btn.classList.add('running');
            btn.innerHTML = '<span class="material-symbols-rounded">stop_circle</span><span>Complete</span>';
            btn.title = "Task completed! Stop timer & mark as complete";
        }
        if (box) box.classList.add('running');
    };

    updateDisplay();
    activeTaskTimers[occurrenceId] = {
        startTime,
        interval: setInterval(updateDisplay, 1000)
    };
}

// Delete occurrence
window.deleteTask = async (occurrenceId) => {
    if (!currentUser) return;
    const occ = occurrencesMap[occurrenceId];
    if (occ && occ.isLocked) {
        alert("Locked historical records cannot be deleted.");
        return;
    }

    if (confirm('Delete this task occurrence?')) {
        localStorage.removeItem('task_timer_' + occurrenceId);
        if (activeTaskTimers[occurrenceId]) {
            clearInterval(activeTaskTimers[occurrenceId].interval);
            delete activeTaskTimers[occurrenceId];
        }

        try {
            await db.collection('users').doc(currentUser.uid).collection('task_occurrences').doc(occurrenceId).delete();
            if (occ && occ.taskId && occ.repeat !== 'daily') {
                db.collection('users').doc(currentUser.uid).collection('tasks').doc(occ.taskId).delete().catch(() => {});
            }
        } catch (err) {
            console.error("Error deleting occurrence:", err);
        }
    }
};

// Delete master recurring task
window.deleteMasterTask = async (taskId) => {
    if (!currentUser) return;
    if (confirm('Delete this recurring task template? Future occurrences will stop generating.')) {
        try {
            await db.collection('users').doc(currentUser.uid).collection('tasks').doc(taskId).delete();
            // Also delete the plan mirror
            db.collection('users').doc(currentUser.uid).collection('plans').doc(taskId).delete().catch(() => {});
        } catch (err) {
            console.error("Error deleting recurring task:", err);
        }
    }
};

// Edit a task occurrence (open the unified modal pre-filled)
window.editTask = (occurrenceId) => {
    const occ = occurrencesMap[occurrenceId];
    if (!occ) return;
    if (occ.isLocked) {
        alert("Historical locked tasks cannot be edited.");
        return;
    }
    if (typeof openEditTaskModal === 'function') {
        openEditTaskModal({
            taskId: occ.taskId || occ.id,
            occurrenceId: occ.occurrenceId || occ.id,
            title: occ.title,
            description: occ.description || '',
            scheduledDate: occ.scheduledDate || occ.dueDate,
            taskTime: occ.taskTime || '',
            priority: occ.priority || 'medium',
            category: occ.category || 'general',
            repeat: occ.repeat || 'none',
            duration: occ.duration || ''
        });
    }
};

// View task details in modal
window.viewTaskDetail = (occurrenceId) => {
    const occ = occurrencesMap[occurrenceId];
    if (!occ) return;
    const detailModal = document.getElementById('task-detail-modal');
    const content = document.getElementById('task-detail-content');
    if (!detailModal || !content) return;

    const statusColor = occ.status === 'COMPLETED' ? '#00b894' : occ.status === 'NOT_COMPLETED' ? '#ff7675' : '#a29bfe';
    const categoryIcons = { study: '📚', health: '💊', work: '💼', personal: '🏠', fitness: '🏋️', interview: '🎤', general: '📋' };

    content.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:1.5rem;">
            <div style="font-size:2rem;">${categoryIcons[occ.category] || '📋'}</div>
            <div>
                <h2 style="margin:0;font-size:1.3rem;">${occ.title}</h2>
                <span style="font-size:0.8rem;color:${statusColor};font-weight:600;">${occ.status || 'PENDING'}</span>
            </div>
        </div>
        ${occ.description ? `<p style="color:var(--text-muted);margin-bottom:1rem;line-height:1.6;">${occ.description}</p>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:1rem;">
            <div style="background:rgba(0,0,0,0.2);padding:12px;border-radius:10px;">
                <div style="color:var(--text-muted);font-size:0.75rem;margin-bottom:4px;">📅 DATE</div>
                <div style="font-weight:600;">${occ.scheduledDate || occ.dueDate || '—'}</div>
                ${occ.taskTime ? `<div style="color:var(--text-muted);font-size:0.8rem;">⏰ ${occ.taskTime}</div>` : ''}
            </div>
            <div style="background:rgba(0,0,0,0.2);padding:12px;border-radius:10px;">
                <div style="color:var(--text-muted);font-size:0.75rem;margin-bottom:4px;">🔄 RECURRENCE</div>
                <div style="font-weight:600;">${occ.repeat || 'none'}</div>
            </div>
            <div style="background:rgba(0,0,0,0.2);padding:12px;border-radius:10px;">
                <div style="color:var(--text-muted);font-size:0.75rem;margin-bottom:4px;">⚡ PRIORITY</div>
                <div style="font-weight:600;text-transform:capitalize;">${occ.priority || 'medium'}</div>
            </div>
            <div style="background:rgba(0,0,0,0.2);padding:12px;border-radius:10px;">
                <div style="color:var(--text-muted);font-size:0.75rem;margin-bottom:4px;">⏱ TIME SPENT</div>
                <div style="font-weight:600;">${occ.timeSpent || '—'}</div>
            </div>
        </div>
        ${occ.duration ? `<div style="background:rgba(108,92,231,0.1);padding:10px 14px;border-radius:8px;font-size:0.85rem;color:var(--primary);">⏳ Estimated duration: ${occ.duration} minutes</div>` : ''}
    `;
    detailModal.classList.remove('hidden');
};
