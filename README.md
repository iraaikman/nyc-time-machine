# NYC Time Machine

Explore 49,101 historic New York photographs at 9,007 locations. Find a street on the map, compare a historic photo with a nearby Mapillary view, and align the two using four matching landmarks.

Static Vite + vanilla JavaScript, Leaflet, MarkerCluster and free OpenStreetMap tiles. No backend, Google services, paid APIs, or image uploads. Internet access is needed for map tiles and photographs. Favourites stay in your browser.

## Run it locally

1. Install **Node.js 22 or newer** (the LTS version) from https://nodejs.org. Python 3 is only needed if you want to refresh the archive.
2. Download or clone this project, then open a terminal in the `nyc-time-machine` folder.
3. On the first run, enter:

   ```sh
   npm install
   ```

4. Start the app with one command:

   ```sh
   npm run dev
   ```

5. Open the Local address printed in the terminal (usually http://localhost:5173). Keep the terminal open. Press Ctrl+C to stop.

The photo map works immediately. The archive metadata is already included; there is no first-run download script to run.

## Get a free Mapillary token

1. Sign in or create a free account at https://www.mapillary.com/.
2. Open https://www.mapillary.com/dashboard/developers and register an application. Give it a name such as “NYC Time Machine.” If requested, enter your local or published website address.
3. Copy the **client access token**. Do not copy your client secret or use a private server token.
4. Copy `.env.example` to a new file named `.env` in this project folder. On macOS/Linux you can use `cp .env.example .env`; Windows PowerShell: `Copy-Item .env.example .env`.
5. Open `.env` in a text editor and set:

   ```dotenv
   MAPILLARY_TOKEN=your_public_client_access_token
   ```

6. Restart `npm run dev` if it was already running. Select a map pin and choose **Then / Now**.

Alternatively, choose **Token settings** in the comparison, or **About the archive → Set Mapillary token**, and paste your client token. This override lasts for the page session and is not saved in localStorage. Mobile users can reach Token settings from any photo’s Then / Now view.

A third configuration option is an untracked `public/config.json` file:

```json
{"MAPILLARY_TOKEN":"your_public_client_access_token"}
```

Priority: session override, `.env` at build time, then `config.json`. A static site necessarily exposes its client token in the browser. `.env` and `public/config.json` are ignored by Git to avoid accidental commits, but a token supplied during a production build is included in the built app. Never put a client secret here. Use Mapillary’s available application restrictions and rotate your client token in its dashboard if necessary.

## Explore and align

- Click a cluster to zoom in, then a small terracotta pin to open photographs at that spot. Use the panel arrows to browse other photos at the same coordinates.
- Search street names, titles and back-of-photo transcription text. Press `/` to focus search. Search and decade filters affect the full archive; pan or zoom to find matching pins outside your current map view.
- The decade slider has **All years**, then 1870s through 1970s. Undated photos have their own checkbox. Dates outside this range appear under All years. A date range in the source is represented by its first known year, so a decade is approximate.
- Choose **Then / Now**. The nearest Mapillary image within **50 metres** appears first. The arrows step through nearby images ordered by compass angle; the distance, heading and capture date help you choose. “Now” means the latest available street imagery for the selected image, not a live view.
- Drag the divider, use **Reveal** with the keyboard, or change **Old photo opacity** to fade the historic photograph.
- Choose **Align photographs**. Click four distinct landmarks around a flat façade in the old image, clockwise from the top left. Then click the corresponding four landmarks in the new image, in the same order. Use corners and windows spread across the façade. Click **Apply & save alignment**.
- The browser computes a homography and applies a CSS perspective transform. It rejects degenerate selections. One planar transform cannot match every depth in a street scene; try another Mapillary angle if needed.
- **Favourites** lists your aligned pairs. Open one, or choose **Play full-screen tour** and use its arrows. Native full-screen is requested where supported; otherwise the tour still fills the app viewport (including iPhones).
- **Export JSON** downloads a backup with IDs and normalized landmark coordinates, never images or temporary thumbnail URLs. **Import JSON** validates and merges a backup; matching photo/image pairs are replaced. Removing a favourite only removes the local alignment.

Clearing browser data removes your collection. Export it regularly. The JSON format is `{ "version": 1, "pairs": [{ "photoId": "…", "mapillaryId": "…", "oldPoints": [[x,y],…], "newPoints": [[x,y],…] }] }`, with exactly four points per image, each coordinate between 0 and 1.

## Deploy free to GitHub Pages from main

The published static app is built into the tracked `docs` folder. GitHub Pages can serve it directly from the **main** branch, with no paid hosting or deployment service.

1. Push this project to https://github.com/iraaikman/nyc-time-machine on the `main` branch. Include `docs`, `.github/workflows/pages.yml`, `package-lock.json`, and `public/data/photos.json`. Do not upload `node_modules`, `.env`, or `dist`.
2. Open the repository’s **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select **main** and **/docs**, then click **Save**.
5. GitHub will publish the app at https://iraaikman.github.io/nyc-time-machine/. The Pages settings and repository’s Actions tab show publication progress.

The included workflow checks tests and the production build on pushes to `main`. GitHub’s own Pages workflow publishes the committed `docs` folder.

### Update the published app

After changing the source, rebuild the static files before pushing:

```sh
npm run build:pages
git add .
git commit -m "Update NYC Time Machine"
git push origin main
```

To give all visitors access to Mapillary comparisons, set your **public client access token** in the ignored `.env` file before running `npm run build:pages`. The build embeds that public token in the browser app. Never use a client secret. Without a configured token, visitors can enter their own token in the app’s Token settings.

The app uses relative build paths, so the repository URL works. The `docs/.nojekyll` file tells GitHub Pages to serve the generated files directly.

For another static host, run `npm run build` and upload the contents of `dist`. Use `npm run preview` to check that build locally. Do not open `docs/index.html` or `dist/index.html` directly with a `file://` URL; the browser must fetch the archive over HTTP.

## Refresh the archive

The standard-library Python script downloads the current OldNYC metadata and converts it to a compact JSON array:

```sh
python3 scripts/download_data.py
```

Each record includes `id`, `lat`, `lon`, `title`, nullable `year`, `image`, `nypl`, and `text`. Invalid coordinates and duplicate IDs are skipped. Missing dates are kept as `null`; missing transcription text is an empty string. To convert an existing download, use `--input /path/to/data.json`. Use `--output /path/to/photos.json` for a different destination. The script writes atomically so a failed download does not replace the existing archive.

Metadata source: https://github.com/oldnyc/oldnyc.github.io/blob/master/data.json. Original project: https://github.com/danvk/oldnyc. The bundled metadata is about 27 MB uncompressed, so the first load may take a moment on mobile connections. No historic images are bundled or re-hosted: the app uses source URLs on NYPL’s image servers and OldNYC’s rotated-image archive.

## How the Mapillary integration works

Graph API v4’s `/images` spatial search uses a **bounding box**, rather than a `lat/lng/radius` query. The app builds a box around the photo coordinates, requests `id,thumb_2048_url,captured_at,compass_angle,geometry`, then uses great-circle distance to remove images outside a true 50 m circle. It requests up to 500 candidates per search. The nearest image is selected; the rest are ordered by heading.

Each selected image is fetched again by ID with `cache: no-store`, including when reopening a favourite. Expiring thumbnail URLs are never persisted. A missing token, rejected token, empty result, API failure or failed image load is reported in the comparison. Tests use API fixtures; no live token is included in this project.

The public OpenStreetMap tile service is for normal interactive use, subject to https://operations.osmfoundation.org/policies/tiles/. Do not bulk-download tiles or add offline tile prefetching. If you grow beyond that service’s usage policy, change the tile URL and attribution in `src/main.js` to an appropriate provider. Some shared/cloud development networks are blocked by the tile service; test from your own browser.

## Checks

```sh
npm test
npm run build
```

Tests cover archive integrity, perspective geometry, degenerate selections, import validation, true 50 m filtering, heading order, nearest selection, fresh image URLs and authentication failures.

## Credits and limits

Historic photographs: **The New York Public Library**, “Photographic Views of New York City, 1870s–1970s,” located and transcribed by **OldNYC**. Each photo links to its original NYPL record. Refer to that record for rights and reuse information. Present-day photographs: **Mapillary contributors**, with a link to each selected image. Basemap: **OpenStreetMap contributors**. Credits are visible alongside the images and on the map.

Source coordinates, OCR, dates, and street-view headings can be imperfect. Mapillary coverage varies. A flat façade usually aligns well; streets with many depths, panoramic lens distortion, changed buildings, or different camera positions cannot be perfectly matched with a single homography. This app does not claim a surveyed or exact camera alignment.
