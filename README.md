# Feature 3 — Download limits and offline downloads

## Included files

Copy these files into the matching locations in your project:

- `server/controllers/download.js`
- `server/controllers/downloadHistory.js`
- `server/Modals/Download.js`
- `server/Modals/DownloadQuota.js`
- `server/utils/downloadLimits.js`
- `server/routes/video.js`
- `frontend/components/Videopplayer.tsx`

## Existing plan limits preserved

| Plan | Daily | Monthly |
|---|---:|---:|
| Free | 1 | 30 |
| Bronze | 5 | 150 |
| Silver | 10 | 300 |
| Gold | 20 | 600 |

## Behavior

- The player has a Download button.
- The frontend requests the authenticated `/video/download/:videoId` endpoint as a Blob and saves the returned file to the user's device for offline viewing.
- Daily and monthly quotas are enforced on the backend.
- Re-downloading the same video within 24 hours is rejected if the earlier download is pending or completed and counted toward quota.
- A failed download releases its reserved daily and monthly quota.
- Downloads require the plan to meet the video's `accessLevel`.
- Download history and remaining daily/monthly quotas are retrieved from `/video/downloads/history`.
- Quota period keys use Asia/Kolkata dates.

## Apply

1. Back up the existing files.
2. Replace the files listed above with the versions in this ZIP.
3. Keep your existing `.env`, MongoDB connection, Cloudinary configuration, and authentication setup.
4. Restart the backend and frontend.
5. Sign in and open a video. Use Download and confirm the file appears in the browser's download list and can play after disconnecting from the internet.

## Important

The browser saves the downloaded video as a normal file. This is offline file download, not encrypted in-app offline storage or DRM. The project currently uses finite Gold limits from the supplied `downloadLimits.js`; they have not been changed.
