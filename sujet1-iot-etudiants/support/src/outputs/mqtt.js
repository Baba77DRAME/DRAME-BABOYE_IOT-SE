'use strict';

const mqtt = require('mqtt');
const { randomBytes } = require('node:crypto');
const { rooms, enclosures, buildingDoors } = require('../facility');
const { MessageBuffer } = require('./buffer');

// ── Configuration par variables d'environnement ─────────────────────────────

const CFG = {
  broker:            process.env.MQTT_BROKER              ?? 'mqtt://localhost:1883',
  user:              process.env.MQTT_USER                ?? 'simulator',
  pass:              process.env.MQTT_PASS                ?? 'simulator',
  clientId:          process.env.MQTT_CLIENT_ID           ?? `simulator-main-${randomBytes(3).toString('hex')}`,
  keepalive:         Number(process.env.MQTT_KEEPALIVE)   || 60,
  reconnectMinDelay: Number(process.env.MQTT_RECONNECT_MIN_DELAY) || 3_000,
  reconnectMaxDelay: Number(process.env.MQTT_RECONNECT_MAX_DELAY) || 30_000,
  bufferMax:         Number(process.env.MQTT_BUFFER_MAX)  || 500,
  root:              process.env.MQTT_ROOT_TOPIC          ?? 'reptiles/v1',
  cleanSession:      (process.env.MQTT_CLEAN_SESSION      ?? 'true') !== 'false',
};

const ROOT = CFG.root;

// ── Liste de tous les nodes du site ─────────────────────────────────────────

const allNodes = [
  ...rooms.filter(r => r.ambient !== null).map(r => ({ id: `N-ROOM-${r.id}`, zone: r.id })),
  ...enclosures.map(e => ({ id: `N-${e.id}`, zone: e.room })),
  ...buildingDoors.map(d => ({ id: `N-${d.id}`, zone: 'BAT' })),
];

// ── Utilitaires topic / payload ──────────────────────────────────────────────

function zoneOf(nodeId) {
  if (nodeId.startsWith('N-ROOM-')) return nodeId.slice(7);
  if (nodeId.startsWith('N-DOOR-')) return 'BAT';
  return nodeId.split('-')[1];
}

function enclosureOf(nodeId) {
  if (nodeId.startsWith('N-ROOM-') || nodeId.startsWith('N-DOOR-')) return null;
  return nodeId.slice(2);
}

function topicTypeOf(type) {
  switch (type) {
    case 'reading':   return 'telemetry';
    case 'door':
    case 'boot':      return 'events';
    case 'heartbeat': return 'heartbeat';
    case 'ack':       return 'ack';
    default:          return 'events';
  }
}

function qosOf(type) {
  return ['door', 'boot', 'ack'].includes(type) ? 1 : 0;
}

function wrap(msg) {
  const zone      = zoneOf(msg.node);
  const enclosure = enclosureOf(msg.node);
  const serverTs  = Date.now();
  const late      = msg.ts > 1_700_000_000_000 && (serverTs - msg.ts) > 120_000;
  const { node, ts, seq, ...rest } = msg;
  return {
    v:        1,
    msgId:    randomBytes(8).toString('hex'),
    node,
    zone,
    enclosure,
    ts,
    serverTs,
    seq,
    ...(late && { late: true }),
    ...rest,
  };
}

// ── Adaptateur principal ─────────────────────────────────────────────────────

