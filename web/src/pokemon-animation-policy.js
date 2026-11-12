// Shared by the asset packer and runtime: never ship a random pool of dozens
// of actions when the observation view only needs a few readable gestures.
export function pickInteractionClips(clips = []) {
  const eligible = clips.filter(c => /glad|refresh|defaultidle|notice|roar|buffact|speact|wing|attack/i.test(c.name)
    && !/start|end/i.test(c.name));
  const picked = [];
  for (const pattern of [/glad01/, /defaultidle01/, /notice01/, /roar01/, /refresh01/, /attack01/]) {
    const clip = eligible.find(c => pattern.test(c.name) && !/loop/i.test(c.name));
    if (clip && !picked.includes(clip)) picked.push(clip);
    if (picked.length === 4) break;
  }
  for (const clip of eligible) {
    if (picked.length >= 4) break;
    if (!picked.includes(clip)) picked.push(clip);
  }
  return picked;
}

export function pickCardClips(clips = []) {
  const picked = [];
  for (const pattern of [/glad01/, /roar01/, /rangeattack01\.gfbanm/, /attack01/, /notice01/]) {
    const clip = clips.find(c => pattern.test(c.name) && !/loop/i.test(c.name));
    if (clip && !picked.includes(clip)) picked.push(clip);
  }
  return picked.slice(0, 4);
}

export function displayAnimationNames(clips, entry = {}) {
  const idle = clips.find(c => c.name === entry.animation) || clips[0];
  const names = new Set([idle, ...pickInteractionClips(clips), ...pickCardClips(clips)].filter(Boolean).map(c => c.name));
  // Suicune's ribbon repair needs this source track even though it isn't played.
  if (Number(entry.dex || String(entry.id).split('-')[0]) === 245) {
    const donor = clips.find(c => /_08300_loop01_loop/.test(c.name));
    if (!donor) throw new Error('Suicune ribbon donor is missing');
    names.add(donor.name);
  }
  return names;
}
