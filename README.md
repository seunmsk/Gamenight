# Game Night Naija

A browser games night for one room. A laptop or TV is the big screen, and everyone else plays on their phone with a 4-letter room code or by scanning the QR code. Nobody installs an app.

## Games

| Game | Players | Solo |
| --- | --- | --- |
| Jollof Wars: Team Naija vs Team Ghana (trivia, Ingredient Rush, Pot or Not) | 1–16 | vs a Ghana CPU team |
| Act Am: charades, the word shows on the actor's phone | 2–16 | One phone, pass it round |
| How Naija Are You?: speed trivia | 1–16 | Yes, with a Naija rating |
| Who Go Do Am?: "most likely to" voting | 3–16 | One phone, everyone points |
| Na Lie!: two truths and a lie | 3–16 | — |
| Whot!: Nigerian rules, your hand is on your phone | 2–6 (CPU fills in) | vs 1–5 CPU |
| Ludo: quick (2 tokens) or full (4 tokens) | 2–4 (CPU fills in) | vs 1–3 CPU |
| Wetin I Draw?: draw on your phone, it shows on the TV | 3–12 | One phone, pass it round |
| Who Pikin Be This?: guess whose childhood photo it is | 3–16 | — |
| Ayo: seed-sowing board game | 2 (or 1 vs CPU) | vs CPU, easy or hard |

Every game has a setup screen. You can choose who's playing, the number of rounds or questions, the timer, and how many CPU players to add. Winners collect night points (3 for first, 2 for second, 1 for third) on **Tonight's leaderboard**. Whoever comes last gets a forfeit.

## Put it online (Cloudflare Pages)

1. Cloudflare dashboard → Workers & Pages → Create → Pages → **Connect to Git**, and pick `seunmsk/gamenight`.
2. Framework preset: **None**. Leave the build command empty and set the output directory to `/`.
3. Deploy. It goes live at `gamenight.pages.dev`, and every push to `main` redeploys it. You can also add a custom domain such as `games.mskbuilds.app`.

## How to run the night

1. Open the site on the laptop or TV and tap **Host a games night**.
2. Everyone scans the QR code or goes to the site and taps **Join a room**.
3. Pick a game on the big screen, set the options and start.
4. Keep the host tab open and in front, because the host screen runs the games. If a phone locks or drops, it reconnects automatically. If the host tab is refreshed, use **Resume room** on the home page.

## How it connects

Phones talk to the host screen directly over WebRTC, using PeerJS and its free public broker, so there's no server to pay for. Everyone being on the same Wi-Fi or hotspot gives the most reliable connection. Mobile data also works in most cases.

Testing on one computer: add `?net=local` to the address. Open one tab as the host and other tabs as phones, all in the same browser.

## Files

- `js/engine.js`: the host's game runner, scores, results and forfeits
- `js/net.js`: connections (PeerJS, or BroadcastChannel for local testing)
- `js/games/*.js`: one file per game
- `js/content.js`: questions, charades words, drawing words, "Who go…" prompts and forfeits. Edit this file to add your own.
