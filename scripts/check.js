// Self-check that runs without a Discord token: `npm run check`.
// 1. validates the slash commands against Discord's rules,
// 2. registers them against a local fake Discord API,
// 3. runs the date/duration parsing, storage and giveaway flow with fake Discord objects.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { REST, MessageFlags } = require('discord.js');

const { commandData, registerCommands } = require('../src/commands');
const { parseDuration, parseDate, ltDate, HOUR, DAY } = require('../src/time');
const { Store } = require('../src/storage');
const { Giveaways } = require('../src/giveaways');
const { Welcome } = require('../src/welcome');

let failures = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures++;
    console.log(`  FAIL ${name}\n       ${err.message}`);
  }
}

// Discord's limits for command names, descriptions and options.
const NAME_RE = /^[-_\p{L}\p{N}]{1,32}$/u;
function validateOption(opt, where) {
  assert.match(opt.name, NAME_RE, `${where}: bad name "${opt.name}"`);
  assert.equal(opt.name, opt.name.toLowerCase(), `${where}: name must be lowercase`);
  assert.ok(opt.description.length >= 1 && opt.description.length <= 100, `${where}: description length ${opt.description.length}`);
  const children = opt.options ?? [];
  assert.ok(children.length <= 25, `${where}: too many options`);
  let seenOptional = false;
  for (const child of children) {
    if (child.required) assert.ok(!seenOptional, `${where}/${child.name}: required option after optional one`);
    else seenOptional = true;
    validateOption(child, `${where}/${child.name}`);
  }
}
function textLength(opt) {
  return opt.name.length + opt.description.length + (opt.options ?? []).reduce((n, o) => n + textLength(o), 0);
}

// --- Fake Discord objects -------------------------------------------------

function fakeWorld() {
  const sent = [];
  const edits = [];
  const guild = { id: 'g1', name: 'Resell Zone', memberCount: 10, members: { me: {} } };
  const channel = {
    id: 'c1',
    guild,
    toString: () => '<#c1>',
    permissionsFor: () => ({ has: () => true }),
    async send(payload) {
      sent.push(payload);
      return { id: `m${sent.length}`, url: `https://discord.com/channels/g1/c1/m${sent.length}` };
    },
    messages: {
      async edit(id, payload) {
        edits.push({ id, payload });
        return { id, url: `https://discord.com/channels/g1/c1/${id}` };
      },
    },
  };
  const client = {
    channels: { fetch: async () => channel },
    guilds: { cache: new Map([['g1', guild]]) },
  };
  return { sent, edits, guild, channel, client };
}

