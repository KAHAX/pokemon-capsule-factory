import { gunzipSync } from 'fflate';

// Keep one worker alive across models: decoding must not pause input/animation.
self.onmessage = ({ data: { id, bytes } }) => {
  try {
    const output = gunzipSync(bytes);
    self.postMessage({ id, output }, [output.buffer]);
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
