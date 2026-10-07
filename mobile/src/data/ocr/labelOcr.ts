import {Platform} from 'react-native';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import {parseLabel, type LabelFields} from '@/domain/labelParser';

function toFileUri(path: string): string {
  if (!path) return path;
  if (path.startsWith('file://') || path.startsWith('content://')) return path;
  if (Platform.OS === 'android') return `file://${path}`;
  return path;
}

/** OCR on-device (ML Kit) + heurística de etiqueta de gôndola. */
export async function recognizeLabelFromPhoto(
  path: string,
): Promise<{fields: LabelFields | null; rawText: string}> {
  const uri = toFileUri(path);
  const result = await TextRecognition.recognize(uri);
  const rawText = (result?.text ?? '').trim();
  if (!rawText) return {fields: null, rawText: ''};
  return {fields: parseLabel(rawText), rawText};
}
