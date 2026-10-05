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
