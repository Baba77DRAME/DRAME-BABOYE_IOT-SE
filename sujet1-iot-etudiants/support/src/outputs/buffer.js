'use strict';

/**
 * Tampon de messages MQTT prioritaire.
 *
 * Stratégie de priorité :
 *   File HAUTE (QoS >= 1) : door, boot, ack, availability
 *     → 60 % de la capacité totale
 *     → préservés en priorité lors d'un débordement
 *   File BASSE (QoS 0) : telemetry, heartbeat
 *     → 40 % de la capacité totale
 *     → abandonnés en premier lors d'un débordement
 *
 * Lors du débordement de la file BASSE  → supprime le message le plus ancien (silencieux).
 * Lors du débordement de la file HAUTE  → supprime le message le plus ancien + avertissement.
 *
 * Lors de la reconnexion, drain() retourne les messages dans l'ordre :
 *   haute priorité d'abord, puis basse priorité (FIFO dans chaque file).
 */
class MessageBuffer {
  constructor({ maxSize = 500 } = {}) {
    this._maxHigh = Math.ceil(maxSize * 0.6);
    this._maxLow  = Math.floor(maxSize * 0.4);
    this._high    = [];
    this._low     = [];
    this.dropped  = 0;
    this.received = 0;
  }

  push(item) {
    this.received++;
    const qos = item.opts?.qos ?? 0;
    if (qos >= 1) {
      if (this._high.length >= this._maxHigh) {
        this._high.shift();
        this.dropped++;
        process.stderr.write('[buffer] AVERTISSEMENT : message haute priorité abandonné (tampon saturé)\n');
      }
      this._high.push(item);
    } else {
      if (this._low.length >= this._maxLow) {
        this._low.shift();
        this.dropped++;
      }
      this._low.push(item);
    }
  }

  drain() {
    const items = [...this._high, ...this._low];
    this._high = [];
    this._low  = [];
    return items;
  }

  get size() {
    return this._high.length + this._low.length;
  }

  stats() {
    return {
      high:     this._high.length,
      low:      this._low.length,
      dropped:  this.dropped,
      received: this.received,
    };
  }
}

module.exports = { MessageBuffer };
