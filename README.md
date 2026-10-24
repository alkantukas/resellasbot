# Resell Zone Discord Bot

A Discord bot for the Resell Zone community. Everything it says in Discord is in Lithuanian. Giveaways are shown as boxes with headings and dividers, welcomes as a plain text message (like `Sveikas atvykęs @name!`), and private replies to admins as embeds.

It does two things:

- **Welcome messages** (`/sveikinimai`): greets new members in a channel you choose, with your own text.
- **Giveaways (konkursai)** (`/konkursas`): posts a giveaway with prizes and a **Dalyvauti** (join) button, keeps the participant count up to date, and picks random winners when it ends.

Settings and giveaways are saved in `data/db.json`, so nothing is lost when the bot restarts. If the bot was offline when a giveaway should have ended, it ends it as soon as it comes back.

---

## 1. Install Node.js (once)

1. Go to <https://nodejs.org> and download the **LTS** version (22 or newer).
2. Run the installer and click **Next** through all the steps (the default options are fine).
3. Check it worked: open **Command Prompt** (press the Windows key, type `cmd`, press Enter) and type:

   ```bash
   node -v
   ```

   You should see something like `v22.x.x`. Anything from `v20.12` up works.

## 2. Create the bot in the Discord Developer Portal

1. Open <https://discord.com/developers/applications> and log in with your Discord account.
2. Click **New Application** (top right). Name it, for example `Resell Zone`, tick the terms box, and click **Create**.
3. Optional: on the **General Information** page, upload your logo as the app icon.
4. In the left menu, click **Bot**.
   - Under **Privileged Gateway Intents**, turn on **Server Members Intent**. Click **Save Changes**.
     The bot needs this to see members join and leave. Without it, the bot will not start.
   - You can leave the other two intents (Presence, Message Content) off.
   - Optional: turn off **Public Bot** so only you can add the bot to servers.
5. Still on the **Bot** page, click **Reset Token**, confirm, and click **Copy**.
   This token is the bot's password. **Never share it or post it anywhere.** If it ever leaks, click Reset Token again to get a new one.

## 3. Put the token in the `.env` file

1. Open the bot folder (`resell-zone-bot`).
2. Open the file named `.env` with Notepad. (If you don't see it, turn on *View → Show → Hidden items* in File Explorer. If it's missing, copy `.env.example` and rename the copy to `.env`.)
3. Paste your token right after `DISCORD_TOKEN=`, with no spaces or quotes:

   ```
   DISCORD_TOKEN=paste-your-token-here
   ```

4. Optional but recommended: put your server's ID after `GUILD_ID=`. The commands then show up in your server instantly.
   To get the ID: in Discord, go to *User Settings → Advanced* and turn on **Developer Mode**. Then right-click your server's icon and click **Copy Server ID**.
5. Save the file.

The other settings in `.env` are optional:

| Setting      | What it does                                                        | Default          |
|--------------|---------------------------------------------------------------------|------------------|
| `GUILD_ID`   | Registers commands in this one server (instant). Empty = every server the bot is in. | empty |
| `TIMEZONE`   | Time zone for giveaway dates such as `2026-10-31`.                  | `Europe/Vilnius` |
| `BRAND_NAME` | Text at the bottom of the admin replies.                                 | `Resell Zone`    |
| `DATA_FILE`  | Where settings and giveaways are saved.                             | `data/db.json`   |

## 4. Install and start the bot

1. Open **Command Prompt** in the bot folder. The easiest way: open the `resell-zone-bot` folder in File Explorer, click the address bar, type `cmd`, and press Enter.
2. Install the bot's parts (only needed the first time, and after updates):

   ```bash
   npm install
   ```

3. Start the bot:

   ```bash
   npm start
   ```

   When it works, you will see:

   ```
   Logged in as Resell Zone#1234 (in 0 server(s)).
   Invite link: https://discord.com/oauth2/authorize?client_id=...
   Registered 3 slash commands globally.
   Bot is ready.
   ```

The bot is online only while this window is open. To stop it, press **Ctrl + C** or close the window.

## 5. Invite the bot to your server

Use the **Invite link** printed when the bot starts, or build it yourself. Your **Application ID** is on the *General Information* page of the Developer Portal:

```
https://discord.com/oauth2/authorize?client_id=YOUR_APPLICATION_ID&scope=bot+applications.commands&permissions=84992
```

Open the link, choose your server, and click **Authorize**. You need the *Manage Server* permission on that server.

The link asks for these permissions (`84992`):

| Permission           | Why                                           |
|----------------------|-----------------------------------------------|
| View Channels        | See the welcome and giveaway channels         |
| Send Messages        | Post welcomes, giveaways and winners          |
| Embed Links          | Show the boxes and admin replies              |
| Read Message History | Reply to the giveaway post with the winners   |

If you set up private channels, make sure the bot's role is allowed to see and post in them. When it can't, the bot tells you which permission is missing.

If you invited the bot **after** starting it and you left `GUILD_ID` empty, restart the bot once (Ctrl + C, then `npm start`). Global commands can take a few minutes to appear. If you don't see them, restart Discord (Ctrl + R).

## 6. Using the bot

All commands are for admins by default (people with **Manage Server**). To let another role use them, go to *Server Settings → Integrations → your bot*.
Type `/pagalba` in Discord to see the list of commands.

### Welcome messages: `/sveikinimai`

