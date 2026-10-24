// Shared look for every message the bot sends.
const { EmbedBuilder, MessageFlags } = require('discord.js');

const COLORS = {
  accent: 0x1da1ff, // Resell Zone blue
  dark: 0x0b0f14, // Resell Zone dark, used for finished giveaways
  success: 0x22c55e,
  error: 0xef4444,
};

function brand() {
  return process.env.BRAND_NAME || 'Resell Zone';
}

function baseEmbed(color = COLORS.accent) {
  return new EmbedBuilder().setColor(color).setFooter({ text: brand() }).setTimestamp();
}

function infoEmbed(title, description) {
  const e = baseEmbed().setTitle(title);
  if (description) e.setDescription(description);
  return e;
}

function successEmbed(title, description) {
  const e = baseEmbed(COLORS.success).setTitle(`✅ ${title}`);
  if (description) e.setDescription(description);
  return e;
}

function errorEmbed(description) {
  return baseEmbed(COLORS.error).setTitle('❌ Klaida').setDescription(description);
}

/** Reply privately (only the person who used the command sees it). */
function ephemeral(...embeds) {
  return { embeds, flags: MessageFlags.Ephemeral };
}

/** Join lines, stopping before `limit` characters with "…ir dar N". */
function joinLimited(lines, limit = 1024) {
  let out = '';
  for (let i = 0; i < lines.length; i++) {
    const next = (out ? '\n' : '') + lines[i];
    if (out.length + next.length > limit - 20) return `${out}\n…ir dar ${lines.length - i}`;
    out += next;
  }
  return out;
}

module.exports = { COLORS, brand, baseEmbed, infoEmbed, successEmbed, errorEmbed, ephemeral, joinLimited };
