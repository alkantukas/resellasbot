const { PermissionFlagsBits } = require('discord.js');

// Lithuanian names as shown in the Discord app.
const NEEDED = [
  [PermissionFlagsBits.ViewChannel, 'Peržiūrėti kanalus'],
  [PermissionFlagsBits.SendMessages, 'Siųsti žinutes'],
  [PermissionFlagsBits.EmbedLinks, 'Įterpti nuorodas'],
  [PermissionFlagsBits.ReadMessageHistory, 'Skaityti žinučių istoriją'],
];

/** Names of the permissions the bot lacks in `channel` (empty if all is fine). */
function missingPermissions(channel) {
  const me = channel.guild?.members?.me;
  const perms = me && channel.permissionsFor(me);
  if (!perms) return NEEDED.map(([, name]) => name);
  return NEEDED.filter(([flag]) => !perms.has(flag)).map(([, name]) => name);
}

function missingText(channel, missing) {
  return `Botui trūksta leidimų kanale ${channel}: **${missing.join(', ')}**.\nSuteik juos kanalo nustatymuose (Leidimai) ir bandyk dar kartą.`;
}

module.exports = { missingPermissions, missingText };
