// Konkursai (giveaways): creation, live participant count, ending and winners.
// Each prize is one winning place: prize 1 goes to the 1st winner, prize 2 to the 2nd, and so on.
const crypto = require('node:crypto');
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder,
  SeparatorBuilder, SeparatorSpacingSize, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { infoEmbed, successEmbed, errorEmbed, ephemeral, joinLimited } = require('./embeds');
const { parseDuration, parseDate, ltDate, MINUTE, DAY } = require('./time');
const { missingPermissions, missingText } = require('./permissions');

const CHECK_INTERVAL_MS = 15_000; // how often time-based endings are checked
const UPDATE_DELAY_MS = 2_000; // batch participant-count edits to respect rate limits
const DRAFT_TTL_MS = 15 * MINUTE; // how long the prize form stays valid
const MAX_PRIZES = 25;
const UNKNOWN_CHANNEL = 10003;
const UNKNOWN_MESSAGE = 10008;

/** One prize per line; "1.", "2)", "-" and similar list markers are removed. */
function parsePrizes(raw) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:\d+\s*[.):-]|[-•*])\s*/, '').trim())
    .filter(Boolean);
}

/** Fair random pick of `count` distinct items. */
function pickRandom(pool, count) {
  const arr = [...pool];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

const mention = (id) => `<@${id}>`;
const num = (n) => new Intl.NumberFormat('lt-LT').format(n); // 4000 -> "4 000"

function prizesText(gw) {
  return joinLimited(gw.prizes.map((p, i) => `${i + 1}. **${p}**`), 1500);
}

/** "- @name — **prize**" for the given places (indexes into gw.prizes / gw.winners). */
function winnersText(gw, places) {
  const lines = places.filter((i) => gw.winners[i]).map((i) => `- ${mention(gw.winners[i])} — **${gw.prizes[i]}**`);
  return lines.length ? joinLimited(lines, 1500) : 'Nėra – niekas nedalyvavo.';
}

const allPlaces = (gw) => gw.prizes.map((_, i) => i);

/** Discord's live countdown ("in 53 seconds"); its wording follows each viewer's app language. */
const countdown = (ms) => `<t:${Math.floor(ms / 1000)}:R>`;

function endConditionText(gw) {
  if (gw.endType === 'members') return `**Kai surinksime ${num(gw.memberTarget)} narių**`;
  return `**${ltDate(gw.endsAt)}** (${countdown(gw.endsAt)})`;
}

// Discord "container" layout (Components V2): no coloured side bar, headings and separators.
const text = (content) => new TextDisplayBuilder().setContent(content);
const separator = () => new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);

/** The konkursas post: name as title, then Prizai, then Informacija, then the join button. */
function buildGiveawayMessage(gw) {
  const active = gw.status === 'active';
  const info = [`- Dalyvių: **${num(gw.participants.length)}**`, `- Laimėtojų: **${num(gw.prizes.length)}**`];
  if (active) info.push(`- Baigsis: ${endConditionText(gw)}`);
  else if (gw.status === 'ended') info.push(`- Baigėsi: **${ltDate(gw.endedAt)}**`);
  else info.push('- Konkursas **atšauktas**');

  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(`# ${gw.name}`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(`## Prizai\n${prizesText(gw)}`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(`## Informacija\n${info.join('\n')}`));
  if (gw.status === 'ended') {
    container.addSeparatorComponents(separator())
      .addTextDisplayComponents(text(`## Laimėtojai\n${winnersText(gw, allPlaces(gw))}`));
  }
  container.addSeparatorComponents(separator())
    .addTextDisplayComponents(text(active
      ? 'Paspausk **Dalyvauti**, jei nori dalyvauti šiame konkurse.'
      : gw.status === 'ended' ? 'Konkursas baigtas. Ačiū visiems dalyvavusiems!' : 'Šis konkursas atšauktas.'))
    .addSeparatorComponents(separator());

  const button = new ButtonBuilder().setCustomId(`gw:join:${gw.id}`).setStyle(ButtonStyle.Secondary);
  if (active) button.setLabel('Dalyvauti').setEmoji('🎟️');
  else button.setLabel(gw.status === 'ended' ? 'Baigta' : 'Atšaukta').setDisabled(true);
  container.addActionRowComponents(new ActionRowBuilder().addComponents(button));

  return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

/** Winner announcement, posted as a reply to the konkursas when it ends (or a place is re-drawn). */
function buildAnnouncement(gw, places, { reroll = false, ticketChannelId } = {}) {
  const winners = places.map((i) => gw.winners[i]).filter(Boolean);
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(`# ${reroll ? 'Nauji Laimėtojai!' : 'Konkursas Baigtas!'} 🎉`))
    .addSeparatorComponents(separator());
  if (winners.length) {
    container.addTextDisplayComponents(text(`## Laimėtojai\n${winnersText(gw, places)}`))
      .addSeparatorComponents(separator())
      .addTextDisplayComponents(text('Ačiū visiems, kurie dalyvavo! ❤️'));
    if (ticketChannelId) {
      container.addSeparatorComponents(separator())
        .addTextDisplayComponents(text(`Laimėtojai, sukurkite 🎉 Giveaway bilietą čia: <#${ticketChannelId}>`));
    }
  } else {
    container.addTextDisplayComponents(text(reroll
      ? 'Nebeliko dalyvių, iš kurių būtų galima išrinkti naujų laimėtojų.'
      : 'Deja, niekas nedalyvavo, todėl laimėtojų nėra.'));
  }
  // Mentions inside the container notify the winners.
  return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { users: winners } };
}

