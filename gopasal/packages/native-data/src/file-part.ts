import { Platform } from "react-native";

/**
 * Put a picked file into a multipart body, on every platform the apps run on.
 *
 * React Native's `FormData` takes `{ uri, name, type }` for a file part and
 * streams the bytes off the local URI itself. The browser's does not: handed
 * the same object it calls `toString()` on it, sends the text
 * "[object Object]" as an ordinary field, and the API — rightly — refuses a
 * body with a `file` property it never asked for. So on web the URI (a `blob:`
 * or `data:` URL from the image picker) is read into a real `Blob` first.
 *
 * Android and iOS take the first branch and are unchanged. Web matters because
 * it is how the apps are previewed and how the end-to-end harnesses drive them:
 * an upload that only works on a handset is an upload nothing tests.
 */
export type FilePart = { uri: string; name: string; type: string };

export async function appendFilePart(form: FormData, field: string, part: FilePart): Promise<void> {
  if (Platform.OS !== "web") {
    // The DOM typings only know `Blob`; RN's polyfill documents this shape.
    form.append(field, part as unknown as Blob);
    return;
  }
  const bytes = await (await fetch(part.uri)).blob();
  form.append(field, bytes.type === part.type ? bytes : new Blob([bytes], { type: part.type }), part.name);
}
