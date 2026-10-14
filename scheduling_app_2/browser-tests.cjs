// Dependency-free Chrome smoke tests. Run with Node; uses a fresh temporary profile.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const chrome=process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'my-day-check-'));
let html=fs.readFileSync(__dirname+'/index.html','utf8');
html=html.replace('href="styles.css"',`href="file:///${path.join(__dirname,'styles.css').replaceAll('\\','/')}"`);
html=html.replace('<script src="script.js"></script>',`<script>${fs.readFileSync(__dirname+'/script.js','utf8')}</script>`);
html=html.replace('<head>',`<head><script>localStorage.clear();localStorage.setItem('myDayInitialized','true');window.addEventListener('error',e=>{document.body?.setAttribute('data-error',e.message);});</script>`);
const checks=String.raw`
document.addEventListener('DOMContentLoaded',async()=>{
    const results=[];
    const assert=(condition,message)=>{if(!condition)throw Error(message);};
    const test=(name,action)=>{try{action();results.push('PASS '+name);}catch(error){results.push('FAIL '+name+': '+error.message);}};
    const submit=id=>$(id).dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    test('Initial render and settings hours',()=>{
        assert($('todayPage').classList.contains('hidden')===false,'Today is hidden');
        assert($('visibleStart').options.length===24,'missing start options');
        assert($('visibleEnd').options.length===24,'missing end options');
    });
    test('Single day navigation, swipe direction and vertical scrolling',()=>{
        const selector=document.querySelector('.date-selector');
        assert(selector.classList.contains('single-day'),'not a single day');
        assert($('dateContainer').children.length===1,'multiple day cards');
        const arrows=[...document.querySelectorAll('.date-arrow')];
        assert(arrows.every(button=>button.querySelector('svg')),'missing arrow icons');
        const rects=arrows.map(button=>button.getBoundingClientRect());
        assert(Math.abs(rects[0].top-rects[1].top)<1,'arrows are on separate rows');
        const send=(type,x,y)=>{
            const event=new Event(type,{bubbles:true,cancelable:true});
            Object.defineProperty(event,'touches',{value:type==='touchend'?[]:[{clientX:x,clientY:y}]});
            Object.defineProperty(event,'changedTouches',{value:[{clientX:x,clientY:y}]});
            $('todayPage').dispatchEvent(event);return event;
        };
        selectedDate=parseDate('2026-10-05');refreshEverything();
        send('touchstart',280,300);send('touchmove',120,305);send('touchend',100,305);
        assert(formatDate(selectedDate)==='2026-10-06','left swipe did not advance');
        send('touchstart',100,300);send('touchmove',260,305);send('touchend',280,305);
        assert(formatDate(selectedDate)==='2026-10-05','right swipe did not go back');
        send('touchstart',200,300);const vertical=send('touchmove',205,150);send('touchend',205,100);
        assert(!vertical.defaultPrevented,'vertical scrolling blocked');
        assert(formatDate(selectedDate)==='2026-10-05','vertical scroll changed day');
        send('touchstart',200,300);send('touchmove',220,302);send('touchend',225,302);
        assert(formatDate(selectedDate)==='2026-10-05','short swipe changed day');
        showPage('week');send('touchstart',280,300);send('touchmove',120,305);send('touchend',100,305);
        assert(formatDate(selectedDate)==='2026-10-05','swipe changed week view');showPage('today');
    });
    test('Custom weekday task and goal schedules',()=>{
        tasks=[];goals=[];completedOccurrences={};selectedDate=parseDate('2026-10-05');
        openTaskEditor();$('taskName').value='Tuesday and Thursday';$('taskRepeat').value='custom';syncTaskWeekdays();
        submit('taskForm');assert(tasks.length===0,'empty custom schedule saved');
        $('taskWeekdays').querySelector('[data-day="2"]').click();$('taskWeekdays').querySelector('[data-day="4"]').click();
        submit('taskForm');const task=tasks[0];
        assert(tasksOnDate('2026-10-06').length===1 && tasksOnDate('2026-10-08').length===1,'selected days missing');
        assert(tasksOnDate('2026-10-07').length===0 && tasksOnDate('2026-10-04').length===0,'extra recurrence');
        openTaskEditor(false,task.id,'2026-10-06');
        assert($('taskWeekdays').querySelectorAll('[aria-pressed="true"]').length===2,'days not restored');
        assert($('taskWeekdays').querySelector('button').disabled,'occurrence can change recurrence');
        $('taskTime').value='10:00';submit('taskForm');
        assert(tasksOnDate('2026-10-08')[0].time==='09:00','occurrence changed series');
        openGoalEditor();$('goalName').value='Custom practice';$('goalRepeat').value='custom';syncGoalSchedule();
        $('goalWeekdays').querySelector('[data-day="2"]').click();$('goalWeekdays').querySelector('[data-day="4"]').click();submit('goalForm');
        const goal=goals[0];assert(tasks.find(t=>t.id===goal.scheduleTaskId).repeatDays.join(',')==='2,4','goal weekdays missing');
        openGoalEditor(goal.id);assert(getWeekdays('goalWeekdays').join(',')==='2,4','goal weekdays not restored');closeGoalEditor();
        const backup=clone({version:2,tasks,goals,completedOccurrences,settings});validateBackup(backup);
        backup.tasks[0].repeatDays=[7];let rejected=false;try{validateBackup(backup);}catch{rejected=true;}assert(rejected,'invalid weekdays accepted');
        tasks=[];goals=[];completedOccurrences={};
    });
    test('Goal pools group by coverage and sort by frequency',()=>{
        selectedDate=parseDate('2026-10-05');completedOccurrences={};
        goals=[['month','month',1],['weekly','week',4],['daily','day',1],['done','day',1]].map(([id,period,target])=>({id,name:id,period,target,duration:30,icon:'',color:'purple',description:''}));
        tasks=[{id:'partial',goalId:'weekly',name:'Partial',date:'2026-10-05',time:'09:00',duration:30,icon:'',color:'purple',notes:'',repeat:'none',inbox:false},
            {id:'complete',goalId:'done',name:'Done',date:'2026-10-05',time:'10:00',duration:30,icon:'',color:'purple',notes:'',repeat:'none',inbox:false,completed:true}];
        refreshEverything();
        const dropdowns=[...$('goalPool').querySelectorAll('details')];
        assert(dropdowns.length===2 && dropdowns.every(group=>!group.open),'goal pools not collapsed');
        assert(dropdowns[1].querySelector('summary').textContent.startsWith('Scheduled ('),'scheduled label incorrect');
        dropdowns[0].open=true;renderGoalPool();
        assert($('goalPool').querySelector('details').open,'expanded state lost on refresh');
        const pool=document.querySelector('.goal-pool-section');
        assert(pool.compareDocumentPosition($('phoneDaySchedule')) & Node.DOCUMENT_POSITION_FOLLOWING,'goal pool not before schedule');
        assert(document.querySelector('.info-note summary'),'information bubble missing');
        const ids=group=>[...$('goalPool').querySelectorAll('[data-group="'+group+'"] .goal-pool-card')].map(el=>el.dataset.goalId).join(',');
        assert(ids('needs-scheduling')==='daily,weekly,month','frequency order or partial coverage wrong');
        assert(ids('covered')==='done','completed goal not covered');
        saveGoalSchedule(goals.find(g=>g.id==='daily'),'daily','2026-10-05','08:00');refreshEverything();
        assert(ids('covered')==='daily,done','scheduled goal not moved');
        const input=$('jumpDate').getBoundingClientRect(),arrows=[...document.querySelectorAll('.date-arrow')].map(el=>el.getBoundingClientRect());
        assert(input.left>=arrows[0].right && input.right<=arrows[1].left,'date overlaps arrows');
        if(window.matchMedia('(max-width: 600px)').matches) assert(Math.abs((input.left+input.right)-(arrows[0].left+arrows[1].right))<2,'date not centered');
        tasks=[];goals=[];completedOccurrences={};
    });
    test('Automatic goals, occurrence edits, backups and optional icons',()=>{
        goals=[];tasks=[];completedOccurrences={};selectedDate=parseDate('2026-10-05');
        openTaskEditor();assert($('taskIcon').value==='','task icon default');closeTaskEditor();
        openGoalEditor();assert($('goalIcon').value==='','goal icon default');
        $('goalName').value='Daily reading';$('goalRepeat').value='daily';syncGoalSchedule();
        $('goalStartDate').value='2026-10-05';$('goalTime').value='08:00';submit('goalForm');
        const goal=goals[0],series=tasks[0];
        assert(tasks.length===1 && series.goalId===goal.id && series.repeat==='daily','automatic series missing');
        assert(tasksOnDate('2026-10-06')[0].time==='08:00','next session missing');
        assert(!$('timeline').querySelector('.task-icon'),'blank icon still rendered');
        toggleTask(series.id,'2026-10-05');
        assert(goalStats(goal,selectedDate).completed===1,'goal completion not counted');
        openTaskEditor(false,series.id,'2026-10-06');$('taskTime').value='10:00';submit('taskForm');
        openGoalEditor(goal.id);$('goalTime').value='09:00';submit('goalForm');
        assert(tasks.length===1,'editing goal duplicated series');
        assert(tasksOnDate('2026-10-07')[0].time==='09:00','series time not updated');
        assert(tasksOnDate('2026-10-06')[0].time==='10:00','occurrence edit lost');
        assert(completedOccurrences[series.id+'_2026-10-05'],'completion lost');
        const restored=validateBackup(clone({version:2,tasks,goals,completedOccurrences,settings}));
        assert(restored.goals[0].scheduleTaskId===series.id,'backup lost automatic schedule');
        openGoalEditor(goal.id);$('goalRepeat').value='none';syncGoalSchedule();submit('goalForm');
        assert(tasks.length===0,'automatic series not removed');undoChange();
        assert(tasks.length===1 && goals[0].scheduleTaskId===series.id,'undo did not restore schedule');
        openTaskEditor();$('taskName').value='No icon task';$('taskTime').value='11:00';submit('taskForm');
        assert(tasks.at(-1).icon==='','task icon default not saved');
        tasks=[];goals=[];completedOccurrences={};
    });
    goals=[{id:'goal',name:'Practice',target:4,period:'week',duration:30,icon:'🎸',color:'purple',description:'Daily practice'}];
    tasks=[];selectedDate=parseDate('2026-10-05');refreshEverything();
    test('Goal draft cancelled without saving',()=>{
        scheduleGoal('goal');assert(tasks.length===0,'draft saved too early');closeTaskEditor();assert(tasks.length===0,'cancel persisted task');
    });
    test('Goal session save and goal commitments',()=>{
        scheduleGoal('goal');submit('taskForm');assert(tasks.length===1,'session missing');assert(tasks[0].goalId==='goal','goal connection missing');
        assert($('goalPool').textContent.includes('1 scheduled'),'commitments missing');
    });
    test('Occurrence edit, completion and single deletion',()=>{
        tasks=[{id:'repeat',name:'Study',date:'2026-10-05',time:'09:00',duration:60,icon:'📚',color:'blue',notes:'',repeat:'daily',inbox:false}];
        openTaskEditor(false,'repeat','2026-10-06');assert($('taskDate').value==='2026-10-06','wrong occurrence date');
        $('taskTime').value='10:00';submit('taskForm');assert(tasks[0].time==='09:00','series unexpectedly changed');assert(tasksOnDate('2026-10-06')[0].time==='10:00','override missing');
        toggleTask('repeat','2026-10-06');assert(completedOccurrences['repeat_2026-10-06'],'completion missing');
        openTaskEditor(false,'repeat','2026-10-07');deleteCurrentTask();assert(tasksOnDate('2026-10-07').length===0,'occurrence not deleted');assert(tasksOnDate('2026-10-08').length===1,'series deleted');
        undoChange();assert(tasksOnDate('2026-10-07').length===1,'undo failed');
    });
    test('Series edit and deletion',()=>{
        openTaskEditor(false,'repeat','2026-10-08');$('taskScope').value='series';syncScope();$('taskName').value='Study series';submit('taskForm');assert(tasks[0].name==='Study series','series name unchanged');
        openTaskEditor(false,'repeat','2026-10-08');$('taskScope').value='series';deleteCurrentTask();assert(tasks.length===0,'series not removed');undoChange();
    });
    test('Week and month arrows refresh visible view',()=>{
        selectedDate=parseDate('2026-10-05');showPage('week');const before=$('weekHeading').textContent;changeDate(1);assert($('weekHeading').textContent!==before,'stale week');assert(formatDate(selectedDate)==='2026-10-12','wrong week step');
        showPage('month');changeDate(1);assert($('monthHeading').textContent==='November 2026','stale month');goToToday();assert($('monthHeading').textContent===new Date().toLocaleDateString('en-US',{month:'long',year:'numeric'}),'Today failed in month');
    });
    test('Overlaps, short tasks and extended timeline',()=>{
        selectedDate=parseDate('2026-10-05');tasks=[
            {id:'early',name:'Early',date:'2026-10-05',time:'04:00',duration:15,icon:'⭐',color:'purple',notes:'',repeat:'none',inbox:false},
            {id:'one',name:'One',date:'2026-10-05',time:'09:00',duration:60,icon:'⭐',color:'purple',notes:'',repeat:'none',inbox:false},
            {id:'two',name:'Two',date:'2026-10-05',time:'09:15',duration:30,icon:'⭐',color:'blue',notes:'',repeat:'none',inbox:false}
        ];showPage('today');
        const cards=[...document.querySelectorAll('.task-card')];assert(cards.length===3,'missing cards');

            assert($('phoneDaySchedule').querySelectorAll('.phone-schedule-row').length===3,'phone tasks missing');
        assert($('timeline').dataset.start==='240','early task clipped');
        assert(getComputedStyle(document.querySelector('.timeline-container')).display!=='none','full timeline hidden');
        assert(cards[1].getBoundingClientRect().left!==cards[2].getBoundingClientRect().left,'overlapping tasks hide each other');
        assert(Math.abs(cards[1].getBoundingClientRect().height-63)<1,'one hour block not proportional');
        assert(Math.abs(cards[2].getBoundingClientRect().height-30.5)<1,'half hour block not proportional');
        assert($('timeline').querySelector('.timeline-end-label'),'end time label missing');
    });
    test('Pointer drag and resize save snapped values',()=>{
        const card=document.querySelectorAll('.task-card')[1];const item=timelineItems('2026-10-05').find(i=>i.task.id==='one');
        card.setPointerCapture=()=>{};
        beginDrag({button:0,target:card,clientY:100,pointerId:1},card,item,240);card.onpointermove({clientY:132.5});card.onpointerup();assert(tasks.find(t=>t.id==='one').time==='09:30','drag not snapped');
        const newCard=[...document.querySelectorAll('.task-card')].find(el=>el.textContent.includes('One'));newCard.setPointerCapture=()=>{};
        beginDrag({button:0,target:newCard.querySelector('.resize-handle'),clientY:100,pointerId:1},newCard,timelineItems('2026-10-05').find(i=>i.task.id==='one'),240);newCard.onpointermove({clientY:116.25});newCard.onpointerup();assert(tasks.find(t=>t.id==='one').duration===75,'resize failed');
    });
    test('Shared schedule editing and modal focus trapping',()=>{
        suppressClickUntil=0;document.querySelector('.task-card[data-task-id="one"] ').click();
        assert($('taskName').value==='One','task edit failed');
        assert(document.activeElement===$('taskName'),'name not focused');
        const buttons=$('taskModal').querySelectorAll('button'),last=buttons[buttons.length-1];last.focus();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));
        assert($('taskModal').contains(document.activeElement)&&document.activeElement!==last,'focus not trapped');
        document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert($('taskModal').classList.contains('hidden'),'Escape failed');
    });
    test('Settings save and Inbox styling',()=>{
        openSettings();$('visibleStart').value='8';$('visibleEnd').value='20';$('weekStart').value='1';submit('settingsForm');assert(settings.weekStart===1,'settings not saved');
        tasks.push({id:'inbox',name:'Unscheduled',date:'',time:'',duration:60,icon:'⭐',color:'purple',notes:'',repeat:'none',inbox:true});showPage('inbox');const card=$('inboxTasks').querySelector('.inbox-card');assert(card&&getComputedStyle(card).display==='flex','Inbox styling missing');
    });
    test('Backup validation',()=>{
        const data={version:2,tasks,goals,completedOccurrences,settings};
        completedOccurrences={};data.completedOccurrences={};assert(validateBackup(JSON.parse(JSON.stringify(data))).tasks.length===tasks.length,'backup not accepted');
    });
    test('Theme switch persists, applies palette, and supports old backups',()=>{
        openSettings();$('themeChoice').value='ocean';submit('settingsForm');
        assert(document.documentElement.dataset.theme==='ocean','theme not applied');
        assert(getComputedStyle(document.documentElement).getPropertyValue('--pumpkin').trim()==='#FF6700','ocean palette missing');
        assert(JSON.parse(localStorage.getItem('myDaySettings')).theme==='ocean','theme not saved');
        openSettings();assert($('themeChoice').value==='ocean','saved choice missing');closeModal('settingsModal');
        const backup={version:2,tasks,goals,completedOccurrences:{},settings:{startHour:6,endHour:24,weekStart:0}};
        assert(validateBackup(backup).settings.theme==='forest','old backup incompatible');
        backup.settings.theme='invalid';let rejected=false;try{validateBackup(backup);}catch{rejected=true;}assert(rejected,'invalid theme accepted');
        openSettings();$('themeChoice').value='forest';submit('settingsForm');assert(document.documentElement.dataset.theme==='forest','forest switch failed');
    });
    try {
        let blob,download;
        const originalURL=URL.createObjectURL,originalClick=HTMLAnchorElement.prototype.click;
        URL.createObjectURL=value=>{blob=value;return originalURL(value);};
        HTMLAnchorElement.prototype.click=function(){download=this.download;};
        try {exportBackup();} finally {URL.createObjectURL=originalURL;HTMLAnchorElement.prototype.click=originalClick;}
        const data=validateBackup(JSON.parse(await blob.text()));
        assert(download.endsWith('.json')&&data.tasks.length===tasks.length,'export missing data');results.push('PASS Exported backup contents');
    }catch(error){results.push('FAIL Exported backup contents: '+error.message);}
    try {
        const data={version:2,tasks,goals,completedOccurrences,settings};
        const file=new File([JSON.stringify(data)],'backup.json',{type:'application/json'});
        tasks=[];openSettings();await $('importFile').onchange({target:{files:[file],value:'backup.json'}});
        assert(tasks.length===data.tasks.length,'import lost tasks');
        results.push('PASS Backup restore and undo');undoChange();assert(tasks.length===0,'restore undo failed');
    }catch(error){results.push('FAIL Backup restore and undo: '+error.message);}
    test('Midnight rendering and current-time indicator',()=>{
        tasks=[{id:'night',name:'Night session',date:'2026-10-05',time:'23:30',duration:90,icon:'⭐',color:'purple',notes:'',repeat:'none',inbox:false}];selectedDate=parseDate('2026-10-06');showPage('today');
        assert(document.querySelector('.task-card').textContent.includes('Continued'),'midnight continuation missing');assert($('timeline').dataset.start==='0','midnight clipped');
        selectedDate=new Date();tasks=[{id:'now',name:'Current session',date:formatDate(selectedDate),time:'00:00',duration:1440,icon:'⭐',color:'purple',notes:'',repeat:'none',inbox:false}];refreshEverything();
        assert(document.querySelector('.now-line'),'Now line missing');assert($('upNext').textContent.includes('Now: Current session'),'Now task missing');
        toggleTask('now',formatDate(selectedDate));assert($('upNext').textContent==='No more scheduled tasks','completed task still up next');
    });
    test('Agenda editing, completion, empty state and date jump',()=>{
        selectedDate=parseDate('2026-10-05');
        tasks=[{id:'agenda',name:'Agenda task',date:'2026-10-05',time:'09:00',duration:60,icon:'',color:'purple',notes:'',repeat:'none',inbox:false}];
        refreshEverything();setDayView('agenda');
        assert(document.querySelector('.timeline-container').hidden,'timeline still visible');
        assert($('agendaList').textContent.includes('Agenda task'),'task missing');
        document.querySelector('.agenda-check').click();assert(tasks[0].completed,'completion failed');
        document.querySelector('.agenda-edit').click();assert(editingTaskId==='agenda','editor missing');closeTaskEditor();
        $('jumpDate').value='2026-10-06';$('jumpDate').dispatchEvent(new Event('change'));
        assert(formatDate(selectedDate)==='2026-10-06','date jump failed');
        assert($('agendaList').textContent.includes('Add your first task'),'empty state missing');
        setDayView('timeline');assert(!document.querySelector('.timeline-container').hidden,'timeline not restored');
    });
    test('Mobile layout fits viewport',()=>{
        tasks=[{id:'layout',name:'A longer task name to verify small-screen layout',date:formatDate(selectedDate),time:'09:00',duration:60,icon:'⭐',color:'purple',notes:'',repeat:'none',inbox:false}];
        for(const page of ['today','week','month','goals','inbox']){showPage(page);assert(document.documentElement.scrollWidth<=window.innerWidth,page+' has horizontal overflow');}
        showPage('today');
    });
    test('Separate goals page reports calendar month and year progress',()=>{
        const original=clone({tasks,goals,completedOccurrences});
        goals=[{id:'report-goal',name:'Reading',period:'week',target:3,duration:30,icon:'',color:'purple',description:''}];
        tasks=[{id:'report-series',goalId:'report-goal',name:'Reading',date:'2026-10-01',time:'08:00',duration:30,icon:'',color:'purple',notes:'',repeat:'daily',inbox:false}];
        completedOccurrences={'report-series_2026-10-02':true,'report-series_2026-10-03':true};
        goalProgressDate=parseDate('2026-10-12');goalProgressView='month';showPage('goals');
        assert(document.querySelector('.date-selector').classList.contains('hidden'),'schedule date selector crowds Goals');
        assert($('goalProgressSummary').textContent.includes('2 completed sessions') && $('goalProgressSummary').textContent.includes('29 scheduled sessions'),'monthly totals incorrect');
        assert($('goalsContainer').querySelectorAll('.goal-card').length===1,'all goals missing');
        const totals=goalProgressReport('month',goalProgressDate).byGoal.get('report-goal');
        assert(totals.percentage===15,'prorated monthly completion percentage incorrect');
        assert($('goalsContainer').querySelector('.goal-calendar-donut').textContent==='15%','calendar donut missing');
        setGoalProgressView('year');assert($('goalYearChart').children.length===12,'missing monthly chart');
        assert($('goalProgressSummary').textContent.includes('90 scheduled sessions'),'year totals incorrect');
        changeGoalProgressPeriod(-1);assert($('goalProgressHeading').textContent==='2025','year navigation failed');
        assert($('goalProgressSummary').textContent.includes('0 completed sessions'),'prior year contains later sessions');
        changeGoalProgressPeriod(1);setGoalProgressView('month');
        $('goalsContainer').querySelector('.goal-edit-button').click();assert($('goalName').value==='Reading','edit unavailable');
        $('goalName').value='Read books';submit('goalForm');assert($('goalsContainer').textContent.includes('Read books'),'edit not refreshed');
        assert(document.documentElement.scrollWidth<=innerWidth,'goal dashboard horizontal overflow');
        ({tasks,goals,completedOccurrences}=original);showPage('today');
    });
    test('Phone schedule uses explicit adding and retains task controls',()=>{

        const snapshot=JSON.stringify(tasks);suppressClickUntil=0;
        $('timeline').click();$('phoneDaySchedule').click();
        assert($('taskModal').classList.contains('hidden'),'blank schedule opens editor');
        document.querySelector('.phone-schedule-add').click();assert(!$('taskModal').classList.contains('hidden'),'plus does not open editor');closeTaskEditor();
        assert(JSON.stringify(tasks)===snapshot,'adding draft changed tasks');
        const row=$('timeline').querySelector('.task-card');
        row.querySelector('.task-checkbox').click();
        assert($('timeline').querySelector('.task-checkbox').getAttribute('aria-pressed')==='true','phone completion failed');
        assert($('phoneDaySchedule').scrollWidth<=$('phoneDaySchedule').clientWidth,'phone schedule overflows');
        assert(getComputedStyle(document.querySelector('.timeline-container')).display!=='none','timeline missing');assert(getComputedStyle(document.querySelector('.time-line')).display==='none','hour lines visible');
        setDayView('agenda');assert($('phoneDaySchedule').hidden,'phone schedule persists in agenda');setDayView('timeline');
    });
    const output=document.createElement('pre');output.id='test-results';output.textContent=results.join('\n');document.body.append(output);
    document.body.dataset.tests=results.some(r=>r.startsWith('FAIL'))?'failed':'passed';
});`;
html=html.replace('</body>',`<script>${checks}</script></body>`);
const file=path.join(temp,'test.html');fs.writeFileSync(file,html);
const mobile=process.argv.includes('--mobile');
const result=spawnSync(chrome,['--headless','--disable-gpu','--in-process-gpu','--no-sandbox','--no-first-run','--no-default-browser-check',`--user-data-dir=${path.join(temp,'profile')}`,`--window-size=${mobile?'390,844':'1440,1000'}`,'--virtual-time-budget=2000','--dump-dom','file:///'+file.replaceAll('\\','/')],{encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024,windowsHide:true});
const output=result.stdout?.match(/<pre id="test-results">([\s\S]*?)<\/pre>/)?.[1];
console.log(output || result.stderr || result.error);
if(!output||output.includes('FAIL')||result.stdout.includes('data-error=')){
    console.error(result.stdout?.match(/data-error="([^"]*)"/)?.[1]||'Browser checks failed');process.exitCode=1;
}
