# My Day

## Google accounts on Netlify

Google sign-in and sign-out are available under **Settings → Your account** after the configuration below is deployed. Google verifies the account; Netlify Database stores the Google account ID, email, display name, login dates, and expiring app sessions. Google passwords and provider tokens are not stored. Repeat sign-ins update the same account using Google's stable subject ID.

Tasks, goals, settings, and backups still use browser storage. Signing in does not upload them, isolate them by account, or sync them between devices. The scheduler remains available without signing in.

### Configure Google

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select or create a project. Configure the Google Auth Platform branding, audience, and contact information. If the app is in Testing, add the Google accounts that will test it as test users. Use External audience if people outside your school organization need access.
2. Create an OAuth client with application type **Web application**.
3. Add this exact **Authorized redirect URI**, including the query string:

   ```text
   https://magnificent-tarsier-51948c.netlify.app/.netlify/functions/auth?action=callback
   ```

4. Keep the client ID and client secret for Netlify configuration. This redirect flow does not require a browser Google SDK or an authorized JavaScript origin.

### Configure and deploy Netlify

Use the `ITM101` repository root (the folder containing this README) as the Netlify base directory. If Netlify uses the larger school repository instead, set its base directory to `intro_to_cloud_technologies/ITM101`. Remove a base-directory setting pointing inside `scheduling_app_2`. The checked-in `netlify.toml` sets the publish directory to `scheduling_app_2` and the Functions directory to `netlify/functions`.

In your Netlify project's environment variables, add these values with **Functions** scope (or all scopes):

| Variable | Value |
| --- | --- |
| `APP_ORIGIN` | `https://magnificent-tarsier-51948c.netlify.app` |
| `GOOGLE_CLIENT_ID` | Your Google web OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Your Google web OAuth client secret |
| `SESSION_SECRET` | A random secret at least 32 characters long |

Generate the session secret locally with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep these secrets in Netlify, outside the published folder and Git. `.env.example` lists the names for local setup. No database URL is sent to the browser: `@netlify/database` uses the database connection supplied by Netlify to the server function.

Deploy the repository through a Netlify build so dependencies and Functions are included; uploading only the static HTML folder will not install authentication. Netlify's native migrations apply `netlify/database/migrations/202610210001_google_auth.sql`, creating `myday_users` and `myday_sessions` in the database attached to this site. No existing tables are modified.

After deployment:

1. Open the site, then **Settings → Your account → Sign in with Google**.
2. Choose a test account and verify that your name/email appear after returning.
3. In Netlify Database, verify a `myday_users` row and a `myday_sessions` row. Sign out and confirm the session row is removed. Signing in again should update the existing user.
4. Refresh while signed in; the session should persist. It expires after seven days. An expired or revoked session returns the UI to signed-out status.

Sessions use HttpOnly, Secure, SameSite cookies; only a hash of the session token is stored in the database. OAuth uses signed short-lived state, nonce validation, and PKCE, and Google's server library validates ID tokens. Authentication requests bypass the offline service worker. This integration identifies users but does not restrict access to the static scheduler; any future private-data endpoints must check the database session before reading or writing user data.

For local integration testing, install dependencies with `npm install`, link the correct site with the Netlify CLI, and run `netlify dev` from this directory on port 8888. Use `APP_ORIGIN=http://localhost:8888` locally and register `http://localhost:8888/.netlify/functions/auth?action=callback` as an additional Google redirect URI. Store local values in an ignored `.env`; do not replace the production origin in Netlify. Use a local/development database. Preview deploy addresses are intentionally rejected unless explicitly configured with their own origin and matching Google redirect URI.

Run `npm test` for authentication checks and scheduling regression checks. The authentication checks use simulated Google/database responses; a real Google login and database migration must also be verified on Netlify after credentials are configured.

References: [Google server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Google token verification](https://developers.google.com/identity/sign-in/web/backend-auth), [Netlify Database API](https://docs.netlify.com/build/data-and-storage/netlify-database/api/), [Netlify migrations](https://docs.netlify.com/build/data-and-storage/netlify-database/migrations/).

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

For a static preview without Google sign-in, publish the contents of `scheduling_app_2` to a static HTTPS host. Include `index.html`, `styles.css`, `script.js`, `auth.js`, `pwa.js`, `sw.js`, `manifest.webmanifest`, and the `icons` folder. For Google sign-in, use the full Netlify deployment described above. The README and test files do not need to be published. Static previews can also be hosted in a subdirectory.

Open the hosted address online once and check **Settings → Use on your phone** for the offline-ready message. On iPhone, use Safari's Share → Add to Home Screen and enable **Open as Web App** if shown. On Android, use Chrome's installation menu or the **Install My Day** button in Settings when available.

For local PWA testing, run `python -m http.server 8000` from this folder and open `http://localhost:8000`. A phone needs the hosted HTTPS address; a computer's `localhost` address does not point to that computer from a phone.

Tasks and settings remain local to each browser or installed app. Export a backup from your current app, then restore it in the installed app if you want to transfer your schedule. Offline mode becomes available after the first successful online setup. When publishing updates, bump `VERSION` in `sw.js`; an updated worker activates after the old app windows close. Browser storage removal also removes saved schedules and offline files.

## Checks

With Node available:

```powershell
node --check scheduling_app_2/script.js
npm test
node scheduling_app_2/browser-tests.cjs
node scheduling_app_2/browser-tests.cjs --mobile
node scheduling_app_2/pwa-tests.cjs
```

The browser checks use a fresh temporary Chrome profile, keeping your browser data separate. Set `CHROME_PATH` if Chrome is installed somewhere other than the default Windows location. The checks load only a generated local test page.

The day schedule on phone and desktop shows the full visible-hour range with task blocks proportional to duration. Time labels and short ticks stay in the side gutter; there are no full-width hourly lines. Use the plus button to add tasks and the editor to change their time or duration.
