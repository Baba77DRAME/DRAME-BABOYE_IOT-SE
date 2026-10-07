'use strict';

const mqtt = require('mqtt');
const { randomBytes } = require('node:crypto');

const BROKER = process.env.MQTT_BROKER ?? 'mqtt://localhost:1883';
const USER   = process.env.MQTT_USER   ?? 'server';
const PASS   = process.env.MQTT_PASS   ?? 'server';
const ROOT   = 'reptiles/v1';

const DOOR_TIMEOUT_MS    = 15 * 60 * 1000;
const MAINS_OFFLINE_MS   = 10 * 60 * 1000;
const BATTERY_OFFLINE_MS = 70 * 60 * 1000;
const TEMP_HOT_MAX       = 50;
const CHECK_INTERVAL_MS  = 30 * 1000;

const doors      = new Map();
const heartbeats = new Map();
const active     = new Set();

const clientId = `server-alerting-${randomBytes(3).toString('hex')}`;

const client = mqtt.connect(BROKER, {
  clientId,
  username: USER,
  password: PASS,
  clean: true,
  keepalive: 60,
  reconnectPeriod: 3000,
});

function pub(zone, nodeId, code, level, message, extra = {}) {
  const key = `${nodeId}:${code}`;
  if (active.has(key)) return;
  active.add(key);
  const payload = { v: 1, msgId: randomBytes(8).toString('hex'), node: nodeId, zone,
    ts: Date.now(), serverTs: Date.now(), seq: null, type: 'alert', level, code, message, ...extra };
  client.publish(`${ROOT}/alerts/${zone}/${nodeId}`, JSON.stringify(payload), { qos: 1, retain: true });
  process.stdout.write(`[alert] ${level.padEnd(8)} ${code} → ${nodeId}: ${message}\n`);
}

function resolve(zone, nodeId, code) {
  const key = `${nodeId}:${code}`;
  if (!active.has(key)) return;
  active.delete(key);
  const payload = { v: 1, msgId: randomBytes(8).toString('hex'), node: nodeId, zone,
    ts: Date.now(), type: 'alert', level: 'resolved', code, status: 'resolved' };
  client.publish(`${ROOT}/alerts/${zone}/${nodeId}`, JSON.stringify(payload), { qos: 1, retain: true });
  process.stdout.write(`[resolved] ${code} → ${nodeId}\n`);
}

client.on('connect', () => {
  process.stdout.write(`[server] connecté ${BROKER} (${clientId})\n`);
  client.subscribe(`${ROOT}/nodes/+/+/telemetry`);
  client.subscribe(`${ROOT}/nodes/+/+/events`);
  client.subscribe(`${ROOT}/nodes/+/+/heartbeat`);
  client.subscribe(`${ROOT}/nodes/+/+/availability`);
});

client.on('message', (topic, buf) => {
  let msg;
  try { msg = JSON.parse(buf.toString()); } catch { return; }

  const parts   = topic.split('/');
  const zone    = parts[3];
  const nodeId  = parts[4];
  const topicType = parts[5];

  if (topicType === 'heartbeat') {
    const isBattery = zone === 'EXT' || nodeId.startsWith('N-DOOR-');
    heartbeats.set(nodeId, { lastSeen: Date.now(), zone, isBattery });
    resolve(zone, nodeId, 'node_offline');
    if (msg.battery !== undefined) {
      if (msg.battery < 20) {
        pub(zone, nodeId, 'battery_low', 'warning',
          `Batterie faible sur ${nodeId} : ${msg.battery} %`, { battery: msg.battery });
      } else {
        resolve(zone, nodeId, 'battery_low');
      }
    }
    return;
  }

  if (topicType === 'availability') {
    if (msg.status === 'online') resolve(zone, nodeId, 'node_offline');
    return;
  }

  if (topicType === 'events') {
    if (msg.type === 'door') {
      if (msg.state === 'open') {
        doors.set(nodeId, { openSince: Date.now(), zone });
      } else {
        doors.delete(nodeId);
        resolve(zone, nodeId, 'door_open_timeout');
      }
    }
    if (msg.type === 'boot') resolve(zone, nodeId, 'node_offline');
    return;
  }

  if (topicType === 'telemetry' && msg.type === 'reading') {
    const { sensor, value } = msg;
    const isTempSensor = ['temp_hot', 'temp_cold', 'temp_ambient'].includes(sensor);

    if (isTempSensor) {
      if (value === -127) {
        pub(zone, nodeId, 'probe_disconnected', 'critical',
          `Sonde ${sensor} déconnectée sur ${nodeId} (−127)`, { sensor, value });
      } else if (value === 85) {
        pub(zone, nodeId, 'probe_por', 'warning',
          `Sonde ${sensor} Power-On Reset sur ${nodeId} (85 °C)`, { sensor, value });
      } else {
        resolve(zone, nodeId, 'probe_disconnected');
        resolve(zone, nodeId, 'probe_por');
      }

      if (sensor === 'temp_hot') {
        if (value > TEMP_HOT_MAX) {
          pub(zone, nodeId, 'temp_hot_overflow', 'critical',
            `Point chaud ${nodeId} dépasse ${TEMP_HOT_MAX} °C (${value} °C)`,
            { sensor, value, unit: 'C', threshold: TEMP_HOT_MAX });
        } else {
          resolve(zone, nodeId, 'temp_hot_overflow');
        }
      }
    }
  }
});

setInterval(() => {
  const now = Date.now();

  for (const [nodeId, door] of doors) {
    if (now - door.openSince > DOOR_TIMEOUT_MS) {
      const min = Math.round((now - door.openSince) / 60000);
      pub(door.zone, nodeId, 'door_open_timeout', 'warning',
        `Porte ${nodeId} ouverte depuis ${min} min`, { openSinceMs: door.openSince });
    }
  }

  for (const [nodeId, hb] of heartbeats) {
    const limit = hb.isBattery ? BATTERY_OFFLINE_MS : MAINS_OFFLINE_MS;
    if (now - hb.lastSeen > limit) {
      const min = Math.round((now - hb.lastSeen) / 60000);
      pub(hb.zone, nodeId, 'node_offline', 'warning',
        `Node ${nodeId} hors ligne depuis ${min} min`, { lastSeenMs: hb.lastSeen });
    }
  }
}, CHECK_INTERVAL_MS);

client.on('error', (err) => process.stderr.write(`[server] erreur: ${err.message}\n`));

process.on('SIGINT',  () => { client.end(); process.exit(0); });
process.on('SIGTERM', () => { client.end(); process.exit(0); });
