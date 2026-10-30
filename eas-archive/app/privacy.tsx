import React from 'react';
import { Body, Card, H1, Label, Screen } from '../src/components/ui';

export default function Privacy() {
  return (
    <Screen>
      <H1>Privacy</H1>
      <Card><Body>Hisab Kitab keeps your financial records only on this phone. There is no account, no server, no analytics and no ads. The app works fully offline.</Body></Card>
      <Label>Permissions</Label>
      <Body muted>Notifications: only if you turn on reminders. Fingerprint/face: only if you enable biometric unlock. Files: only through the system picker or share sheet when you back up, restore or export. The app never asks for contacts, location, camera or microphone.</Body>
      <Label>Your data</Label>
      <Body muted>Records are stored in the app's private storage and are not encrypted by the app, so keep your phone's screen lock on. The optional PIN locks the app itself. Backups are encrypted with your password. If you lose your phone or forget the backup password, your data cannot be recovered, so make a backup now and then.</Body>
      <Label>Exports</Label>
      <Body muted>CSV and PDF exports are plain files. Once you share one, it leaves this app and is under your control.</Body>
      <Label>Notifications</Label>
      <Body muted>Reminders are scheduled on your phone and never include names or amounts.</Body>
      <Body muted style={{ marginTop: 24, textAlign: 'center' }}>Powered by KP Groups</Body>
    </Screen>
  );
}
