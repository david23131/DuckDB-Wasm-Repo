import { it, expect } from 'vitest';
import { copyPrebuilt, PREBUILT_NAME } from '../src/prebuilt-msmarco.js';
it('streams the selected database to the dedicated OPFS file', async () => {
  const chunks = [];
  const file = new Blob(['database bytes']);
  const root = { async getFileHandle(name, options) {
    expect(name).toBe(PREBUILT_NAME);
    expect(options).toEqual({ create: true });
    return { async createWritable() { return new WritableStream({ write(chunk) { chunks.push(chunk); } }); } };
  } };
  await copyPrebuilt(file, root);
  expect(await new Blob(chunks).text()).toBe('database bytes');
});
it('propagates a quota/write failure rather than reporting success', async () => {
  const root = { async getFileHandle() { return { async createWritable() {
    return new WritableStream({ write() { throw new Error('quota exceeded'); } });
  } }; } };
  await expect(copyPrebuilt(new Blob(['data']), root)).rejects.toThrow('quota exceeded');
});