function createMqttOutput() {
  let client      = null;
  let connected   = false;
  let stopping    = false;
  let reconnDelay = CFG.reconnectMinDelay;

  const buffer = new MessageBuffer({ maxSize: CFG.bufferMax });

  const lwtTopic   = `${ROOT}/site/availability`;
  const lwtOffline = JSON.stringify({ v: 1, status: 'offline', source: 'simulator', ts: 0 });
  const lwtOnline  = () => JSON.stringify({ v: 1, status: 'online', source: 'simulator', ts: Date.now() });

  // ── Publication (bufférisée pendant une coupure réseau) ───────────────────

  function pub(topic, payload, opts = {}) {
    if (connected) {
      client.publish(topic, payload, opts);
    } else {
      buffer.push({ topic, payload, opts });
      if (buffer.size % 50 === 0) {
        process.stderr.write(`[mqtt] hors ligne — tampon : ${buffer.size} message(s)\n`);
      }
    }
  }

  // ── Vidange du tampon après reconnexion ───────────────────────────────────

  function flushBuffer() {
    const items = buffer.drain();
    if (items.length === 0) return;
    process.stderr.write(`[mqtt] vidange tampon : ${items.length} message(s) en attente\n`);
    let i = 0;
    function next() {
      if (i >= items.length) {
        const s = buffer.stats();
        if (s.dropped > 0) {
          process.stderr.write(`[mqtt] tampon résumé : ${s.dropped} message(s) abandonné(s) sur ${s.received} reçus\n`);
        }
        return;
      }
      const { topic, payload, opts } = items[i++];
      client.publish(topic, payload, opts, next);
    }
    next();
  }

  // ── Reconnexion avec backoff exponentiel ──────────────────────────────────

  function scheduleReconnect() {
    if (stopping) return;
    process.stderr.write(`[mqtt] reconnexion dans ${(reconnDelay / 1000).toFixed(1)} s (backoff x2, max ${CFG.reconnectMaxDelay / 1000} s)...\n`);
    setTimeout(() => {
      if (!stopping) client.reconnect();
    }, reconnDelay);
    reconnDelay = Math.min(reconnDelay * 2, CFG.reconnectMaxDelay);
  }

  return {
    start(sim) {
      client = mqtt.connect(CFG.broker, {
        clientId:        CFG.clientId,
        username:        CFG.user,
        password:        CFG.pass,
        will:            { topic: lwtTopic, payload: Buffer.from(lwtOffline), qos: 1, retain: true },
        clean:           CFG.cleanSession,
        keepalive:       CFG.keepalive,
        reconnectPeriod: 0,
      });

      // ── Connexion établie ─────────────────────────────────────────────────

      client.on('connect', () => {
        connected   = true;
        reconnDelay = CFG.reconnectMinDelay;
        process.stderr.write(`[mqtt] connecté ${CFG.broker} (${CFG.clientId})\n`);

        client.publish(lwtTopic, lwtOnline(), { qos: 1, retain: true });

        for (const { id, zone } of allNodes) {
          client.publish(
            `${ROOT}/nodes/${zone}/${id}/availability`,
            JSON.stringify({ v: 1, node: id, zone, status: 'online', ts: Date.now() }),
            { qos: 1, retain: true },
          );
        }

        client.subscribe(`${ROOT}/nodes/+/+/cmd`, { qos: 1 }, (err) => {
          if (err) process.stderr.write(`[mqtt] erreur abonnement cmd : ${err.message}\n`);
        });

        flushBuffer();
      });

      // ── Réception commandes ───────────────────────────────────────────────

      client.on('message', (_topic, buf) => {
        let cmd;
        try { cmd = JSON.parse(buf.toString()); } catch { return; }
        if (cmd.expiresAt && Date.now() > cmd.expiresAt) {
          process.stderr.write(`[mqtt] commande expirée ignorée (cmdId=${cmd.cmdId})\n`);
          return;
        }
        const result = sim.handleCommand({ ...cmd, id: cmd.cmdId ?? cmd.id });
        if (result === null) {
          process.stderr.write(`[mqtt] commande ignorée — node inconnu ou hors ligne : ${cmd.target}\n`);
        }
      });

      // ── Coupure / reconnexion ─────────────────────────────────────────────

      client.on('close', () => {
        if (!connected) return;
        connected = false;
        process.stderr.write('[mqtt] connexion perdue — messages mis en tampon\n');
        scheduleReconnect();
      });

      client.on('reconnect', () => {
        process.stderr.write('[mqtt] tentative de reconnexion...\n');
      });

      client.on('error', (err) => {
        process.stderr.write(`[mqtt] erreur : ${err.message}\n`);
      });

      // ── Écoute des messages du simulateur ─────────────────────────────────

      sim.on('message', (msg) => {
        const zone  = zoneOf(msg.node);
        const topic = `${ROOT}/nodes/${zone}/${msg.node}/${topicTypeOf(msg.type)}`;
        const qos   = qosOf(msg.type);
        pub(topic, JSON.stringify(wrap(msg)), { qos, retain: false });
      });
    },

    stop() {
      stopping = true;
      if (!client) return;
      const offline = JSON.stringify({ v: 1, status: 'offline', source: 'simulator', ts: Date.now() });
      client.publish(lwtTopic, offline, { qos: 1, retain: true }, () => client.end());
    },
  };
}

module.exports = { createMqttOutput };