| Command                          | What it does                                     |
|----------------------------------|--------------------------------------------------|
| `/sveikinimai kanalas`           | Choose the channel for welcome messages          |
| `/sveikinimai zinute tekstas:…`  | Set the welcome text                             |
| `/sveikinimai ijungti`           | Turn welcome messages on                         |
| `/sveikinimai isjungti`          | Turn welcome messages off                        |
| `/sveikinimai perziura`          | Preview the welcome message (only you see it)    |
| `/sveikinimai nustatymai`        | Show the current settings                        |

Placeholders you can use in the text:

- `{user}`: mentions the new member (a clickable @name)
- `{vardas}`: the member's name, not as a mention
- `{server}`: the server's name
- `{nariai}`: the server's member count
- `\n`: starts a new line

The default text is `Sveikas atvykęs {user}!`. It is sent as a normal text message, and the new member gets a notification for the mention.

Example of your own text: `Sveikas atvykęs {user}! 🎉 Perskaityk taisykles.`

Quick start: run `/sveikinimai kanalas`, then `/sveikinimai zinute`, then `/sveikinimai ijungti`.

### Giveaways (konkursai): `/konkursas`

**Create one** with `/konkursas sukurti`:

| Option        | Example                                       | Notes |
|---------------|-----------------------------------------------|-------|
| `pavadinimas` | `Rudens konkursas 🎉`                          | The name, shown as the title |
| `kanalas`     | `#konkursai`                                  | Where the konkursas is posted |
| `data`        | `2026-10-31` or `2026-10-31 18:00`            | End on a date. A date without a time ends at 23:59 |
| `trukme`      | `5h`, `30m`, `2d`, `1d 12h`, `5 val`          | End after a duration |
| `nariai`      | `4000`                                        | End when the server reaches this many members |

Choose **exactly one** of `data`, `trukme` or `nariai`.

After you press Enter, a form opens for the **prizes**. Write **one prize per line**. Each line is one winning place, so the number of lines is the number of winners:

```
Nike kepurė
Kursas
Nuolaidos kodas
```

This makes 3 winners: 1st place gets Nike kepurė, 2nd gets Kursas, 3rd gets Nuolaidos kodas. Numbers like `1.` or `2)` at the start of a line are ignored, so you can number them if you like. Up to 25 prizes.

The giveaway post shows, from top to bottom:

1. the name,
2. **Prizai**, the prize list,
3. **Informacija**: Dalyvių (participants), Laimėtojų (winners) and Baigsis (when it ends, e.g. *Kai surinksime 4 000 narių*),
4. the **Dalyvauti** button.

Members click **Dalyvauti** to join. Clicking it again lets them leave. The participant count updates within a few seconds. Members who leave the server are removed from the giveaway.

When the giveaway ends, the bot picks the winners at random and replies to the giveaway with a **Konkursas Baigtas! 🎉** box. It lists each winner with their prize, thanks everyone, and (if you set it) points winners to your ticket channel. The winners are @mentioned, so Discord notifies them.

If fewer people join than there are prizes, only the first places are given out.

Dates are written out in Lithuanian (e.g. *2026 m. spalio 31 d., šeštadienis 23:59*), in the `TIMEZONE` from `.env`.

**Ticket channel:** run `/konkursas bilietai kanalas:#bilietai` once. The winner box then ends with *Laimėtojai, sukurkite 🎉 Giveaway bilietą čia: #bilietai*. Run it without a channel to remove that line.

Other commands (when you start typing the giveaway name, the bot suggests matches):

| Command                | What it does                                                   |
|------------------------|----------------------------------------------------------------|
| `/konkursas sarasas`   | List active konkursai                                          |
| `/konkursas baigti`    | End a konkursas now and pick winners                           |
| `/konkursas perrinkti` | Draw a new winner after it ended, e.g. if a winner doesn't respond. Use `vieta:2` to redraw only 2nd place (the new winner gets that place's prize); leave it empty to redraw every place. Previous winners are skipped |
| `/konkursas atsaukti`  | Cancel a konkursas without winners                             |
| `/konkursas bilietai`  | Set the ticket channel shown in the winner box                 |

If someone deletes a giveaway post, the giveaway is cancelled automatically.

## 7. Keeping the bot online

The bot runs only while your computer is on and the window is open. To keep it online all the time, run it on an always-on machine or a small hosting service (any service that runs Node.js works). Copy the whole folder, **including `.env` and the `data` folder**, then run `npm install` and `npm start` there.

## Troubleshooting

| Message in the window | Fix |
|---|---|
| `DISCORD_TOKEN is empty` | Paste the token into `.env` (step 3) and save the file. |
| `Discord rejected the token` | Copy a fresh token (Bot → Reset Token) into `.env`. |
| `Turn on "Server Members Intent"` | Developer Portal → Bot → Privileged Gateway Intents → Server Members Intent → Save. |
| `This bot needs Node.js 20.12 or newer` | Install the current LTS from nodejs.org. |
| Commands don't appear | Put your server ID in `GUILD_ID`, restart the bot, and press Ctrl + R in Discord. |
| Nobody gets welcomed | Run `/sveikinimai nustatymai` and check it's on and has a channel. Check the bot can post in that channel. |

## For developers

- Stack: Node.js 20.12+, [discord.js](https://discord.js.org) v14, slash commands, and a JSON file for storage. No other dependencies.
- `npm run check` runs a self-check that needs no token. It validates the slash command definitions against Discord's rules and registers them against a local fake Discord API (global and per-server). It also tests date and duration parsing, saving, and the welcome and giveaway flows with fake Discord objects.
- Code: `src/index.js` (startup and event routing), `src/commands.js` (command definitions and registration), `src/welcome.js`, `src/giveaways.js`, `src/storage.js`, `src/time.js`, `src/embeds.js`.
- Commands are registered automatically every time the bot starts.
