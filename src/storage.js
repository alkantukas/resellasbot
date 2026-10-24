// Simple JSON-file storage. Every change is written to disk straight away,
// so settings and giveaways survive restarts.
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_TEMPLATE = 'Sveikas atvykęs {user}!';

class Store {
  constructor(file) {
    this.file = file;
    this.data = { guilds: {}, giveaways: {} };
    this.load();
  }

  load() {
    let raw;
    try {
      raw = fs.readFileSync(this.file, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return; // first run, nothing saved yet
      throw err;
    }
    try {
      const parsed = JSON.parse(raw);
      this.data = { guilds: parsed.guilds ?? {}, giveaways: parsed.giveaways ?? {} };
    } catch {
      // Keep the broken file instead of silently overwriting it.
      const backup = `${this.file}.broken-${Date.now()}`;
      fs.renameSync(this.file, backup);
      console.error(`[storage] ${this.file} was not valid JSON. Moved it to ${backup} and started fresh.`);
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const json = JSON.stringify(this.data, null, 2);
    const tmp = `${this.file}.tmp`;
    try {
      fs.writeFileSync(tmp, json);
      fs.renameSync(tmp, this.file);
    } catch {
      // Windows can refuse the rename while another program holds the file.
      fs.writeFileSync(this.file, json);
    }
  }

  // --- Welcome settings -------------------------------------------------

  getWelcome(guildId) {
    return {
      enabled: false,
      channelId: null,
      template: DEFAULT_TEMPLATE,
      ...this.data.guilds[guildId]?.welcome,
    };
  }

  updateWelcome(guildId, patch) {
    const guild = (this.data.guilds[guildId] ??= {});
    guild.welcome = { ...this.getWelcome(guildId), ...patch };
    this.save();
    return guild.welcome;
  }

  // --- Other per-server settings ----------------------------------------

  getGuildSettings(guildId) {
    return { ticketChannelId: null, ...this.data.guilds[guildId]?.settings };
  }

  updateGuildSettings(guildId, patch) {
    const guild = (this.data.guilds[guildId] ??= {});
    guild.settings = { ...this.getGuildSettings(guildId), ...patch };
    this.save();
    return guild.settings;
  }

  // --- Giveaways --------------------------------------------------------

  getGiveaway(id) {
    return this.data.giveaways[id] ?? null;
  }

  saveGiveaway(giveaway) {
    this.data.giveaways[giveaway.id] = giveaway;
    this.save();
  }

  listGiveaways(filter = () => true) {
    return Object.values(this.data.giveaways).filter(filter);
  }
}

module.exports = { Store, DEFAULT_TEMPLATE };
