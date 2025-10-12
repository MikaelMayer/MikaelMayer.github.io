### Next task for the next agent (post test)

Assuming STOP now downloads the last chunk successfully on device, proceed to reintroduce the original save flow behind a runtime toggle and use it to bisect the regression.

- **Implement runtime toggle**: Add a URL param `dl` read in `apps/videodelay/app.js` controlling how the recorded blob is assembled on stop.
  - `dl=last` (default): return only the last non-empty chunk (current debug behavior).
  - `dl=concat`: return a Blob of all collected chunks (previous behavior).
- **Keep immediate save on STOP**: Continue triggering `saveBlobAs` directly on STOP for both modes so the download gesture is consistent.
- **Add lightweight diagnostics**: Log to console and (briefly) to `overlay` the chosen mode, recorder type (element vs canvas), chunk count and total size, final blob type/size, and which save path was used (File System Access vs anchor fallback). Capture any thrown errors.
- **Device test matrix**: On the target phone, verify `?dl=last` still downloads. Then try `?dl=concat` and note whether download fails or the file is corrupt/unplayable. Record exact symptoms and logs.
- **Outcome**: Identify whether the failure is in chunk assembly, MIME/extension handling, or the save path. Commit the toggle/logs as temporary debugging aids with a clear message and leave default as `last`.
