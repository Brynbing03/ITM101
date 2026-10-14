# My Day

Open `index.html` in a browser. Tasks, goals, settings, and completion history are stored locally in that browser; existing saved tasks and goals are retained.

The app opens to a single day. Use the arrows or date picker to change dates; on phones, swipe left for the next day or right for the previous day. Vertical swipes scroll. Week and Month remain available in navigation. On phones, tap a task to edit its time or duration; dragging remains available with a mouse.

- Click an empty time to create a task. Goal sessions are drafts until you save them.
- On phones, the day timeline is a chronological list with side time labels and completion circles. Use the floating plus button to add a task; empty schedule space does not create one. Tap a task to edit. Overlaps appear as separate rows rather than narrow columns. Desktop uses the same chronological schedule and plus button as phones.
- Drag tasks to move them or drag their bottom edge to resize, snapping to 15 minutes. Repeating tasks move or resize for that occurrence only.
- Focus a timeline task and use Up/Down to move it, Shift + Up/Down to resize, or Enter to edit it.
- Choose **This occurrence** or **The whole series** when editing or deleting a repeating task. Series edits preserve existing occurrence exceptions.
- Week and Month arrows move by a week or month. Select a day to open its timeline.
- Settings let you switch between Forest (green and porcelain) and Ocean (blue and pumpkin) palettes. Your choice is saved in this browser and included in backups.
- Settings control visible hours and Sunday/Monday week starts. Hours expand automatically to include tasks; overnight sessions continue on the next day.
- Goal cards show completed, scheduled, and still-needed sessions for the selected period.
- The goal pool separates Needs scheduling from Scheduled / covered. A goal is covered when its completed and scheduled sessions meet its target for the selected period; partially scheduled goals remain in Needs scheduling. Each group sorts by daily, weekly, monthly, then yearly goals.
- Open Goals from navigation or View Goals for a separate progress page. Browse calendar months and years, review completed/scheduled session totals and the yearly monthly-completions chart, and edit any goal. Calendar totals count sessions; each goal's target remains tied to its own daily, weekly, monthly, or yearly period.
- Monthly/yearly donut charts compare completions with expected sessions. Automatic goals count planned recurrence dates; flexible targets prorate across calendar days (including leap years). Expected totals are kept precise internally and displayed approximately when fractional. Scheduled sessions do not increase completion percentage; extra completions are shown separately. Target changes have an effective date and preserve earlier expectations. Existing goals infer their initial date from saved schedules, or January 1 of the current year when no dated sessions exist.
- In the goal editor, choose an automatic schedule (daily, weekdays, weekly, or monthly) and its starting date and time. Sessions appear automatically and count toward the goal. Editing the goal updates its automatic series while preserving individual session exceptions. Switching to manual removes that series; Undo is available.
- New tasks and goals default to No icon; choose an icon if desired.
- Choose Custom days of the week for tasks or automatic goals, then select weekday circles (for example, Tuesday and Thursday). Sessions repeat on those days from the starting date onward. Select at least one day.
- Export and restore JSON backups in Settings. Restoring replaces current data and can be undone. Undo restores the most recent task/goal change or import during the current session.

## Install on a phone

This folder now includes an app manifest, phone icons, and a service worker that caches the app for offline use. Installation requires an HTTPS website address; opening `index.html` directly is still useful for previews but does not enable installation or offline caching.

Publish the contents of this folder to a static HTTPS host. No build step is needed. Include `index.html`, `styles.css`, `script.js`, `pwa.js`, `sw.js`, `manifest.webmanifest`, and the `icons` folder. The README and test files do not need to be published. Files can also be hosted in a subdirectory.

Open the hosted address online once and check **Settings → Use on your phone** for the offline-ready message. On iPhone, use Safari's Share → Add to Home Screen and enable **Open as Web App** if shown. On Android, use Chrome's installation menu or the **Install My Day** button in Settings when available.

For local PWA testing, run `python -m http.server 8000` from this folder and open `http://localhost:8000`. A phone needs the hosted HTTPS address; a computer's `localhost` address does not point to that computer from a phone.

Tasks and settings remain local to each browser or installed app. Export a backup from your current app, then restore it in the installed app if you want to transfer your schedule. Offline mode becomes available after the first successful online setup. When publishing updates, bump `VERSION` in `sw.js`; an updated worker activates after the old app windows close. Browser storage removal also removes saved schedules and offline files.

## Checks

With Node available:

```powershell
node --check experiments/scheduling_app_2/script.js
node experiments/scheduling_app_2/tests.cjs
node experiments/scheduling_app_2/browser-tests.cjs
node experiments/scheduling_app_2/browser-tests.cjs --mobile
node experiments/scheduling_app_2/pwa-tests.cjs
```

The browser checks use a fresh temporary Chrome profile, keeping your browser data separate. Set `CHROME_PATH` if Chrome is installed somewhere other than the default Windows location. The checks load only a generated local test page.

The day schedule on phone and desktop shows the full visible-hour range with task blocks proportional to duration. Time labels and short ticks stay in the side gutter; there are no full-width hourly lines. Use the plus button to add tasks and the editor to change their time or duration.