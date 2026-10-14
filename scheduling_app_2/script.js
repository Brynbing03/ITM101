/* My Day: local scheduling, occurrence exceptions, and goal planning. */
const $ = id => document.getElementById(id);
const clone = value => JSON.parse(JSON.stringify(value));
function read(key, fallback) {
    try { const value = JSON.parse(localStorage.getItem(key)); return value === null ? fallback : value; }
    catch { return fallback; }
}
let tasks = read('myDayTasks', []);
let goals = read('myDayGoals', []);
let completedOccurrences = read('completedOccurrences', {});
let settings = {startHour: 6, endHour: 24, weekStart: 0, theme: 'forest', ...read('myDaySettings', {})};
let selectedDate = new Date();
let currentPage = 'today';
let goalProgressView = 'month', goalProgressDate = new Date();
const goalPoolExpanded = {};
let dayView = read('myDayView', 'timeline') === 'agenda' ? 'agenda' : 'timeline';
let editingTaskId = null, editingGoalId = null, editingDate = null, draftGoalId = null;
let undoState = null, lastFocus = null, suppressClickUntil = 0;
const uid = () => crypto.randomUUID();
function formatDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function parseDate(value) { return new Date(value + 'T00:00:00'); }
function addDays(date, days) { const result = new Date(date); result.setDate(result.getDate()+days); return result; }
function minutes(time) { const [h,m] = time.split(':').map(Number); return h*60+m; }
function timeValue(value) { return `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`; }
function formatTime(time) {
    if (!time) return '';
    const [h,m] = time.split(':').map(Number);
    return `${h%12 || 12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`;
}
function formatDuration(value) { return value < 60 ? `${value} min` : `${Math.floor(value/60)} hr${value%60 ? ` ${value%60} min` : ''}`; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function saveAll() {
    goals.forEach(goal=>{if(!goal.targetHistory?.length)goal.targetHistory=goalTargetHistory(goal);});
    try {
        localStorage.setItem('myDayTasks', JSON.stringify(tasks));
        localStorage.setItem('myDayGoals', JSON.stringify(goals));
        localStorage.setItem('completedOccurrences', JSON.stringify(completedOccurrences));
        localStorage.setItem('myDaySettings', JSON.stringify(settings));
        localStorage.setItem('myDayInitialized', 'true');
    } catch { notify('Your changes could not be saved. Export a backup before closing this tab.'); }
}
function notify(message, undo = false) {
    $('statusMessage').textContent = message;
    $('undoButton').hidden = !undo;
    $('statusBar').hidden = false;
}
function remember() { undoState = clone({tasks, goals, completedOccurrences, settings}); }
function undoChange() {
    if (!undoState) return;
    ({tasks,goals,completedOccurrences,settings} = undoState);
    undoState = null; saveAll(); refreshEverything(); notify('Change undone.');
}
if (!Array.isArray(tasks)) tasks = [];
if (!Array.isArray(goals)) goals = [];
if (!localStorage.getItem('myDayInitialized')) {
    if (localStorage.getItem('myDayTasks') === null) {
        tasks = [
            ['Morning Workout','07:00',60,'🏋️','green'],
            ['Study Web Development','09:00',90,'💻','purple'],
            ['Lunch','12:00',60,'🍔','orange'],
            ['Work on Project','14:00',120,'📚','blue'],
            ['Practice Guitar','19:00',60,'🎸','pink']
        ].map(([name,time,duration,icon,color]) => ({id:uid(),name,time,duration,icon,color,date:formatDate(new Date()),repeat:'none',notes:'',completed:false,inbox:false}));
    }
    saveAll();
}
if(goals.some(goal=>!goal.targetHistory?.length))saveAll();
function taskOccursOnDate(task, date) {
    if (task.inbox || !task.date || date < task.date) return false;
    if(task.until && date>task.until)return false;
    if(task.activeFrom && date<task.activeFrom)return false;
    if (!task.repeat || task.repeat === 'none') return task.date === date;
    const day = parseDate(date), start = parseDate(task.date);
    if (task.repeat === 'daily') return true;
    if (task.repeat === 'custom') return (task.repeatDays || []).includes(day.getDay());
    if (task.repeat === 'weekdays') return day.getDay() > 0 && day.getDay() < 6;
    if (task.repeat === 'weekly') return day.getDay() === start.getDay();
    if (task.repeat === 'monthly') return day.getDate() === Math.min(start.getDate(),new Date(day.getFullYear(),day.getMonth()+1,0).getDate());
    return false;
}
const recurring = task => task.repeat && task.repeat !== 'none';
function occurrence(task, date) {
    const override = task.exceptions?.[date];
    if (override?.deleted) return null;
    if (!taskOccursOnDate(task,date) && !override) return null;
    return {...task,date,...override,id:task.id,sourceDate:date};
}
function tasksOnDate(date) {
    return tasks.flatMap(task => {
        const sources = new Set([date,...Object.keys(task.exceptions || {})]);
        return [...sources].flatMap(source => {
            const item = occurrence(task,source);
            return item && !item.inbox && item.date === date ? [item] : [];
        });
    }).sort((a,b) => (a.time||'').localeCompare(b.time||''));
}
function isTaskCompleted(task, sourceDate) {
    return recurring(task) ? !!completedOccurrences[`${task.id}_${sourceDate || task.sourceDate}`] : !!task.completed;
}
function toggleTask(id, sourceDate) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    if (recurring(task)) {
        const key = `${id}_${sourceDate}`;
        if (completedOccurrences[key]) delete completedOccurrences[key]; else completedOccurrences[key] = true;
    } else task.completed = !task.completed;
    saveAll(); refreshEverything();
}
function getGoalPeriodRange(goal,date) {
    let start = parseDate(formatDate(date)), end = new Date(start);
    if (goal.period === 'week') {
        start = addDays(start,-((start.getDay()-Number(settings.weekStart)+7)%7)); end = addDays(start,6);
    } else if (goal.period === 'month') {
        start.setDate(1); end = new Date(start.getFullYear(),start.getMonth()+1,0);
    } else if (goal.period === 'year') {
        start = new Date(start.getFullYear(),0,1); end = new Date(start.getFullYear(),11,31);
    }
    return {start,end};
}
function goalStats(goal,date) {
    const {start,end} = getGoalPeriodRange(goal,date);
    let completed = 0, scheduled = 0;
    for (let day = start; day <= end; day = addDays(day,1)) {
        for (const task of tasksOnDate(formatDate(day)).filter(t => t.goalId === goal.id)) {
            if (isTaskCompleted(task,task.sourceDate)) completed++; else scheduled++;
        }
    }
    return {completed,scheduled,needed:Math.max(0,goal.target-completed-scheduled),percentage:Math.min(100,Math.round(completed/goal.target*100))};
}
function periodLabel(goal,date) {
    const {start,end} = getGoalPeriodRange(goal,date);
    const label = day => day.toLocaleDateString('en-US',{month:'short',day:'numeric'});
    return formatDate(start) === formatDate(end) ? label(start) : `${label(start)} – ${label(end)}`;
}
function changeDate(direction) {
    if (currentPage === 'month') selectedDate = new Date(selectedDate.getFullYear(),selectedDate.getMonth()+direction,1);
    else selectedDate = addDays(selectedDate,direction*(currentPage==='week'?7:1));
    refreshEverything();
}
function goToToday() { selectedDate = new Date(); refreshEverything(); }
function installDaySwipe() {
    const main = document.querySelector('.main');
    let gesture = null;
    main.addEventListener('touchstart', event => {
        gesture = null;
        if(currentPage !== 'today' || event.touches.length !== 1 ||
            document.querySelector('.modal:not(.hidden)') ||
            event.target.closest('button,input,select,textarea,a,summary,.info-note,.view-switch')) return;
        const touch = event.touches[0];
        gesture = {x:touch.clientX, y:touch.clientY, horizontal:false};
    }, {passive:true});
    main.addEventListener('touchmove', event => {
        if(!gesture) return;
        if(event.touches.length !== 1) {gesture=null;return;}
        const dx=event.touches[0].clientX-gesture.x, dy=event.touches[0].clientY-gesture.y;
        // Lock direction early so a vertical scroll never turns into navigation.
        if(!gesture.horizontal && Math.abs(dy)>12 && Math.abs(dy)>=Math.abs(dx)) {gesture=null;return;}
        if(Math.abs(dx)>12 && Math.abs(dx)>Math.abs(dy)*1.5) gesture.horizontal=true;
        if(gesture.horizontal && event.cancelable) event.preventDefault();
    }, {passive:false});
    main.addEventListener('touchend', event => {
        const start=gesture; gesture=null;
        if(!start || !start.horizontal || !event.changedTouches.length || currentPage!=='today') return;
        const dx=event.changedTouches[0].clientX-start.x;
        if(Math.abs(dx)<60) return;
        suppressClickUntil=Date.now()+400;
        changeDate(dx<0?1:-1);
    }, {passive:true});
    main.addEventListener('touchcancel',()=>{gesture=null;}, {passive:true});
}
function showPage(page) {
    currentPage = page;
    document.querySelectorAll('.page').forEach(el => el.classList.toggle('hidden',el.id!==page+'Page'));
    document.querySelectorAll('.nav-item').forEach(el => {
        const active = el.dataset.page === page; el.classList.toggle('active',active);
        if (active) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current');
    });
    $('pageTitle').textContent = ({today:'Today',inbox:'Inbox',week:'Week',month:'Month',goals:'Goals'})[page];
    document.querySelector('.date-selector').classList.toggle('hidden',page==='inbox'||page==='goals');
    refreshEverything();
}
function renderDates() {
    document.querySelector('.date-selector').classList.toggle('single-day', currentPage === 'today');
    document.querySelector('.date-selector').classList.toggle('calendar-view', currentPage === 'week' || currentPage === 'month');
    $('jumpDate').value = formatDate(selectedDate);
    $('dateContainer').replaceChildren();
    for (let i=currentPage==='today'?0:-2;i<=(currentPage==='today'?0:2);i++) {
        const date = addDays(selectedDate,i), button = document.createElement('button');
        button.className = 'date-card'+(i===0?' selected':'');
        button.setAttribute('aria-pressed',i===0?'true':'false');
        button.setAttribute('aria-label',date.toLocaleDateString('en-US',{dateStyle:'full'}));
        button.innerHTML = `<span class="date-day">${date.toLocaleDateString('en-US',{weekday:'short'})}</span><span class="date-number">${date.getDate()}</span>`;
        button.onclick = () => {selectedDate=date; refreshEverything();}; $('dateContainer').append(button);
    }
    document.querySelectorAll('.date-arrow').forEach((el,i) => el.setAttribute('aria-label',`${i?'Next':'Previous'} ${currentPage==='week'?'week':currentPage==='month'?'month':'day'}`));
}
/* Partition interval groups into columns, keeping each group at a consistent width. */
function layoutIntervals(items) {
    const sorted = [...items].sort((a,b)=>a.start-b.start || a.end-b.end);
    let group = [], limit = -Infinity;
    function finish() {
        const ends = [];
        for (const item of group) {
            let column = ends.findIndex(end=>end<=item.start);
            if (column<0) column=ends.length;
            ends[column]=item.end; item.column=column;
        }
        group.forEach(item=>item.columns=ends.length); group=[];
    }
    for (const item of sorted) {
        if (item.start>=limit) {finish(); limit=-Infinity;}
        group.push(item); limit=Math.max(limit,item.end);
    }
    finish(); return sorted;
}
function timelineItems(date) {
    const result = tasksOnDate(date).filter(t=>t.time).map(task => ({task,start:minutes(task.time),end:minutes(task.time)+task.duration,carry:false}));
    for (const task of tasksOnDate(formatDate(addDays(parseDate(date),-1))).filter(t=>t.time && minutes(t.time)+t.duration>1440)) {
        result.push({task,start:0,end:minutes(task.time)+task.duration-1440,carry:true});
    }
    return result;
}
function renderTimeline() {
    const date = formatDate(selectedDate), dayTasks = tasksOnDate(date), timeline = $('timeline');
    $('selectedDateTitle').textContent = date===formatDate(new Date())?'Today':selectedDate.toLocaleDateString('en-US',{weekday:'long'});
    $('selectedDateSubtitle').textContent = selectedDate.toLocaleDateString('en-US',{dateStyle:'long'});
    $('taskCount').textContent = `${dayTasks.length} task${dayTasks.length===1?'':'s'}`;
    const items = timelineItems(date);
    const start = Math.min(Number(settings.startHour)*60,...items.map(i=>Math.floor(i.start/60)*60));
    const end = Math.min(1440,Math.max(Number(settings.endHour)*60,...items.map(i=>Math.ceil(i.end/60)*60)));
    timeline.dataset.start = start; timeline.dataset.end = end;
    timeline.style.height = `${(end-start)*65/60+30}px`; timeline.style.minHeight='0'; timeline.replaceChildren();
    for (let minute=start;minute<end;minute+=60) {
        const row = document.createElement('div'); row.className='time-row';
        row.innerHTML=`<div class="time-label">${formatTime(timeValue(minute)).replace(':00','')}</div><div class="time-line"></div>`; timeline.append(row);
    }
    const endLabel=document.createElement('div');endLabel.className='timeline-end-label';
    endLabel.style.top=`${15+(end-start)*65/60}px`;
    endLabel.textContent=end===1440?'12 AM':formatTime(timeValue(end)).replace(':00','');
    timeline.append(endLabel);
    const visible = items.filter(i=>i.start<end && i.end>start).map(i=>({...i,start:Math.max(start,i.start),end:Math.min(end,i.end)}));
    for (const item of layoutIntervals(visible)) {
        const {task} = item, card = document.createElement('div'), done = isTaskCompleted(task,task.sourceDate);
        card.className=`task-card ${task.color||'purple'}${done?' completed':''}${item.end-item.start<=30?' compact':''}`;
        card.style.top=`${15+(item.start-start)*65/60}px`;
        card.style.height=`${Math.max(14,(item.end-item.start)*65/60-2)}px`;
        card.style.left=`calc(var(--timeline-gutter) + (100% - var(--timeline-gutter) - 15px) * ${item.column/item.columns})`;
        card.style.width=`calc((100% - var(--timeline-gutter) - 15px) / ${item.columns} - 3px)`; card.style.right='auto';
        card.tabIndex=0; card.setAttribute('role','button');
        card.dataset.taskId=String(task.id);card.dataset.sourceDate=task.sourceDate;
        const label=`${task.name}, ${formatTime(task.time)}, ${formatDuration(task.duration)}${item.carry?', continued from previous day':''}`;
        card.setAttribute('aria-label',`${label}. Enter to edit. Arrow keys move by 15 minutes; Shift and arrows resize.`); card.title=label;
        card.innerHTML=`<button class="task-checkbox ${done?'checked':''}" aria-label="${done?'Mark incomplete':'Mark complete'}" aria-pressed="${done}">${done?'✓':''}</button><div class="task-info"><div class="task-name">${escapeHtml(task.name)}</div><div class="task-time">${item.carry?'Continued · ':''}${formatTime(task.time)} · ${formatDuration(task.duration)}${minutes(task.time)+task.duration>1440?' · next day':''}${task.goalId?' · 🎯':''}</div></div>${task.icon ? `<div class="task-icon">${escapeHtml(task.icon)}</div>` : ''}<span class="resize-handle" aria-hidden="true"></span>`;
        card.onclick=()=>{if(Date.now()>suppressClickUntil) openTaskEditor(false,task.id,task.sourceDate);};
        card.querySelector('.task-checkbox').onclick=event=>{event.stopPropagation(); toggleTask(task.id,task.sourceDate);};
        card.onkeydown=event=>{
            if(event.target!==card) return;
            if(event.key==='Enter'||event.key===' ') {event.preventDefault(); openTaskEditor(false,task.id,task.sourceDate);}
            if(event.key==='ArrowUp'||event.key==='ArrowDown') {
                event.preventDefault(); const delta=event.key==='ArrowUp'?-15:15;
                commitPosition(task,event.shiftKey?minutes(task.time):Math.max(0,Math.min(1425,minutes(task.time)+delta)),event.shiftKey?Math.max(15,Math.min(1440,task.duration+delta)):task.duration);
            }
        };
        // Use the editor for changes; gestures on the timeline scroll or change days.
        timeline.append(card);
    }
    timeline.onclick=null;
    const untimed=dayTasks.filter(t=>!t.time);
    $('untimedTasks').replaceChildren();
    for(const task of untimed) $('untimedTasks').append(taskButton(task,date,'Unscheduled time'));
    renderNow();
    renderPhoneSchedule(items);
}
function renderPhoneSchedule(items) {
    const schedule=$('phoneDaySchedule');schedule.replaceChildren();
    const sorted=[...items].sort((a,b)=>a.start-b.start || a.end-b.end);
    if(!sorted.length) {
        const empty=document.createElement('p');empty.className='phone-schedule-empty';
        empty.textContent='No timed tasks for this day.';schedule.append(empty);
    }
    for(const item of sorted) {
        const {task}=item,done=isTaskCompleted(task,task.sourceDate);
        const row=document.createElement('div');row.className='phone-schedule-row'+(done?' completed':'');
        row.dataset.taskId=String(task.id);row.dataset.sourceDate=task.sourceDate;
        const time=document.createElement('span');time.className='phone-schedule-time';
        time.textContent=formatTime(timeValue(item.start));
        const marker=document.createElement('span');marker.className='phone-schedule-marker';marker.setAttribute('aria-hidden','true');
        marker.textContent=task.icon||'';
        if(!task.icon) marker.classList.add('without-icon');
        const edit=document.createElement('button');edit.type='button';edit.className='phone-schedule-edit';
        edit.setAttribute('aria-label',`Edit ${task.name}, ${time.textContent}, ${formatDuration(task.duration)}`);
        const name=document.createElement('strong');name.textContent=task.name;
        const detail=document.createElement('span');detail.className='phone-schedule-detail';
        detail.textContent=`${item.carry?'Continued · ':''}${formatDuration(task.duration)}${recurring(task)?' · Repeats':''}${minutes(task.time)+task.duration>1440?' · next day':''}${task.goalId?' · Goal session':''}`;
        edit.append(name,detail);edit.onclick=()=>{if(Date.now()>suppressClickUntil)openTaskEditor(false,task.id,task.sourceDate);};
        const check=document.createElement('button');check.type='button';check.className='phone-schedule-check';
        check.setAttribute('aria-label',`${done?'Mark incomplete':'Mark complete'}: ${task.name}`);check.setAttribute('aria-pressed',String(done));
        check.textContent=done?'✓':'';check.onclick=()=>toggleTask(task.id,task.sourceDate);
        row.append(time,marker,edit,check);schedule.append(row);
    }
}
function setDayView(view) {
    dayView = view;
    try { localStorage.setItem('myDayView', JSON.stringify(view)); } catch {}
    renderAgenda();
}
function renderAgenda() {
    const list = $('agendaList');
    list.hidden = dayView !== 'agenda';
    $('phoneDaySchedule').hidden = dayView === 'agenda';
    document.querySelector('.timeline-container').hidden = dayView === 'agenda';
    $('untimedTasks').hidden = dayView === 'agenda';
    for (const view of ['timeline','agenda']) $(view+'View').setAttribute('aria-pressed', String(dayView === view));
    list.replaceChildren();
    const items = tasksOnDate(formatDate(selectedDate));
    if (!items.length) {
        const empty = document.createElement('div'); empty.className = 'agenda-empty';
        empty.innerHTML = '<strong>A little room in your day.</strong><p>Add your first task to start planning.</p><button class="save-button" type="button">+ Add task</button>';
        empty.querySelector('button').onclick = () => openTaskEditor();
        list.append(empty);
    }
    for (const task of items) {
        const row = document.createElement('div'); row.className = 'agenda-row';
        const done = isTaskCompleted(task,task.sourceDate);
        const check = document.createElement('button'); check.className = 'agenda-check';
        check.textContent = done ? '✓' : '○';
        check.setAttribute('aria-label', (done ? 'Mark incomplete: ' : 'Mark complete: ')+task.name);
        check.setAttribute('aria-pressed', String(done));
        check.onclick = () => toggleTask(task.id,task.sourceDate);
        const edit = document.createElement('button'); edit.className = 'agenda-edit'+(done?' completed':'');
        edit.innerHTML = `<span class="agenda-time">${task.time ? formatTime(task.time) : 'Any time'}</span><span><strong>${escapeHtml(task.name)}</strong><small>${task.time ? formatDuration(task.duration) : 'Choose a time'}${recurring(task)?' · Repeats':''}</small></span><span aria-hidden="true">›</span>`;
        edit.onclick = () => openTaskEditor(false,task.id,task.sourceDate);
        row.append(check,edit);list.append(row);
    }
}
function commitPosition(item,time,duration) {
    const task=tasks.find(t=>t.id===item.id); if(!task) return;
    remember();
    if(recurring(task)) {
        task.exceptions ||= {}; task.exceptions[item.sourceDate]={...(task.exceptions[item.sourceDate]||{}),time:timeValue(time),duration};
    } else {task.time=timeValue(time);task.duration=duration;}
    saveAll();refreshEverything();notify(recurring(task)?'This occurrence updated.':'Task updated.',true);
}
function beginDrag(event,card,item,start) {
    // Touch gestures scroll or change days; editing remains available with a tap.
    if(event.pointerType==='touch') return;
    if(event.button!==0 || event.target.closest('button') || item.carry) return;
    const resize=event.target.classList.contains('resize-handle'), y=event.clientY, original=minutes(item.task.time);
    let changed=false, nextTime=original, nextDuration=item.task.duration;
    card.setPointerCapture(event.pointerId);
    card.onpointermove=e=>{
        if(Math.abs(e.clientY-y)<5 && !changed) return;
        changed=true;const delta=Math.round((e.clientY-y)*60/65/15)*15;
        nextTime=resize?original:Math.max(0,Math.min(1425,original+delta));
        nextDuration=resize?Math.max(15,Math.min(1440,item.task.duration+delta)):item.task.duration;
        card.style.top=`${15+(nextTime-start)*65/60}px`;
        card.style.height=`${Math.max(14,Math.min(1440-nextTime,nextDuration)*65/60-2)}px`;
        card.classList.add('dragging'); card.querySelector('.task-time').textContent=`${formatTime(timeValue(nextTime))} · ${formatDuration(nextDuration)}`;
    };
    const finish=()=>{card.onpointermove=null;card.onpointerup=null;card.onpointercancel=null;if(changed){suppressClickUntil=Date.now()+400;commitPosition(item.task,nextTime,nextDuration);}};
    card.onpointerup=finish;
    card.onpointercancel=()=>{card.onpointermove=null;card.onpointerup=null;card.onpointercancel=null;renderTimeline();};
}
function renderNow() {
    document.querySelector('.now-line')?.remove();
    const now=new Date(), date=formatDate(selectedDate), today=date===formatDate(now), value=now.getHours()*60+now.getMinutes();
    if(today && value>=Number($('timeline').dataset.start) && value<Number($('timeline').dataset.end)) {
        const line=document.createElement('div');line.className='now-line';line.style.top=`${15+(value-Number($('timeline').dataset.start))*65/60}px`;line.innerHTML='<span>Now</span>';$('timeline').append(line);
    }
    const remaining=timelineItems(date).filter(i=>!isTaskCompleted(i.task,i.task.sourceDate) && (!today||i.end>value)).sort((a,b)=>a.start-b.start);
    const next=remaining[0];
    $('upNext').textContent=next?`${today && next.start<=value?'Now':'Up next'}: ${next.task.name} · ${formatTime(next.task.time)}`:'No more scheduled tasks';
}
function taskButton(task,date,prefix='') {
    const button=document.createElement('button'); button.className='week-task';
    button.textContent=`${isTaskCompleted(task,task.sourceDate)?'✓ ':''}${prefix || formatTime(task.time)} ${task.name}`;
    button.onclick=()=>openTaskEditor(false,task.id,task.sourceDate||date);return button;
}
function renderWeek() {
    $('weekContainer').replaceChildren();
    const start=addDays(selectedDate,-((selectedDate.getDay()-Number(settings.weekStart)+7)%7));
    $('weekHeading').textContent=`${start.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${addDays(start,6).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`;
    for(let i=0;i<7;i++) {
        const date=addDays(start,i), key=formatDate(date), day=document.createElement('div');day.className='week-day'+(key===formatDate(new Date())?' today':'');
        const heading=document.createElement('button');heading.className='week-day-header day-link';heading.textContent=date.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});heading.onclick=()=>{selectedDate=date;showPage('today');};day.append(heading);
        tasksOnDate(key).forEach(task=>day.append(taskButton(task,key)));
        const add=document.createElement('button');add.className='day-add';add.textContent='+ Add task';add.onclick=()=>{selectedDate=date;openTaskEditor();};day.append(add);$('weekContainer').append(day);
    }
}
function renderMonth() {
    const container=$('monthContainer');container.replaceChildren();
    $('monthHeading').textContent=selectedDate.toLocaleDateString('en-US',{month:'long',year:'numeric'});
    for(let i=0;i<7;i++){const day=document.createElement('div');day.className='month-weekday';day.textContent=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][(i+Number(settings.weekStart))%7];container.append(day);}
    const first=new Date(selectedDate.getFullYear(),selectedDate.getMonth(),1), offset=(first.getDay()-Number(settings.weekStart)+7)%7;
    const count=new Date(first.getFullYear(),first.getMonth()+1,0).getDate();
    for(let i=0;i<offset;i++) container.append(document.createElement('div'));
    for(let i=1;i<=count;i++) {
        const date=new Date(first.getFullYear(),first.getMonth(),i),key=formatDate(date), day=document.createElement('button');day.className='month-day'+(key===formatDate(selectedDate)?' selected':'');
        const dayTasks=tasksOnDate(key);day.setAttribute('aria-label',`${date.toLocaleDateString('en-US',{dateStyle:'full'})}, ${dayTasks.length} tasks`);
        day.innerHTML=`<span class="month-day-number">${i}</span>${dayTasks.slice(0,3).map(t=>`<span class="month-task-dot">${escapeHtml(t.name)}</span>`).join('')}${dayTasks.length>3?`<span>+${dayTasks.length-3} more</span>`:''}`;
        day.onclick=()=>{selectedDate=date;showPage('today');};container.append(day);
    }
}
function updateInbox() {
    const inbox=tasks.filter(t=>t.inbox||!t.date);$('inboxCount').textContent=inbox.length;$('inboxTasks').replaceChildren();
    if(!inbox.length){$('inboxTasks').innerHTML='<p class="empty-message">Your inbox is empty.</p>';return;}
    for(const task of inbox){const card=document.createElement('button');card.className='inbox-card';card.innerHTML=`${task.icon ? `<span class="inbox-icon">${escapeHtml(task.icon)}</span>` : ''}<span class="inbox-info"><strong>${escapeHtml(task.name)}</strong><span>${escapeHtml(task.notes||'Choose a date to schedule this task.')}</span></span>`;card.onclick=()=>openTaskEditor(true,task.id);$('inboxTasks').append(card);}
}
function updateProgress() {
    const list=tasksOnDate(formatDate(new Date())),done=list.filter(t=>isTaskCompleted(t,t.sourceDate)).length;
    const percentage=list.length?Math.round(done/list.length*100):0;$('progressPercent').textContent=percentage+'%';$('progressFill').style.width=percentage+'%';
}
function renderGoalPool() {
    $('goalPool').querySelectorAll('details[data-group]').forEach(group=>{goalPoolExpanded[group.dataset.group]=group.open;});
    $('goalPool').replaceChildren();
    if(!goals.length){$('goalPool').innerHTML='<div class="goal-pool-empty">Create a goal to start planning your practice and habits.</div>';return;}
    const order={day:0,week:1,month:2,year:3};
    const entries=goals.map(goal=>({goal,stats:goalStats(goal,selectedDate)}))
        .sort((a,b)=>order[a.goal.period]-order[b.goal.period] || a.goal.name.localeCompare(b.goal.name));
    for(const needed of [true,false]) {
        const group=entries.filter(({stats})=>(stats.needed>0)===needed);
        const section=document.createElement('details');section.className='goal-pool-group';
        section.dataset.group=needed?'needs-scheduling':'covered';
        section.open=!!goalPoolExpanded[section.dataset.group];
        section.addEventListener('toggle',()=>{if(section.isConnected)goalPoolExpanded[section.dataset.group]=section.open;});
        const heading=document.createElement('summary');heading.textContent=`${needed?'Needs scheduling':'Scheduled'} (${group.length})`;
        section.append(heading);
        const list=document.createElement('div');list.className='goal-pool-group-list';section.append(list);
        if(!group.length) {
            const empty=document.createElement('p');empty.className='goal-group-empty';
            empty.textContent=needed?'All goals have enough sessions scheduled or completed.':'No goals have enough sessions scheduled or completed yet.';list.append(empty);
        }
        for(const {goal,stats} of group) {
            const card=document.createElement('div');card.className='goal-pool-card'+(stats.completed>=goal.target?' goal-pool-complete':'');card.dataset.goalId=String(goal.id);
            card.innerHTML=`${goal.icon?`<div class="goal-pool-icon goal-icon-${goal.color}">${escapeHtml(goal.icon)}</div>`:''}<div class="goal-pool-info"><div class="goal-pool-name">${escapeHtml(goal.name)}</div><div class="goal-pool-frequency">${goal.target} per ${goal.period}</div><div class="goal-pool-progress">${stats.completed} completed · ${stats.scheduled} scheduled · ${stats.needed} needed<br>${periodLabel(goal,selectedDate)}</div></div><button class="goal-pool-button">${stats.needed>0?'Schedule':'Extra'}</button>`;
            card.querySelector('button').onclick=()=>scheduleGoal(goal.id);list.append(card);
        }
        $('goalPool').append(section);
    }
}
function setGoalProgressView(view) {goalProgressView=view;renderGoals();}
function changeGoalProgressPeriod(direction) {
    goalProgressDate=new Date(goalProgressDate.getFullYear()+(goalProgressView==='year'?direction:0),goalProgressDate.getMonth()+(goalProgressView==='month'?direction:0),1);
    renderGoals();
}
function goalProgressReport(view,date) {
    const year=date.getFullYear(),month=date.getMonth();
    const start=new Date(year,view==='year'?0:month,1),end=new Date(year,view==='year'?12:month+1,0);
    const byGoal=new Map(goals.map(goal=>[goal.id,{completed:0,scheduled:0}]));
    const months=Array.from({length:12},()=>({completed:0,scheduled:0}));
    let completed=0,scheduled=0;
    for(let day=start;day<=end;day=addDays(day,1)) {
        for(const task of tasksOnDate(formatDate(day))) {
            const counts=byGoal.get(task.goalId);if(!counts)continue;
            const key=isTaskCompleted(task,task.sourceDate)?'completed':'scheduled';
            counts[key]++;months[day.getMonth()][key]++;
            if(key==='completed')completed++;else scheduled++;
        }
    }
    for(const goal of goals) {
        const totals=byGoal.get(goal.id);totals.expected=goalExpectedSessions(goal,start,end);
        totals.percentage=totals.expected>0?Math.min(100,Math.round(totals.completed/totals.expected*100)):0;
        totals.remaining=Math.max(0,totals.expected-totals.completed);
    }
    return {byGoal,months,completed,scheduled};
}
function goalTargetHistory(goal) {
    if(goal.targetHistory?.length)return goal.targetHistory;
    const series=tasks.find(t=>t.id===goal.scheduleTaskId);
    const dates=tasks.filter(t=>t.goalId===goal.id&&t.date).map(t=>t.date).sort();
    const start=series?.date||goal.startedOn||dates[0]||`${new Date().getFullYear()}-01-01`;
    return [{effective:start,target:goal.target,period:goal.period,repeat:series?.repeat||'none',repeatDays:series?.repeatDays||[],start:series?.date||start}];
}
function goalExpectedSessions(goal,start,end) {
    const history=[...goalTargetHistory(goal)].sort((a,b)=>a.effective.localeCompare(b.effective));
    let expected=0;
    for(let day=start;day<=end;day=addDays(day,1)) {
        const date=formatDate(day),rule=history.filter(entry=>entry.effective<=date).at(-1);
        if(!rule)continue;
        if(rule.repeat!=='none') {
            if(taskOccursOnDate({date:rule.start,repeat:rule.repeat,repeatDays:rule.repeatDays},date))expected++;
        } else {
            const days=rule.period==='day'?1:rule.period==='week'?7:rule.period==='month'?new Date(day.getFullYear(),day.getMonth()+1,0).getDate():(new Date(day.getFullYear(),1,29).getMonth()===1?366:365);
            expected+=rule.target/days;
        }
    }
    return Math.round(expected*1e9)/1e9;
}
function recordGoalTarget(goal,rule,effective) {
    const history=goalTargetHistory(goal).map(entry=>({...entry}));
    const previous=history.filter(entry=>entry.effective<=effective).at(-1);
    const same=previous&&['target','period','repeat'].every(key=>previous[key]===rule[key])&&(rule.repeat==='none'||previous.start===rule.start)&&JSON.stringify(previous.repeatDays)===JSON.stringify(rule.repeatDays);
    if(!same) {
        goal.targetHistory=[...history.filter(entry=>entry.effective!==effective),{effective,...rule}].sort((a,b)=>a.effective.localeCompare(b.effective));
    } else goal.targetHistory=history;
}
function formatExpected(value) {return Number.isInteger(value)?String(value):`about ${Math.round(value)}`;}
function renderGoals() {
    if(currentPage!=='goals')return;
    const report=goalProgressReport(goalProgressView,goalProgressDate);
    const heading=goalProgressView==='year'?String(goalProgressDate.getFullYear()):goalProgressDate.toLocaleDateString('en-US',{month:'long',year:'numeric'});
    $('goalProgressHeading').textContent=heading;
    $('goalMonthView').setAttribute('aria-pressed',String(goalProgressView==='month'));
    $('goalYearView').setAttribute('aria-pressed',String(goalProgressView==='year'));
    $('goalProgressSummary').textContent=`${report.completed} completed sessions · ${report.scheduled} scheduled sessions · ${goals.length} goals`;
    $('goalYearChart').hidden=goalProgressView!=='year';$('goalYearChart').replaceChildren();
    if(goalProgressView==='year') {
        const max=Math.max(1,...report.months.map(m=>m.completed));
        report.months.forEach((counts,index)=>{
            const month=new Date(goalProgressDate.getFullYear(),index,1).toLocaleDateString('en-US',{month:'short'});
            const row=document.createElement('div');row.className='goal-month-bar';
            row.setAttribute('aria-label',`${month}: ${counts.completed} completed sessions, ${counts.scheduled} scheduled sessions`);
            row.innerHTML=`<span>${month}</span><span class="goal-bar-track" aria-hidden="true"><span style="width:${counts.completed/max*100}%"></span></span><span>${counts.completed}</span>`;
            $('goalYearChart').append(row);
        });
    }
    $('goalsContainer').replaceChildren();
    if(!goals.length){$('goalsContainer').innerHTML='<div class="goals-empty">Set a goal, schedule time for it, and track your progress here.</div>';return;}
    for(const goal of goals){const s=goalStats(goal,goalProgressDate),totals=report.byGoal.get(goal.id),card=document.createElement('div');card.className='goal-card';card.innerHTML=`<div class="goal-card-top"><div class="goal-card-icon goal-icon-${goal.color}">${escapeHtml(goal.icon)}</div><div class="goal-card-info"><h3>${escapeHtml(goal.name)}</h3><p>${goal.target} sessions per ${goal.period} · ${periodLabel(goal,goalProgressDate)}</p></div><button class="goal-edit-button" aria-label="Edit ${escapeHtml(goal.name)}">✎</button></div><div class="goal-calendar-progress"><div class="goal-calendar-donut" style="--completed:${totals.percentage}%" role="img" aria-label="${totals.percentage}% complete for ${heading}"><span>${totals.expected>0?totals.percentage+'%':'—'}</span></div><div><strong>${totals.completed} / ${formatExpected(totals.expected)} sessions</strong><p>${heading}</p><p>${totals.scheduled} scheduled · ${formatExpected(totals.remaining)} remaining</p>${totals.completed>totals.expected?`<p>${formatExpected(totals.completed-totals.expected)} extra completed</p>`:''}</div></div><div class="goal-progress-area"><div class="progress-ring" style="--progress:${s.percentage}%"><span>${s.percentage}%</span></div><div class="goal-progress-info"><div class="goal-progress-number">${s.completed} / ${goal.target}</div><div class="goal-progress-label">${s.scheduled} scheduled · ${s.needed} still needed</div></div></div>${goal.description?`<div class="goal-description">${escapeHtml(goal.description)}</div>`:''}<button class="goal-pool-button goal-schedule">Schedule a session</button>`;card.querySelector('.goal-edit-button').onclick=()=>openGoalEditor(goal.id);card.querySelector('.goal-schedule').onclick=()=>scheduleGoal(goal.id);$('goalsContainer').append(card);}
}
function applyTheme() {
    document.documentElement.dataset.theme = settings.theme === 'ocean' ? 'ocean' : 'forest';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', settings.theme === 'ocean' ? '#004E98' : '#248232');
}
function refreshEverything() {
    const phoneFocused=document.activeElement?.closest('.phone-schedule-row');
    const phoneFocus=phoneFocused?{id:phoneFocused.dataset.taskId,date:phoneFocused.dataset.sourceDate,check:document.activeElement.classList.contains('phone-schedule-check')}:null;
    applyTheme();
    const focused=document.activeElement?.closest('.task-card');
    const focusKey=focused?{id:focused.dataset.taskId,date:focused.dataset.sourceDate}:null;
    renderDates();renderTimeline();renderAgenda();renderWeek();renderMonth();updateInbox();updateProgress();renderGoalPool();renderGoals();
    if(phoneFocus && !document.querySelector('.modal:not(.hidden)')) {
        const row=[...$('phoneDaySchedule').children].find(el=>el.dataset.taskId===phoneFocus.id&&el.dataset.sourceDate===phoneFocus.date);
        (row?.querySelector(phoneFocus.check?'.phone-schedule-check':'.phone-schedule-edit')||document.querySelector('.header-add')).focus({preventScroll:true});
    }
    if(focusKey && !document.querySelector('.modal:not(.hidden)')) {
        const replacement=[...document.querySelectorAll('.task-card')].find(card=>card.dataset.taskId===focusKey.id&&card.dataset.sourceDate===focusKey.date);
        (replacement||document.querySelector('.new-task-button')).focus({preventScroll:true});
    }
}
function openModal(id) {lastFocus=document.activeElement;$(id).classList.remove('hidden');document.body.classList.add('modal-open');$(id).querySelector('input,select,button').focus();}
function closeModal(id) {
    $(id).classList.add('hidden');document.body.classList.remove('modal-open');
    if(lastFocus?.isConnected) lastFocus.focus({preventScroll:true});
    else if(lastFocus?.closest('.phone-schedule-row')) {
        const previous=lastFocus.closest('.phone-schedule-row');
        const row=[...$('phoneDaySchedule').children].find(el=>el.dataset.taskId===previous.dataset.taskId&&el.dataset.sourceDate===previous.dataset.sourceDate);
        (row?.querySelector('.phone-schedule-edit')||document.querySelector('.header-add')).focus({preventScroll:true});
    }
    else {
        const card=lastFocus?.closest('.task-card');
        const replacement=card&&[...document.querySelectorAll('.task-card')].find(el=>el.dataset.taskId===card.dataset.taskId&&el.dataset.sourceDate===card.dataset.sourceDate);
        (replacement||document.querySelector('.new-task-button')).focus({preventScroll:true});
    }
}
function setSelect(id,value) {
    const select=$(id);
    if(![...select.options].some(o=>o.value===String(value))) select.add(new Option(id.includes('Duration')?formatDuration(Number(value)):String(value),String(value)));
    select.value=String(value);
}
function setupWeekdays(id) {
    const names=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    names.forEach((name,day)=>{
        const button=document.createElement('button');button.type='button';
        button.textContent=['Su','Mo','Tu','We','Th','Fr','Sa'][day];
        button.dataset.day=day;button.setAttribute('aria-label',name);button.setAttribute('aria-pressed','false');
        button.onclick=()=>button.setAttribute('aria-pressed',button.getAttribute('aria-pressed')==='true'?'false':'true');
        $(id).append(button);
    });
}
function setWeekdays(id,days=[]) {
    $(id).querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(days.includes(Number(button.dataset.day)))));
}
function getWeekdays(id) {
    return [...$(id).querySelectorAll('button[aria-pressed="true"]')].map(button=>Number(button.dataset.day));
}
function syncTaskWeekdays() {
    $('taskWeekdays').hidden=$('taskRepeat').value!=='custom';
    $('taskWeekdays').querySelectorAll('button').forEach(button=>button.disabled=$('taskRepeat').disabled);
}
function openTaskEditor(inbox=false,id=null,sourceDate=null) {
    setWeekdays('taskWeekdays',tasks.find(t=>t.id===id)?.repeatDays||[]);
    editingTaskId=id;editingDate=sourceDate;draftGoalId=null;$('taskForm').reset();$('taskDate').value=inbox?'':formatDate(selectedDate);
    $('taskTime').value='09:00';setSelect('taskDuration',60);$('taskScopeRow').classList.add('hidden');$('goalTaskNotice').classList.add('hidden');$('deleteButton').classList.toggle('hidden',id===null);
    $('modalTitle').textContent=id===null?'New Task':'Edit Task';
    if(id!==null){const base=tasks.find(t=>t.id===id);if(!base)return;editingDate ||= base.date;const task=occurrence(base,editingDate)||base;
        $('taskName').value=task.name;$('taskDate').value=task.date||'';$('taskTime').value=task.time||'';setSelect('taskDuration',task.duration);setSelect('taskIcon',task.icon || '');$('taskRepeat').value=base.repeat||'none';$('taskNotes').value=task.notes||'';
        document.querySelector(`input[name="color"][value="${task.color||'purple'}"]`).checked=true;
        if(recurring(base)){$('taskScopeRow').classList.remove('hidden');$('taskScope').value='occurrence';}
        if(task.goalId){draftGoalId=task.goalId;showGoalNotice(task.goalId);}
    }
    syncScope();openModal('taskModal');$('taskName').focus();
}
function showGoalNotice(id) {const goal=goals.find(g=>g.id===id);if(goal){$('goalTaskNotice').textContent=`This session counts toward “${goal.name}”.`;$('goalTaskNotice').classList.remove('hidden');}}
function scheduleGoal(id) {
    const goal=goals.find(g=>g.id===id);if(!goal)return;openTaskEditor();draftGoalId=id;
    $('taskName').value=goal.name;setSelect('taskDuration',goal.duration);setSelect('taskIcon',goal.icon);$('taskNotes').value=goal.description||'';document.querySelector(`input[name="color"][value="${goal.color}"]`).checked=true;showGoalNotice(id);
}
function syncScope() {
    const base=tasks.find(t=>t.id===editingTaskId),single=base&&recurring(base)&&$('taskScope').value==='occurrence';
    $('taskRepeat').disabled=!!single;
    syncTaskWeekdays();
    if(base&&recurring(base)&&!single){$('taskDate').value=base.date;$('scopeHelp').textContent='Changes apply to the series. Existing occurrence exceptions are preserved.';}
    else {$('scopeHelp').textContent='Changes or deletion apply only to this occurrence.';if(base&&recurring(base)) $('taskDate').value=(occurrence(base,editingDate)||base).date;}
}
function closeTaskEditor(){closeModal('taskModal');editingTaskId=null;editingDate=null;draftGoalId=null;}
function clearCompletion(id){Object.keys(completedOccurrences).filter(key=>key.startsWith(id+'_')).forEach(key=>delete completedOccurrences[key]);}
function deleteCurrentTask(){const task=tasks.find(t=>t.id===editingTaskId);if(!task)return;remember();
    if(recurring(task)&&$('taskScope').value==='occurrence'){task.exceptions ||= {};task.exceptions[editingDate]={deleted:true};delete completedOccurrences[`${task.id}_${editingDate}`];}
    else {tasks=tasks.filter(t=>t.id!==task.id);clearCompletion(task.id);}
    saveAll();closeTaskEditor();refreshEverything();notify('Task deleted.',true);
}
function openGoalEditor(id=null){editingGoalId=id;$('goalForm').reset();$('goalModalTitle').textContent=id===null?'New Goal':'Edit Goal';$('deleteGoalButton').classList.toggle('hidden',id===null);
    $('goalEffectiveDate').value=formatDate(selectedDate);
    const series=tasks.find(t=>t.id===goals.find(g=>g.id===id)?.scheduleTaskId);
    $('goalRepeat').value=series?.repeat||'none';
    $('goalStartDate').value=series?.date||formatDate(selectedDate);
    $('goalTime').value=series?.time||'09:00';
    setWeekdays('goalWeekdays',series?.repeatDays||[]);
    syncGoalSchedule();
    const goal=goals.find(g=>g.id===id);if(goal){$('goalName').value=goal.name;$('goalTarget').value=goal.target;$('goalPeriod').value=goal.period;setSelect('goalDuration',goal.duration);setSelect('goalIcon',goal.icon);$('goalNotes').value=goal.description||'';document.querySelector(`input[name="goalColor"][value="${goal.color}"]`).checked=true;}
    openModal('goalModal');$('goalName').focus();}