function buildPrizeModal(draftId, name) {
  const input = new TextInputBuilder()
    .setCustomId('prizai')
    .setLabel('Prizai: 1 eilutė = 1 vieta (1, 2, 3…)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('1 vietos prizas\n2 vietos prizas\n3 vietos prizas')
    .setRequired(true)
    .setMaxLength(2000);
  return new ModalBuilder()
    .setCustomId(`gw:prizes:${draftId}`)
    .setTitle(`Prizai: ${name}`.slice(0, 45))
    .addComponents(new ActionRowBuilder().addComponents(input));
}

class Giveaways {
  constructor(client, store) {
    this.client = client;
    this.store = store;
    this.pendingUpdates = new Map();
    this.ending = new Set();
    this.drafts = new Map(); // konkursai waiting for their prize form
    this.timeZone = process.env.TIMEZONE || 'Europe/Vilnius';
  }

  active(guildId) {
    return this.store.listGiveaways((g) => g.status === 'active' && (!guildId || g.guildId === guildId));
  }

  /** Called once the bot is online: catch up on anything that happened while it was off. */
  async start() {
    this.timer = setInterval(() => this.tick().catch((e) => console.error('[konkursai] tick failed:', e)), CHECK_INTERVAL_MS);
    for (const gw of this.active()) {
      if (!(await this.checkEnd(gw))) this.scheduleUpdate(gw.id);
    }
  }

  stop() {
    clearInterval(this.timer);
    for (const t of this.pendingUpdates.values()) clearTimeout(t);
    this.pendingUpdates.clear();
  }

  async tick() {
    for (const gw of this.active()) await this.checkEnd(gw);
  }

  shouldEnd(gw) {
    if (gw.endType === 'members') {
      const guild = this.client.guilds.cache.get(gw.guildId);
      return Boolean(guild && guild.memberCount >= gw.memberTarget);
    }
    return Date.now() >= gw.endsAt;
  }

  async checkEnd(gw) {
    if (!this.shouldEnd(gw)) return false;
    await this.end(gw.id);
    return true;
  }

  scheduleUpdate(id) {
    if (this.pendingUpdates.has(id)) return;
    const timer = setTimeout(() => {
      this.pendingUpdates.delete(id);
      this.refreshMessage(id).catch((e) => console.error(`[konkursai] could not update ${id}:`, e.message));
    }, UPDATE_DELAY_MS);
    this.pendingUpdates.set(id, timer);
  }

  cancelUpdate(id) {
    clearTimeout(this.pendingUpdates.get(id));
    this.pendingUpdates.delete(id);
  }

  async editMessage(gw) {
    try {
      const channel = await this.client.channels.fetch(gw.channelId);
      return await channel.messages.edit(gw.messageId, buildGiveawayMessage(gw));
    } catch (err) {
      // The post or its channel was deleted: nothing left to run the konkursas on.
      if ((err.code === UNKNOWN_MESSAGE || err.code === UNKNOWN_CHANNEL) && gw.status === 'active') {
        console.warn(`[konkursai] Message for "${gw.name}" (${gw.id}) was deleted; cancelling it.`);
        gw.status = 'cancelled';
        this.store.saveGiveaway(gw);
        return null;
      }
      throw err;
    }
  }

  async refreshMessage(id) {
    const gw = this.store.getGiveaway(id);
    if (gw) await this.editMessage(gw);
  }

  async announce(gw, places, { reroll = false, replyTo } = {}) {
    const channel = await this.client.channels.fetch(gw.channelId);
    await channel.send({
      ...buildAnnouncement(gw, places, { reroll, ticketChannelId: this.store.getGuildSettings(gw.guildId).ticketChannelId }),
      reply: replyTo ? { messageReference: replyTo, failIfNotExists: false } : undefined,
    });
  }

  async end(id) {
    if (this.ending.has(id)) return null;
    this.ending.add(id);
    try {
      const gw = this.store.getGiveaway(id);
      if (!gw || gw.status !== 'active') return null;
      this.cancelUpdate(id);

      gw.winners = pickRandom(gw.participants, gw.prizes.length); // winners[i] gets prizes[i]
      gw.status = 'ended';
      gw.endedAt = Date.now();
      this.store.saveGiveaway(gw); // saved before announcing, so a crash can't pick twice

      const message = await this.editMessage(gw).catch((e) => console.error(`[konkursai] edit failed for ${id}:`, e.message));
      await this.announce(gw, allPlaces(gw), { replyTo: message?.id })
        .catch((e) => console.error(`[konkursai] could not announce winners for ${id}:`, e.message));
      return gw;
    } finally {
      this.ending.delete(id);
    }
  }

  /** Draw a new winner for one place (1-based), or for every place when `place` is omitted. */
  async reroll(id, place) {
    const gw = this.store.getGiveaway(id);
    const places = place ? [place - 1] : allPlaces(gw);
    const excluded = new Set([...gw.winners, ...(gw.pastWinners ?? [])].filter(Boolean));
    const picked = pickRandom(gw.participants.filter((p) => !excluded.has(p)), places.length);
    const changed = [];
    picked.forEach((userId, k) => {
      const i = places[k];
      if (gw.winners[i]) (gw.pastWinners ??= []).push(gw.winners[i]);
      gw.winners[i] = userId;
      changed.push(i);
    });
    for (let i = 0; i < gw.winners.length; i++) gw.winners[i] ??= null; // keep places aligned in JSON
    this.store.saveGiveaway(gw);
    await this.editMessage(gw).catch((e) => console.error(`[konkursai] edit failed for ${id}:`, e.message));
    await this.announce(gw, changed, { reroll: true, replyTo: gw.messageId });
    return changed;
  }

  async cancel(id) {
    const gw = this.store.getGiveaway(id);
    this.cancelUpdate(id);
    gw.status = 'cancelled';
    gw.endedAt = Date.now();
    this.store.saveGiveaway(gw);
    await this.editMessage(gw).catch((e) => console.error(`[konkursai] edit failed for ${id}:`, e.message));
  }

  // --- Discord events ----------------------------------------------------

  async handleMemberAdd(member) {
    for (const gw of this.active(member.guild.id)) {
      if (gw.endType !== 'members') continue;
      if (!(await this.checkEnd(gw))) this.scheduleUpdate(gw.id);
    }
  }

  handleMemberRemove(member) {
    for (const gw of this.active(member.guild.id)) {
      const i = gw.participants.indexOf(member.id);
      if (i !== -1) {
        gw.participants.splice(i, 1); // people who leave the server can't win
        this.store.saveGiveaway(gw);
      }
      if (i !== -1 || gw.endType === 'members') this.scheduleUpdate(gw.id);
    }
  }

  async handleButton(interaction) {
    const [, action, id] = interaction.customId.split(':');
    const gw = this.store.getGiveaway(id);
    if (!gw || gw.status !== 'active') {
      return interaction.reply(ephemeral(errorEmbed('Šis konkursas jau pasibaigė.')));
    }
    const joined = gw.participants.includes(interaction.user.id);

    if (action === 'join') {
      if (joined) {
        const leave = new ButtonBuilder().setCustomId(`gw:leave:${id}`).setLabel('Pasitraukti').setStyle(ButtonStyle.Danger);
        return interaction.reply({
          ...ephemeral(infoEmbed('ℹ️ Tu jau dalyvauji', `Tu jau dalyvauji konkurse **${gw.name}**. Nori pasitraukti?`)),
          components: [new ActionRowBuilder().addComponents(leave)],
        });
      }
      gw.participants.push(interaction.user.id);
      this.store.saveGiveaway(gw);
      this.scheduleUpdate(id);
      return interaction.reply(ephemeral(successEmbed('Tu dalyvauji!', `Užregistravome tave konkurse **${gw.name}**. Sėkmės! 🍀`)));
    }

    if (action === 'leave') {
      if (joined) {
        gw.participants.splice(gw.participants.indexOf(interaction.user.id), 1);
        this.store.saveGiveaway(gw);
        this.scheduleUpdate(id);
      }
      return interaction.update({
        embeds: [infoEmbed('👋 Pasitraukei', `Tu nebedalyvauji konkurse **${gw.name}**. Gali vėl prisijungti paspaudęs „Dalyvauti“.`)],
        components: [],
      });
    }
  }

  async handleAutocomplete(interaction) {
    const sub = interaction.options.getSubcommand();
    const query = interaction.options.getFocused().toLowerCase();
    const wanted = sub === 'perrinkti' ? 'ended' : 'active';
    const choices = this.store
      .listGiveaways((g) => g.guildId === interaction.guildId && g.status === wanted)
      .sort((a, b) => b.createdAt - a.createdAt)
      .filter((g) => g.name.toLowerCase().includes(query) || g.id.includes(query))
      .slice(0, 25)
      .map((g) => ({ name: `${g.name} (${g.id})`.slice(0, 100), value: g.id }));
    return interaction.respond(choices);
  }

  async handleCommand(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'sukurti') return this.create(interaction);
    if (sub === 'sarasas') return this.list(interaction);
    if (sub === 'bilietai') {
      const channel = interaction.options.getChannel('kanalas');
      this.store.updateGuildSettings(interaction.guildId, { ticketChannelId: channel?.id ?? null });
      return interaction.reply(ephemeral(channel
        ? successEmbed('Bilietų kanalas nustatytas', `Laimėtojų pranešime bus nuoroda į ${channel}.`)
        : successEmbed('Bilietų kanalas pašalintas', 'Laimėtojų pranešime nebebus nuorodos į bilietų kanalą.')));
    }

    const id = interaction.options.getString('id', true).trim();
    const gw = this.store.getGiveaway(id);
    if (!gw || gw.guildId !== interaction.guildId) {
      return interaction.reply(ephemeral(errorEmbed(`Konkursas su ID \`${id}\` nerastas. Pasirink jį iš sąrašo rašydamas pavadinimą.`)));
    }

    if (sub === 'baigti' || sub === 'atsaukti') {
      if (gw.status !== 'active') return interaction.reply(ephemeral(errorEmbed(`Konkursas **${gw.name}** jau nebeaktyvus.`)));
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      if (sub === 'baigti') {
        const ended = await this.end(id);
        const n = ended?.winners.length ?? 0;
        return interaction.editReply({ embeds: [successEmbed('Konkursas baigtas', `**${gw.name}** baigtas. Išrinkta laimėtojų: **${n}**.`)] });
      }
      await this.cancel(id);
      return interaction.editReply({ embeds: [successEmbed('Konkursas atšauktas', `**${gw.name}** atšauktas, laimėtojai nebus renkami.`)] });
    }

    if (sub === 'perrinkti') {
      if (gw.status !== 'ended') return interaction.reply(ephemeral(errorEmbed(`Konkursas **${gw.name}** dar nesibaigė. Pirmiausia jį užbaik su \`/konkursas baigti\`.`)));
      const place = interaction.options.getInteger('vieta') ?? undefined;
      if (place && place > gw.prizes.length) {
        return interaction.reply(ephemeral(errorEmbed(`Šiame konkurse yra tik **${gw.prizes.length}** vietos (prizai).`)));
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const changed = await this.reroll(id, place);
      const textOut = changed.length
        ? `Nauji laimėtojai:\n${winnersText(gw, changed)}`
        : 'Nebeliko dalyvių, iš kurių būtų galima išrinkti naujų laimėtojų.';
      return interaction.editReply({ embeds: [successEmbed('Laimėtojai perrinkti', textOut)] });
    }
  }

  async list(interaction) {
    const items = this.active(interaction.guildId).sort((a, b) => a.createdAt - b.createdAt);
    if (!items.length) return interaction.reply(ephemeral(infoEmbed('🎁 Aktyvūs konkursai', 'Šiuo metu aktyvių konkursų nėra.')));
    const lines = items.map((g) => {
      const end = g.endType === 'members' ? `kai bus ${num(g.memberTarget)} narių` : `${ltDate(g.endsAt)} (${countdown(g.endsAt)})`;
      return `**${g.name}** · ID \`${g.id}\` · <#${g.channelId}> · 👥 ${g.participants.length} · baigiasi ${end}`;
    });
    return interaction.reply(ephemeral(infoEmbed('🎁 Aktyvūs konkursai', joinLimited(lines, 4096))));
  }

  /** Step 1 of creating: check the options, then ask for the prizes in a form. */
  async create(interaction) {
    const o = interaction.options;
    const name = o.getString('pavadinimas', true).trim();
    const channel = o.getChannel('kanalas', true);
    const date = o.getString('data');
    const duration = o.getString('trukme');
    const members = o.getInteger('nariai');
    const fail = (msg) => interaction.reply(ephemeral(errorEmbed(msg)));

    if (!name) return fail('Pavadinimas negali būti tuščias.');
    const conditions = [date, duration, members].filter((v) => v !== null && v !== undefined);
    if (conditions.length !== 1) {
      return fail('Pasirink **lygiai vieną** pabaigos sąlygą:\n• `data` – pvz. `2026-10-31` arba `2026-10-31 18:00`\n• `trukme` – pvz. `5h`, `2d`, `1d 12h`\n• `nariai` – pvz. `1000`');
    }

    const draft = { name, channelId: channel.id, endType: null, endsAt: null, durationMs: null, memberTarget: null };
    if (date) {
      const at = parseDate(date, this.timeZone);
      if (at === null) return fail(`Nesupratau datos \`${date}\`. Naudok formatą \`2026-10-31\` arba \`2026-10-31 18:00\`.`);
      if (at <= Date.now() + MINUTE) return fail(`Data **${ltDate(at)}** jau praėjo arba yra per arti. Pasirink vėlesnę datą.`);
      Object.assign(draft, { endType: 'date', endsAt: at });
    } else if (duration) {
      const ms = parseDuration(duration);
      if (ms === null) return fail(`Nesupratau trukmės \`${duration}\`. Pavyzdžiai: \`30m\`, \`5h\`, \`2d\`, \`1d 12h\`, \`5 val\`.`);
      if (ms < MINUTE) return fail('Trukmė turi būti bent 1 minutė.');
      if (ms > 365 * DAY) return fail('Trukmė negali būti ilgesnė nei 1 metai.');
      Object.assign(draft, { endType: 'duration', durationMs: ms });
    } else {
      if (members <= interaction.guild.memberCount) {
        return fail(`Serveris jau turi **${num(interaction.guild.memberCount)}** narių. Nurodyk didesnį skaičių nei dabartinis.`);
      }
      Object.assign(draft, { endType: 'members', memberTarget: members });
    }

    const missing = missingPermissions(channel);
    if (missing.length) return fail(missingText(channel, missing));

    for (const [key, d] of this.drafts) if (d.expiresAt < Date.now()) this.drafts.delete(key);
    const draftId = crypto.randomBytes(6).toString('hex');
    this.drafts.set(draftId, { ...draft, expiresAt: Date.now() + DRAFT_TTL_MS });
    return interaction.showModal(buildPrizeModal(draftId, name));
  }

  /** Step 2 of creating: the prize form was sent, so post the konkursas. */
  async handleModal(interaction) {
    const draftId = interaction.customId.split(':')[2];
    const draft = this.drafts.get(draftId);
    const fail = (msg) => interaction.reply(ephemeral(errorEmbed(msg)));
    if (!draft || draft.expiresAt < Date.now()) {
      this.drafts.delete(draftId);
      return fail('Formos laikas baigėsi. Pradėk iš naujo su `/konkursas sukurti`.');
    }

    const prizes = parsePrizes(interaction.fields.getTextInputValue('prizai'));
    if (!prizes.length) return fail('Įrašyk bent vieną prizą.');
    if (prizes.length > MAX_PRIZES) return fail(`Daugiausia **${MAX_PRIZES}** prizai (vietos). Tu įrašei **${prizes.length}**.`);
    this.drafts.delete(draftId);

    const { expiresAt, durationMs, ...rest } = draft;
    const gw = {
      id: this.newId(),
      guildId: interaction.guildId,
      messageId: null,
      ...rest,
      endsAt: draft.endType === 'duration' ? Date.now() + durationMs : draft.endsAt,
      prizes,
      participants: [],
      winners: [],
      status: 'active',
      hostId: interaction.user.id,
      createdAt: Date.now(),
    };

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const channel = await this.client.channels.fetch(gw.channelId);
    const message = await channel.send(buildGiveawayMessage(gw));
    gw.messageId = message.id;
    this.store.saveGiveaway(gw);

    return interaction.editReply({
      embeds: [successEmbed('Konkursas sukurtas', `**${gw.name}** paskelbtas kanale <#${gw.channelId}>.\nLaimėtojų: **${prizes.length}** (po vieną kiekvienam prizui).\nID: \`${gw.id}\`\n[Atidaryti žinutę](${message.url})`)],
    });
  }

  newId() {
    let id;
    do id = crypto.randomBytes(3).toString('hex');
    while (this.store.getGiveaway(id));
    return id;
  }
}

module.exports = { Giveaways, buildGiveawayMessage, buildAnnouncement, parsePrizes, pickRandom };
