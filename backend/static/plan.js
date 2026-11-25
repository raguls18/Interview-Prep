// Plan Page JavaScript
// Enhanced planning with time segments, monthly calendar, and yearly overview

// State
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let selectedSegment = 'today';
let allPlans = [];
let allGoals = [];

// Helper for local YYYY-MM-DD
function getLocalDateString(date) {
    const d = date || new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// Initialize dates
function initDates() {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dateOptions = { month: 'short', day: 'numeric' };

    const todayDateEl = document.getElementById('today-date');
    const yesterdayDateEl = document.getElementById('yesterday-date');
    const tomorrowDateEl = document.getElementById('tomorrow-date');

    if (todayDateEl) todayDateEl.textContent = today.toLocaleDateString('en-US', dateOptions);
    if (yesterdayDateEl) yesterdayDateEl.textContent = yesterday.toLocaleDateString('en-US', dateOptions);
    if (tomorrowDateEl) tomorrowDateEl.textContent = tomorrow.toLocaleDateString('en-US', dateOptions);

    updateMonthYearDisplay();
    updateYearDisplay();
}

// Update month/year display
function updateMonthYearDisplay() {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    const monthYearEl = document.getElementById('current-month-year');
    if (monthYearEl) monthYearEl.textContent = `${monthNames[currentMonth]} ${currentYear}`;
}

function updateYearDisplay() {
    const yearEl = document.getElementById('current-year');
    if (yearEl) yearEl.textContent = currentYear;
}

// Calendar Generation
function generateCalendar() {
    const calendarGrid = document.getElementById('calendar-grid');
    if (!calendarGrid) return;

    // Clear grid
    calendarGrid.innerHTML = '';

    // Create Weekday Headers
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekdaysEl = document.createElement('div');
    weekdaysEl.className = 'calendar-weekdays';
    weekdaysEl.innerHTML = weekdays.map(d => `<div class="weekday">${d}</div>`).join('');
    calendarGrid.appendChild(weekdaysEl);

    // Create Days Container
    const daysContainer = document.createElement('div');
    daysContainer.className = 'calendar-days';
    calendarGrid.appendChild(daysContainer);

    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const startingDay = firstDay.getDay();
    const totalDays = lastDay.getDate();

    const today = new Date();
    const todayString = today.toDateString();

    const prevMonth = new Date(currentYear, currentMonth, 0);
    const prevMonthDays = prevMonth.getDate();

    // Previous month days
    for (let i = startingDay - 1; i >= 0; i--) {
        const dayEl = createDayElement(prevMonthDays - i, 'other-month');
        daysContainer.appendChild(dayEl);
    }

    // Current month days
    for (let day = 1; day <= totalDays; day++) {
        const thisDate = new Date(currentYear, currentMonth, day);
        const isToday = thisDate.toDateString() === todayString;
        const dayEl = createDayElement(day, isToday ? 'today' : '', thisDate);
        daysContainer.appendChild(dayEl);
    }

    // Next month days
    const remainingDays = 42 - (startingDay + totalDays); // Ensure 6 rows for consistency
    for (let i = 1; i <= remainingDays; i++) {
        const dayEl = createDayElement(i, 'other-month');
        daysContainer.appendChild(dayEl);
    }

    // Update day indicators with tasks
    updateCalendarIndicators();
}

function createDayElement(day, className = '', date = null) {
    const dayEl = document.createElement('div');
    dayEl.className = `calendar-day ${className}`;
    dayEl.innerHTML = `
        <span class="day-number">${day}</span>
        <div class="day-tasks"></div>
    `;

    if (date && className !== 'other-month') {
        const dateStr = getLocalDateString(date);
        dayEl.dataset.date = dateStr;
        dayEl.addEventListener('click', () => {
            document.querySelectorAll('.calendar-day').forEach(d => d.style.borderColor = '');
            dayEl.style.borderColor = 'var(--primary)';
            showCalendarDayModal(dateStr);
        });
    }

    return dayEl;
}

function updateCalendarIndicators() {
    const calendarDays = document.querySelectorAll('.calendar-day[data-date]');

    calendarDays.forEach(dayEl => {
        const dateStr = dayEl.dataset.date;
        const tasksForDay = allPlans.filter(plan => plan.dueDate === dateStr);
        const tasksContainer = dayEl.querySelector('.day-tasks');

        if (tasksForDay.length > 0) {
            const previewTasks = tasksForDay.slice(0, 3);

            tasksContainer.innerHTML = previewTasks.map(t => {
                let colorClass = 'medium';
                if (t.completed) colorClass = 'completed';
                else if (t.priority === 'high') colorClass = 'high';
                else if (t.priority === 'low') colorClass = 'low';

                return `<div class="task-pill ${colorClass}" title="${t.title}" onclick="event.stopPropagation(); viewPlanCalendarTask('${t.id}')">
                    <span class="task-pill-text">${t.title}</span>
                </div>`;
            }).join('');

            if (tasksForDay.length > 3) {
                const moreCount = tasksForDay.length - 3;
                tasksContainer.innerHTML += `<div class="task-pill more-pill" onclick="event.stopPropagation(); showCalendarDayModal('${dateStr}')">+${moreCount} more</div>`;
            }
        } else {
            tasksContainer.innerHTML = '';
        }
    });
}

// Show day details popup / modal when clicking on a calendar cell
window.showCalendarDayModal = (dateStr) => {
    const tasksForDay = allPlans.filter(plan => plan.dueDate === dateStr);
    const detailModal = document.getElementById('task-detail-modal');
    const content = document.getElementById('task-detail-content');
    if (!detailModal || !content) return;

    const todayStr = getLocalDateString();
    const isPast = dateStr < todayStr;
    const isToday = dateStr === todayStr;
    const catIcons = { study: '📚', health: '💊', work: '💼', personal: '🏠', fitness: '🏋️', interview: '🎤', general: '📋' };

    let tasksHtml = '';
    if (tasksForDay.length === 0) {
        tasksHtml = `
            <div style="text-align:center;padding:2rem 1rem;color:var(--text-muted);">
                <span class="material-symbols-rounded" style="font-size:2.5rem;opacity:0.4;">event_busy</span>
                <p style="margin-top:0.5rem;">No tasks scheduled for this date.</p>
            </div>
        `;
    } else {
        tasksHtml = tasksForDay.map(t => {
            const isLocked = t.isLocked || isPast;
            const isMissed = (t.status === 'NOT_COMPLETED' || (!t.completed && isPast)) && isLocked;
            const isCompleted = t.status === 'COMPLETED' || t.completed;
            const priorityColors = { high: '#ff7675', medium: '#fdcb6e', low: '#a29bfe' };

            return `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:rgba(255,255,255,0.03);border-radius:10px;margin-bottom:8px;border-left:3px solid ${priorityColors[t.priority] || '#fdcb6e'};">
                <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
                    <div style="font-size:16px;">${catIcons[t.category] || '📋'}</div>
                    <div style="flex:1;min-width:0;">
                        <h4 style="font-size:0.95rem;margin:0;${isCompleted ? 'text-decoration:line-through;opacity:0.6;' : (isMissed ? 'color:#ff7675;' : '')}">${t.title}</h4>
                        <div style="display:flex;gap:6px;align-items:center;font-size:0.75rem;color:var(--text-muted);margin-top:3px;flex-wrap:wrap;">
                            ${t.taskTime ? `<span>⏰ ${t.taskTime}</span>` : ''}
                            ${t.repeat && t.repeat !== 'none' ? `<span class="task-badge-pill pill-daily"><span class="material-symbols-rounded" style="font-size:11px;">repeat</span> ${t.repeat}</span>` : ''}
                            ${t.duration ? `<span>⏳ ${t.duration}m</span>` : ''}
                            ${t.timeSpent ? `<span class="task-spent-tag">⏱ ${t.timeSpent}</span>` : ''}
                            ${isMissed ? '<span class="pill-missed">Missed</span>' : ''}
                        </div>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                    ${!isLocked ? `
                        <button class="btn-icon-small" onclick="document.getElementById('task-detail-modal').classList.add('hidden'); editPlanTask('${t.id}');" title="Edit" style="color:var(--primary);">
                            <span class="material-symbols-rounded" style="font-size:16px;">edit</span>
                        </button>
                    ` : '<span class="pill-locked" style="font-size:0.7rem;"><span class="material-symbols-rounded" style="font-size:11px;">lock</span> Locked</span>'}
                </div>
            </div>
            `;
        }).join('');
    }

    content.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem;">
            <div>
                <h2 style="margin:0;font-size:1.3rem;">📅 ${dateStr} ${isToday ? '(Today)' : ''}</h2>
                <p style="color:var(--text-muted);font-size:0.85rem;margin-top:2px;">${tasksForDay.length} task(s) scheduled</p>
            </div>
            <button class="btn-primary" style="padding:6px 14px;font-size:0.85rem;width:auto;" onclick="document.getElementById('task-detail-modal').classList.add('hidden'); openCreateTaskModal('${dateStr}');">
                <span class="material-symbols-rounded" style="font-size:16px;">add</span> Add Task
            </button>
        </div>
        <div style="max-height:350px;overflow-y:auto;">
            ${tasksHtml}
        </div>
    `;

    detailModal.classList.remove('hidden');
};

// View single task detail from calendar pill
window.viewPlanCalendarTask = (id) => {
    const task = allPlans.find(p => p.id === id);
    if (!task) return;
    const detailModal = document.getElementById('task-detail-modal');
    const content = document.getElementById('task-detail-content');
    if (!detailModal || !content) return;

    const isLocked = task.isLocked || (task.scheduledDate && task.scheduledDate < getLocalDateString());
    const isCompleted = task.status === 'COMPLETED' || task.completed;
    const statusColor = isCompleted ? '#00b894' : (task.status === 'NOT_COMPLETED' ? '#ff7675' : '#a29bfe');
    const catIcons = { study: '📚', health: '💊', work: '💼', personal: '🏠', fitness: '🏋️', interview: '🎤', general: '📋' };

    content.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:1.5rem;">
            <div style="font-size:2rem;">${catIcons[task.category] || '📋'}</div>
            <div>
                <h2 style="margin:0;font-size:1.3rem;">${task.title}</h2>
                <span style="font-size:0.8rem;color:${statusColor};font-weight:600;">${task.status || (isCompleted ? 'COMPLETED' : 'PENDING')}</span>
            </div>
        </div>
        ${task.description ? `<p style="color:var(--text-muted);margin-bottom:1rem;line-height:1.6;">${task.description}</p>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:1.25rem;">
            <div style="background:rgba(0,0,0,0.2);padding:12px;border-radius:10px;">
                <div style="color:var(--text-muted);font-size:0.75rem;margin-bottom:4px;">📅 DUE DATE</div>
                <div style="font-weight:600;">${task.dueDate || task.scheduledDate || '—'}</div>
                ${task.taskTime ? `<div style="color:var(--text-muted);font-size:0.8rem;">⏰ ${task.taskTime}</div>` : ''}
            </div>
            <div style="background:rgba(0,0,0,0.2);padding:12px;border-radius:10px;">
                <div style="color:var(--text-muted);font-size:0.75rem;margin-bottom:4px;">🔄 REPEAT</div>
                <div style="font-weight:600;">${task.repeat || 'none'}</div>
            </div>
            <div style="background:rgba(0,0,0,0.2);padding:12px;border-radius:10px;">
                <div style="color:var(--text-muted);font-size:0.75rem;margin-bottom:4px;">⚡ PRIORITY</div>
                <div style="font-weight:600;text-transform:capitalize;">${task.priority || 'medium'}</div>
            </div>
            <div style="background:rgba(0,0,0,0.2);padding:12px;border-radius:10px;">
                <div style="color:var(--text-muted);font-size:0.75rem;margin-bottom:4px;">⏱ TIME SPENT</div>
                <div style="font-weight:600;">${task.timeSpent || '—'}</div>
            </div>
        </div>
        ${task.duration ? `<div style="background:rgba(108,92,231,0.1);padding:10px 14px;border-radius:8px;font-size:0.85rem;color:var(--primary);margin-bottom:1.25rem;">⏳ Estimated duration: ${task.duration} minutes</div>` : ''}
        <div style="display:flex;justify-content:flex-end;gap:10px;">
            ${!isLocked ? `
                <button class="btn-primary" style="width:auto;padding:8px 18px;" onclick="document.getElementById('task-detail-modal').classList.add('hidden'); editPlanTask('${task.id}');">
                    <span class="material-symbols-rounded" style="font-size:16px;">edit</span> Edit Task
                </button>
            ` : '<span class="pill-locked"><span class="material-symbols-rounded" style="font-size:13px;">lock</span> Historical Locked</span>'}
        </div>
    `;

    detailModal.classList.remove('hidden');
};

function showDayTasks(date) {
    const dateStr = getLocalDateString(date);
    const tasksForDay = allPlans.filter(plan => plan.dueDate === dateStr);

    // Update segment panel to show this day's tasks
    const panelTitle = document.getElementById('segment-panel-title');
    if (panelTitle) {
        panelTitle.textContent = date.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric'
        });
    }

    renderSegmentTasks(tasksForDay);
}

// Year Grid Generation
function generateYearGrid() {
    const yearGrid = document.getElementById('year-grid');
    if (!yearGrid) return;

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const today = new Date();
    const currentMonthIndex = today.getMonth();
    const isCurrentYear = currentYear === today.getFullYear();

    yearGrid.innerHTML = '';

    monthNames.forEach((month, index) => {
        const isPast = isCurrentYear && index < currentMonthIndex;
        // Calculate tasks for this month
        const monthTasks = allPlans.filter(plan => {
            if (!plan.dueDate) return false;
            const planDate = new Date(plan.dueDate);
            return planDate.getMonth() === index && planDate.getFullYear() === currentYear;
        });

        const completed = monthTasks.filter(t => t.completed).length;
        const total = monthTasks.length;
        const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

        const monthEl = document.createElement('div');
        monthEl.className = `month-card-v2 ${isPast ? 'past' : ''}`;
        monthEl.innerHTML = `
            <h4>${month}</h4>
            <div class="month-mini-visual">
                ${generateMiniBars(monthTasks)}
            </div>
            <div class="month-stat-text">
                ${completed}/${total} tasks
            </div>
        `;

        monthEl.addEventListener('click', () => {
            currentMonth = index;
            updateMonthYearDisplay();
            document.querySelector('[data-tab="monthly"]').click();
        });

        yearGrid.appendChild(monthEl);
    });
}

function generateMiniBars(tasks) {
    if (tasks.length === 0) return '<div class="mini-bar" style="background:rgba(255,255,255,0.05); height:4px;"></div>';

    // Create a few random bars for visual effect based on task count
    let bars = '';
    const count = Math.min(tasks.length, 10);
    for (let i = 0; i < count; i++) {
        const height = Math.floor(Math.random() * 80) + 20;
        bars += `<div class="mini-bar" style="height:${height}%;"></div>`;
    }
    return bars;
}

// Segment handling
function initSegments() {
    const segmentCards = document.querySelectorAll('.segment-card');

    segmentCards.forEach(card => {
        card.addEventListener('click', () => {
            segmentCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            selectedSegment = card.dataset.segment;
            updateSegmentPanel();
        });
    });
}

function updateSegmentPanel() {
    const panelTitle = document.getElementById('segment-panel-title');
    const titles = {
        'yesterday': "Yesterday's Tasks",
        'today': "Today's Tasks",
        'tomorrow': "Tomorrow's Tasks"
    };

    if (panelTitle) panelTitle.textContent = titles[selectedSegment] || "Tasks";

    // Hide add button for yesterday's tasks
    const addTaskBtn = document.getElementById('add-task-btn-plan');
    if (addTaskBtn) {
        if (selectedSegment === 'yesterday') {
            addTaskBtn.style.display = 'none';
        } else {
            addTaskBtn.style.display = ''; // reset to default (flex/inline-block)
        }
    }

    const tasks = getTasksForSegment(selectedSegment);
    renderSegmentTasks(tasks);
}

function getTasksForSegment(segment) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let targetDate;
    switch (segment) {
        case 'yesterday':
            targetDate = getLocalDateString(yesterday);
            break;
        case 'today':
            targetDate = getLocalDateString(today);
            break;
        case 'tomorrow':
            targetDate = getLocalDateString(tomorrow);
            break;
        default:
            targetDate = getLocalDateString(today);
    }

    return allPlans.filter(plan => plan.dueDate === targetDate);
}

function renderSegmentTasks(tasks) {
    const tasksList = document.getElementById('segment-tasks-list');
    if (!tasksList) return;

    if (tasks.length === 0) {
        tasksList.innerHTML = `
            <div class="empty-segment">
                <span class="material-symbols-rounded">task_alt</span>
                <p>No tasks scheduled</p>
            </div>
        `;
        return;
    }

    const todayStr = getLocalDateString();
    const catIcons = { study: '📚', health: '💊', work: '💼', personal: '🏠', fitness: '🏋️', interview: '🎤', general: '📋' };
    const priorityColors = { high: '#ff7675', medium: '#fdcb6e', low: '#a29bfe' };

    tasksList.innerHTML = tasks.map(task => {
        const isYesterday = selectedSegment === 'yesterday' || (task.dueDate && task.dueDate < todayStr);
        const isFuture = selectedSegment === 'tomorrow' || (task.dueDate && task.dueDate > todayStr);
        const isLocked = task.isLocked || isYesterday;
        const isMissed = (task.status === 'NOT_COMPLETED' || (!task.completed && isYesterday)) && isLocked;
        const isCompleted = task.status === 'COMPLETED' || task.completed;

        const timeSpentBadge = task.timeSpent ? `<span class="task-spent-tag"><span class="material-symbols-rounded" style="font-size:12px;">timer</span> ${task.timeSpent}</span>` : '';
        const dailyBadge = task.repeat && task.repeat !== 'none' ? `<span class="task-badge-pill pill-daily"><span class="material-symbols-rounded" style="font-size:12px;">repeat</span> ${task.repeat}</span>` : '';
        const overdueBadge = isMissed ? `<span class="task-badge-pill pill-overdue"><span class="material-symbols-rounded" style="font-size:12px;">warning</span> Missed</span>` : '';
        const durationBadge = task.duration ? `<span class="task-spent-tag">⏳ ${task.duration}m</span>` : '';
        const timeBadge = task.taskTime ? `<span class="task-spent-tag">⏰ ${task.taskTime}</span>` : '';
        const catIcon = task.category ? (catIcons[task.category] || '') : '';
        const priorityDot = `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${priorityColors[task.priority] || priorityColors.medium};"></span>`;
        const dateBadge = `<span class="task-date-pill"><span class="material-symbols-rounded" style="font-size:12px;">calendar_today</span> ${task.dueDate || ''}</span>`;

        let leftIconHtml = '';
        if (isLocked) {
            if (isMissed) {
                leftIconHtml = `<div class="locked-icon-box missed" title="Locked: Missed task cannot be completed"><span class="material-symbols-rounded">close</span></div>`;
            } else {
                leftIconHtml = `<div class="locked-icon-box done" title="Locked: Completed historical task"><span class="material-symbols-rounded">check</span></div>`;
            }
        } else {
            const checkboxClick = isFuture ? '' : `onclick="togglePlanStatus('${task.id}', ${isCompleted})"`;
            const checkboxStyle = isFuture ? 'opacity: 0.5; cursor: not-allowed;' : 'cursor: pointer;';
            const checkboxTooltip = isFuture ? 'title="Cannot complete future tasks yet"' : 'title="Toggle complete"';

            leftIconHtml = `
                <div class="task-checkbox ${isCompleted ? 'checked' : ''}" ${checkboxClick} style="${checkboxStyle}" ${checkboxTooltip}>
                    ${isCompleted ? '<span class="material-symbols-rounded">check</span>' : ''}
                </div>
            `;
        }

        let rightActionsHtml = '';
        if (!isLocked) {
            if (!isCompleted && !isFuture) {
                rightActionsHtml += `
                    <div class="task-timer-area" id="timer-area-plan-${task.id}">
                        <span class="material-symbols-rounded timer-icon" style="font-size:14px;">schedule</span>
                        <span class="task-timer-display" id="timer-disp-plan-${task.id}">00:00</span>
                        <button class="btn-task-timer" id="timer-btn-plan-${task.id}" onclick="togglePlanTimer('${task.id}')" title="Start timer">
                            <span class="material-symbols-rounded">play_arrow</span>
                            <span>Start</span>
                        </button>
                    </div>
                `;
            }
            rightActionsHtml += `
                <button class="btn-icon-small" onclick="editPlanTask('${task.id}')" title="Edit task" style="color:var(--primary);">
                    <span class="material-symbols-rounded">edit</span>
                </button>
                <button class="btn-icon-small" onclick="deletePlan('${task.id}')" title="Delete task">
                    <span class="material-symbols-rounded">delete</span>
                </button>
            `;
        } else {
            rightActionsHtml = `<span class="pill-locked"><span class="material-symbols-rounded" style="font-size:12px;">lock</span> Historical</span>`;
        }

        return `
        <div class="segment-task-item ${isCompleted ? 'completed' : ''} ${isMissed ? 'not-complete-item' : ''} ${isLocked ? 'locked-item' : ''}" data-id="${task.id}" style="display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center; gap:0.75rem; flex:1; min-width:0;">
                ${leftIconHtml}
                <div class="task-info" style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
                        ${catIcon ? `<span style="font-size:13px;">${catIcon}</span>` : ''}
                        <h4 style="${isCompleted ? 'text-decoration: line-through; opacity: 0.55;' : (isMissed ? 'color:#ff7675;' : '')}">${task.title}</h4>
                        ${priorityDot}
                    </div>
                    ${task.description ? `<p style="font-size:0.78rem;color:var(--text-muted);margin:2px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${task.description}</p>` : ''}
                    <div style="display: flex; gap: 5px; align-items: center; font-size: 0.75rem; margin-top: 3px; flex-wrap: wrap;">
                        ${dateBadge}
                        ${timeBadge}
                        ${dailyBadge}
                        ${overdueBadge}
                        ${durationBadge}
                        ${timeSpentBadge}
                    </div>
                </div>
            </div>
            <div class="task-actions" style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                ${rightActionsHtml}
            </div>
        </div>
        `;
    }).join('');

    // Resume any active timer
    tasks.forEach(task => {
        if (!task.completed && localStorage.getItem('task_timer_' + task.id)) {
            startOrResumePlanTimer(task.id);
        }
    });
}

function updateSegmentStats() {
    const segments = ['yesterday', 'today', 'tomorrow'];

    segments.forEach(segment => {
        const tasks = getTasksForSegment(segment);
        const total = tasks.length;
        const completed = tasks.filter(t => t.completed).length;
        const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

        const countEl = document.getElementById(`${segment}-count`);
        const progressRing = document.getElementById(`${segment}-progress-ring`);
        const percentEl = document.getElementById(`${segment}-percent`);

        if (countEl) countEl.textContent = total;
        if (progressRing) progressRing.setAttribute('stroke-dasharray', `${progress}, 100`);
        if (percentEl) percentEl.textContent = `${progress}%`;
    });
}

// Quick Stats
function updateQuickStats() {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    // Weekly progress
    const weekTasks = allPlans.filter(plan => {
        if (!plan.dueDate) return false;
        const planDate = new Date(plan.dueDate);
        return planDate >= startOfWeek && planDate < endOfWeek;
    });

    const weekCompleted = weekTasks.filter(t => t.completed).length;
    const weekProgress = weekTasks.length > 0 ? Math.round((weekCompleted / weekTasks.length) * 100) : 0;

    const weekProgressEl = document.getElementById('week-progress');
    if (weekProgressEl) weekProgressEl.textContent = `${weekProgress}%`;

    // Streak (simplified - consecutive days with completed tasks)
    let streak = 0;
    let checkDate = new Date(today);
    checkDate.setHours(0, 0, 0, 0);

    while (true) {
        const dateStr = getLocalDateString(checkDate);
        const dayTasks = allPlans.filter(p => p.dueDate === dateStr);
        const dayCompleted = dayTasks.filter(t => t.completed);

        if (dayCompleted.length > 0) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
        } else {
            break;
        }

        if (streak > 365) break; // Safety limit
    }

    const streakEl = document.getElementById('streak-count');
    if (streakEl) streakEl.textContent = streak;

    // Month completed
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const monthTasks = allPlans.filter(plan => {
        if (!plan.dueDate) return false;
        const planDate = new Date(plan.dueDate);
        return planDate >= startOfMonth && planDate <= endOfMonth;
    });

    const monthCompleted = monthTasks.filter(t => t.completed).length;
    const monthCompletedEl = document.getElementById('month-completed');
    if (monthCompletedEl) monthCompletedEl.textContent = monthCompleted;

    // Upcoming
    const upcomingTasks = allPlans.filter(plan => {
        if (!plan.dueDate || plan.completed) return false;
        const planDate = new Date(plan.dueDate);
        return planDate >= today;
    });

    const upcomingEl = document.getElementById('upcoming-count');
    if (upcomingEl) upcomingEl.textContent = upcomingTasks.length;
}

// Goals Management
function renderGoals() {
    const monthlyGoalsList = document.getElementById('monthly-goals-list');
    const yearlyGoalsList = document.getElementById('yearly-goals-list');

    const monthlyGoals = allGoals.filter(g => g.type === 'monthly');
    const yearlyGoals = allGoals.filter(g => g.type === 'yearly');

    if (monthlyGoalsList) {
        if (monthlyGoals.length === 0) {
            monthlyGoalsList.innerHTML = '<p class="empty-goals">No monthly goals set</p>';
        } else {
            monthlyGoalsList.innerHTML = monthlyGoals.map(goal => createGoalElement(goal)).join('');
        }
    }

    if (yearlyGoalsList) {
        if (yearlyGoals.length === 0) {
            yearlyGoalsList.innerHTML = '<p class="empty-goals">No yearly goals set</p>';
        } else {
            yearlyGoalsList.innerHTML = yearlyGoals.map(goal => createGoalElement(goal)).join('');
        }
    }
}

function createGoalElement(goal) {
    const isYearly = goal.type === 'yearly';

    if (isYearly) {
        // Timeline style for yearly
        return `
        <div class="timeline-item">
            <h5>${goal.title}</h5>
            ${goal.target ? `<p>Progress: ${goal.progress || 0}/${goal.target}</p>` : ''}
            <button class="btn-text" onclick="deleteGoal('${goal.id}')" style="font-size:0.75rem; margin-top:0.25rem;">Remove</button>
        </div>
        `;
    }

    // Card style for monthly
    return `
        <div class="goal-item-card ${goal.completed ? 'completed' : ''}">
            <div class="checkbox-wrapper ${goal.completed ? 'checked' : ''}" style="width:20px; height:20px;" onclick="toggleGoalStatus('${goal.id}', ${goal.completed})">
                ${goal.completed ? '<span class="material-symbols-rounded" style="font-size:14px; color:white;">check</span>' : ''}
            </div>
            <div class="goal-info">
                <h5 style="${goal.completed ? 'text-decoration: line-through; opacity: 0.7;' : ''}">${goal.title}</h5>
            </div>
            <button class="btn-icon-small" onclick="deleteGoal('${goal.id}')">
                <span class="material-symbols-rounded">close</span>
            </button>
        </div>
    `;
}

// Tab Navigation
function initTabNavigation() {
    const tabs = document.querySelectorAll('.plan-tab');
    const sections = {
        'days': document.getElementById('days-section'),
        'monthly': document.getElementById('monthly-section'),
        'yearly': document.getElementById('yearly-section')
    };

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active from all tabs
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Show/hide sections
            const tabName = tab.dataset.tab;
            Object.keys(sections).forEach(key => {
                if (sections[key]) {
                    if (key === tabName) {
                        sections[key].classList.remove('hidden');
                    } else {
                        sections[key].classList.add('hidden');
                    }
                }
            });

            // If monthly tab, generate calendar
            if (tabName === 'monthly') {
                generateCalendar();
            }
            // If yearly tab, generate year grid
            if (tabName === 'yearly') {
                generateYearGrid();
            }
        });
    });
}

// Modal handling
function initModals() {
    // Task Modal (same as Tasks page)
    const addTaskBtn = document.getElementById('add-task-btn-plan');
    const taskModal = document.getElementById('task-modal');
    const closeTaskModal = taskModal?.querySelector('.close-modal');
    const cancelTaskBtn = taskModal?.querySelector('.close-modal-btn');
    const taskForm = document.getElementById('create-task-form');

    // Goal Modal
    const goalModal = document.getElementById('goal-modal');
    const closeGoalModal = document.getElementById('close-goal-modal');
    const cancelGoalBtn = document.getElementById('cancel-goal-btn');
    const goalForm = document.getElementById('goal-form');

    const addMonthlyGoalBtn = document.getElementById('add-monthly-goal');
    const addYearlyGoalBtn = document.getElementById('add-yearly-goal');

    // Task modal events
    if (addTaskBtn && taskModal) {
        addTaskBtn.addEventListener('click', () => {
            const today = new Date();
            if (selectedSegment === 'tomorrow') {
                today.setDate(today.getDate() + 1);
            } else if (selectedSegment === 'yesterday') {
                today.setDate(today.getDate() - 1);
            }
            const dateStr = getLocalDateString(today);

            if (typeof openCreateTaskModal === 'function') {
                openCreateTaskModal(dateStr);
            } else {
                const dateInput = document.getElementById('new-task-date');
                if (dateInput) dateInput.value = dateStr;
                taskModal.classList.remove('hidden');
            }
        });
    }

    if (closeTaskModal) {
        closeTaskModal.addEventListener('click', () => taskModal.classList.add('hidden'));
    }

    if (cancelTaskBtn) {
        cancelTaskBtn.addEventListener('click', () => taskModal.classList.add('hidden'));
    }

    // Goal modal events
    if (addMonthlyGoalBtn && goalModal) {
        addMonthlyGoalBtn.addEventListener('click', () => {
            document.getElementById('goal-type').value = 'monthly';
            goalModal.classList.remove('hidden');
        });
    }

    if (addYearlyGoalBtn && goalModal) {
        addYearlyGoalBtn.addEventListener('click', () => {
            document.getElementById('goal-type').value = 'yearly';
            goalModal.classList.remove('hidden');
        });
    }

    if (closeGoalModal) {
        closeGoalModal.addEventListener('click', () => goalModal.classList.add('hidden'));
    }

    if (cancelGoalBtn) {
        cancelGoalBtn.addEventListener('click', () => goalModal.classList.add('hidden'));
    }

    // Close modal when clicking outside
    if (taskModal) {
        taskModal.addEventListener('click', (e) => {
            if (e.target === taskModal) {
                taskModal.classList.add('hidden');
            }
        });
    }

    if (goalModal) {
        goalModal.addEventListener('click', (e) => {
            if (e.target === goalModal) {
                goalModal.classList.add('hidden');
            }
        });
    }

    // Form submissions
    if (taskForm) {
        taskForm.addEventListener('submit', handleTaskSubmit);
    }

    if (goalForm) {
        goalForm.addEventListener('submit', handleGoalSubmit);
    }
}

function getDateFromTimeframe(timeframe, customDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (timeframe) {
        case 'today':
            return getLocalDateString(today);
        case 'tomorrow':
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            return getLocalDateString(tomorrow);
        case 'this-week':
            const endOfWeek = new Date(today);
            endOfWeek.setDate(today.getDate() + (6 - today.getDay()));
            return getLocalDateString(endOfWeek);
        case 'this-month':
            const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            return getLocalDateString(endOfMonth);
        case 'this-year':
            return `${today.getFullYear()}-12-31`;
        case 'custom':
            return customDate;
        default:
            return getLocalDateString(today);
    }
}

// Check if a timeframe is for daily plans (today, tomorrow, yesterday)
function isDailyPlan(timeframe) {
    return ['today', 'tomorrow', 'yesterday'].includes(timeframe);
}

// Handle Task Submit (unified — same modal as Tasks page)
async function handleTaskSubmit(e) {
    e.preventDefault();

    if (!currentUser) {
        alert('Please wait, logging you in...');
        return;
    }

    const editTaskId = document.getElementById('edit-task-id')?.value?.trim() || '';
    const editOccId  = document.getElementById('edit-occurrence-id')?.value?.trim() || '';
    const isEditMode = !!editTaskId;

    const title       = document.getElementById('new-task-title').value.trim();
    const description = document.getElementById('new-task-description')?.value?.trim() || '';
    const dueDate     = document.getElementById('new-task-date').value;
    const taskTime    = document.getElementById('new-task-time')?.value || '';
    const repeat      = document.getElementById('new-task-repeat')?.value || 'none';
    const priority    = document.getElementById('new-task-priority')?.value || 'medium';
    const category    = document.getElementById('new-task-category')?.value || 'general';
    const duration    = parseInt(document.getElementById('new-task-duration')?.value || '0') || null;

    const submitBtn = document.querySelector('#create-task-form button[type="submit"]');
    const originalHtml = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="material-symbols-rounded" style="font-size:16px;">sync</span> Saving...';

    try {
        const schedDate = dueDate || getLocalDateString();
        const todayStr  = getLocalDateString();

        if (isEditMode) {
            // ── EDIT MODE ──
            const updates = {
                title, description, priority, category, repeat,
                duration: duration || null,
                taskTime: taskTime || null,
                dueDate: schedDate,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            const occUpdates = { ...updates, scheduledDate: schedDate };
            delete occUpdates.dueDate;

            await db.collection('users').doc(currentUser.uid).collection('tasks').doc(editTaskId).update(updates).catch(() => {});
            if (editOccId) {
                await db.collection('users').doc(currentUser.uid).collection('task_occurrences').doc(editOccId).update({...occUpdates, dueDate: schedDate}).catch(() => {});
            }
            await db.collection('users').doc(currentUser.uid).collection('plans').doc(editTaskId).update(updates).catch(() => {});

            // Optimistic local update
            const idx = allPlans.findIndex(p => p.id === editOccId || p.taskId === editTaskId);
            if (idx !== -1) {
                allPlans[idx] = { ...allPlans[idx], title, description, priority, category, repeat, dueDate: schedDate, scheduledDate: schedDate, duration, taskTime };
            }
        } else {
            // ── CREATE MODE ──
            const taskRef = db.collection('users').doc(currentUser.uid).collection('tasks').doc();
            const taskId  = taskRef.id;
            const occId   = `${taskId}_${schedDate}`;

            const newPlan = {
                id: occId,
                occurrenceId: occId,
                taskId,
                title, description, priority, category, repeat,
                duration: duration || null,
                taskTime: taskTime || null,
                dueDate: schedDate,
                scheduledDate: schedDate,
                completed: false,
                status: schedDate < todayStr ? 'NOT_COMPLETED' : 'PENDING',
                isLocked: schedDate < todayStr,
                timeSpent: null,
                source: 'occurrence'
            };

            // Optimistic UI update
            allPlans.unshift(newPlan);
            updateSegmentStats();
            renderSegmentTasks(getTasksForSegment(selectedSegment));
            updateCalendarIndicators();

            // 1. Master task
            taskRef.set({
                title, description, priority, category, repeat,
                duration: duration || null,
                taskTime: taskTime || null,
                dueDate: schedDate,
                completed: false,
                isActive: true,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // 2. Occurrence
            db.collection('users').doc(currentUser.uid).collection('task_occurrences').doc(occId).set({
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

            // 3. Plan mirror (for calendar)
            db.collection('users').doc(currentUser.uid).collection('plans').doc(taskId).set({
                title, description, priority, category, repeat,
                type: 'task',
                duration: duration || null,
                taskTime: taskTime || null,
                dueDate: schedDate,
                completed: false,
                taskId,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        document.getElementById('task-modal').classList.add('hidden');
        document.getElementById('create-task-form').reset();
        updateSegmentStats();
        renderSegmentTasks(getTasksForSegment(selectedSegment));
        updateCalendarIndicators();

    } catch (err) {
        console.error('Error saving task:', err);
        alert('Error saving task: ' + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalHtml;
    }
}

async function handlePlanSubmit(e) {
    e.preventDefault();

    if (!currentUser) {
        alert('Please wait, logging you in...');
        return;
    }

    const title = document.getElementById('plan-title').value;
    const description = document.getElementById('plan-description').value;
    const type = document.getElementById('plan-type').value;
    const timeframe = document.getElementById('plan-timeframe').value;
    const customDate = document.getElementById('plan-custom-date').value;
    const priority = document.querySelector('input[name="plan-priority"]:checked').value;

    const dueDate = getDateFromTimeframe(timeframe, customDate);

    const submitBtn = document.querySelector('#plan-form button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="material-symbols-rounded rotating">sync</span> Saving...';

    try {
        const planRef = db.collection('users').doc(currentUser.uid).collection('plans').doc();
        const planId = planRef.id;

        // Save to plans collection
        await planRef.set({
            title,
            description,
            type,
            dueDate,
            priority,
            completed: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // If it's a daily plan (today/tomorrow), also add to tasks collection
        // so it shows on the Tasks page natively as well.
        if (isDailyPlan(timeframe) || isWithinDays(dueDate, 2)) {
            await db.collection('users').doc(currentUser.uid).collection('tasks').doc(planId).set({
                title,
                description,
                priority,
                dueDate,
                repeat: 'none',
                completed: false,
                source: 'plan', // Mark as coming from plan
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        document.getElementById('plan-modal').classList.add('hidden');
        document.getElementById('plan-form').reset();
    } catch (err) {
        console.error('Error adding plan:', err);
        alert('Error saving plan: ' + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span class="material-symbols-rounded">add</span> Add Plan';
    }
}

// Helper to check if date is within X days from today
function isWithinDays(dateStr, days) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(dateStr);
    const diffTime = targetDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= -1 && diffDays <= days;
}

async function handleGoalSubmit(e) {
    e.preventDefault();

    if (!currentUser) {
        alert('Please wait, logging you in...');
        return;
    }

    const title = document.getElementById('goal-title').value;
    const type = document.getElementById('goal-type').value;
    const target = document.getElementById('goal-target').value;

    const submitBtn = document.querySelector('#goal-form button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="material-symbols-rounded rotating">sync</span> Saving...';

    try {
        // Optimistic UI update
        const newGoal = {
            id: 'temp_' + Date.now(),
            title,
            type,
            target: target ? parseInt(target) : null,
            progress: 0,
            completed: false,
            createdAt: new Date()
        };

        allGoals.unshift(newGoal);
        renderGoals();

        document.getElementById('goal-modal').classList.add('hidden');
        document.getElementById('goal-form').reset();

        // Save to Firestore in background
        db.collection('users').doc(currentUser.uid).collection('goals').add({
            title,
            type,
            target: target ? parseInt(target) : null,
            progress: 0,
            completed: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

    } catch (err) {
        console.error('Error adding goal:', err);
        alert('Error saving goal: ' + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span class="material-symbols-rounded">add</span> Add Goal';
    }
}

// CRUD Operations
window.togglePlanStatus = async (id, currentStatus) => {
    if (!currentUser) return;

    // Guard: locked historical tasks cannot be toggled
    const task = allPlans.find(p => p.id === id);
    if (task && (task.isLocked || (task.scheduledDate && task.scheduledDate < getLocalDateString()))) {
        alert("This historical task is locked and cannot be modified.");
        return;
    }

    try {
        const newCompleted = !currentStatus;
        const newStatus = newCompleted ? 'COMPLETED' : 'PENDING';
        const updates = {
            completed: newCompleted,
            status: newStatus,
            completedAt: newCompleted ? firebase.firestore.FieldValue.serverTimestamp() : null
        };

        // Update occurrence (primary)
        await db.collection('users').doc(currentUser.uid).collection('task_occurrences').doc(id).update(updates).catch(() => {});
        // Update plan mirror
        await db.collection('users').doc(currentUser.uid).collection('plans').doc(id).update({ completed: newCompleted }).catch(() => {});
        // Update master task if we have taskId
        if (task && task.taskId) {
            db.collection('users').doc(currentUser.uid).collection('tasks').doc(task.taskId).update({ completed: newCompleted }).catch(() => {});
        }

        // Optimistic local update
        if (task) {
            task.completed = newCompleted;
            task.status = newStatus;
        }
        updateSegmentStats();
        renderSegmentTasks(getTasksForSegment(selectedSegment));
        updateCalendarIndicators();
    } catch (err) {
        console.error('Error updating plan:', err);
    }
};

window.deletePlan = async (id) => {
    // Guard: locked historical tasks cannot be deleted
    const task = allPlans.find(p => p.id === id);
    if (task && task.isLocked) {
        alert("Locked historical records cannot be deleted.");
        return;
    }

    if (!confirm('Delete this task?')) return;
    if (!currentUser) return;

    try {
        // Delete from task_occurrences
        await db.collection('users').doc(currentUser.uid).collection('task_occurrences').doc(id).delete().catch(() => {});
        // Delete from plans
        await db.collection('users').doc(currentUser.uid).collection('plans').doc(id).delete().catch(() => {});
        // Delete master task if it's not recurring
        if (task && task.taskId && task.repeat === 'none') {
            db.collection('users').doc(currentUser.uid).collection('tasks').doc(task.taskId).delete().catch(() => {});
        }

        // Optimistic local update
        allPlans = allPlans.filter(p => p.id !== id);
        updateSegmentStats();
        renderSegmentTasks(getTasksForSegment(selectedSegment));
        updateCalendarIndicators();
    } catch (err) {
        console.error('Error deleting plan:', err);
    }
};

// Edit a plan task
window.editPlanTask = (id) => {
    const task = allPlans.find(p => p.id === id);
    if (!task) return;
    if (task.isLocked) {
        alert("Historical locked tasks cannot be edited.");
        return;
    }
    if (typeof openEditTaskModal === 'function') {
        openEditTaskModal({
            taskId: task.taskId || task.id,
            occurrenceId: task.occurrenceId || task.id,
            title: task.title,
            description: task.description || '',
            scheduledDate: task.scheduledDate || task.dueDate,
            taskTime: task.taskTime || '',
            priority: task.priority || 'medium',
            category: task.category || 'general',
            repeat: task.repeat || 'none',
            duration: task.duration || ''
        });
    }
};

window.toggleGoalStatus = async (id, currentStatus) => {
    if (!currentUser) return;
    try {
        await db.collection('users').doc(currentUser.uid).collection('goals').doc(id).update({
            completed: !currentStatus
        });
    } catch (err) {
        console.error('Error updating goal:', err);
    }
};

window.deleteGoal = async (id) => {
    if (!confirm('Delete this goal?')) return;
    if (!currentUser) return;

    try {
        await db.collection('users').doc(currentUser.uid).collection('goals').doc(id).delete();
    } catch (err) {
        console.error('Error deleting goal:', err);
    }
};

// Navigation
function initNavigation() {
    const prevMonthBtn = document.getElementById('prev-month');
    const nextMonthBtn = document.getElementById('next-month');
    const prevYearBtn = document.getElementById('prev-year');
    const nextYearBtn = document.getElementById('next-year');

    if (prevMonthBtn) {
        prevMonthBtn.addEventListener('click', () => {
            currentMonth--;
            if (currentMonth < 0) {
                currentMonth = 11;
                currentYear--;
            }
            updateMonthYearDisplay();
            generateCalendar();
        });
    }

    if (nextMonthBtn) {
        nextMonthBtn.addEventListener('click', () => {
            currentMonth++;
            if (currentMonth > 11) {
                currentMonth = 0;
                currentYear++;
            }
            updateMonthYearDisplay();
            generateCalendar();
        });
    }

    if (prevYearBtn) {
        prevYearBtn.addEventListener('click', () => {
            currentYear--;
            updateYearDisplay();
            generateYearGrid();
        });
    }

    if (nextYearBtn) {
        nextYearBtn.addEventListener('click', () => {
            currentYear++;
            updateYearDisplay();
            generateYearGrid();
        });
    }
}

// Firebase listeners
let unsubscribePlans = null;
let unsubscribeGoals = null;
let unsubscribeOccurrences = null;

function loadPlans() {
    if (!currentUser) return;

    // Run daily reconciliation first (same logic as script.js)
    if (typeof reconcileDailyTasks === 'function') {
        reconcileDailyTasks(currentUser).catch(e => console.warn('Reconcile warn:', e));
    }

    if (unsubscribePlans) unsubscribePlans();
    if (unsubscribeOccurrences) unsubscribeOccurrences();

    // Listen to task_occurrences (source of truth for dated tasks)
    let occurrencesData = [];
    let plansData = [];

    const mergePlansAndOccurrences = () => {
        // Merge: occurrences keyed by occurrenceId, plans by their id
        // Build allPlans with unified schema using dueDate = scheduledDate
        const occMap = {};
        occurrencesData.forEach(occ => {
            const key = occ.scheduledDate || occ.dueDate;
            occMap[occ.occurrenceId || occ.id] = {
                id: occ.occurrenceId || occ.id,
                occurrenceId: occ.occurrenceId || occ.id,
                taskId: occ.taskId,
                title: occ.title,
                description: occ.description || '',
                dueDate: occ.scheduledDate || occ.dueDate,
                scheduledDate: occ.scheduledDate || occ.dueDate,
                priority: occ.priority || 'medium',
                category: occ.category || 'general',
                repeat: occ.repeat || 'none',
                completed: occ.status === 'COMPLETED',
                status: occ.status,
                isLocked: occ.isLocked,
                timeSpent: occ.timeSpent,
                duration: occ.duration,
                taskTime: occ.taskTime,
                source: 'occurrence'
            };
        });

        // Add any standalone plans not in occurrences (old data / goals)
        plansData.forEach(plan => {
            const pid = plan.id;
            // Skip if already represented via occurrence
            const hasOccurrence = occurrencesData.some(o => o.taskId === pid || o.occurrenceId === pid);
            if (!hasOccurrence) {
                occMap[pid] = {
                    id: pid,
                    occurrenceId: pid,
                    taskId: pid,
                    title: plan.title,
                    description: plan.description || '',
                    dueDate: plan.dueDate,
                    scheduledDate: plan.dueDate,
                    priority: plan.priority || 'medium',
                    category: plan.category || 'general',
                    repeat: plan.repeat || plan.type || 'none',
                    completed: plan.completed,
                    status: plan.completed ? 'COMPLETED' : 'PENDING',
                    isLocked: false,
                    timeSpent: null,
                    duration: plan.duration,
                    taskTime: plan.taskTime,
                    source: 'plan'
                };
            }
        });

        allPlans = Object.values(occMap).filter(p => p.dueDate);

        updateSegmentStats();
        updateSegmentPanel();
        updateCalendarIndicators();
        generateYearGrid();
        updateQuickStats();
        generateActivityHeatmap();
        generateYearlyMonthBars();
        updateYearlyStats();
    };

    // Real-time listener on task_occurrences
    unsubscribeOccurrences = db.collection('users').doc(currentUser.uid).collection('task_occurrences')
        .orderBy('scheduledDate', 'desc')
        .onSnapshot(snap => {
            occurrencesData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            mergePlansAndOccurrences();
        }, err => console.error('task_occurrences listener error:', err));

    // Real-time listener on plans (for standalone/goal plans)
    unsubscribePlans = db.collection('users').doc(currentUser.uid).collection('plans')
        .orderBy('createdAt', 'desc')
        .onSnapshot(snap => {
            plansData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            mergePlansAndOccurrences();
        }, err => console.error('plans listener error:', err));
}

function loadGoals() {
    if (!currentUser) return;

    if (unsubscribeGoals) unsubscribeGoals();

    unsubscribeGoals = db.collection('users').doc(currentUser.uid).collection('goals')
        .orderBy('createdAt', 'desc')
        .onSnapshot(snapshot => {
            allGoals = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            renderGoals();
        }, error => {
            console.error('Error loading goals:', error);
        });
}

// Obsolete functions removed

// Generate Activity Heatmap (GitHub-style)
function generateActivityHeatmap() {
    const container = document.getElementById('activity-heatmap');
    if (!container) return;

    const today = new Date();
    const days = 90; // Show last 90 days

    let html = '<div class="heatmap-grid">';

    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);

        // Calculate task completion for this day
        const dateStr = getLocalDateString(date);
        const dayTasks = allPlans.filter(p => {
            if (!p.dueDate) return false;
            const taskDate = p.dueDate.toDate ? p.dueDate.toDate() : new Date(p.dueDate);
            return getLocalDateString(taskDate) === dateStr;
        });

        const completedTasks = dayTasks.filter(p => p.completed).length;
        const totalTasks = dayTasks.length;

        // Determine activity level (0-4)
        let level = 0;
        if (totalTasks > 0) {
            const completionRate = completedTasks / totalTasks;
            if (completionRate >= 0.8) level = 4;
            else if (completionRate >= 0.6) level = 3;
            else if (completionRate >= 0.4) level = 2;
            else if (completionRate > 0) level = 1;
        }

        const tooltip = `${date.toLocaleDateString()}: ${completedTasks}/${totalTasks} tasks`; html += `<div class="heatmap-cell level-${level}" title="${tooltip}"></div>`;
    }

    html += '</div>';
    container.innerHTML = html;
}

// Generate Yearly Month Bars
function generateYearlyMonthBars() {
    const container = document.getElementById('yearly-month-bars');
    if (!container) return;

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    let html = '';
    months.forEach((month, index) => {
        // Calculate tasks for this month
        const monthTasks = allPlans.filter(p => {
            if (!p.dueDate) return false;
            const taskDate = p.dueDate.toDate ? p.dueDate.toDate() : new Date(p.dueDate);
            return taskDate.getFullYear() === currentYear && taskDate.getMonth() === index;
        });

        const completed = monthTasks.filter(p => p.completed).length;
        const total = monthTasks.length;
        const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

        html += `
            <div class="month-bar-item">
                <span class="month-label">${month}</span>
                <div class="month-bar-track">
                    <div class="month-bar-fill" style="width: ${percentage}%"></div>
                </div>
                <span class="month-percentage">${percentage}%</span>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Update Yearly Stats
function updateYearlyStats() {
    const yearTasks = allPlans.filter(p => {
        if (!p.dueDate) return false;
        const taskDate = p.dueDate.toDate ? p.dueDate.toDate() : new Date(p.dueDate);
        return taskDate.getFullYear() === currentYear;
    });

    const completed = yearTasks.filter(p => p.completed).length;
    const total = yearTasks.length;
    const productivity = total > 0 ? Math.round((completed / total) * 100) : 0;

    const yearGoals = allGoals.filter(g => g.type === 'yearly' && g.year === currentYear);
    const goalsAchieved = yearGoals.filter(g => g.completed).length;

    document.getElementById('year-total-completed').textContent = completed;
    document.getElementById('year-goals-achieved').textContent = goalsAchieved;
    document.getElementById('year-productivity').textContent = productivity + '%';

    // Calculate best streak
    let bestStreak = 0;
    let currentStreak = 0;
    const sortedTasks = [...yearTasks].sort((a, b) => {
        const dateA = a.dueDate.toDate ? a.dueDate.toDate() : new Date(a.dueDate);
        const dateB = b.dueDate.toDate ? b.dueDate.toDate() : new Date(b.dueDate);
        return dateA - dateB;
    });

    let lastDate = null;
    sortedTasks.forEach(task => {
        if (task.completed) {
            const taskDate = task.dueDate.toDate ? task.dueDate.toDate() : new Date(task.dueDate);

            if (lastDate) {
                const daysDiff = Math.floor((taskDate - lastDate) / (1000 * 60 * 60 * 24));
                if (daysDiff === 1) {
                    currentStreak++;
                } else if (daysDiff > 1) {
                    bestStreak = Math.max(bestStreak, currentStreak);
                    currentStreak = 1;
                }
            } else {
                currentStreak = 1;
            }
            lastDate = taskDate;
        }
    });
    bestStreak = Math.max(bestStreak, currentStreak);

    document.getElementById('year-best-streak').textContent = bestStreak;
}

// Generate Activity Heatmap
function generateActivityHeatmap() {
    const heatmapContainer = document.getElementById('activity-heatmap');
    if (!heatmapContainer) return;

    // Generate 28 cells (4 weeks)
    let cells = '';
    for (let i = 0; i < 28; i++) {
        // For demo purposes, assign random levels. In production, calculate from allPlans.
        const level = Math.floor(Math.random() * 5);
        cells += `<div class="heatmap-cell level-${level}"></div>`;
    }
    heatmapContainer.innerHTML = cells;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Wait for auth
    if (typeof auth !== 'undefined') {
        auth.onAuthStateChanged(user => {
            if (user) {
                window.currentUser = user;
                initDates();
                initSegments();
                initTabNavigation(); // Initialize tab navigation
                initModals();
                initNavigation();
                generateCalendar();
                generateActivityHeatmap();
                generateYearGrid();
                loadPlans();
                loadGoals();
            }
        });
    } else {
        // Fallback if auth not ready
        setTimeout(() => {
            initDates();
            initSegments();
            initTabNavigation();
            initModals();
            initNavigation();
            generateCalendar();
            generateActivityHeatmap();
            generateYearGrid();
        }, 500);
    }
});

