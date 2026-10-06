# Partie 1 — Conception matérielle

Conception du système IoT embarqué pour le centre de réhabilitation pour reptiles.  
Le centre comporte 21 terrariums répartis en 5 zones, 4 salles, 3 portes de bâtiment, soit **28 nodes** au total.

---

## A1 — Matrices de décision (`Composants.html`)

Sélection des composants par scoring pondéré. Six fonctions analysées :

| Fonction | Candidats évalués | Choix retenu |
|---|---|---|
| Microcontrôleur intérieur | ESP32 DevKit V1, Arduino Mega, Raspberry Pi Zero | **ESP32 DevKit V1** |
| Microcontrôleur extérieur | TTGO LoRa32, Pycom LoPy4, Arduino MKR WAN | **TTGO LoRa32 V2.1** |
| Sonde température | DS18B20, DHT22, SHT31 | **DS18B20** (1-Wire, résolution 0,0625 °C) |
| Capteur luminosité | BH1750, TSL2561, VEML7700 | **BH1750** (I2C, 1–65535 lx) |
| Contact de porte | Reed switch, capteur à effet Hall, bouton micro | **Reed switch** (NO, sans consommation au repos) |
| Alimentation extérieure | Batterie LiPo + panneau solaire, pile AA, PoE | **LiPo 10 000 mAh + solaire 6 W** |

Chaque matrice note les candidats sur les critères : coût, consommation, précision, intégration, disponibilité.

---

## A2 — Nomenclature BOM (`Nomenclature.html`)

Coût par type de node, quantités par zone, total site.

| Type de node | Composants principaux | Coût unitaire |
|---|---|---|
| Node intérieur (terrarium) | ESP32 + DS18B20×2 + BH1750 + Reed switch + boîtier | **10,85 €** |
| Node salle | ESP32 + DS18B20×1 + Reed switch | 8,40 € |
| Node extérieur (EXT) | TTGO LoRa32 + DS18B20×2 + BH1750 + Reed switch + LiPo 10 000 mAh | 38,20 € |
| Node porte bâtiment | ESP32 mini + Reed switch + LiPo 2 000 mAh | 7,90 € |

**Total matériel nodes : ~450 €**  
Infrastructure (AP WiFi ×2, gateway RAK7268, RPi 4, switch) : **~218 €**

---

## A3 — Node intérieur (`Compo/`)

Microcontrôleur : **ESP32 DevKit V1** — WiFi 802.11 b/g/n, 38 GPIO, alimentation secteur.

### Câblage GPIO

| GPIO | Fonction | Composant |
|---|---|---|
| 4 | 1-Wire data | DS18B20 ×2 (résistance pull-up 4,7 kΩ vers 3,3 V) |
| 21 | I2C SDA | BH1750 |
| 22 | I2C SCL | BH1750 |
| 2 | Interrupt FALLING | Reed switch (pull-up interne activé) |
| GND | — | Commun |
| 3V3 | Alimentation | BH1750, DS18B20, Reed switch |

### Fichiers

| Fichier | Usage |
|---|---|
| `sketch.ino` | Code Wokwi (BH1750 remplacé par potentiomètre sur GPIO 34) |
| `node-reel.ino` | Code production avec BH1750 I2C réel |
| `diagram.json` | Schéma Wokwi (ESP32 + 2×DS18B20 + potentiomètre + bouton porte) |
| `Node-interieur.html` | Documentation complète GPIO + procédure Wokwi |

> **Note Wokwi** : le BH1750 n'est pas disponible nativement dans Wokwi. Il est remplacé par un potentiomètre sur l'ADC GPIO 34 (`analogRead` mappé 0–65535 lx).

---

## A4 — Node extérieur (`Node-exterieur.html`)

Microcontrôleur : **TTGO LoRa32 V2.1** — LoRaWAN 868 MHz, WiFi, batterie LiPo intégrée.  
Utilisé pour les zones QUA (béton 30 cm × 2) et EXT (65 m, sans alimentation secteur).

### Calcul d'autonomie (EXT, sans panneau solaire)

| Paramètre | Valeur |
|---|---|
| Consommation active (TX LoRa) | 120 mA × 2 s = 0,067 mAh/cycle |
| Deep sleep | 10 µA |
| Fréquence de mesure | 1 cycle / 5 min |
| Consommation totale | **~0,320 mAh/h** |
| Capacité batterie LiPo | 10 000 mAh (profondeur 80 %) = 8 000 mAh utiles |
| **Autonomie calculée** | **~332 jours (11,1 mois)** |
| Marge par rapport à l'objectif 6 mois | **×1,85** |

---

## A5 — Architecture site (`Architecture.html`)

