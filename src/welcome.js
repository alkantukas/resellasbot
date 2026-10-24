// Welcome messages for new members, configured per server with /sveikinimai.
const { successEmbed, errorEmbed, infoEmbed, ephemeral } = require('./embeds');
const { missingPermissions, missingText } = require('./permissions');

function renderTemplate(template, member) {
  return template
    .replaceAll('\\n', '\n')
    .replace(/\{(user|narys)\}/gi, `<@${member.id}>`)
    .replace(/\{(username|vardas)\}/gi, member.displayName ?? member.user.username)
    .replace(/\{(server|serveris)\}/gi, member.guild.name)
    .replace(/\{(count|nariai)\}/gi, String(member.guild.memberCount));
}

/** The welcome is a plain text message, e.g. "Sveikas atvykęs @vardas!". */
function buildWelcomeMessage(template, member) {
  return { content: renderTemplate(template, member).slice(0, 2000), allowedMentions: { users: [member.id] } };
}

// Private preview: the welcome text exactly as members will see it, plus an explanation box.
function preview(template, member, note) {
  return { ...ephemeral(note), content: renderTemplate(template, member).slice(0, 2000), allowedMentions: { parse: [] } };
}

class Welcome {
  constructor(client, store) {
    this.client = client;
    this.store = store;
  }

  async handleMemberAdd(member) {
    const settings = this.store.getWelcome(member.guild.id);
    if (!settings.enabled || !settings.channelId) return;
    const channel = member.guild.channels.cache.get(settings.channelId)
      ?? (await member.guild.channels.fetch(settings.channelId).catch(() => null));
    if (!channel) {
      console.warn(`[welcome] Channel ${settings.channelId} in "${member.guild.name}" no longer exists.`);
      return;
    }
    if (missingPermissions(channel).length) {
      console.warn(`[welcome] Missing permissions in #${channel.name} ("${member.guild.name}").`);
      return;
    }
    await channel.send(buildWelcomeMessage(settings.template, member));
  }

  async handleCommand(interaction) {
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === 'ijungti') {
      const s = this.store.updateWelcome(guildId, { enabled: true });
      const note = s.channelId
        ? `Pasveikinimai bus siunčiami į <#${s.channelId}>.`
        : '⚠️ Kanalas dar nepasirinktas. Naudok `/sveikinimai kanalas`.';
      return interaction.reply(ephemeral(successEmbed('Pasveikinimai įjungti', note)));
    }

    if (sub === 'isjungti') {
      this.store.updateWelcome(guildId, { enabled: false });
      return interaction.reply(ephemeral(successEmbed('Pasveikinimai išjungti', 'Nauji nariai nebebus sveikinami.')));
    }

    if (sub === 'kanalas') {
      const channel = interaction.options.getChannel('kanalas', true);
      const missing = missingPermissions(channel);
      if (missing.length) return interaction.reply(ephemeral(errorEmbed(missingText(channel, missing))));
      const s = this.store.updateWelcome(guildId, { channelId: channel.id });
      const note = s.enabled ? '' : '\n⚠️ Pasveikinimai šiuo metu išjungti. Įjunk juos su `/sveikinimai ijungti`.';
      return interaction.reply(ephemeral(successEmbed('Kanalas nustatytas', `Pasveikinimai bus siunčiami į ${channel}.${note}`)));
    }

    if (sub === 'zinute') {
      const template = interaction.options.getString('tekstas', true);
      this.store.updateWelcome(guildId, { template });
      return interaction.reply(preview(template, interaction.member, successEmbed('Pasveikinimo tekstas išsaugotas', 'Štai kaip jis atrodys (žinutė viršuje):')));
    }

    if (sub === 'perziura') {
      const s = this.store.getWelcome(guildId);
      return interaction.reply(preview(s.template, interaction.member, infoEmbed('👀 Pasveikinimo peržiūra', 'Taip atrodys žinutė (viršuje), kai prisijungs naujas narys.')));
    }

    if (sub === 'nustatymai') {
      const s = this.store.getWelcome(guildId);
      const embed = infoEmbed('⚙️ Pasveikinimų nustatymai').addFields(
        { name: 'Būsena', value: s.enabled ? '🟢 Įjungta' : '🔴 Išjungta', inline: true },
        { name: 'Kanalas', value: s.channelId ? `<#${s.channelId}>` : 'Nepasirinktas', inline: true },
        { name: 'Tekstas', value: `\`\`\`${s.template.slice(0, 1000)}\`\`\`` },
        { name: 'Galimi žymekliai', value: '`{user}` – paminėjimas, `{vardas}` – vardas, `{server}` – serverio pavadinimas, `{nariai}` – narių skaičius, `\\n` – nauja eilutė' },
      );
      return interaction.reply(ephemeral(embed));
    }
  }
}

module.exports = { Welcome, renderTemplate, buildWelcomeMessage };
