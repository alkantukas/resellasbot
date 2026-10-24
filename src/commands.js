// Slash command definitions and their registration with Discord.
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  ChannelType,
  Routes,
} = require('discord.js');

const TEXT_CHANNELS = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

// Admin-only by default. Server owners can change who may use them in
// Server Settings → Integrations.
function adminCommand(name, description) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild);
}

const welcome = adminCommand('sveikinimai', 'Naujų narių pasveikinimo nustatymai')
  .addSubcommand((s) => s.setName('ijungti').setDescription('Įjungti pasveikinimo žinutes'))
  .addSubcommand((s) => s.setName('isjungti').setDescription('Išjungti pasveikinimo žinutes'))
  .addSubcommand((s) =>
    s.setName('kanalas').setDescription('Pasirinkti kanalą, kuriame bus siunčiami pasveikinimai')
      .addChannelOption((o) =>
        o.setName('kanalas').setDescription('Pasveikinimų kanalas').addChannelTypes(...TEXT_CHANNELS).setRequired(true)))
  .addSubcommand((s) =>
    s.setName('zinute').setDescription('Nustatyti pasveikinimo tekstą ({user} – naujo nario paminėjimas)')
      .addStringOption((o) =>
        o.setName('tekstas').setDescription('Pvz.: Sveiki, {user}! Galimi: {user} {vardas} {server} {nariai}')
          .setRequired(true).setMaxLength(1500)))
  .addSubcommand((s) => s.setName('perziura').setDescription('Parodyti, kaip atrodys pasveikinimas'))
  .addSubcommand((s) => s.setName('nustatymai').setDescription('Parodyti dabartinius pasveikinimų nustatymus'));

const giveawayId = (o) =>
  o.setName('id').setDescription('Konkurso ID (pradėk rašyti pavadinimą)').setRequired(true).setAutocomplete(true);

const giveaways = adminCommand('konkursas', 'Konkursai (giveaways)')
  .addSubcommand((s) =>
    s.setName('sukurti').setDescription('Sukurti naują konkursą (prizus įrašysi atsidariusioje formoje)')
      .addStringOption((o) => o.setName('pavadinimas').setDescription('Konkurso pavadinimas').setRequired(true).setMaxLength(200))
      .addChannelOption((o) =>
        o.setName('kanalas').setDescription('Kanalas, kuriame bus paskelbtas konkursas').addChannelTypes(...TEXT_CHANNELS).setRequired(true))
      .addStringOption((o) =>
        o.setName('data').setDescription('Pabaiga: data, pvz. 2026-10-31 arba 2026-10-31 18:00').setMaxLength(30))
      .addStringOption((o) =>
        o.setName('trukme').setDescription('Pabaiga: trukmė, pvz. 5h, 30m, 2d, 1d 12h, 5 val').setMaxLength(40))
      .addIntegerOption((o) =>
        o.setName('nariai').setDescription('Pabaiga: kai serveris pasieks tiek narių, pvz. 4000').setMinValue(2)))
  .addSubcommand((s) => s.setName('baigti').setDescription('Baigti konkursą dabar ir išrinkti laimėtojus').addStringOption(giveawayId))
  .addSubcommand((s) =>
    s.setName('perrinkti').setDescription('Išrinkti naują laimėtoją pasibaigusiam konkursui').addStringOption(giveawayId)
      .addIntegerOption((o) => o.setName('vieta').setDescription('Kurią vietą perrinkti (pvz. 2). Palik tuščią – bus perrinktos visos').setMinValue(1).setMaxValue(25)))
  .addSubcommand((s) => s.setName('atsaukti').setDescription('Atšaukti konkursą be laimėtojų').addStringOption(giveawayId))
  .addSubcommand((s) => s.setName('sarasas').setDescription('Aktyvių konkursų sąrašas'))
  .addSubcommand((s) =>
    s.setName('bilietai').setDescription('Kanalas, kuriame laimėtojai kuria bilietą (rodomas laimėtojų pranešime)')
      .addChannelOption((o) =>
        o.setName('kanalas').setDescription('Bilietų kanalas. Palik tuščią, jei nori pašalinti').addChannelTypes(...TEXT_CHANNELS)));

const help = adminCommand('pagalba', 'Boto komandų sąrašas ir paaiškinimai');

const definitions = [welcome, giveaways, help];

function commandData() {
  return definitions.map((d) => d.toJSON());
}

/**
 * Upload all commands. With a guildId they appear in that server instantly;
 * without one they are registered globally for every server the bot is in.
 */
async function registerCommands(rest, applicationId, guildId) {
  const route = guildId
    ? Routes.applicationGuildCommands(applicationId, guildId)
    : Routes.applicationCommands(applicationId);
  return rest.put(route, { body: commandData() });
}

module.exports = { commandData, registerCommands };
