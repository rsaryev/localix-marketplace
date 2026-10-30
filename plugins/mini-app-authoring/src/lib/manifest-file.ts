/**
 * Where a mini app keeps its manifest: `.localix-mini-app/mini-app.json` in its folder, as a Claude
 * Code plugin keeps its own in `.claude-plugin/`. Paths inside it are relative to the folder that
 * holds `.localix-mini-app/`. The kit says the same (`tools.manifest.file`), and `loadKit` refuses
 * a kit that says otherwise.
 */
export const MANIFEST_DIR = '.localix-mini-app'
export const MANIFEST_FILE = `${MANIFEST_DIR}/mini-app.json`
