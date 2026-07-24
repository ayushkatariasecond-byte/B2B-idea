// Isolated in its own test file (not api.test.ts) specifically so jest.mock('fluent-ffmpeg')
// here can't leak into the real-ffmpeg transcode test in the main suite — Jest scopes
// module mocks per test file, so this is safe as long as the two never share a file.

interface FakeChain {
  videoCodec: () => FakeChain;
  audioCodec: () => FakeChain;
  outputOptions: () => FakeChain;
  on: (event: 'end' | 'error', cb: (err?: Error) => void) => FakeChain;
  save: () => FakeChain;
}

let callCount = 0;
let failuresBeforeSuccess = 0; // set per-test; 0 = always succeeds, >=3 = never succeeds

jest.mock('fluent-ffmpeg', () => {
  const fn = jest.fn(() => {
    const handlers: Partial<Record<'end' | 'error', (err?: Error) => void>> = {};
    const chain: FakeChain = {
      videoCodec: () => chain,
      audioCodec: () => chain,
      outputOptions: () => chain,
      on: (event, cb) => {
        handlers[event] = cb;
        return chain;
      },
      save: () => {
        callCount += 1;
        const thisAttempt = callCount;
        setImmediate(() => {
          if (thisAttempt <= failuresBeforeSuccess) {
            handlers.error?.(new Error('mock ffmpeg failure'));
          } else {
            handlers.end?.();
          }
        });
        return chain;
      },
    };
    return chain;
  });
  (fn as unknown as { setFfmpegPath: () => void }).setFfmpegPath = jest.fn();
  return fn;
});

jest.mock('@ffmpeg-installer/ffmpeg', () => ({ path: '/mock/ffmpeg' }));

import { transcodeVideo } from './videoTranscode';

describe('transcodeVideo retry logic', () => {
  beforeEach(() => {
    callCount = 0;
    failuresBeforeSuccess = 0;
  });

  it('succeeds on the first attempt when there is no failure', async () => {
    failuresBeforeSuccess = 0;
    const result = await transcodeVideo('clip.mp4');
    expect(result).toBe('clip-web.mp4');
    expect(callCount).toBe(1);
  });

  it('retries and succeeds on the 3rd attempt after two transient failures', async () => {
    failuresBeforeSuccess = 2;
    const result = await transcodeVideo('clip.mp4');
    expect(result).toBe('clip-web.mp4');
    expect(callCount).toBe(3);
  });

  it('gives up after exactly 3 attempts and rejects when every attempt fails', async () => {
    failuresBeforeSuccess = 3;
    await expect(transcodeVideo('clip.mp4')).rejects.toThrow('mock ffmpeg failure');
    expect(callCount).toBe(3);
  });
});
