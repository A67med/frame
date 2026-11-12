# Theme library

Harbor's Community theme library (Settings > Themes > Community) reads `index.json` in this folder. It is read-only: there are no accounts, ratings, comments or uploads, so a theme joins the library through a pull request to this repository.

## Submitting a theme

1. In Harbor, open Settings > Themes, pick your theme and export it as a `.harborstyle` file.
2. Fork `abdallahkattriah-sketch/frame` and add the file here as `data/themes/<id>.harborstyle`. Use a lowercase id made of letters, digits and dashes.
3. Add a cover screenshot as `data/themes/<id>.jpg` (16:10, about 960x600, under 200 KB).
4. Add an entry to `themes` in `index.json`:

```json
{
  "id": "my-theme",
  "name": "My Theme",
  "author": "your name",
  "blurb": "One line shown on the card.",
  "swatch": ["#0a0d14", "#181d28", "#7b5cff"],
  "layout": "sidebar",
  "file": "my-theme.harborstyle",
  "cover": "my-theme.jpg",
  "screenshots": [],
  "version": 1,
  "createdAt": "2026-10-16"
}
```

5. Open a pull request against `main`. The theme appears in the app once it is merged.

## Updating a theme

Edit the `.harborstyle` file and raise `version` in its index entry. Harbor offers the update to everyone who installed an earlier version.

## Review

Every theme's CSS, HTML and JavaScript is read before merging, and Harbor scans each download again before installing it. Themes that load remote scripts or send data elsewhere are not accepted.

`file`, `cover` and `screenshots` must be plain file names in this folder (or full `https://` URLs for images); other paths are ignored.