```
                  ┌─────────────────────────────────────────────────────┐
                  │                BÂTIMENT PRINCIPAL                   │
                  │                                                     │
  ┌──────────┐    │  ┌──────────────────────────────────────────────┐   │
  │  ENCLOS  │    │  │  DES (6 nodes)   WiFi ──────────────────┐    │   │
  │ EXTÉRIEU │    │  │  TRO (6 nodes)   WiFi ──────────────────┤    │   │
  │ EXT-01   │    │  │  SOI (3 nodes)   WiFi ──────────────────┤    │   │
  │ EXT-02   │    │  └──────────────────────────────────────────┘   │   │
  │ LoRaWAN  │    │                                                  │   │
  └────┬─────┘    │  ┌───────────────┐                              │   │
       │ 868 MHz  │  │ QUA (4 nodes) │  LoRaWAN (béton 30 cm ×2)   │   │
       │          │  │ LoRaWAN       ├──────────────────────────────┤   │
  ─────┴──────────┼──► RAK7268       │                              │   │
  65 m            │  └───────────────┘                              │   │
                  │                                              ▼   │   │
                  │                                      ┌───────────┴┐  │
                  │                                      │  RPi 4     │  │
                  │  Portes bâtiment (3 nodes WiFi/BLE)  │  Mosquitto │  │
                  │  DOOR-MAIN, DOOR-SAS, DOOR-FEED  ───►│  Front web │  │
                  │                                      └────────────┘  │
                  └─────────────────────────────────────────────────────┘
```

| Zone | Connectivité | Justification |
|---|---|---|
| DES, TRO, SOI | WiFi 802.11 | Distance ≤ 18 m, cloisons placo, AP dans le couloir |
| QUA | LoRaWAN 868 MHz | Bâtiment annexe, murs béton 30 cm × 2 |
| EXT | LoRaWAN 868 MHz | 65 m à l'air libre, sans alimentation secteur |
| Portes bâtiment | WiFi | Alimentées sur batterie, à moins de 20 m du RPi |

**Gateway LoRaWAN** : RAK7268 (Ethernet, portée 2 km en zone urbaine)  
**Serveur** : Raspberry Pi 4 (Mosquitto MQTT + front web)

---

# Partie 2 — Protocoles MQTT

