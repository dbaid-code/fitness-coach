// Header-only image fixtures for API-06: the server reads magic bytes and header dimensions, never pixels.
const u16be = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const app0 = [0xff, 0xe0, ...u16be(16), ...Array.from('JFIF\0', (c) => c.charCodeAt(0)), 1, 1, 0, 0, 1, 0, 1, 0, 0];

/** A JPEG with an SOF0 header of the given size, padded with filler bytes to `bytes`. */
export function jpegFixture(width = 1568, height = 1176, bytes = 4096): Uint8Array {
  const head = [
    0xff,
    0xd8,
    ...app0,
    0xff,
    0xc0,
    ...u16be(17),
    8,
    ...u16be(height),
    ...u16be(width),
    3,
    1,
    0x22,
    0,
    2,
    0x11,
    1,
    3,
    0x11,
    1,
  ];
  const out = new Uint8Array(Math.max(bytes, head.length + 2));
  out.set(head);
  out.fill(0x55, head.length, out.length - 2);
  out.set([0xff, 0xd9], out.length - 2);
  return out;
}

export const pdfFixture = () => new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');

export function scanForm(files: Uint8Array[], fields: Record<string, string> = {}): FormData {
  const form = new FormData();
  files.forEach((f, i) => form.append('photos', new File([f as BlobPart], `photo-${i}.jpg`, { type: 'image/jpeg' })));
  form.append('context', fields.context ?? 'profile_edit');
  form.append('timezone', fields.timezone ?? 'Asia/Kolkata');
  return form;
}