function fakeInteraction({ sub, options = {}, userId = 'host', customId, guild }) {
  const replies = [];
  return {
    replies,
    customId,
    guildId: 'g1',
    guild,
    user: { id: userId },
    member: { id: userId, displayName: 'Tester', user: { username: 'tester', displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png' }, guild },
    options: {
      getSubcommand: () => sub,
      getString: (n) => options[n] ?? null,
      getInteger: (n) => options[n] ?? null,
      getChannel: (n) => options[n] ?? null,
      getFocused: () => '',
    },
    reply: async (p) => { replies.push(p); },
    deferReply: async () => { replies.push('deferred'); },
    editReply: async (p) => { replies.push(p); },
    update: async (p) => { replies.push(p); },
    respond: async (p) => { replies.push(p); },
    showModal: async (m) => { replies.push({ modal: m.toJSON() }); },
    fields: { getTextInputValue: (n) => options[n] ?? '' },
  };
}

// /konkursas sukurti, then fill in the prize form that pops up.
async function createGiveaway(gws, world, options, prizes) {
  const command = fakeInteraction({ sub: 'sukurti', guild: world.guild, options });
  await gws.handleCommand(command);
  const modal = command.replies.at(-1)?.modal;
  if (!modal) return command;
  assert.equal(modal.components[0].components[0].custom_id, 'prizai');
  const submit = fakeInteraction({ customId: modal.custom_id, guild: world.guild, options: { prizai: prizes } });
  await gws.handleModal(submit);
  return submit;
}

const embedJson = (payload) => payload.embeds.map((e) => (e.toJSON ? e.toJSON() : e));

// Components V2 container: returns all its text, after checking Discord's limits.
function containerText(payload, label) {
  assert.ok(payload.flags & MessageFlags.IsComponentsV2, `${label}: not sent as a container`);
  assert.ok(!payload.content && !payload.embeds, `${label}: containers can't have content or embeds`);
  const json = payload.components.map((c) => c.toJSON());
  const texts = [];
  let count = 0;
  const walk = (c) => {
    count++;
    if (c.type === 10) texts.push(c.content);
    (c.components ?? []).forEach(walk);
  };
  json.forEach(walk);
  assert.ok(count <= 40, `${label}: ${count} components (max 40)`);
  const all = texts.join('\n');
  assert.ok(all.length <= 4000, `${label}: ${all.length} characters of text (max 4000)`);
  return all;
}
const buttonOf = (payload) => payload.components[0].toJSON().components.at(-1).components[0];

// --------------------------------------------------------------------------

(async () => {
  console.log('Slash commands');
  const data = commandData();
  await test('commands follow Discord naming and length rules', () => {
    for (const cmd of data) {
      validateOption(cmd, `/${cmd.name}`);
      assert.ok(textLength(cmd) <= 4000, `/${cmd.name} is longer than 4000 characters`);
    }
    assert.deepEqual(data.map((c) => c.name), ['sveikinimai', 'konkursas', 'pagalba']);
  });

  await test('commands register (global and per server) against a fake Discord API', async () => {
    const requests = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        requests.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: JSON.parse(body || 'null') });
        const echoed = (JSON.parse(body || '[]')).map((c, i) => ({ id: String(i), ...c }));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(echoed));
      });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const rest = new REST({ api: `http://127.0.0.1:${server.address().port}/api` }).setToken('fake-token-for-testing');
    try {
      const globalResult = await registerCommands(rest, '111', undefined);
      const guildResult = await registerCommands(rest, '111', '222');
      assert.equal(requests[0].method, 'PUT');
      assert.equal(requests[0].url, '/api/v10/applications/111/commands');
      assert.equal(requests[1].url, '/api/v10/applications/111/guilds/222/commands');
      assert.equal(requests[0].auth, 'Bot fake-token-for-testing');
      assert.equal(globalResult.length, 3);
      assert.equal(guildResult.length, 3);
    } finally {
      server.close();
    }
  });

  console.log('Dates and durations');
  await test('durations', () => {
    assert.equal(parseDuration('5h'), 5 * HOUR);
    assert.equal(parseDuration('5 hours'), 5 * HOUR);
    assert.equal(parseDuration('5 val'), 5 * HOUR);
    assert.equal(parseDuration('1d 12h'), 36 * HOUR);
    assert.equal(parseDuration('2 dienos'), 2 * DAY);
    assert.equal(parseDuration('30m'), 30 * 60_000);
    assert.equal(parseDuration('1 savaitė'), 7 * DAY);
    assert.equal(parseDuration('5'), null);
    assert.equal(parseDuration('labas'), null);
    assert.equal(parseDuration('2 mėn'), null);
  });
  await test('dates in Europe/Vilnius', () => {
    // 2026-10-31 is after the switch to winter time (UTC+2).
    assert.equal(new Date(parseDate('2026-10-31', 'Europe/Vilnius')).toISOString(), '2026-10-31T21:59:00.000Z');
    // July is summer time (UTC+3).
    assert.equal(new Date(parseDate('2026-07-01 18:00', 'Europe/Vilnius')).toISOString(), '2026-07-01T15:00:00.000Z');
    assert.equal(parseDate('2026-02-30', 'Europe/Vilnius'), null);
    assert.equal(parseDate('31/10/2026', 'Europe/Vilnius'), null);
    assert.equal(ltDate(Date.UTC(2026, 9, 24, 12, 31), 'Europe/Vilnius'), '2026 m. spalio 24 d., šeštadienis 15:31');
  });

  console.log('Storage, welcome and giveaways (fake Discord)');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rz-bot-check-'));
  const file = path.join(dir, 'db.json');

  await test('welcome settings are saved and survive a restart', async () => {
    const world = fakeWorld();
    const welcome = new Welcome(world.client, new Store(file));
    await welcome.handleCommand(fakeInteraction({ sub: 'kanalas', options: { kanalas: world.channel }, guild: world.guild }));
    await welcome.handleCommand(fakeInteraction({ sub: 'zinute', options: { tekstas: 'Sveiki, {user}! Esi {nariai}-asis.' }, guild: world.guild }));
    await welcome.handleCommand(fakeInteraction({ sub: 'ijungti', guild: world.guild }));
    const s = new Store(file).getWelcome('g1');
    assert.deepEqual([s.enabled, s.channelId, s.template], [true, 'c1', 'Sveiki, {user}! Esi {nariai}-asis.']);

    const member = { id: 'newbie', guild: { ...world.guild, channels: { cache: new Map([['c1', world.channel]]) } }, displayName: 'Newbie', user: { username: 'newbie', displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png' } };
    await new Welcome(world.client, new Store(file)).handleMemberAdd(member);
    assert.equal(world.sent.length, 1);
    assert.equal(world.sent[0].content, 'Sveiki, <@newbie>! Esi 10-asis.');
    assert.equal(world.sent[0].embeds, undefined, 'welcome should be plain text');
    assert.deepEqual(world.sent[0].allowedMentions, { users: ['newbie'] });
  });

  await test('giveaway: create, live count, join/leave, end, winners, restart', async () => {
    const world = fakeWorld();
    const gws = new Giveaways(world.client, new Store(file));
    await createGiveaway(gws, world, { pavadinimas: 'Rudens konkursas', kanalas: world.channel, trukme: '5h' }, '1. Tiekėjų sąrašas\n2) Kursas\n\n');
    assert.equal(world.sent.length, 1, 'giveaway post was not sent');
    const post = containerText(world.sent[0], 'giveaway post');
    assert.ok(post.startsWith(`# Rudens konkursas
## Prizai
1. **Tiekėjų sąrašas**
2. **Kursas**
## Informacija
- Dalyvių: **0**
- Laimėtojų: **2**
- Baigsis: **20`), post);
    assert.match(post, /Baigsis: \*\*\d{4} m\. [a-ząčęėįšųūž]+ \d+ d\., [a-ząčęėįšųūž]+ \d\d:\d\d\*\* \(<t:\d+:R>\)/, 'end date is not in Lithuanian or has no countdown');
    assert.equal(buttonOf(world.sent[0]).label, 'Dalyvauti');

    const [gw] = gws.active('g1');
    for (const user of ['a', 'b', 'c', 'a']) {
      await gws.handleButton(fakeInteraction({ customId: `gw:join:${gw.id}`, userId: user, guild: world.guild }));
    }
    await gws.handleButton(fakeInteraction({ customId: `gw:leave:${gw.id}`, userId: 'c', guild: world.guild }));
    assert.deepEqual(gws.store.getGiveaway(gw.id).participants, ['a', 'b']);
    await gws.refreshMessage(gw.id); // what the debounced live update does
    assert.match(containerText(world.edits.at(-1).payload, 'updated post'), /Dalyvių: \*\*2\*\*/);
    await gws.handleCommand(fakeInteraction({ sub: 'bilietai', options: { kanalas: { id: 't1', toString: () => '<#t1>' } }, guild: world.guild }));
    gws.stop();

    // Pretend the bot was offline while the giveaway expired, then restart it.
    const store = new Store(file);
    store.getGiveaway(gw.id).endsAt = Date.now() - 1000;
    store.save();
    const restarted = new Giveaways(world.client, new Store(file));
    await restarted.start();
    restarted.stop();
    const ended = new Store(file).getGiveaway(gw.id);
    assert.equal(ended.status, 'ended');
    assert.deepEqual([...ended.winners].sort(), ['a', 'b']);
    const announcement = containerText(world.sent.at(-1), 'winner announcement');
    const [w1, w2] = ended.winners;
    assert.equal(announcement, `# Konkursas Baigtas! 🎉
## Laimėtojai
- <@${w1}> — **Tiekėjų sąrašas**
- <@${w2}> — **Kursas**
Ačiū visiems, kurie dalyvavo! ❤️
Laimėtojai, sukurkite 🎉 Giveaway bilietą čia: <#t1>`);
    assert.deepEqual(world.sent.at(-1).allowedMentions, { users: ended.winners });
    assert.match(containerText(world.edits.at(-1).payload, 'ended post'), /## Laimėtojai/);
    assert.equal(buttonOf(world.edits.at(-1).payload).disabled, true);

    // Re-draw only 2nd place: the new person gets prize 2, 1st place stays.
    const gws2 = new Giveaways(world.client, new Store(file));
    gws2.store.getGiveaway(gw.id).participants.push('c');
    await gws2.handleCommand(fakeInteraction({ sub: 'perrinkti', options: { id: gw.id, vieta: 2 }, guild: world.guild }));
    const after = new Store(file).getGiveaway(gw.id);
    assert.deepEqual(after.winners, [w1, 'c']);
    assert.deepEqual(after.pastWinners, [w2]);
    assert.equal(containerText(world.sent.at(-1), 'reroll').split('\n').slice(0, 3).join('\n'), '# Nauji Laimėtojai! 🎉\n## Laimėtojai\n- <@c> — **Kursas**');
  });

  await test('giveaway: ends when the server reaches a member count', async () => {
    const world = fakeWorld();
    const gws = new Giveaways(world.client, new Store(file));
    await createGiveaway(gws, world, { pavadinimas: 'Iki 12 narių', kanalas: world.channel, nariai: 12 }, 'Bundle');
    const [gw] = gws.active('g1');
    assert.match(containerText(world.sent[0], 'member post'), /Baigsis: \*\*Kai surinksime 12 narių\*\*/);
    await gws.handleButton(fakeInteraction({ customId: `gw:join:${gw.id}`, userId: 'z', guild: world.guild }));
    world.guild.memberCount = 11;
    await gws.handleMemberAdd({ guild: world.guild });
    assert.equal(gws.store.getGiveaway(gw.id).status, 'active');
    world.guild.memberCount = 12;
    await gws.handleMemberAdd({ guild: world.guild });
    gws.stop();
    assert.equal(gws.store.getGiveaway(gw.id).status, 'ended');
    assert.deepEqual(gws.store.getGiveaway(gw.id).winners, ['z']);
  });

  await test('giveaway: rejects zero or several end conditions with an embed', async () => {
    const world = fakeWorld();
    const gws = new Giveaways(world.client, new Store(file));
    const i = await createGiveaway(gws, world, { pavadinimas: 'X', kanalas: world.channel, trukme: '1h', nariai: 50 }, 'Y');
    assert.equal(world.sent.length, 0);
    assert.equal(i.replies.length, 1, 'the prize form should not open');
    assert.equal(embedJson(i.replies[0])[0].title, '❌ Klaida');
  });

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
  process.exit(failures ? 1 : 0);
})();
