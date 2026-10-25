// Resell Zone Discord bot: welcome messages and giveaways.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const envFile = path.join(ROOT, '.env');
if (typeof process.loadEnvFile !== 'function') {
  console.error('This bot needs Node.js 20.12 or newer. Install the current LTS from https://nodejs.org');
  process.exit(1);
}
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const { Client, Events, GatewayIntentBits, Partials } = require('discord.js');
const { Store } = require('./storage');
const { registerCommands } = require('./commands');
const { Welcome } = require('./welcome');
const { Giveaways } = require('./giveaways');
const { infoEmbed, errorEmbed, ephemeral } = require('./embeds');

const INVITE_PERMISSIONS = '84992'; // View Channels, Send Messages, Embed Links, Read Message History

const token = (process.env.DISCORD_TOKEN || '').trim();
if (!token) {
  console.error('DISCORD_TOKEN is empty. Open the .env file and paste your bot token after DISCORD_TOKEN= (see README.md).');
  process.exit(1);
}

const store = new Store(path.resolve(ROOT, process.env.DATA_FILE || 'data/db.json'));
const client = new Client({
  // GuildMembers ("Server Members Intent") is needed to see people joining and leaving.
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  // Lets us notice members leaving even if the bot never saw them before.
  partials: [Partials.GuildMember],
});
const welcome = new Welcome(client, store);
const giveaways = new Giveaways(client, store);

const help = () => infoEmbed('📖 Boto komandos').addFields(
  {
    name: '👋 Pasveikinimai',
    value: [
      '`/sveikinimai ijungti` / `isjungti` – įjungti arba išjungti',
      '`/sveikinimai kanalas` – kur siųsti pasveikinimus',
      '`/sveikinimai zinute` – pasveikinimo tekstas, pvz. `Sveiki, {user}!`',
      '`/sveikinimai perziura` – peržiūrėti, kaip atrodys',
      '`/sveikinimai nustatymai` – dabartiniai nustatymai',
    ].join('\n'),
  },
  {
    name: '🎁 Konkursai',
    value: [
      '`/konkursas sukurti` – naujas konkursas. Pabaigai pasirink **vieną**: `data`, `trukme` arba `nariai`. Tada atsidarys forma prizams: po vieną eilutėje, 1 eilutė = 1 vieta',
      '`/konkursas sarasas` – aktyvūs konkursai',
      '`/konkursas baigti` – baigti dabar ir išrinkti laimėtojus',
      '`/konkursas perrinkti` – išrinkti naują laimėtoją (pvz. tik 2 vietai)',
      '`/konkursas atsaukti` – atšaukti be laimėtojų',
      '`/konkursas bilietai` – bilietų kanalas, rodomas laimėtojų pranešime',
      '`/konkursas zyma` – ar dalyvauti gali tik užsidėję serverio žymą (numatyta: taip)',
    ].join('\n'),
  },
);

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag} (in ${c.guilds.cache.size} server(s)).`);
  console.log(`Invite link: https://discord.com/oauth2/authorize?client_id=${c.application.id}&scope=bot+applications.commands&permissions=${INVITE_PERMISSIONS}`);
  const guildId = (process.env.GUILD_ID || '').trim() || undefined;
  try {
    const registered = await registerCommands(c.rest, c.application.id, guildId);
    console.log(`Registered ${registered.length} slash commands ${guildId ? `in server ${guildId}` : 'globally'}.`);
  } catch (err) {
    console.error('Could not register slash commands:', err.message);
  }
  await giveaways.start();
  console.log('Bot is ready.');
});

client.on(Events.GuildMemberAdd, async (member) => {
  await welcome.handleMemberAdd(member).catch((e) => console.error('[welcome]', e.message));
  await giveaways.handleMemberAdd(member).catch((e) => console.error('[giveaways]', e.message));
});

client.on(Events.GuildMemberRemove, (member) => {
  try {
    giveaways.handleMemberRemove(member);
  } catch (e) {
    console.error('[giveaways]', e.message);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      if (interaction.commandName === 'konkursas') await giveaways.handleAutocomplete(interaction);
      return;
    }
    if (interaction.isButton()) {
      if (interaction.customId.startsWith('gw:')) await giveaways.handleButton(interaction);
      return;
    }
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('gw:prizes:')) await giveaways.handleModal(interaction);
      return;
    }
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'sveikinimai') await welcome.handleCommand(interaction);
    else if (interaction.commandName === 'konkursas') await giveaways.handleCommand(interaction);
    else if (interaction.commandName === 'pagalba') await interaction.reply(ephemeral(help()));
  } catch (err) {
    console.error(`[interaction] ${interaction.commandName ?? interaction.customId}:`, err);
    if (!interaction.isRepliable()) return;
    const payload = ephemeral(errorEmbed('Įvyko netikėta klaida. Bandyk dar kartą po kelių akimirkų.'));
    const send = interaction.deferred || interaction.replied
      ? interaction.editReply({ embeds: payload.embeds, components: [] })
      : interaction.reply(payload);
    await send.catch(() => {});
  }
});

function shutdown() {
  giveaways.stop();
  client.destroy(); // nothing else keeps Node running, so it exits by itself
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

client.login(token).catch((err) => {
  if (err.code === 'TokenInvalid' || /invalid token/i.test(err.message)) {
    console.error('Discord rejected the token. Copy it again from the Developer Portal (Bot → Reset Token) into .env.');
  } else if (/disallowed intents/i.test(err.message)) {
    console.error('Turn on "Server Members Intent" in the Developer Portal (Bot → Privileged Gateway Intents), then start again.');
  } else {
    console.error('Could not connect to Discord:', err.message);
  }
  // Let open connections close on their own; process.exit() here can crash Node on Windows.
  process.exitCode = 1;
  giveaways.stop();
  client.destroy();
});
