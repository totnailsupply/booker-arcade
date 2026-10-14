# Booker Arcade

Five pixel-art browser games starring Booker and Soba, built with Phaser 4 and
Vite.

**Play them:** https://totnailsupply.github.io/booker-arcade/

| Game | Folder | What it is |
| --- | --- | --- |
| Booker Run | `booker-run/` | One-button runner and platformer, six levels |
| Booker's Backyard Brawl | `backyard-brawl/` | Arena survival, ten waves and two bosses |
| Soba Tower | `soba-tower/` | Vertical climber in the style of Doodle Jump |
| Soba Guard | `soba-guard/` | Lane defense on a garden grid |
| Lucky Paw Casino | `lucky-paw-casino/` | Plinko, Blackjack, Craps, Roulette, and Slots with pretend chips |

The games run in any modern browser on a phone, tablet, or computer. Each one
supports touch, mouse, and keyboard.

## Run a game on your computer

You need [Node.js](https://nodejs.org/) 20 or later.

1. Open a terminal in the game's folder, for example `booker-run/`.
2. Install the dependencies:

   ```bash
   npm install
   ```

3. Start the dev server:

   ```bash
   npm run dev
   ```

4. Open the URL that the terminal prints.

## Build the whole arcade

To build every game and the menu page into `_site/`, run the following from the
repository root:

```bash
bash scripts/build-site.sh
```

On every push to `main`, the `Deploy arcade to GitHub Pages` workflow runs the
same script and publishes `_site/`.

## Repository layout

- `site/`: the arcade menu page and its thumbnails.
- `scripts/build-site.sh`: builds every game with relative paths, plus the menu.
- `Booker Assets/`, `Soba Assets/`: source art for the characters.
- Each game folder has its own `README.md` or `progress.md` with controls and
  design notes.
