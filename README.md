# NYC Time Machine

Explore **49,101 historic views at 9,007 mapped locations** from the New York Public Library and OldNYC. Choose a map pin or a street, browse its decades, and open photographs in a large viewer. Save individual historic photos to your own collection.

The app is a static Vite + vanilla JavaScript site using Leaflet, MarkerCluster and OpenStreetMap. It needs no account, API token or backend. Internet access is needed for map tiles and archive photographs.

## Run locally

Use Node.js 22 or newer:

```sh
npm ci
npm run dev
```

Open the Local address printed in the terminal. The complete archive metadata is bundled in `public/data/photos.json`; no initial download script is necessary. Python 3 is only needed to refresh that metadata.

## Explore the archive

- The opening collection follows **the Bowery in the 1930s**, with every available decade one click away. Use the starter streets, search for another street, or select **All New York** to explore the whole map.
- Street search understands common abbreviations and spelled-out numbered streets, such as “Fifth Ave.” Choose a street suggestion to browse that street within its borough. Enter opens a uniquely matched street, or searches titles and transcriptions if there is no unique street match. The final suggestion always searches all titles and transcriptions.
- Map pins follow the active street, search, decade or favourites collection. Click a cluster to zoom, then a pin to browse photographs at that corner. **Follow [street]** expands the collection to an adjoining street. **At this corner** narrows it again.
- The decade buttons show the actual periods represented in the collection, including dates outside the main 1870s–1970s archive. **All years** sorts known dates first and undated photos last. **Undated** has its own filter.
- Select thumbnails or use the arrows to browse in date order. The map highlights the selected photo’s archive location. **Locate on map** zooms to that location.
- Select **View larger** for a full-window photograph. Use its arrows or your keyboard’s left/right arrows to browse. **Zoom in** lets you scroll around details; **Fit photograph** resets the view. Escape closes the viewer.
- **Notes from the archive** shows the available transcription. **Original NYPL record** opens the authoritative source, including its rights and any additional image/download options. Displayed detail is limited by the source image’s resolution.
- The address bar preserves the current photo, street and decade, so a copied link can reopen the same view. Favourites links depend on the recipient’s browser collection.

### Dates and street groupings

Street collections are derived from structured archive captions, such as `Manhattan: Bowery - Grand Street`. Common street abbreviations and ordinal numbers are normalized, while boroughs and East/West street names remain distinct. Other photos at the same archive coordinates join the streets identified there. An unrecognized caption remains accessible by map location and text search. Collections can therefore include adjoining places or subjects photographed from that corner; these are archive locations, not surveyed camera positions.

The upstream year may be approximate or may refer to a building’s history. When a transcription ends with an unambiguous standalone month/day/year date line, the app uses that year for browsing and retains the original year in memory as provenance. It leaves conflicting date lines and dates embedded in prose alone. Other years display with **c.** to indicate an approximate archive date. Transcriptions can contain errors; consult the NYPL record for research requiring precise dating. Undated photographs are never assigned a guessed year.

## Favourites and backups

**Save photo** stores a photo ID in this browser. Open **Favourites** to browse saved photos by decade, remove them, export a backup or import one. No images are uploaded or stored in the backup.

Historic photo IDs from the previous version’s saved alignments are carried over when there is no newer favourites store. The previous store remains untouched. Imports support both the new format and version 1 alignment exports; duplicates are merged and unknown or malformed photo IDs are rejected.

```json
{
  "version": 2,
  "type": "historic-photos",
  "photoIds": ["716777f-a"]
}
```

Clearing browser data removes your favourites. Export a backup to keep your collection. The app reports storage errors rather than claiming a photo has been saved.

## Deploy to GitHub Pages

The tracked `docs` folder contains the complete production build. To update the published site:

```sh
npm test
npm run build:pages
git add .
git commit -m "Make NYC Time Machine an historic photo explorer"
git push origin main
```

In the repository’s **Settings → Pages**, use **Deploy from a branch**, branch **main**, folder **/docs**. The intended address is https://iraaikman.github.io/nyc-time-machine/.

The build uses relative URLs and includes `docs/.nojekyll`. Include the generated assets and `docs/data/photos.json` when publishing; do not upload `node_modules`, `.git`, or local environment files. No service credentials are required. For another static host, use `npm run build` and upload `dist`. Use an HTTP server or `npm run preview`; opening the HTML directly with a `file://` URL does not allow the archive fetch.

## Refresh the metadata

```sh
python3 scripts/download_data.py
```

The standard-library Python script downloads OldNYC metadata and converts it to the bundled JSON array. It skips duplicate IDs and invalid coordinates, retains undated records, and writes atomically. To convert an existing download, use `--input /path/to/data.json`; use `--output` to choose a destination.

Metadata source: https://github.com/oldnyc/oldnyc.github.io/blob/master/data.json. Original project: https://github.com/danvk/oldnyc. The metadata is about 27 MB uncompressed. Photographs load directly from NYPL and OldNYC’s image hosts; they are not re-hosted in this repository.

## Checks

```sh
npm test
npm run build:pages
```

Tests cover archive integrity, street alias normalization, borough and directional separation, intersection membership, chronological filters, date-line evidence, legacy favourites migration and backup validation. Browser checks cover map/street navigation, decades, large photographs, zoom, favourites and responsive layouts.

## Credits

Historic images: **The New York Public Library**, *Photographic Views of New York City, 1870s–1970s*, located and transcribed by **OldNYC**. This archive also includes illustrations and other historical material. Refer to each NYPL record for rights and reuse information.

Basemap: **OpenStreetMap contributors**. The public tile service is for normal interactive use under https://operations.osmfoundation.org/policies/tiles/. Do not bulk-download or prefetch tiles. Image availability, dates, captions and coordinates depend on the source archives.