function closeGoalEditor(){closeModal('goalModal');editingGoalId=null;}
function syncGoalSchedule() {
    $('goalWeekdays').hidden=$('goalRepeat').value!=='custom';
    const automatic=$('goalRepeat').value!=='none';
    $('goalScheduleFields').hidden=!automatic;
    ['goalStartDate','goalTime'].forEach(id=>{$(id).required=automatic;$(id).disabled=!automatic;});
}
function saveGoalSchedule(goal, repeat, date, time, repeatDays=[], effective=null) {
    let activeFrom;
    let series=tasks.find(t=>t.id===goal.scheduleTaskId && t.goalId===goal.id);
    const changed=series&&(series.repeat!==repeat||series.date!==date||JSON.stringify(series.repeatDays||[])!==JSON.stringify(repeat==='custom'?repeatDays:[]));
    if(changed&&effective&&series.date<effective) {
        series.until=formatDate(addDays(parseDate(effective),-1));
        series=null;delete goal.scheduleTaskId;
        activeFrom=effective;
    }
    if(repeat==='none') {
        if(series) {tasks=tasks.filter(t=>t.id!==series.id);clearCompletion(series.id);}
        delete goal.scheduleTaskId;
        return;
    }
    const values={name:goal.name,date,time,duration:goal.duration,icon:goal.icon,color:goal.color,notes:goal.description,inbox:false,repeat,repeatDays:repeat==='custom'?repeatDays:[],goalId:goal.id,...(activeFrom?{activeFrom}:{})};
    if(series) {
        if(series.repeat!==repeat || series.date!==date) {clearCompletion(series.id);delete series.exceptions;series.completed=false;}
        Object.assign(series,values);
    } else {
        const task={id:uid(),...values,completed:false};
        tasks.push(task);goal.scheduleTaskId=task.id;
    }
}
function deleteCurrentGoal(){if(editingGoalId===null)return;remember();goals=goals.filter(g=>g.id!==editingGoalId);tasks.forEach(t=>{if(t.goalId===editingGoalId)delete t.goalId;});saveAll();closeGoalEditor();refreshEverything();notify('Goal deleted. Scheduled tasks retained.',true);}
function openSettings() {$('visibleStart').value=settings.startHour;$('visibleEnd').value=settings.endHour;$('weekStart').value=settings.weekStart;$('themeChoice').value=settings.theme || 'forest';$('settingsError').textContent='';openModal('settingsModal');}
function exportBackup(){const blob=new Blob([JSON.stringify({version:2,exportedAt:new Date().toISOString(),tasks,goals,completedOccurrences,settings},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`my-day-${formatDate(new Date())}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Backup exported.');}
function validateBackup(data){
    const colors=['purple','blue','green','orange','pink'],repeats=['none','daily','weekdays','weekly','monthly','custom'];
    const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(parseDate(v))&&formatDate(parseDate(v))===v;
    const time=v=>v===''||typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
    const id=v=>typeof v==='string'&&v.length>0||typeof v==='number'&&Number.isFinite(v);
    const duration=v=>Number.isInteger(v)&&v>=15&&v<=1440;
    const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
    if(!object(data)||data.version!==2||!Array.isArray(data.tasks)||!Array.isArray(data.goals)||!object(data.completedOccurrences)||!object(data.settings))throw Error('Choose a valid My Day version 2 backup.');
    if(data.tasks.length>10000||data.goals.length>1000)throw Error('This backup is too large.');
    for(const goal of data.goals)if(!object(goal)||!id(goal.id)||typeof goal.name!=='string'||!goal.name.trim()||!Number.isInteger(goal.target)||goal.target<1||!['day','week','month','year'].includes(goal.period)||!duration(goal.duration)||!colors.includes(goal.color)||typeof goal.icon!=='string'||typeof goal.description!=='string')throw Error('A goal in this backup is invalid.');
    for(const task of data.tasks){if(!object(task)||!id(task.id)||typeof task.name!=='string'||!task.name.trim()||!(task.date===''||date(task.date))||!time(task.time)||!duration(task.duration)||!colors.includes(task.color)||typeof task.icon!=='string'||typeof task.notes!=='string'||!repeats.includes(task.repeat)||typeof task.inbox!=='boolean'||task.goalId!=null&&!data.goals.some(g=>g.id===task.goalId))throw Error('A task in this backup is invalid.');
        if(task.exceptions){if(!object(task.exceptions))throw Error('Invalid occurrence exceptions.');for(const [key,value] of Object.entries(task.exceptions)){if(!date(key)||!object(value)||Object.keys(value).some(k=>!['deleted','date','time','duration','name','notes','icon','color','inbox'].includes(k))||value.date!==undefined&&!date(value.date)||value.time!==undefined&&!time(value.time)||value.duration!==undefined&&!duration(value.duration)||value.color!==undefined&&!colors.includes(value.color)||['name','notes','icon'].some(k=>value[k]!==undefined&&typeof value[k]!=='string')||value.deleted!==undefined&&typeof value.deleted!=='boolean'||value.inbox!==undefined&&typeof value.inbox!=='boolean')throw Error('Invalid occurrence exception.');}}
    }
    if(new Set(data.tasks.map(t=>t.id)).size!==data.tasks.length||new Set(data.goals.map(g=>g.id)).size!==data.goals.length)throw Error('Duplicate IDs in backup.');
    for(const task of data.tasks) {
        if(task.until!==undefined && (!date(task.until)||task.until<task.date))throw Error('Invalid series end date.');
        if(task.activeFrom!==undefined&&!date(task.activeFrom))throw Error('Invalid series effective date.');
        if(task.repeatDays!==undefined && (!Array.isArray(task.repeatDays) || task.repeatDays.some(day=>!Number.isInteger(day)||day<0||day>6) || new Set(task.repeatDays).size!==task.repeatDays.length) || task.repeat==='custom' && !task.repeatDays?.length) throw Error('Invalid custom weekdays.');
    }
    for(const goal of data.goals) {
        if(goal.targetHistory!==undefined) {
            if(!Array.isArray(goal.targetHistory)||!goal.targetHistory.length||goal.targetHistory.length>1000)throw Error('Invalid goal target history.');
            for(const rule of goal.targetHistory) {
                if(!object(rule)||!date(rule.effective)||!date(rule.start)||!Number.isInteger(rule.target)||rule.target<1||!['day','week','month','year'].includes(rule.period)||!repeats.includes(rule.repeat)||!Array.isArray(rule.repeatDays)||rule.repeatDays.some(day=>!Number.isInteger(day)||day<0||day>6)||new Set(rule.repeatDays).size!==rule.repeatDays.length||rule.repeat==='custom'&&!rule.repeatDays.length)throw Error('Invalid goal target history.');
            }
            if(new Set(goal.targetHistory.map(rule=>rule.effective)).size!==goal.targetHistory.length)throw Error('Duplicate target history dates.');
        }
        if(goal.scheduleTaskId!==undefined && (!id(goal.scheduleTaskId) || data.tasks.some(t=>t.id===goal.scheduleTaskId && t.goalId!==goal.id))) throw Error('Invalid automatic goal schedule.');
    }
    if(Object.entries(data.completedOccurrences).some(([key,value])=>!date(key.slice(key.lastIndexOf('_')+1))||typeof value!=='boolean'||!data.tasks.some(t=>String(t.id)===key.slice(0,key.lastIndexOf('_')))))throw Error('Invalid completion history.');
    if(!Number.isInteger(data.settings.startHour)||!Number.isInteger(data.settings.endHour)||data.settings.startHour<0||data.settings.endHour>24||data.settings.startHour>=data.settings.endHour||![0,1].includes(data.settings.weekStart))throw Error('Invalid settings.');
    if(data.settings.theme !== undefined && !['forest','ocean'].includes(data.settings.theme))throw Error('Invalid theme.');
    data.settings.theme ||= 'forest';
    return data;
}
document.addEventListener('DOMContentLoaded',()=>{
    const pool=document.querySelector('.goal-pool-section');
    $('todayPage').insertBefore(pool,$('untimedTasks'));
    $('todayPage').insertBefore($('agendaList'),$('phoneDaySchedule'));
    document.querySelectorAll('p.form-help').forEach(note=>{
        if(note.closest('details'))return;
        const info=document.createElement('details');info.className='info-note';
        const summary=document.createElement('summary');summary.textContent='i';summary.setAttribute('aria-label','Show information');
        note.before(info);info.append(summary,note);
    });
    const tips=document.querySelector('.schedule-tips');tips.classList.add('info-note');
    tips.querySelector('summary').textContent='i';tips.querySelector('summary').setAttribute('aria-label','How to schedule');
    setupWeekdays('taskWeekdays');setupWeekdays('goalWeekdays');
    $('taskRepeat').onchange=syncTaskWeekdays;
    // Keep the form within the visible area when the iPhone keyboard opens.
    if(window.visualViewport) {
        const fitKeyboard = () => {
            document.documentElement.style.setProperty('--keyboard-height', `${window.visualViewport.height}px`);
            document.documentElement.style.setProperty('--keyboard-top', `${window.visualViewport.offsetTop}px`);
        };
        window.visualViewport.addEventListener('resize', fitKeyboard);
        window.visualViewport.addEventListener('scroll', fitKeyboard);
        fitKeyboard();
    }
    for(let hour=0;hour<=24;hour++) {
        const label=hour===24?'Midnight (end of day)':formatTime(timeValue(hour*60));
        if(hour<24)$('visibleStart').add(new Option(label,String(hour)));
        if(hour>0)$('visibleEnd').add(new Option(label,String(hour)));
    }
    document.querySelectorAll('.nav-item').forEach(button=>{const match=button.getAttribute('onclick').match(/'([^']+)'/);button.dataset.page=match[1];button.setAttribute('aria-label',button.textContent.trim());});
    $('jumpDate').onchange = event => { if(event.target.value && !isNaN(parseDate(event.target.value))) {selectedDate=parseDate(event.target.value);refreshEverything();} };
    const svg = path => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
    const icons = [
        '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
        '<path d="M4 4h16v16H4zM4 14h5l2 3h2l2-3h5"/>',
        '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18M9 11v10m6-10v10"/>',
        '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2m-8 3h2m4 0h2"/>',
        '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'
    ];
    document.querySelectorAll('.nav-icon').forEach((icon,index)=>icon.innerHTML=svg(icons[index]));
    document.querySelector('.logo-icon').innerHTML=svg('<path d="m5 12 4 4L19 6"/>');
    document.querySelector('.settings-button').textContent='Settings';
    document.querySelectorAll('.date-arrow').forEach((button,index)=>button.innerHTML=svg(index?'<path d="m9 5 7 7-7 7"/>':'<path d="m15 5-7 7 7 7"/>'));
    installDaySwipe();
    document.querySelector('.settings-button').onclick=openSettings;
    document.querySelector('.settings-button').setAttribute('aria-label','Settings and backups');
    document.querySelectorAll('.close-button').forEach(button=>button.setAttribute('aria-label','Close dialog'));
    document.querySelectorAll('.color-option input').forEach(input=>input.setAttribute('aria-label',input.value));
    $('taskScope').onchange=syncScope;
    $('taskForm').onsubmit=event=>{
        event.preventDefault();const name=$('taskName').value.trim(),date=$('taskDate').value,time=$('taskTime').value,duration=Number($('taskDuration').value);
        if(!name){$('taskName').setCustomValidity('Enter a task name.');$('taskName').reportValidity();return;}
        if(!Number.isInteger(duration)||duration<15||duration>1440)return;
        const values={name,date,time,duration,icon:$('taskIcon').value,color:document.querySelector('input[name="color"]:checked').value,notes:$('taskNotes').value.trim(),inbox:!date};
        const base=tasks.find(t=>t.id===editingTaskId),repeat=$('taskRepeat').value,repeatDays=getWeekdays('taskWeekdays');
        const single=base&&recurring(base)&&$('taskScope').value==='occurrence';
        if(!single && repeat==='custom' && (!repeatDays.length || !date)) {notify('Choose a starting date and at least one weekday.');return;}
        remember();
        if(base&&recurring(base)&&$('taskScope').value==='occurrence'){
            if(!date){notify('Choose a date for this occurrence, or edit the whole series to move it to Inbox.');return;}
            base.exceptions ||= {};base.exceptions[editingDate]={...values};
        } else if(base){if(base.repeat!==repeat){clearCompletion(base.id);delete base.exceptions;base.completed=false;}Object.assign(base,values,{repeat,repeatDays:repeat==='custom'?repeatDays:[]});}
        else tasks.push({id:uid(),...values,repeat,repeatDays:repeat==='custom'?repeatDays:[],completed:false,...(draftGoalId?{goalId:draftGoalId}:{})});
        saveAll();closeTaskEditor();refreshEverything();notify('Task saved.',true);
    };
    $('taskName').oninput=()=>$('taskName').setCustomValidity('');
    $('goalRepeat').onchange=syncGoalSchedule;
    $('goalForm').onsubmit=event=>{
        event.preventDefault();
        const name=$('goalName').value.trim(),target=Number($('goalTarget').value),repeat=$('goalRepeat').value,date=$('goalStartDate').value,time=$('goalTime').value;
        if(!name||!Number.isInteger(target)||target<1){notify('Enter a goal name and a whole-number target of at least 1.');return;}
        if(repeat==='custom' && !getWeekdays('goalWeekdays').length) {notify('Select at least one weekday.');return;}
        if(repeat!=='none' && (!date || isNaN(parseDate(date)) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {notify('Choose a starting date and time for automatic sessions.');return;}
        remember();
        const value={name,target,period:$('goalPeriod').value,duration:Number($('goalDuration').value),icon:$('goalIcon').value,color:document.querySelector('input[name="goalColor"]:checked').value,description:$('goalNotes').value.trim()};
        let goal=goals.find(g=>g.id===editingGoalId);
        const effective=$('goalEffectiveDate').value;
        if(!effective || isNaN(parseDate(effective))) {notify('Choose an effective date for target changes.');return;}
        const rule={target,period:value.period,repeat,repeatDays:repeat==='custom'?getWeekdays('goalWeekdays'):[],start:repeat==='none'?effective:date};
        if(goal)recordGoalTarget(goal,rule,effective);
        if(goal)Object.assign(goal,value);else {goal={id:uid(),...value};goals.push(goal);}
        if(!goal.targetHistory)goal.targetHistory=[{effective:repeat==='none'?effective:date,...rule}];
        saveGoalSchedule(goal,repeat,date,time,getWeekdays('goalWeekdays'),effective);
        saveAll();closeGoalEditor();refreshEverything();notify(repeat==='none'?'Goal saved.':'Goal saved with automatic sessions.',true);
    };
    $('settingsForm').onsubmit=event=>{event.preventDefault();const start=Number($('visibleStart').value),end=Number($('visibleEnd').value);if(start>=end){$('settingsError').textContent='End hour must be later than start hour.';return;}settings={startHour:start,endHour:end,weekStart:Number($('weekStart').value),theme:$('themeChoice').value};saveAll();closeModal('settingsModal');refreshEverything();notify('Settings saved. Hours expand automatically to include your tasks.');};
    $('importFile').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>10*1024*1024)throw Error('Choose a backup smaller than 10 MB.');const data=validateBackup(JSON.parse(await file.text()));remember();({tasks,goals,completedOccurrences,settings}=clone(data));saveAll();closeModal('settingsModal');refreshEverything();notify('Backup restored. You can undo this replacement.',true);}catch(error){$('settingsError').textContent=error.message;}finally{event.target.value='';}};
    document.querySelectorAll('.modal').forEach(modal=>{modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby',modal.id==='taskModal'?'modalTitle':modal.id==='goalModal'?'goalModalTitle':'settingsTitle');modal.addEventListener('click',event=>{if(event.target===modal){if(modal.id==='taskModal')closeTaskEditor();else if(modal.id==='goalModal')closeGoalEditor();else closeModal(modal.id);}});});
    document.addEventListener('keydown',event=>{const modal=document.querySelector('.modal:not(.hidden)');if(!modal)return;if(event.key==='Escape'){if(modal.id==='taskModal')closeTaskEditor();else if(modal.id==='goalModal')closeGoalEditor();else closeModal(modal.id);}if(event.key==='Tab'){const focusable=[...modal.querySelectorAll('button,input,select,textarea,summary,[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
    showPage('today');setInterval(()=>{renderNow();updateProgress();},30000);
});
