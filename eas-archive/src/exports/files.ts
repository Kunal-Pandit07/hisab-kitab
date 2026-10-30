import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';

async function share(uri: string, mimeType: string, title: string) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(uri, { mimeType, dialogTitle: title });
}
/** Writes to the app cache, then opens the system share sheet so the user chooses where it is saved. */
export async function shareTextFile(filename: string, text: string, mime: string, title: string) {
  const f = new File(Paths.cache, filename);
  if (f.exists) f.delete();
  f.create(); f.write(text);
  await share(f.uri, mime, title);
}
export async function sharePdf(html: string, title: string) {
  const { uri } = await Print.printToFileAsync({ html });
  await share(uri, 'application/pdf', title);
}
export async function readTextFile(uri: string): Promise<string> { return new File(uri).text(); }
