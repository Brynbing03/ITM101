// Run: node experiments/scheduling_app_2/tests.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const storage = new Map([['myDayTasks','[]'],['myDayInitialized','true']]);
const context = vm.createContext({
    document:{addEventListener(){}},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
    crypto:require('node:crypto').webcrypto, console, setTimeout, setInterval,
});
vm.runInContext(fs.readFileSync(__dirname+'/script.js','utf8'),context);
const run = code => vm.runInContext(code,context);
let count=0;
function test(name,code){run(code);count++;console.log('PASS '+name);}
context.assert=assert;
test('Calendar expectations handle leap years, custom days and partial months',`
    var calendarGoal={id:'calendar',target:1,period:'day',targetHistory:[{effective:'2024-01-01',start:'2024-01-01',repeat:'daily',repeatDays:[],target:1,period:'day'}]};
    assert.equal(goalExpectedSessions(calendarGoal,parseDate('2024-02-01'),parseDate('2024-02-29')),29);
    assert.equal(goalExpectedSessions(calendarGoal,parseDate('2024-01-01'),parseDate('2024-12-31')),366);
    calendarGoal.targetHistory=[{effective:'2026-10-01',start:'2026-10-01',repeat:'custom',repeatDays:[2,4],target:1,period:'day'}];
    assert.equal(goalExpectedSessions(calendarGoal,parseDate('2026-10-01'),parseDate('2026-10-31')),9);
    calendarGoal.targetHistory[0].effective='2026-10-15';calendarGoal.targetHistory[0].start='2026-10-15';
    assert.equal(goalExpectedSessions(calendarGoal,parseDate('2026-10-01'),parseDate('2026-10-31')),5);
`);
test('Flexible weekly targets prorate without accumulating rounded months',`
    var calendarGoal={id:'quota',target:3,period:'week',targetHistory:[{effective:'2026-01-01',start:'2026-01-01',repeat:'none',repeatDays:[],target:3,period:'week'}]};
    assert.ok(Math.abs(goalExpectedSessions(calendarGoal,parseDate('2026-04-01'),parseDate('2026-04-30'))-90/7)<1e-8);
    assert.ok(Math.abs(goalExpectedSessions(calendarGoal,parseDate('2026-01-01'),parseDate('2026-12-31'))-1095/7)<1e-8);
`);
test('Effective target history preserves earlier expectations',`
    var calendarGoal={id:'history',target:1,period:'day',targetHistory:[{effective:'2026-10-01',start:'2026-10-01',repeat:'daily',repeatDays:[],target:1,period:'day'}]};
    recordGoalTarget(calendarGoal,{start:'2026-10-01',repeat:'custom',repeatDays:[2,4],target:1,period:'day'},'2026-10-15');
    assert.equal(goalExpectedSessions(calendarGoal,parseDate('2026-10-01'),parseDate('2026-10-31')),19);
    assert.equal(goalExpectedSessions(calendarGoal,parseDate('2026-10-01'),parseDate('2026-10-14')),14);
    tasks=[{id:'series',goalId:'history',name:'Practice',date:'2026-10-01',time:'09:00',duration:30,repeat:'daily',repeatDays:[]}];calendarGoal.scheduleTaskId='series';
    completedOccurrences={'series_2026-10-02':true};
    saveGoalSchedule(calendarGoal,'weekly','2026-10-01','09:00',[],'2026-10-15');
    assert.equal(tasksOnDate('2026-10-02').length,1);
    assert.equal(isTaskCompleted(tasksOnDate('2026-10-02')[0],'2026-10-02'),true);
    assert.equal(tasksOnDate('2026-10-15').length,1);
    assert.equal(tasksOnDate('2026-10-16').length,0);
`);
test('Monthly repeats clamp to the last day and never precede their start',`
    assert.equal(taskOccursOnDate({date:'2026-01-31',repeat:'monthly'},'2026-02-28'),true);
    assert.equal(taskOccursOnDate({date:'2026-01-31',repeat:'monthly'},'2026-03-31'),true);
    assert.equal(taskOccursOnDate({date:'2026-01-31',repeat:'monthly'},'2025-12-31'),false);
`);
test('Weekday repeats omit weekends',`
    assert.equal(taskOccursOnDate({date:'2026-10-05',repeat:'weekdays'},'2026-10-09'),true);
    assert.equal(taskOccursOnDate({date:'2026-10-05',repeat:'weekdays'},'2026-10-10'),false);
`);
test('Recurring occurrences use their own date; moved and deleted exceptions do not duplicate',`
    tasks=[{id:'repeat',name:'Practice',date:'2026-10-05',time:'09:00',duration:60,repeat:'daily',goalId:'goal',exceptions:{'2026-10-06':{date:'2026-10-08',time:'11:00'},'2026-10-07':{deleted:true}}}];
    assert.equal(tasksOnDate('2026-10-06').length,0);
    assert.equal(tasksOnDate('2026-10-07').length,0);
    assert.equal(tasksOnDate('2026-10-08').length,2);
    assert.equal(tasksOnDate('2026-10-09')[0].date,'2026-10-09');
    assert.equal(tasksOnDate('2026-10-08').find(t=>t.time==='11:00').sourceDate,'2026-10-06');
`);
test('Goal counts include recurring sessions that started in a previous period',`
    tasks=[{id:'repeat',name:'Practice',date:'2026-09-01',time:'09:00',duration:60,repeat:'daily',goalId:'goal'}];
    completedOccurrences={'repeat_2026-10-05':true,'repeat_2026-10-06':true};
    settings.weekStart=1;
    const result=goalStats({id:'goal',period:'week',target:8},parseDate('2026-10-07'));
    assert.equal(result.completed,2);assert.equal(result.scheduled,5);assert.equal(result.needed,1);
`);
test('Week boundaries follow Monday or Sunday settings',`
    settings.weekStart=1;assert.equal(formatDate(getGoalPeriodRange({period:'week'},parseDate('2026-10-07')).start),'2026-10-05');
    settings.weekStart=0;assert.equal(formatDate(getGoalPeriodRange({period:'week'},parseDate('2026-10-07')).start),'2026-10-04');
`);
test('Overlap groups reserve columns and reuse them for adjacent intervals',`
    const intervals=layoutIntervals([{start:540,end:600},{start:555,end:570},{start:570,end:630},{start:700,end:730}]);
    assert.equal(intervals[0].columns,2);assert.equal(intervals[1].column,1);assert.equal(intervals[2].column,1);assert.equal(intervals[3].columns,1);
`);
test('Midnight continuations retain the original occurrence completion key',`
    tasks=[{id:'night',name:'Night work',date:'2026-10-05',time:'23:30',duration:90,repeat:'none'}];
    const continuation=timelineItems('2026-10-06')[0];
    assert.equal(continuation.start,0);assert.equal(continuation.end,60);assert.equal(continuation.carry,true);assert.equal(continuation.task.sourceDate,'2026-10-05');
`);
test('Backup round trip and rejection of malformed settings, tasks, and exceptions',`
    tasks=[{id:'a',name:'Study',date:'2026-10-05',time:'09:00',duration:60,icon:'📚',color:'purple',notes:'',repeat:'none',inbox:false,completed:false}];
    goals=[];completedOccurrences={};settings={startHour:6,endHour:24,weekStart:0};
    const backup=clone({version:2,tasks,goals,completedOccurrences,settings});
    assert.equal(validateBackup(backup).tasks[0].name,'Study');
    const invalid=clone(backup);invalid.settings.endHour=5;assert.throws(()=>validateBackup(invalid));
    const invalidTask=clone(backup);invalidTask.tasks[0].time='25:00';assert.throws(()=>validateBackup(invalidTask));
    const invalidException=clone(backup);invalidException.tasks[0].exceptions={'2026-10-06':{repeat:'daily'}};assert.throws(()=>validateBackup(invalidException));
`);
test('Empty schedules remain empty on reload',`
    tasks=[];saveAll();assert.equal(localStorage.getItem('myDayTasks'),'[]');assert.equal(localStorage.getItem('myDayInitialized'),'true');
`);
const reloadContext=vm.createContext({document:{addEventListener(){}},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},crypto:require('node:crypto').webcrypto,setTimeout,setInterval});
vm.runInContext(fs.readFileSync(__dirname+'/script.js','utf8'),reloadContext);
assert.equal(vm.runInContext('tasks.length',reloadContext),0);
console.log(`${count} scheduling checks passed.`);