Définition complète du protocole de communication entre les nodes, le broker Mosquitto et les clients (simulateur, serveur d'alertes, front web).

---

## B1 — Arborescence des topics (`Topics.html`)

Racine versionnée : `reptiles/v1/`

```
reptiles/v1/
├── site/
│   └── availability                  ← statut global du simulateur (LWT)
├── nodes/
│   └── {zone}/
│       └── {node-id}/
│           ├── telemetry             ← mesures périodiques (lecture capteurs)
│           ├── events                ← événements (porte, boot)
│           ├── heartbeat             ← battement de cœur du node
│           ├── availability          ← en ligne / hors ligne (retain)
│           ├── cmd                   ← commandes envoyées au node
│           └── ack                   ← accusé de réception des commandes
└── alerts/
    └── {zone}/
        └── {node-id}                 ← alertes levées par le serveur (retain)
```

| Zone | Nodes |
|---|---|
| DES | N-ROOM-DES, N-DES-01 à N-DES-06 |
| TRO | N-ROOM-TRO, N-TRO-01 à N-TRO-06 |
| QUA | N-ROOM-QUA, N-QUA-01 à N-QUA-04 |
| SOI | N-ROOM-SOI, N-SOI-01 à N-SOI-03 |
| EXT | N-EXT-01, N-EXT-02 |
| BAT | N-DOOR-MAIN, N-DOOR-SAS, N-DOOR-FEED |

---

## B2 — Format des messages (`Messages.html`)

Enveloppe JSON versionnée commune à tous les messages :

```json
{
  "v": 1,
  "msgId": "a1b2c3d4e5f6a7b8",
  "node": "N-DES-01",
  "zone": "DES",
  "enclosure": "DES-01",
  "ts": 1700000000000,
  "serverTs": 1700000000120,
  "seq": 42,
  "type": "reading",
  "sensor": "temp_hot",
  "value": 35.5,
  "unit": "C"
}
```

| Champ | Description |
|---|---|
| `v` | Version du protocole (actuellement 1) |
| `msgId` | Identifiant unique du message (8 octets hex) |
| `node` | Identifiant du node émetteur |
| `zone` / `enclosure` | Zone et terrarium (null pour les nodes salle/porte) |
| `ts` | Horodatage device (ms epoch) |
| `serverTs` | Horodatage serveur à la réception (ms epoch) |
| `seq` | Numéro de séquence monotone par node |
| `type` | `reading`, `door`, `heartbeat`, `boot`, `ack`, `alert` |

Types de messages principaux :

| type | topic | champs spécifiques |
|---|---|---|
| `reading` | telemetry | `sensor` (temp_hot/temp_cold/light/temp_ambient), `value`, `unit` |
| `door` | events | `state` (open/closed) |
| `heartbeat` | heartbeat | `uptimeS`, `rssi`, `fw`, `battery` (si batterie) |
| `boot` | events | `reason` (power_on, watchdog, ota…) |
| `ack` | ack | `cmdId`, `action`, `ok`, `detail` |
| `alert` | alerts/{zone}/{node} | `level`, `code`, `message` |

---

## B3 — QoS et retain (`QoS-Retain.html`)

| Topic | QoS | Retain | Justification |
|---|---|---|---|
| telemetry | 0 | false | Flux continu, perte acceptable |
| heartbeat | 0 | false | Flux continu, perte acceptable |
| events (door, boot) | 1 | false | Événement critique, livraison garantie |
| availability | 1 | **true** | Dernier état connu visible à la connexion |
| cmd | 1 | false | Commande unique, pas de rejeu |
| ack | 1 | false | Réponse unique |
| alerts | 1 | **true** | Alerte persistante jusqu'à résolution |

---

## B4 — Last Will Testament (`LastWill.html`)

Le simulateur publie un LWT **site-level** à la connexion :

```
topic   : reptiles/v1/site/availability
payload : {"v":1,"status":"offline","source":"simulator","ts":0}
QoS     : 1
retain  : true
```

À la connexion réussie, il remplace immédiatement par `status: "online"` et publie un message `availability: online` pour chacun des 28 nodes.  
Si la connexion TCP est coupée brutalement, Mosquitto diffuse automatiquement le LWT `offline`.

---

## B5 — ClientId (`ClientId.html`)

Format : `{role}-{fonction}-{6 octets hex aléatoires}`

| Rôle | Exemple |
|---|---|
| Simulateur | `simulator-main-a1b2c3` |
| Serveur d'alertes | `server-alerting-d4e5f6` |
| Front web | `frontend-a7b8c9` |

La partie aléatoire évite les conflits de clientId si plusieurs instances se connectent simultanément. `cleanSession: true` sur tous les clients.

---

## B6 — Commandes et ACK (`Commandes.html`)

Commande envoyée par le front sur `reptiles/v1/nodes/{zone}/{nodeId}/cmd` :

```json
{
  "v": 1,
  "cmdId": "cmd-1a2b3c4d-a1b2",
  "target": "N-DES-01",
  "action": "lamp",
  "value": "off",
  "expiresAt": 1700000030000
}
```

| action | value | effet |
|---|---|---|
| `lamp` | on / off / auto | Mode lampe chauffante |
| `light` | on / off / auto | Mode éclairage UV |
| `setpoint` | 20 – 50 (°C) | Consigne point chaud |
| `safety_cut` | on / off | Coupe d'urgence alimentation terrarium |
| `reboot` | — | Redémarrage du node |
| `identify` | — | Clignotement LED 10 s |

Le node répond sur `.../ack` avec `ok: true/false` et un champ `detail` (`ok`, `bad_value`, `not_supported`…).  
Le champ `expiresAt` permet au node d'ignorer les commandes trop anciennes (TTL 30 s recommandé).

---

## B7 — Horodatage (`Horodatage.html`)

- `ts` : horodatage **device** en ms epoch. Peut être décalé si le node n'a pas encore synchronisé NTP (boot récent → valeur depuis 1970 = uptime depuis le boot).
- `serverTs` : horodatage **serveur** ajouté par le simulateur/adaptateur MQTT à la publication.
- Un message est marqué `late: true` si `serverTs - ts > 120 000 ms` (retard LoRaWAN ou file d'attente).
- Les nodes synchronisent leur horloge via NTP ~2 min après le boot.

---

## B8 — Sécurité (`Securite.html`)

Authentification par mot de passe sur Mosquitto 2.x (PBKDF2-SHA512, format `$7$101$salt$hash`).  
ACL par utilisateur :

| Utilisateur | Droits |
|---|---|
| `simulator` | Write `nodes/#`, Read `nodes/+/+/cmd`, Write `site/availability` |
| `server` | Read `nodes/#`, Write `alerts/#`, Write `nodes/+/+/cmd` |
| `frontend` | Read `nodes/#`, Read `alerts/#`, Read `site/#`, Write `nodes/+/+/cmd` |
| `admin` | Read/Write `#` (accès total) |

Aucun accès anonyme (`allow_anonymous false`). Les mots de passe sont stockés dans `mosquitto/passwd`.
