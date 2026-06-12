# Architecture

Luồng chính:

Robot Chami / ESP32
↓
Firebase Firestore
↓
TsunagariCare Web Dashboard
↓
Family / Caregiver

Notes:

- The Web Dashboard subscribes to Firestore collections in realtime (onSnapshot): `robots`, `devices`, `alerts`, `care_logs`.
- Robot and modules write status/alerts to Firestore; the dashboard updates immediately via realtime listeners.

Smart home command flow:

Web Dashboard
↓
commands collection
↓
ESP32 Smart Home Module
↓
Light / Fan / Air Conditioner

Alert flow:

Fall Detection / Robot / Health Module
↓
alerts collection
↓
Web Dashboard
↓
Family / Caregiver
