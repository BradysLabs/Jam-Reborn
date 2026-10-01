# Asset Browser

Browse every clothing and den item in Animal Jam Classic, look inside the game's data files, and get the real address of any file on the game's content server.

## Clothing / Den Items

- Every item with its id, name, listed value and whether it's members-only.
- **Search** by name (`spiked`), by id (`1037`), or by value range (`200-500`).
- Filter by **Members / Free**, **Gems / Diamonds**, min and max value, and **Named only**.
- Click a column header to sort. `↑` `↓` move through the list, `Ctrl+F` jumps to search.
- Click an item to see:
  - its id and listed value, with copy buttons;
  - the address of the data file it comes from;
  - its **raw game data**, every field the game stores for it. Fields ending in `StrId` show the text they point to. Click any value to copy it.

## Defpacks

Defpacks are the game's data files (item lists, names, prices, settings). Enter any pack id to see its address, download it, see how many entries and which fields it has, filter it, and save it as `.json`. Item names are added as `_name` where the pack links to the text strings pack.

Known packs: `1000` clothing, `1030` den items, `10230` text strings.

## Address Builder

Shows how a file address is made, step by step:

1. The secret key and the file name are joined.
2. The result is scrambled.
3. The scrambled text is MD5-hashed. That hash is the file name on the server.

| Data | Address |
|---|---|
| Item data | `/{version}/defPacks/{hash(pack id)}` |
| Room data | `/{version}/roomDefs/{map}/{hash(file.xroom)}` |

The game version (`deploy_version`) comes from `animaljam.com/flashvars` and is filled in automatically.

## Staying up to date

The item lists are downloaded for the current game version and saved in Jam Reborn's `cache/` folder. Jam Reborn checks for a new game version every 30 minutes. Click **Check for update** to check right away. The version in use is shown in the top-right.

Address scheme and hashing are from animaljam.js by Sxip, used with permission.